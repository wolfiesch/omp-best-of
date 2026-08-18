import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { prepareTaskRepo, rescoreCandidates, scoreCandidate } from "../bench/oracle";
import { requireCommand } from "../src/process";

const taskDir = path.resolve(import.meta.dir, "../bench/tasks/interval-merge");
let repoDir = "";

/** Produces a real git patch by editing a scratch clone of the fixture. */
async function patchFor(edits: { file: string; content: string }[], removals: string[] = []): Promise<string> {
	const scratch = await prepareTaskRepo(taskDir);
	try {
		for (const edit of edits) await Bun.write(path.join(scratch, edit.file), edit.content);
		for (const removal of removals) await rm(path.join(scratch, removal), { force: true });
		await requireCommand(["git", "add", "-A"], scratch);
		return await requireCommand(["git", "diff", "--cached", "--binary", "HEAD"], scratch);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

const CORRECT = `export function mergeIntervals(intervals) {
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const merged = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last && interval.start <= last.end) {
			last.end = Math.max(last.end, interval.end);
			continue;
		}
		merged.push({ start: interval.start, end: interval.end });
	}
	return merged;
}
`;

/** Sorts a copy but still misses touching boundaries and contained intervals. */
const PARTIAL = `export function mergeIntervals(intervals) {
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const merged = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last && interval.start < last.end) {
			last.end = interval.end;
			continue;
		}
		merged.push({ start: interval.start, end: interval.end });
	}
	return merged;
}
`;

beforeAll(async () => {
	repoDir = await prepareTaskRepo(taskDir);
});

afterAll(async () => {
	if (repoDir) await rm(repoDir, { recursive: true, force: true });
});

test("labels an empty patch as failing", async () => {
	const label = await scoreCandidate(taskDir, repoDir, "");
	expect(label.passed).toBe(false);
	expect(label.detail).toBe("no repository changes");
});

test("labels a correct fix as passing", async () => {
	const patch = await patchFor([{ file: "intervals.js", content: CORRECT }]);
	const label = await scoreCandidate(taskDir, repoDir, patch);
	expect(label.passed).toBe(true);
});

test("labels a partial fix as failing", async () => {
	const patch = await patchFor([{ file: "intervals.js", content: PARTIAL }]);
	const label = await scoreCandidate(taskDir, repoDir, patch);
	expect(label.passed).toBe(false);
});

test("rescoring refreshes every stored patch against the current oracle", async () => {
	const correct = await patchFor([{ file: "intervals.js", content: CORRECT }]);
	const partial = await patchFor([{ file: "intervals.js", content: PARTIAL }]);
	const labels = await rescoreCandidates(taskDir, [correct, partial]);
	expect(labels.map(label => label.passed)).toEqual([true, false]);
});

test("restores visible tests so deleting them cannot buy a pass", async () => {
	const patch = await patchFor([{ file: "intervals.js", content: PARTIAL }], ["intervals.test.js"]);
	expect(patch).toContain("intervals.test.js");
	const label = await scoreCandidate(taskDir, repoDir, patch);
	expect(label.passed).toBe(false);
});

test("labels a patch that does not apply as failing", async () => {
	const label = await scoreCandidate(taskDir, repoDir, "diff --git a/nope.js b/nope.js\n--- a/nope.js\n+++ b/nope.js\n@@ -1 +1 @@\n-a\n+b\n");
	expect(label.passed).toBe(false);
	expect(label.detail).toContain("patch did not apply");
});
