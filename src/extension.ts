import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { BestOfCliOptions } from "./args";
import { DEFAULT_CRITERIA, HELP, parseArgs, tokenize } from "./args";
import { modelSourceFromRegistry } from "./model";
import { runBestOf } from "./runner";
import type { BestOfProgress, BestOfResult } from "./types";

/** `best_of` parameters before they are normalized by the CLI parser. */
interface BestOfToolParams {
	task: string;
	n?: number;
	model?: string;
	thinking?: string;
	verifierModel?: string;
	verifierBackend?: "logprob" | "sampled";
	verifierThinking?: string;
	verifierTimeout?: string;
	evaluations?: number;
	pivots?: number;
	maxTime?: string;
	seed?: number;
	apply?: boolean;
	verify?: boolean;
}

/** Map tool fields through the same defaults and validation as the CLI. */
function bestOfToolParamsToCliOptions(params: BestOfToolParams): BestOfCliOptions {
	const flags: string[] = [];
	const add = (flag: string, raw: string | number | undefined): void => {
		if (raw === undefined) return;
		flags.push(flag, String(raw));
	};
	add("--n", params.n);
	add("--model", params.model);
	add("--thinking", params.thinking);
	add("--verifier-model", params.verifierModel);
	add("--verifier-backend", params.verifierBackend);
	add("--verifier-thinking", params.verifierThinking);
	add("--verifier-timeout", params.verifierTimeout);
	add("--evaluations", params.evaluations);
	add("--pivots", params.pivots);
	add("--max-time", params.maxTime);
	add("--seed", params.seed);
	if (params.apply === true) flags.push("--apply");
	if (params.verify === false) flags.push("--no-verify");
	flags.push("--", params.task);
	return parseArgs(flags);
}

/**
 * The session's current model as an omp selector. Empty when no model is
 * resolved yet, which leaves each candidate on omp's own default.
 */
function sessionModelSelector(ctx: ExtensionContext): string {
	const model = ctx.model;
	return model ? `${model.provider}/${model.id}` : "";
}

/**
 * The session's thinking level as an `omp --thinking` value. `inherit` is not a
 * concrete level, so it is passed through as empty and resolved by the child.
 */
function sessionThinkingLevel(pi: ExtensionAPI): string {
	const level = pi.getThinkingLevel();
	return !level || level === "inherit" ? "" : level;
}

function resultLines(result: BestOfResult): string[] {
	const candidateCost = result.candidates.reduce((sum, candidate) => sum + candidate.usage.costUsd, 0);
	const verifierUsage = result.verifier?.usage;
	const summary = result.selection.performed
		? `OMP Best Of selected candidate ${(result.selection.winnerIndex ?? 0) + 1}${result.application.applied ? " and applied its patch" : ""}.`
		: `OMP Best Of generated ${result.candidates.length} candidates without selecting a winner.`;
	return [
		summary,
		`Run: ${result.runId}`,
		`Candidates: ${result.candidates.length} | elapsed: ${(result.durationMs / 1000).toFixed(1)}s`,
		`Generation: $${candidateCost.toFixed(4)} | input ${result.candidates.reduce((sum, candidate) => sum + candidate.usage.inputTokens, 0).toLocaleString()} | output ${result.candidates.reduce((sum, candidate) => sum + candidate.usage.outputTokens, 0).toLocaleString()}`,
		verifierUsage
			? `Verifier (${result.verifier?.backend}): ${verifierUsage.calls} calls | input ${verifierUsage.input_tokens.toLocaleString()} (${(verifierUsage.cache_hit_rate * 100).toFixed(1)}% cached) | output ${verifierUsage.output_tokens.toLocaleString()}`
			: result.verifier
				? `Verifier (${result.verifier.backend}): no provider calls; cached comparisons reused`
				: "Verifier: skipped",
		`Artifacts: ${result.artifactDir}`,
	];
}

interface SharedRunInput {
	cwd: ExtensionContext["cwd"];
	parsed: BestOfCliOptions;
	modelRegistry: ExtensionContext["modelRegistry"];
	sessionModel: string;
	sessionThinking: string;
	signal?: AbortSignal;
	onProgress: (progress: BestOfProgress) => void;
}

/** Run command and tool invocations through the same orchestration path. */
async function runWithSharedSession(activeRuns: Set<AbortController>, input: SharedRunInput): Promise<BestOfResult> {
	const controller = new AbortController();
	activeRuns.add(controller);
	const forwardAbort = (): void => {
		controller.abort(input.signal?.reason ?? new DOMException("Tool call aborted", "AbortError"));
	};
	if (input.signal?.aborted) forwardAbort();
	input.signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		return await runBestOf({
			cwd: input.cwd,
			...input.parsed,
			// Candidates inherit the session's live model and thinking level unless
			// the invocation named its own, so Best Of runs what the caller is running.
			generatorModel: input.parsed.generatorModel || input.sessionModel,
			thinking: input.parsed.thinking || input.sessionThinking,
			criteria: DEFAULT_CRITERIA,
			// The verifier credential comes from this session's registry, so an
			// OAuth provider works without a plugin-specific API key.
			modelSource: modelSourceFromRegistry(input.modelRegistry),
			signal: controller.signal,
			onProgress: input.onProgress,
		});
	} finally {
		activeRuns.delete(controller);
		input.signal?.removeEventListener("abort", forwardAbort);
	}
}

