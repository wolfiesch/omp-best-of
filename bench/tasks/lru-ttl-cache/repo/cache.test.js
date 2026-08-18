import { expect, test } from "bun:test";
import { createCache } from "./cache.js";

function harness(options = {}) {
	let clock = 0;
	const cache = createCache({ capacity: 2, ttlMs: 100, now: () => clock, ...options });
	return { cache, advance: ms => { clock += ms; } };
}

test("stores and reads a value", () => {
	const { cache } = harness();
	cache.set("a", 1);
	expect(cache.get("a")).toBe(1);
});

test("drops a value once its lifetime elapses", () => {
	const { cache, advance } = harness();
	cache.set("a", 1);
	advance(100);
	expect(cache.get("a")).toBeUndefined();
});

test("evicts when capacity is exceeded", () => {
	const { cache } = harness();
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("c", 3);
	expect(cache.get("a")).toBeUndefined();
	expect(cache.get("c")).toBe(3);
	expect(cache.size()).toBe(2);
});
