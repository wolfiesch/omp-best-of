import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJsonTranscript } from "./transcript";
import { resolveVerifierEndpoint } from "./model";
import { requireCommand, runCommand } from "./process";
import type { BestOfOptions, BestOfProgress, BestOfResult, CandidateResult, UsageSummary, VerifierResult } from "./types";
import { assertScoringSupported, verifyCandidates } from "./verifier";
import { assertSampledVerifierSupported, sampledVerifierUsage, verifyCandidatesSampled } from "./sampled-verifier";

const DEFAULT_AGENT_PROMPT = `Work independently on the task below. Modify the repository directly, run focused validation, and finish only when the requested behavior works. Do not commit changes. Preserve unrelated user work.\n\n`;

function emit(options: BestOfOptions, progress: BestOfProgress): void {
	options.onProgress?.(progress);
}

function maxTimeMs(value: string): number {
	const match = /^(\d+)(s|m|h)?$/.exec(value.trim());
	if (!match) throw new Error(`Invalid max time: ${value}`);
	const amount = Number(match[1]);
	const multiplier = match[2] === "h" ? 3_600_000 : match[2] === "m" ? 60_000 : 1_000;
	return amount * multiplier + 30_000;
}

function runId(): string {
	return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function artifactRoot(id: string): string {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".omp", "agent");
	return path.join(agentDir, "best-of", "runs", id);
}

async function assertCleanRepo(cwd: string): Promise<{ root: string; head: string }> {
	const root = (await requireCommand(["git", "rev-parse", "--show-toplevel"], cwd)).trim();
	const status = await requireCommand(["git", "status", "--porcelain=v1", "--untracked-files=all"], root);
	if (status.trim()) {
		throw new Error("OMP Best Of requires a clean working tree so the selected patch cannot overwrite existing work.");
	}
	const head = (await requireCommand(["git", "rev-parse", "HEAD"], root)).trim();
	return { root, head };
}

async function createWorktree(root: string, head: string, target: string): Promise<void> {
	await mkdir(path.dirname(target), { recursive: true });
	await requireCommand(["git", "worktree", "add", "--detach", target, head], root);
}

async function capturePatch(worktree: string): Promise<string> {
	await requireCommand(["git", "add", "-A"], worktree);
	return requireCommand(["git", "diff", "--cached", "--binary", "--no-ext-diff", "HEAD"], worktree);
}

async function runCandidate(
	index: number,
	worktree: string,
	artifactDir: string,
	options: BestOfOptions,
): Promise<CandidateResult> {
	const started = Date.now();
	const omp = process.env.OMP_BEST_OF_OMP_BIN ?? "omp";
	const prompt = `${DEFAULT_AGENT_PROMPT}${options.task}`;
	// Every model slot pins to one selector so a candidate cannot silently
	// escalate mid-run. An empty selector leaves the child on its own default,
	// which is how the session's current model is inherited: the caller resolves
	// it and passes it explicitly.
	const modelFlags = options.generatorModel
		? [
				"--model",
				options.generatorModel,
				"--smol",
				options.generatorModel,
				"--slow",
				options.generatorModel,
				"--plan",
				options.generatorModel,
			]
		: [];
	const command = [
		omp,
		"--cwd",
		worktree,
		...modelFlags,
		"--mode",
		"json",
		"--no-extensions",
		"--no-session",
		"--no-title",
		"--approval-mode",
		"yolo",
		"--max-time",
		options.maxTime,
		...(options.thinking ? ["--thinking", options.thinking] : []),
		"-p",
		prompt,
	];
	const processResult = await runCommand(command, { cwd: worktree, timeoutMs: maxTimeMs(options.maxTime) });
	const parsed = parseJsonTranscript(processResult.stdout);
	let patch = "";
	let patchError = "";
	try {
		patch = await capturePatch(worktree);
	} catch (error) {
		patchError = error instanceof Error ? error.message : String(error);
	}
	await mkdir(artifactDir, { recursive: true });
	await Promise.all([
		Bun.write(path.join(artifactDir, "events.jsonl"), processResult.stdout),
		Bun.write(path.join(artifactDir, "stderr.log"), `${processResult.stderr}${patchError ? `\n${patchError}\n` : ""}`),
		Bun.write(path.join(artifactDir, "trajectory.md"), parsed.transcript),
		Bun.write(path.join(artifactDir, "changes.patch"), patch),
	]);
	return {
		index,
		worktree,
		exitCode: patchError ? 1 : processResult.exitCode,
		durationMs: Date.now() - started,
		transcript: parsed.transcript,
		recordedToolEvidence: parsed.recordedToolEvidence,
		finalResponse: parsed.finalResponse,
		patch,
		stderr: `${processResult.stderr}${patchError ? `\n${patchError}` : ""}`.trim(),
		usage: parsed.usage,
		artifactDir,
	};
}

