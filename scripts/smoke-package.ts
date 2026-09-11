import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function run(command: string[], cwd: string): Promise<string> {
	const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
	return stdout.trim();
}

const projectRoot = path.resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-package-smoke-"));
try {
	const packed = await run([process.execPath, "pm", "pack", "--destination", temporaryRoot, "--quiet"], projectRoot);
	const tarball = path.isAbsolute(packed) ? packed : path.resolve(projectRoot, packed);
	await access(tarball);
	const agentVersions = ["17.3.5", "18.1.17"] as const;
	for (const agentVersion of agentVersions) {
		const fixtureRoot = path.join(temporaryRoot, `omp-${agentVersion}`);
		await mkdir(fixtureRoot);
		await Bun.write(
			path.join(fixtureRoot, "package.json"),
			`${JSON.stringify(
				{
					private: true,
					dependencies: {
						"@oh-my-pi/pi-coding-agent": agentVersion,
						"omp-best-of": `file:${tarball}`,
					},
				},
				null,
				2,
			)}\n`,
		);
		await run([process.execPath, "install"], fixtureRoot);
		const help = await run([path.join(fixtureRoot, "node_modules", ".bin", "omp-best-of"), "--help"], fixtureRoot);
		if (!help.includes("Usage:") || !help.includes("--verifier-backend")) {
			throw new Error(`Packed CLI help did not expose the expected command surface with OMP ${agentVersion}`);
		}
	}
	process.stdout.write(`Packed CLI smoke test passed with OMP ${agentVersions.join(", ")}\n`);
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
