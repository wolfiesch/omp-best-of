export function createCache({ capacity, ttlMs, now }) {
	const entries = new Map();

	function expired(entry) {
		return now() - entry.storedAt >= ttlMs;
	}

	return {
		set(key, value) {
			if (entries.size >= capacity && !entries.has(key)) {
				const oldest = entries.keys().next().value;
				entries.delete(oldest);
			}
			entries.set(key, { value, storedAt: now() });
		},
		get(key) {
			const entry = entries.get(key);
			if (entry === undefined) return undefined;
			if (expired(entry)) {
				entries.delete(key);
				return undefined;
			}
			return entry.value;
		},
		size() {
			return entries.size;
		},
		keys() {
			return [...entries.keys()];
		},
	};
}
