import { expect, test } from "bun:test";
import { withRetry } from "../retry.js";

function harness(overrides = {}) {
	const delays = [];
	return {
		delays,
		options: {
			attempts: 3,
			baseDelayMs: 10,
			isTransient: () => true,
			sleep: async ms => {
				delays.push(ms);
			},
			...overrides,
		},
	};
}

test("calls the operation at most attempts times", async () => {
	const { options } = harness();
	let calls = 0;
	await expect(
		withRetry(async () => {
			calls += 1;
			throw new Error("always");
		}, options),
	).rejects.toThrow("always");
	expect(calls).toBe(3);
});

test("passes one-based attempt numbers", async () => {
	const { options } = harness();
	const seen = [];
	await expect(
		withRetry(async attempt => {
			seen.push(attempt);
			throw new Error("always");
		}, options),
	).rejects.toThrow("always");
	expect(seen).toEqual([1, 2, 3]);
});

test("does not retry a permanent error", async () => {
	const { options, delays } = harness({ isTransient: error => error.message === "transient" });
	let calls = 0;
	await expect(
		withRetry(async () => {
			calls += 1;
			throw new Error("permanent");
		}, options),
	).rejects.toThrow("permanent");
	expect(calls).toBe(1);
	expect(delays).toEqual([]);
});

test("waits with exponential backoff and never after the final attempt", async () => {
	const { options, delays } = harness();
	await expect(
		withRetry(async () => {
			throw new Error("always");
		}, options),
	).rejects.toThrow("always");
	expect(delays).toEqual([10, 20]);
});

test("stops sleeping once the operation succeeds", async () => {
	const { options, delays } = harness();
	let calls = 0;
	const value = await withRetry(async () => {
		calls += 1;
		if (calls < 3) throw new Error("transient");
		return "ok";
	}, options);
	expect(value).toBe("ok");
	expect(calls).toBe(3);
	expect(delays).toEqual([10, 20]);
});
