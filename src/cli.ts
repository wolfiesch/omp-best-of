#!/usr/bin/env bun
import { DEFAULT_CRITERIA, HELP, parseArgs } from "./args";
import { runBestOf } from "./runner";

async function main(): Promise<void> {
	if (process.argv.includes("--help")) {
		process.stdout.write(HELP);
		return;
	}
	const parsed = parseArgs(process.argv.slice(2));
	const result = await runBestOf({
		cwd: process.cwd(),
		...parsed,
		criteria: DEFAULT_CRITERIA,
		onProgress: progress => {
			process.stderr.write(
				`\r${progress.phase.padEnd(10)} ${progress.completedCandidates}/${progress.totalCandidates} ${progress.message.padEnd(60)}`,
			);
		},
	});
	process.stderr.write("\n");
	process.stdout.write(
		`${JSON.stringify(
			{
				runId: result.runId,
				winner: result.winner.index + 1,
				applied: result.applied,
				artifactDir: result.artifactDir,
				durationMs: result.durationMs,
				candidateUsage: result.candidates.map(candidate => candidate.usage),
				verifier: result.verifier,
			},
			null,
			2,
		)}\n`,
	);
}

main().catch(error => {
	process.stderr.write(`\nOMP Best Of failed: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
