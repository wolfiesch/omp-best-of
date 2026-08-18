export function mergeQuery(url, updates) {
	const parsed = new URL(url);
	for (const [name, value] of updates) { if (value === null) parsed.searchParams.delete(name); else parsed.searchParams.set(name, value); }
	return parsed.toString();
}