export default function ompBestOfExtension(pi: ExtensionAPI): void {
	pi.setLabel("OMP Best Of");
	const activeRuns = new Set<AbortController>();
	const abortActiveRuns = (): void => {
		for (const controller of activeRuns) controller.abort(new DOMException("OMP session stopped", "AbortError"));
		activeRuns.clear();
	};
	pi.on("session_stop", abortActiveRuns);
	pi.on("session_shutdown", abortActiveRuns);
	pi.registerCommand("best-of", {
		description: "Run isolated Best-of-N agents and rank patches with LLM-as-a-Verifier or an OMP sampled judge",
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			if (!rawArgs.trim() || rawArgs.trim() === "--help") {
				ctx.ui.notify(HELP, "info");
				return;
			}
			let parsed: BestOfCliOptions;
			try {
				parsed = parseArgs(tokenize(rawArgs));
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}
			const widgetKey = "omp-best-of-progress";
			const update = (progress: BestOfProgress) => {
				ctx.ui.setWidget(widgetKey, [
					`OMP Best Of | ${progress.phase}`,
					`${progress.completedCandidates}/${progress.totalCandidates} candidates | ${progress.message}`,
				]);
			};
			try {
				const result = await runWithSharedSession(activeRuns, {
					cwd: ctx.cwd,
					parsed,
					modelRegistry: ctx.modelRegistry,
					sessionModel: sessionModelSelector(ctx),
					sessionThinking: sessionThinkingLevel(pi),
					onProgress: update,
				});
				const lines = resultLines(result);
				ctx.ui.notify(lines.join("\n"), "info");
				pi.sendMessage(
					{
						customType: "omp-best-of-result",
						content: [{ type: "text", text: lines.join("\n") }],
						display: true,
						details: { runId: result.runId, selection: result.selection, application: result.application },
					},
					{ triggerTurn: false },
				);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			} finally {
				ctx.ui.setWidget(widgetKey, undefined);
			}
		},
	});
	const { z } = pi.zod;
	pi.registerTool({
		name: "best_of",
		label: "OMP Best Of",
		description:
			"Run isolated Best-of-N agents on a repository task and rank their patches with an LLM-as-a-Verifier or an OMP sampled judge. Returns the run id, artifact directory, selection, application state, and duration; set apply:true to apply the selected patch to the clean parent checkout.",
		parameters: z.object({
			task: z.string().describe("Repository task the isolated candidates must complete"),
			n: z.number().int().optional().describe("Number of isolated candidates to generate (2-8; default 3)"),
			model: z.string().optional().describe("Exact OMP model selector for candidates; default inherits the calling session's model"),
			thinking: z.string().optional().describe("Candidate thinking level; default inherits the calling session's level"),
			verifierModel: z.string().optional().describe("Exact OMP model selector for the verifier; any catalog model"),
			verifierBackend: z.enum(["logprob", "sampled"]).optional().describe("How candidates are ranked (default logprob)"),
			verifierThinking: z.string().optional().describe("Sampled-verifier thinking level (default low)"),
			verifierTimeout: z.string().optional().describe("Per-verifier-call limit, such as 2m or 10m (default 2m)"),
			evaluations: z.number().int().optional().describe("Logprob repetitions or sampled pairwise rounds (default 1)"),
			pivots: z.number().int().optional().describe("Probabilistic pivots for the logprob backend (default 2)"),
			maxTime: z.string().optional().describe("Per-candidate limit, such as 20m (default 20m)"),
			seed: z.number().int().optional().describe("Tournament seed (default 0)"),
			apply: z.boolean().optional().describe("Apply the selected patch to the clean parent checkout (default false)"),
			verify: z.boolean().optional().describe("Rank candidates with the verifier (default true)"),
		}),
		approval: "exec",
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			signal?.throwIfAborted();
			const input = params as BestOfToolParams;
			const update = (progress: BestOfProgress) => {
				onUpdate?.({
					content: [
						{
							type: "text",
							text: `OMP Best Of | ${progress.phase} | ${progress.completedCandidates}/${progress.totalCandidates} | ${progress.message}`,
						},
					],
				});
			};
			try {
				const result = await runWithSharedSession(activeRuns, {
					cwd: ctx.cwd,
					parsed: bestOfToolParamsToCliOptions(input),
					modelRegistry: ctx.modelRegistry,
					sessionModel: sessionModelSelector(ctx),
					sessionThinking: sessionThinkingLevel(pi),
					signal,
					onProgress: update,
				});
				return {
					content: [{ type: "text", text: resultLines(result).join("\n") }],
					details: {
						runId: result.runId,
						artifactDir: result.artifactDir,
						selection: result.selection,
						application: result.application,
						durationMs: result.durationMs,
					},
				};
			} catch (error) {
				if (signal?.aborted) signal.throwIfAborted();
				if (error instanceof Error && error.name === "AbortError") throw error;
				return {
					content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
					isError: true,
				};
			}
		},
	});
}
