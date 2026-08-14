/**
 * Client plugin body: mounts the `mcp` remote namespace, registers the
 * `setting-mcp` locale dictionaries, then registers the MCP settings page into
 * the `settings.section` slot.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

// Load the locale service declarations (module augmentation for Context.locale).
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Load the settings slot contract (module augmentation for `settings.section`).
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import { en, type SettingMcpKey, zh } from "./locales.js";
import { McpSettingsSection } from "./McpSettingsSection.js";
import type { McpRemote } from "./remote.js";
import { injectStyles } from "./styles.js";
import { TYPERT_REMOTE } from "./typert-remote.js";

/** Dictionary namespace owned by this plugin (settings page copy). */
const NS = "setting-mcp";

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		/** MCP settings page copy. */
		"setting-mcp": SettingMcpKey;
	}
}

/** Services required before this plugin mounts. */
export const inject = ["slots", "remote", "locale"];

/** Mount the browser half. */
export async function apply(ctx: ClientContext) {
	injectStyles();
	ctx.effect(() => ctx.locale.register(NS, { zh, en }), "setting-mcp: dictionaries");
	await ctx.remote.$mount(TYPERT_REMOTE);
	// Stable per-namespace translate; reads the active locale at call time, so
	// the label thunk below follows language switches without re-registration.
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("settings.section", () =>
		ctx.slots.register(
			{
				name: "settings.section",
				id: "mcp",
				order: 30,
				label: () => t("nav"),
				locale: NS,
				inject: (): { mcp: McpRemote } => ({
					mcp: ctx.get("remote.mcp") as McpRemote,
				}),
			},
			McpSettingsSection,
		),
	);
}
