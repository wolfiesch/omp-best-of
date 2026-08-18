import { expect, test } from "bun:test";
import { mapLimit } from "../promise-pool.js";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

test("enforces concurrency and preserves input order", async () => {
	const gates = Array.from({ length: 4 }, deferred);
	const started = [];
	let active = 0;
	let maximum = 0;
	const result = mapLimit([10, 20, 30, 40], 2, async (value, index) => {
		started.push(index);
		active += 1;
		maximum = Math.max(maximum, active);
		await gates[index].promise;
		active -= 1;
		return value + index;
	});
	await turn();
	expect(started).toEqual([0, 1]);
	gates[1].resolve();
	await turn();
	expect(started).toEqual([0, 1, 2]);
	gates[0].resolve(); gates[2].resolve();
	await turn();
	expect(started).toEqual([0, 1, 2, 3]);
	gates[3].resolve();
	await expect(result).resolves.toEqual([10, 21, 32, 43]);
	expect(maximum).toBe(2);
});

test("stops scheduling after the first rejection", async () => {
	const gates = [deferred(), deferred()];
	const started = [];
	const result = mapLimit([0, 1, 2, 3], 2, async (_value, index) => {
		started.push(index);
		if (index < 2) return gates[index].promise;
		return index;
	});
	await turn();
	const failure = new Error("stop");
	gates[0].reject(failure);
	await expect(result).rejects.toBe(failure);
	gates[1].resolve(1);
	await turn();
	expect(started).toEqual([0, 1]);
});

test("treats synchronous throws like asynchronous rejection", async () => {
	const started = [];
	await expect(mapLimit([0, 1, 2], 1, (_value, index) => { started.push(index); throw new Error("sync"); })).rejects.toThrow("sync");
	expect(started).toEqual([0]);
});

test("rejects invalid limits before calling the mapper", async () => {
	for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		let calls = 0;
		await expect(mapLimit([1], limit, async () => { calls += 1; })).rejects.toThrow();
		expect(calls).toBe(0);
	}
});

test("handles empty input without mutation", async () => {
	const items = [];
	let calls = 0;
	await expect(mapLimit(items, 3, async () => { calls += 1; })).resolves.toEqual([]);
	expect(items).toEqual([]);
	expect(calls).toBe(0);
});
