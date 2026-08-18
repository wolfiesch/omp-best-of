import { expect, test } from "bun:test";
import { RingBuffer } from "./ring-buffer.js";

test("fills and shifts in order", () => {
	const buffer = new RingBuffer(3);
	buffer.push("a"); buffer.push("b");
	expect(buffer.size).toBe(2);
	expect(buffer.shift()).toBe("a");
	expect(buffer.shift()).toBe("b");
});
