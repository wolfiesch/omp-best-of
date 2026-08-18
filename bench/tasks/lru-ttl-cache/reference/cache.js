export function createCache({ capacity, ttlMs, now }) {
	// Map iteration order carries recency: first entry is least recently used.
	const entries = new Map();

	function expired(entry) {
		return now() - entry.storedAt >= ttlMs;
	}

	function sweep() {
		for (const [key, entry] of entries) {
			if (expired(entry)) entries.delete(key);
		}
	}

	function touch(key, entry) {
		entries.delete(key);
		entries.set(key, entry);
	}

	return {
		set(key, value) {
			const entry = { value, storedAt: now() };
			if (entries.has(key)) {
				touch(key, entry);
				return;
			}
			sweep();
			if (entries.size >= capacity) {
				const leastRecent = entries.keys().next().value;
				entries.delete(leastRecent);
			}
			entries.set(key, entry);
		},
		get(key) {
			const entry = entries.get(key);
			if (entry === undefined) return undefined;
			if (expired(entry)) {
				entries.delete(key);
				return undefined;
			}
			touch(key, entry);
			return entry.value;
		},
		size() {
			sweep();
			return entries.size;
		},
		keys() {
			sweep();
			return [...entries.keys()];
		},
	};
}
