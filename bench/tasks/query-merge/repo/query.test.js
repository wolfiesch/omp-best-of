import { expect, test } from "bun:test"; import { mergeQuery } from "./query.js";
test("replaces and appends fields", () => expect(mergeQuery("https://x.test/p?a=1", [["a", "2"], ["b", "3"]])).toBe("https://x.test/p?a=2&b=3"));
test("deletes a field", () => expect(mergeQuery("https://x.test/p?a=1&b=2", [["a", null]])).toBe("https://x.test/p?b=2"));
