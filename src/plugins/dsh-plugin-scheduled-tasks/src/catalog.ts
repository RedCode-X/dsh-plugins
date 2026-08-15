/**
 * Grouped model-catalog builder for the `tasks/catalog` endpoint. Kept free of
 * decorators so it is directly unit-testable (the plugin's vitest transform
 * preserves decorators, which Node cannot parse); the decorated runtime method
 * delegates here.
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */
import type { Context } from "@deepseek-ai/cordis";
import type { CatalogResult, ModelCatalogGroup } from "./schemas.js";

/**
 * Grouped model catalog over every registered provider route (the same groups
 * the DSH model selector renders), plus the deployment's current default
 * selection when one is exposed. Providers whose catalog lookup fails are
 * dropped from the groups, never failing the request.
 */
export async function buildModelCatalog(ctx: Context): Promise<CatalogResult> {
	const groups: ModelCatalogGroup[] = [];
	const llm = ctx.get("llm");
	if (llm !== undefined && typeof llm.listProviders === "function") {
		for (const provider of llm.listProviders()) {
			try {
				const models = await llm.listModels(provider.id);
				groups.push({
					id: provider.id,
					name: provider.name,
					models: models.map((model) => ({
						id: model.id,
						name: model.name,
						...(model.description === undefined ? {} : { description: model.description }),
					})),
				});
			} catch {
				// One broken catalog lookup must not hide the sound groups.
			}
		}
	}
	const defaultModel = ctx.get("agentDefaultModel");
	const selection = defaultModel?.currentSelection();
	return {
		groups,
		default: selection === undefined ? null : { provider: selection.provider, model: selection.model },
	};
}
