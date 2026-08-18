const DECIMAL = /^(0|[1-9]\d*)$/;
function integer(text) {
	if (!DECIMAL.test(text)) return null;
	const value = Number(text);
	return Number.isSafeInteger(value) ? value : null;
}
export function parseRange(header, size) {
	if (!Number.isSafeInteger(size) || size <= 0) return null;
	const match = /^\s*bytes=([^,]+)\s*$/.exec(header);
	if (!match) return null;
	const parts = match[1].trim().split("-");
	if (parts.length !== 2) return null;
	const [left, right] = parts;
	if (left === "") {
		const suffix = integer(right);
		if (suffix === null || suffix === 0) return null;
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = integer(left);
	if (start === null || start >= size) return null;
	if (right === "") return { start, end: size - 1 };
	const end = integer(right);
	if (end === null || end < start) return null;
	return { start, end: Math.min(end, size - 1) };
}
