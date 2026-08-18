import { expect, test } from "bun:test";
import { normalize } from "./pathutil.js";

test("collapses repeated separators", () => {
	expect(normalize("a//b")).toBe("a/b");
});

test("drops dot segments", () => {
	expect(normalize("a/./b")).toBe("a/b");
});

test("resolves a parent segment", () => {
	expect(normalize("a/b/../c")).toBe("a/c");
});

test("keeps an absolute path absolute", () => {
	expect(normalize("/a/b")).toBe("/a/b");
});
