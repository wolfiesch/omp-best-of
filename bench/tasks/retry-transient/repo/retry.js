/**
 * Retries a transient operation with exponential backoff.
 *
 * @param {(attempt: number) => Promise<unknown>} operation one-based attempt number
 * @param {{ attempts: number, baseDelayMs: number, isTransient: (error: unknown) => boolean, sleep: (ms: number) => Promise<void> }} options
 */
export async function withRetry(operation, options) {
	let lastError;
	for (let attempt = 0; attempt <= options.attempts; attempt += 1) {
		try {
			return await operation(attempt);
		} catch (error) {
			lastError = error;
			await options.sleep(options.baseDelayMs * attempt);
		}
	}
	throw lastError;
}
