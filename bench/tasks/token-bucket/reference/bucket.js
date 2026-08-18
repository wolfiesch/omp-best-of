function positive(value) { return Number.isFinite(value) && value > 0; }
export function createBucket({ capacity, refillPerMs, now }) {
	if (!positive(capacity) || !Number.isFinite(refillPerMs) || refillPerMs < 0) throw new TypeError("Invalid bucket options");
	let tokens = capacity; let updatedAt = now();
	function refill() { const current = now(); if (current > updatedAt) { tokens = Math.min(capacity, tokens + (current - updatedAt) * refillPerMs); updatedAt = current; } }
	return {
		take(count = 1) { if (!positive(count)) throw new TypeError("Invalid token count"); refill(); if (tokens < count) return false; tokens -= count; return true; },
		available() { refill(); return tokens; },
	};
}
