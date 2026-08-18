import { expect, test } from "bun:test";
import { CircuitOpenError, createCircuitBreaker } from "../circuit-breaker.js";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

const options = now => ({ failureThreshold: 2, cooldownMs: 10, now: () => now.value });

test("opens after consecutive failures and blocks calls", async () => {
	const now = { value: 0 };
	let calls = 0;
	const run = createCircuitBreaker(async () => { calls += 1; throw new Error(`failure-${calls}`); }, options(now));
	await expect(run()).rejects.toThrow("failure-1");
	await expect(run()).rejects.toThrow("failure-2");
	await expect(run()).rejects.toBeInstanceOf(CircuitOpenError);
	expect(calls).toBe(2);
});

test("a success resets consecutive failures", async () => {
	const now = { value: 0 };
	const outcomes = [new Error("one"), "ok", new Error("two"), "again"];
	const run = createCircuitBreaker(async () => { const value = outcomes.shift(); if (value instanceof Error) throw value; return value; }, options(now));
	await expect(run()).rejects.toThrow("one");
	await expect(run()).resolves.toBe("ok");
	await expect(run()).rejects.toThrow("two");
	await expect(run()).resolves.toBe("again");
});

test("allows one half-open probe and closes on success", async () => {
	const now = { value: 0 };
	const gate = deferred();
	let calls = 0;
	const run = createCircuitBreaker(async () => {
		calls += 1;
		if (calls <= 2) throw new Error("closed failure");
		if (calls === 3) return gate.promise;
		return "closed";
	}, options(now));
	await expect(run()).rejects.toThrow(); await expect(run()).rejects.toThrow();
	now.value = 10;
	const probe = run();
	await expect(run()).rejects.toBeInstanceOf(CircuitOpenError);
	gate.resolve("probe-ok");
	await expect(probe).resolves.toBe("probe-ok");
	await expect(run()).resolves.toBe("closed");
	expect(calls).toBe(4);
});

test("a failed half-open probe starts a new cooldown", async () => {
	const now = { value: 0 };
	let calls = 0;
	const run = createCircuitBreaker(async () => { calls += 1; throw new Error("failure"); }, options(now));
	await expect(run()).rejects.toThrow(); await expect(run()).rejects.toThrow();
	now.value = 10;
	await expect(run()).rejects.toThrow("failure");
	now.value = 19;
	await expect(run()).rejects.toBeInstanceOf(CircuitOpenError);
	expect(calls).toBe(3);
	now.value = 20;
	await expect(run()).rejects.toThrow("failure");
	expect(calls).toBe(4);
});

test("validates options before creating the runner", () => {
	for (const bad of [
		{ failureThreshold: 0, cooldownMs: 1, now: () => 0 },
		{ failureThreshold: 1.5, cooldownMs: 1, now: () => 0 },
		{ failureThreshold: 1, cooldownMs: -1, now: () => 0 },
		{ failureThreshold: 1, cooldownMs: Infinity, now: () => 0 },
		{ failureThreshold: 1, cooldownMs: 1, now: null },
	]) expect(() => createCircuitBreaker(async () => {}, bad)).toThrow();
});
