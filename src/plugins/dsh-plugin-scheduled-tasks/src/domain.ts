/**
 * Storage-domain declaration for scheduled tasks and their run history.
 *
 * Kept apart from `./types` (which is pure zod and shared with the browser
 * bundle): the domain table is a server-side artifact that must never be
 * reachable from `src/client`, since `@deepseek-ai/dsh-storage-domain` is not
 * a browser platform seed module.
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { type RunId, type RunRecord, runSchema, type Task, type TaskId, taskSchema } from "./types.js";

/** The `scheduled_tasks` domain declaration. */
export const tasksDomain = defineDomain({
	name: "scheduled_tasks",
	version: 1,
	tables: {
		tasks: domainTable<TaskId, Task>(taskSchema),
		runs: domainTable<RunId, RunRecord>(runSchema),
	},
});

/** Type of the opened `scheduled-tasks` domain. */
export type TasksDomain = typeof tasksDomain;
