import { expect, test } from "bun:test";
import { chunkBytes } from "../stream-chunker.js";

async function collect(source, size) {
	const chunks = [];
	for await (const chunk of chunkBytes(source, size)) chunks.push(chunk);
	return chunks;
}

test("coalesces and splits across arbitrary boundaries", async () => {
	const chunks = await collect([
		Uint8Array.from([1, 2]),
		new Uint8Array(),
		Uint8Array.from([3, 4, 5, 6, 7]),
		Uint8Array.from([8]),
	], 3);
	expect(chunks.map(chunk => [...chunk])).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]);
});

test("outputs independent fresh storage", async () => {
	const first = Uint8Array.from([1, 2, 3]);
	const second = Uint8Array.from([4, 5, 6]);
	const chunks = await collect([first, second], 3);
	first.fill(9); second.fill(8);
	expect(chunks.map(chunk => [...chunk])).toEqual([[1, 2, 3], [4, 5, 6]]);
	expect(chunks[0].buffer).not.toBe(chunks[1].buffer);
	expect(chunks[0].buffer).not.toBe(first.buffer);
});

test("rejects invalid size before consuming", async () => {
	for (const size of [0, -1, 1.5, Infinity, NaN]) {
		let consumed = 0;
		const source = { async *[Symbol.asyncIterator]() { consumed += 1; yield Uint8Array.of(1); } };
		await expect(chunkBytes(source, size).next()).rejects.toThrow();
		expect(consumed).toBe(0);
	}
});

test("rejects non-byte inputs", async () => {
	await expect(collect([Uint8Array.of(1), [2, 3]], 2)).rejects.toThrow(TypeError);
});

test("propagates source failure and discards a partial chunk", async () => {
	const failure = new Error("source failed");
	const source = { async *[Symbol.asyncIterator]() { yield Uint8Array.from([1, 2, 3]); yield Uint8Array.of(4); throw failure; } };
	const iterator = chunkBytes(source, 3);
	await expect(iterator.next()).resolves.toEqual({ value: Uint8Array.from([1, 2, 3]), done: false });
	await expect(iterator.next()).rejects.toBe(failure);
});

test("handles empty sources", async () => {
	await expect(collect([], 2)).resolves.toEqual([]);
});
