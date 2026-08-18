import { expect, test } from "bun:test";
import { createEmitter } from "./emitter.js";

test("emits in registration order", () => { const e = createEmitter(); const seen = []; e.on("x", () => seen.push(1)); e.on("x", () => seen.push(2)); expect(e.emit("x")).toBe(2); expect(seen).toEqual([1, 2]); });
test("unsubscribes", () => { const e = createEmitter(); let calls = 0; const stop = e.on("x", () => calls++); stop(); e.emit("x"); expect(calls).toBe(0); });
