export function mergeIntervals(intervals) {
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const merged = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last && interval.start <= last.end) {
			last.end = Math.max(last.end, interval.end);
			continue;
		}
		merged.push({ start: interval.start, end: interval.end });
	}
	return merged;
}
