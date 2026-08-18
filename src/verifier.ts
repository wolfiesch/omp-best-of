import path from "node:path";
import { runCommand } from "./process";
import type { VerifierResult } from "./types";

export interface VerifyCandidatesInput {
	problem: string;
	candidates: string[];
	criteria: Record<string, string>;
	model: string;
	nEvaluations: number;
	pivots: number;
	seed: number;
	cachePath: string;
}

async function resolveDeepSeekKey(): Promise<string> {
	if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
	const token = await runCommand(["omp", "token", "deepseek", "--raw"]);
	if (token.exitCode !== 0 || !token.stdout.trim()) {
		throw new Error("DeepSeek authentication is unavailable. Run `omp setup` or set DEEPSEEK_API_KEY.");
	}
	return token.stdout.trim();
}

export async function verifyCandidates(input: VerifyCandidatesInput): Promise<VerifierResult> {
	if (input.candidates.length < 2) {
		throw new Error("Verifier requires at least two candidates");
	}
	const key = await resolveDeepSeekKey();
	const bridgePath = process.env.OMP_BEST_OF_VERIFIER_BRIDGE ?? path.resolve(import.meta.dir, "../python/verify.py");
	const command = process.env.OMP_BEST_OF_PYTHON
		? [process.env.OMP_BEST_OF_PYTHON, bridgePath]
		: ["uv", "run", "--with", "llm-verifier==0.2.0", "python", bridgePath];
	const result = await runCommand(command, {
		stdin: JSON.stringify(input),
		env: { DEEPSEEK_API_KEY: key },
	});
	if (result.exitCode !== 0) {
		throw new Error(`Verifier failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
	}
	try {
		return JSON.parse(result.stdout) as VerifierResult;
	} catch {
		throw new Error(`Verifier returned invalid JSON: ${result.stdout.slice(0, 500)}`);
	}
}
