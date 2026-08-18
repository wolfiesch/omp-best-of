export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export async function runCommand(
	command: string[],
	options: { cwd?: string; env?: Record<string, string | undefined>; stdin?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
	const proc = Bun.spawn(command, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdin: options.stdin === undefined ? "ignore" : "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});

	if (options.stdin !== undefined) {
		const stdin = proc.stdin;
		if (!stdin) throw new Error(`Failed to open stdin for ${command[0]}`);
		stdin.write(options.stdin);
		stdin.end();
	}

	let timer: NodeJS.Timeout | undefined;
	if (options.timeoutMs !== undefined) {
		timer = setTimeout(() => proc.kill("SIGTERM"), options.timeoutMs);
	}

	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

export async function requireCommand(command: string[], cwd?: string): Promise<string> {
	const result = await runCommand(command, { cwd });
	if (result.exitCode !== 0) {
		throw new Error(`${command[0]} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout;
}
