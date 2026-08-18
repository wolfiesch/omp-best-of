`deepMerge(base, overlay)` in `merge.js` violates its immutable merge contract. Fix it.

Return a new value without mutating either input. Recursively merge only plain objects whose prototype is `Object.prototype` or `null`. Arrays and every other value are replaced by a clone of the overlay value. An overlay property with value `undefined` is ignored; `null` replaces normally. Copy own enumerable string keys only. Ignore the keys `__proto__`, `prototype`, and `constructor` at every depth. Preserve a null prototype when cloning a null-prototype object. Shared references in an acyclic input may remain shared, but inputs are JSON-like and cycles need not be supported.

Keep the export and signature. Visible tests cover a simple nested object merge.
