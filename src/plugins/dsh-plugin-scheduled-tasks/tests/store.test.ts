import { describe, expect, it } from "vitest";
import type { TasksDomain } from "../src/domain.js";
import { TasksStore } from "../src/store.js";
import { type Task, TaskId } from "../src/types.js";

// ── minimal table/domain fakes over plain Maps ─────────────────────────────

function makeTable<K, V>() {
	const map = new Map<K, V>();
	return {
		get: (key: K) => map.get(key),
		entries: () => [...map.entries()][Symbol.iterator]() as IterableIterator<[K, V]>,
		put: async (key: K, value: V) => {
			map.set(key, value);
		},
		delete: async (key: K) => {
			map.delete(key);
			return true;
		},
	};
}

function makeDomain() {
	const tables = new Map<string, ReturnType<typeof makeTable>>();
	return {
		table: (name: string) => {
			let table = tables.get(name);
			if (table === undefined) {
				table = makeTable();
				tables.set(name, table);
			}
			return table;
		},
	} as unknown as import("@deepseek-ai/dsh-storage-domain").Domain<TasksDomain>;
}

function makeCtx() {
	return { get: () => undefined } as unknown as import("@deepseek-ai/cordis").Context;
}

function makeTask(id: string): Task {
	return {
		id: TaskId(id),
		projectPath: "/projects/demo",
		name: "demo",
		prompt: "do the thing",
		kind: "at",
		scheduledAt: "2026-08-14T09:00:00.000Z",
		enabled: true,
		state: "active",
		createdAt: "2026-08-13T09:00:00.000Z",
		updatedAt: "2026-08-13T09:00:00.000Z",
	};
}

/** Insert one task directly into the store's private table (test-only). */
async function putTask(store: TasksStore, task: Task): Promise<void> {
	await (store as unknown as { tasks: { put: (key: Task["id"], value: Task) => Promise<void> } }).tasks.put(
		task.id,
		task,
	);
}

describe("TasksStore.finishRun", () => {
	it("settles a run and updates the owning task's last-run pointers", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		await putTask(store, makeTask("task-1"));
		const run = await store.beginRun({
			taskId: "task-1",
			projectPath: "/projects/demo",
			triggeredBy: "schedule",
			overdue: false,
		});
		await store.finishRun(run, "task-1", { status: "completed", output: "done" });

		expect(store.listRuns("task-1")).toHaveLength(1);
		expect(store.listRuns("task-1")[0]!.status).toBe("completed");
		expect(store.get("task-1")!.lastRunId).toBe(run.id);
	});

	it("drops the run record instead of resurrecting an orphan after the task is deleted", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		await putTask(store, makeTask("task-1"));
		const run = await store.beginRun({
			taskId: "task-1",
			projectPath: "/projects/demo",
			triggeredBy: "schedule",
			overdue: false,
		});
		await store.remove("task-1");
		await store.finishRun(run, "task-1", { status: "completed", output: "done" });

		expect(store.get("task-1")).toBeUndefined();
		expect(store.listRuns("task-1")).toHaveLength(0);
	});
});

describe("TasksStore model override", () => {
	it("persists an explicit model selection on create and trims its fields", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const task = await store.create({
			projectPath: "/projects/demo",
			name: "pinned",
			prompt: "run with a pinned model",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
			model: { provider: " deepseek-official ", model: " deepseek-chat " },
		});
		expect(task.model).toEqual({ provider: "deepseek-official", model: "deepseek-chat" });
	});

	it("keeps the model field absent when create omits it", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const task = await store.create({
			projectPath: "/projects/demo",
			name: "default",
			prompt: "use the default model",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
		});
		expect(task.model).toBeUndefined();
	});

	it("rejects an explicit model with an empty provider or model id", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		await expect(
			store.create({
				projectPath: "/projects/demo",
				name: "bad",
				prompt: "bad model",
				kind: "at",
				at: "2026-08-20T09:00:00Z",
				model: { provider: "", model: "deepseek-chat" },
			}),
		).rejects.toMatchObject({ code: "invalid_model" });
	});

	it("replaces the model override on update", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const created = await store.create({
			projectPath: "/projects/demo",
			name: "pinned",
			prompt: "run with a pinned model",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
			model: { provider: "deepseek-official", model: "deepseek-chat" },
		});
		const updated = await store.update(created.id, { model: { provider: "openai", model: "gpt-4o" } });
		expect(updated.model).toEqual({ provider: "openai", model: "gpt-4o" });
	});

	it("clears the model override back to the default on update with null", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const created = await store.create({
			projectPath: "/projects/demo",
			name: "pinned",
			prompt: "run with a pinned model",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
			model: { provider: "deepseek-official", model: "deepseek-chat" },
		});
		const updated = await store.update(created.id, { model: null });
		expect(updated.model).toBeUndefined();
	});

	it("keeps the model override when an unrelated field is updated", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const created = await store.create({
			projectPath: "/projects/demo",
			name: "pinned",
			prompt: "run with a pinned model",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
			model: { provider: "deepseek-official", model: "deepseek-chat" },
		});
		const updated = await store.update(created.id, { enabled: false });
		expect(updated.model).toEqual({ provider: "deepseek-official", model: "deepseek-chat" });
	});

	it("updates projectPath when projectPath is provided in patch", async () => {
		const store = new TasksStore(makeCtx(), makeDomain(), { keepRunsPerTask: 20 });
		const created = await store.create({
			projectPath: "/projects/demo",
			name: "pinned",
			prompt: "run in demo",
			kind: "at",
			at: "2026-08-20T09:00:00Z",
		});
		expect(created.projectPath).toBe("/projects/demo");
		const updated = await store.update(created.id, { projectPath: "/projects/other" });
		expect(updated.projectPath).toBe("/projects/other");
	});
});
