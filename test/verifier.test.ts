import { describe, expect, test } from "bun:test";
import { evaluateScoringProbe } from "../src/verifier";

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
