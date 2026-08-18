import { expect, test } from "bun:test";
import { createSingleflight } from "./singleflight.js";

test("coalesces two concurrent loads", async () => {
	let calls = 0;
	const load = createSingleflight(async key => { calls += 1; return key.toUpperCase(); });
	await expect(Promise.all([load("a"), load("a")])).resolves.toEqual(["A", "A"]);
	expect(calls).toBe(1);
});
