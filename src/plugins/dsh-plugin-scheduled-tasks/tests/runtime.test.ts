import { describe, expect, it } from "vitest";
import { buildModelCatalog } from "../src/catalog.js";

function makeCtx(services: Record<string, unknown>) {
	return { get: (key: string) => services[key] } as unknown as import("@deepseek-ai/cordis").Context;
}

describe("buildModelCatalog", () => {
	it("groups every registered provider with its models and reports the default selection", async () => {
		const llm = {
			listProviders: () => [
				{ id: "deepseek-official", name: "DeepSeek" },
				{ id: "openai", name: "OpenAI" },
			],
			listModels: async (provider: string) =>
				provider === "deepseek-official"
					? [
							{ provider, id: "deepseek-chat", name: "DeepSeek Chat" },
							{ provider, id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "R1" },
						]
					: [{ provider, id: "gpt-4o", name: "GPT-4o" }],
		};
		const result = await buildModelCatalog(
			makeCtx({
				llm,
				agentDefaultModel: { currentSelection: () => ({ provider: "deepseek-official", model: "deepseek-chat" }) },
			}),
		);
		expect(result.groups).toEqual([
			{
				id: "deepseek-official",
				name: "DeepSeek",
				models: [
					{ id: "deepseek-chat", name: "DeepSeek Chat" },
					{ id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "R1" },
				],
			},
			{ id: "openai", name: "OpenAI", models: [{ id: "gpt-4o", name: "GPT-4o" }] },
		]);
		expect(result.default).toEqual({ provider: "deepseek-official", model: "deepseek-chat" });
	});

	it("drops a provider whose catalog lookup fails without failing the request", async () => {
		const llm = {
			listProviders: () => [
				{ id: "good", name: "Good" },
				{ id: "bad", name: "Bad" },
			],
			listModels: async (provider: string) => {
				if (provider === "bad") throw new Error("boom");
				return [{ provider, id: "m1", name: "M1" }];
			},
		};
		const result = await buildModelCatalog(makeCtx({ llm }));
		expect(result.groups).toEqual([{ id: "good", name: "Good", models: [{ id: "m1", name: "M1" }] }]);
		expect(result.default).toBeNull();
	});

	it("returns an empty catalog when the llm service is absent", async () => {
		const result = await buildModelCatalog(makeCtx({}));
		expect(result.groups).toEqual([]);
		expect(result.default).toBeNull();
	});
});
