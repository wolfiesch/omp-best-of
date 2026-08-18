import { expect, test } from "bun:test";
import { applyPatch } from "./json-patch.js";

test("replaces an object property", () => {
	expect(applyPatch({ a: 1 }, [{ op: "replace", path: "/a", value: 2 }])).toEqual({ a: 2 });
});
