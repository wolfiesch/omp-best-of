# Measured results

Every number here came from `bench/run.ts` on this repository. Nothing is copied from the
upstream paper, and none of this reproduces the upstream Terminal-Bench figures.

## Setup for initial runs A-F

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

Raw run directories stay off-repo. Scorecards, summaries, verifier caches, and candidate pools
remain only on the machine that produced them, under timestamped `bench/results/<run-id>/`
directories that `.gitignore` excludes, because stored transcripts contain absolute local
paths. Machine-readable aggregates from earlier waves were force-added directly under
`bench/results/`; new sanitized, repository-relative aggregates that public documentation may
cite live under `bench/evidence/`.

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
verification. Total spend for the initial A-F runs was about $0.56.

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

## v0.1.1 fixed-pool verifier sweep

This sweep isolates selection cost and behavior from generation. A generation-only run built
24 candidates across six tasks for $0.2066; only `retry-transient` and `semver-satisfies`
were discriminating. Every re-ranking below used those same eight stored trajectories and
oracle labels, so no candidate was generated or labeled again.

| Field | Value |
| --- | --- |
| Pool source | `de714f8`, run `2026-08-18T03-31-45-413Z` |
| Ranking source | `578671e` (`v0.1.1`), clean tree |
| Built/runtime identity | `1bc44850fc7d36c713bd4bf9ba6312b6e96a19e35ee11af957ca720fa10918db`; local interpreted TypeScript; omp/17.3.4; Bun 1.3.14; darwin arm64 |
| Candidate pool | 4 candidates per task, visible tests retained, thinking off, 45s candidate limit |
| Verifier | `deepseek/deepseek-v4-flash`, 2 pivots, seeds 0 through 4 |
| Iterations | One run per seed and setting, no discarded warmups |
| Execution | Five seed runs concurrent; the two tasks inside each run sequential |
| Cache state | Reused trajectories with 97.7% to 99.3% verifier input cache hits; this is not a cold-start comparison |
| Cost basis | Provider list-price calculation from scorecards, not an invoice |

Pool hashes:

- `retry-transient`: `f76989059639739bfab75f8b25811b0f08e2fed3d943bfb1a834781141daf89e`
- `semver-satisfies`: `fa2698546a6019e1f34d8f390343124940d3b9a5f60830b5b01ac42c6256c59e`

### Selection result

| Setting | Attempts | Successful runs | Selection events | Correct selections | Random pass@1 | Oracle pass@4 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 evaluation per criterion | 5 | 5 | 10 | 5 (50%) | 62.5% | 100% |
| 3 evaluations per criterion | 5 | 4 | 8 | 4 (50%) | 62.5% | 100% |

Every successful run selected a passing `semver-satisfies` candidate and a failing
`retry-transient` candidate. Repeated evaluation did not improve selection correctness on
these fixed pools. This is 18 selection events over two reused tasks, not 18 independent
tasks and not a general accuracy estimate.

The `retry-transient` failure was systematic. Its two failing candidates implemented the
backoff exponent one step too high, while the two passing candidates used
`baseDelayMs * 2 ** (attempt - 1)`. All verifier settings still preferred a failing patch.
The visible trajectories did not contain the hidden boundary assertion that exposed the
off-by-one error, so this result is consistent with the verifier rewarding plausible code
and visible validation without recovering an unobserved contract edge case.

### Incremental cost of repeated evaluation

The comparison below uses the same successful seeds, 0, 2, 3, and 4, on both settings.
Values are means per two-task re-ranking run.

| Verifier work | 1 evaluation | 3 evaluations | Ratio |
| --- | --- | --- | --- |
| Calls | 43.5 | 132.8 | 3.05x |
| Input tokens | 536,077 | 1,639,421 | 3.06x |
| Output tokens | 368,238 | 1,070,259 | 2.91x |
| Reasoning tokens | 358,391 | 1,040,152 | 2.90x |
| Verifier cost | $0.1063 | $0.3058 | 2.88x |
| Sum of task wall clocks | 1,142.9s | 1,237.4s | 1.08x |

