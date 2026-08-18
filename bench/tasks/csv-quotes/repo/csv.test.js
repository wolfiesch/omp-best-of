import { expect, test } from "bun:test";
import { parseCsvLine } from "./csv.js";

test("parses plain fields", () => {
	expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
});

test("unwraps a simple quoted field", () => {
	expect(parseCsvLine('a,"b",c')).toEqual(["a", "b", "c"]);
});
