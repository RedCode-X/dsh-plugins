import { describe, expect, it } from "vitest";
import { toMcpEntryOptions } from "../src/config.js";
import { stableServerId, syncMcpPatchEntries } from "../src/patch.js";
import type { McpServerInput } from "../src/schemas.js";
import { MCP_CLIENT_MODULE } from "../src/schemas.js";

describe("syncMcpPatchEntries", () => {
	it("appends a fresh insert block when the patch list is empty", () => {
		const rows = [
			{ id: "mcp-github", name: MCP_CLIENT_MODULE, config: { serverName: "github" } },
		];
		expect(syncMcpPatchEntries([], rows)).toEqual([{ insert: rows }]);
	});

	it("replaces existing MCP rows while keeping other patches verbatim", () => {
		const other = { id: "agent-presets", config: { roots: [] } };
		const mcpRow = { id: "mcp-old", name: MCP_CLIENT_MODULE, config: { serverName: "old" } };
		const plainRow = { id: "other", name: "some-plugin" };
		const entries = [
			other,
			{ insert: [mcpRow, plainRow] },
		];
		const next = [{ id: "mcp-new", name: MCP_CLIENT_MODULE, config: { serverName: "new" } }];
		expect(syncMcpPatchEntries(entries, next)).toEqual([
			other,
			{ insert: [plainRow] },
			{ insert: next },
		]);
	});

	it("drops an insert block that held only MCP rows", () => {
		const mcpRow = { id: "mcp-old", name: MCP_CLIENT_MODULE, config: {} };
		expect(syncMcpPatchEntries([{ insert: [mcpRow] }], [])).toEqual([]);
	});

	it("does not mutate its input", () => {
		const entries = [{ insert: [{ id: "mcp-old", name: MCP_CLIENT_MODULE, config: {} }] }];
		syncMcpPatchEntries(entries, []);
		expect(entries[0]?.insert).toHaveLength(1);
	});
});

describe("stableServerId", () => {
	it("uses the mcp-<serverName> convention", () => {
		expect(stableServerId("github", new Set())).toBe("mcp-github");
	});

	it("suffixes when the base id is taken", () => {
		expect(stableServerId("github", new Set(["mcp-github"]))).toBe("mcp-github-2");
		expect(stableServerId("github", new Set(["mcp-github", "mcp-github-2"]))).toBe("mcp-github-3");
	});
});

describe("toMcpEntryOptions", () => {
	const stdio: McpServerInput = {
		id: "mcp-github",
		serverName: "github",
		transport: "stdio",
		command: "npx",
		enabled: true,
	};

	it("emits a loader row with a stable id and module name", () => {
		expect(toMcpEntryOptions(stdio)).toMatchObject({
			id: "mcp-github",
			name: MCP_CLIENT_MODULE,
			config: { serverName: "github", transport: "stdio", command: "npx" },
		});
	});

	it("marks a disabled server with disabled: true", () => {
		const options = toMcpEntryOptions({ ...stdio, enabled: false });
		expect(options.disabled).toBe(true);
	});

	it("preserves an existing reconnect block", () => {
		const options = toMcpEntryOptions(stdio, { reconnect: { enabled: true } });
		expect(options.config.reconnect).toEqual({ enabled: true });
	});

	it("does not add reconnect when none exists", () => {
		expect("reconnect" in toMcpEntryOptions(stdio).config).toBe(false);
	});
});
