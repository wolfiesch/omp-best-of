`createBucket` in `bucket.js` does not implement a continuous token bucket. Fix it.

`createBucket({ capacity, refillPerMs, now })` starts full and returns `{ take, available }`. Refill continuously by elapsed milliseconds, including fractional tokens, and clamp at capacity. `take(count = 1)` first refills, then returns `true` and deducts exactly `count` when enough tokens exist; otherwise it returns `false` without deducting. `available()` first refills and returns the exact current token count. A clock moving backward must not mint tokens or move the refill timestamp backward. Require finite `capacity > 0`, finite `refillPerMs >= 0`, and finite `count > 0`; invalid construction or count throws `TypeError`.

Keep the exported name and returned shape. Visible tests pass but do not cover fractional refill or clock reversal.
