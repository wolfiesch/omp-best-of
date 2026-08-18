import { expect, test } from "bun:test";
import { createEmitter } from "../emitter.js";

test("once removes before reentrant invocation", () => { const e = createEmitter(); let calls = 0; e.once("x", () => { calls += 1; e.emit("x"); }); e.emit("x"); expect(calls).toBe(1); });
test("new listeners wait for the next snapshot", () => { const e = createEmitter(); const seen = []; e.on("x", () => { seen.push("a"); e.on("x", () => seen.push("b")); }); e.emit("x"); expect(seen).toEqual(["a"]); e.emit("x"); expect(seen).toEqual(["a", "a", "b"]); });
test("removal before a turn skips the listener", () => { const e = createEmitter(); const seen = []; const b = () => seen.push("b"); e.on("x", () => { seen.push("a"); e.off("x", b); }); e.on("x", b); expect(e.emit("x")).toBe(1); expect(seen).toEqual(["a"]); });
test("off removes duplicate registrations", () => { const e = createEmitter(); let calls = 0; const fn = () => calls++; e.on("x", fn); e.on("x", fn); expect(e.off("x", fn)).toBe(true); expect(e.emit("x")).toBe(0); expect(calls).toBe(0); });
test("once unsubscribe removes the registered wrapper", () => { const e = createEmitter(); let calls = 0; const unsubscribe = e.once("x", () => calls++); expect(unsubscribe()).toBe(true); expect(e.emit("x")).toBe(0); expect(calls).toBe(0); });
test("propagates exceptions immediately", () => { const e = createEmitter(); let later = false; e.on("x", () => { throw new Error("boom"); }); e.on("x", () => { later = true; }); expect(() => e.emit("x")).toThrow("boom"); expect(later).toBe(false); });