Three evaluations therefore cost an incremental $0.1995, 1.10 million input tokens, and
0.70 million output tokens per two-task run. Cost and tokens were approximately tripled.
Wall clock rose only 8.3% because verifier calls run concurrently, but each two-task
re-ranking still took about 19 to 21 minutes and these seed runs also shared provider
capacity concurrently.

One of five 3-evaluation attempts failed after DeepSeek reasoning consumed the 32,768-token
budget before answer logprobs were emitted. Its partial verifier spend is unknown and is
excluded from all cost totals. Known spend for the six-task pool bank and successful sweep
runs was $1.9490, plus that failed attempt.

The result does not support raising the default above one evaluation. On these pools,
three evaluations increased cost and token use by roughly 3x, produced no correctness gain,
and added a failure mode.

Machine-readable aggregate: `bench/results/verifier-sweep-v0.1.1.json`. Raw scorecards and
the failed run's partial caches remain under `bench/results/2026-08-18T04-*/`.

## Expanded hidden-contract pools

Ten additional JavaScript contract fixtures cover JSON Pointer lookup, HTTP ranges, token
buckets, asynchronous memoization, event emission, topological sorting, half-open interval
subtraction, content types, query merging, and immutable deep merge. Each shipped defect
passes its visible tests and fails its hidden oracle. The checked-in reference solution for
each fixture passes both.

Two separate four-candidate generation runs used the same clean source and two-minute
candidate limit:

| Generator | Tasks | Candidate runs | Random pass@1 | Oracle pass@4 | Discriminating tasks | Generation cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | 10 | 40 | 67.5% | 80.0% | 2 | $0.3906 |
| Gemini 2.5 Flash Lite | 10 | 40 | 37.5% | 70.0% | 5 | $1.0640 |

Costs are runtime accounting estimates, not invoices. Both runs used source `787a538`,
built/runtime identity
`1bc44850fc7d36c713bd4bf9ba6312b6e96a19e35ee11af957ca720fa10918db`,
omp/17.3.4, Bun 1.3.14, and darwin arm64. Candidate runs were concurrent within each task;
tasks ran sequentially. The DeepSeek pool completed in 12 minutes 41 seconds and the Gemini
pool in 10 minutes 33 seconds.

The two pools contain six unique discriminating tasks after taking both DeepSeek tasks and
the four non-overlapping Gemini tasks. That fixed selection bank has 24 candidates, nine
passing candidates, random pass@1 of 37.5%, and oracle pass@4 of 100%. It is a selection
benchmark with real headroom, but it is not a random sample of end-to-end tasks: the bank
deliberately retains only pools that can distinguish selection methods.

The planned three-seed verifier sweep did not complete. Supervisor output reported that a
live DeepSeek scoring preflight passed immediately before the sweep, two runs later received
HTTP 402 `Insufficient Balance`, and the third was stopped after that billing failure. The
run directories do not preserve commands, seed metadata, or terminal errors, so they cannot
independently establish that sequence or map directories to seeds. No selection scorecard
was produced, partial verifier spend is unknown, and this section therefore makes no
verifier-accuracy claim. Partial caches are preserved for resumption rather than counted as
failed selections.

Machine-readable aggregate: `bench/results/expanded-pools-v0.1.1.json`. Local raw generation
artifacts remain under `bench/results/2026-08-18T06-24-28-540Z/` and
`bench/results/2026-08-18T06-38-18-609Z/`. The three local incomplete verifier attempts
remain under `bench/results/2026-08-18T06-38-26-{976,980,993}Z/`.

## Luna sampled verifier on the VPS

The subscription-backed sampled verifier was measured on the fixed six-task selection bank
above. Every task has four stored candidates, at least one passing and one failing candidate,
random pass@1 of 37.5%, and oracle pass@4 of 100%. Candidate generation was not rerun.

The 83.3% and 72.2% selection accuracies below are invalidated and retained only as a cost and
latency record. Two of the six pools, `content-type` and `http-range`, had defective oracles,
and the corrected oracles leave no passing candidate in either pool, so the 18-selection
denominator cannot support a selection-accuracy claim. Public documentation must not quote
these two percentages as measured selection quality.

