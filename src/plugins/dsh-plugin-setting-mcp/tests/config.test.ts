import { describe, expect, it } from "vitest";
import { toMcpConfig } from "../src/config.js";
import type { McpServerInput } from "../src/schemas.js";

describe("toMcpConfig", () => {
	it("builds a stdio config with defaults for omitted optional fields", () => {
		const config = toMcpConfig({
			id: "a",
			serverName: "github",
			transport: "stdio",
			command: "npx",
			enabled: true,
		} as McpServerInput);
		expect(config).toEqual({
			serverName: "github",
			transport: "stdio",
			command: "npx",
			args: [],
			env: {},
			cwd: "",
		});
		expect("toolCallTimeoutMs" in config).toBe(false);
		expect("failOnStartupError" in config).toBe(false);
	});

	it("keeps explicit stdio optional fields", () => {
		const config = toMcpConfig({
			id: "a",
			serverName: "github",
			transport: "stdio",
			command: "node",
			args: ["server.js"],
			env: { GITHUB_TOKEN: "t" },
			cwd: "/tmp",
			toolCallTimeoutMs: 120000,
			failOnStartupError: true,
			enabled: true,
		} as McpServerInput);
		expect(config).toEqual({
			serverName: "github",
			toolCallTimeoutMs: 120000,
			failOnStartupError: true,
			transport: "stdio",
			command: "node",
			args: ["server.js"],
			env: { GITHUB_TOKEN: "t" },
			cwd: "/tmp",
		});
	});

	it("builds a streamable-http config", () => {
		const config = toMcpConfig({
			id: "b",
			serverName: "web",
			transport: "streamable-http",
			url: "http://localhost:3000/mcp",
			headers: { Authorization: "Bearer x" },
			enabled: true,
		} as McpServerInput);
		expect(config).toEqual({
			serverName: "web",
			transport: "streamable-http",
			url: "http://localhost:3000/mcp",
			headers: { Authorization: "Bearer x" },
		});
	});
});
