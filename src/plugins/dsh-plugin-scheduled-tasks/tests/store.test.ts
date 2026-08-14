import { describe, expect, it } from "vitest";
import { TasksStore } from "../src/store.js";
import { type Task, TaskId, type TasksDomain } from "../src/types.js";

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
