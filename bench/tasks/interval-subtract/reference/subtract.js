function valid(range) { return Number.isFinite(range.start) && Number.isFinite(range.end) && range.start <= range.end; }
export function subtract(intervals, cut) {
	if (!valid(cut) || intervals.some(interval => !valid(interval))) throw new TypeError("Invalid interval");
	const result = [];
	for (const interval of intervals) {
		if (interval.start === interval.end) continue;
		if (cut.start === cut.end || cut.end <= interval.start || cut.start >= interval.end) { result.push({ ...interval }); continue; }
		if (cut.start > interval.start) result.push({ start: interval.start, end: Math.min(cut.start, interval.end) });
		if (cut.end < interval.end) result.push({ start: Math.max(cut.end, interval.start), end: interval.end });
	}
	return result;
}
