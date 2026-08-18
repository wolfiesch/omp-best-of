import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_CRITERIA, HELP, parseArgs, tokenize } from "./args";
import { modelSourceFromRegistry } from "./model";
import { runBestOf } from "./runner";
import type { BestOfProgress, BestOfResult } from "./types";

/**
 * The session's current model as an omp selector. Empty when no model is
 * resolved yet, which leaves each candidate on omp's own default.
 */
function sessionModelSelector(ctx: ExtensionCommandContext): string {
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
	return [
		`OMP Best Of selected candidate ${result.winner.index + 1}${result.applied ? " and applied its patch" : ""}.`,
		`Candidates: ${result.candidates.length} | elapsed: ${(result.durationMs / 1000).toFixed(1)}s`,
		`Generation: $${candidateCost.toFixed(4)} | input ${result.candidates.reduce((sum, candidate) => sum + candidate.usage.inputTokens, 0).toLocaleString()} | output ${result.candidates.reduce((sum, candidate) => sum + candidate.usage.outputTokens, 0).toLocaleString()}`,
		verifierUsage
			? `Verifier: ${verifierUsage.calls} calls | input ${verifierUsage.input_tokens.toLocaleString()} (${(verifierUsage.cache_hit_rate * 100).toFixed(1)}% cached) | output ${verifierUsage.output_tokens.toLocaleString()}`
			: "Verifier: skipped because only one candidate completed successfully",
		`Artifacts: ${result.artifactDir}`,
	];
}

export default function ompBestOfExtension(pi: ExtensionAPI): void {
	pi.setLabel("OMP Best Of");
	pi.registerCommand("best-of", {
		description: "Run isolated Best-of-N coding agents and select the strongest patch with LLM-as-a-Verifier",
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			if (!rawArgs.trim() || rawArgs.trim() === "--help") {
				ctx.ui.notify(HELP, "info");
				return;
			}
			let parsed;
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
				const result = await runBestOf({
					cwd: ctx.cwd,
					...parsed,
					// Candidates inherit the session's live model and thinking level unless
					// the invocation named its own, so /best-of runs what the caller is running.
					generatorModel: parsed.generatorModel || sessionModelSelector(ctx),
					thinking: parsed.thinking || sessionThinkingLevel(pi),
					criteria: DEFAULT_CRITERIA,
					// The verifier credential comes from this session's registry, so an
					// OAuth provider works without a plugin-specific API key.
					modelSource: modelSourceFromRegistry(ctx.modelRegistry),
					onProgress: update,
				});
				const lines = resultLines(result);
				ctx.ui.notify(lines.join("\n"), "info");
				pi.sendMessage(
					{
						customType: "omp-best-of-result",
						content: [{ type: "text", text: lines.join("\n") }],
						display: true,
						details: { runId: result.runId, winner: result.winner.index, applied: result.applied },
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
}
