`mergeQuery(url, updates)` in `query.js` does not preserve URL structure. Fix it.

`url` may be absolute, protocol-relative, root-relative, path-relative, query-only, or fragment-only. `updates` is an ordered array of `[name, value]`, where strings replace all existing values for that name and `null` deletes them. Parse and serialize query fields using form encoding: `+` decodes as space, percent escapes decode UTF-8, spaces encode as `+`, and literal `+` encodes as `%2B`. Preserve untouched fields in order, including duplicate fields. A replacement is inserted at the position of the first removed field, or appended if absent; later updates to the same name apply to the result of earlier updates. Preserve the path and fragment byte-for-byte. Omit `?` when no fields remain. Throw `TypeError` for malformed percent escapes.

Keep the export and signature. Visible tests cover a simple absolute URL without a fragment.
