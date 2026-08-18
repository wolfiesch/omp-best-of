import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "bun:test";
import { prepareTaskRepo, scoreCandidate, visibleTestFiles } from "../bench/oracle";
import { requireCommand } from "../src/process";

const TASKS_ROOT = path.resolve(import.meta.dir, "../bench/tasks");
const taskIds = (await readdir(TASKS_ROOT, { withFileTypes: true }))
	.filter(entry => entry.isDirectory())
	.map(entry => entry.name)
	.sort();

/** Builds a real git patch by writing files into a scratch clone of the fixture. */
async function patchFor(taskDir: string, edits: { file: string; content: string }[]): Promise<string> {
	const scratch = await prepareTaskRepo(taskDir);
	try {
		for (const edit of edits) await Bun.write(path.join(scratch, edit.file), edit.content);
		await requireCommand(["git", "add", "-A"], scratch);
		return await requireCommand(["git", "diff", "--cached", "--binary", "HEAD"], scratch);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

test("every task ships a prompt, visible tests, an oracle, and a reference solution", () => {
	expect(taskIds.length).toBeGreaterThan(0);
});

for (const taskId of taskIds) {
	const taskDir = path.join(TASKS_ROOT, taskId);

	test(`${taskId}: the shipped visible tests pass`, async () => {
		const repoDir = await prepareTaskRepo(taskDir);
		try {
			const visible = await visibleTestFiles(taskDir);
			expect(visible.length).toBeGreaterThan(0);
			await requireCommand(["bun", "test", ...visible], repoDir);
		} finally {
			await rm(repoDir, { recursive: true, force: true });
		}
	});

	test(`${taskId}: the shipped bug fails the oracle`, async () => {
		const repoDir = await prepareTaskRepo(taskDir);
		try {
			// A comment-only patch leaves the shipped defect in place, so the oracle must reject it.
			const sources = (await readdir(path.join(taskDir, "repo"))).filter(entry => entry.endsWith(".js") && !entry.endsWith(".test.js"));
			expect(sources.length).toBe(1);
			const original = await Bun.file(path.join(taskDir, "repo", sources[0])).text();
			const patch = await patchFor(taskDir, [{ file: sources[0], content: `// untouched\n${original}` }]);
			const label = await scoreCandidate(taskDir, repoDir, patch);
			expect(label.passed).toBe(false);
		} finally {
			await rm(repoDir, { recursive: true, force: true });
		}
	});

	test(`${taskId}: the reference solution passes the oracle`, async () => {
		const repoDir = await prepareTaskRepo(taskDir);
		try {
			const references = await readdir(path.join(taskDir, "reference"));
			expect(references.length).toBe(1);
			const content = await Bun.file(path.join(taskDir, "reference", references[0])).text();
			const patch = await patchFor(taskDir, [{ file: references[0], content }]);
			const label = await scoreCandidate(taskDir, repoDir, patch);
			expect(label.passed).toBe(true);
		} finally {
			await rm(repoDir, { recursive: true, force: true });
		}
	});
}
