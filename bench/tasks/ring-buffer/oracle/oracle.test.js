import { expect, test } from "bun:test";
import { RingBuffer } from "../ring-buffer.js";

test("overwrites the oldest value and wraps repeatedly", () => {
	const buffer = new RingBuffer(3);
	expect(buffer.push("a")).toBeUndefined();
	buffer.push("b"); buffer.push("c");
	expect(buffer.push("d")).toBe("a");
	expect([...buffer]).toEqual(["b", "c", "d"]);
	expect(buffer.push("e")).toBe("b");
	expect(buffer.shift()).toBe("c");
	buffer.push("f"); buffer.push("g");
	expect([...buffer]).toEqual(["e", "f", "g"]);
	expect(buffer.size).toBe(3);
});

test("iterators are snapshots", () => {
	const buffer = new RingBuffer(3);
	buffer.push(1); buffer.push(2); buffer.push(3);
	const iterator = buffer[Symbol.iterator]();
	buffer.shift(); buffer.push(4); buffer.clear();
	expect([...iterator]).toEqual([1, 2, 3]);
	expect([...buffer]).toEqual([]);
});

test("peek, shift, and clear preserve invariants", () => {
	const buffer = new RingBuffer(2);
	expect(buffer.capacity).toBe(2);
	expect(buffer.peek()).toBeUndefined();
	expect(buffer.shift()).toBeUndefined();
	const value = { id: 1 };
	buffer.push(value); buffer.push(undefined);
	expect(buffer.peek()).toBe(value);
	expect(buffer.size).toBe(2);
	expect(buffer.shift()).toBe(value);
	expect(buffer.size).toBe(1);
	buffer.clear();
	expect(buffer.size).toBe(0);
	expect(buffer.capacity).toBe(2);
});

test("handles capacity one", () => {
	const buffer = new RingBuffer(1);
	buffer.push("a");
	expect(buffer.push("b")).toBe("a");
	expect(buffer.peek()).toBe("b");
	expect(buffer.shift()).toBe("b");
	expect(buffer.size).toBe(0);
});

test("rejects invalid capacity", () => {
	for (const capacity of [0, -1, 1.5, Infinity, NaN]) expect(() => new RingBuffer(capacity)).toThrow();
});
