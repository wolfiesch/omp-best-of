import { describe, expect, test } from "bun:test";
import { parseJsonTranscript } from "../src/transcript";

describe("JSON event transcript", () => {
	test("keeps completed messages and aggregates billed usage", () => {
		const events = [
			{ type: "message_end", message: { role: "user", content: "Fix it" } },
			{
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "private" },
						{ type: "toolCall", name: "bash", arguments: { command: "bun test" } },
					],
				},
			},
			{ type: "message_end", message: { role: "toolResult", content: "1 pass" } },
			{
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Done" }],
					usage: {
						input: 100,
						output: 20,
						cacheRead: 50,
						cacheWrite: 5,
						reasoningTokens: 10,
						cost: { total: 0.012 },
					},
				},
			},
		]
			.map((event) => JSON.stringify(event))
			.join("\n");
		const parsed = parseJsonTranscript(events);
		expect(parsed.transcript).toContain("## user\nFix it");
		expect(parsed.finalResponse).toBe("Done");
		expect(parsed.recordedToolEvidence).toBe('[tool bash] {"command":"bun test"}\n\n## toolResult\n1 pass');
		expect(parsed.usage).toEqual({
			requests: 1,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 50,
			cacheWriteTokens: 5,
			reasoningTokens: 10,
			costUsd: 0.012,
		});
	});

	test("keeps thinking in evidence but excludes it from the final response", () => {
		const json = '{"probabilityPass":98,"findings":[],"summary":"checked"}';
		const events = JSON.stringify({
			type: "message_end",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "First inspect {candidate} before answering." },
					{ type: "text", text: json },
				],
			},
		});
		const parsed = parseJsonTranscript(events);
		expect(parsed.transcript).toContain("[thinking]\nFirst inspect {candidate} before answering.");
		expect(parsed.finalResponse).toBe(json);
	});
});
