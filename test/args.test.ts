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
		const parsed = parseArgs([
			"--verifier-backend",
			"sampled",
			"--verifier-model",
			"openai-codex/gpt-5.6-luna",
			"task",
		]);
		expect(parsed.verifierBackend).toBe("sampled");
		expect(parsed.verifierModel).toBe("openai-codex/gpt-5.6-luna");
		expect(parseArgs(["--verifier-backend", "sampled", "--verifier-thinking", "high", "task"]).verifierThinking).toBe("high");
		expect(() => parseArgs(["--verifier-backend", "unknown", "task"])).toThrow("--verifier-backend must be logprob or sampled");
	});

	test("rejects unknown options", () => {
		expect(() => parseArgs(["--mystery", "task"])).toThrow("Unknown option");
	});
});
