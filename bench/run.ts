#!/usr/bin/env bun
/**
 * Selection benchmark for OMP Best Of.
 *
 * Generation is the only expensive part of a Best-of-N run, so this harness pays for it
 * once per task and stores the whole candidate pool. Labels come from a hidden oracle the
 * candidate agents never see. From one pool it reports three numbers on the same tasks:
 *
 *   random pass@1  expected result of keeping one candidate at random
 *   verifier       result of keeping the candidate the verifier ranks first
 *   oracle pass@N  result of keeping the best candidate in the pool, the available headroom
 *
 * `--reuse <run-id>` re-ranks a stored pool with different verifier settings and pays only
 * for verification, which is what makes sweeps cheap.
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CRITERIA } from "../src/args";
import type { ModelSource, VerifierEndpoint } from "../src/model";
import { createModelSource, resolveVerifierEndpoint } from "../src/model";
import { requireCommand, runCommand } from "../src/process";
import { composeSampledVerifierEvidence, composeVerifierTrajectory, runBestOf } from "../src/runner";
import type { UsageSummary, VerifierBackend, VerifierResult } from "../src/types";
import { verifyCandidates } from "../src/verifier";
import { SAMPLED_VERIFIER_SETTINGS, verifyCandidatesSampled } from "../src/sampled-verifier";
import { ORACLE_TIMEOUT_MS, prepareTaskRepo, rescoreCandidates, scoreCandidate } from "./oracle";

const BENCH_ROOT = import.meta.dir;
const REPO_ROOT = path.resolve(BENCH_ROOT, "..");
const TASKS_ROOT = path.join(BENCH_ROOT, "tasks");
const RESULTS_ROOT = path.join(BENCH_ROOT, "results");

/** DeepSeek list prices in USD per million tokens, from the OMP catalog entry for deepseek-v4-flash. */
const VERIFIER_PRICE_PER_MTOK = { uncachedInput: 0.14, cachedInput: 0.0028, output: 0.28 };

const HELP = `OMP Best Of selection benchmark

Usage:
  bun bench/run.ts [options]

Options:
  --tasks <a,b>            Task ids to run (default: every directory in bench/tasks)
  --n <2-8>                Candidates per task (default: 4)
  --model <provider/model> Candidate model (default: nous/deepseek/deepseek-v4-flash-0731)
  --verifier-model <model> Verifier model selector (default: deepseek/deepseek-v4-flash)
  --verifier-backend <mode> logprob or sampled (default: logprob)
  --verifier-thinking <level> Sampled-verifier thinking level (default: low)
  --evaluations <n>        Logprob repetitions or sampled pairwise rounds (default: 1)
  --pivots <n>             Tournament pivots for the logprob backend (default: 2)
  --max-time <duration>    Per-candidate limit (default: 5m)
  --thinking <level>       Candidate thinking level, such as off or high (default: model default)
  --hide-tests             Ship the fixture without its visible tests; the oracle still decides
  --seed <n>               Tournament seed (default: 0)
  --label <text>           Free-form label stored in the scorecard
  --reuse <run-id>         Re-rank the stored pool of an earlier run, no generation
  --generate-only          Build and store pools without ranking them, no verifier cost
  --help                   Show this help
`;

interface BenchOptions {
	tasks: string[];
	n: number;
	generatorModel: string;
	verifierModel: string;
	verifierBackend: VerifierBackend;
	verifierThinking: string;
	nEvaluations: number;
	pivots: number;
	maxTime: string;
	thinking: string;
	visibleTests: boolean;
	seed: number;
	label: string;
	reuse: string;
	generateOnly: boolean;
}

interface PoolCandidate {
	index: number;
	exitCode: number;
	durationMs: number;
	recordedToolEvidence?: string;
	patch: string;
	transcript: string;
	stderr: string;
	usage: UsageSummary;
	passed: boolean;
	oracleDetail: string;
}

interface TaskPool {
	taskId: string;
	prompt: string;
	generatedBy: { runId: string; model: string; maxTime: string; n: number; thinking: string; visibleTests: boolean };
	durationMs: number;
	candidates: PoolCandidate[];
}

