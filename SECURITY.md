# Security Policy

## Supported versions

This project is pre-1.0. Only the latest published version receives fixes.

## Reporting a vulnerability

Report privately through GitHub Security Advisories on this repository, under Security, then Report a vulnerability. Please do not open a public issue for an exploitable defect.

Include the affected version, the exact reproduction steps, and the observed impact. A first response should be expected within seven days.

## Threat model

This plugin runs coding agents with elevated autonomy, so the boundaries below are the load-bearing ones. Reports that break any of them are in scope.

- **Worktree isolation.** Candidate agents run in Oh My Pi's `yolo` approval mode inside detached, temporary git worktrees. Anything that lets a candidate reach the parent checkout, another candidate's worktree, or the artifact directory of another run is a vulnerability.
- **Patch application.** The winning patch is applied only with `--apply`, only after the parent `HEAD` and working tree status are confirmed unchanged, and only after `git apply --check` succeeds. Bypassing any of those gates is a vulnerability.
- **Credential handling.** The DeepSeek credential is resolved once and passed to the Python bridge through its environment. It is never written to artifacts, logs, or stdout. Any path that persists or prints a credential is a vulnerability.
- **Artifacts.** Run artifacts contain full agent transcripts and patches, so they may include repository content. They are written under the Oh My Pi agent directory with default permissions and are not encrypted. Treat them as sensitive.

Out of scope: prompt injection that changes what a candidate agent writes inside its own disposable worktree. That is contained by design, which is why selection, not application, is the default.
