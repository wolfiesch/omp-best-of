import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_CRITERIA, HELP, parseArgs, tokenize } from "./args";
import { runBestOf } from "./runner";
import type { BestOfProgress, BestOfResult } from "./types";

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
					criteria: DEFAULT_CRITERIA,
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
