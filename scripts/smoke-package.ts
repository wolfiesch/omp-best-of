import { access, mkdtemp, rm } from "node:fs/promises";
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
	await Bun.write(
		path.join(temporaryRoot, "package.json"),
		`${JSON.stringify(
			{
				private: true,
				dependencies: {
					"@oh-my-pi/pi-coding-agent": "17.3.5",
					"omp-best-of": `file:${tarball}`,
				},
			},
			null,
			2,
		)}\n`,
	);
	await run([process.execPath, "install"], temporaryRoot);
	const help = await run([path.join(temporaryRoot, "node_modules", ".bin", "omp-best-of"), "--help"], temporaryRoot);
	if (!help.includes("Usage:") || !help.includes("--verifier-backend")) {
		throw new Error("Packed CLI help did not expose the expected command surface");
	}
	process.stdout.write("Packed CLI smoke test passed\n");
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
