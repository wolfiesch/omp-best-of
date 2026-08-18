import { describe, expect, test } from "bun:test";
import { aggregatePairwiseJudgments, buildPairSchedule, parsePairwiseJudgment, sampledVerifierUsage } from "../src/sampled-verifier";

describe("sampled verifier pair schedule", () => {
	test("covers every unordered pair once per evaluation", () => {
		const schedule = buildPairSchedule(4, 2, 7);
		expect(schedule).toHaveLength(12);
		for (let evaluation = 0; evaluation < 2; evaluation += 1) {
			const pairs = schedule
				.filter(pair => pair.evaluation === evaluation)
				.map(pair => [Math.min(pair.a, pair.b), Math.max(pair.a, pair.b)].join("-"))
				.sort();
			expect(pairs).toEqual(["0-1", "0-2", "0-3", "1-2", "1-3", "2-3"]);
		}
	});

	test("is deterministic for a seed", () => {
		expect(buildPairSchedule(4, 2, 11)).toEqual(buildPairSchedule(4, 2, 11));
		expect(buildPairSchedule(4, 2, 11)).not.toEqual(buildPairSchedule(4, 2, 12));
	});
});

describe("sampled verifier response parsing", () => {
	test("reads the bounded probability and optional reason", () => {
		expect(parsePairwiseJudgment('```json\n{"probabilityA":72.5,"reason":"A covers the edge case"}\n```')).toEqual({
			probabilityA: 72.5,
			reason: "A covers the edge case",
		});
	});

	test("rejects malformed and out-of-range probabilities", () => {
		expect(() => parsePairwiseJudgment("not json")).toThrow("no JSON object");
		expect(() => parsePairwiseJudgment('{"probabilityA":101}')).toThrow("0 to 100");
		expect(() => parsePairwiseJudgment('{"probabilityA":"90"}')).toThrow("0 to 100");
	});
});

describe("sampled verifier aggregation", () => {
	test("ranks candidates by mean expected pairwise wins", () => {
		const result = aggregatePairwiseJudgments(3, 1, [
			{ evaluation: 0, a: 0, b: 1, probabilityA: 90, reason: "" },
			{ evaluation: 0, a: 0, b: 2, probabilityA: 80, reason: "" },
			{ evaluation: 0, a: 1, b: 2, probabilityA: 60, reason: "" },
		]);
		expect(result.index).toBe(0);
		expect(result.ranking).toEqual([0, 1, 2]);
		expect(result.scores[0]).toBeCloseTo(0.85);
		expect(result.scores[1]).toBeCloseTo(0.35);
		expect(result.scores[2]).toBeCloseTo(0.3);
		expect(result.nComparisons).toBe(3);
	});

	test("breaks exact ties by original candidate index", () => {
		const result = aggregatePairwiseJudgments(2, 1, [{ evaluation: 0, a: 1, b: 0, probabilityA: 50, reason: "" }]);
		expect(result.ranking).toEqual([0, 1]);
	});

	test("refuses incomplete comparison sets", () => {
		expect(() => aggregatePairwiseJudgments(3, 1, [])).toThrow("expected 3 comparisons");
	});
});

describe("sampled verifier usage", () => {
	test("includes preflight and comparison calls in one report", () => {
		const usage = sampledVerifierUsage([
			{
				requests: 1,
				inputTokens: 100,
				outputTokens: 10,
				reasoningTokens: 5,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				costUsd: 0.01,
			},
			{
				requests: 2,
				inputTokens: 50,
				outputTokens: 20,
				reasoningTokens: 10,
				cacheReadTokens: 150,
				cacheWriteTokens: 0,
				costUsd: 0.02,
			},
		]);
		expect(usage).toEqual({
			calls: 3,
			input_tokens: 300,
			cached_input_tokens: 150,
			uncached_input_tokens: 150,
			output_tokens: 30,
			reasoning_tokens: 15,
			cache_hit_rate: 0.5,
			reported_cost_usd: 0.03,
		});
	});
});
