`createEmitter()` in `emitter.js` violates its event semantics. Fix it.

Return `{ on, once, off, emit }`. `on(name, listener)` and `once` return an unsubscribe function. `off` removes all registrations of that exact listener for that event and reports whether anything was removed. `emit(name, ...args)` calls a snapshot of listeners in registration order and returns the number actually invoked. A listener removed before its turn is not invoked. A listener added during emit waits until the next emit. A once listener is removed before invocation, so a reentrant emit cannot call it twice. Exceptions propagate immediately and later listeners are not called. Event names may be any Map key.

Keep the exported name. Visible tests cover ordinary on/off behavior only.
