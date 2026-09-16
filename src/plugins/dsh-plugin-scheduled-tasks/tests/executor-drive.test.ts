/**
 * Drive-path tests for {@link TaskExecutor}.
 *
 * DSH 0.1.5 removed the synchronous `Session.events` log read (the
 * 2026-09-09 deprecate-synchronous-session-event-reads decision), so the
 * executor collects a run's events off the `session/event` firehose instead.
 * The pure `summarizeRun` unit tests do not exercise that wiring; these tests
 * drive the real `TaskExecutor.run` against a fake registry/store and assert
 * the subscription collects the run session's events, ignores other sessions,
 * and is disposed when the run settles.
 */

import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import { TaskExecutor } from "../src/executor.js";
import type { TasksStore } from "../src/store.js";
import type { RunRecord, RunStatus, Task } from "../src/types.js";

/** Publish one `session/event` notice to every active subscription. */
type Emit = (sessionId: string, event: { type: string; seq: number; data: unknown }) => void;

interface Harness {
	executor: TaskExecutor;
	/** True once every `ctx.on` subscription registered during the run was disposed. */
	allDisposed(): boolean;
}

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-drive" as Task["id"],
		projectPath: "/projects/demo",
		name: "drive test",
		prompt: "do the thing",
		kind: "at",
		scheduledAt: "2026-08-14T09:00:00.000Z",
		enabled: true,
		state: "active",
		createdAt: "2026-08-13T09:00:00.000Z",
		updatedAt: "2026-08-13T09:00:00.000Z",
		model: { provider: "deepseek-official", model: "deepseek-chat" },
		...overrides,
	};
}

/**
 * Build an executor over fakes. `script` replaces the default agent turn; it
 * receives the emitter and the session id the executor minted for the run.
 */
function makeHarness(script?: (emit: Emit, realSessionId: string) => void): Harness {
	const handlers = new Set<(session: unknown, event: unknown) => void>();
	const subscriptions: { active: boolean }[] = [];
	let createdSessionId: string | undefined;

	// The agent's session object, read by the executor for `id` and `seq`.
	const session = {
		get id(): string | undefined {
			return createdSessionId;
		},
		seq: 0,
	};

	const emit: Emit = (sessionId, event) => {
		for (const handler of [...handlers]) handler({ id: sessionId }, event);
	};

	const agent = {
		session,
		whenIdle: (): Promise<void> => Promise.resolve(),
		followup: (): void => {
			const realSessionId = createdSessionId;
			if (realSessionId === undefined) throw new Error("agent created without a session id");
			if (script !== undefined) {
				script(emit, realSessionId);
				return;
			}
			emit(realSessionId, {
				type: "assistant/message",
				seq: 1,
				data: { message: { content: [{ type: "text", text: "run output" }] } },
			});
			emit(realSessionId, { type: "turn/end", seq: 2, data: { turn: 1, reason: { kind: "completed" } } });
		},
	};

	const agents = {
		create: async (input: { sessionId: string }) => {
			createdSessionId = input.sessionId;
			return { agent };
		},
	};

	const ctx = {
		get: (key: string): unknown => (key === "agents" ? agents : undefined),
		on: (_name: string, handler: (session: unknown, event: unknown) => void): (() => void) => {
			const subscription = { active: true };
			subscriptions.push(subscription);
			handlers.add(handler);
			return () => {
				subscription.active = false;
				handlers.delete(handler);
			};
		},
		logger: { warn: (): void => {} },
	} as unknown as Context;

	const store = {
		beginRun: async (record: Record<string, unknown>): Promise<RunRecord> =>
			({
				id: "run-drive",
				startedAt: "2026-08-14T09:00:00.000Z",
				status: "running",
				...record,
			}) as unknown as RunRecord,
		finishRun: async (
			run: RunRecord,
			_taskId: string,
			outcome: { status: RunStatus; output?: string; error?: string; sessionId?: string },
		): Promise<RunRecord> => ({ ...run, ...outcome }) as RunRecord,
	} as unknown as TasksStore;

	const executor = new TaskExecutor(ctx, store, { maxConcurrentRuns: 1, runTimeoutMs: 60_000 });
	return { executor, allDisposed: () => subscriptions.every((subscription) => !subscription.active) };
}

describe("TaskExecutor drive (session/event subscription)", () => {
	it("collects the run session's events, settles a completed run, and releases the subscription", async () => {
		const harness = makeHarness();
		const result = await harness.executor.run(makeTask(), { triggeredBy: "manual", overdue: false });

		expect(result.status).toBe("completed");
		expect(result.output).toBe("run output");
		expect(harness.allDisposed()).toBe(true);
	});

	it("ignores session/event notices that belong to another session", async () => {
		// A foreign session's message with a LATER seq would win the summary if
		// the run-session filter were missing.
		const harness = makeHarness((emit, realSessionId) => {
			emit(realSessionId, {
				type: "assistant/message",
				seq: 1,
				data: { message: { content: [{ type: "text", text: "run output" }] } },
			});
			emit(realSessionId, { type: "turn/end", seq: 2, data: { turn: 1, reason: { kind: "completed" } } });
			emit("session-elsewhere", {
				type: "assistant/message",
				seq: 9,
				data: { message: { content: [{ type: "text", text: "FOREIGN" }] } },
			});
		});

		const result = await harness.executor.run(makeTask(), { triggeredBy: "manual", overdue: false });

		expect(result.status).toBe("completed");
		expect(result.output).toBe("run output");
	});

	it("settles a failed run when the turn ends with an error reason", async () => {
		const harness = makeHarness((emit, realSessionId) => {
			emit(realSessionId, {
				type: "turn/end",
				seq: 1,
				data: { turn: 1, reason: { kind: "error", error: { code: "AUTH", message: "API key is invalid" } } },
			});
		});

		const result = await harness.executor.run(makeTask(), { triggeredBy: "schedule", overdue: true });

		expect(result.status).toBe("failed");
		expect(result.error).toBe("AUTH: API key is invalid");
	});
});
