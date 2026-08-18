export function parseRange(header, size) {
	if (!header.startsWith("bytes=")) return null;
	const [startText, endText] = header.slice(6).split("-");
	const start = Number.parseInt(startText, 10);
	const end = endText === "" ? size - 1 : Number.parseInt(endText, 10);
	if (start > end || start >= size) return null;
	return { start, end: Math.min(end, size - 1) };
}
