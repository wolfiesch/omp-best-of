import { expect, test } from "bun:test";
import { createBucket } from "../bucket.js";

test("preserves fractional refill across reads", () => {
	let t = 0; const b = createBucket({ capacity: 2, refillPerMs: 0.25, now: () => t }); b.take(2);
	t = 1; expect(b.available()).toBe(0.25); t = 2; expect(b.available()).toBe(0.5); t = 4; expect(b.take(1)).toBe(true);
});
test("does not mint or rewind on clock reversal", () => {
	let t = 10; const b = createBucket({ capacity: 2, refillPerMs: 1, now: () => t }); b.take(2);
	t = 9; expect(b.available()).toBe(0); t = 10; expect(b.available()).toBe(0); t = 11; expect(b.available()).toBe(1);
});
test("failed takes do not deduct", () => {
	let t = 0; const b = createBucket({ capacity: 2, refillPerMs: 0, now: () => t }); expect(b.take(3)).toBe(false); expect(b.available()).toBe(2);
});
test("validates construction and counts", () => {
	for (const opts of [{ capacity: 0, refillPerMs: 1 }, { capacity: 1, refillPerMs: -1 }, { capacity: Infinity, refillPerMs: 1 }]) expect(() => createBucket({ ...opts, now: () => 0 })).toThrow(TypeError);
	const b = createBucket({ capacity: 1, refillPerMs: 1, now: () => 0 });
	for (const count of [0, -1, Infinity, NaN]) expect(() => b.take(count)).toThrow(TypeError);
});
