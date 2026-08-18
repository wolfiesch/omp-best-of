/**
 * Fixture materialization and hidden-oracle labeling for the selection benchmark.
 *
 * Candidates only ever see `tasks/<id>/repo`. The oracle in `tasks/<id>/oracle` is copied
 * into a throwaway scoring clone after the candidate has finished, and the pristine visible
 * tests are restored first, so weakening or deleting a visible test cannot buy a pass.
 */
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireCommand, runCommand } from "../src/process";

export const ORACLE_TIMEOUT_MS = 90_000;

export interface OracleLabel {
	passed: boolean;
	detail: string;
}

/** Scoring-clone directory holding the hidden oracle. Bun's runner skips dot-directories, so this name must stay visible. */
const ORACLE_DIR = "oracle-check";

/** Counts declared `test(...)` cases so a skipped file cannot pass unnoticed. */
async function countTests(files: string[]): Promise<number> {
	let total = 0;
	for (const file of files) {
		const text = await Bun.file(file).text();
		total += text.match(/^\s*test\(/gm)?.length ?? 0;
	}
	return total;
}

function countRan(output: string): number {
	const pass = Number(output.match(/(\d+) pass/)?.[1] ?? 0);
	const fail = Number(output.match(/(\d+) fail/)?.[1] ?? 0);
	return pass + fail;
}

export async function visibleTestFiles(taskDir: string): Promise<string[]> {
	const entries = await readdir(path.join(taskDir, "repo"));
	return entries.filter(entry => entry.endsWith(".test.js")).sort();
}

/**
 * Materializes the task fixture as a committed git repository the candidates can work in.
 *
 * With `visibleTests: false` the fixture ships no test file at all, so a candidate has no
 * local signal and must reason about the written contract. The hidden oracle still decides.
 */
export async function prepareTaskRepo(taskDir: string, visibleTests = true): Promise<string> {
	const repoDir = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-bench-"));
	await cp(path.join(taskDir, "repo"), repoDir, { recursive: true });
	if (!visibleTests) {
		for (const file of await visibleTestFiles(taskDir)) await rm(path.join(repoDir, file), { force: true });
	}
	await requireCommand(["git", "init", "--quiet", "--initial-branch=main"], repoDir);
	await requireCommand(["git", "add", "-A"], repoDir);
	await requireCommand(
		[
			"git",
			"-c",
			"user.name=Bench Fixture",
			"-c",
			"user.email=bench@invalid.local",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--quiet",
			"--no-verify",
			"-m",
			"fixture",
		],
		repoDir,
	);
	return repoDir;
}

/** Applies one candidate patch to a scoring clone and labels it against the hidden oracle. */
export async function scoreCandidate(taskDir: string, repoDir: string, patch: string): Promise<OracleLabel> {
	if (!patch.trim()) return { passed: false, detail: "no repository changes" };
	const scoringRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-score-"));
	const scoringDir = path.join(scoringRoot, "repo");
	try {
		await cp(repoDir, scoringDir, { recursive: true });
		const patchPath = path.join(scoringRoot, "candidate.patch");
		await writeFile(patchPath, patch);
		const applied = await runCommand(["git", "apply", "--binary", patchPath], { cwd: scoringDir });
		if (applied.exitCode !== 0) {
			return { passed: false, detail: `patch did not apply: ${applied.stderr.trim().slice(0, 200)}` };
		}

		const visible = await visibleTestFiles(taskDir);
		for (const file of visible) {
			await cp(path.join(taskDir, "repo", file), path.join(scoringDir, file));
		}
		const oracleDir = path.join(scoringDir, ORACLE_DIR);
		await cp(path.join(taskDir, "oracle"), oracleDir, { recursive: true });
		const oracleFiles = (await readdir(oracleDir)).filter(entry => entry.endsWith(".test.js")).sort();
		const expected = await countTests([
			...visible.map(file => path.join(scoringDir, file)),
			...oracleFiles.map(file => path.join(oracleDir, file)),
		]);

		const result = await runCommand(["bun", "test", ...visible, ORACLE_DIR], {
			cwd: scoringDir,
			timeoutMs: ORACLE_TIMEOUT_MS,
		});
		const output = `${result.stdout}\n${result.stderr}`.trim();
		const ran = countRan(output);
		// A silently skipped oracle file would label every candidate as passing, so refuse to guess.
		if (ran < expected) {
			throw new Error(`Oracle for ${path.basename(taskDir)} ran ${ran} of ${expected} tests; refusing to label. Output:\n${output.slice(0, 800)}`);
		}
		const detail = output
			.split("\n")
			.filter(line => /\d+ (pass|fail)|error:/i.test(line))
			.slice(-4)
			.join(" | ")
			.trim();
		return { passed: result.exitCode === 0, detail: (detail || output.split("\n").slice(-2).join(" | ")).slice(0, 400) };
	} finally {
		await rm(scoringRoot, { recursive: true, force: true });
	}
}

/** Re-labels stored patches against the current task oracle before a reuse-rank run. */
export async function rescoreCandidates(taskDir: string, patches: string[], visibleTests = true): Promise<OracleLabel[]> {
	const repoDir = await prepareTaskRepo(taskDir, visibleTests);
	try {
		return await Promise.all(patches.map(patch => scoreCandidate(taskDir, repoDir, patch)));
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
}
