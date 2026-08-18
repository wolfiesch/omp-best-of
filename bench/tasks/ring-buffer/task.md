`RingBuffer` in `ring-buffer.js` is incomplete. Fix it.

Construct with a positive integer capacity. Expose read-only `capacity` and `size` getters. `push(value)` appends the newest value; when full, evict the oldest and return it, otherwise return `undefined`. `shift()` removes and returns the oldest value. `peek()` returns the oldest without removal. Empty `shift` and `peek` return `undefined`. `clear()` empties the buffer without changing capacity.

Iteration with `[Symbol.iterator]()` yields values from oldest to newest. Each iterator is a snapshot taken when the iterator is created, so later pushes, shifts, and clears do not alter that iterator. Support arbitrary JavaScript values without cloning and preserve correct wraparound through repeated overwrite cycles.

Keep the exported class and method names. Visible tests cover filling without wraparound.
