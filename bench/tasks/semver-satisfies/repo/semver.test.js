import { expect, test } from "bun:test";
import { satisfies } from "./semver.js";

test("accepts a patch bump inside a caret range", () => {
	expect(satisfies("1.2.4", "^1.2.3")).toBe(true);
});

test("rejects a major bump outside a caret range", () => {
	expect(satisfies("2.0.0", "^1.2.3")).toBe(false);
});

test("matches an exact range", () => {
	expect(satisfies("1.2.3", "1.2.3")).toBe(true);
});

test("rejects a minor bump outside a tilde range", () => {
	expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
});
