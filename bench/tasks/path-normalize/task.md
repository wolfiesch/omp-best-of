`normalize(input)` in `pathutil.js` does not implement its contract. Fix it.

It normalizes a POSIX-style path as a string, without touching the filesystem.

The contract:

- Collapse repeated separators, so `a//b` becomes `a/b`.
- Drop `.` segments.
- Resolve a `..` segment against the preceding segment.
- On an absolute path, a `..` that would climb above the root is dropped, so `/a/../../b`
  becomes `/b` and `/..` becomes `/`.
- On a relative path, a leading `..` that cannot be resolved is preserved, so `../../a` stays
  `../../a` and `a/../../b` becomes `../b`.
- Remove a trailing separator, except that the root stays `/`.
- Return `.` for an empty input and for any relative path that reduces to nothing, so both ``
  and `a/..` become `.`.
- An absolute path always keeps its leading `/`.

Keep the exported name and signature, and return a string.

`bun test` runs the visible tests. They already pass and cover only the basics, so passing
them is not proof.
