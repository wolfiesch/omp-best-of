export class CircuitOpenError extends Error {
	constructor(message = "circuit is open") { super(message); this.name = "CircuitOpenError"; }
}

export function createCircuitBreaker(operation, options) {
	if (!Number.isInteger(options.failureThreshold) || options.failureThreshold <= 0) throw new TypeError("failureThreshold must be a positive integer");
	if (!Number.isFinite(options.cooldownMs) || options.cooldownMs < 0) throw new TypeError("cooldownMs must be non-negative and finite");
	if (typeof options.now !== "function") throw new TypeError("now must be a function");
	let state = "closed";
	let consecutiveFailures = 0;
	let openedAt = 0;

	return async function run(...args) {
		let probe = false;
		if (state === "open") {
			if (options.now() - openedAt < options.cooldownMs) throw new CircuitOpenError();
			state = "half-open";
			probe = true;
		} else if (state === "half-open") {
			throw new CircuitOpenError();
		}
		try {
			const value = await operation(...args);
			state = "closed";
			consecutiveFailures = 0;
			return value;
		} catch (error) {
			if (probe) {
				state = "open";
				openedAt = options.now();
			} else {
				consecutiveFailures += 1;
				if (consecutiveFailures >= options.failureThreshold) {
					state = "open";
					openedAt = options.now();
				}
			}
			throw error;
		}
	};
}
