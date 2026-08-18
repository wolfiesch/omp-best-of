export async function* chunkBytes(source, size) {
	if (!Number.isInteger(size) || size <= 0) throw new RangeError("size must be a positive integer");
	let output = new Uint8Array(size);
	let used = 0;
	for await (const input of source) {
		if (!(input instanceof Uint8Array)) throw new TypeError("source values must be Uint8Array");
		let offset = 0;
		while (offset < input.length) {
			const copied = Math.min(size - used, input.length - offset);
			output.set(input.subarray(offset, offset + copied), used);
			used += copied;
			offset += copied;
			if (used === size) {
				yield output;
				output = new Uint8Array(size);
				used = 0;
			}
		}
	}
	if (used > 0) yield output.slice(0, used);
}
