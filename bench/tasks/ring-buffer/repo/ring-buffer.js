export class RingBuffer {
	#values = [];
	constructor(capacity) { this.capacity = capacity; }
	get size() { return this.#values.length; }
	push(value) {
		if (this.#values.length === this.capacity) return this.#values.pop();
		this.#values.push(value);
		return undefined;
	}
	shift() { return this.#values.shift(); }
	peek() { return this.#values[0]; }
	clear() { this.#values.length = 0; }
	*[Symbol.iterator]() { yield* this.#values; }
}
