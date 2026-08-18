import { expect, test } from "bun:test";
import { stableStringify } from "./stable-stringify.js";

test("sorts a flat object", () => {
	expect(stableStringify({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
});