Three seeds compared one complete pairwise round with three complete rounds. Each four-way
round contains six live pairwise judgments:

| Pairwise rounds | Selections | Verifier-selected | Comparisons | Input tokens | Reported verifier cost | Mean task wall clock |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 18 | 83.3% | 108 | 5.98M | $0.9846 | 32.6s |
| 3 | 18 | 72.2% | 324 | 18.04M | $2.8338 | 75.3s |

The one-round selector produced 15 correct selections out of 18, compared with the fixed
bank's 37.5% random baseline. Results varied by seed: 66.7%, 100%, and 83.3%. Per-task
selection counts show where the remaining uncertainty sits:

| Task | One round | Three rounds |
| --- | ---: | ---: |
| async-memoize | 3/3 | 3/3 |
| content-type | 2/3 | 0/3 |
| event-emitter | 3/3 | 3/3 |
| http-range | 3/3 | 1/3 |
| interval-subtract | 2/3 | 3/3 |
| query-merge | 2/3 | 3/3 |

Three rounds cost 2.88 times as much, used 3.02 times as many input tokens, and took 2.31
times as much wall-clock time. They changed six winners: two changes recovered passing
candidates and four replaced passing candidates with failures. On this pool, repeated
sampling did not improve selection and reduced aggregate accuracy by 11.1 percentage points.
The default should remain one round for this harness. These results do not support paying for
three rounds on this bank. Eighteen paired selections on a deliberately discriminating bank
do not estimate general coding-agent accuracy.

All comparison runs used clean source
`23d783edb609a0ab6e09c1c93da06e8a83a3029a`, OMP binary hash
`a547f8fa4457e1f96886a7ece04a27dc110f80c29b395daeb223f4a98e802a24`,
omp/17.3.4, Bun 1.3.14, and Linux x64 on the remote benchmark host. The verifier was
`openai-codex/gpt-5.6-luna` at low thinking with four concurrent workers and a two-minute
per-call timeout. The batch ran sequentially without an overall timeout; cold and warm paths
were not separated, so latency numbers describe only this live reranking scenario. Candidate
pools were reused; verifier comparisons were live. Reported cost is OMP runtime accounting
for subscription-routed usage, not a per-token invoice. Successful
comparison runs accounted for $3.8185. Partial usage from interrupted exploratory attempts is
unknown and excluded.

Machine-readable aggregate: `bench/results/luna-sampled-v0.1.1.json`. Raw scorecards are
under the twelve run directories named in that aggregate. An initial concurrent local launch
was excluded after OMP startup contention caused timeouts. An initial VPS launch was also
excluded because its scorecards captured the PATH OMP binary rather than the overridden
binary actually used for judgments; commit `23d783e` corrected that metadata before this
sweep.

## Superseded sampled-verifier diagnostic

An initial repair changed sampled judgments to use patch and process evidence instead of
candidate-authored validation narration. It also changed aggregation to pairwise-majority wins,
with weakest head-to-head probability and then expected probability as tie-breakers.

The first six-task sweep reported 18/18 oracle-labeled selections, but it is excluded from claims:
benchmark identity was captured after execution. A repeat after fixing identity capture selected
16/18 oracle-labeled winners and exposed fixture defects. The `content-type` oracle omitted
its explicit control-character requirement, and the `http-range` oracle did not reject unsafe
end and suffix decimals or non-horizontal whitespace. Rescoring each saved pool against the
corrected oracle produced no passing candidate in either pool; neither can measure selection
accuracy.

The superseded aggregate remains at `bench/results/luna-sampled-verifier-fix.json` for diagnosis.
It does not support a verifier-accuracy or latency claim.

## Repaired sampled verifier on corrected pools

The final validation uses the four remaining discriminating pools after excluding
`content-type` and `http-range`. Each task has four candidates, at least one corrected-oracle
pass and one failure, random pass@1 of 31.25%, and oracle pass@4 of 100%. The verifier receives
only patch and process evidence, requires code-path support for claimed defects, and ranks by
pairwise-majority wins with weakest-head-to-head and expected-probability tie-breakers.

