`parseContentType(input)` in `content-type.js` is incomplete. Fix it.

Return `{ type, parameters }` or `null`. The media type must be exactly two non-empty HTTP token components separated by `/`; normalize it and parameter names to lowercase. Parameters are `; name=value`; surrounding optional whitespace is ignored. Unquoted values must be non-empty HTTP tokens. Quoted values may contain semicolons and equals signs, support backslash escaping of the next character, and must close. Duplicate parameters use the last value. Reject malformed types, missing names or values, trailing junk after a quote, invalid escapes, and control characters. Return a normal object with no prototype-sensitive assignment behavior.

Keep the export and signature. Visible tests cover simple unquoted parameters.
