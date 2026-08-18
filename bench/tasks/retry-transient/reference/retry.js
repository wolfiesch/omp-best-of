/**
 * Retries a transient operation with exponential backoff.
 *
 * @param {(attempt: number) => Promise<unknown>} operation one-based attempt number
 * @param {{ attempts: number, baseDelayMs: number, isTransient: (error: unknown) => boolean, sleep: (ms: number) => Promise<void> }} options
 * @returns {Promise<unknown>} the operation's value
 */
export async function withRetry(operation, options) {
	for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
		try {
			return await operation(attempt);
		} catch (error) {
			if (attempt === options.attempts || !options.isTransient(error)) throw error;
			await options.sleep(options.baseDelayMs * 2 ** (attempt - 1));
		}
	}
	throw new Error("attempts must be at least 1");
}
