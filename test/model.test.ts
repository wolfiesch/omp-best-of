import { describe, expect, test } from "bun:test";
import { type ModelSource, matchModels, type RegistryModel, resolveVerifierEndpoint } from "../src/model";

/**
 * The catalog ships `deepseek-v4-flash` under multiple providers. DeepSeek's
 * endpoint reaches upstream's native score-tag path; other chat-completions
 * endpoints remain eligible but must prove constrained prefill live.
 */
const CATALOG: RegistryModel[] = [
	{ id: "deepseek-v4-flash", provider: "aimlapi", baseUrl: "https://api.aimlapi.com/v1", api: "openai-completions" },
	{ id: "deepseek-v4-flash", provider: "deepseek", baseUrl: "https://api.deepseek.com", api: "openai-completions" },
	{ id: "deepseek-v4-flash", provider: "venice", baseUrl: "https://api.venice.ai/api/v1", api: "openai-completions" },
	{
		id: "deepseek-reasoner",
		wireId: "deepseek-reasoner-0731",
		provider: "deepseek",
		baseUrl: "https://api.deepseek.com/v1",
		api: "openai-completions",
	},
	{ id: "claude-opus-4-8", provider: "anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages" },
	{
		id: "deepseek/deepseek-v4-flash-0731",
		wireId: "deepseek-v4-flash-0731",
		provider: "nous",
		baseUrl: "https://inference-api.nousresearch.com/v1",
		api: "openai-completions",
	},
];

function source(credentials: Record<string, string>): ModelSource {
	return {
		list: async () => CATALOG,
		apiKey: async (model) => credentials[model.provider],
	};
}

describe("selector matching", () => {
	test("prefers the provider-qualified entry", () => {
		expect(matchModels(CATALOG, "venice/deepseek-v4-flash").map((model) => model.provider)).toEqual(["venice"]);
	});

	test("returns every provider serving a bare id, in catalog order", () => {
		expect(matchModels(CATALOG, "deepseek-v4-flash").map((model) => model.provider)).toEqual(["aimlapi", "deepseek", "venice"]);
	});

	test("matches a provider-qualified id that itself contains a slash", () => {
		expect(matchModels(CATALOG, "nous/deepseek/deepseek-v4-flash-0731").map((model) => model.provider)).toEqual(["nous"]);
	});
});

describe("verifier endpoint resolution", () => {
	test("prefers a native scoring endpoint for an ambiguous bare id", async () => {
		const endpoint = await resolveVerifierEndpoint(
			"deepseek-v4-flash",
			source({ aimlapi: "sk-aimlapi", deepseek: "sk-real", venice: "sk-venice" }),
		);
		expect(endpoint).toEqual({
			provider: "deepseek",
			model: "deepseek-v4-flash",
			baseUrl: "https://api.deepseek.com",
			apiKey: "sk-real",
			nativeScoreTags: true,
		});
	});

	test("sends the wire id when the catalog renames a model", async () => {
		const endpoint = await resolveVerifierEndpoint("deepseek/deepseek-reasoner", source({ deepseek: "sk-real" }));
		expect(endpoint.model).toBe("deepseek-reasoner-0731");
	});

	test("admits a non-native endpoint for the live capability probe", async () => {
		const endpoint = await resolveVerifierEndpoint("nous/deepseek/deepseek-v4-flash-0731", source({ nous: "sk-nous" }));
		expect(endpoint).toMatchObject({
			provider: "nous",
			model: "deepseek-v4-flash-0731",
			nativeScoreTags: false,
		});
	});

	test("keeps a provider-qualified compatible endpoint eligible", async () => {
		const endpoint = await resolveVerifierEndpoint("venice/deepseek-v4-flash", source({ venice: "sk-venice" }));
		expect(endpoint.provider).toBe("venice");
		expect(endpoint.nativeScoreTags).toBe(false);
	});

	test("admits a non-chat catalog dialect for the live capability probe", async () => {
		const endpoint = await resolveVerifierEndpoint("anthropic/claude-opus-4-8", source({ anthropic: "sk-ant" }));
		expect(endpoint.provider).toBe("anthropic");
		expect(endpoint.nativeScoreTags).toBe(false);
	});

	test("names every compatible provider when no credential exists", async () => {
		await expect(resolveVerifierEndpoint("deepseek-v4-flash", source({}))).rejects.toThrow(/no credential.*deepseek, aimlapi, venice/s);
	});

	test("suggests real catalog entries for an unknown selector", async () => {
		await expect(resolveVerifierEndpoint("deepseek-v9-turbo", source({}))).rejects.toThrow("no model matching");
	});
});