/** Composes the full trajectory evidence ranked by the logprob verifier. */
export function composeVerifierTrajectory(candidate: Pick<CandidateResult, "transcript" | "patch" | "exitCode" | "stderr">): string {
	return [
		candidate.transcript,
		"## Final repository patch",
		candidate.patch || "(no repository changes)",
		"## Process result",
		`exit_code=${candidate.exitCode}`,
		candidate.stderr ? `stderr:\n${candidate.stderr}` : "stderr: (empty)",
	]
		.filter(Boolean)
		.join("\n\n");
}

/** Extracts recorded tool invocations/results from legacy rendered transcripts. */
export function extractRecordedToolEvidence(transcript: string, maxChars = 12_000): string {
	const sections = transcript.split(/(?=^## )/m);
	const evidence: string[] = [];
	for (const section of sections) {
		if (section.startsWith("## toolResult\n")) {
			evidence.push(section.trim());
			continue;
		}
		if (!section.startsWith("## assistant\n")) continue;
		evidence.push(...section.match(/^\[tool [^\n]+$/gm) ?? []);
	}
	const joined = evidence.join("\n\n");
	return joined.length <= maxChars ? joined : `[earlier tool evidence omitted]\n${joined.slice(-maxChars)}`;
}

/** Keeps sampled judgments focused on code and recorded execution instead of assistant narration. */
export function composeSampledVerifierEvidence(candidate: {
	transcript: string;
	recordedToolEvidence?: string;
	patch: string;
	exitCode: number;
	stderr: string;
}): string {
	const recorded = candidate.recordedToolEvidence ?? extractRecordedToolEvidence(candidate.transcript);
	const toolEvidence = recorded.length <= 12_000 ? recorded : `[earlier tool evidence omitted]\n${recorded.slice(-12_000)}`;
	return [
		"## Final repository patch",
		candidate.patch || "(no repository changes)",
		"## Recorded tool evidence",
		toolEvidence || "(none)",
		"## Process result",
		`exit_code=${candidate.exitCode}`,
		candidate.stderr ? `stderr:\n${candidate.stderr}` : "stderr: (empty)",
	].join("\n\n");
}

async function applyPatch(root: string, expectedHead: string, patch: string, artifactDir: string): Promise<void> {
	const currentHead = (await requireCommand(["git", "rev-parse", "HEAD"], root)).trim();
	const status = await requireCommand(["git", "status", "--porcelain=v1", "--untracked-files=all"], root);
	if (currentHead !== expectedHead || status.trim()) {
		throw new Error("The parent checkout changed while candidates were running; the winner was not applied.");
	}
	if (!patch.trim()) return;
	const patchPath = path.join(artifactDir, "winner.patch");
	await Bun.write(patchPath, patch);
	await requireCommand(["git", "apply", "--check", "--binary", patchPath], root);
	await requireCommand(["git", "apply", "--binary", patchPath], root);
}

async function removeWorktree(root: string, worktree: string): Promise<void> {
	await runCommand(["git", "worktree", "remove", "--force", worktree], { cwd: root });
}

export async function runBestOf(options: BestOfOptions): Promise<BestOfResult> {
	if (options.n < 2 || options.n > 8) throw new Error("Candidate count must be between 2 and 8");
	if (options.nEvaluations < 1) throw new Error("Verifier evaluations must be at least 1");
	if (options.pivots < 1 || options.pivots > options.n) throw new Error("Pivots must be between 1 and N");
	if (options.apply && !options.verify) throw new Error("A patch cannot be applied without verification because nothing selected it");
	const started = Date.now();
	const id = runId();
	const artifacts = artifactRoot(id);
	await mkdir(artifacts, { recursive: true });
	emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Checking repository" });
	const { root, head } = await assertCleanRepo(options.cwd);
	// Prove the selected verifier transport before candidate generation spends
	// anything. Logprob mode probes constrained scoring; sampled mode exercises
	// one real OMP subscription judgment.
	let endpoint = null;
	let sampledPreflightUsage: UsageSummary | undefined;
	if (options.verify && options.verifierBackend === "logprob") {
		emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Resolving verifier endpoint" });
		endpoint = await resolveVerifierEndpoint(options.verifierModel, options.modelSource);
		emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Probing verifier scoring capability" });
		await assertScoringSupported(endpoint);
	} else if (options.verify) {
		emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Probing sampled verifier" });
		sampledPreflightUsage = await assertSampledVerifierSupported(options.verifierModel, root);
	}
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-"));
	const worktrees = Array.from({ length: options.n }, (_, index) => path.join(temporaryRoot, `candidate-${index + 1}`));

	try {
		for (const worktree of worktrees) await createWorktree(root, head, worktree);
		emit(options, { phase: "generating", completedCandidates: 0, totalCandidates: options.n, message: `Running ${options.n} candidates` });
		let completed = 0;
		const candidates = await Promise.all(
			worktrees.map(async (worktree, index) => {
				const result = await runCandidate(index, worktree, path.join(artifacts, `candidate-${index + 1}`), options);
				completed += 1;
				emit(options, {
					phase: "generating",
					completedCandidates: completed,
					totalCandidates: options.n,
					message: `Candidate ${index + 1} finished with exit code ${result.exitCode}`,
				});
				return result;
			}),
		);
		const eligible = candidates.filter(candidate => candidate.exitCode === 0);
		if (eligible.length === 0) throw new Error(`All candidates failed. Artifacts: ${artifacts}`);
		let verifier: VerifierResult | null = null;
		let winner = eligible[0];
		if (!options.verify) {
			// Pool collection: candidates and artifacts are kept, but nothing ranks them, so
			// the reported winner is only the first eligible candidate.
			emit(options, { phase: "verifying", completedCandidates: options.n, totalCandidates: options.n, message: "Skipping verification" });
		} else if (eligible.length > 1) {
			emit(options, { phase: "verifying", completedCandidates: options.n, totalCandidates: options.n, message: `Ranking ${eligible.length} candidates` });
			const common = {
				problem: options.task,
				criteria: options.criteria,
				nEvaluations: options.nEvaluations,
				seed: options.seed,
				cachePath: path.join(artifacts, "verifier-cache.json"),
			};
			verifier = options.verifierBackend === "sampled"
				? await verifyCandidatesSampled({
						...common,
						candidates: eligible.map(composeSampledVerifierEvidence),
						model: options.verifierModel,
						thinking: options.verifierThinking,
						preflightUsage: sampledPreflightUsage,
						cwd: root,
					})
				: await verifyCandidates({
						...common,
						candidates: eligible.map(composeVerifierTrajectory),
						endpoint: endpoint!,
						pivots: Math.min(options.pivots, eligible.length),
					});
			winner = eligible[verifier.index];
		} else if (options.verifierBackend === "sampled" && sampledPreflightUsage) {
			verifier = {
				backend: "sampled",
				index: 0,
				scores: [1],
				ranking: [0],
				nComparisons: 0,
				criteria: Object.keys(options.criteria),
				usage: sampledVerifierUsage([sampledPreflightUsage]),
			};
		}
		if (options.apply) {
			emit(options, { phase: "applying", completedCandidates: options.n, totalCandidates: options.n, message: `Applying candidate ${winner.index + 1}` });
			await applyPatch(root, head, winner.patch, artifacts);
		}
		const result: BestOfResult = {
			runId: id,
			artifactDir: artifacts,
			winner,
			candidates,
			verifier,
			applied: options.apply,
			durationMs: Date.now() - started,
		};
		await Bun.write(path.join(artifacts, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
		return result;
	} finally {
		emit(options, { phase: "cleaning", completedCandidates: options.n, totalCandidates: options.n, message: "Removing temporary worktrees" });
		await Promise.all(worktrees.map(worktree => removeWorktree(root, worktree)));
		await runCommand(["git", "worktree", "prune"], { cwd: root });
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}
