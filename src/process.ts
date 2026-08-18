export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	aborted: boolean;
}

export interface CommandOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	stdin?: string;
	timeoutMs?: number;
	terminationGraceMs?: number;
	signal?: AbortSignal;
}

interface KillableProcess {
	pid: number;
	kill(signal?: number | NodeJS.Signals): void;
}

function signalProcessTree(proc: KillableProcess, signal: NodeJS.Signals): void {
	if (process.platform !== "win32") {
		try {
			process.kill(-proc.pid, signal);
			return;
		} catch {
			// The process may have exited between the check and the signal.
		}
	}
	try {
		proc.kill(signal);
	} catch {
		// Exit won the race.
	}
}

export async function runCommand(command: string[], options: CommandOptions = {}): Promise<CommandResult> {
	options.signal?.throwIfAborted();
	const proc = Bun.spawn(command, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdin: options.stdin === undefined ? "ignore" : "pipe",
		stdout: "pipe",
		stderr: "pipe",
		detached: process.platform !== "win32" && (options.timeoutMs !== undefined || options.signal !== undefined),
	});

	if (options.stdin !== undefined) {
		const stdin = proc.stdin;
		if (!stdin) throw new Error(`Failed to open stdin for ${command[0]}`);
		stdin.write(options.stdin);
		stdin.end();
	}

	let timedOut = false;
	let aborted = false;
	let timeoutTimer: NodeJS.Timeout | undefined;
	let killTimer: NodeJS.Timeout | undefined;
	const terminate = (): void => {
		signalProcessTree(proc, "SIGTERM");
		killTimer ??= setTimeout(() => signalProcessTree(proc, "SIGKILL"), options.terminationGraceMs ?? 2_000);
	};
	const onAbort = (): void => {
		aborted = true;
		terminate();
	};
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) onAbort();
	if (options.timeoutMs !== undefined) {
		timeoutTimer = setTimeout(() => {
			timedOut = true;
			terminate();
		}, options.timeoutMs);
	}

	try {
		const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		return { exitCode, stdout, stderr, timedOut, aborted };
	} finally {
		clearTimeout(timeoutTimer);
		clearTimeout(killTimer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

export async function requireCommand(command: string[], cwd?: string): Promise<string> {
	const result = await runCommand(command, { cwd });
	if (result.exitCode !== 0) {
		throw new Error(`${command[0]} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout;
}
