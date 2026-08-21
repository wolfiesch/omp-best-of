import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as zod from "@oh-my-pi/omptype/zod";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import extension from "../src/extension";

interface ToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
	details?: { runId?: string; artifactDir?: string };
}

interface ToolContext {
	cwd: string;
	model: { provider: string; id: string } | undefined;
	modelRegistry: {
		getAll(): Promise<never[]>;
		getApiKeyForProvider(): Promise<undefined>;
	};
}

interface RegisteredTool {
	name: string;
	approval?: string;
	parameters: { safeParse(value: unknown): { success: boolean } };
	execute(
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: ((update: ToolResult) => void) | undefined,
		ctx: ToolContext,
	): Promise<ToolResult>;
}

interface CapturedExtension {
	label: string;
	commandName: string;
	commandDescription: string;
	tool: RegisteredTool;
}

function runExtension(): CapturedExtension {
	let label = "";
	let commandName = "";
	let commandDescription = "";
	let tool: RegisteredTool | undefined;
	const api = {
		setLabel(value: string) {
			label = value;
		},
		zod,
		getThinkingLevel: () => "",
		on() {},
		registerCommand(name: string, definition: { description: string }) {
			commandName = name;
			commandDescription = definition.description;
		},
		registerTool(definition: RegisteredTool) {
			tool = definition;
		},
		sendMessage() {},
	} as unknown as ExtensionAPI;
	extension(api);
	if (!tool) throw new Error("best_of did not register");
	return { label, commandName, commandDescription, tool };
}

const toolContext = (cwd: string): ToolContext => ({
	cwd,
	model: undefined,
	modelRegistry: {
		getAll: async () => [],
		getApiKeyForProvider: async () => undefined,
	},
});

function resultText(result: ToolResult): string {
	return result.content.map((part) => part.text).join("\n");
}

async function runCommand(command: string[], cwd: string): Promise<void> {
	const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (exitCode !== 0) throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr}`);
}

test("registers the best-of slash command and the best_of tool", () => {
	const captured = runExtension();
	expect(captured.label).toBe("OMP Best Of");
	expect(captured.commandName).toBe("best-of");
	expect(captured.commandDescription).toContain("LLM-as-a-Verifier");
	expect(captured.tool.name).toBe("best_of");
	expect(captured.tool.approval).toBe("exec");
});

test("tool schema accepts arbitrary model selectors and rejects unknown backends", () => {
	const { parameters } = runExtension().tool;
	expect(
		parameters.safeParse({
			task: "Add a regression test for the flow",
			model: "acme-custom/foundry-model-x9",
			verifierModel: "another-vendor/specialised-judge",
			verifierBackend: "sampled",
		}).success,
	).toBe(true);
	expect(parameters.safeParse({ task: "Task", verifierBackend: "vendor-specific" }).success).toBe(false);
});

test("tool treats dash-prefixed tasks literally and only explicit apply requests application", async () => {
	const cwd = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-extension-test-"));
	try {
		const { tool } = runExtension();
		const defaultApply = await tool.execute(
			"default-apply",
			{ task: "--fix parser", verify: false },
			undefined,
			undefined,
			toolContext(cwd),
		);
		expect(defaultApply.isError).toBe(true);
		expect(resultText(defaultApply)).toContain("not a git repository");
		expect(resultText(defaultApply)).not.toContain("Unknown option");

		const explicitApply = await tool.execute(
			"explicit-apply",
			{ task: "Fix parser", apply: true, verify: false },
			undefined,
			undefined,
			toolContext(cwd),
		);
		expect(explicitApply.isError).toBe(true);
		expect(resultText(explicitApply)).toContain("cannot be applied without verification");
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("tool returns ordinary failures and rethrows a pre-existing abort reason", async () => {
	const { tool } = runExtension();
	const failure = await tool.execute("failure", { task: "" }, undefined, undefined, toolContext("/does-not-matter"));
	expect(failure.isError).toBe(true);
	expect(resultText(failure)).toContain("Usage:");

	const controller = new AbortController();
	const reason = new DOMException("cancelled by caller", "AbortError");
	controller.abort(reason);
	try {
		await tool.execute("abort", { task: "Task" }, controller.signal, undefined, toolContext("/does-not-matter"));
		throw new Error("expected best_of to reject");
	} catch (error) {
		expect(error).toBe(reason);
	}
});

test("tool runs with arbitrary model selectors and reports the run ID in model-visible content", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "omp-best-of-extension-run-test-"));
	const repo = path.join(root, "repo");
	const mockOmp = path.join(root, "mock-omp.ts");
	const invocationLog = path.join(root, "invocations.jsonl");
	const previousEnvironment = {
		ompBin: process.env.OMP_BEST_OF_OMP_BIN,
		agentDir: process.env.PI_CODING_AGENT_DIR,
		worktreeDir: process.env.OMP_WORKTREE_DIR,
		mockLog: process.env.OMP_BEST_OF_TEST_INVOCATIONS,
	};
	try {
		await runCommand(["git", "init", "-q", repo], root);
		await Bun.write(path.join(repo, "tracked.txt"), "baseline\n");
		await runCommand(["git", "add", "tracked.txt"], repo);
		await runCommand(["git", "-c", "user.name=OMP Test", "-c", "user.email=omp@example.invalid", "commit", "-qm", "baseline"], repo);
		await Bun.write(
			mockOmp,
			`#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
await appendFile(process.env.OMP_BEST_OF_TEST_INVOCATIONS, JSON.stringify(process.argv) + "\\n");
console.log(JSON.stringify({
	type: "message_end",
	message: {
		role: "assistant",
		content: [{ type: "text", text: "done" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoningTokens: 0, cost: { total: 0 } },
	},
}));
`,
		);
		await chmod(mockOmp, 0o755);
		process.env.OMP_BEST_OF_OMP_BIN = mockOmp;
		process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
		process.env.OMP_WORKTREE_DIR = path.join(root, "workspaces");
		process.env.OMP_BEST_OF_TEST_INVOCATIONS = invocationLog;

		const updates: ToolResult[] = [];
		const result = await runExtension().tool.execute(
			"successful-run",
			{ task: "Exercise the tool", n: 2, model: "acme/custom-model", thinking: "low", verify: false },
			undefined,
			(update) => updates.push(update),
			toolContext(repo),
		);
		expect(result.isError).toBeUndefined();
		expect(result.details?.runId).toBeString();
		expect(resultText(result)).toContain(`Run: ${result.details?.runId}`);
		expect(resultText(result)).toContain(`Artifacts: ${result.details?.artifactDir}`);
		expect(updates.length).toBeGreaterThan(0);

		const invocations = (await Bun.file(invocationLog).text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as string[]);
		expect(invocations).toHaveLength(2);
		for (const invocation of invocations) {
			expect(invocation).toContain("acme/custom-model");
			expect(invocation).toContain("low");
		}
	} finally {
		if (previousEnvironment.ompBin === undefined) delete process.env.OMP_BEST_OF_OMP_BIN;
		else process.env.OMP_BEST_OF_OMP_BIN = previousEnvironment.ompBin;
		if (previousEnvironment.agentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousEnvironment.agentDir;
		if (previousEnvironment.worktreeDir === undefined) delete process.env.OMP_WORKTREE_DIR;
		else process.env.OMP_WORKTREE_DIR = previousEnvironment.worktreeDir;
		if (previousEnvironment.mockLog === undefined) delete process.env.OMP_BEST_OF_TEST_INVOCATIONS;
		else process.env.OMP_BEST_OF_TEST_INVOCATIONS = previousEnvironment.mockLog;
		await rm(root, { recursive: true, force: true });
	}
});
