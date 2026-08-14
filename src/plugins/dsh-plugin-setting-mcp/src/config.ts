/**
 * Config conversion between the editable `McpServerInput` shape and the raw
 * loader config accepted by `@deepseek-ai/dsh-mcp-client`. Pure and
 * dependency-free so it is unit-testable.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

import type { McpServerInput } from "./schemas.js";

/** Build a clean mcp-client config for one editable server (transport-selected fields only). */
export function toMcpConfig(server: McpServerInput): Record<string, unknown> {
	const base: Record<string, unknown> = { serverName: server.serverName };
	if (server.toolCallTimeoutMs !== undefined) base.toolCallTimeoutMs = server.toolCallTimeoutMs;
	if (server.failOnStartupError !== undefined) base.failOnStartupError = server.failOnStartupError;

	if (server.transport === "stdio") {
		return {
			...base,
			transport: "stdio",
			command: server.command,
			args: server.args ?? [],
			env: server.env ?? {},
			cwd: server.cwd ?? "",
		};
	}

	return {
		...base,
		transport: "streamable-http",
		url: server.url,
		headers: server.headers ?? {},
	};
}
