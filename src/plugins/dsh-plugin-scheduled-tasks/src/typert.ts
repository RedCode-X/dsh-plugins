/**
 * Host TYPERT face for the `tasks` namespace. The `dsh-typert-loader` scans
 * loader entries that export `./typert`, registers this manifest, and the
 * host gateway dispatches `tasks/*` endpoints to the `tasks` service.
 *
 * Hand-written in the same shape the `@deepseek-ai/dsh-typert-generator`
 * emits (see `@deepseek-ai/dsh-commands`' generated `typert.host.js`).
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */

import { z } from "zod";
import {
	catalogResultSchema,
	createInputSchema,
	deleteResultSchema,
	runViewSchema,
	taskViewSchema,
	updateInputSchema,
} from "./schemas.js";

const PKG = "@opendsh/dsh-plugin-scheduled-tasks";

const direct: { kind: "direct" } = { kind: "direct" };

function jsonCodec(typeSymbol: string, schema: z.ZodType) {
	return { mode: "strict" as const, typeSymbol: `${PKG}/types#${typeSymbol}`, schema };
}

function optionalJsonCodec(typeSymbol: string, schema: z.ZodType) {
	return {
		mode: "strict" as const,
		typeSymbol: `${PKG}/types#${typeSymbol}`,
		schema: schema.optional(),
	};
}

function result(typeSymbol: string, schema: z.ZodType) {
	return { mode: "strict" as const, typeSymbol: `${PKG}/types#${typeSymbol}`, schema };
}

/** Strict host contribution: `tasks/*` endpoints dispatched to `ctx.tasks`. */
export const TYPERT = {
	package: PKG,
	face: "host",
	schemas: [],
	model: {
		services: [
			{
				tags: [],
				key: "tasks",
				exportName: "tasks",
				members: [
					{ name: "list", kind: "method", signature: "(projectPath?: string): TaskView[]" },
					{ name: "create", kind: "method", signature: "(input: CreateInput): Promise<TaskView>" },
					{ name: "update", kind: "method", signature: "(id: string, patch: UpdateInput): Promise<TaskView>" },
					{ name: "delete", kind: "method", signature: "(id: string): Promise<{ id: string; deleted: boolean }>" },
					{ name: "runNow", kind: "method", signature: "(id: string): Promise<RunView>" },
					{ name: "history", kind: "method", signature: "(id: string): RunView[]" },
					{ name: "catalog", kind: "method", signature: "(): Promise<CatalogResult>" },
				],
				types: [
					{ name: "TaskId", declaration: "export type TaskId = string;" },
					{ name: "ProjectPath", declaration: "export type ProjectPath = string;" },
					{ name: "DeleteResult", declaration: "export interface DeleteResult { id: string; deleted: boolean; }" },
					{
						name: "TaskModel",
						declaration: "export interface TaskModel { provider: string; model: string; }",
					},
					{
						name: "TaskView",
						declaration:
							"export interface TaskView { id: string; projectPath: string; name: string; prompt: string; kind: 'at' | 'every' | 'cron'; scheduledAt: string; everySeconds?: number; cron?: string; timeZone?: string; model?: TaskModel; enabled: boolean; state: 'active' | 'finished'; createdAt: string; updatedAt: string; lastRunAt?: string; lastRunId?: string; }",
					},
					{
						name: "RunView",
						declaration:
							"export interface RunView { id: string; taskId: string; projectPath: string; triggeredBy: 'schedule' | 'manual'; overdue: boolean; startedAt: string; finishedAt?: string; status: 'running' | 'completed' | 'failed'; output?: string; error?: string; sessionId?: string; model?: TaskModel; }",
					},
					{
						name: "CreateInput",
						declaration:
							"export interface CreateInput { projectPath: string; name: string; prompt: string; kind: 'at' | 'every' | 'cron'; at?: string | { date: string; time: string; time_zone: string }; everySeconds?: number; cron?: string; timeZone?: string; model?: TaskModel; enabled?: boolean; }",
					},
					{
						name: "UpdateInput",
						declaration:
							"export interface UpdateInput { name?: string; prompt?: string; kind?: 'at' | 'every' | 'cron'; at?: string | { date: string; time: string; time_zone: string }; everySeconds?: number; cron?: string; timeZone?: string; model?: TaskModel | null; enabled?: boolean; }",
					},
					{
						name: "CatalogModel",
						declaration: "export interface CatalogModel { id: string; name: string; description?: string; }",
					},
					{
						name: "ModelCatalogGroup",
						declaration: "export interface ModelCatalogGroup { id: string; name: string; models: CatalogModel[]; }",
					},
					{
						name: "CatalogResult",
						declaration:
							"export interface CatalogResult { groups: ModelCatalogGroup[]; default: { provider: string; model: string } | null; }",
					},
				],
			},
		],
		events: [],
		objects: [],
	},
	invocations: [
		{
			id: `${PKG}#tasks/list`,
			service: "tasks",
			namespace: "tasks",
			method: "list",
			invocation: direct,
			parameters: [
				{
					name: "projectPath",
					wire: "projectPath",
					source: "json",
					acceptsUndefined: true,
					codec: optionalJsonCodec("ProjectPath", z.string()),
				},
			],
			result: result("TaskView[]", z.array(taskViewSchema)),
		},
		{
			id: `${PKG}#tasks/create`,
			service: "tasks",
			namespace: "tasks",
			method: "create",
			invocation: direct,
			parameters: [
				{
					name: "input",
					wire: "input",
					source: "json",
					codec: jsonCodec("CreateInput", createInputSchema),
				},
			],
			result: result("TaskView", taskViewSchema),
		},
		{
			id: `${PKG}#tasks/update`,
			service: "tasks",
			namespace: "tasks",
			method: "update",
			invocation: direct,
			parameters: [
				{
					name: "id",
					wire: "id",
					source: "json",
					codec: jsonCodec("TaskId", z.string()),
				},
				{
					name: "patch",
					wire: "patch",
					source: "json",
					codec: jsonCodec("UpdateInput", updateInputSchema),
				},
			],
			result: result("TaskView", taskViewSchema),
		},
		{
			id: `${PKG}#tasks/delete`,
			service: "tasks",
			namespace: "tasks",
			method: "delete",
			invocation: direct,
			parameters: [
				{
					name: "id",
					wire: "id",
					source: "json",
					codec: jsonCodec("TaskId", z.string()),
				},
			],
			result: result("DeleteResult", deleteResultSchema),
		},
		{
			id: `${PKG}#tasks/runNow`,
			service: "tasks",
			namespace: "tasks",
			method: "runNow",
			invocation: direct,
			parameters: [
				{
					name: "id",
					wire: "id",
					source: "json",
					codec: jsonCodec("TaskId", z.string()),
				},
			],
			result: result("RunView", runViewSchema),
		},
		{
			id: `${PKG}#tasks/history`,
			service: "tasks",
			namespace: "tasks",
			method: "history",
			invocation: direct,
			parameters: [
				{
					name: "id",
					wire: "id",
					source: "json",
					codec: jsonCodec("TaskId", z.string()),
				},
			],
			result: result("RunView[]", z.array(runViewSchema)),
		},
		{
			id: `${PKG}#tasks/catalog`,
			service: "tasks",
			namespace: "tasks",
			method: "catalog",
			invocation: direct,
			parameters: [],
			result: result("CatalogResult", catalogResultSchema),
		},
	],
};
