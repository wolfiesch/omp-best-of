`withRetry` in `retry.js` does not follow its documented contract. Fix it.

The contract:

- Call the operation at most `attempts` times in total.
- Retry only when `isTransient(error)` returns true. A permanent error rejects immediately.
- Wait `baseDelayMs * 2 ** (attempt - 1)` before retry `attempt`, using the injected `sleep`.
- Reject with the last error when every attempt fails.
- Resolve with the operation's value as soon as it succeeds, and pass the one-based attempt number to the operation.

`bun test` runs the visible tests. They are incomplete, so passing them is not proof.
