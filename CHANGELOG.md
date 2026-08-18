# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-18

Initial release.

### Added

- `/best-of` Oh My Pi command and the standalone `omp-best-of` CLI.
- Best-of-N candidate generation in detached, temporary git worktrees, running concurrently at a single recorded commit.
- Candidate ranking through the upstream `llm-verifier==0.2.0` package, using continuous score-token expectation, repeated evaluation, criteria decomposition, and the probabilistic pivot tournament.
- Default criteria covering task requirements, implementation correctness, and observed validation evidence.
- Winner-only patch application behind `--apply`, gated on an unchanged parent `HEAD` and working tree plus a successful `git apply --check`.
- Durable run artifacts: raw JSON event streams, rendered trajectories, per-candidate patches, stderr, verifier cache, and `result.json`.
- Separate generation and verification accounting, including cache read and write tokens, reasoning tokens, cost, and the verifier's measured cache hit rate.
- Independent `--model` and `--verifier-model` selection, with `--n`, `--evaluations`, `--pivots`, `--max-time`, and `--seed` controls.
- Progress widget in the TUI and a stderr progress line for the standalone CLI.
- Marketplace catalog for `omp plugin marketplace add`.

[0.1.0]: https://github.com/wolfiesch/omp-best-of/releases/tag/v0.1.0
