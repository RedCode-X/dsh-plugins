/**
 * The `mcp` typert host service. Registered as `ctx.mcp` by the plugin body;
 * the gateway dispatches `mcp/*` endpoints here. `list` projects the current
 * loader tree, and `save` reconciles it — each `loader.create` / `update` /
 * `remove` restarts the affected `dsh-mcp-client` entry immediately and
 * persists to the backing config file, which is the hot-reload the settings
 * panel's Save button triggers.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Entry } from "@deepseek-ai/cordis-plugin-loader";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { toMcpConfig } from "./config.js";
import { planReconcile } from "./plan.js";
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
		id: entry.id,
		serverName: typeof config.serverName === "string" ? config.serverName : entry.id,
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

	/** List the currently managed MCP servers. */
	@Remote
	list(): McpServerView[] {
		return this.managedEntries().map(toView);
	}

	/** Reconcile the loader tree to `servers` and return the fresh list. */
	@Remote
	async save(input: SaveInput): Promise<McpServerView[]> {
		const current = this.managedEntries();
		const plan = planReconcile(
			current.map((entry) => ({
				id: entry.id,
				serverName: String((entry.options.config as Record<string, unknown> | undefined)?.serverName ?? entry.id),
			})),
			input.servers,
		);

		const byId = new Map(current.map((entry) => [entry.id, entry]));

		// Remove first so a `serverName` freed here can be reused by a later create.
		for (const id of plan.remove) {
			await this.ctx.loader.remove(id);
		}
		for (const { id, server } of plan.update) {
			const existing = byId.get(id)?.options.config as Record<string, unknown> | undefined;
			// Preserve an existing reconnect policy (not surfaced by v1's editor).
			const config = toMcpConfig(server);
			if (existing?.reconnect !== undefined) config.reconnect = existing.reconnect;
			await this.ctx.loader.update(id, { config, disabled: !server.enabled });
		}
		for (const server of plan.create) {
			await this.ctx.loader.create({
				name: MCP_CLIENT_MODULE,
				config: toMcpConfig(server),
				disabled: !server.enabled,
			});
		}

		return this.list();
	}
}
