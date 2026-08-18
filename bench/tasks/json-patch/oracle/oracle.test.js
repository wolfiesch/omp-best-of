import { expect, test } from "bun:test";
import { applyPatch } from "../json-patch.js";

test("applies nested operations without mutating inputs", () => {
	const document = { user: { name: "Ada", tags: ["a", "c"] } };
	const added = { nested: [1] };
	const operations = [
		{ op: "replace", path: "/user/name", value: "Grace" },
		{ op: "add", path: "/user/tags/1", value: "b" },
		{ op: "add", path: "/extra", value: added },
		{ op: "remove", path: "/user/tags/0" },
	];
	const result = applyPatch(document, operations);
	expect(result).toEqual({ user: { name: "Grace", tags: ["b", "c"] }, extra: { nested: [1] } });
	expect(document).toEqual({ user: { name: "Ada", tags: ["a", "c"] } });
	expect(result.user).not.toBe(document.user);
	expect(result.extra).not.toBe(added);
});

test("decodes pointers and treats prototype names as data", () => {
	const result = applyPatch({ "a/b": { "~key": 1 }, "~2": 3 }, [
		{ op: "replace", path: "/a~1b/~0key", value: 2 },
		{ op: "replace", path: "/~02", value: 4 },
		{ op: "add", path: "/__proto__", value: { safe: true } },
	]);
	expect(result["a/b"]["~key"]).toBe(2);
	expect(result["~2"]).toBe(4);
	expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
	expect(Object.hasOwn(result, "__proto__")).toBe(true);
	expect(result.__proto__).toEqual({ safe: true });
});

test("handles array append, insertion, replacement, and removal", () => {
	const result = applyPatch(["b"], [
		{ op: "add", path: "/0", value: "a" },
		{ op: "add", path: "/-", value: "d" },
		{ op: "replace", path: "/2", value: "c" },
		{ op: "remove", path: "/1" },
	]);
	expect(result).toEqual(["a", "c"]);
});

test("supports root replacement and structural tests", () => {
	expect(applyPatch({ a: 1 }, [{ op: "test", path: "", value: { a: 1 } }, { op: "replace", path: "", value: [1, 2] }])).toEqual([1, 2]);
	expect(applyPatch(null, [{ op: "add", path: "", value: { ok: true } }])).toEqual({ ok: true });
});

test("structural tests distinguish arrays from objects", () => {
	expect(() => applyPatch({ value: [] }, [{ op: "test", path: "/value", value: {} }])).toThrow();
	expect(() => applyPatch({ value: {} }, [{ op: "test", path: "/value", value: [] }])).toThrow();
});

test("array test paths require canonical existing indices", () => {
	expect(() => applyPatch({ values: [1] }, [{ op: "test", path: "/values/length", value: 1 }])).toThrow();
	expect(() => applyPatch({ values: [1] }, [{ op: "test", path: "/values/01", value: 1 }])).toThrow();
});

test("is atomic when a later operation fails", () => {
	const document = { a: { b: 1 } };
	const operations = [{ op: "replace", path: "/a/b", value: 2 }, { op: "test", path: "/a/b", value: 3 }];
	expect(() => applyPatch(document, operations)).toThrow();
	expect(document).toEqual({ a: { b: 1 } });
});

test("rejects malformed paths, indices, and targets", () => {
	for (const operations of [
		[{ op: "remove", path: "" }],
		[{ op: "replace", path: "/missing", value: 1 }],
		[{ op: "add", path: "/missing/child", value: 1 }],
		[{ op: "add", path: "/01", value: 1 }],
		[{ op: "remove", path: "/-" }],
		[{ op: "add", path: "/3", value: 1 }],
		[{ op: "replace", path: "/bad~2escape", value: 1 }],
		[{ op: "move", path: "/a", from: "/b" }],
		[{ op: "replace", value: 1 }],
	]) expect(() => applyPatch([], operations)).toThrow();
});
