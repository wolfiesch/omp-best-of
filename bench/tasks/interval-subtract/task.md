`subtract(intervals, cut)` in `subtract.js` is wrong at boundaries. Fix it.

Intervals are half-open numeric ranges `{ start, end }` with finite `start <= end`. Return the portions of `intervals` not covered by `cut`, preserving input order. Empty intervals and an empty cut cover nothing and must not create output. A cut touching an endpoint does not overlap. A cut may split an interval into two. Validate every range and throw `TypeError` on non-finite coordinates or `start > end`. Return fresh objects and do not mutate inputs. Inputs need not be sorted or disjoint.

Keep the export and signature. Visible tests cover only a cut strictly inside one interval.
