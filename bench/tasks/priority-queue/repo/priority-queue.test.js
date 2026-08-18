import { expect, test } from "bun:test";
import { StablePriorityQueue } from "./priority-queue.js";

test("dequeues numbers by priority", () => {
	const queue = new StablePriorityQueue((a, b) => a - b);
	queue.enqueue(3); queue.enqueue(1); queue.enqueue(2);
	expect([queue.dequeue(), queue.dequeue(), queue.dequeue()]).toEqual([1, 2, 3]);
});
