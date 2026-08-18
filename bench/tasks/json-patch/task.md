`applyPatch(document, operations)` in `json-patch.js` is incomplete. Fix it.

Apply RFC 6902-style `add`, `remove`, `replace`, and `test` operations to JSON-compatible data and return the patched document. The input document and operation values must remain unchanged, including after any failure. Apply the sequence atomically to a deep clone.

Paths use JSON Pointer: `""` addresses the root, `/` separates tokens, and `~0`/`~1` decode to `~`/`/`; reject malformed escapes. Object properties must be own properties and names such as `__proto__` must behave as data. Array indices are canonical non-negative decimals without leading zeroes. `add` permits an index through `length` and `-` for append; other operations require an existing index and reject `-`. Missing parents, missing targets, unsupported operations, malformed operation objects, and failed `test` operations throw. Removing the root throws; root `add` or `replace` replaces the document. `test` uses structural JSON equality.

Keep the exported name and signature. Visible tests cover only replacing one object property.
