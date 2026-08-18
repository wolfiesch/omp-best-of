export function subtract(intervals, cut) {
	const result = [];
	for (const interval of intervals) {
		if (cut.end < interval.start || cut.start > interval.end) { result.push(interval); continue; }
		if (cut.start > interval.start) result.push({ start: interval.start, end: cut.start });
		if (cut.end < interval.end) result.push({ start: cut.end, end: interval.end });
	}
	return result;
}
