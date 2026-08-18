export async function* chunkBytes(source, size) {
	for await (const input of source) yield input.subarray(0, size);
}
