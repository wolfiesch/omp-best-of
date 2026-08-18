import { expect, test } from "bun:test";
import { mapLimit } from "./promise-pool.js";

test("maps values in order", async () => {
	await expect(mapLimit([1, 2, 3], 2, async value => value * 2)).resolves.toEqual([2, 4, 6]);
});