interface TaskOutcome {
	taskId: string;
	candidates: number;
	eligible: number;
	passedCandidates: number;
	emptyPatchCandidates: number;
	randomPass1: number;
	oraclePass: boolean;
	verifierIndex: number | null;
	verifierPass: boolean | null;
	discriminating: boolean;
	scoreSpread: number;
	generationUsd: number;
	verifierUsd: number;
	verifier: VerifierResult | null;
	wallClockMs: number;
}

function integer(value: string | undefined, flag: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) throw new Error(`${flag} requires an integer`);
	return parsed;
}

function parseArgs(argv: string[]): BenchOptions {
	const options: BenchOptions = {
		tasks: [],
		n: 4,
		generatorModel: "nous/deepseek/deepseek-v4-flash-0731",
		verifierModel: "deepseek/deepseek-v4-flash",
		verifierBackend: "logprob",
		verifierThinking: "low",
		nEvaluations: 1,
		pivots: 2,
		maxTime: "5m",
		thinking: "",
		visibleTests: true,
		seed: 0,
		label: "",
		reuse: "",
		generateOnly: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case "--tasks":
				options.tasks = (argv[++index] ?? "").split(",").map(id => id.trim()).filter(Boolean);
				break;
			case "--n":
				options.n = integer(argv[++index], "--n");
				break;
			case "--model":
				options.generatorModel = argv[++index] ?? "";
				break;
			case "--verifier-model":
				options.verifierModel = argv[++index] ?? "";
				break;
			case "--verifier-backend": {
				const backend = argv[++index];
				if (backend !== "logprob" && backend !== "sampled") throw new Error("--verifier-backend must be logprob or sampled");
				options.verifierBackend = backend;
				break;
			}
			case "--verifier-thinking":
				options.verifierThinking = argv[++index] ?? "";
				if (!options.verifierThinking) throw new Error("--verifier-thinking requires a value");
				break;
			case "--evaluations":
				options.nEvaluations = integer(argv[++index], "--evaluations");
				break;
			case "--pivots":
				options.pivots = integer(argv[++index], "--pivots");
				break;
			case "--max-time":
				options.maxTime = argv[++index] ?? "";
				break;
			case "--seed":
				options.seed = integer(argv[++index], "--seed");
				break;
			case "--thinking":
				options.thinking = argv[++index] ?? "";
				break;
			case "--hide-tests":
				options.visibleTests = false;
				break;
			case "--label":
				options.label = argv[++index] ?? "";
				break;
			case "--reuse":
				options.reuse = argv[++index] ?? "";
				break;
			case "--generate-only":
				options.generateOnly = true;
				break;
			default:
				throw new Error(`Unknown option: ${arg}\n\n${HELP}`);
		}
	}
	return options;
}

function verifierUsd(verifier: VerifierResult | null): number {
	if (!verifier) return 0;
	if (verifier.backend === "sampled") return verifier.usage.reported_cost_usd ?? 0;
	const { uncached_input_tokens, cached_input_tokens, output_tokens } = verifier.usage;
	return (
		(uncached_input_tokens * VERIFIER_PRICE_PER_MTOK.uncachedInput +
			cached_input_tokens * VERIFIER_PRICE_PER_MTOK.cachedInput +
			output_tokens * VERIFIER_PRICE_PER_MTOK.output) /
		1_000_000
	);
}

async function materializeAuditRepo(pool: TaskPool, candidate: PoolCandidate): Promise<string | null> {
	const repoDir = await prepareTaskRepo(
		path.join(TASKS_ROOT, pool.taskId),
		pool.generatedBy.visibleTests,
	);
	if (!candidate.patch.trim()) return repoDir;
	const patchPath = path.join(repoDir, ".candidate.patch");
	try {
		await Bun.write(patchPath, candidate.patch);
		await requireCommand(["git", "apply", "--binary", patchPath], repoDir);
		return repoDir;
	} catch {
		await rm(repoDir, { recursive: true, force: true });
		return null;
	} finally {
		await rm(patchPath, { force: true });
	}
}

