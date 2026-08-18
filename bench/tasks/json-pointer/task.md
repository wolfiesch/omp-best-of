`getPointer(document, pointer)` in `pointer.js` does not implement its contract. Fix it.

Implement JSON Pointer lookup for JavaScript objects and arrays. An empty pointer returns the document. Every non-empty pointer must start with `/`; otherwise throw `TypeError`. Decode each reference token by replacing `~1` with `/` and then `~0` with `~`. Any other `~` escape is invalid and throws `TypeError`. Object lookup uses own properties only. Array tokens are canonical non-negative decimal indices: `0` is valid, leading zeroes, `-`, negatives, and non-digits are invalid. Return `undefined` for a valid pointer whose property or array index is missing.

Keep the exported name and signature. `bun test` runs visible tests that already pass but cover only basics.
