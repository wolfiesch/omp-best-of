`parseRange(header, size)` in `range.js` is incomplete. Fix it.

Parse exactly one HTTP byte range. Accept `bytes=start-end`, `bytes=start-`, and `bytes=-suffixLength`, with optional horizontal whitespace around the value. `size` is the full representation length. Return an inclusive `{ start, end }`, clamping an explicit end to `size - 1`. Return `null` for malformed input, multiple ranges, non-decimal or negative numbers, zero suffix length, zero-sized representations, start beyond the representation, or end before start. A suffix longer than the representation selects the whole representation. Do not use floating-point or permissive `parseInt` prefixes.

Keep the exported name and signature. Visible tests already pass and cover only ordinary explicit ranges.
