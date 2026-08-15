/**
 * The `mcp` typert host service. Registered as `ctx.mcp` by the plugin body;
 * the gateway dispatches `mcp/*` endpoints here. `list` projects the current
 * loader tree, and `save` reconciles it — each `loader.create` / `update` /
 * `remove` restarts the affected `dsh-mcp-client` entry immediately, then the
 * reconciled set is persisted to the profile's `cordis.patch.yml`, the durable
 * patch layer that survives restart.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Entry } from "@deepseek-ai/cordis-plugin-loader";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { toMcpEntryOptions } from "./config.js";
import { persistMcpPatch } from "./persist.js";
import { planReconcile } from "./plan.js";
import { stableServerId } from "./patch.js";
import { MCP_CLIENT_MODULE, type McpServerView, type SaveInput } from "./schemas.js";

/** Numeric Cordis `FiberState` → human phase string (mirrors dsh-host-plugin-inventory). */
const FIBER_PHASE: Record<number, string | null> = {
	0: "pending",
	1: "loading",
	2: "active",
	3: "failed",
	4: null,
	5: "unloading",
};

/** True for a plain object (used to narrow `unknown` config values). */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip every `undefined` value recursively. The typert gateway's strict
 * result codec re-checks JSON-safety after schema parsing, and an explicit
 * `undefined` property (even on an optional field) is not JSON-safe — so the
 * view must never carry one.
 */
function jsonSafe<T>(value: T): T {
	if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry)) as T;
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			if (entry !== undefined) out[key] = jsonSafe(entry);
		}
		return out as T;
	}
	return value;
}

/** Project one managed loader entry into its JSON-safe view. */
function toView(entry: Entry): McpServerView {
	const config = (entry.options.config ?? {}) as Record<string, unknown>;
	const phase = entry.fiber === undefined ? null : (FIBER_PHASE[entry.fiber.state] ?? null);
	return jsonSafe({
		// The *local* config id (e.g. `mcp-github`), not the runtime path
		// (`include:mcp-github`): this is the id that lives in `cordis.patch.yml`.
		id: entry.options.id,
		serverName: typeof config.serverName === "string" ? config.serverName : entry.options.id,
		transport: config.transport === "streamable-http" ? "streamable-http" : "stdio",
		command: typeof config.command === "string" ? config.command : undefined,
		args: Array.isArray(config.args) ? (config.args as string[]) : undefined,
		env: isRecord(config.env) ? (config.env as Record<string, string>) : undefined,
		cwd: typeof config.cwd === "string" ? config.cwd : undefined,
		url: typeof config.url === "string" ? config.url : undefined,
		headers: isRecord(config.headers) ? (config.headers as Record<string, string>) : undefined,
		toolCallTimeoutMs: typeof config.toolCallTimeoutMs === "number" ? config.toolCallTimeoutMs : undefined,
		failOnStartupError: typeof config.failOnStartupError === "boolean" ? config.failOnStartupError : undefined,
		enabled: !entry.disabled,
		phase,
	});
}

/** Host service backing the `mcp` typert namespace. */
export class McpRuntime extends TypertRemoteService {
	constructor(ctx: Context) {
		super(ctx, "mcp");
	}

	/** All non-group loader entries that load the mcp-client bridge, in Loader order. */
	private managedEntries(): Entry[] {
		const entries: Entry[] = [];
		for (const entry of this.ctx.loader.entries()) {
			if (entry.options.group) continue;
			if (entry.options.name !== MCP_CLIENT_MODULE) continue;
			entries.push(entry);
		}
		return entries;
	}

	/**
	 * The root `cordis:include` entry whose subtree holds the profile's loader
	 * rows and whose `config.path` locates the patch layer beside `cordis.yml`.
	 */
	private rootInclude(): Entry {
		for (const entry of this.ctx.loader.entries()) {
			if (entry.options.name === "cordis:include" && entry.subtree !== undefined) return entry;
		}
		throw new Error("mcp: the profile config include is not mounted");
	}

	/** List the currently managed MCP servers. */
	@Remote
	list(): McpServerView[] {
		return this.managedEntries().map(toView);
	}

	/** Reconcile the loader tree to `servers`, persist to the patch layer, and return the fresh list. */
	@Remote
	async save(input: SaveInput): Promise<McpServerView[]> {
		const current = this.managedEntries();
		const byLocalId = new Map(current.map((entry) => [entry.options.id, entry]));
		const tree = this.rootInclude().subtree;
		if (tree === undefined) throw new Error("mcp: the profile config tree is not mounted");

		// Assign stable local ids to new servers; existing entries keep theirs.
		const taken = new Set(current.map((entry) => entry.options.id));
		const desired = input.servers.map((server) => {
			if (taken.has(server.id)) return server;
			const id = stableServerId(server.serverName, taken);
			taken.add(id);
			return { ...server, id };
		});

		const plan = planReconcile(
			current.map((entry) => ({
				id: entry.options.id,
				serverName: String((entry.options.config as Record<string, unknown> | undefined)?.serverName ?? entry.options.id),
			})),
			desired,
		);

		// Remove first so a `serverName` freed here can be reused by a later create.
		for (const id of plan.remove) {
			await tree.remove(id);
		}
		for (const { id, server } of plan.update) {
			const existing = byLocalId.get(id)?.options.config as Record<string, unknown> | undefined;
			const options = toMcpEntryOptions(server, existing);
			await tree.update(id, { config: options.config, disabled: options.disabled ?? false });
		}
		for (const server of plan.create) {
			// `toMcpEntryOptions` already carries the stable local id; pass the
			// whole row so the loader stores it under that id (not a random one).
			await tree.create(toMcpEntryOptions(server));
		}

		// Persist the reconciled set to the profile's patch layer. This is the
		// durable write: the loader's own write-back targets `cordis.yml`, which
		// the launcher resets to `[]` on every boot, so only this survives restart.
		const rows = desired.map((server) => toMcpEntryOptions(server, byLocalId.get(server.id)?.options.config));
		await persistMcpPatch(this.rootInclude(), rows);

		return this.list();
	}
}
