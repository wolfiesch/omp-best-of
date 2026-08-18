import { expect, test } from "bun:test";
import { normalize } from "../pathutil.js";

test("preserves unresolvable leading parents on a relative path", () => {
	expect(normalize("../../a")).toBe("../../a");
	expect(normalize("a/../../b")).toBe("../b");
});

test("drops parents that climb above the root", () => {
	expect(normalize("/a/../../b")).toBe("/b");
	expect(normalize("/..")).toBe("/");
	expect(normalize("/../..")).toBe("/");
});

test("returns dot for an empty or fully cancelled relative path", () => {
	expect(normalize("")).toBe(".");
	expect(normalize("a/..")).toBe(".");
	expect(normalize(".")).toBe(".");
	expect(normalize("./")).toBe(".");
});

test("keeps the root as a single separator", () => {
	expect(normalize("/")).toBe("/");
	expect(normalize("///")).toBe("/");
});

test("removes a trailing separator", () => {
	expect(normalize("a/b/")).toBe("a/b");
	expect(normalize("/a/b/")).toBe("/a/b");
	expect(normalize("a/b/../")).toBe("a");
});

test("does not treat a name containing dots as a parent segment", () => {
	expect(normalize("a/.../b")).toBe("a/.../b");
	expect(normalize("..a/b")).toBe("..a/b");
});

test("resolves interior parents without disturbing later segments", () => {
	expect(normalize("a/b/../../c/d")).toBe("c/d");
	expect(normalize("/a/b/../c/../d")).toBe("/a/d");
});

test("keeps parents that follow a preserved leading parent", () => {
	expect(normalize("../a/../..")).toBe("../..");
});
