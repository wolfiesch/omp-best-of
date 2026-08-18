import { expect, test } from "bun:test";
import { StablePriorityQueue } from "../priority-queue.js";

test("preserves insertion order for equal priorities", () => {
	const queue = new StablePriorityQueue((a, b) => a.priority - b.priority);
	const values = [
		{ id: "a", priority: 1 }, { id: "b", priority: 1 },
		{ id: "low", priority: 0 }, { id: "c", priority: 1 },
	];
	for (const value of values) queue.enqueue(value);
	expect(queue.dequeue()).toBe(values[2]);
	expect(queue.dequeue()).toBe(values[0]);
	queue.enqueue({ id: "d", priority: 1 });
	expect([queue.dequeue().id, queue.dequeue().id, queue.dequeue().id]).toEqual(["b", "c", "d"]);
});

test("stays stable across interleaved heap changes", () => {
	const queue = new StablePriorityQueue((a, b) => a.priority - b.priority);
	for (const value of [
		{ id: "a", priority: 2 }, { id: "x", priority: 1 }, { id: "b", priority: 2 },
		{ id: "z", priority: 3 }, { id: "c", priority: 2 },
	]) queue.enqueue(value);
	expect(queue.dequeue().id).toBe("x");
	queue.enqueue({ id: "d", priority: 2 });
	expect([queue.dequeue().id, queue.dequeue().id, queue.dequeue().id, queue.dequeue().id]).toEqual(["a", "b", "c", "d"]);
	expect(queue.dequeue().id).toBe("z");
});

test("peek is non-destructive and size is accurate", () => {
	const queue = new StablePriorityQueue((a, b) => a - b);
	expect(queue.size).toBe(0);
	expect(queue.peek()).toBeUndefined();
	expect(queue.dequeue()).toBeUndefined();
	queue.enqueue(2); queue.enqueue(1);
	expect(queue.size).toBe(2);
	expect(queue.peek()).toBe(1);
	expect(queue.peek()).toBe(1);
	expect(queue.size).toBe(2);
	expect(queue.dequeue()).toBe(1);
	expect(queue.size).toBe(1);
});

test("supports arbitrary values without cloning", () => {
	const first = { rank: 1 };
	const second = { rank: 0 };
	const queue = new StablePriorityQueue((a, b) => a.rank - b.rank);
	queue.enqueue(first); queue.enqueue(second);
	expect(queue.dequeue()).toBe(second);
	expect(queue.dequeue()).toBe(first);
});

test("requires a comparator and propagates its errors", () => {
	expect(() => new StablePriorityQueue()).toThrow(TypeError);
	const failure = new Error("compare");
	const queue = new StablePriorityQueue(() => { throw failure; });
	queue.enqueue(1);
	expect(() => queue.enqueue(2)).toThrow(failure);
});
