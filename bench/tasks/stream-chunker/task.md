`chunkBytes(source, size)` in `stream-chunker.js` is incomplete. Fix it.

Implement it as an async generator over an async or synchronous iterable of `Uint8Array` values. Coalesce and split input boundaries to yield fresh `Uint8Array` chunks of exactly `size` bytes, except for one final shorter chunk. Preserve byte order, skip empty inputs, and yield nothing for an empty source.

`size` must be a positive integer and must be rejected before consuming the source. Reject a non-`Uint8Array` input. Output chunks must not share storage with any input or with one another. If source iteration throws, propagate the same error and discard any buffered partial chunk; already yielded full chunks remain yielded.

Keep the exported name. Visible tests cover only one input smaller than the chunk size.
