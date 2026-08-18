`stableStringify(value)` in `stable-stringify.js` is incomplete. Fix it.

Serialize JSON-like data deterministically. Support `null`, booleans, strings, finite numbers, dense arrays, and plain objects whose prototype is either `Object.prototype` or `null`. Sort every object's own enumerable string keys by JavaScript lexical order; preserve array order. Use JSON string escaping and serialize `-0` as `0`.

Reject sparse arrays, cycles, non-finite numbers, `undefined`, bigint, symbol, function, and non-plain objects with `TypeError`. Shared acyclic references are valid and serialized each time. Do not invoke `toJSON`, mutate the input, or include inherited and symbol properties.

Keep the exported name and signature. Visible tests cover only one flat object.
