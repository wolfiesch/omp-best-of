import { describe, expect, test } from "bun:test";
import { parseArgs, tokenize } from "../src/args";

describe("command arguments", () => {
	test("uses safe practical defaults", () => {
		const parsed = parseArgs(["fix", "the", "bug"]);
		expect(parsed).toMatchObject({
			task: "fix the bug",
			n: 3,
			generatorModel: "nous/deepseek/deepseek-v4-flash-0731",
			verifierModel: "deepseek-v4-flash",
			nEvaluations: 1,
			pivots: 2,
			apply: false,
		});
	});

	test("parses options and a quoted task", () => {
		const parsed = parseArgs(tokenize('--n 5 --evaluations 2 --apply "fix auth refresh"'));
		expect(parsed.n).toBe(5);
		expect(parsed.nEvaluations).toBe(2);
		expect(parsed.apply).toBe(true);
		expect(parsed.task).toBe("fix auth refresh");
	});

	test("rejects unknown options", () => {
		expect(() => parseArgs(["--mystery", "task"])).toThrow("Unknown option");
	});
});
