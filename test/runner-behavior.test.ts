import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBestOf } from "../src/runner";

async function run(args: string[], cwd: string): Promise<string> {
	const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(`${args.join(" ")} failed (${exitCode}): ${stderr}`);
	return stdout;
}

async function initializeRepository(temporaryRoot: string): Promise<string> {
	const repo = path.join(temporaryRoot, "repo");
	await run(["git", "init", "-q", repo], temporaryRoot);
	await Bun.write(path.join(repo, "tracked.txt"), "baseline\n");
	await run(["git", "add", "tracked.txt"], repo);
	await run(["git", "-c", "user.name=OMP Test", "-c", "user.email=omp@example.invalid", "commit", "-qm", "baseline"], repo);
	return repo;
}

function options(repo: string) {
	return {
		cwd: repo,
		task: "exercise candidate behavior",
		n: 2,
		generatorModel: "",
		verifierModel: "test/model",
		verifierBackend: "sampled" as const,
		verifierThinking: "low",
		nEvaluations: 1,
		pivots: 1,
		maxTime: "10s",
		thinking: "",
		apply: true,
		verify: true,
		seed: 0,
		criteria: {},
	};
}

async function withRunnerEnvironment(temporaryRoot: string, omp: string, callback: () => Promise<void>): Promise<void> {
	const previousOmpBin = process.env.OMP_BEST_OF_OMP_BIN;
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousWorktreeDir = process.env.OMP_WORKTREE_DIR;
	try {
		process.env.OMP_BEST_OF_OMP_BIN = omp;
		process.env.PI_CODING_AGENT_DIR = path.join(temporaryRoot, "agent");
		process.env.OMP_WORKTREE_DIR = path.join(temporaryRoot, "workspaces");
		await callback();
	} finally {
		if (previousOmpBin === undefined) delete process.env.OMP_BEST_OF_OMP_BIN;
		else process.env.OMP_BEST_OF_OMP_BIN = previousOmpBin;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		if (previousWorktreeDir === undefined) delete process.env.OMP_WORKTREE_DIR;
		else process.env.OMP_WORKTREE_DIR = previousWorktreeDir;
	}
}

const messageEvent = `
const mockAudit = process.argv.includes("--tools");
const mockPair = process.argv.includes("--no-tools");
const mockUsage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoningTokens: 0, cost: { total: 0 } };
const mockEmit = (role, content, usage) => console.log(JSON.stringify({
	type: "message_end",
	message: { role, content, ...(usage ? { usage } : {}) },
}));
if (mockAudit) {
	for (let index = 0; index < 3; index += 1) {
		mockEmit("assistant", [{ type: "toolCall", name: "audit_probe", arguments: { command: ["bun", "-e", "console.log(1)"] } }], mockUsage);
		mockEmit("toolResult", [{ type: "text", text: "exit_code=0\\nstdout:\\n1\\nstderr:\\n" }]);
	}
}
const mockResponse = mockAudit
	? '{"probabilityPass": 90, "findings": [], "summary": "checked"}'
	: mockPair
		? '{"probabilityA": 100, "reason": "A adds."}'
		: "done";
mockEmit("assistant", [{ type: "text", text: mockResponse }], mockUsage);
`;

test("validates programmatic options before repository or verifier preflight", async () => {
	await expect(runBestOf({ ...options("/does/not-exist"), maxTime: "nonsense" })).rejects.toThrow("Invalid max time: nonsense");
	await expect(runBestOf({ ...options("/does/not-exist"), nEvaluations: Number.POSITIVE_INFINITY })).rejects.toThrow(
		"Verifier evaluations must be a positive safe integer",
	);
});
test("refuses a dirty parent before creating candidates", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-dirty-test-"));
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(path.join(repo, "untracked.txt"), "user work\n");
		await expect(runBestOf({ ...options(repo), apply: false, verify: false })).rejects.toThrow("requires a clean working tree");
		expect((await run(["git", "worktree", "list", "--porcelain"], repo)).match(/^worktree /gm)).toHaveLength(1);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});
