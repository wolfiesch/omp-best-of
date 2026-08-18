`createSingleflight(loader)` in `singleflight.js` is incomplete. Fix it.

Return a `load(key)` function that coalesces concurrent calls for the same `Map` key. While a load is pending, every call for that key must return the exact same promise and invoke `loader(key)` once. Different keys run independently and object keys use identity semantics.

This is not a cache: remove the entry after either fulfillment or rejection, but only after all callers have received the shared settlement. A later call starts a fresh load. Convert synchronous loader throws into promise rejection and clean them up the same way. Rejections preserve the original error object. Keys such as `undefined` and `NaN` are valid.

Keep the exported name and signature. Visible tests cover only two concurrent successful calls.
