export class StablePriorityQueue {
	#values = [];
	#compare;
	constructor(compare) { this.#compare = compare; }
	get size() { return this.#values.length; }
	enqueue(value) { this.#values.push(value); this.#values.sort((a, b) => this.#compare(a, b) || -1); }
	peek() { return this.#values[0]; }
	dequeue() { return this.#values.shift(); }
}
