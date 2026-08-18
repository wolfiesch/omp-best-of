import { expect, test } from "bun:test";
import { satisfies } from "../semver.js";

test("compares components numerically", () => {
	expect(satisfies("1.10.0", "^1.9.0")).toBe(true);
	expect(satisfies("1.9.0", "^1.10.0")).toBe(false);
});

test("caret on a zero major stops at the next minor", () => {
	expect(satisfies("0.2.9", "^0.2.3")).toBe(true);
	expect(satisfies("0.3.0", "^0.2.3")).toBe(false);
});

test("caret on a zero major and minor pins the patch", () => {
	expect(satisfies("0.0.3", "^0.0.3")).toBe(true);
	expect(satisfies("0.0.4", "^0.0.3")).toBe(false);
});

test("tilde allows patch changes up to the next minor", () => {
	expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
	expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
	expect(satisfies("1.2.2", "~1.2.3")).toBe(false);
});

test("a prerelease is excluded from a plain range", () => {
	expect(satisfies("1.2.4-beta.1", "^1.2.0")).toBe(false);
	expect(satisfies("1.3.0-beta.1", ">=1.2.3")).toBe(false);
});

test("a prerelease is admitted only at the range's own base version", () => {
	expect(satisfies("1.2.3-beta.2", "^1.2.3-beta.1")).toBe(true);
	expect(satisfies("1.2.4-beta.1", "^1.2.3-beta.1")).toBe(false);
});

test("a release satisfies a range at its own prerelease", () => {
	expect(satisfies("1.2.3", ">=1.2.3-beta.1")).toBe(true);
	expect(satisfies("1.2.3", "<1.2.3-beta.1")).toBe(false);
});

test("prerelease identifiers compare numerically when numeric", () => {
	expect(satisfies("1.2.3-beta.10", ">=1.2.3-beta.2")).toBe(true);
	expect(satisfies("1.2.3-beta.2", "<1.2.3-beta.10")).toBe(true);
});

test("a numeric prerelease identifier sorts below a non-numeric one", () => {
	expect(satisfies("1.2.3-1", "<1.2.3-alpha")).toBe(true);
});

test("a prerelease prefix sorts below the longer prerelease", () => {
	expect(satisfies("1.2.3-beta", "<1.2.3-beta.1")).toBe(true);
});

test("boundaries are inclusive for >= and exclusive for <", () => {
	expect(satisfies("1.2.3", ">=1.2.3")).toBe(true);
	expect(satisfies("1.2.3", "<1.2.3")).toBe(false);
	expect(satisfies("1.2.3", "^1.2.3")).toBe(true);
});
