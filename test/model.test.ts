import { describe, expect, test } from "bun:test";
import { matchModels, type ModelSource, type RegistryModel, resolveVerifierEndpoint } from "../src/model";

/** The catalog ships `deepseek-v4-flash` under eight providers, so a bare id is ambiguous. */
const CATALOG: RegistryModel[] = [
	{ id: "deepseek-v4-flash", provider: "aimlapi", baseUrl: "https://api.aimlapi.com/v1", api: "openai-completions" },
	{ id: "deepseek-v4-flash", provider: "deepseek", baseUrl: "https://api.deepseek.com", api: "openai-completions" },
	{ id: "deepseek-v4-flash", provider: "venice", baseUrl: "https://api.venice.ai/api/v1", api: "openai-completions" },
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
		apiKey: async model => credentials[model.provider],
	};
}

describe("selector matching", () => {
	test("prefers the provider-qualified entry", () => {
		expect(matchModels(CATALOG, "venice/deepseek-v4-flash").map(model => model.provider)).toEqual(["venice"]);
	});

	test("returns every provider serving a bare id, in catalog order", () => {
		expect(matchModels(CATALOG, "deepseek-v4-flash").map(model => model.provider)).toEqual([
			"aimlapi",
			"deepseek",
			"venice",
		]);
	});

	test("matches a provider-qualified id that itself contains a slash", () => {
		expect(matchModels(CATALOG, "nous/deepseek/deepseek-v4-flash-0731").map(model => model.provider)).toEqual(["nous"]);
	});
});

describe("verifier endpoint resolution", () => {
	test("skips ambiguous providers omp cannot authenticate", async () => {
		const endpoint = await resolveVerifierEndpoint("deepseek-v4-flash", source({ deepseek: "sk-real" }));
		expect(endpoint).toEqual({
			provider: "deepseek",
			model: "deepseek-v4-flash",
			baseUrl: "https://api.deepseek.com",
			apiKey: "sk-real",
		});
	});

	test("sends the wire id when the catalog renames a model", async () => {
		const endpoint = await resolveVerifierEndpoint("nous/deepseek/deepseek-v4-flash-0731", source({ nous: "sk-nous" }));
		expect(endpoint.model).toBe("deepseek-v4-flash-0731");
	});

	test("substitutes a placeholder key for a keyless provider", async () => {
		const endpoint = await resolveVerifierEndpoint("venice/deepseek-v4-flash", source({ venice: "N/A" }));
		expect(endpoint.apiKey).toBe("EMPTY");
	});

	test("rejects a dialect with no logprob support", async () => {
		await expect(resolveVerifierEndpoint("anthropic/claude-opus-4-8", source({ anthropic: "sk-ant" }))).rejects.toThrow(
			"anthropic-messages",
		);
	});

	test("names the providers tried when no credential exists", async () => {
		await expect(resolveVerifierEndpoint("deepseek-v4-flash", source({}))).rejects.toThrow(
			/no credential.*aimlapi, deepseek, venice/s,
		);
	});

	test("suggests real catalog entries for an unknown selector", async () => {
		await expect(resolveVerifierEndpoint("deepseek-v9-turbo", source({}))).rejects.toThrow("no model matching");
	});
});
