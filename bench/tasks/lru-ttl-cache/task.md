`createCache` in `cache.js` does not implement its contract. Fix it.

`createCache({ capacity, ttlMs, now })` returns `{ get, set, size, keys }`. `now` is an
injected clock returning milliseconds, so tests control time.

The contract:

- `set(key, value)` stores the value and marks the key most recently used. Setting a key that
  is already present replaces its value, marks it most recently used, and restarts its
  lifetime. It never increases the entry count.
- `get(key)` returns the stored value, or `undefined` when the key is absent or expired. A
  live read marks the key most recently used. An expired entry is discarded when it is read.
- An entry is expired once `now() - storedAt >= ttlMs`.
- When storing a new key would exceed `capacity`, discard expired entries first. If that frees
  room, evict nothing else. Otherwise evict the least recently used live entry.
- `size()` returns the number of live entries, never counting expired ones.
- `keys()` returns the live keys ordered from least recently used to most recently used.

Keep the exported name and the shape of the returned object.

`bun test` runs the visible tests. They already pass and cover only the basics, so passing
them is not proof.
