import os from "node:os";
import path from "node:path";
import {
	captureBaseline,
	captureDeltaPatch,
	cleanupIsolation,
	ensureIsolation,
	type IsolationHandle,
	parseIsolationMode,
	type WorktreeBaseline,
} from "@oh-my-pi/pi-coding-agent/task/worktree";
import { parseDurationMs } from "./args";
import { ensurePrivateDirectory, secureExistingFile, writePrivateFile } from "./artifacts";
import { resolveVerifierEndpoint } from "./model";
import { requireCommand, runCommand } from "./process";
import { assertSampledVerifierSupported, sampledVerifierUsage, verifyCandidatesSampled } from "./sampled-verifier";
import { parseJsonTranscript } from "./transcript";
import type { BestOfManifest, BestOfOptions, BestOfProgress, BestOfResult, CandidateResult, UsageSummary, VerifierResult } from "./types";
import { assertScoringSupported, verifyCandidates } from "./verifier";

const DEFAULT_AGENT_PROMPT = `Work independently on the task below. Modify the repository directly, run focused validation, and finish only when the requested behavior works. Do not commit changes. Preserve unrelated user work.\n\n`;
const VERIFIER_TIMEOUT_MS = 120_000;

function emit(options: BestOfOptions, progress: BestOfProgress): void {
	options.onProgress?.(progress);
}

