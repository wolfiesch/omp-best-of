export function getPointer(document, pointer) {
	if (pointer === "") return document;
	const tokens = pointer.split("/").slice(1).map(token => token.replaceAll("~1", "/"));
	let value = document;
	for (const token of tokens) {
		if (value == null) return undefined;
		value = value[token];
	}
	return value;
}
