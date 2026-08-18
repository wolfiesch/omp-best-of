import { expect, test } from "bun:test"; import { deepMerge } from "./merge.js";
test("merges nested objects", () => expect(deepMerge({ a: { x: 1 }, b: 2 }, { a: { y: 3 } })).toEqual({ a: { x: 1, y: 3 }, b: 2 }));
test("overlay replaces a scalar", () => expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 }));
