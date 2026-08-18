import path from "node:path";
import type { VerifierEndpoint } from "./model";
import { runCommand } from "./process";
import type { VerifierResult } from "./types";

export interface VerifyCandidatesInput {
	problem: string;
	candidates: string[];
	criteria: Record<string, string>;
	/** Endpoint and credential resolved from omp's registry, not from plugin-local env. */
	endpoint: VerifierEndpoint;
	nEvaluations: number;
	pivots: number;
	seed: number;
	cachePath: string;
}

export async function verifyCandidates(input: VerifyCandidatesInput): Promise<VerifierResult> {
	if (input.candidates.length < 2) {
		throw new Error("Verifier requires at least two candidates");
	}
	const { endpoint, ...payload } = input;
	const bridgePath = process.env.OMP_BEST_OF_VERIFIER_BRIDGE ?? path.resolve(import.meta.dir, "../python/verify.py");
	const command = process.env.OMP_BEST_OF_PYTHON
		? [process.env.OMP_BEST_OF_PYTHON, bridgePath]
		: ["uv", "run", "--with", "llm-verifier==0.2.0", "python", bridgePath];
	const result = await runCommand(command, {
		stdin: JSON.stringify({ ...payload, model: endpoint.model }),
		// `llm_verifier.create_client()` prefers OPENAI_BASE_URL, so this selects the
		// OpenAI-compatible path with the credential omp minted for that provider.
		env: { OPENAI_BASE_URL: endpoint.baseUrl, OPENAI_API_KEY: endpoint.apiKey },
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
