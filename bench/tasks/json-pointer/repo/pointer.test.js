import { expect, test } from "bun:test";
import { getPointer } from "./pointer.js";

test("returns the root for an empty pointer", () => expect(getPointer({ a: 1 }, "")).toEqual({ a: 1 }));
test("reads nested object fields", () => expect(getPointer({ a: { b: 2 } }, "/a/b")).toBe(2));
test("decodes slash escapes", () => expect(getPointer({ "a/b": 3 }, "/a~1b")).toBe(3));
