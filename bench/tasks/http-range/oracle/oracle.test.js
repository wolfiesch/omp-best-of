import { expect, test } from "bun:test";
import { parseRange } from "../range.js";

test("parses open and suffix forms", () => {
	expect(parseRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
	expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
	expect(parseRange("bytes=-20", 10)).toEqual({ start: 0, end: 9 });
});
test("accepts horizontal whitespace", () => expect(parseRange("  bytes=1-2  ", 5)).toEqual({ start: 1, end: 2 }));
test("rejects malformed and multiple ranges", () => {
	for (const value of ["items=1-2", "bytes=1-2,4-5", "bytes=1x-2", "bytes=-0", "bytes=--2", "bytes=3-2", "bytes=1.5-2"]) {
		expect(parseRange(value, 10)).toBeNull();
	}
});
test("handles empty representations", () => {
	expect(parseRange("bytes=0-", 0)).toBeNull();
	expect(parseRange("bytes=-1", 0)).toBeNull();
});
test("does not lose integer precision", () => expect(parseRange("bytes=9007199254740993-", 10)).toBeNull());
test("rejects unsafe decimal values", () => {
	expect(parseRange("bytes=0-9007199254740993", 10)).toBeNull();
	expect(parseRange("bytes=-9007199254740993", 10)).toBeNull();
	expect(parseRange("bytes=0-1", 9007199254740992)).toBeNull();
});
test("rejects non-horizontal whitespace", () => {
	expect(parseRange("\nbytes=1-2", 10)).toBeNull();
	expect(parseRange("bytes=1-2\r", 10)).toBeNull();
});
