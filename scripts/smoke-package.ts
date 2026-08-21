import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as zod from "@oh-my-pi/omptype/zod";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { buildSkillPromptMessage, loadSkillsFromDir } from "@oh-my-pi/pi-coding-agent/extensibility/skills";

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
	const installedPackage = path.join(temporaryRoot, "node_modules", "omp-best-of");
	const loadedSkills = await loadSkillsFromDir({ dir: path.join(installedPackage, "skills"), source: "packed-smoke" });
	if (loadedSkills.warnings.length > 0) {
		throw new Error(`Packed skill loader warnings: ${loadedSkills.warnings.map((warning) => warning.message).join("; ")}`);
	}
	const skills = loadedSkills.skills.filter((skill) => skill.name === "bestof");
	if (skills.length !== 1) throw new Error(`Packed skill loader found ${skills.length} bestof skills`);
	const skillPrompt = await buildSkillPromptMessage(skills[0], "smoke");
	if (!skillPrompt.message.trim()) throw new Error("Packed bestof skill produced an empty prompt");
	// Dynamic import is the behavior under test: load the packed install, not this source tree.
	const { default: extension } = await import(pathToFileURL(path.join(installedPackage, "src", "extension.ts")).href);
	let commandName = "";
	let toolName = "";
	extension({
		setLabel() {},
		zod,
		getThinkingLevel: () => "",
		on() {},
		registerCommand(name: string) {
			commandName = name;
		},
		registerTool(definition: { name: string }) {
			toolName = definition.name;
		},
		sendMessage() {},
	} as unknown as ExtensionAPI);
	if (commandName !== "best-of" || toolName !== "best_of") {
		throw new Error("Packed plugin did not register its command and model-callable tool");
	}
	const help = await run([path.join(temporaryRoot, "node_modules", ".bin", "omp-best-of"), "--help"], temporaryRoot);
	if (!help.includes("Usage:") || !help.includes("--verifier-backend")) {
		throw new Error("Packed CLI help did not expose the expected command surface");
	}
	process.stdout.write("Packed CLI, extension tool, and skill smoke test passed\n");
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
