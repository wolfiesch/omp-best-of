# Measured results

Every number here came from `bench/run.ts` on this repository. Nothing is copied from the
upstream paper, and none of this reproduces the upstream Terminal-Bench figures.

## Setup shared by all runs

| Field | Value |
| --- | --- |
| Source | `546dfbd`, working tree dirty with the benchmark harness itself |
| Runtime | `omp/17.3.4`, Bun 1.3.14, darwin arm64 |
| Candidate model | `nous/deepseek/deepseek-v4-flash-0731` |
| Verifier model | `deepseek-v4-flash` through `llm-verifier==0.2.0` |
| Candidates per task | 4 |
| Verifier settings | 2 pivots, seed 0, 9 pairwise comparisons per task |
| Per-candidate limit | 4m, oracle timeout 90s |
| Iterations | 1 per task, no warmup discarded |
| Tasks | `interval-merge`, `retry-transient`, `csv-quotes` |
| Cost basis | Generation from the agent runtime's usage accounting, verification priced from DeepSeek list rates |

Raw scorecards, summaries, and candidate pools stay on the machine that ran them under
`bench/results/<run-id>/`. They are not committed because the stored transcripts contain
absolute local paths.

## Cost and latency

| Run | Configuration | Candidate runs | Generation | Verification | Total | Wall clock per task |
| --- | --- | --- | --- | --- | --- | --- |
| A | visible tests, model default thinking | 4 | $0.0370 | $0.0124 | $0.0493 | 95s |
| B | visible tests, model default thinking | 8 | $0.0675 | $0.0698 | $0.1373 | 276s, 324s |
| C | no visible tests, thinking off | 12 | $0.1257 | $0.1211 | $0.2468 | 154s, 395s, 693s |
| D | re-rank of C, 3 evaluations per criterion | 0 | carried | $0.1137 | $0.1137 | 494s |
| E, F | re-rank of C, default settings | 0 | carried | $0.0055, $0.0075 | $0.0130 | 173s, 101s |

Generation cost was stable at $0.0084 to $0.0119 per candidate run, so a 4-candidate pool on
one of these small tasks costs about $0.04 to $0.05 to produce and $0.05 to $0.08 including
verification. Total spend for everything on this page was about $0.56.

Verification was 25 to 51 percent of live-run cost, which is higher than the intuition that
verification is negligible. The reason is visible in the token accounting for the
`retry-transient` pool in run C: 21 verifier calls, 242,606 input tokens of which 97,920 were
cache hits, 153,547 output tokens, and 147,533 of those output tokens were reasoning. The
verifier reads long trajectories, but it also thinks at length, so output tokens dominate its
bill. These fixtures are tiny, so generation is unusually cheap; on real repository tasks the
generation side grows and this ratio should fall.

Latency is the real constraint, not money. Candidates inside a task run concurrently, tasks
run sequentially, and one 4-candidate task took 95s to 693s end to end. Re-ranking a stored
pool cost 101s to 494s depending on evaluation count.

## Selection quality

| Run | Scope | Tasks | Random pass@1 | Verifier-selected | Oracle pass@N |
| --- | --- | --- | --- | --- | --- |
| A, B | all | 3 | 100% | 100% | 100% |
| C | all | 3 | 91.7% | 66.7% | 100% |
| C | discriminating | 1 | 75% | 0% | 100% |
| D | discriminating | 1 | 75% | 0% | 100% |

23 of 24 candidate runs passed the hidden oracle. With visible tests present, all 12 passed,
so those pools were saturated: random selection already reaches the ceiling and no selection
method can show a gain. Removing the visible tests and setting thinking off produced exactly
one discriminating pool, `retry-transient` in run C, where 3 of 4 candidates passed.

On that single pool the verifier ranked the failing candidate first, both at 1 evaluation per
criterion and at 3. One task is not a measurement of accuracy, but it is a real observation
and it is not favorable.

## Score separation and stability

| Pool | Evaluations | Score spread | Pick |
| --- | --- | --- | --- |
| `interval-merge`, run C | 1 | 0.006 | #2, pass |
| `csv-quotes`, run C | 1 | 0.000 | #4, pass |
| `retry-transient`, run C | 1 | 0.061 | #2, fail |
| `retry-transient`, run D | 3 | 0.042 | #2, fail |
| `interval-merge`, runs E and F | 1 | 0.000, 0.002 | #4 then #2, both pass |

Score spread is the gap between the highest and lowest continuous verifier score in a pool.
On saturated pools it collapsed to 0.000 to 0.006, meaning nearly every pairwise comparison
returned a tie and the reported winner was a tie-break rather than a judgment. Re-ranking the
same `interval-merge` pool three times with identical settings and seed produced picks #2,
#4, and #2, which confirms the tournament is not deterministic at this separation level. Only
the discriminating pool produced real separation, 0.061, and it ordered that separation
wrongly.

## What this says about measuring the method

Money is not the obstacle. Task design is. Two properties have to hold at once, and the two
levers available here trade one against the other:

1. The pool must be discriminating, otherwise all three metrics are identical by
   construction.
2. The trajectory must contain validation evidence, because that is what the verifier reads.

Small single-function defects with visible tests give property 2 and lose property 1, since
the model solves them every time. Removing the tests recovers property 1 by destroying
property 2, which is the configuration where selection lost. A useful next fixture set keeps
the visible tests but makes the hidden contract materially harder than they are, so a
capable model still fails some of the time while its trajectory still shows real test output.

For statistical power at the observed per-pool cost, 20 discriminating tasks at 4 candidates
would cost roughly $1.00 to $1.60 and, at the observed sequential latency, take 1 to 4 hours
of wall clock. Task parallelism is the obvious next optimization, since only the candidates
within a task currently run concurrently.
