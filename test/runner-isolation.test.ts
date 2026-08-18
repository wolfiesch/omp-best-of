import { access, chmod, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "bun:test";
import { runBestOf } from "../src/runner";

async function run(args: string[], cwd: string): Promise<string> {
	const process = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(`${args.join(" ")} failed (${exitCode}): ${stderr}`);
	return stdout;
}

test("runs candidates in OMP isolation and cleans every workspace", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-isolation-test-"));
	const repo = path.join(temporaryRoot, "repo");
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	const previousOmpBin = process.env.OMP_BEST_OF_OMP_BIN;
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousWorktreeDir = process.env.OMP_WORKTREE_DIR;

	try {
		await Bun.write(
			omp,
			`#!/usr/bin/env bun
const cwdIndex = process.argv.indexOf("--cwd");
const cwd = process.argv[cwdIndex + 1];
await Bun.write(new URL("candidate.txt", \`file://\${cwd}/\`), "isolated candidate\\n");
console.log(JSON.stringify({
	type: "message_end",
	message: {
		role: "assistant",
		content: [{ type: "text", text: "done" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoningTokens: 0, cost: { total: 0 } },
	},
}));
`,
		);
		await chmod(omp, 0o755);
		await run(["git", "init", "-q", repo], temporaryRoot);
		await Bun.write(path.join(repo, "tracked.txt"), "parent baseline\n");
		await run(["git", "add", "tracked.txt"], repo);
		await run(
			["git", "-c", "user.name=OMP Test", "-c", "user.email=omp@example.invalid", "commit", "-qm", "baseline"],
			repo,
		);

		process.env.OMP_BEST_OF_OMP_BIN = omp;
		process.env.PI_CODING_AGENT_DIR = path.join(temporaryRoot, "agent");
		process.env.OMP_WORKTREE_DIR = path.join(temporaryRoot, "workspaces");
		const result = await runBestOf({
			cwd: repo,
			task: "Create candidate.txt",
			n: 2,
			generatorModel: "",
			verifierModel: "unused",
			verifierBackend: "logprob",
			nEvaluations: 1,
			pivots: 1,
			maxTime: "10s",
			thinking: "",
			apply: false,
			verify: false,
			seed: 0,
			criteria: {},
		});

		expect(result.candidates).toHaveLength(2);
		for (const candidate of result.candidates) {
			if (candidate.exitCode !== 0) throw new Error(`Candidate failed: ${candidate.stderr}`);
			expect(candidate.patch).toContain("candidate.txt");
			expect(await access(candidate.worktree).then(() => true, () => false)).toBe(false);
		}
		expect(await access(path.join(repo, "candidate.txt")).then(() => true, () => false)).toBe(false);
		expect(await run(["git", "status", "--porcelain=v1", "--untracked-files=all"], repo)).toBe("");
		const worktreeList = await run(["git", "worktree", "list", "--porcelain"], repo);
		expect(worktreeList.match(/^worktree /gm)).toHaveLength(1);
	} finally {
		if (previousOmpBin === undefined) delete process.env.OMP_BEST_OF_OMP_BIN;
		else process.env.OMP_BEST_OF_OMP_BIN = previousOmpBin;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		if (previousWorktreeDir === undefined) delete process.env.OMP_WORKTREE_DIR;
		else process.env.OMP_WORKTREE_DIR = previousWorktreeDir;
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});
