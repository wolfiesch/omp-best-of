import { expect, test } from "bun:test"; import { subtract } from "../subtract.js";
test("treats touching endpoints as disjoint", () => { expect(subtract([{ start: 0, end: 2 }], { start: 2, end: 4 })).toEqual([{ start: 0, end: 2 }]); expect(subtract([{ start: 2, end: 4 }], { start: 0, end: 2 })).toEqual([{ start: 2, end: 4 }]); });
test("an empty cut changes nothing", () => expect(subtract([{ start: 0, end: 2 }], { start: 1, end: 1 })).toEqual([{ start: 0, end: 2 }]));
test("drops empty source intervals", () => expect(subtract([{ start: 1, end: 1 }, { start: 1, end: 2 }], { start: 5, end: 6 })).toEqual([{ start: 1, end: 2 }]));
test("handles unsorted independent intervals", () => expect(subtract([{ start: 10, end: 20 }, { start: 0, end: 5 }], { start: 3, end: 12 })).toEqual([{ start: 12, end: 20 }, { start: 0, end: 3 }]));
test("returns fresh objects", () => { const item = { start: 0, end: 2 }; const result = subtract([item], { start: 3, end: 4 }); expect(result[0]).not.toBe(item); expect(item).toEqual({ start: 0, end: 2 }); });
test("validates ranges", () => { expect(() => subtract([{ start: 2, end: 1 }], { start: 0, end: 1 })).toThrow(TypeError); expect(() => subtract([], { start: 0, end: Infinity })).toThrow(TypeError); });
