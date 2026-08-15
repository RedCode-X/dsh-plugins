/**
 * Client plugin body: mounts the `tasks` remote namespace, registers the
 * `scheduled-tasks` locale dictionaries, then registers the scheduled-tasks
 * trigger into the sidebar footer action seat.
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */
// Load the locale service declarations (module augmentation for Context.locale).
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Load the sidebar slot declarations (module augmentation for the SlotMap).
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { en, type ScheduledTasksKey, zh } from "./locales.js";
import type { TasksRemote } from "./remote.js";
import { injectStyles } from "./styles.js";
import { TasksFooterAction, type TasksFooterActionProps } from "./TasksPanel.js";
import { TYPERT_REMOTE } from "./typert-remote.js";

/** Dictionary namespace owned by this plugin (panel copy). */
const NS = "scheduled-tasks";

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		/** Scheduled-tasks panel copy. */
		"scheduled-tasks": ScheduledTasksKey;
	}
}

/** Services required before this plugin mounts. */
export const inject = ["slots", "remote", "locale"];

/** Mount the browser half. */
export async function apply(ctx: ClientContext) {
	injectStyles();
	ctx.effect(() => ctx.locale.register(NS, { zh, en }), "scheduled-tasks: dictionaries");
	await ctx.remote.$mount(TYPERT_REMOTE);
	// Stable per-namespace translate; reads the active locale at call time, so
	// the label thunk below follows language switches without re-registration.
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("sidebar.footer.action", () =>
		ctx.slots.register(
			{
				name: "sidebar.footer.action",
				id: "scheduled-tasks",
				label: () => t("title"),
				locale: NS,
				inject: (): Pick<TasksFooterActionProps, "tasks"> => ({
					tasks: ctx.get("remote.tasks") as TasksRemote,
				}),
			},
			TasksFooterAction,
		),
	);
}
