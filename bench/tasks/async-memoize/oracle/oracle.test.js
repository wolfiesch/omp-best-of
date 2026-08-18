import { expect, test } from "bun:test";
import { memoizeAsync } from "../memoize.js";

test("returns the exact same pending promise", async () => {
	let resolve; let calls = 0; const fn = memoizeAsync(() => { calls += 1; return new Promise(r => { resolve = r; }); });
	const a = fn("x"); const b = fn("x"); expect(a).toBe(b); expect(calls).toBe(1); resolve(3); expect(await a).toBe(3);
});
test("evicts a rejected promise", async () => {
	let calls = 0; const fn = memoizeAsync(async () => { calls += 1; if (calls === 1) throw new Error("first"); return "ok"; });
	await expect(fn("x")).rejects.toThrow("first"); expect(await fn("x")).toBe("ok"); expect(calls).toBe(2);
});
test("turns synchronous throws into rejections without caching", async () => {
	let calls = 0; const fn = memoizeAsync(() => { calls += 1; throw new Error("sync"); });
	await expect(fn("x")).rejects.toThrow("sync"); await expect(fn("x")).rejects.toThrow("sync"); expect(calls).toBe(2);
});
test("forwards this and every argument", async () => {
	const fn = memoizeAsync(function (key, n) { return this.base + key + n; });
	expect(await fn.call({ base: 1 }, 2, 3)).toBe(6);
});
test("caches undefined", async () => { let calls = 0; const fn = memoizeAsync(async () => { calls += 1; }); await fn("x"); await fn("x"); expect(calls).toBe(1); });