async function rankPool(
	pool: TaskPool,
	options: BenchOptions,
	cachePath: string,
	endpoint: VerifierEndpoint | null,
): Promise<{ verifier: VerifierResult | null; eligible: PoolCandidate[] }> {
	const eligible = pool.candidates.filter(candidate => candidate.exitCode === 0);
	if (eligible.length < 2) return { verifier: null, eligible };
	const common = {
		problem: pool.prompt,
		criteria: DEFAULT_CRITERIA,
		nEvaluations: options.nEvaluations,
		seed: options.seed,
		cachePath,
	};
	if (options.verifierBackend !== "sampled") {
		const verifier = await verifyCandidates({
			...common,
			candidates: eligible.map(composeVerifierTrajectory),
			endpoint: endpoint!,
			pivots: Math.min(options.pivots, eligible.length),
		});
		return { verifier, eligible };
	}
	const candidateCwds = await Promise.all(eligible.map(candidate => materializeAuditRepo(pool, candidate)));
	try {
		const verifier = await verifyCandidatesSampled({
			...common,
			candidates: eligible.map(composeSampledVerifierEvidence),
			model: options.verifierModel,
			thinking: options.verifierThinking,
			cwd: REPO_ROOT,
			candidateCwds,
		});
		return { verifier, eligible };
	} finally {
		await Promise.all(candidateCwds.map(candidateCwd =>
			candidateCwd ? rm(candidateCwd, { recursive: true, force: true }) : Promise.resolve(),
		));
	}
}

function summarize(pool: TaskPool, eligible: PoolCandidate[], verifier: VerifierResult | null, wallClockMs: number, ranked: boolean): TaskOutcome {
	const passedCandidates = pool.candidates.filter(candidate => candidate.passed).length;
	// Without a tournament there is no pick. Falling back to the first candidate would
	// report the pool order as a selection and inflate the verifier column.
	const selected = !ranked ? null : verifier ? eligible[verifier.index] : (eligible[0] ?? null);
	return {
		taskId: pool.taskId,
		candidates: pool.candidates.length,
		eligible: eligible.length,
		passedCandidates,
		// A pool of no-ops is degenerate: every number below is about the agent quitting, not about selection.
		emptyPatchCandidates: pool.candidates.filter(candidate => candidate.patch.trim() === "").length,
		randomPass1: pool.candidates.length === 0 ? 0 : passedCandidates / pool.candidates.length,
		oraclePass: passedCandidates > 0,
		verifierIndex: selected ? selected.index : null,
		verifierPass: selected ? selected.passed : null,
		discriminating: passedCandidates > 0 && passedCandidates < pool.candidates.length,
		// Near-zero separation means every pairwise comparison tied, so the pick carries no information.
		scoreSpread: verifier ? Math.max(...verifier.scores) - Math.min(...verifier.scores) : 0,
		generationUsd: pool.candidates.reduce((sum, candidate) => sum + candidate.usage.costUsd, 0),
		verifierUsd: verifierUsd(verifier),
		verifier,
		wallClockMs,
	};
}

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(hits: number, total: number): number {
	return total === 0 ? 0 : hits / total;
}

function aggregate(outcomes: TaskOutcome[]) {
	const discriminating = outcomes.filter(outcome => outcome.discriminating);
	const scope = (subset: TaskOutcome[]) => ({
		tasks: subset.length,
		randomPass1: mean(subset.map(outcome => outcome.randomPass1)),
		verifierPass: rate(
			subset.filter(outcome => outcome.verifierPass === true).length,
			subset.filter(outcome => outcome.verifierPass !== null).length,
		),
		ranked: subset.filter(outcome => outcome.verifierPass !== null).length,
		oraclePassN: rate(subset.filter(outcome => outcome.oraclePass).length, subset.length),
	});
	const generationUsd = outcomes.reduce((sum, outcome) => sum + outcome.generationUsd, 0);
	const verifierCostUsd = outcomes.reduce((sum, outcome) => sum + outcome.verifierUsd, 0);
	const candidateRuns = outcomes.reduce((sum, outcome) => sum + outcome.candidates, 0);
	return {
		all: scope(outcomes),
		discriminating: scope(discriminating),
		cost: {
			generationUsd,
			verifierCostUsd,
			totalUsd: generationUsd + verifierCostUsd,
			perCandidateUsd: candidateRuns === 0 ? 0 : generationUsd / candidateRuns,
			perTaskUsd: outcomes.length === 0 ? 0 : (generationUsd + verifierCostUsd) / outcomes.length,
			verifierShareOfTotal: generationUsd + verifierCostUsd === 0 ? 0 : verifierCostUsd / (generationUsd + verifierCostUsd),
			candidateRuns,
		},
		latency: {
			taskWallClockMsMean: mean(outcomes.map(outcome => outcome.wallClockMs)),
			taskWallClockMsMax: Math.max(0, ...outcomes.map(outcome => outcome.wallClockMs)),
		},
	};
}

