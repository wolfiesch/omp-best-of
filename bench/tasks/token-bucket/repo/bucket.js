export function createBucket({ capacity, refillPerMs, now }) {
	let tokens = capacity;
	let updatedAt = now();
	function refill() {
		const current = now();
		tokens = Math.min(capacity, tokens + Math.floor(current - updatedAt) * refillPerMs);
		updatedAt = current;
	}
	return {
		take(count = 1) { refill(); if (tokens < count) return false; tokens -= count; return true; },
		available() { refill(); return tokens; },
	};
}