| Pairwise rounds | Selections | Oracle-labeled selections | Comparisons | Provider requests | Input tokens | Reported verifier cost | Mean task wall clock |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12 | **12/12 (100.0%)** | 72 | 84 | 3.57M | $0.5231 | 40.3s |

Every task selected an oracle-passing candidate in all three seeds. On the same four tasks,
the pre-repair one-round selector produced 10/12 (83.3%). The observed repaired sweep used
11.5% fewer input tokens and 17.4% less reported cost. Mixed-path mean wall clock was 28.3%
higher; cold and warm paths were not separated. This is a same-bank before/after observation,
not a single-factor ablation or a general coding-agent accuracy estimate.

All nine runs captured identity before the first verifier call and recorded clean source
`35f8df6495cba10c9c0c7173da83e9f0304e17c0`, OMP binary hash
`a547f8fa4457e1f96886a7ece04a27dc110f80c29b395daeb223f4a98e802a24`,
omp/17.3.4, Bun 1.3.14, and Linux x64 on the remote benchmark host. Candidate pools were reused;
all pairwise judgments were live and application-level verifier caches were empty. Reported
cost is OMP runtime accounting for subscription-routed usage, not a per-token invoice. The
current oracles rescored every candidate in all six source pools at clean source `35f8df6`;
that SHA-pinned evidence is `bench/results/verifier-repair-rescore.json`.

Machine-readable aggregate: `bench/results/luna-sampled-verifier-repair.json`. Raw scorecards
are under the nine run directories named in that aggregate.

## Expanded hidden-contract verifier benchmark

Eight additional fixtures broadened the contract surface to bounded concurrency, circuit
breaking, deterministic serialization, JSON Patch, singleflight identity, byte-stream
chunking, stable priority queues, and ring buffers. The final fixed-pool sweep ranked five
candidates per task for three seeds with one complete sampled pairwise round per seed.

| Scope | Selections | Random pass@1 | Verifier-selected | Oracle pass@5 |
| --- | ---: | ---: | ---: | ---: |
| All eight tasks | 24 | 50.0% | **21/24 (87.5%)** | 100.0% |
| Five harder pools | 15 | 32.0% | **12/15 (80.0%)** | 100.0% |

The five-pool subset excludes `circuit-breaker`, `promise-pool`, and `priority-queue`, whose
generated pools each contained four passing candidates. Two of those pools had a no-op
candidate, making selection materially easier. The full eight-task number is therefore useful
as a system check, not a difficulty-normalized accuracy estimate.

On the same four fixed pools and seeds, baseline source `8227610` selected 9/12
oracle-passing candidates. Source `761cad5`, which adds recorded tool calls/results while
excluding assistant reasoning and final claims, selected 12/12. Candidate-pool files were
byte-identical across the two sweeps. Reported verifier cost rose 15.8% and input tokens rose
5.5%. This is a source-version association on one fixed bank, not a causal ablation or general
performance claim. The aggregate records the complete five-file source diff and blob hashes.

`json-patch` remained a systematic failure at 0/3. The only oracle-passing candidate was never
selected. Pairwise judgments repeatedly missed a primitive structural-equality defect in one
competitor and over-weighted an explicit malformed-operation guard in another. This is the
clearest remaining verifier weakness: long, dense semantic implementations still exceed the
reliability of one low-thinking static pairwise round.

Across all 24 selections, verification made 240 pairwise comparisons and 258 provider requests,
processed 12.65M input tokens (8.90M uncached and 3.75M cached), emitted 123.6K output tokens,
and recorded 83.7K reasoning tokens. OMP runtime accounting was $2.0030, or $0.0835 per task
selection. This is subscription-routed runtime accounting, not a per-token invoice. Candidate
generation was reused and not spent during these rank runs.

All final runs used clean source `761cad5`, OMP binary hash
`a547f8fa4457e1f96886a7ece04a27dc110f80c29b395daeb223f4a98e802a24`,
omp/17.3.4, Bun 1.3.14, and Linux x64 on the remote benchmark checkout. Runs were sequential;
each task used four verifier workers and a two-minute per-call timeout. Candidate pools came from
`2026-08-18T11-55-32-529Z`, `2026-08-18T12-03-43-176Z`, and
`2026-08-18T12-49-05-204Z`.

