import { describe, expect, it } from "vitest";
import { describeReason, resolveRunModel, summarizeRun } from "../src/executor.js";
import type { Task } from "../src/types.js";

/**
 * Real-world shape captured from a web-profile run: the agent loop starts its
 * first turn BEFORE the run prompt is queued, so `turn/start` sits before
 * `firstSeq` (the seq of the followup user message). The summary must still
 * capture the assistant text and the final turn/end reason.
 */
const REAL_SHAPE = [
	{ type: "turn/start", seq: 4, data: { turn: 1 } },
	{ type: "step/start", seq: 6, data: { turn: 1, step: 1 } },
	{ type: "user/message", seq: 7, data: { content: [{ type: "text", text: "the prompt" }] } },
	{ type: "user/message", seq: 8, data: { content: [{ type: "text", text: "injected context" }] } },
	{
		type: "assistant/message",
		seq: 51,
		data: {
			message: {
				content: [
					{ type: "reasoning", text: "hmm" },
					{ type: "text", text: "OK" },
				],
			},
		},
	},
	{ type: "step/end", seq: 52, data: { turn: 1, step: 1 } },
	// turn/end data nests the reason: { turn, reason: { kind, ... } }
	{ type: "turn/end", seq: 53, data: { turn: 1, reason: { kind: "completed" } } },
];

describe("summarizeRun", () => {
	it("captures output and reason when turn/start precedes firstSeq", () => {
		const firstSeq = 7; // seq of the followup user message
		const summary = summarizeRun(REAL_SHAPE, firstSeq);
		expect(summary.text).toBe("OK");
		expect(summary.reason?.kind).toBe("completed");
	});

	it("keeps the last assistant text across multiple messages", () => {
		const events = [
			{ type: "assistant/message", seq: 10, data: { message: { content: [{ type: "text", text: "first" }] } } },
			{ type: "assistant/message", seq: 20, data: { message: { content: [{ type: "text", text: "second" }] } } },
		];
		expect(summarizeRun(events, 0).text).toBe("second");
	});

	it("returns no reason when no turn ended in the window", () => {
		expect(
			summarizeRun([{ type: "assistant/message", seq: 10, data: { message: { content: [] } } }], 0).reason,
		).toBeUndefined();
	});
});

describe("describeReason", () => {
	it("returns undefined for a completed turn", () => {
		expect(describeReason({ kind: "completed" })).toBeUndefined();
	});

	it("renders an error reason with code and message", () => {
		expect(describeReason({ kind: "error", error: { code: "AUTH", message: "API key is invalid" } })).toBe(
			"AUTH: API key is invalid",
		);
	});

	it("renders a blocked turn explicitly", () => {
		expect(describeReason({ kind: "blocked" })).toContain("blocked");
	});

	it("renders an unknown reason as JSON", () => {
		expect(describeReason({ kind: "plugin-weird" })).toContain("plugin-weird");
	});

	it("renders missing reason as no-outcome", () => {
		expect(describeReason(undefined)).toContain("no turn outcome");
	});
});

describe("resolveRunModel", () => {
	function makeTask(overrides: Partial<Task> = {}): Task {
		return {
			id: "task-1" as Task["id"],
			projectPath: "/projects/demo",
			name: "demo",
			prompt: "do the thing",
			kind: "at",
			scheduledAt: "2026-08-14T09:00:00.000Z",
			enabled: true,
			state: "active",
			createdAt: "2026-08-13T09:00:00.000Z",
			updatedAt: "2026-08-13T09:00:00.000Z",
			...overrides,
		};
	}

	function makeCtx(services: Record<string, unknown>) {
		return { get: (key: string) => services[key] } as unknown as import("@deepseek-ai/cordis").Context;
	}

	it("prefers the task's explicit override", () => {
		const ctx = makeCtx({
			agentDefaultModel: { currentSelection: () => ({ provider: "default-provider", model: "default-model" }) },
		});
		expect(
			resolveRunModel(ctx, makeTask({ model: { provider: "deepseek-official", model: "deepseek-chat" } })),
		).toEqual({ provider: "deepseek-official", model: "deepseek-chat" });
	});

	it("falls back to the deployment default selection", () => {
		const ctx = makeCtx({
			agentDefaultModel: { currentSelection: () => ({ provider: "deepseek-official", model: "deepseek-chat" }) },
		});
		expect(resolveRunModel(ctx, makeTask())).toEqual({ provider: "deepseek-official", model: "deepseek-chat" });
	});

	it("returns undefined when no default model service is mounted", () => {
		expect(resolveRunModel(makeCtx({}), makeTask())).toBeUndefined();
	});
});
