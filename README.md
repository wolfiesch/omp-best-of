# OMP Best Of

Run multiple Oh My Pi coding agents in isolated git worktrees, rank their complete trajectories with [LLM-as-a-Verifier](https://github.com/llm-as-a-verifier/llm-as-a-verifier), and optionally apply only the selected patch.

## Requirements

- Oh My Pi 17 or newer
- Bun 1.3 or newer
- Git
- `uv`
- DeepSeek authentication configured in OMP or `DEEPSEEK_API_KEY`
- A clean git working tree

The default candidate model is OMP's `nous/deepseek/deepseek-v4-flash-0731` entry. The verifier uses the upstream package's `deepseek-v4-flash` model name against DeepSeek's hosted API.

## Install locally

```bash
omp plugin link ./omp-best-of
```

Restart OMP after linking the plugin.

## Use

```text
/best-of --n 3 --apply Fix the failing authentication test
```

Select without changing the parent checkout:

```text
/best-of --n 5 Refactor the parser and preserve its public API
```

Standalone CLI:

```bash
omp-best-of --n 3 --apply -- "Fix the failing authentication test"
```

Important options:

- `--n <2-8>` controls candidate count. Default: 3.
- `--evaluations <n>` controls repeated verifier evaluations per criterion. Default: 1.
- `--pivots <n>` controls Probabilistic Pivot Tournament cost and accuracy. Default: 2.
- `--apply` applies the winner. Selection-only is the default.
- `--model` and `--verifier-model` select generation and verification models independently.

## Safety model

- Every candidate runs in a detached temporary git worktree.
- Candidate agents cannot edit the parent checkout.
- The command refuses to start from a dirty parent checkout.
- Before applying a winner, it confirms the parent HEAD and status are unchanged.
- `--apply` is explicit. Without it, all patches remain artifacts only.
- Candidate sessions run with OMP's `yolo` approval mode inside their disposable worktrees.

Artifacts are stored under `~/.omp/agent/best-of/runs/<run-id>/` and include raw OMP JSON events, rendered trajectories, patches, verifier cache, token accounting, and the final result.

## Verification mechanics

The plugin delegates scoring to `llm-verifier==0.2.0`. It uses the upstream continuous score-token expectation and Probabilistic Pivot Tournament rather than implementing a separate judge. Default criteria cover task requirements, implementation correctness, and observed validation evidence.

Candidate and verifier calls run concurrently where their dependencies allow. The final report keeps generation cost separate from verifier token usage and reports the verifier's measured prefix-cache hit rate.

## Attribution

The verification algorithm and Python package are from Kwok et al., [LLM-as-a-Verifier: A General-Purpose Verification Framework](https://arxiv.org/abs/2607.05391), released under the MIT License.
