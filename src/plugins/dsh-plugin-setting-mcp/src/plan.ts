/**
 * Pure reconcile planning: given the currently managed MCP loader entries and
 * the desired server set, compute the create / update / remove operations that
 * bring the loader tree in line. Pure and dependency-free so it is trivially
 * unit-testable; the runtime applies the plan through `ctx.loader`.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

import { McpInputError } from "./errors.js";
import type { McpServerInput } from "./schemas.js";

/** Minimal identity of one currently managed loader entry. */
export interface McpEntryIdentity {
	/** Stable loader entry id. */
	id: string;
	/** The entry's current `serverName` (used for duplicate-name diagnostics). */
	serverName: string;
}

/** One loader update: the target entry id plus its replacement server config. */
export interface McpUpdateOp {
	id: string;
	server: McpServerInput;
}

/** The ordered set of loader operations that realize `desired`. */
export interface ReconcilePlan {
	/** Entries to remove first (frees `serverName`s before updates/creates run). */
	remove: string[];
	/** Existing entries to update in place. */
	update: McpUpdateOp[];
	/** New entries to create. */
	create: McpServerInput[];
}

/**
 * Compute the reconcile plan. `desired` must not contain duplicate
 * `serverName`s; `id`s are matched against `current` to decide update vs
 * create, and any current id absent from `desired` is removed.
 */
export function planReconcile(current: McpEntryIdentity[], desired: McpServerInput[]): ReconcilePlan {
	const seen = new Set<string>();
	for (const server of desired) {
		if (seen.has(server.serverName)) {
			throw new McpInputError("duplicate_name", `serverName "${server.serverName}" appears more than once.`);
		}
		seen.add(server.serverName);
	}

	const currentIds = new Set(current.map((entry) => entry.id));
	const desiredIds = new Set(desired.map((server) => server.id));

	return {
		remove: current.filter((entry) => !desiredIds.has(entry.id)).map((entry) => entry.id),
		update: desired.filter((server) => currentIds.has(server.id)).map((server) => ({ id: server.id, server })),
		create: desired.filter((server) => !currentIds.has(server.id)),
	};
}