async function environment(mode: string, options: BenchOptions) {
	const sourceHash = (await requireCommand(["git", "rev-parse", "HEAD"], REPO_ROOT)).trim();
	const dirty = (await requireCommand(["git", "status", "--porcelain=v1"], REPO_ROOT)).trim().length > 0;
	const ompCommand = process.env.OMP_BEST_OF_OMP_BIN ?? "omp";
	const ompPath = ompCommand.includes(path.sep) ? ompCommand : (await runCommand(["which", ompCommand])).stdout.trim();
	const ompVersion = (await runCommand([ompPath || ompCommand, "--version"])).stdout.trim();
	const ompBinaryHash = ompPath ? (await runCommand(["shasum", "-a", "256", ompPath])).stdout.trim().split(/\s+/)[0] : "";
	return {
		mode,
		sourceHash,
		sourceDirty: dirty,
		builtHash: ompBinaryHash,
		buildMode: "local",
		ompVersion,
		bunVersion: Bun.version,
		platform: `${os.platform()} ${os.arch()}`,
		generatorModel: options.generatorModel,
		verifierModel: options.verifierModel,
		verifierBackend: options.verifierBackend,
		n: options.n,
		nEvaluations: options.nEvaluations,
		pivots: options.pivots,
		seed: options.seed,
		maxTimePerCandidate: options.maxTime,
		candidateThinking: options.thinking || "model default",
		visibleTestsInFixture: options.visibleTests,
		oracleTimeoutMs: ORACLE_TIMEOUT_MS,
		iterationsPerTask: 1,
		warmupsDiscarded: 0,
		verifierPricePerMtok: options.verifierBackend === "logprob" ? VERIFIER_PRICE_PER_MTOK : null,
		sampledVerifierSettings: options.verifierBackend === "sampled"
			? { ...SAMPLED_VERIFIER_SETTINGS, thinking: options.verifierThinking }
			: null,
		oracleLabels: options.reuse ? "rescored against current oracle before ranking" : "scored during generation",
		label: options.label,
		startedAt: new Date().toISOString(),
	};
}

/** Reports the generator settings the pools were actually produced with, or "mixed" when they disagree. */
function generatorFacts(generation: TaskPool["generatedBy"][]) {
	const agree = <T>(pick: (entry: TaskPool["generatedBy"]) => T): T | "mixed" => {
		const values = new Set(generation.map(entry => JSON.stringify(pick(entry))));
		return values.size === 1 ? pick(generation[0]) : "mixed";
	};
	if (generation.length === 0) return {};
	return {
		generatorModel: agree(entry => entry.model),
		candidateThinking: agree(entry => entry.thinking),
		visibleTestsInFixture: agree(entry => entry.visibleTests),
		n: agree(entry => entry.n),
		maxTimePerCandidate: agree(entry => entry.maxTime),
	};
}

