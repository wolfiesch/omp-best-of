# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Sampled runs fail fast on an unusable audit sandbox. The local audit-sandbox preflight runs after the repository check and before the paid verifier capability probe, so a host that cannot execute the sandboxed probe starts no candidate subprocess and makes no model or provider call.
- Sampled judgments now reuse a persistent, resumable cache keyed by exact inputs under `best-of/cache/sampled/` in the Oh My Pi agent directory instead of a per-run file. The cache directory uses mode `0700` and cache files use `0600`, reuse is local to the invoking user rather than provider-global, a change to the repository `HEAD`, task, criteria, candidate evidence, model, thinking level, evaluation count, seed, prompt and settings identity, or audit tool availability resolves a different entry, and no absolute cache path is recorded in public result metadata.
- Retry attribution for candidate audits. Every audit attempt is recorded before the next attempt starts with its candidate, round, ordinal, status of accepted, insufficient probes, or error, required and observed probe counts, usage, and a bounded sanitized error message, and the result reports total, accepted, discarded, and error attempts, provider requests, and per-candidate and per-round attempt counts. Audit attempts stay distinct from the underlying provider requests, and discarded under-probed attempts and errors are counted separately from accepted ones. Selection and ranking are unchanged.

### Fixed

- Sampled verifier JSON parsing now uses only assistant text parts while retaining thinking and tool parts in transcript evidence, so reasoning containing braces cannot corrupt an otherwise valid judgment.

### Changed

- The sampled cache schema is now version 3 so it can carry per-attempt audit records. A cache file written by an older schema is rejected cleanly and recomputed rather than misread.
- Corrected the measured-results claims in `README.md`. The withdrawn six-pool sampled headlines of 83.3% and 72.2% are removed because the `content-type` and `http-range` oracles were defective and their corrected oracles leave no passing candidate. The public table now reports the logprob one-evaluation result of 5/10 with a 62.5% random baseline and the sampled one-round result of 13/15 with a 32.0% random baseline over five reused discriminating pools, labeled as historical evidence for ancestor source `06eefab` rather than for the current head.
- Added the tracked, secret-free benchmark aggregate `bench/evidence/candidate-falsification-evidence.json`. `bench/RESULTS.md` now cites that repository-relative path and states that raw run directories remain off-repo under the ignored `bench/results/` root.

## [0.2.0] - 2026-08-18

### Added

- `--verifier-backend sampled` ranks candidates through seeded, cached, all-pairs judgments from an OMP model route, including subscription-authenticated models that do not expose token logprobs.
- Benchmark scorecards distinguish sampled runtime accounting from per-token API billing and record the sampled judge's thinking level, timeout, concurrency, and schedule.
- `--verifier-thinking` independently controls sampled-judge reasoning without changing candidate generation; cache identity and scorecard metadata include the selected level.
- Eight hidden-contract fixtures expand coverage across bounded concurrency, circuit breaking, deterministic serialization, JSON Patch, singleflight deduplication, byte-stream chunking, stable priority queues, and ring buffers.
- Biome formatting and lint checks, a Bun 1.3.0 and 1.3.14 CI matrix, pinned GitHub Actions, Bun Dependabot updates, and an installed-tarball CLI smoke test.
- Integration coverage for failed-candidate exclusion, empty selected patches, binary patches, parent mutation, private artifact permissions, process-group termination, and cleanup after exceptions.

### Changed

- Verifier results now identify their `logprob` or `sampled` backend. `--evaluations` means repeated upstream evaluations in logprob mode and complete pairwise rounds in sampled mode.
- Sampled verification materializes each final candidate repository and runs two independent falsification passes through an OS-sandboxed probe tool. Candidate workspaces are read-only, credentials and user-home data are unavailable, network access is disabled, and only private scratch storage is writable. The verifier rejects audits unless the first pass records one completed probe and the second records three, retrying a noncompliant audit twice before failing. It then gives the retained probe evidence and combined audits to the pairwise judge as untrusted leads. Judgments prioritize semantic contract correctness over candidate-authored validation and omit assistant reasoning and final claims. Rankings use pairwise-majority wins, weakest-head-to-head strength, then expected probability.
- Reuse-rank runs rescore every stored patch against the current hidden oracle before selection, preventing stale generation-time labels after an oracle correction.
- Candidate generation now uses OMP's native copy-on-write isolation lifecycle and baseline-aware patch capture, with OMP's Git worktree fallback retained for hosts without a native backend.
- Result semantics now separate `selection` from `application`. Winner indexes are zero based, no-verification runs report no selection, and `application.applied` records an actual repository change.
- `result.json` is now a versioned compact manifest with relative artifact paths. Run directories use mode `0700` and artifact files use `0600`.
- Candidate and verifier subprocesses accept cancellation, terminate their POSIX process groups with `SIGTERM` and `SIGKILL` escalation, and settle before workspace cleanup.
- Verifier responses are validated for bounded indexes, finite scores, complete rankings, comparison counts, criteria, and usage before selection.

### Fixed

- CLI options reject missing or flag-shaped values, unsafe integers, and invalid durations before candidate or verifier work starts.
- `--help` after the `--` delimiter remains task text instead of triggering command help.
- Parent checkout mutation during generation stops selection even when patch application was not requested.
- Empty selected patches no longer report a successful application.

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

[0.2.0]: https://github.com/wolfiesch/omp-best-of/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/wolfiesch/omp-best-of/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/wolfiesch/omp-best-of/releases/tag/v0.1.0
