import { expect, test } from "bun:test";
import { createSingleflight } from "../singleflight.js";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

test("returns the exact shared promise while pending", async () => {
	const gate = deferred();
	let calls = 0;
	const load = createSingleflight(key => { calls += 1; return gate.promise.then(() => key); });
	const first = load("x");
	const second = load("x");
	expect(first).toBe(second);
	await turn();
	expect(calls).toBe(1);
	gate.resolve();
	await expect(first).resolves.toBe("x");
	await expect(second).resolves.toBe("x");
});

test("runs different keys independently using Map identity", async () => {
	const keys = [{ id: 1 }, { id: 1 }];
	const seen = [];
	const load = createSingleflight(async key => { seen.push(key); return key; });
	const results = await Promise.all([load(keys[0]), load(keys[1]), load(NaN), load(NaN), load(undefined)]);
	expect(results).toEqual([keys[0], keys[1], NaN, NaN, undefined]);
	expect(seen).toEqual([keys[0], keys[1], NaN, undefined]);
});

test("does not cache fulfilled values", async () => {
	let calls = 0;
	const load = createSingleflight(async () => ++calls);
	await expect(load("x")).resolves.toBe(1);
	await expect(load("x")).resolves.toBe(2);
	expect(calls).toBe(2);
});

test("shares rejection and retries afterward", async () => {
	const failure = new Error("failed");
	let calls = 0;
	const load = createSingleflight(async () => { calls += 1; if (calls === 1) throw failure; return "ok"; });
	const first = load("x"); const second = load("x");
	expect(first).toBe(second);
	await expect(first).rejects.toBe(failure);
	await expect(second).rejects.toBe(failure);
	await expect(load("x")).resolves.toBe("ok");
	expect(calls).toBe(2);
});

test("turns synchronous throws into a shared rejection and cleans up", async () => {
	const failure = new Error("sync");
	let calls = 0;
	const load = createSingleflight(() => { calls += 1; if (calls === 1) throw failure; return 2; });
	let promise;
	expect(() => { promise = load("x"); }).not.toThrow();
	await expect(promise).rejects.toBe(failure);
	await expect(load("x")).resolves.toBe(2);
});
