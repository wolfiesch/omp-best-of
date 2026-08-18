import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	buildSampledVerifierCacheKey,
	prepareSharedSampledVerifierCache,
	type SampledVerifierCacheIdentity,
	sampledVerifierCachePath,
} from "../src/verifier-cache";

function cacheIdentity(): SampledVerifierCacheIdentity {
	return {
		repositoryHead: "0123456789abcdef",
		task: "Implement exact interval merging.",
		criteria: { Correctness: "Merge only overlapping intervals." },
		candidates: ["candidate evidence A", "candidate evidence B"],
		model: "provider/model",
		thinking: "medium",
		nEvaluations: 3,
		seed: 17,
		candidateTools: [true, false],
	};
}

describe("shared sampled verifier cache", () => {
	test("uses one path across timestamped runs with identical identity", () => {
		const agentDirectory = path.join(os.tmpdir(), "omp-best-of-cache-agent");
		const identity = cacheIdentity();
		const firstRunId = "2026-08-18T12-00-00-000Z";
		const secondRunId = "2026-08-18T12-01-00-000Z";
		const firstPath = sampledVerifierCachePath(identity, agentDirectory);
		const secondPath = sampledVerifierCachePath(identity, agentDirectory);
		expect(firstRunId).not.toBe(secondRunId);
		expect(firstPath).toBe(secondPath);
		expect(firstPath).not.toContain(firstRunId);
		expect(secondPath).not.toContain(secondRunId);
	});

	test("invalidates for every sampled-verifier input dimension", () => {
		const identity = cacheIdentity();
		const key = buildSampledVerifierCacheKey(identity);
		const changes: SampledVerifierCacheIdentity[] = [
			{ ...identity, repositoryHead: "fedcba9876543210" },
			{ ...identity, task: "Implement exact interval splitting." },
			{ ...identity, candidates: ["candidate evidence A", "changed candidate evidence"] },
			{ ...identity, model: "provider/other-model" },
			{ ...identity, thinking: "high" },
			{ ...identity, nEvaluations: 4 },
			{ ...identity, seed: 18 },
			{ ...identity, candidateTools: [false, false] },
		];
		for (const changed of changes) expect(buildSampledVerifierCacheKey(changed)).not.toBe(key);
	});

	test("makes the shared directory and cache file private", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-cache-permissions-"));
		try {
			const cache = await prepareSharedSampledVerifierCache(cacheIdentity(), root);
			await writeFile(cache.path, "{}\n", { mode: 0o644 });
			await chmod(cache.path, 0o644);
			await prepareSharedSampledVerifierCache(cacheIdentity(), root);
			expect((await stat(path.dirname(cache.path))).mode & 0o777).toBe(0o700);
			expect((await stat(cache.path)).mode & 0o777).toBe(0o600);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("exposes only a non-secret cache reference in result metadata", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-cache-reference-"));
		const candidateRepositoryPath = path.join(root, "candidate-workspace");

		try {
			const cache = await prepareSharedSampledVerifierCache(cacheIdentity(), root);
			const persisted = JSON.stringify(cache.reference);
			expect(cache.reference).toEqual({ key: buildSampledVerifierCacheKey(cacheIdentity()), shared: true });
			expect(persisted).not.toContain(root);
			expect(persisted).not.toContain(candidateRepositoryPath);
			expect(persisted).not.toContain(os.homedir());
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
