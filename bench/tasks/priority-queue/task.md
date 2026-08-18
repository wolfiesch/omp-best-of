`StablePriorityQueue` in `priority-queue.js` is incomplete. Fix it.

The constructor requires a comparator function with the same sign convention as `Array.prototype.sort`; lower values dequeue first. Implement `enqueue(value)`, `dequeue()`, `peek()`, and a read-only `size` getter. `dequeue` and `peek` return `undefined` when empty.

Ordering must remain stable when the comparator returns zero: equal-priority values dequeue in insertion order, including after arbitrary interleaved enqueue and dequeue operations. Store values without cloning and support any JavaScript value. `peek` must not remove or reorder anything. Do not expose internal storage. Comparator errors propagate.

Keep the exported class and method names. Visible tests cover only distinct numeric priorities.
