import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const MAX_OUTPUT_CHARS = 12_000;
const MAX_PREFLIGHT_DIAGNOSTIC_CHARS = 1_000;
const DEFAULT_TIMEOUT_MS = 20_000;

interface AuditExecution {
	exitCode: number;
	stdout: string;
	stderr: string;
}

async function exists(file: string): Promise<boolean> {
	return access(file).then(
		() => true,
		() => false,
	);
}

function boundedDiagnostic(output: string): string {
	return output
		.trim()
		.replace(/\/[^\s"'`]+/g, "<path>")
		.replace(/\s+/g, " ")
		.slice(0, MAX_PREFLIGHT_DIAGNOSTIC_CHARS);
}

async function sandboxCommand(cwd: string, scratchDir: string, command: string[]): Promise<{ executable: string; args: string[] }> {
	const requested = command[0];
	const found = path.isAbsolute(requested) ? requested : Bun.which(requested);
	if (!found) throw new Error(`Executable not found: ${requested}`);
	const resolved = await realpath(found);
	const args = command.slice(1);
	if (process.platform === "linux") {
		const bwrap = Bun.which("bwrap", { PATH: process.env.PATH ?? "" });
		if (!bwrap) throw new Error("audit_probe requires bubblewrap on Linux");
		const runtimeDirectory = path.dirname(resolved);
		const sandboxRuntimeDirectory = "/audit-runtime";
		const sandboxExecutable = path.posix.join(sandboxRuntimeDirectory, path.basename(resolved));
		const mounts = ["/usr", "/bin", "/lib", "/lib64"]
			.filter((mount) => mount !== runtimeDirectory)
			.flatMap((mount) => ["--ro-bind-try", mount, mount]);
		return {
			executable: bwrap,
			args: [
				"--die-with-parent",
				"--new-session",
				"--unshare-all",
				"--clearenv",
				...mounts,
				"--dir",
				sandboxRuntimeDirectory,
				"--ro-bind",
				runtimeDirectory,
				sandboxRuntimeDirectory,
				"--ro-bind",
				cwd,
				"/workspace",
				"--dir",
				"/tmp",
				"--bind",
				scratchDir,
				"/tmp",
				"--proc",
				"/proc",
				"--dev",
				"/dev",
				"--setenv",
				"HOME",
				"/tmp",
				"--setenv",
				"TMPDIR",
				"/tmp",
				"--setenv",
				"PATH",
				"/audit-runtime:/usr/bin:/bin",
				"--setenv",
				"LANG",
				"C.UTF-8",
				"--chdir",
				"/workspace",
				"--",
				sandboxExecutable,
				...args,
			],
		};
	}
	if (process.platform === "darwin") {
		const sandboxExec = "/usr/bin/sandbox-exec";
		const escapeProfileString = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
		const escapedCwd = escapeProfileString(cwd);
		const escapedExecutable = escapeProfileString(resolved);
		const escapedHome = escapeProfileString(os.homedir());
		const escapedScratch = escapeProfileString(scratchDir);
		const profile = [
			"(version 1)",
			"(allow default)",
			"(deny network*)",
			"(deny mach-lookup)",
			"(deny signal)",
			"(deny appleevent-send)",
			"(deny iokit-open)",
			"(deny file-write*)",
			`(allow file-write* (subpath "${escapedScratch}"))`,
			`(deny file-read* (subpath "${escapedHome}"))`,
			`(allow file-read* (subpath "${escapedCwd}") (literal "${escapedExecutable}"))`,
		].join(" ");
		return { executable: sandboxExec, args: ["-p", profile, resolved, ...args] };
	}
	throw new Error(`audit_probe has no sandbox backend for ${process.platform}`);
}

async function executeSandboxedAudit(cwd: string, command: string[], timeoutMs: number, signal?: AbortSignal): Promise<AuditExecution> {
	if (!(await exists(cwd))) throw new Error("Candidate workspace does not exist");
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("audit_probe aborted");

	const scratchDir = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-audit-probe-"));
	let processExited: Promise<number> | undefined;
	let timer: Timer | undefined;
	let abort: (() => void) | undefined;
	let forceKillTimer: Timer | undefined;
	let terminationRequested = false;

	try {
		const sandbox = await sandboxCommand(cwd, scratchDir, command);
		if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("audit_probe aborted");

		const child = Bun.spawn([sandbox.executable, ...sandbox.args], {
			cwd,
			env: { HOME: scratchDir, LANG: "C.UTF-8", PATH: process.env.PATH ?? "/usr/bin:/bin", TMPDIR: scratchDir },
			stdout: "pipe",
			stderr: "pipe",
		});
		processExited = child.exited;

		const terminate = () => {
			if (terminationRequested) return;
			terminationRequested = true;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
		};
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				terminate();
				reject(new Error(`audit_probe timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});
		const cancellation = new Promise<never>((_, reject) => {
			abort = () => {
				terminate();
				reject(signal?.reason instanceof Error ? signal.reason : new Error("audit_probe aborted"));
			};
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
		});
		const [exitCode, stdout, stderr] = await Promise.race([
			Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]),
			timeout,
			cancellation,
		]);
		return { exitCode, stdout, stderr };
	} finally {
		clearTimeout(timer);
		if (abort) signal?.removeEventListener("abort", abort);
		if (terminationRequested) await processExited;
		clearTimeout(forceKillTimer);
		await rm(scratchDir, { recursive: true, force: true });
	}
}

export async function assertAuditSandboxSupported(cwd: string, signal?: AbortSignal): Promise<void> {
	const result = await executeSandboxedAudit(
		path.resolve(cwd),
		[process.execPath, "-e", 'process.stdout.write("audit-probe-sandbox-ok\\n")'],
		DEFAULT_TIMEOUT_MS,
		signal,
	);
	if (result.exitCode !== 0 || result.stdout !== "audit-probe-sandbox-ok\n") {
		const diagnostic = boundedDiagnostic(`${result.stderr}\n${result.stdout}`);
		const details = diagnostic ? ` Diagnostic: ${diagnostic}` : "";
		throw new Error(
			`audit_probe sandbox preflight failed (exit code ${result.exitCode}). Ensure bubblewrap can create an isolated namespace and the Bun runtime is executable.${details}`,
		);
	}
}

export default function auditProbeExtension(pi: ExtensionAPI): void {
	const { z } = pi.zod;
	pi.registerTool({
		name: "audit_probe",
		label: "Sandboxed audit probe",
		description:
			"Run one command against the candidate workspace in an OS sandbox. The workspace is read-only, user-home data and credentials are unavailable, network is disabled, and only a private scratch directory is writable. Pass argv directly without shell syntax.",
		approval: "exec",
		parameters: z.object({
			command: z.array(z.string()).min(1).max(64).describe('Command argv, for example ["bun","-e","console.log(1+1)"]'),
			timeoutMs: z.number().int().min(1).max(30_000).optional(),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const input = params as { command: string[]; timeoutMs?: number };
			const result = await executeSandboxedAudit(path.resolve(ctx.cwd), input.command, input.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal);
			const output = `exit_code=${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`.slice(0, MAX_OUTPUT_CHARS);
			return {
				content: [{ type: "text", text: output }],
				details: { exitCode: result.exitCode, command: input.command },
				isError: result.exitCode !== 0,
			};
		},
	});
}
