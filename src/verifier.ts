import path from "node:path";
import type { VerifierEndpoint } from "./model";
import { runCommand } from "./process";
import { isRecord } from "./type-guards";
import type { VerifierResult } from "./types";

export interface VerifyCandidatesInput {
	problem: string;
	candidates: string[];
	criteria: Record<string, string>;
	/** Endpoint and credential resolved from omp's registry, not from plugin-local env. */
	endpoint: VerifierEndpoint;
	nEvaluations: number;
	pivots: number;
	seed: number;
	cachePath: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

/** One bridge invocation: same interpreter, same credential handoff, different mode. */
async function runBridge(
	endpoint: VerifierEndpoint,
	payload: unknown,
	args: string[] = [],
	signal?: AbortSignal,
	timeoutMs?: number,
): Promise<string> {
	const bridgePath = process.env.OMP_BEST_OF_VERIFIER_BRIDGE ?? path.resolve(import.meta.dir, "../python/verify.py");
	const command = process.env.OMP_BEST_OF_PYTHON
		? [process.env.OMP_BEST_OF_PYTHON, bridgePath, ...args]
		: ["uv", "run", "--with", "llm-verifier==0.2.0", "python", bridgePath, ...args];
	const result = await runCommand(command, {
		stdin: JSON.stringify(payload),
		// `llm_verifier.create_client()` prefers OPENAI_BASE_URL, so this selects the
		// OpenAI-compatible path with the credential omp minted for that provider.
		env: { OPENAI_BASE_URL: endpoint.baseUrl, OPENAI_API_KEY: endpoint.apiKey },
		signal,
		timeoutMs,
	});
	if (result.timedOut) throw new Error("Verifier timed out");
	if (result.aborted) throw signal?.reason ?? new DOMException("Verifier aborted", "AbortError");
	if (result.exitCode !== 0) {
		throw new Error(`Verifier failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout;
}

/**
 * Refuse an endpoint that cannot actually score, before any candidate is
 * generated. Skipped for an endpoint on upstream's native score-tag path, which
 * needs no grammar support; one token of output otherwise.
 */
export async function assertScoringSupported(endpoint: VerifierEndpoint, signal?: AbortSignal, timeoutMs = 60_000): Promise<void> {
	if (endpoint.nativeScoreTags) {
		const stdout = await runBridge(endpoint, { model: endpoint.model }, ["--probe-native"], signal, timeoutMs);
		let result: unknown;
		try {
			result = JSON.parse(stdout);
		} catch {
			throw new Error(`Native verifier probe returned invalid JSON: ${stdout.slice(0, 500)}`);
		}
		if (isRecord(result) && result.ok === true) return;
		throw new Error(`Native verifier probe failed: ${stdout.slice(0, 500)}`);
	}
	const stdout = await runBridge(endpoint, { model: endpoint.model }, ["--probe"], signal, timeoutMs);
	let sample: ScoringProbeSample;
	try {
		sample = JSON.parse(stdout) as ScoringProbeSample;
	} catch {
		throw new Error(`Verifier probe returned invalid JSON: ${stdout.slice(0, 500)}`);
	}
	const verdict = evaluateScoringProbe(sample);
	if (verdict.supported) return;
	throw new Error(
		`Verifier model "${endpoint.provider}/${endpoint.model}" cannot score: ${verdict.detail} llm-verifier 0.2.0 reads sampled score tags directly only from api.deepseek.com; any other endpoint must serve vLLM/SGLang constrained prefill. Pass --verifier-model deepseek/deepseek-v4-flash, which is also the cheapest option, or point --verifier-model at a vLLM or SGLang server.`,
	);
}

function finiteNumbers(value: unknown, field: string, length: number): number[] {
	if (!Array.isArray(value) || value.length !== length || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
		throw new Error(`Verifier contract error: ${field} must contain ${length} finite numbers`);
	}
	return value;
}

export function validateVerifierResult(value: unknown, candidateCount: number, backend: VerifierResult["backend"]): VerifierResult {
	if (!isRecord(value)) throw new Error("Verifier contract error: response must be an object");
	const index = value.index;
	if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= candidateCount) {
		throw new Error(`Verifier contract error: index must identify one of ${candidateCount} candidates`);
	}
	const scores = finiteNumbers(value.scores, "scores", candidateCount);
	const ranking = finiteNumbers(value.ranking, "ranking", candidateCount);
	if (ranking.some((candidateIndex) => !Number.isSafeInteger(candidateIndex) || candidateIndex < 0 || candidateIndex >= candidateCount)) {
		throw new Error("Verifier contract error: ranking contains an invalid candidate index");
	}
	const seenIndexes = new Set(ranking);
	if (seenIndexes.size !== candidateCount) {
		throw new Error("Verifier contract error: ranking must be a complete permutation of candidate indexes");
	}
	const nComparisons = value.nComparisons;
	if (!Number.isSafeInteger(nComparisons) || (nComparisons as number) < 0) {
		throw new Error("Verifier contract error: nComparisons must be a nonnegative safe integer");
	}
	if (!Array.isArray(value.criteria) || value.criteria.some((criterion) => typeof criterion !== "string")) {
		throw new Error("Verifier contract error: criteria must be an array of strings");
	}
	if (!isRecord(value.usage)) throw new Error("Verifier contract error: usage must be an object");
	const usageFields = [
		"calls",
		"input_tokens",
		"cached_input_tokens",
		"uncached_input_tokens",
		"output_tokens",
		"reasoning_tokens",
		"cache_hit_rate",
	] as const;
	for (const field of usageFields) {
		const amount = value.usage[field];
		if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
			throw new Error(`Verifier contract error: usage.${field} must be a nonnegative finite number`);
		}
	}
	const reportedCost = value.usage.reported_cost_usd;
	if (reportedCost !== undefined && (typeof reportedCost !== "number" || !Number.isFinite(reportedCost) || reportedCost < 0)) {
		throw new Error("Verifier contract error: usage.reported_cost_usd must be a nonnegative finite number");
	}
	return {
		backend,
		index: index as number,
		scores,
		ranking,
		nComparisons: nComparisons as number,
		criteria: value.criteria,
		usage: {
			calls: value.usage.calls as number,
			input_tokens: value.usage.input_tokens as number,
			cached_input_tokens: value.usage.cached_input_tokens as number,
			uncached_input_tokens: value.usage.uncached_input_tokens as number,
			output_tokens: value.usage.output_tokens as number,
			reasoning_tokens: value.usage.reasoning_tokens as number,
			cache_hit_rate: value.usage.cache_hit_rate as number,
			...(reportedCost === undefined ? {} : { reported_cost_usd: reportedCost }),
		},
	};
}
export async function verifyCandidates(input: VerifyCandidatesInput): Promise<VerifierResult> {
	if (input.candidates.length < 2) throw new Error("Verifier requires at least two candidates");
	const { endpoint, signal, timeoutMs, ...payload } = input;
	const stdout = await runBridge(endpoint, { ...payload, model: endpoint.model }, [], signal, timeoutMs);
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error(`Verifier returned invalid JSON: ${stdout.slice(0, 500)}`);
	}
	return validateVerifierResult(parsed, input.candidates.length, "logprob");
}

/** Raw sample returned by the bridge's `--probe` mode. */
export interface ScoringProbeSample {
	/** Present when the request itself failed, which means the fields were rejected. */
	error?: string;
	emitted?: string;
	alternatives?: string[];
	/** Allowed choices upstream sent, both bare and space-prefixed spellings. */
	letters?: string[];
}

export interface ScoringSupport {
	supported: boolean;
	detail: string;
}

/**
 * Judge whether a sampled prefill position proves constrained decoding.
 *
 * Constrained decoding renormalizes the distribution over exactly the allowed
 * choices, so every returned alternative is a score letter. Counting letters
 * instead would accept an unconstrained server, because a top-20 sampled after
 * `<score_A>` can easily contain two bare letters next to words and punctuation,
 * and any A-T token upstream finds becomes a plausible but meaningless score.
 */
export function evaluateScoringProbe(sample: ScoringProbeSample): ScoringSupport {
	if (sample.error) {
		return {
			supported: false,
			detail: `the endpoint rejected continue_final_message and structured_outputs (${sample.error}). Upstream catches that and scores every pair a flat 0.5.`,
		};
	}
	const allowed = new Set((sample.letters ?? []).map((letter) => letter.trim()));
	const alternatives = sample.alternatives ?? [];
	const emitted = (sample.emitted ?? "").trim();
	if (!allowed.has(emitted)) {
		return {
			supported: false,
			detail: `the endpoint emitted ${JSON.stringify(emitted)} at the score position instead of a score letter, so it ignored structured_outputs.`,
		};
	}
	if (alternatives.length < 2) {
		return {
			supported: false,
			detail: `the endpoint returned ${alternatives.length} top-logprob alternatives at the score position, so there is no distribution to take an expectation over.`,
		};
	}
	const disallowed = [...new Set(alternatives.filter((token) => !allowed.has(token.trim())))];
	if (disallowed.length > 0) {
		return {
			supported: false,
			detail: `${disallowed.length} of ${alternatives.length} alternatives at the score position are outside the score alphabet (${disallowed
				.slice(0, 6)
				.map((token) => JSON.stringify(token))
				.join(", ")}), so the grammar was not applied and the scores would be arbitrary.`,
		};
	}
	return { supported: true, detail: `constrained to ${alternatives.length} score letters` };
}
