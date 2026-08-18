function decode(token) {
	let result = "";
	for (let i = 0; i < token.length; i += 1) {
		if (token[i] !== "~") { result += token[i]; continue; }
		const next = token[++i];
		if (next === "0") result += "~";
		else if (next === "1") result += "/";
		else throw new TypeError("Invalid JSON Pointer escape");
	}
	return result;
}
export function getPointer(document, pointer) {
	if (pointer === "") return document;
	if (!pointer.startsWith("/")) throw new TypeError("Pointer must start with /");
	let value = document;
	for (const raw of pointer.slice(1).split("/")) {
		const token = decode(raw);
		if (value == null || (typeof value !== "object" && typeof value !== "function")) return undefined;
		if (Array.isArray(value)) {
			if (!/^(0|[1-9]\d*)$/.test(token)) throw new TypeError("Invalid array index");
			const index = Number(token);
			value = index < value.length ? value[index] : undefined;
		} else {
			value = Object.hasOwn(value, token) ? value[token] : undefined;
		}
	}
	return value;
}