function validateOptions(options: BestOfOptions): number {
	if (!Number.isSafeInteger(options.n) || options.n < 2 || options.n > 8) {
		throw new Error("Candidate count must be a safe integer between 2 and 8");
	}
	if (!Number.isSafeInteger(options.nEvaluations) || options.nEvaluations < 1) {
		throw new Error("Verifier evaluations must be a positive safe integer");
	}
	if (!Number.isSafeInteger(options.pivots) || options.pivots < 1 || options.pivots > options.n) {
		throw new Error("Pivots must be a safe integer between 1 and N");
	}
	if (!Number.isSafeInteger(options.seed)) throw new Error("Seed must be a safe integer");
	if (options.apply && !options.verify) throw new Error("A patch cannot be applied without verification because nothing selected it");
	const duration = parseDurationMs(options.maxTime);
	if (duration < 1) throw new Error("Max time must be greater than zero");
	return duration;
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

async function createCandidateIsolation(root: string, id: string): Promise<IsolationHandle> {
	let isolation: IsolationHandle | undefined;
	try {
		isolation = await ensureIsolation(root, id);
		await requireCommand(["git", "status", "--porcelain=v1", "--untracked-files=all"], isolation.mergedDir);
		return isolation;
	} catch {
		if (isolation) await cleanupIsolation(isolation);
		// Native backends can exist but be unusable in a restricted container, for example
		// when fuse-overlayfs is installed without mount permission. The copy backend does
		// not need those privileges and preserves the same candidate-isolation contract.
		return ensureIsolation(root, id, parseIsolationMode("rcopy"));
	}
}

async function runCandidate(
	index: number,
	workspace: string,
	baseline: WorktreeBaseline,
	artifactDir: string,
	options: BestOfOptions,
	timeoutMs: number,
	signal: AbortSignal,
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
		workspace,
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
	const processResult = await runCommand(command, { cwd: workspace, timeoutMs, signal });
	const parsed = parseJsonTranscript(processResult.stdout);
	let patch = "";
	let patchError = "";
	try {
		patch = (await captureDeltaPatch(workspace, baseline)).rootPatch;
	} catch (error) {
		patchError = error instanceof Error ? error.message : String(error);
	}
	await ensurePrivateDirectory(artifactDir);
	await Promise.all([
		writePrivateFile(path.join(artifactDir, "events.jsonl"), processResult.stdout),
		writePrivateFile(path.join(artifactDir, "stderr.log"), `${processResult.stderr}${patchError ? `\n${patchError}\n` : ""}`),
		writePrivateFile(path.join(artifactDir, "trajectory.md"), parsed.transcript),
		writePrivateFile(path.join(artifactDir, "changes.patch"), patch),
	]);
	return {
		index,
		workspace,
		exitCode: patchError || processResult.timedOut || processResult.aborted ? 1 : processResult.exitCode,
		timedOut: processResult.timedOut,
		aborted: processResult.aborted,
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
		evidence.push(...(section.match(/^\[tool [^\n]+$/gm) ?? []));
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

async function assertParentUnchanged(root: string, expectedHead: string, message: string): Promise<void> {
	const currentHead = (await requireCommand(["git", "rev-parse", "HEAD"], root)).trim();
	const status = await requireCommand(["git", "status", "--porcelain=v1", "--untracked-files=all"], root);
	if (currentHead !== expectedHead || status.trim()) throw new Error(message);
}

async function applyPatch(root: string, expectedHead: string, patch: string, artifactDir: string): Promise<boolean> {
	await assertParentUnchanged(
		root,
		expectedHead,
		"The parent checkout changed while candidates were running; the selected patch was not applied.",
	);
	if (!patch.trim()) return false;
	const patchPath = path.join(artifactDir, "winner.patch");
	await writePrivateFile(patchPath, patch);
	await requireCommand(["git", "apply", "--check", "--binary", patchPath], root);
	await requireCommand(["git", "apply", "--binary", patchPath], root);
	return true;
}

export async function runBestOf(options: BestOfOptions): Promise<BestOfResult> {
	const candidateTimeoutMs = validateOptions(options);
	options.signal?.throwIfAborted();
	const started = Date.now();
	const id = runId();
	emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Checking repository" });
	const { root, head } = await assertCleanRepo(options.cwd);
	const artifacts = artifactRoot(id);
	await ensurePrivateDirectory(artifacts);
	// Prove the selected verifier transport before candidate generation spends
	// anything. Logprob mode probes constrained scoring; sampled mode exercises
	// one real OMP subscription judgment.
	let endpoint = null;
	let sampledPreflightUsage: UsageSummary | undefined;
	if (options.verify && options.verifierBackend === "logprob") {
		emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Resolving verifier endpoint" });
		endpoint = await resolveVerifierEndpoint(options.verifierModel, options.modelSource);
		emit(options, {
			phase: "preparing",
			completedCandidates: 0,
			totalCandidates: options.n,
			message: "Probing verifier scoring capability",
		});
		await assertScoringSupported(endpoint, options.signal);
	} else if (options.verify) {
		emit(options, { phase: "preparing", completedCandidates: 0, totalCandidates: options.n, message: "Probing sampled verifier" });
		sampledPreflightUsage = await assertSampledVerifierSupported(options.verifierModel, root, options.signal);
	}
	const baseline = await captureBaseline(root);
	const isolations: IsolationHandle[] = [];

	try {
		for (let index = 0; index < options.n; index += 1) {
			options.signal?.throwIfAborted();
			isolations.push(await createCandidateIsolation(root, `${id}-candidate-${index + 1}`));
		}
		await assertParentUnchanged(
			root,
			head,
			"The parent checkout changed while isolated candidates were being prepared; no candidates were started.",
		);
		emit(options, { phase: "generating", completedCandidates: 0, totalCandidates: options.n, message: `Running ${options.n} candidates` });
		let completed = 0;
		let candidateFailure: unknown;
		const candidateController = new AbortController();
		const abortCandidates = (): void => candidateController.abort(options.signal?.reason);
		options.signal?.addEventListener("abort", abortCandidates, { once: true });
		if (options.signal?.aborted) abortCandidates();
		const candidateRuns = isolations.map(async (isolation, index) => {
			try {
				const result = await runCandidate(
					index,
					isolation.mergedDir,
					baseline,
					path.join(artifacts, `candidate-${index + 1}`),
					options,
					candidateTimeoutMs,
					candidateController.signal,
				);
				completed += 1;
				emit(options, {
					phase: "generating",
					completedCandidates: completed,
					totalCandidates: options.n,
					message: `Candidate ${index + 1} finished with exit code ${result.exitCode}`,
				});
				return result;
			} catch (error) {
				candidateFailure ??= error;
				candidateController.abort(error);
				throw error;
			}
		});
		const settled = await Promise.allSettled(candidateRuns);
		options.signal?.removeEventListener("abort", abortCandidates);
		options.signal?.throwIfAborted();
		if (candidateFailure !== undefined) throw candidateFailure;
		const candidates = settled.map((result) => {
			if (result.status === "rejected") throw result.reason;
			return result.value;
		});
		await assertParentUnchanged(
			root,
			head,
			"The parent checkout changed while candidates were running; selection and application stopped.",
		);
		const eligible = candidates.filter((candidate) => candidate.exitCode === 0);
		if (eligible.length === 0) throw new Error(`All candidates failed. Artifacts: ${artifacts}`);
		let verifier: VerifierResult | null = null;
		let selectedCandidate: CandidateResult | null = null;
		const verifierCachePath = path.join(artifacts, "verifier-cache.json");
		if (!options.verify) {
			emit(options, { phase: "verifying", completedCandidates: options.n, totalCandidates: options.n, message: "Skipping verification" });
		} else if (eligible.length > 1) {
			emit(options, {
				phase: "verifying",
				completedCandidates: options.n,
				totalCandidates: options.n,
				message: `Ranking ${eligible.length} candidates`,
			});
			const common = {
				problem: options.task,
				criteria: options.criteria,
				nEvaluations: options.nEvaluations,
				seed: options.seed,
				cachePath: verifierCachePath,
				signal: options.signal,
				timeoutMs: VERIFIER_TIMEOUT_MS,
			};
			try {
				if (options.verifierBackend === "sampled") {
					verifier = await verifyCandidatesSampled({
						...common,
						candidates: eligible.map(composeSampledVerifierEvidence),
						model: options.verifierModel,
						thinking: options.verifierThinking,
						preflightUsage: sampledPreflightUsage,
						cwd: root,
						candidateCwds: eligible.map((candidate) => candidate.workspace),
					});
				} else {
					if (!endpoint) throw new Error("Verifier endpoint was not resolved");
					verifier = await verifyCandidates({
						...common,
						candidates: eligible.map(composeVerifierTrajectory),
						endpoint,
						pivots: Math.min(options.pivots, eligible.length),
					});
				}
			} finally {
				await secureExistingFile(verifierCachePath);
			}
			selectedCandidate = eligible[verifier.index];
		} else {
			selectedCandidate = eligible[0];
			if (options.verifierBackend === "sampled" && sampledPreflightUsage) {
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
		}
		let applied = false;
		if (options.apply && selectedCandidate) {
			emit(options, {
				phase: "applying",
				completedCandidates: options.n,
				totalCandidates: options.n,
				message: `Applying candidate ${selectedCandidate.index + 1}`,
			});
			applied = await applyPatch(root, head, selectedCandidate.patch, artifacts);
		}
		const durationMs = Date.now() - started;
		const result: BestOfResult = {
			runId: id,
			artifactDir: artifacts,
			selection: { performed: selectedCandidate !== null, winnerIndex: selectedCandidate?.index ?? null },
			application: { requested: options.apply, applied },
			candidates,
			verifier,
			durationMs,
		};
		const manifest: BestOfManifest = {
			schemaVersion: 1,
			runId: id,
			selection: result.selection,
			candidateSummaries: candidates.map((candidate) => ({
				index: candidate.index,
				exitCode: candidate.exitCode,
				timedOut: candidate.timedOut,
				aborted: candidate.aborted,
				durationMs: candidate.durationMs,
				artifactDir: path.relative(artifacts, candidate.artifactDir),
				usage: candidate.usage,
			})),
			verifier,
			application: result.application,
			durationMs,
		};
		await writePrivateFile(path.join(artifacts, "result.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		return result;
	} finally {
		emit(options, {
			phase: "cleaning",
			completedCandidates: options.n,
			totalCandidates: options.n,
			message: "Removing isolated candidates",
		});
		await Promise.all(isolations.map(cleanupIsolation));
	}
}
