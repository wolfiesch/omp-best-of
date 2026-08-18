import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REDACTED = "[REDACTED]";
const EXTERNAL_PATH = "[external]";
const SENSITIVE_NAME = /(?:api[-_]?key|token|secret|password|authorization|credential|access[-_]?key|private[-_]?key)/i;
const SENSITIVE_VALUE = /(?:\b(?:sk|ghp|gho|github_pat)[_-][A-Za-z0-9_-]{8,}\b|\b(?:bearer|api[-_]?key|token|secret|password)\s*[=:]\s*\S+)/i;
const HOME_PATH_IN_TEXT = /\/(?:Users|home)\/[^/\s"'`]+(?:\/[^\s"'`]+)*/g;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface BenchmarkManifestInput {
	runId: string;
	repositoryRoot: string;
	source: { sha: string; dirty: boolean };
	omp: { resolvedPath: string; sha256: string; version: string };
	runtime: { bunVersion: string; platform: string };
	parsedOptions: Record<string, unknown>;
	taskIds: readonly string[];
	mode: string;
	reuseRunId: string;
	intendedArtifactRoot: string;
	argv: readonly string[];
	startedAt: string;
	externalWrapperTimeout?: string;
}

interface BenchmarkCachePolicy {
	applicationCache: { state: "fresh" | "reuse"; sourceRunId: string | null };
	providerCache: { state: "uncontrolled" };
	generationReuse: { state: "fresh" | "reused"; sourceRunId: string | null };
}

export interface BenchmarkManifest {
	schemaVersion: 1;
	status: "started" | "completed" | "failed";
	runId: string;
	startedAt: string;
	completedAt?: string;
	source: { sha: string; dirty: boolean };
	omp: { resolvedPath: string; sha256: string; version: string };
	runtime: { bunVersion: string; platform: string };
	parsedOptions: Record<string, JsonValue>;
	taskIds: string[];
	run: { mode: string } & BenchmarkCachePolicy;
	intendedArtifactRoot: string;
	externalWrapperTimeout: string;
	argv: string[];
	identitySha256: string;
}

function isInsideRepository(candidate: string, repositoryRoot: string): boolean {
	const relative = path.relative(repositoryRoot, candidate);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Converts absolute paths into repository-relative or non-identifying external representations. */
export function normalizeRepositoryPath(value: string, repositoryRoot: string): string {
	if (!path.isAbsolute(value)) return value;
	if (isInsideRepository(value, repositoryRoot)) {
		return path.relative(repositoryRoot, value).split(path.sep).join("/") || ".";
	}
	return `${EXTERNAL_PATH}/${path.basename(value)}`;
}
function sanitizeString(value: string, repositoryRoot: string): string {
	if (SENSITIVE_VALUE.test(value)) return REDACTED;
	if (path.isAbsolute(value)) return normalizeRepositoryPath(value, repositoryRoot);
	const equals = value.indexOf("=");
	if (equals > 0 && path.isAbsolute(value.slice(equals + 1))) {
		return `${value.slice(0, equals + 1)}${normalizeRepositoryPath(value.slice(equals + 1), repositoryRoot)}`;
	}
	return value.replace(HOME_PATH_IN_TEXT, EXTERNAL_PATH);
}

function sanitizeValue(value: unknown, repositoryRoot: string): JsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") return sanitizeString(value, repositoryRoot);
	if (Array.isArray(value)) return value.map(entry => sanitizeValue(entry, repositoryRoot));
	if (typeof value === "object") {
		const sanitized: { [key: string]: JsonValue } = {};
		for (const [key, entry] of Object.entries(value)) {
			sanitized[key] = SENSITIVE_NAME.test(key) ? REDACTED : sanitizeValue(entry, repositoryRoot);
		}
		return sanitized;
	}
	return String(value);
}

/** Removes secrets and converts retained absolute paths to stable, non-identifying forms. */
export function sanitizeBenchmarkOptions(options: Record<string, unknown>, repositoryRoot: string): Record<string, JsonValue> {
	return sanitizeValue(options, repositoryRoot) as Record<string, JsonValue>;
}

/** Removes secrets and home paths from the command line persisted with a benchmark run. */
export function sanitizeBenchmarkArgv(argv: readonly string[], repositoryRoot: string): string[] {
	const sanitized: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const equals = argument.indexOf("=");
		const name = equals === -1 ? argument : argument.slice(0, equals);
		if (SENSITIVE_NAME.test(name)) {
			sanitized.push(equals === -1 ? name : `${name}=${REDACTED}`);
			if (equals === -1 && index + 1 < argv.length) {
				sanitized.push(REDACTED);
				index += 1;
			}
			continue;
		}
		sanitized.push(sanitizeString(argument, repositoryRoot));
	}
	return sanitized;
}

/** Produces deterministic JSON with sorted object keys and preserved array order. */
export function canonicalizeJson(value: JsonValue): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.map(key => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
		.join(",")}}`;
}

export function sha256Canonical(value: JsonValue): string {
	return createHash("sha256").update(canonicalizeJson(value)).digest("hex");
}

export function benchmarkCachePolicy(reuseRunId: string): BenchmarkCachePolicy {
	return reuseRunId
		? {
				applicationCache: { state: "reuse", sourceRunId: reuseRunId },
				providerCache: { state: "uncontrolled" },
				generationReuse: { state: "reused", sourceRunId: reuseRunId },
			}
		: {
				applicationCache: { state: "fresh", sourceRunId: null },
				providerCache: { state: "uncontrolled" },
				generationReuse: { state: "fresh", sourceRunId: null },
			};
}

/** Builds a secret-free manifest. Its identity excludes run timestamps and IDs by design. */
export function buildBenchmarkManifest(input: BenchmarkManifestInput): BenchmarkManifest {
	const parsedOptions = sanitizeBenchmarkOptions(input.parsedOptions, input.repositoryRoot);
	const argv = sanitizeBenchmarkArgv(input.argv, input.repositoryRoot);
	const run = benchmarkCachePolicy(input.reuseRunId);
	const intendedArtifactRoot = normalizeRepositoryPath(input.intendedArtifactRoot, input.repositoryRoot);
	const omp = {
		resolvedPath: normalizeRepositoryPath(input.omp.resolvedPath, input.repositoryRoot),
		sha256: input.omp.sha256,
		version: input.omp.version,
	};
	const identitySha256 = sha256Canonical({
		taskIds: [...input.taskIds],
		options: parsedOptions,
		config: {
			mode: input.mode,
			run: {
				applicationCache: {
					state: run.applicationCache.state,
					sourceRunId: run.applicationCache.sourceRunId,
				},
				providerCache: { state: run.providerCache.state },
				generationReuse: {
					state: run.generationReuse.state,
					sourceRunId: run.generationReuse.sourceRunId,
				},
			},
			intendedArtifactRoot,
			externalWrapperTimeout: input.externalWrapperTimeout ?? "unrecorded",
		},
	});
	return {
		schemaVersion: 1,
		status: "started",
		runId: input.runId,
		startedAt: input.startedAt,
		source: input.source,
		omp,
		runtime: input.runtime,
		parsedOptions,
		taskIds: [...input.taskIds],
		run: { mode: input.mode, ...run },
		intendedArtifactRoot,
		externalWrapperTimeout: input.externalWrapperTimeout ?? "unrecorded",
		argv,
		identitySha256,
	};
}

/** Persists the fully built manifest before provider work begins. */
export async function writeBenchmarkManifest(manifestPath: string, manifest: BenchmarkManifest): Promise<void> {
	await mkdir(path.dirname(manifestPath), { recursive: true });
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