function markdown(scorecard: Record<string, unknown>, outcomes: TaskOutcome[], summary: ReturnType<typeof aggregate>): string {
	const env = scorecard.environment as Awaited<ReturnType<typeof environment>>;
	const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
	const usd = (value: number) => `$${value.toFixed(4)}`;
	const reuse = env.mode.startsWith("reuse");
	const unpricedGeneration = !reuse && summary.cost.candidateRuns > 0 && summary.cost.generationUsd === 0;
	const lines = [
		`# Selection benchmark ${scorecard.runId}`,
		"",
		`Mode: ${env.mode}. Source ${env.sourceHash.slice(0, 7)}${env.sourceDirty ? " (dirty)" : ""}, ${env.ompVersion}, Bun ${env.bunVersion}, ${env.platform}.`,
		`Candidates per task: ${env.n}. Generator: ${env.generatorModel}, thinking ${env.candidateThinking}. Fixture ships visible tests: ${env.visibleTestsInFixture ? "yes" : "no"}.`,
		`Verifier: ${env.verifierModel}, backend ${env.verifierBackend}, ${env.nEvaluations} ${env.verifierBackend === "sampled" ? "pairwise round(s)" : `evaluation(s), ${env.pivots} pivot(s)`}, seed ${env.seed}. Per-candidate limit ${env.maxTimePerCandidate}.`,
		"",
		"| Scope | Tasks | Random pass@1 | Verifier-selected | Oracle pass@N |",
		"| --- | --- | --- | --- | --- |",
		`| All tasks | ${summary.all.tasks} | ${pct(summary.all.randomPass1)} | ${summary.all.ranked === 0 ? "n/a" : pct(summary.all.verifierPass)} | ${pct(summary.all.oraclePassN)} |`,
		`| Discriminating only | ${summary.discriminating.tasks} | ${pct(summary.discriminating.randomPass1)} | ${summary.discriminating.ranked === 0 ? "n/a" : pct(summary.discriminating.verifierPass)} | ${pct(summary.discriminating.oraclePassN)} |`,
		"",
		"A task is discriminating when at least one candidate passes and at least one fails. Only those tasks can separate the three numbers.",
		"",
		"| Task | Candidates | Passed | Verifier pick | Verifier pass | Score spread | Generation | Verifier | Wall clock |",
		"| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
		...outcomes.map(outcome =>
			[
				outcome.taskId,
				`${outcome.eligible}/${outcome.candidates}`,
				`${outcome.passedCandidates}`,
				outcome.verifierIndex === null ? "none" : `#${outcome.verifierIndex + 1}`,
				outcome.verifierPass === null ? "n/a" : outcome.verifierPass ? "pass" : "fail",
				outcome.scoreSpread.toFixed(3),
				usd(outcome.generationUsd),
				usd(outcome.verifierUsd),
				`${(outcome.wallClockMs / 1000).toFixed(1)}s`,
			].join(" | "),
		).map(row => `| ${row} |`),
		"",
		...(outcomes.some(outcome => outcome.emptyPatchCandidates > 0)
			? [
					`No-op candidates (agent produced no patch): ${outcomes
						.filter(outcome => outcome.emptyPatchCandidates > 0)
						.map(outcome => `${outcome.taskId} ${outcome.emptyPatchCandidates}/${outcome.candidates}`)
						.join(", ")}. A pool of no-ops measures the generator route failing, not selection.`,
					"",
				]
			: []),
		reuse
			? `Generation ${usd(summary.cost.generationUsd)} over ${summary.cost.candidateRuns} candidate runs was carried from the stored pool and not spent again.`
			: unpricedGeneration
				? `Generation over ${summary.cost.candidateRuns} candidate runs is unpriced: the ${env.generatorModel} route reported no per-token cost, so real generation spend is missing from this scorecard rather than zero.`
				: `Generation ${usd(summary.cost.generationUsd)} over ${summary.cost.candidateRuns} candidate runs (${usd(summary.cost.perCandidateUsd)} each, reported by the agent runtime).`,
		env.verifierBackend === "sampled"
			? `Sampled verification runtime accounting: ${usd(summary.cost.verifierCostUsd)}. Subscription-routed usage is not a per-token invoice.`
			: reuse
				? `Verification ${usd(summary.cost.verifierCostUsd)} is the only cost this run spent, computed from provider list prices rather than an invoice.`
				: unpricedGeneration
					? `Verification ${usd(summary.cost.verifierCostUsd)}, computed from provider list prices rather than an invoice. No share of total is reported because generation is unpriced.`
					: `Verification ${usd(summary.cost.verifierCostUsd)}, ${pct(summary.cost.verifierShareOfTotal)} of ${usd(summary.cost.totalUsd)} total, computed from provider list prices rather than an invoice.`,
		reuse
			? `Mean re-ranking wall clock ${(summary.latency.taskWallClockMsMean / 1000).toFixed(1)}s per task, slowest ${(summary.latency.taskWallClockMsMax / 1000).toFixed(1)}s. Generation latency is not re-measured.`
			: `Mean task wall clock ${(summary.latency.taskWallClockMsMean / 1000).toFixed(1)}s, slowest ${(summary.latency.taskWallClockMsMax / 1000).toFixed(1)}s. Candidates run concurrently within a task; tasks run sequentially.`,
		"",
		`Raw pools: \`bench/results/${scorecard.runId}/pool/\`. Scorecard: \`bench/results/${scorecard.runId}/scorecard.json\`.`,
		"",
	];
	return lines.join("\n");
}

