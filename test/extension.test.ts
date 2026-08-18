import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import extension from "../src/extension";

test("registers the best-of slash command", () => {
	let label = "";
	let command = "";
	let description = "";
	const api = {
		setLabel(value: string) {
			label = value;
		},
		registerCommand(name: string, definition: { description: string }) {
			command = name;
			description = definition.description;
		},
	} as ExtensionAPI;
	extension(api);
	expect(label).toBe("OMP Best Of");
	expect(command).toBe("best-of");
	expect(description).toContain("LLM-as-a-Verifier");
});
