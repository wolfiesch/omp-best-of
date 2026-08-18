import { expect, test } from "bun:test";
import { mergeIntervals } from "./intervals.js";

test("merges overlapping intervals", () => {
	expect(mergeIntervals([{ start: 1, end: 4 }, { start: 3, end: 6 }])).toEqual([{ start: 1, end: 6 }]);
});

test("keeps disjoint intervals apart", () => {
	expect(mergeIntervals([{ start: 1, end: 2 }, { start: 5, end: 7 }])).toEqual([
		{ start: 1, end: 2 },
		{ start: 5, end: 7 },
	]);
});
