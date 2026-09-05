import { expect, test } from "bun:test";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as zod from "@oh-my-pi/omptype/zod";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import auditProbeExtension, { assertAuditSandboxSupported } from "../src/audit-probe-extension";

const sandboxTest = process.platform === "linux" || process.platform === "darwin" ? test : test.skip;
const scratchPrefix = "omp-best-of-audit-probe-";

interface AuditToolResult {
	isError: boolean;
	details: { exitCode: number; command: string[] };
}

interface AuditTool {
	execute(
		toolCallId: string,
		params: { command: string[]; timeoutMs?: number },
		signal: AbortSignal | undefined,
		onUpdate: () => void,
		ctx: { cwd: string },
	): Promise<AuditToolResult>;
}

function auditTool(): AuditTool {
	let tool: AuditTool | undefined;
	const api = {
		zod,
		registerTool(definition: AuditTool) {
			tool = definition;
		},
	} as unknown as ExtensionAPI;
	auditProbeExtension(api);
	if (!tool) throw new Error("audit_probe did not register");
	return tool;
}

async function execute(cwd: string, command: string[], timeoutMs?: number): Promise<AuditToolResult> {
	return auditTool().execute("audit-probe-test", { command, timeoutMs }, undefined, () => {}, { cwd });
}

async function withWorkspace<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-audit-probe-test-"));
	try {
		return await callback(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

async function scratchDirectories(): Promise<string[]> {
	return (await readdir(os.tmpdir())).filter((entry) => entry.startsWith(scratchPrefix));
}

async function expectScratchDirectoriesRemoved(action: () => Promise<void>): Promise<void> {
	const before = new Set(await scratchDirectories());
	try {
		await action();
	} finally {
		const created = (await scratchDirectories()).filter((entry) => !before.has(entry));
		expect(created).toEqual([]);
	}
}

sandboxTest(
	"preflight and valid commands succeed and clean scratch state",
	async () => {
		await withWorkspace(async (cwd) => {
			await expectScratchDirectoriesRemoved(async () => {
				await expect(assertAuditSandboxSupported(cwd)).resolves.toBeUndefined();
			});
			await expectScratchDirectoriesRemoved(async () => {
				const result = await execute(cwd, [process.execPath, "-e", 'process.stdout.write("ok")']);
				expect(result.isError).toBe(false);
				expect(result.details.exitCode).toBe(0);
			});
		});
	},
	15_000,
);

sandboxTest(
	"preflight reports the configured runtime, empty streams, and terminating signal",
	async () => {
		await withWorkspace(async (cwd) => {
			const runtime = path.join(cwd, "fake-bun");
			await writeFile(runtime, "#!/bin/sh\nexit 129\n");
			await chmod(runtime, 0o755);
			const previousRuntime = process.env.OMP_BEST_OF_BUN_BIN;
			process.env.OMP_BEST_OF_BUN_BIN = runtime;
			try {
				await expectScratchDirectoriesRemoved(async () => {
					const failure = assertAuditSandboxSupported(cwd);
					await expect(failure).rejects.toThrow('Payload: ["fake-bun","-e"');
					await expect(failure).rejects.toThrow("stderr=<empty>; stdout=<empty>.");
					await expect(failure).rejects.toThrow("Possible signal: SIGHUP.");
				});
			} finally {
				if (previousRuntime === undefined) delete process.env.OMP_BEST_OF_BUN_BIN;
				else process.env.OMP_BEST_OF_BUN_BIN = previousRuntime;
			}
		});
	},
	15_000,
);

sandboxTest(
	"workspace writes fail without changing bytes and clean scratch state",
	async () => {
		await withWorkspace(async (cwd) => {
			const protectedFile = path.join(cwd, "protected.txt");
			await writeFile(protectedFile, "original bytes\n");
			await expectScratchDirectoriesRemoved(async () => {
				const result = await execute(cwd, [process.execPath, "-e", 'await Bun.write("protected.txt", "changed")']);
				expect(result.isError).toBe(true);
			});
			expect(await readFile(protectedFile, "utf8")).toBe("original bytes\n");
		});
	},
	15_000,
);

sandboxTest(
	"user-home reads fail and clean scratch state",
	async () => {
		await withWorkspace(async (cwd) => {
			const script = `import { readdirSync } from "node:fs"; readdirSync(${JSON.stringify(os.homedir())});`;
			await expectScratchDirectoriesRemoved(async () => {
				const result = await execute(cwd, [process.execPath, "-e", script]);
				expect(result.isError).toBe(true);
			});
		});
	},
	15_000,
);

sandboxTest(
	"outbound network access fails without DNS and cleans scratch state",
	async () => {
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				return new Response("reachable");
			},
		});
		try {
			await withWorkspace(async (cwd) => {
				const url = `http://127.0.0.1:${server.port}/`;
				const script = `try { const response = await fetch(${JSON.stringify(url)}); if (!response.ok) process.exitCode = 1; } catch { process.exitCode = 1; }`;
				await expectScratchDirectoriesRemoved(async () => {
					const result = await execute(cwd, [process.execPath, "-e", script]);
					expect(result.isError).toBe(true);
				});
			});
		} finally {
			server.stop(true);
		}
	},
	15_000,
);

sandboxTest(
	"unknown executables are rejected and clean scratch state",
	async () => {
		await withWorkspace(async (cwd) => {
			await expectScratchDirectoriesRemoved(async () => {
				await expect(execute(cwd, ["omp-best-of-definitely-missing-executable"])).rejects.toThrow("Executable not found");
			});
		});
	},
	15_000,
);

sandboxTest(
	"timeouts terminate sandbox execution and clean scratch state",
	async () => {
		await withWorkspace(async (cwd) => {
			await expectScratchDirectoriesRemoved(async () => {
				// This integration probe needs a real child process to remain alive until the sandbox timeout terminates it.
				await expect(execute(cwd, [process.execPath, "-e", "setInterval(() => {}, 1_000)"], 50)).rejects.toThrow(
					"audit_probe timed out after 50ms",
				);
			});
		});
	},
	15_000,
);
