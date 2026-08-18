`createCircuitBreaker(operation, options)` in `circuit-breaker.js` is incomplete. Fix it.

Export `CircuitOpenError` and return an async `run(...args)` function. In the closed state, forward arguments and results to `operation`. Count consecutive failures; any success resets the count. When `failureThreshold` consecutive calls fail, open the circuit at `now()`.

While open and fewer than `cooldownMs` milliseconds have elapsed, reject with `CircuitOpenError` without calling the operation. After the cooldown, allow exactly one half-open probe. Concurrent callers while that probe is pending reject with `CircuitOpenError`. A successful probe closes and resets the breaker. A failed probe reopens it and starts a new cooldown at the probe failure time. Synchronous throws count as failures.

Require a positive integer `failureThreshold`, a non-negative finite `cooldownMs`, and a `now` function. Keep the exported names. Visible tests cover only forwarding a successful call.
