## What changed

<!-- The user visible effect first, then the mechanics. -->

## Why

<!-- The problem this solves. Link the issue if one exists. -->

## Verification

<!-- Exact commands and their result. Replace the checkboxes you did not run. -->

- [ ] `bun run check`
- [ ] `bun run smoke:verifier` (live verifier path)
- [ ] Exercised `/best-of` or `omp-best-of` against a real repository

```text
paste the relevant command output here
```

## Safety review

Complete this section when the change touches worktree creation, patch capture, patch application, or credential handling.

- [ ] Candidates still cannot reach the parent checkout
- [ ] The dirty-tree refusal still holds
- [ ] Applying still requires `--apply`, an unchanged parent `HEAD` and status, and a successful `git apply --check`
- [ ] No credential reaches artifacts, logs, or stdout

## Notes

<!-- Known limitations, follow-up work, or decisions a reviewer should weigh. -->
