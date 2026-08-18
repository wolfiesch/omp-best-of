# Contributing

Thanks for considering a contribution. This project is small and intends to stay small, so scope discipline matters more than volume.

## Scope

In scope:

- Orchestration, isolation, and patch safety around candidate agents
- Artifact, accounting, and reporting quality
- Correctness and clarity of the Oh My Pi command surface

Out of scope:

- Reimplementing the verification algorithm in TypeScript. Scoring stays in the upstream `llm-verifier` package so results track the published method and receive upstream fixes.
- Provider routing abstractions. The candidate and verifier models are already independent flags.

If a change belongs upstream in [llm-as-a-verifier](https://github.com/llm-as-a-verifier/llm-as-a-verifier) or in [Oh My Pi](https://github.com/can1357/oh-my-pi), please send it there instead. That keeps this plugin thin.

## Setup

```bash
bun install
bun run check
```

`bun run check` runs Biome, the type checker, catalog validation, and the test suite. It
needs no network access or credentials after dependencies are installed. Before publishing
package changes, also run:

```bash
bun run smoke:package
```

The live verifier path needs credentials, `uv`, and network access:

```bash
bun run smoke:verifier
```

## Expectations for a pull request

1. `bun run check` passes.
2. Behavior changes come with a test that fails without the change, or with the exact command output that demonstrates the new behavior.
3. Anything touching candidate isolation, patch capture, or patch application states how the parent checkout stays protected.
4. Performance or cost claims include the command, the scenario, and the raw numbers the run reported. Do not publish estimated or extrapolated figures.
5. Keep the diff focused. Unrelated formatting or renaming makes review harder.

## Commit and pull request style

- Conventional commit subjects, imperative mood, lowercase after the type, for example `fix: preserve candidate patches when capture fails`.
- One logical change per commit where practical.
- Explain the user visible effect in the pull request body, not just the mechanics.

## Reporting problems

Open an issue with the exact command, the redacted output, and the run identifier if a run produced artifacts. Please remove absolute home paths, credentials, and private repository content before pasting anything.
