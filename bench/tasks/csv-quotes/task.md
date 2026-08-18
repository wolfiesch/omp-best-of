`parseCsvLine` in `csv.js` mishandles quoted fields. Fix it so it parses one RFC 4180 style record.

The contract:

- A field wrapped in double quotes may contain commas.
- Inside a quoted field, `""` is a literal double quote.
- Quotes are only special at the start of a field; a bare quote elsewhere is literal text.
- An empty field, including a trailing one, yields an empty string.
- Whitespace outside quotes is preserved.
- Keep the exported name and signature, and return an array of strings.

`bun test` runs the visible tests. They are incomplete, so passing them is not proof.
