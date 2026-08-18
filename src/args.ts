export interface BestOfCliOptions {
	task: string;
	n: number;
	generatorModel: string;
	verifierModel: string;
	nEvaluations: number;
	pivots: number;
	maxTime: string;
	apply: boolean;
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
  --model <provider/model>  Candidate model (default: nous/deepseek/deepseek-v4-flash-0731)
  --verifier-model <model>  llm-verifier model (default: deepseek-v4-flash)
  --evaluations <n>         Repeated evaluations per criterion (default: 1)
  --pivots <n>              Probabilistic tournament pivots (default: 2)
  --max-time <duration>     Per-candidate limit, such as 20m (default: 20m)
  --seed <n>                Tournament seed (default: 0)
  --apply                   Apply the selected patch to the clean parent checkout
  --select-only             Rank and retain artifacts without applying (default)
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

function integer(value: string | undefined, flag: string): number {
	if (value === undefined || !/^\d+$/.test(value)) throw new Error(`${flag} requires an integer`);
	return Number(value);
}

export function parseArgs(args: string[]): BestOfCliOptions {
	const options: BestOfCliOptions = {
		task: "",
		n: 3,
		generatorModel: "nous/deepseek/deepseek-v4-flash-0731",
		verifierModel: "deepseek-v4-flash",
		nEvaluations: 1,
		pivots: 2,
		maxTime: "20m",
		apply: false,
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
			case "--n":
				options.n = integer(args[++index], arg);
				break;
			case "--model":
				options.generatorModel = args[++index] ?? "";
				break;
			case "--verifier-model":
				options.verifierModel = args[++index] ?? "";
				break;
			case "--evaluations":
				options.nEvaluations = integer(args[++index], arg);
				break;
			case "--pivots":
				options.pivots = integer(args[++index], arg);
				break;
			case "--max-time":
				options.maxTime = args[++index] ?? "";
				break;
			case "--seed":
				options.seed = integer(args[++index], arg);
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}
	options.task = task.join(" ").trim();
	if (!options.task) throw new Error(`A task is required.\n\n${HELP}`);
	if (!options.generatorModel) throw new Error("--model requires a value");
	if (!options.verifierModel) throw new Error("--verifier-model requires a value");
	if (!options.maxTime) throw new Error("--max-time requires a value");
	return options;
}
