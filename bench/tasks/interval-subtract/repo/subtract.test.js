import { expect, test } from "bun:test"; import { subtract } from "./subtract.js";
test("splits around an interior cut", () => expect(subtract([{ start: 0, end: 10 }], { start: 3, end: 7 })).toEqual([{ start: 0, end: 3 }, { start: 7, end: 10 }]));
test("removes a covered interval", () => expect(subtract([{ start: 2, end: 4 }], { start: 0, end: 8 })).toEqual([]));
