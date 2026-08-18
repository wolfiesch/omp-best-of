#!/usr/bin/env python3
"""JSON stdin/stdout adapter for llm-verifier.

The TypeScript extension owns orchestration and credential handoff. This file
only converts its JSON contract into the upstream package's public API.
"""

from __future__ import annotations

import json
import sys

import llm_verifier


def main() -> None:
    payload = json.load(sys.stdin)
    llm_verifier.USAGE.reset()
    result = llm_verifier.select(
        problem=payload["problem"],
        candidates=payload["candidates"],
        criteria=payload["criteria"],
        n_evaluations=payload["nEvaluations"],
        pivots=payload["pivots"],
        seed=payload["seed"],
        model=payload["model"],
        cache=payload.get("cachePath"),
        progress=False,
        on_error="raise",
    )
    json.dump(
        {
            "index": result.index,
            "scores": result.scores,
            "ranking": result.ranking,
            "nComparisons": result.n_comparisons,
            "criteria": result.criteria,
            "usage": llm_verifier.token_usage(),
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
