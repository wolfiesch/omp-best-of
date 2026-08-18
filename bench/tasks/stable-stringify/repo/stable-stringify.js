export function stableStringify(value) {
	if (!value || Array.isArray(value) || typeof value !== "object") return JSON.stringify(value);
	const sorted = {};
	for (const key of Object.keys(value).sort()) sorted[key] = value[key];
	return JSON.stringify(sorted);
}
