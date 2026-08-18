import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 20_000;

async function exists(file: string): Promise<boolean> {
	return access(file).then(
		() => true,
		() => false,
	);
}

async function sandboxCommand(cwd: string, scratchDir: string, command: string[]): Promise<{ executable: string; args: string[] }> {
	const requested = command[0];
	const found = path.isAbsolute(requested) ? requested : Bun.which(requested);
	if (!found) throw new Error(`Executable not found: ${requested}`);
	const resolved = await realpath(found);
	const args = command.slice(1);
	if (process.platform === "linux") {
		const bwrap = Bun.which("bwrap");
		if (!bwrap) throw new Error("audit_probe requires bubblewrap on Linux");
		const mounts = ["/usr", "/bin", "/lib", "/lib64"]
			.filter((mount) => mount !== path.dirname(resolved))
			.flatMap((mount) => ["--ro-bind-try", mount, mount]);
		const sandboxExecutable = "/audit-bin/executable";
		return {
			executable: bwrap,
			args: [
				"--die-with-parent",
				"--new-session",
				"--unshare-all",
				"--clearenv",
				...mounts,
				"--dir",
				"/audit-bin",
				"--ro-bind",
				resolved,
				sandboxExecutable,
				"--ro-bind",
				cwd,
				"/workspace",
				"--tmpfs",
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
				"/audit-bin:/usr/bin:/bin",
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
			const cwd = path.resolve(ctx.cwd);
			const input = params as { command: string[]; timeoutMs?: number };
			if (!(await exists(cwd))) throw new Error("Candidate workspace does not exist");
			const scratchDir = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-audit-probe-"));
			const sandbox = await sandboxCommand(cwd, scratchDir, input.command);
			const child = Bun.spawn([sandbox.executable, ...sandbox.args], {
				cwd,
				env: { HOME: scratchDir, LANG: "C.UTF-8", PATH: process.env.PATH ?? "/usr/bin:/bin", TMPDIR: scratchDir },
				stdout: "pipe",
				stderr: "pipe",
			});
			const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const abort = () => child.kill("SIGTERM");
			signal?.addEventListener("abort", abort, { once: true });
			try {
				const timeout = new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						child.kill("SIGTERM");
						reject(new Error(`audit_probe timed out after ${timeoutMs}ms`));
					}, timeoutMs);
				});
				const [exitCode, stdout, stderr] = await Promise.race([
					Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]),
					timeout,
				]);
				const output = `exit_code=${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`.slice(0, MAX_OUTPUT_CHARS);
				return {
					content: [{ type: "text", text: output }],
					details: { exitCode, command: input.command },
					isError: exitCode !== 0,
				};
			} finally {
				if (timer) clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				await rm(scratchDir, { recursive: true, force: true });
			}
		},
	});
}
