import { expect, test } from "bun:test";
import {
	benchmarkCachePolicy,
	buildBenchmarkManifest,
	canonicalizeJson,
	sanitizeBenchmarkArgv,
	sanitizeBenchmarkOptions,
	sha256Canonical,
} from "../bench/manifest";
import { projectScorecardVerifier } from "../bench/run";
import type { VerifierResult } from "../src/types";

const REPOSITORY_ROOT = "/Users/benchmark/work/omp-best-of";

const manifestInput = {
	runId: "2026-08-18T12-00-00-000Z",
	repositoryRoot: REPOSITORY_ROOT,
	source: { sha: "06eefab", dirty: false },
	omp: {
		resolvedPath: "/Users/benchmark/.local/bin/omp",
		sha256: "a".repeat(64),
		version: "omp 17.3.4",
	},
	runtime: { bunVersion: "1.3.14", platform: "darwin arm64" },
	parsedOptions: {
		tasks: ["interval-merge", "json-patch"],
		n: 4,
		label: "evidence",
		fixturePath: "/Users/benchmark/work/omp-best-of/bench/tasks",
	},
	taskIds: ["interval-merge", "json-patch"],
	mode: "live-generation",
	reuseRunId: "",
	intendedArtifactRoot: "/Users/benchmark/work/omp-best-of/bench/results/2026-08-18T12-00-00-000Z",
	argv: ["--tasks", "interval-merge,json-patch", "--label", "evidence"],
	startedAt: "2026-08-18T12:00:00.000Z",
};

test("canonical JSON and identity hashing ignore object insertion order", () => {
	const first = { options: { n: 4, backend: "logprob" }, taskIds: ["a", "b"] };
	const second = { taskIds: ["a", "b"], options: { backend: "logprob", n: 4 } };
	expect(canonicalizeJson(first)).toBe(canonicalizeJson(second));
	expect(sha256Canonical(first)).toBe(sha256Canonical(second));

	const firstManifest = buildBenchmarkManifest(manifestInput);
	const secondManifest = buildBenchmarkManifest({
		...manifestInput,
		parsedOptions: {
			fixturePath: manifestInput.parsedOptions.fixturePath,
			label: "evidence",
			n: 4,
			tasks: ["interval-merge", "json-patch"],
		},
	});
	expect(firstManifest.identitySha256).toBe(secondManifest.identitySha256);
});

test("sanitizes secrets and normalizes retained argument paths", () => {
	const argv = sanitizeBenchmarkArgv(
		[
			"--api-key",
			"sk-live-secret",
			"--config=/Users/benchmark/work/omp-best-of/bench/config.json",
			"/Users/benchmark/.config/omp/settings.json",
		],
		REPOSITORY_ROOT,
	);
	const options = sanitizeBenchmarkOptions(
		{ apiKey: "sk-live-secret", taskPath: "/Users/benchmark/work/omp-best-of/bench/tasks", homePath: "/Users/benchmark/.config/omp" },
		REPOSITORY_ROOT,
	);
	expect(argv).toEqual(["--api-key", "[REDACTED]", "--config=bench/config.json", "[external]/settings.json"]);
	expect(options).toEqual({ apiKey: "[REDACTED]", taskPath: "bench/tasks", homePath: "[external]/omp" });
});

test("records distinct fresh and reuse cache policies", () => {
	expect(benchmarkCachePolicy("")).toEqual({
		applicationCache: { state: "fresh", sourceRunId: null },
		providerCache: { state: "uncontrolled" },
		generationReuse: { state: "fresh", sourceRunId: null },
	});
	expect(benchmarkCachePolicy("prior-run")).toEqual({
		applicationCache: { state: "reuse", sourceRunId: "prior-run" },
		providerCache: { state: "uncontrolled" },
		generationReuse: { state: "reused", sourceRunId: "prior-run" },
	});
});

test("never persists absolute home paths in manifest argv or options", () => {
	const manifest = buildBenchmarkManifest({
		...manifestInput,
		argv: ["--label=/Users/benchmark/private", "--token=secret-value"],
		parsedOptions: { ...manifestInput.parsedOptions, outputPath: "/Users/benchmark/private" },
	});
	const persisted = JSON.stringify(manifest);
	expect(persisted).not.toContain("/Users/benchmark");
	expect(manifest.externalWrapperTimeout).toBe("unrecorded");
});

test("serializes sampled verifier retry attribution without adding it to logprob records", () => {
	const auditAttempts = {
		totalAttempts: 5,
		acceptedAttempts: 4,
		discardedAttempts: 1,
		errorAttempts: 1,
		providerRequests: 12,
		byCandidateRound: { "0|0": 2, "0|1": 1, "1|0": 1, "1|1": 1 },
	};
	const sampledVerifier: VerifierResult = {
		backend: "sampled",
		index: 1,
		scores: [0.25, 0.75],
		ranking: [1, 0],
		nComparisons: 2,
		criteria: ["correctness"],
		usage: {
			calls: 5,
			input_tokens: 10,
			cached_input_tokens: 2,
			uncached_input_tokens: 8,
			output_tokens: 4,
			reasoning_tokens: 1,
			cache_hit_rate: 0.2,
			reported_cost_usd: 0.01,
		},
		auditAttempts,
	};
	const logprobVerifier: VerifierResult = {
		...sampledVerifier,
		backend: "logprob",
	};
	delete logprobVerifier.auditAttempts;

	expect(JSON.stringify(projectScorecardVerifier(sampledVerifier))).toBe(
		JSON.stringify({
			backend: sampledVerifier.backend,
			index: sampledVerifier.index,
			scores: sampledVerifier.scores,
			ranking: sampledVerifier.ranking,
			nComparisons: sampledVerifier.nComparisons,
			criteria: sampledVerifier.criteria,
			usage: sampledVerifier.usage,
			auditAttempts,
		}),
	);
	expect(projectScorecardVerifier(logprobVerifier)).not.toHaveProperty("auditAttempts");
});
