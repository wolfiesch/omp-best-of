import { expect, test } from "bun:test";
import { parseRange } from "./range.js";

test("parses an explicit range", () => expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 }));
test("clamps the end", () => expect(parseRange("bytes=7-20", 10)).toEqual({ start: 7, end: 9 }));
test("rejects a start beyond the size", () => expect(parseRange("bytes=10-12", 10)).toBeNull());
