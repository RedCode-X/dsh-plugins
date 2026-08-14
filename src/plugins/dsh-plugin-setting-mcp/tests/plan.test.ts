import { describe, expect, it } from "vitest";
import { McpInputError } from "../src/errors.js";
import { planReconcile } from "../src/plan.js";
import type { McpServerInput } from "../src/schemas.js";

function stdio(overrides: Partial<McpServerInput> & { id: string; serverName: string }): McpServerInput {
	return {
		transport: "stdio",
		command: "npx",
		enabled: true,
		...overrides,
	} as McpServerInput;
}

function http(overrides: Partial<McpServerInput> & { id: string; serverName: string }): McpServerInput {
	return {
		transport: "streamable-http",
		url: "http://localhost:3000/mcp",
		enabled: true,
		...overrides,
	} as McpServerInput;
}

describe("planReconcile", () => {
	it("creates every desired server when nothing is currently managed", () => {
		const plan = planReconcile([], [stdio({ id: "a", serverName: "alpha" }), http({ id: "b", serverName: "beta" })]);
		expect(plan.remove).toEqual([]);
		expect(plan.update).toEqual([]);
		expect(plan.create.map((server) => server.serverName)).toEqual(["alpha", "beta"]);
	});

	it("updates a matching id in place", () => {
		const plan = planReconcile([{ id: "a", serverName: "alpha" }], [stdio({ id: "a", serverName: "alpha-2" })]);
		expect(plan.remove).toEqual([]);
		expect(plan.create).toEqual([]);
		expect(plan.update).toHaveLength(1);
		expect(plan.update[0]).toMatchObject({ id: "a", server: { serverName: "alpha-2" } });
	});

	it("removes an id absent from the desired set", () => {
		const plan = planReconcile(
			[
				{ id: "a", serverName: "alpha" },
				{ id: "b", serverName: "beta" },
			],
			[stdio({ id: "a", serverName: "alpha" })],
		);
		expect(plan.remove).toEqual(["b"]);
		expect(plan.update).toHaveLength(1);
		expect(plan.create).toEqual([]);
	});

	it("rejects duplicate serverNames", () => {
		expect(() =>
			planReconcile([], [stdio({ id: "a", serverName: "dup" }), http({ id: "b", serverName: "dup" })]),
		).toThrow(McpInputError);
	});

	it("combines remove, update and create in one plan", () => {
		const plan = planReconcile(
			[
				{ id: "keep", serverName: "keep" },
				{ id: "gone", serverName: "gone" },
			],
			[stdio({ id: "keep", serverName: "keep-renamed" }), http({ id: "new", serverName: "fresh" })],
		);
		expect(plan.remove).toEqual(["gone"]);
		expect(plan.update.map((op) => op.id)).toEqual(["keep"]);
		expect(plan.create.map((server) => server.serverName)).toEqual(["fresh"]);
	});
});
