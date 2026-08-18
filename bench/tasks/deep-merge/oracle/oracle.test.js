import { expect, test } from "bun:test"; import { deepMerge } from "../merge.js";
test("replaces arrays instead of concatenating", () => expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] }));
test("does not mutate or retain replaceable containers", () => { const base = { a: { x: 1 }, list: [1] }; const overlay = { a: { y: 2 }, list: [2] }; const result = deepMerge(base, overlay); result.a.x = 9; result.list.push(3); expect(base).toEqual({ a: { x: 1 }, list: [1] }); expect(overlay).toEqual({ a: { y: 2 }, list: [2] }); });
test("ignores undefined overlay properties", () => expect(deepMerge({ a: 1 }, { a: undefined, b: undefined })).toEqual({ a: 1 }));
test("blocks prototype-sensitive keys", () => { const overlay = JSON.parse('{"safe":1,"__proto__":{"polluted":true},"nested":{"constructor":{"x":1}}}'); const result = deepMerge({}, overlay); expect(result).toEqual({ safe: 1, nested: {} }); expect({}.polluted).toBeUndefined(); });
test("copies own enumerable keys only", () => { const overlay = Object.create({ inherited: 1 }); overlay.own = 2; expect(deepMerge({}, overlay)).toEqual({ own: 2 }); });
test("preserves null prototypes", () => { const overlay = Object.create(null); overlay.a = 1; const result = deepMerge({}, overlay); expect(Object.getPrototypeOf(result)).toBeNull(); expect(result.a).toBe(1); });
test("null replaces normally", () => expect(deepMerge({ a: { x: 1 } }, { a: null })).toEqual({ a: null }));
