`mapLimit(items, limit, mapper)` in `promise-pool.js` is incomplete. Fix it.

Return a promise for an array of mapped values in input order. Invoke `mapper(value, index)` at most `limit` times concurrently. Do not mutate `items`. Empty input resolves to `[]` without calling the mapper.

`limit` must be a positive integer; reject before invoking the mapper otherwise. Reject with the first mapper error and stop starting new work after that rejection. Work already running may settle, but must not start queued items afterward. Synchronous mapper throws follow the same rule.

Keep the exported name and signature. Visible tests cover only ordinary successful mapping.
