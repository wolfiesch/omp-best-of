import { expect, test } from "bun:test";
import { mergeIntervals } from "../intervals.js";

test("sorts unordered input", () => {
	expect(mergeIntervals([{ start: 5, end: 7 }, { start: 1, end: 3 }])).toEqual([
		{ start: 1, end: 3 },
		{ start: 5, end: 7 },
	]);
});

test("merges intervals that touch at a boundary", () => {
	expect(mergeIntervals([{ start: 1, end: 2 }, { start: 2, end: 3 }])).toEqual([{ start: 1, end: 3 }]);
});

test("keeps the outer bound when an interval is contained", () => {
	expect(mergeIntervals([{ start: 1, end: 10 }, { start: 3, end: 4 }])).toEqual([{ start: 1, end: 10 }]);
});

test("merges a chain through a contained interval", () => {
	expect(
		mergeIntervals([
			{ start: 1, end: 10 },
			{ start: 3, end: 4 },
			{ start: 9, end: 12 },
		]),
	).toEqual([{ start: 1, end: 12 }]);
});

test("does not mutate the caller's array or intervals", () => {
	const first = { start: 5, end: 7 };
	const second = { start: 1, end: 6 };
	const input = [first, second];
	mergeIntervals(input);
	expect(input).toEqual([{ start: 5, end: 7 }, { start: 1, end: 6 }]);
	expect(input[0]).toBe(first);
	expect(first).toEqual({ start: 5, end: 7 });
	expect(second).toEqual({ start: 1, end: 6 });
});

test("returns an empty list for empty input", () => {
	expect(mergeIntervals([])).toEqual([]);
});
