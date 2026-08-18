import { expect, test } from "bun:test";
import { createCache } from "../cache.js";

function harness(options = {}) {
	let clock = 0;
	const cache = createCache({ capacity: 2, ttlMs: 100, now: () => clock, ...options });
	return { cache, advance: ms => { clock += ms; } };
}

test("a read marks the key most recently used", () => {
	const { cache } = harness();
	cache.set("a", 1);
	cache.set("b", 2);
	expect(cache.get("a")).toBe(1);
	cache.set("c", 3);
	expect(cache.get("a")).toBe(1);
	expect(cache.get("b")).toBeUndefined();
});

test("a repeated set marks the key most recently used", () => {
	const { cache } = harness();
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("a", 11);
	cache.set("c", 3);
	expect(cache.get("a")).toBe(11);
	expect(cache.get("b")).toBeUndefined();
});

test("a repeated set does not grow the entry count", () => {
	const { cache } = harness();
	cache.set("a", 1);
	cache.set("a", 2);
	expect(cache.size()).toBe(1);
	expect(cache.get("a")).toBe(2);
});

test("a repeated set restarts the lifetime", () => {
	const { cache, advance } = harness();
	cache.set("a", 1);
	advance(60);
	cache.set("a", 2);
	advance(60);
	expect(cache.get("a")).toBe(2);
	advance(40);
	expect(cache.get("a")).toBeUndefined();
});

test("size counts only live entries", () => {
	const { cache, advance } = harness();
	cache.set("a", 1);
	cache.set("b", 2);
	advance(100);
	expect(cache.size()).toBe(0);
});

test("expired entries are discarded before anything live is evicted", () => {
	const { cache, advance } = harness();
	cache.set("a", 1);
	advance(60);
	cache.set("b", 2);
	advance(60);
	cache.set("c", 3);
	expect(cache.get("b")).toBe(2);
	expect(cache.get("c")).toBe(3);
	expect(cache.size()).toBe(2);
});

test("keys are ordered from least to most recently used", () => {
	const { cache } = harness({ capacity: 3 });
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("c", 3);
	expect(cache.keys()).toEqual(["a", "b", "c"]);
	cache.get("a");
	expect(cache.keys()).toEqual(["b", "c", "a"]);
});

test("keys omits expired entries", () => {
	const { cache, advance } = harness({ capacity: 3 });
	cache.set("a", 1);
	advance(60);
	cache.set("b", 2);
	advance(60);
	expect(cache.keys()).toEqual(["b"]);
});

test("an entry expires exactly at its lifetime boundary", () => {
	const { cache, advance } = harness();
	cache.set("a", 1);
	advance(99);
	expect(cache.get("a")).toBe(1);
	advance(1);
	expect(cache.get("a")).toBeUndefined();
});
