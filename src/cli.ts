#!/usr/bin/env bun
import { DEFAULT_CRITERIA, HELP, parseArgs } from "./args";
import { runBestOf } from "./runner";

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const delimiter = args.indexOf("--");
	const options = delimiter === -1 ? args : args.slice(0, delimiter);
	if (options.includes("--help")) {
		process.stdout.write(HELP);
		return;
	}
	const parsed = parseArgs(args);
	const controller = new AbortController();
	const abort = (): void => controller.abort(new DOMException("Interrupted", "AbortError"));
	process.once("SIGINT", abort);
	process.once("SIGTERM", abort);
	const result = await runBestOf({
		cwd: process.cwd(),
		...parsed,
		criteria: DEFAULT_CRITERIA,
		signal: controller.signal,
		onProgress: (progress) => {
			process.stderr.write(
				`\r${progress.phase.padEnd(10)} ${progress.completedCandidates}/${progress.totalCandidates} ${progress.message.padEnd(60)}`,
			);
		},
	}).finally(() => {
		process.off("SIGINT", abort);
		process.off("SIGTERM", abort);
	});
	process.stderr.write("\n");
	process.stdout.write(
		`${JSON.stringify(
			{
				runId: result.runId,
				selection: result.selection,
				application: result.application,
				artifactDir: result.artifactDir,
				durationMs: result.durationMs,
				candidateUsage: result.candidates.map((candidate) => candidate.usage),
				verifier: result.verifier,
			},
			null,
			2,
		)}\n`,
	);
}

main().catch((error) => {
	process.stderr.write(`\nOMP Best Of failed: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
