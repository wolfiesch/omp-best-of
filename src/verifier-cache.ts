import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { ensurePrivateDirectory, secureExistingFile } from "./artifacts";
import {
	buildCandidateAuditPrompt,
	buildPairwisePrompt,
	SAMPLED_VERIFIER_CACHE_VERSION,
	SAMPLED_VERIFIER_PROMPT_VERSION,
	SAMPLED_VERIFIER_SETTINGS,
} from "./sampled-verifier";
import type { SampledVerifierCacheReference } from "./types";

export const SAMPLED_VERIFIER_CACHE_SCHEMA_VERSION = SAMPLED_VERIFIER_CACHE_VERSION;

export interface SampledVerifierCacheIdentity {
	repositoryHead: string;
	task: string;
	criteria: Record<string, string>;
	candidates: string[];
	model: string;
	thinking?: string;
	nEvaluations: number;
	seed: number;
	candidateTools: boolean[];
}

export interface SharedSampledVerifierCache {
	path: string;
	reference: SampledVerifierCacheReference;
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([key, entry]) => [key, canonicalize(entry)]),
		);
	}
	return value;
}

function promptIdentity(): Record<string, string> {
	const input = {
		problem: "",
		candidates: ["", ""],
		criteria: {},
		model: "",
		nEvaluations: 1,
		seed: 0,
		cachePath: "",
	};
	return {
		auditInitial: buildCandidateAuditPrompt(input, 0),
		auditChallenge: buildCandidateAuditPrompt(input, 0, [{ probabilityPass: 0, findings: [], summary: "" }]),
		pairwise: buildPairwisePrompt(input, { evaluation: 0, a: 0, b: 1 }),
	};
}

/** Builds a stable digest from every input that can affect sampled-verifier output. */
export function buildSampledVerifierCacheKey(identity: SampledVerifierCacheIdentity): string {
	const keyMaterial = {
		cacheSchemaVersion: SAMPLED_VERIFIER_CACHE_SCHEMA_VERSION,
		promptVersion: SAMPLED_VERIFIER_PROMPT_VERSION,
		repositoryHead: identity.repositoryHead,
		task: identity.task,
		criteria: identity.criteria,
		candidates: identity.candidates,
		model: identity.model,
		thinking: identity.thinking || SAMPLED_VERIFIER_SETTINGS.thinking,
		nEvaluations: identity.nEvaluations,
		seed: identity.seed,
		candidateTools: identity.candidateTools,
		prompts: promptIdentity(),
		settings: SAMPLED_VERIFIER_SETTINGS,
	};
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(keyMaterial)))
		.digest("hex");
}

export function sampledVerifierCacheDirectory(
	agentDirectory = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".omp", "agent"),
): string {
	return path.join(agentDirectory, "best-of", "cache", "sampled");
}

export function sampledVerifierCachePath(identity: SampledVerifierCacheIdentity, agentDirectory?: string): string {
	return path.join(sampledVerifierCacheDirectory(agentDirectory), `${buildSampledVerifierCacheKey(identity)}.json`);
}

/** Prepares the shared, private cache location without recording its local path in public metadata. */
export async function prepareSharedSampledVerifierCache(
	identity: SampledVerifierCacheIdentity,
	agentDirectory?: string,
): Promise<SharedSampledVerifierCache> {
	const key = buildSampledVerifierCacheKey(identity);
	const directory = sampledVerifierCacheDirectory(agentDirectory);
	const cachePath = path.join(directory, `${key}.json`);
	await ensurePrivateDirectory(directory);
	await secureExistingFile(cachePath);
	return { path: cachePath, reference: { key, shared: true } };
}
