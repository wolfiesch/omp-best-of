import { expect, test } from "bun:test";
import { createBucket } from "./bucket.js";

test("starts full and deducts", () => { let t = 0; const b = createBucket({ capacity: 2, refillPerMs: 1, now: () => t }); expect(b.take()).toBe(true); expect(b.available()).toBe(1); });
test("refills whole elapsed milliseconds", () => { let t = 0; const b = createBucket({ capacity: 2, refillPerMs: 1, now: () => t }); b.take(2); t = 1; expect(b.available()).toBe(1); });
