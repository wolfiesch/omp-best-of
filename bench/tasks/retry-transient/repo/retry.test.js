import { expect, test } from "bun:test";
import { withRetry } from "./retry.js";

const options = {
	attempts: 3,
	baseDelayMs: 10,
	isTransient: () => true,
	sleep: async () => {},
};

test("resolves on the first success", async () => {
	await expect(withRetry(async () => "ok", options)).resolves.toBe("ok");
});

test("retries a transient failure", async () => {
	let calls = 0;
	const value = await withRetry(async () => {
		calls += 1;
		if (calls < 2) throw new Error("transient");
		return "ok";
	}, options);
	expect(value).toBe("ok");
});
