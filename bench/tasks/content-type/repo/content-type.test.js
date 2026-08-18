import { expect, test } from "bun:test"; import { parseContentType } from "./content-type.js";
test("parses a media type", () => expect(parseContentType("text/html")).toEqual({ type: "text/html", parameters: {} }));
test("parses ordinary parameters", () => expect(parseContentType("Text/Plain; Charset=utf-8")).toEqual({ type: "text/plain", parameters: { charset: "utf-8" } }));
