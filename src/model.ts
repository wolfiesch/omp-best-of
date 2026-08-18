/**
 * Verifier credentials come from omp's own model registry, so an OAuth-backed
 * provider works without a plugin-specific API key: the registry mints, and
 * refreshes, the same credential the calling session would have used.
 */
import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";

/** The fields this plugin reads from an omp catalog model. */
export interface RegistryModel {
	id: string;
	/** Model id to put on the wire when the catalog presents it under another id. */
	wireId?: string;
	provider: string;
	baseUrl: string;
	api: string;
}

/**
 * Narrow view of omp's `ModelRegistry`. An extension passes an adapter over the
 * session's live instance; the standalone CLI builds one on demand.
 */
export interface ModelSource {
	list(): Promise<readonly RegistryModel[]>;
	apiKey(model: RegistryModel): Promise<string | undefined>;
	close?(): void;
}

export interface VerifierEndpoint {
	provider: string;
	/** Model id to put on the wire, which is not always the catalog id. */
	model: string;
	baseUrl: string;
	apiKey: string;
}

/**
 * `llm-verifier` reads a score-token distribution from `POST /chat/completions`
 * with `logprobs`, so only chat-completions dialects can serve it. Responses,
 * Anthropic Messages, and Gemini endpoints expose no equivalent field.
 */
const CHAT_COMPLETION_APIS: ReadonlySet<string> = new Set(["openai-completions", "openrouter"]);

/** omp's sentinel for a provider that needs no credential. */
const NO_AUTH = "N/A";

/** OpenAI clients require some key string even against a keyless local server. */
const KEYLESS_PLACEHOLDER = "EMPTY";

/**
 * Every catalog entry a selector could mean, best first: the provider-qualified
 * match, then each bare-id match in catalog order. A bare id is ambiguous on
 * purpose - `deepseek-v4-flash` is served by eight providers - so the caller
 * disambiguates by credential the way omp's auth gateway does.
 */
export function matchModels(models: readonly RegistryModel[], selector: string): RegistryModel[] {
	const wanted = selector.trim();
	if (!wanted) return [];
	const qualified = models.filter(model => `${model.provider}/${model.id}` === wanted);
	const bare = models.filter(model => model.id === wanted && !qualified.includes(model));
	return [...qualified, ...bare];
}

/** Nearest usable catalog ids for a missed selector, so the error can name something real. */
export function suggestModels(models: readonly RegistryModel[], selector: string, limit = 5): string[] {
	const stem = (selector.trim().toLowerCase().split("/").pop() ?? "").slice(0, 24);
	if (!stem) return [];
	return models
		.filter(model => CHAT_COMPLETION_APIS.has(model.api) && model.id.toLowerCase().includes(stem))
		.slice(0, limit)
		.map(model => `${model.provider}/${model.id}`);
}

/** Wrap a live registry, session-owned or CLI-owned, in the narrow source shape. */
export function modelSourceFromRegistry(registry: ModelRegistry, close?: () => void): ModelSource {
	return {
		list: async () => registry.getAll(),
		apiKey: model =>
			registry.getApiKeyForProvider(model.provider, undefined, { baseUrl: model.baseUrl, modelId: model.id }),
		close,
	};
}

/**
 * Build a registry for the standalone CLI. Imported lazily: inside omp the
 * extension passes the session's registry, and loading a second copy of the
 * agent's module graph into the plugin would be pure waste.
 */
export async function createModelSource(): Promise<ModelSource> {
	try {
		const [{ ModelRegistry: Registry }, { discoverAuthStorage }] = await Promise.all([
			import("@oh-my-pi/pi-coding-agent/config/model-registry"),
			import("@oh-my-pi/pi-coding-agent/session/auth-broker-config"),
		]);
		const authStorage = await discoverAuthStorage();
		const registry = new Registry(authStorage);
		await registry.refresh("online-if-uncached");
		return modelSourceFromRegistry(registry, () => authStorage.close());
	} catch (error) {
		throw new Error(
			`Cannot reach omp's model registry, so verifier credentials cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Resolve a verifier model selector to a live OpenAI-compatible endpoint plus a
 * credential omp already holds. Runs before any candidate starts, so an
 * unusable verifier fails before money is spent on generation.
 */
export async function resolveVerifierEndpoint(selector: string, source?: ModelSource): Promise<VerifierEndpoint> {
	const resolved = source ?? (await createModelSource());
	try {
		const models = await resolved.list();
		const matches = matchModels(models, selector);
		if (matches.length === 0) {
			const suggestions = suggestModels(models, selector);
			const hint = suggestions.length
				? ` Closest catalog entries: ${suggestions.join(", ")}.`
				: " Run `omp models find <text>` to list candidates.";
			throw new Error(`omp has no model matching --verifier-model "${selector}".${hint}`);
		}
		const usable = matches.filter(model => CHAT_COMPLETION_APIS.has(model.api));
		if (usable.length === 0) {
			const dialects = [...new Set(matches.map(model => model.api))].join(", ");
			throw new Error(
				`Verifier model "${selector}" speaks "${dialects}". Scoring reads a token-logprob distribution from an OpenAI-compatible chat-completions endpoint, which that dialect does not expose. Pass --verifier-model with an openai-completions model, such as deepseek/deepseek-v4-flash.`,
			);
		}
		// A bare id can name entries across providers; take the first one omp can
		// actually authenticate, exactly as its auth gateway filters by credential.
		for (const model of usable) {
			const apiKey = await resolved.apiKey(model);
			if (!apiKey) continue;
			return {
				provider: model.provider,
				model: model.wireId ?? model.id,
				baseUrl: model.baseUrl,
				apiKey: apiKey === NO_AUTH ? KEYLESS_PLACEHOLDER : apiKey,
			};
		}
		const providers = [...new Set(usable.map(model => model.provider))];
		throw new Error(
			`omp holds no credential for verifier model "${selector}", offered by ${providers.join(", ")}. Check one with \`omp token ${providers[0]}\`, or pass --verifier-model <provider/model> for a provider you have.`,
		);
	} finally {
		if (!source) resolved.close?.();
	}
}
