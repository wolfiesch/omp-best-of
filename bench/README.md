# Selection benchmark

This harness answers one question: on a fixed pool of candidate patches, does verifier
selection beat keeping a random candidate, and how much of the pool's headroom does it
capture?

Three numbers are reported over the same pool, so they are directly comparable:

| Metric | Meaning |
| --- | --- |
| Random pass@1 | Expected result of keeping one candidate at random, that is the fraction of candidates that pass |
| Verifier-selected | Result of keeping the candidate the verifier ranks first |
| Oracle pass@N | Result of keeping the best candidate in the pool, the headroom selection could reach |

Verifier-selected can never beat oracle pass@N. If random pass@1 already equals oracle
pass@N the task is saturated, no selection method can help, and the run says so instead of
implying a win.

## Cost model

Generation dominates, so the harness pays for it once per task and stores the entire pool
under `bench/results/<run-id>/pool/`. `--reuse <run-id>` re-ranks a stored pool with
different verifier settings and pays only for verification, which is what makes sweeps
affordable.

```bash
bun bench/run.ts --n 4 --max-time 4m            # generate pools and rank them
bun bench/run.ts --reuse <run-id> --evaluations 4 # re-rank the same pools, verifier cost only
```

Generation cost comes from the agent runtime's own usage accounting. Verifier cost is
computed from DeepSeek list prices in `VERIFIER_PRICE_PER_MTOK`, so it is an estimate from
published rates rather than an invoice.

## Labels

Candidates only ever see `tasks/<id>/repo`. Labels come from `tasks/<id>/oracle`, which is
copied into a throwaway scoring clone after the candidate has finished, under the visible
name `oracle-check` because Bun's test runner skips dot-directories. Before scoring, the
pristine visible tests are restored, so weakening or deleting a test cannot buy a pass.

Two guards keep a labeling failure from turning into a fake result:

- The harness counts declared test cases and refuses to label a candidate if fewer tests
  ran than the fixture declares. A silently skipped oracle would otherwise mark every
  candidate as passing.
- `test/bench-fixtures.test.ts` proves, offline and in CI, that every fixture's shipped
  defect fails its oracle and that the reference solution in `tasks/<id>/reference` passes
  it. A fixture that is impossible or already correct cannot ship unnoticed.

`tasks/<id>/reference` is never copied into a candidate worktree. It exists so the oracle is
provably satisfiable.

## Difficulty controls

A pool only carries information when candidates disagree. Two flags reduce the candidate's
advantage without touching the labels:

- `--hide-tests` ships the fixture without its visible tests, so a candidate has no local
  signal and must reason about the written contract. The oracle still restores and runs
  those tests during scoring, so labels stay comparable across modes.
- `--thinking <level>` passes a thinking level through to the candidate agent, which is also
  how a caller trades candidate quality for cost in normal use.

## Scorecard fields

Every run writes `scorecard.json` with source hash and dirty flag, `omp` version and binary
hash, Bun version, platform, generator model, thinking level, whether the fixture shipped
visible tests, verifier model, evaluations, pivots, seed, per-candidate time limit, oracle
timeout, iteration count, the price table used, and the raw pool paths. `summary.md` is the
human-readable form of the same run.

## Adding a task

```
tasks/<id>/
  task.md                    prompt the candidate receives
  repo/                       fixture the candidate edits, with a shipped defect
  oracle/oracle.test.js       hidden contract, imports ../<module>.js
  reference/<module>.js       reference solution, harness only
```

Then run `bun test test/bench-fixtures.test.ts`, which enforces the two properties above.
