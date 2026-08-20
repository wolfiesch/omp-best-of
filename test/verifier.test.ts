import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertScoringSupported, evaluateScoringProbe, validateVerifierResult } from "../src/verifier";

const letters = ["A", " B", "C"];

describe("verifier scoring capability probe", () => {
	test("accepts a distribution constrained to score letters", () => {
		expect(evaluateScoringProbe({ emitted: "A", alternatives: ["A", " B", "C"], letters })).toEqual({
			supported: true,
			detail: "constrained to 3 score letters",
		});
	});

	test("rejects endpoint field errors", () => {
		expect(evaluateScoringProbe({ error: "400 unknown field" }).supported).toBe(false);
	});

	test("rejects an unconstrained emitted token", () => {
		expect(evaluateScoringProbe({ emitted: "word", alternatives: ["word", "A"], letters }).supported).toBe(false);
	});

	test("rejects alternatives outside the score alphabet", () => {
		expect(evaluateScoringProbe({ emitted: "A", alternatives: ["A", "word"], letters }).supported).toBe(false);
	});

	test("rejects a single sampled alternative", () => {
		expect(evaluateScoringProbe({ emitted: "A", alternatives: ["A"], letters }).supported).toBe(false);
	});
});

describe("verifier response contract", () => {
	const valid = {
		index: 1,
		scores: [0.2, 0.8],
		ranking: [1, 0],
		nComparisons: 1,
		criteria: ["Correctness"],
		usage: {
			calls: 1,
			input_tokens: 10,
			cached_input_tokens: 0,
			uncached_input_tokens: 10,
			output_tokens: 2,
			reasoning_tokens: 0,
			cache_hit_rate: 0,
		},
	};

	test("accepts a complete bounded result", () => {
		expect(validateVerifierResult(valid, 2, "logprob").index).toBe(1);
	});

	test("rejects out-of-range winners and non-finite scores", () => {
		expect(() => validateVerifierResult({ ...valid, index: 2 }, 2, "logprob")).toThrow("index must identify");
		expect(() => validateVerifierResult({ ...valid, scores: [0.2, Number.NaN] }, 2, "logprob")).toThrow("finite numbers");
	});

	test("rejects incomplete or duplicate rankings", () => {
		expect(() => validateVerifierResult({ ...valid, ranking: [1] }, 2, "logprob")).toThrow("contain 2");
		expect(() => validateVerifierResult({ ...valid, ranking: [1, 1] }, 2, "logprob")).toThrow("complete permutation");
	});
});

test("probes the native verifier transport instead of assuming it works", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-native-probe-"));
	const bridge = path.join(temporaryRoot, "bridge.ts");
	const previousPython = process.env.OMP_BEST_OF_PYTHON;
	const previousBridge = process.env.OMP_BEST_OF_VERIFIER_BRIDGE;
	try {
		await Bun.write(
			bridge,
			'#!/usr/bin/env bun\nif (!process.argv.includes("--probe-native")) process.exit(2);\nconsole.log(JSON.stringify({ ok: true }));\n',
		);
		await chmod(bridge, 0o755);
		process.env.OMP_BEST_OF_PYTHON = process.execPath;
		process.env.OMP_BEST_OF_VERIFIER_BRIDGE = bridge;
		await expect(
			assertScoringSupported({
				provider: "deepseek",
				model: "test",
				baseUrl: "https://api.deepseek.com",
				apiKey: "test",
				nativeScoreTags: true,
			}),
		).resolves.toBeUndefined();
	} finally {
		if (previousPython === undefined) delete process.env.OMP_BEST_OF_PYTHON;
		else process.env.OMP_BEST_OF_PYTHON = previousPython;
		if (previousBridge === undefined) delete process.env.OMP_BEST_OF_VERIFIER_BRIDGE;
		else process.env.OMP_BEST_OF_VERIFIER_BRIDGE = previousBridge;
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});

test("applies the configured timeout to the scoring capability probe", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-native-probe-timeout-"));
	const bridge = path.join(temporaryRoot, "bridge.ts");
	const previousPython = process.env.OMP_BEST_OF_PYTHON;
	const previousBridge = process.env.OMP_BEST_OF_VERIFIER_BRIDGE;
	try {
		// This crosses a subprocess boundary, so fake timers cannot drive the platform timeout.
		await Bun.write(bridge, "#!/usr/bin/env bun\nawait Bun.sleep(500);\nconsole.log(JSON.stringify({ ok: true }));\n");
		await chmod(bridge, 0o755);
		process.env.OMP_BEST_OF_PYTHON = process.execPath;
		process.env.OMP_BEST_OF_VERIFIER_BRIDGE = bridge;
		await expect(
			assertScoringSupported(
				{
					provider: "deepseek",
					model: "test",
					baseUrl: "https://api.deepseek.com",
					apiKey: "test",
					nativeScoreTags: true,
				},
				undefined,
				25,
			),
		).rejects.toThrow("Verifier timed out");
	} finally {
		if (previousPython === undefined) delete process.env.OMP_BEST_OF_PYTHON;
		else process.env.OMP_BEST_OF_PYTHON = previousPython;
		if (previousBridge === undefined) delete process.env.OMP_BEST_OF_VERIFIER_BRIDGE;
		else process.env.OMP_BEST_OF_VERIFIER_BRIDGE = previousBridge;
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});
