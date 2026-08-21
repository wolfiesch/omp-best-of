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

## Model resolution

Each `MODEL` is either:

1. An exact OMP `provider/model` selector, optionally carrying its configured thinking suffix.
2. An exact key from the caller's `modelRoles` configuration, matched case-insensitively.

For a role name, read the live configuration with `omp config get modelRoles --json`. Resolve its value to an exact selector and optional thinking level. Validate requested selectors and thinking levels against `omp models --json`. Never maintain a model list, vendor aliases, fallback route, or fuzzy match in this skill. Missing, ambiguous, or unsupported values stop before launch and report the unresolved value plus the available role keys.

If the implementer is omitted, omit both `model` and `thinking` so candidates inherit the calling session. If the reviewer is omitted, omit verifier model, thinking, and backend overrides and use the plugin defaults. A supplied implementer sets `model` and, when present, `thinking`. A supplied reviewer sets `verifierModel` and, when present, `verifierThinking`. An explicit reviewer defaults to `verifierBackend: sampled` so any OMP model can judge; an explicit `sampled` or `logprob` control overrides that choice.

## Tool call

**One-call invariant:** make exactly one `best_of` call for each trigger. Any success, error, or abort ends the workflow; never call again to confirm the result.

Use these fields:

- `task`: preserved task text
- `n`: only when supplied
- resolved implementer fields: only when supplied
- resolved reviewer fields: only when supplied
- `verifierBackend`: the explicit backend, or `sampled` when a reviewer was supplied without one
- `apply: true`: only for explicit `apply`
- `verify: false`: only for explicit `no-verify`

Do not send false defaults for omitted controls. Do not launch asynchronously, hand-pick a candidate, apply a patch manually, or continue after the tool returns. A preflight error is authoritative: report it and stop without retrying or asking to retry.

Afterward report the selected candidate, whether a patch was applied, and the artifact directory. Treat the tool result as authoritative; large transcripts and patches remain in its artifacts.

## Examples

```text
bestof implementer FAST_ROLE reviewer JUDGE_ROLE -- fix the parser race and add a regression test
bestof 4 model provider/coder:high judge provider/reviewer:max apply -- implement the requested API
bestof no-verify -- generate alternatives without selecting or applying one
```
