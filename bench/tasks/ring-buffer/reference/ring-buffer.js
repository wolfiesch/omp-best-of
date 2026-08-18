export class RingBuffer {
	#capacity;
	#values;
	#start = 0;
	#size = 0;
	constructor(capacity) {
		if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("capacity must be a positive integer");
		this.#capacity = capacity;
		this.#values = new Array(capacity);
	}
	get capacity() { return this.#capacity; }
	get size() { return this.#size; }
	push(value) {
		if (this.#size < this.#capacity) {
			this.#values[(this.#start + this.#size) % this.#capacity] = value;
			this.#size += 1;
			return undefined;
		}
		const evicted = this.#values[this.#start];
		this.#values[this.#start] = value;
		this.#start = (this.#start + 1) % this.#capacity;
		return evicted;
	}
	shift() {
		if (this.#size === 0) return undefined;
		const value = this.#values[this.#start];
		this.#values[this.#start] = undefined;
		this.#start = (this.#start + 1) % this.#capacity;
		this.#size -= 1;
		if (this.#size === 0) this.#start = 0;
		return value;
	}
	peek() { return this.#size === 0 ? undefined : this.#values[this.#start]; }
	clear() { this.#values = new Array(this.#capacity); this.#start = 0; this.#size = 0; }
	#snapshot() { return Array.from({ length: this.#size }, (_, index) => this.#values[(this.#start + index) % this.#capacity]); }
	[Symbol.iterator]() { return this.#snapshot()[Symbol.iterator](); }
}
