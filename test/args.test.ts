import { describe, expect, test } from "bun:test";
import { parseArgs, tokenize } from "../src/args";

describe("command arguments", () => {
	test("inherits model and thinking, and provider-qualifies the verifier", () => {
		const parsed = parseArgs(["fix", "the", "bug"]);
		expect(parsed).toMatchObject({
			task: "fix the bug",
			n: 3,
			// Empty means the caller's model, resolved by whoever knows the session.
			generatorModel: "",
			thinking: "",
			// Provider-qualified: eight providers ship this model id.
			verifierModel: "deepseek/deepseek-v4-flash",
			verifierBackend: "logprob",
			verifierThinking: "low",
			nEvaluations: 1,
			pivots: 2,
			apply: false,
		});
	});

	test("an explicit model overrides inheritance", () => {
		expect(parseArgs(tokenize("--model openai/gpt-5.5 --thinking high task")).generatorModel).toBe("openai/gpt-5.5");
		expect(() => parseArgs(["--model"])).toThrow("--model requires a value");
	});

	test("parses options and a quoted task", () => {
		const parsed = parseArgs(tokenize('--n 5 --evaluations 2 --apply "fix auth refresh"'));
		expect(parsed.n).toBe(5);
		expect(parsed.nEvaluations).toBe(2);
		expect(parsed.apply).toBe(true);
		expect(parsed.task).toBe("fix auth refresh");
	});

	test("selects the subscription-backed sampled verifier", () => {
		const parsed = parseArgs(["--verifier-backend", "sampled", "--verifier-model", "provider/test-model", "task"]);
		expect(parsed.verifierBackend).toBe("sampled");
		expect(parsed.verifierModel).toBe("provider/test-model");
		expect(parseArgs(["--verifier-backend", "sampled", "--verifier-thinking", "high", "task"]).verifierThinking).toBe("high");
		expect(() => parseArgs(["--verifier-backend", "unknown", "task"])).toThrow("--verifier-backend must be logprob or sampled");
	});

	test("rejects unknown options", () => {
		expect(() => parseArgs(["--mystery", "task"])).toThrow("Unknown option");
	});

	test("treats --help after the delimiter as task text", () => {
		expect(parseArgs(["--", "explain", "--help"]).task).toBe("explain --help");
	});

	test("rejects another flag where an option value is required", () => {
		expect(() => parseArgs(["--model", "--apply", "task"])).toThrow("--model requires a value");
		expect(() => parseArgs(["--max-time", "--apply", "task"])).toThrow("--max-time requires a value");
	});

	test("rejects unsafe integer options", () => {
		expect(() => parseArgs(["--evaluations", "999999999999999999999999999999", "task"])).toThrow("--evaluations requires a safe integer");
	});

	test("rejects invalid durations during argument parsing", () => {
		expect(() => parseArgs(["--max-time", "nonsense", "task"])).toThrow("Invalid max time: nonsense");
	});
});