test("enforces max time as the candidate wall-clock limit", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-timeout-test-"));
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(
			omp,
			`#!/usr/bin/env bun\nimport { mkdirSync } from "node:fs";\nif (!process.argv.includes("--no-tools")) { try { mkdirSync(process.env.TEST_TIMEOUT_LOCK); await Bun.sleep(3_000); } catch {} }\n${messageEvent}\n`,
		);
		await chmod(omp, 0o755);
		const previousLock = process.env.TEST_TIMEOUT_LOCK;
		process.env.TEST_TIMEOUT_LOCK = path.join(temporaryRoot, "slow-candidate");
		try {
			await withRunnerEnvironment(temporaryRoot, omp, async () => {
				const result = await runBestOf({ ...options(repo), apply: false, verify: false, maxTime: "1s" });
				expect(result.candidates.map((candidate) => candidate.timedOut).sort()).toEqual([false, true]);
				expect((await run(["git", "worktree", "list", "--porcelain"], repo)).match(/^worktree /gm)).toHaveLength(1);
			});
		} finally {
			if (previousLock === undefined) delete process.env.TEST_TIMEOUT_LOCK;
			else process.env.TEST_TIMEOUT_LOCK = previousLock;
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}, 15_000);
test("excludes failed candidates and reports an empty selected patch as not applied", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-result-test-"));
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(
			omp,
			`#!/usr/bin/env bun\nimport { mkdirSync } from "node:fs";\n${messageEvent}\nif (!process.argv.includes("--no-tools")) { try { mkdirSync(process.env.TEST_FIRST_LOCK); process.exitCode = 1; } catch {} }\n`,
		);
		await chmod(omp, 0o755);
		const previousLock = process.env.TEST_FIRST_LOCK;
		process.env.TEST_FIRST_LOCK = path.join(temporaryRoot, "first-candidate");
		try {
			await withRunnerEnvironment(temporaryRoot, omp, async () => {
				const result = await runBestOf(options(repo));
				const successful = result.candidates.find((candidate) => candidate.exitCode === 0);
				if (!successful) throw new Error("Expected one successful candidate");
				expect(result.candidates.map((candidate) => candidate.exitCode).sort()).toEqual([0, 1]);
				expect(result.selection).toEqual({ performed: true, winnerIndex: successful.index });
				expect(result.application).toEqual({ requested: true, applied: false });
				expect(await run(["git", "status", "--porcelain=v1", "--untracked-files=all"], repo)).toBe("");
				expect((await run(["git", "worktree", "list", "--porcelain"], repo)).match(/^worktree /gm)).toHaveLength(1);
			});
		} finally {
			if (previousLock === undefined) delete process.env.TEST_FIRST_LOCK;
			else process.env.TEST_FIRST_LOCK = previousLock;
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}, 15_000);
test("reports application only when the selected patch changes the parent", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-apply-test-"));
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(
			omp,
			`#!/usr/bin/env bun\nconst cwd = process.argv[process.argv.indexOf("--cwd") + 1];\nif (!process.argv.includes("--no-tools")) await Bun.write(cwd + "/candidate.txt", "selected\\n");\n${messageEvent}\n`,
		);
		await chmod(omp, 0o755);
		await withRunnerEnvironment(temporaryRoot, omp, async () => {
			const result = await runBestOf(options(repo));
			expect(result.selection.performed).toBe(true);
			expect(result.application).toEqual({ requested: true, applied: true });
			expect(await readFile(path.join(repo, "candidate.txt"), "utf8")).toBe("selected\n");
			expect((await run(["git", "worktree", "list", "--porcelain"], repo)).match(/^worktree /gm)).toHaveLength(1);
		});
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}, 15_000);

test("detects parent mutation during generation and still cleans workspaces", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-parent-test-"));
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(
			omp,
			`#!/usr/bin/env bun\nif (!process.argv.includes("--no-tools")) await Bun.write(process.env.TEST_PARENT_REPO + "/intrusion.txt", "mutated\\n");\n${messageEvent}\n`,
		);
		await chmod(omp, 0o755);
		const previousParent = process.env.TEST_PARENT_REPO;
		process.env.TEST_PARENT_REPO = repo;
		try {
			await withRunnerEnvironment(temporaryRoot, omp, async () => {
				await expect(runBestOf({ ...options(repo), apply: false, verify: false })).rejects.toThrow(
					"The parent checkout changed while candidates were running",
				);
				expect((await run(["git", "worktree", "list", "--porcelain"], repo)).match(/^worktree /gm)).toHaveLength(1);
			});
		} finally {
			if (previousParent === undefined) delete process.env.TEST_PARENT_REPO;
			else process.env.TEST_PARENT_REPO = previousParent;
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}, 15_000);

test("forwards sampled verifier progress using the existing verification progress shape", async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-runner-progress-test-"));
	const omp = path.join(temporaryRoot, "mock-omp.ts");
	try {
		const repo = await initializeRepository(temporaryRoot);
		await Bun.write(omp, `#!/usr/bin/env bun\n${messageEvent}\n`);
		await chmod(omp, 0o755);
		const verifierProgress: Array<{ message: string; completedCandidates: number; totalCandidates: number }> = [];
		await withRunnerEnvironment(temporaryRoot, omp, async () => {
			await runBestOf({
				...options(repo),
				apply: false,
				onProgress: (event) => {
					if (event.phase === "verifying" && /^(Audit|Comparison) /.test(event.message)) verifierProgress.push(event);
				},
			});
		});
		expect(verifierProgress.map((event) => event.message)).toEqual([
			"Audit 0/4",
			"Audit 1/4",
			"Audit 2/4",
			"Audit 3/4",
			"Audit 4/4",
			"Comparison 0/1",
			"Comparison 1/1",
		]);
		expect(verifierProgress.every((event) => event.completedCandidates === 2 && event.totalCandidates === 2)).toBe(true);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});
