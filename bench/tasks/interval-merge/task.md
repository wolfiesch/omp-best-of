`mergeIntervals` in `intervals.js` is wrong. Fix it so it returns the minimal set of merged intervals for any input.

Requirements:

- Input may arrive in any order.
- Intervals that touch at a boundary belong to one interval.
- An interval fully contained in another must not extend it.
- Do not mutate the caller's array or its interval objects.
- Keep the exported name and signature.

`bun test` runs the visible tests. They are incomplete, so passing them is not proof.
