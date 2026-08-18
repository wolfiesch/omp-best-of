`memoizeAsync(fn)` in `memoize.js` is incomplete. Fix it.

Return a function that memoizes by the first argument using JavaScript `Map` key identity. Concurrent calls for the same key must receive the exact same pending promise and invoke `fn` once. Fulfilled promises stay cached. A rejection must evict only the promise that rejected, so a later call retries; an older rejection must never delete a newer replacement. If `fn` throws synchronously, return a rejected promise and leave no cached entry. Cache `undefined` results normally. Preserve `this` from the first call that creates an entry and forward all arguments.

Keep the export and signature. Visible tests cover only fulfilled sequential calls.