Machine-readable aggregate: `bench/results/expanded-recorded-evidence.json`. Raw scorecards are
under the nine final run directories and six same-pool comparison directories named there.

## Executable candidate falsification

The sampled verifier now materializes every final candidate repository and runs two independent
falsification passes through an OS-sandboxed probe tool. Candidate workspaces are read-only,
credentials and user-home data are unavailable, network access is disabled, and only private
scratch storage is writable. The first pass must retain one completed probe result and the
second must retain three while challenging the first pass's conclusions. A noncompliant audit
is retried twice before the run fails. Pairwise ranking receives the combined audits and probe
results as untrusted evidence.

On the same fixed `json-patch` pool that previously failed systematically, the final source
selected the only oracle-passing candidate in two of three seeds:

| Source | Selections | Oracle-labeled selections | Reported verifier cost | Mean task wall clock |
| --- | ---: | ---: | ---: | ---: |
| `f9f639a` executable audits without enforced probes | 3 | 2/3 (66.7%) | $0.6362 | 143.1s |
| `06eefab` sandboxed, enforced executable probes | 3 | **2/3 (66.7%)** | $0.6633 | 175.4s |

The final implementation did not improve selection on this three-selection JSON Patch bank.
It used 4.3% higher runtime accounting and 22.6% higher mean wall-clock time than the earlier
source. This comparison includes sandboxing, probe enforcement, audit retries, prompt changes,
and ranking changes; it is not a single-factor causal ablation.

Across `ring-buffer`, `singleflight`, `stable-stringify`, and `stream-chunker`, the final source
selected an oracle-passing candidate in 11/12 seed/task selections. Across all five fixed pools
and three seeds:

| Selections | Random pass@1 | Verifier-selected | Oracle pass@5 | Provider requests | Input tokens | Reported verifier cost | Mean task wall clock |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 | 32.0% | **13/15 (86.7%)** | 100.0% | 879 | 41.90M | $3.2620 | 167.4s |

These runs retained 150 pairwise comparisons, 150 candidate audits, and 504 sandboxed probe
results. Every one of the 75 first-pass audits retained at least one probe result; every one of
the 75 second-pass audits retained at least three. The 300 retained audit/comparison records
consumed 879 provider requests. The retained records do not attribute requests between tool
loops and discarded audit attempts. Input comprised 29.88M cached and 12.02M uncached tokens;
output was 216.2K tokens and reasoning was 98.1K tokens.
Runtime accounting averaged $0.2175 per task selection. Subscription-routed accounting is not
a per-token invoice.

All six scorecards record clean source `06eefab3726ef82d1100bec92a82a172aeddffc8`,
OMP binary hash `a547f8fa4457e1f96886a7ece04a27dc110f80c29b395daeb223f4a98e802a24`,
omp/17.3.4, Bun 1.3.14, and Linux x64. Runs were sequential within each sweep; the JSON Patch
and four-task sweeps overlapped. Each task records four verifier workers and a two-minute
per-call timeout. Declared external overall timeouts were 12 minutes for each JSON Patch run
and 35 minutes for each four-task run. Generation was reused and not spent during ranking.
Cold and warm paths were not separated.
`06eefab` is an ancestor of the current head, so this sweep is historical evidence for that
exact source rather than a measurement of the present working source. The five pools are a
fixed, deliberately retained bank; `content-type` and `http-range` are excluded from every
selection-accuracy claim in this document because their oracles were defective and the
corrected oracles leave no passing candidate in either pool.

Machine-readable aggregate, tracked in this repository and free of local paths:
[`bench/evidence/candidate-falsification-evidence.json`](evidence/candidate-falsification-evidence.json).
Raw scorecards, candidate pools, and verifier caches remain off-repo under the six ignored
`bench/results/<run-id>/` directories named in that aggregate, because stored transcripts
contain absolute local paths.
