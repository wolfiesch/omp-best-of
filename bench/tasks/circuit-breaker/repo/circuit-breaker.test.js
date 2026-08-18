import { expect, test } from "bun:test";
import { createCircuitBreaker } from "./circuit-breaker.js";

test("forwards a successful call", async () => {
	const run = createCircuitBreaker(async value => value * 2, { failureThreshold: 2, cooldownMs: 10, now: () => 0 });
	await expect(run(3)).resolves.toBe(6);
});