async function generate(
	taskId: string,
	options: BenchOptions,
	runDir: string,
	modelSource: ModelSource,
): Promise<{ pool: TaskPool; wallClockMs: number; verifier: VerifierResult | null; eligible: PoolCandidate[] }> {
	const taskDir = path.join(TASKS_ROOT, taskId);
	const prompt = (await Bun.file(path.join(taskDir, "task.md")).text()).trim();
	const repoDir = await prepareTaskRepo(taskDir, options.visibleTests);
	try {
		const started = Date.now();
		const result = await runBestOf({
			cwd: repoDir,
			task: prompt,
			n: options.n,
			generatorModel: options.generatorModel,
			verifierModel: options.verifierModel,
			verifierThinking: options.verifierThinking,
			verifierBackend: options.verifierBackend,
			nEvaluations: options.nEvaluations,
			pivots: options.pivots,
			maxTime: options.maxTime,
			thinking: options.thinking,
			apply: false,
			verify: !options.generateOnly,
			seed: options.seed,
			criteria: DEFAULT_CRITERIA,
			modelSource,
			onProgress: progress =>
				process.stderr.write(`\r${taskId} ${progress.phase.padEnd(10)} ${progress.completedCandidates}/${progress.totalCandidates} ${progress.message.padEnd(56)}`),
		});
		const wallClockMs = Date.now() - started;
		process.stderr.write("\n");

		const candidates: PoolCandidate[] = [];
		for (const candidate of result.candidates) {
			const score = candidate.exitCode === 0
				? await scoreCandidate(taskDir, repoDir, candidate.patch)
				: { passed: false, detail: `candidate exited ${candidate.exitCode}` };
			candidates.push({
				index: candidate.index,
				exitCode: candidate.exitCode,
				durationMs: candidate.durationMs,
				patch: candidate.patch,
				recordedToolEvidence: candidate.recordedToolEvidence,
				transcript: candidate.transcript,
				stderr: candidate.stderr,
				usage: candidate.usage,
				passed: score.passed,
				oracleDetail: score.detail,
			});
		}
		const pool: TaskPool = {
			taskId,
			prompt,
			generatedBy: {
				runId: result.runId,
				model: options.generatorModel,
				maxTime: options.maxTime,
				n: options.n,
				thinking: options.thinking || "model default",
				visibleTests: options.visibleTests,
			},
			durationMs: wallClockMs,
			candidates,
		};
		await mkdir(path.join(runDir, "pool"), { recursive: true });
		await Bun.write(path.join(runDir, "pool", `${taskId}.json`), `${JSON.stringify(pool, null, 2)}\n`);
		const eligible = candidates.filter(candidate => candidate.exitCode === 0);
		return { pool, wallClockMs, verifier: result.verifier, eligible };
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
}

async function loadPools(runId: string, taskIds: string[]): Promise<TaskPool[]> {
	const poolDir = path.join(RESULTS_ROOT, runId, "pool");
	const entries = (await readdir(poolDir))
		.filter(entry => entry.endsWith(".json"))
		.filter(entry => taskIds.length === 0 || taskIds.includes(path.basename(entry, ".json")))
		.sort();
	if (entries.length === 0) throw new Error(`No stored pools in ${poolDir}${taskIds.length > 0 ? ` for ${taskIds.join(", ")}` : ""}`);
	const pools: TaskPool[] = [];
	for (const entry of entries) {
		const pool = (await Bun.file(path.join(poolDir, entry)).json()) as TaskPool;
		const labels = await rescoreCandidates(
			path.join(TASKS_ROOT, pool.taskId),
			pool.candidates.map(candidate => candidate.patch),
			pool.generatedBy.visibleTests,
		);
		pool.candidates = pool.candidates.map((candidate, index) => ({
			...candidate,
			passed: labels[index].passed,
			oracleDetail: labels[index].detail,
		}));
		pools.push(pool);
	}
	return pools;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv.includes("--help")) {
		process.stdout.write(HELP);
		return;
	}
	const options = parseArgs(argv);
	const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
	const runDir = path.join(RESULTS_ROOT, runId);
	await mkdir(runDir, { recursive: true });
	const runEnvironment = await environment(options.reuse ? `reuse-rank from ${options.reuse}` : "live-generation", options);

	// One registry for the whole run: the verifier endpoint and every candidate's
	// credential resolve through omp once instead of per task.
	const modelSource = await createModelSource();
	const outcomes: TaskOutcome[] = [];
	let generation: TaskPool["generatedBy"][] = [];
	try {
		let endpoint: VerifierEndpoint | null = null;
		if (!options.generateOnly && options.verifierBackend === "logprob") {
			endpoint = await resolveVerifierEndpoint(options.verifierModel, modelSource);
		}
		if (options.reuse) {
			const pools = await loadPools(options.reuse, options.tasks);
			generation = pools.map(pool => pool.generatedBy);
			for (const pool of pools) {
				const started = Date.now();
				const { verifier, eligible } = await rankPool(pool, options, path.join(runDir, `verifier-cache-${pool.taskId}.json`), endpoint);
				outcomes.push(summarize(pool, eligible, verifier, Date.now() - started, true));
				await mkdir(path.join(runDir, "pool"), { recursive: true });
				await Bun.write(path.join(runDir, "pool", `${pool.taskId}.json`), `${JSON.stringify(pool, null, 2)}\n`);
				process.stderr.write(`${pool.taskId} re-ranked from ${options.reuse}\n`);
			}
		} else {
			const taskIds = options.tasks.length > 0 ? options.tasks : (await readdir(TASKS_ROOT, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
			for (const taskId of taskIds) {
				const { pool, wallClockMs, verifier, eligible } = await generate(taskId, options, runDir, modelSource);
				generation.push(pool.generatedBy);
				outcomes.push(summarize(pool, eligible, verifier, wallClockMs, !options.generateOnly));
			}
		}
	} finally {
		modelSource.close?.();
	}

	const summary = aggregate(outcomes);
	const scorecard = {
		runId,
		environment: {
			...runEnvironment,
			// In reuse mode the generator settings belong to the stored pool, not to this invocation's flags.
			...generatorFacts(generation),
		},
		summary,
		tasks: outcomes.map(({ verifier, ...rest }) => ({
			...rest,
			verifier: verifier
				? {
						backend: verifier.backend,
						index: verifier.index,
						scores: verifier.scores,
						ranking: verifier.ranking,
						nComparisons: verifier.nComparisons,
						criteria: verifier.criteria,
						usage: verifier.usage,
					}
				: null,
		})),
		artifacts: {
			scorecard: `bench/results/${runId}/scorecard.json`,
			summary: `bench/results/${runId}/summary.md`,
			pools: `bench/results/${runId}/pool/`,
		},
	};
	await Bun.write(path.join(runDir, "scorecard.json"), `${JSON.stringify(scorecard, null, 2)}\n`);
	const report = markdown(scorecard, outcomes, summary);
	await Bun.write(path.join(runDir, "summary.md"), report);
	process.stdout.write(`${report}\n`);
}

main().catch(error => {
	process.stderr.write(`\nBenchmark failed: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
