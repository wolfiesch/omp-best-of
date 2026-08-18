export class StablePriorityQueue {
	#heap = [];
	#compare;
	#sequence = 0;
	constructor(compare) {
		if (typeof compare !== "function") throw new TypeError("comparator must be a function");
		this.#compare = compare;
	}
	get size() { return this.#heap.length; }
	#before(left, right) { return this.#compare(left.value, right.value) || left.sequence - right.sequence; }
	enqueue(value) {
		const entry = { value, sequence: this.#sequence++ };
		this.#heap.push(entry);
		let index = this.#heap.length - 1;
		while (index > 0) {
			const parent = Math.floor((index - 1) / 2);
			if (this.#before(this.#heap[parent], entry) <= 0) break;
			this.#heap[index] = this.#heap[parent];
			index = parent;
		}
		this.#heap[index] = entry;
	}
	peek() { return this.#heap[0]?.value; }
	dequeue() {
		if (this.#heap.length === 0) return undefined;
		const first = this.#heap[0];
		const last = this.#heap.pop();
		if (this.#heap.length > 0) {
			let index = 0;
			while (true) {
				const left = index * 2 + 1;
				const right = left + 1;
				if (left >= this.#heap.length) break;
				let child = left;
				if (right < this.#heap.length && this.#before(this.#heap[right], this.#heap[left]) < 0) child = right;
				if (this.#before(last, this.#heap[child]) <= 0) break;
				this.#heap[index] = this.#heap[child];
				index = child;
			}
			this.#heap[index] = last;
		}
		return first.value;
	}
}
