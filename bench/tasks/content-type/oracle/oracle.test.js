import { expect, test } from "bun:test"; import { parseContentType } from "../content-type.js";
test("parses quoted delimiters and escapes", () => expect(parseContentType('text/plain; note="a;b=c\\d"')).toEqual({ type: "text/plain", parameters: { note: "a;b=cd" } }));
test("uses the last duplicate", () => expect(parseContentType("text/plain; a=1; A=2").parameters).toEqual({ a: "2" }));
test("rejects malformed types", () => { for (const input of ["text", "/plain", "text/", "text/plain/extra", "te xt/plain"]) expect(parseContentType(input)).toBeNull(); });
test("rejects malformed parameters", () => { for (const input of ["text/plain; =x", "text/plain; a=", "text/plain; a=two words", 'text/plain; a="unterminated', 'text/plain; a="x"junk', 'text/plain; a="x\\']) expect(parseContentType(input)).toBeNull(); });
test("does not permit prototype assignment", () => { const result = parseContentType("text/plain; __proto__=x"); expect(Object.getPrototypeOf(result.parameters)).toBe(Object.prototype); expect(Object.hasOwn(result.parameters, "__proto__")).toBe(true); expect(result.parameters.__proto__).toBe("x"); });
test("rejects control characters", () => { for (const input of ["\ntext/plain", "text/\tplain", "text/plain; a=\rvalue", 'text/plain; a="x\n"']) expect(parseContentType(input)).toBeNull(); });
