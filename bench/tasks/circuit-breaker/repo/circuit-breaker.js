export class CircuitOpenError extends Error {}

export function createCircuitBreaker(operation, options) {
	let failures = 0;
	return async function run(...args) {
		if (failures >= options.failureThreshold) throw new CircuitOpenError("circuit open");
		try {
			return await operation(...args);
		} catch (error) {
			failures += 1;
			throw error;
		}
	};
}
