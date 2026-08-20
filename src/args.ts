import type { VerifierBackend } from "./types";

export interface BestOfCliOptions {
	task: string;
	n: number;
	generatorModel: string;
	verifierModel: string;
	verifierBackend: VerifierBackend;
	verifierThinking: string;
	verifierTimeout: string;
	nEvaluations: number;
	pivots: number;
	maxTime: string;
	thinking: string;
	apply: boolean;
	verify: boolean;
	seed: number;
}

export const DEFAULT_CRITERIA: Record<string, string> = {
	Requirements: "Does the resulting repository state satisfy every explicit requirement in the task?",
	Correctness: "Do the implementation and observed tool outputs support that the change is correct, including important edge cases?",
	Verification: "Did the agent run relevant validation and interpret its results accurately without hiding failures?",
};

export const HELP = `OMP Best Of

Usage:
  /best-of [options] <task>
  omp-best-of [options] -- <task>

Options:
  --n <2-8>                 Number of isolated candidates (default: 3)
  --model <provider/model>  Candidate model (default: the calling session's model)
  --verifier-model <model>  Verifier model selector (default: deepseek/deepseek-v4-flash)
  --verifier-backend <mode> logprob or sampled (default: logprob)
  --verifier-thinking <level> Sampled-verifier thinking level (default: low)
  --verifier-timeout <duration> Per-verifier-call limit, such as 2m or 10m (default: 2m)
  --evaluations <n>         Logprob repetitions or sampled pairwise rounds (default: 1)
  --pivots <n>              Probabilistic pivots for the logprob backend (default: 2)
  --max-time <duration>     Per-candidate limit, such as 20m (default: 20m)
  --thinking <level>        Candidate thinking level (default: the calling session's level)
  --seed <n>                Tournament seed (default: 0)
  --apply                   Apply the selected patch to the clean parent checkout
  --select-only             Rank and retain artifacts without applying (default)
  --no-verify               Generate and retain candidates without ranking them
  --help                    Show this help
`;

export function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;
	for (const char of input) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (quote) throw new Error("Unterminated quote in command arguments");
	if (escaped) current += "\\";
	if (current) tokens.push(current);
	return tokens;
}

function requiredValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
	return value;
}

function integer(value: string, flag: string): number {
	if (!/^\d+$/.test(value)) throw new Error(`${flag} requires an integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error(`${flag} requires a safe integer`);
	return parsed;
}

export function parseDurationMs(value: string, label = "max time"): number {
	const match = /^(\d+)(s|m|h)?$/.exec(value.trim());
	if (!match) throw new Error(`Invalid ${label}: ${value}`);
	const amount = Number(match[1]);
	const multiplier = match[2] === "h" ? 3_600_000 : match[2] === "m" ? 60_000 : 1_000;
	const duration = amount * multiplier;
	if (!Number.isSafeInteger(duration)) throw new Error(`Invalid ${label}: ${value}`);
	return duration;
}

export function parseArgs(args: string[]): BestOfCliOptions {
	const options: BestOfCliOptions = {
		task: "",
		n: 3,
		generatorModel: "",
		verifierModel: "deepseek/deepseek-v4-flash",
		verifierBackend: "logprob",
		verifierThinking: "low",
		verifierTimeout: "2m",
		nEvaluations: 1,
		pivots: 2,
		maxTime: "20m",
		thinking: "",
		apply: false,
		verify: true,
		seed: 0,
	};
	const task: string[] = [];
	let parsingOptions = true;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (parsingOptions && arg === "--") {
			parsingOptions = false;
			continue;
		}
		if (!parsingOptions || !arg.startsWith("--")) {
			task.push(arg);
			continue;
		}
		switch (arg) {
			case "--help":
				throw new Error(HELP);
			case "--apply":
				options.apply = true;
				break;
			case "--select-only":
				options.apply = false;
				break;
			case "--no-verify":
				options.verify = false;
				break;
			case "--n":
				options.n = integer(requiredValue(args, index, arg), arg);
				index += 1;
				break;
			case "--model":
				options.generatorModel = requiredValue(args, index, arg);
				index += 1;
				break;
			case "--verifier-model":
				options.verifierModel = requiredValue(args, index, arg);
				index += 1;
				break;
			case "--verifier-backend": {
				const backend = requiredValue(args, index, arg);
				if (backend !== "logprob" && backend !== "sampled") throw new Error("--verifier-backend must be logprob or sampled");
				options.verifierBackend = backend;
				index += 1;
				break;
			}
			case "--verifier-thinking":
				options.verifierThinking = requiredValue(args, index, arg);
				index += 1;
				break;
			case "--verifier-timeout":
				options.verifierTimeout = requiredValue(args, index, arg);
				parseDurationMs(options.verifierTimeout, "verifier timeout");
				index += 1;
				break;
			case "--evaluations":
				options.nEvaluations = integer(requiredValue(args, index, arg), arg);
				index += 1;
				break;
			case "--pivots":
				options.pivots = integer(requiredValue(args, index, arg), arg);
				index += 1;
				break;
			case "--max-time":
				options.maxTime = requiredValue(args, index, arg);
				parseDurationMs(options.maxTime);
				index += 1;
				break;
			case "--thinking":
				options.thinking = requiredValue(args, index, arg);
				index += 1;
				break;
			case "--seed":
				options.seed = integer(requiredValue(args, index, arg), arg);
				index += 1;
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}
	options.task = task.join(" ").trim();
	if (!options.task) throw new Error(`A task is required.\n\n${HELP}`);
	if (!options.verifierModel) throw new Error("--verifier-model requires a value");
	if (!options.maxTime) throw new Error("--max-time requires a value");
	if (!options.verifierTimeout) throw new Error("--verifier-timeout requires a value");
	return options;
}
