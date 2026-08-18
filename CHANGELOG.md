# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--verifier-backend sampled` ranks candidates through seeded, cached, all-pairs judgments from an OMP model route, including subscription-authenticated models that do not expose token logprobs.
- Benchmark scorecards distinguish sampled runtime accounting from per-token API billing and record the sampled judge's thinking level, timeout, concurrency, and schedule.

### Changed

- Verifier results now identify their `logprob` or `sampled` backend. `--evaluations` means repeated upstream evaluations in logprob mode and complete pairwise rounds in sampled mode.
- Sampled judgments now prioritize semantic contract correctness over candidate-authored validation, and rankings use pairwise-majority wins with expected probability only as a tie-breaker. This prevents large confidence margins against weak candidates from overruling a direct head-to-head loss.

## [0.1.1] - 2026-08-18

### Changed

- Verifier credentials now resolve through omp's model registry instead of a plugin-local `DEEPSEEK_API_KEY`, so any compatible provider omp can authenticate works with no extra setup.
- Candidates inherit the calling session's model and thinking level; `--model` and `--thinking` override them.
- DeepSeek V4 Flash remains the default verifier because its native score-tag path is known-good and inexpensive, while other chat-completions endpoints are admitted when they prove the required scoring capability.
- Public documentation now describes the headless OMP subprocess architecture and repository-level worktree isolation without implying native Agent Hub integration, host sandboxing, or established selector reliability.

### Added

- A one-token scoring-capability probe runs before candidate generation for non-native verifier endpoints. It rejects endpoints that cannot provide the constrained score-token distribution required by `llm-verifier`.
- `--no-verify` and the benchmark's `--generate-only` mode retain candidate pools without paying for a tournament, so stored pools can be ranked later.

### Fixed

- Generate-only benchmark runs no longer report the first candidate as a verifier selection when no tournament ran.

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

[0.1.1]: https://github.com/wolfiesch/omp-best-of/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/wolfiesch/omp-best-of/releases/tag/v0.1.0
