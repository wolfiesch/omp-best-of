import { expect, test } from "bun:test";
import { parseCsvLine } from "../csv.js";

test("keeps commas inside a quoted field", () => {
	expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
});

test("unescapes a doubled quote inside a quoted field", () => {
	expect(parseCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
});

test("treats a bare quote inside an unquoted field as literal", () => {
	expect(parseCsvLine('a,b"c,d')).toEqual(["a", 'b"c', "d"]);
});

test("returns an empty string for a trailing empty field", () => {
	expect(parseCsvLine("a,b,")).toEqual(["a", "b", ""]);
});

test("returns empty strings for interior empty fields", () => {
	expect(parseCsvLine("a,,b")).toEqual(["a", "", "b"]);
});

test("parses an empty quoted field", () => {
	expect(parseCsvLine('a,"",b')).toEqual(["a", "", "b"]);
});

test("preserves whitespace outside quotes", () => {
	expect(parseCsvLine('a, b ,"c "')).toEqual(["a", " b ", "c "]);
});

test("parses a single empty line as one empty field", () => {
	expect(parseCsvLine("")).toEqual([""]);
});
