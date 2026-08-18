import { expect, test } from "bun:test";
import { memoizeAsync } from "./memoize.js";

test("memoizes a fulfilled result", async () => { let calls = 0; const fn = memoizeAsync(async key => { calls += 1; return key * 2; }); expect(await fn(2)).toBe(4); expect(await fn(2)).toBe(4); expect(calls).toBe(1); });
test("keeps keys separate", async () => { const fn = memoizeAsync(async key => key); expect(await fn("a")).toBe("a"); expect(await fn("b")).toBe("b"); });
