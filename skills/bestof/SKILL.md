---
name: bestof
description: Use only when the user includes the standalone token `bestof`. Runs several isolated implementers and a separate judge through the `best_of` tool.
---

# BESTOF

Use the model-callable `best_of` tool. Do not reproduce its orchestration with subagents or shell commands.

## Trigger

Activate only for a standalone, case-insensitive `bestof` token. Do not activate for “best of”, rankings, or ordinary prose.

Remove the trigger token, parse controls, and preserve the remaining task verbatim. An empty task shows this grammar and stops:

```text
bestof [N] [implementer MODEL] [reviewer MODEL] [sampled|logprob] [apply] [no-verify] [--] TASK

MODEL = exact role key | exact provider/model[:thinking] | exact quoted catalog name
```

Aliases:

- `implementer`, `model`, `generator` select the candidate model.
- `reviewer`, `judge`, `verifier` select the verifier model.
- `sampled` runs the reviewer as an OMP judge; `logprob` requests constrained score-tag verification.
- A bare integer from 2 through 8 selects the candidate count.
- `apply` requests application of the selected patch. Without it, inspect-only is mandatory.
- `no-verify` disables selection and cannot be combined with `apply`.
- `--` ends controls. Everything after it is task text, including text beginning with `-`.

Without `--`, consume only the recognized controls above. The first unrecognized token and everything after it are the task. Conflicting repeated controls are an error; do not guess.
Natural wording may supply controls when it is exact and unambiguous: for
example, “5 sessions of FAST_ROLE with Exact Reviewer Name as reviewer”
supplies `n=5`, implementer `FAST_ROLE`, and reviewer `Exact Reviewer Name`.
Prefer `--` to separate controls from task prose. Never consume a possible task
phrase as a control when its meaning is ambiguous.

## Model resolution

Resolve each supplied `MODEL` against live OMP configuration in this order:

1. An exact OMP `provider/model` selector, optionally carrying a supported
   thinking suffix.
2. An exact key from the caller's `modelRoles`, matched case-insensitively.
3. An exact model `name` from `omp models --json`, matched case-insensitively.
   Catalog names may contain spaces; consume the longest exact name. The match
   must identify one catalog entry.

Read roles with `omp config get modelRoles --json` and the catalog with
`omp models --json`. Validate selectors and thinking levels against the live
catalog. A catalog-name match resolves to its exact selector and leaves
thinking unset unless the user supplied a thinking level. Do not choose a role
merely because it points at that selector: two roles may intentionally select
different thinking levels.

This is exact matching, not fuzzy matching or a maintained alias list. If
several catalog entries share the exact requested name, ask the user to choose
among those exact selectors. If nothing matches exactly, stop before launch and
report the unresolved value, available role keys, and the accepted selector /
catalog-name forms.

If the implementer is omitted, omit both `model` and `thinking` so candidates
inherit the calling session. If the reviewer is omitted, omit verifier model,
thinking, and backend overrides and use the plugin defaults. A supplied
implementer sets `model` and, when present, `thinking`. A supplied reviewer sets
`verifierModel` and, when present, `verifierThinking`. An explicit reviewer
defaults to `verifierBackend: sampled` so any OMP model can judge; an explicit
`sampled` or `logprob` control overrides that choice.

## Preflight

Before calling `best_of`:

1. Resolve every supplied model as described above.
2. From the checkout containing the requested work, run
   `git rev-parse --show-toplevel` and retain the returned absolute repository
   root. Do not assume the OMP session cwd and task checkout are the same.
3. Run `git status --porcelain=v1 --untracked-files=all` with that exact root as
   the command cwd.
4. State the repository root, resolved candidate count, implementer selector,
   reviewer selector, backend, and whether the run is inspect-only or
   apply-enabled.

Pass the same absolute repository root as the tool's `cwd`. If the tree is
dirty, do not call `best_of`, stash, commit, discard, or clean anything. Report
every status line so the user can identify the blocking paths. This preserves
the trigger for a fresh request after the user resolves the working tree.

Without the explicit `apply` control, announce that the run is inspect-only.
Task prose such as “fix”, “implement”, or “update the PR” never implies apply.

## Tool call

**One-call invariant:** make at most one `best_of` call for each trigger, and
only after preflight passes. Once called, any success, error, or abort ends the
orchestration; never call it again to confirm or retry the result.

Use these fields:

- `cwd`: the absolute repository root verified during preflight
- `task`: preserved task text
- `n`: only when supplied
- resolved implementer fields: only when supplied
- resolved reviewer fields: only when supplied
- `verifierBackend`: the explicit backend, or `sampled` when a reviewer was supplied without one
- `apply: true`: only for explicit `apply`
- `verify: false`: only for explicit `no-verify`

Do not send false defaults for omitted controls. Do not launch asynchronously,
hand-pick a candidate, apply a patch manually, or continue the orchestration
after the tool returns. A tool preflight error is authoritative and forbids a
second `best_of` call. Read-only inspection needed to explain the error remains
allowed; report concrete paths or configuration values when available. Never
mutate the repository as recovery.

Afterward report the selected candidate, whether a patch was applied, and the
artifact directory. On failure, report the exact blocking condition and any
read-only diagnostic evidence. Treat the tool result as authoritative; large
transcripts and patches remain in its artifacts.

## Examples

```text
bestof implementer FAST_ROLE reviewer JUDGE_ROLE -- fix the parser race and add a regression test
bestof 5 implementer FAST_ROLE reviewer "Exact Reviewer Name" -- review the required PR fix
bestof 4 model provider/coder:high judge provider/reviewer:max apply -- implement the requested API
bestof no-verify -- generate alternatives without selecting or applying one
```
