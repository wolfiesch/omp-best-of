import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyCandidates } from "../src/verifier";

const cacheDir = path.join(os.tmpdir(), "omp-best-of-smoke");
await mkdir(cacheDir, { recursive: true });
const result = await verifyCandidates({
	problem: "Implement a JavaScript function add(a, b) that returns the arithmetic sum.",
	candidates: [
		"Implemented `function add(a, b) { return a + b; }` and verified add(2, 3) returns 5.",
		"Implemented `function add(a, b) { return a - b; }` and did not run a test.",
	],
	criteria: { Correctness: "Does the implementation return the arithmetic sum, supported by the stated verification?" },
	model: "deepseek-v4-flash",
	nEvaluations: 1,
	pivots: 1,
	seed: 0,
	cachePath: path.join(cacheDir, "scores.json"),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.index !== 0) process.exitCode = 1;
