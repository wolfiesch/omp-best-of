import { expect, test } from "bun:test";
import { stableStringify } from "../stable-stringify.js";

test("sorts recursively while preserving arrays", () => {
	const value = { z: { y: 1, a: "line\nquote\"" }, a: [{ d: 4, b: 2 }, true, null] };
	expect(stableStringify(value)).toBe('{"a":[{"b":2,"d":4},true,null],"z":{"a":"line\\nquote\\\"","y":1}}');
});

test("supports null-prototype objects and ignores inherited and symbol keys", () => {
	const value = Object.create(null);
	value.b = 2; value.a = 1; value[Symbol("hidden")] = 3;
	expect(stableStringify(value)).toBe('{"a":1,"b":2}');
	const inherited = Object.create({ hidden: 1 }); inherited.visible = 2;
	expect(() => stableStringify(inherited)).toThrow(TypeError);
});

test("serializes shared acyclic references without treating them as cycles", () => {
	const shared = { b: 2, a: 1 };
	expect(stableStringify({ right: shared, left: shared })).toBe('{"left":{"a":1,"b":2},"right":{"a":1,"b":2}}');
});

test("rejects cycles", () => {
	const value = { name: "cycle" }; value.self = value;
	expect(() => stableStringify(value)).toThrow(TypeError);
	const array = []; array.push(array);
	expect(() => stableStringify(array)).toThrow(TypeError);
});

test("rejects unsupported primitives and objects", () => {
	for (const value of [undefined, 1n, Symbol("x"), () => {}, NaN, Infinity, -Infinity, new Date(), new Map()]) {
		expect(() => stableStringify(value)).toThrow(TypeError);
	}
	expect(() => stableStringify({ bad: undefined })).toThrow(TypeError);
	expect(() => stableStringify([1, undefined])).toThrow(TypeError);
});

test("rejects sparse arrays and does not invoke toJSON", () => {
	const sparse = []; sparse[1] = "x";
	expect(() => stableStringify(sparse)).toThrow(TypeError);
	let called = false;
	const value = { toJSON() { called = true; return "wrong"; } };
	expect(() => stableStringify(value)).toThrow(TypeError);
	expect(called).toBe(false);
});

test("handles primitive formatting and does not mutate input", () => {
	const value = { b: -0, a: "\b\f\n\r\t" };
	const keys = Object.keys(value);
	expect(stableStringify(value)).toBe('{"a":"\\b\\f\\n\\r\\t","b":0}');
	expect(Object.keys(value)).toEqual(keys);
});
