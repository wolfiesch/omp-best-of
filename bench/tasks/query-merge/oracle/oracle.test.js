import { expect, test } from "bun:test"; import { mergeQuery } from "../query.js";
test("preserves relative forms and fragments", () => { expect(mergeQuery("p?a=1#frag?raw", [["a", "2"]])).toBe("p?a=2#frag?raw"); expect(mergeQuery("?a=1", [["b", "2"]])).toBe("?a=1&b=2"); expect(mergeQuery("#x", [["a", "1"]])).toBe("?a=1#x"); });
test("preserves untouched duplicates and replacement position", () => expect(mergeQuery("/p?x=1&a=old&x=2&b=3&a=again", [["a", "new"]])).toBe("/p?x=1&a=new&x=2&b=3"));
test("applies repeated updates in order", () => expect(mergeQuery("/p?a=1&b=2", [["a", "x"], ["a", null], ["a", "z"]])).toBe("/p?b=2&a=z"));
test("uses form encoding", () => expect(mergeQuery("/p?a=hello+world&plus=%2B", [["a", "x y"], ["plus", "+"]])).toBe("/p?a=x+y&plus=%2B"));
test("removes the question mark when empty", () => expect(mergeQuery("/p?a=1#f", [["a", null]])).toBe("/p#f"));
test("rejects malformed escapes", () => expect(() => mergeQuery("/p?a=%ZZ", [])).toThrow(TypeError));
