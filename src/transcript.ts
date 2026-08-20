import type { UsageSummary } from "./types";

const EMPTY_USAGE: UsageSummary = {
	requests: 0,
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	reasoningTokens: 0,
	costUsd: 0,
};

interface ParsedTranscript {
	transcript: string;
	finalResponse: string;
	recordedToolEvidence: string;
	usage: UsageSummary;
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const value = part as Record<string, unknown>;
			if (typeof value.text === "string") return value.text;
			if (typeof value.thinking === "string") return `[thinking]\n${value.thinking}`;
			if (value.type === "toolCall") return `[tool ${String(value.name ?? "unknown")}] ${JSON.stringify(value.arguments)}`;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}
function assistantResponseText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const text = (part as Record<string, unknown>).text;
			return typeof text === "string" ? text : "";
		})
		.filter(Boolean)
		.join("\n");
}

function numberAt(value: unknown, key: string): number {
	if (!value || typeof value !== "object") return 0;
	const found = (value as Record<string, unknown>)[key];
	return typeof found === "number" && Number.isFinite(found) ? found : 0;
}

export function parseJsonTranscript(stdout: string): ParsedTranscript {
	const sections: string[] = [];
	let finalResponse = "";
	const usage = { ...EMPTY_USAGE };
	const recordedToolEvidence: string[] = [];

	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (event.type !== "message_end" || !event.message || typeof event.message !== "object") continue;
		const message = event.message as Record<string, unknown>;
		const role = typeof message.role === "string" ? message.role : String(message.type ?? "message");
		const text = contentText(message.content);
		if (role === "assistant" && Array.isArray(message.content)) {
			for (const part of message.content) {
				if (!part || typeof part !== "object") continue;
				const value = part as Record<string, unknown>;
				if (value.type === "toolCall") {
					recordedToolEvidence.push(`[tool ${String(value.name ?? "unknown")}] ${JSON.stringify(value.arguments)}`);
				}
			}
		} else if (role === "toolResult" && text) {
			recordedToolEvidence.push(`## toolResult\n${text}`);
		}
		if (text) sections.push(`## ${role}\n${text}`);
		if (role === "assistant") {
			const response = assistantResponseText(message.content);
			if (response) finalResponse = response;
		}

		if (message.usage && typeof message.usage === "object") {
			const messageUsage = message.usage as Record<string, unknown>;
			usage.requests += 1;
			usage.inputTokens += numberAt(messageUsage, "input");
			usage.outputTokens += numberAt(messageUsage, "output");
			usage.cacheReadTokens += numberAt(messageUsage, "cacheRead");
			usage.cacheWriteTokens += numberAt(messageUsage, "cacheWrite");
			usage.reasoningTokens += numberAt(messageUsage, "reasoningTokens");
			usage.costUsd += numberAt(messageUsage.cost, "total");
		}
	}

	return { transcript: sections.join("\n\n"), finalResponse, recordedToolEvidence: recordedToolEvidence.join("\n\n"), usage };
}
