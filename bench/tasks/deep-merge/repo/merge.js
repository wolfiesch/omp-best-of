export function deepMerge(base, overlay) {
	if (Array.isArray(base) && Array.isArray(overlay)) return [...base, ...overlay];
	if (base && overlay && typeof base === "object" && typeof overlay === "object") {
		const result = { ...base };
		for (const key in overlay) result[key] = key in result ? deepMerge(result[key], overlay[key]) : overlay[key];
		return result;
	}
	return overlay === undefined ? base : overlay;
}
