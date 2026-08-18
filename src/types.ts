import type { ModelSource } from "./model";

export type VerifierBackend = "logprob" | "sampled";

export interface BestOfOptions {
	cwd: string;
	task: string;
	n: number;
	/** Candidate model selector; empty inherits the caller's default model. */
	generatorModel: string;
	verifierModel: string;
	verifierBackend: VerifierBackend;
	/** Sampled-verifier thinking level; empty uses the verifier's low-cost default. */
	verifierThinking: string;
	nEvaluations: number;
	pivots: number;
	maxTime: string;
	/** Candidate thinking level passed through to `omp --thinking`; empty keeps the model default. */
	thinking: string;
	apply: boolean;
	/** When false, candidates are generated and retained but nothing ranks them. */
	verify: boolean;
	seed: number;
	criteria: Record<string, string>;
	onProgress?: (progress: BestOfProgress) => void;
	/** Registry the verifier credential is resolved through; omitted builds one on demand. */
	modelSource?: ModelSource;
}

export type BestOfPhase = "preparing" | "generating" | "verifying" | "applying" | "cleaning";

export interface BestOfProgress {
	phase: BestOfPhase;
	completedCandidates: number;
	totalCandidates: number;
	message: string;
}

export interface UsageSummary {
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	costUsd: number;
}

export interface CandidateResult {
	index: number;
	worktree: string;
	exitCode: number;
	durationMs: number;
	transcript: string;
	recordedToolEvidence: string;
	finalResponse: string;
	patch: string;
	stderr: string;
	usage: UsageSummary;
	artifactDir: string;
}

export interface VerifierUsage {
	calls: number;
	input_tokens: number;
	cached_input_tokens: number;
	uncached_input_tokens: number;
	output_tokens: number;
	reasoning_tokens: number;
	cache_hit_rate: number;
	reported_cost_usd?: number;
}

export interface VerifierResult {
	backend: VerifierBackend;
	index: number;
	scores: number[];
	ranking: number[];
	nComparisons: number;
	criteria: string[];
	usage: VerifierUsage;
}

export interface BestOfResult {
	runId: string;
	artifactDir: string;
	winner: CandidateResult;
	candidates: CandidateResult[];
	verifier: VerifierResult | null;
	applied: boolean;
	durationMs: number;
}
