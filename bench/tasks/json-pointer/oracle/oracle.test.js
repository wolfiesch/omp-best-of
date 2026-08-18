import { expect, test } from "bun:test";
import { getPointer } from "../pointer.js";

test("decodes tilde after slash", () => {
	expect(getPointer({ "a~b": 1 }, "/a~0b")).toBe(1);
	expect(getPointer({ "~1": 2 }, "/~01")).toBe(2);
});
test("rejects malformed pointers and escapes", () => {
	expect(() => getPointer({}, "a")).toThrow(TypeError);
	expect(() => getPointer({}, "/a~2b")).toThrow(TypeError);
	expect(() => getPointer({}, "/a~")).toThrow(TypeError);
});
test("uses own object properties only", () => {
	const value = Object.create({ inherited: 1 });
	expect(getPointer(value, "/inherited")).toBeUndefined();
});
test("validates canonical array indices", () => {
	const value = ["zero", "one"];
	expect(getPointer(value, "/0")).toBe("zero");
	expect(() => getPointer(value, "/01")).toThrow(TypeError);
	expect(() => getPointer(value, "/-")).toThrow(TypeError);
	expect(() => getPointer(value, "/-1")).toThrow(TypeError);
});
test("returns undefined for valid missing paths", () => {
	expect(getPointer({ a: {} }, "/a/b")).toBeUndefined();
	expect(getPointer([], "/0")).toBeUndefined();
});
