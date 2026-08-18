import { expect, test } from "bun:test";
import { chunkBytes } from "./stream-chunker.js";

test("yields one short input", async () => {
	const chunks = [];
	for await (const chunk of chunkBytes([Uint8Array.from([1, 2])], 4)) chunks.push([...chunk]);
	expect(chunks).toEqual([[1, 2]]);
});
