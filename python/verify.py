#!/usr/bin/env python3
"""JSON stdin/stdout adapter for llm-verifier.

The TypeScript extension owns orchestration and credential handoff. This file
only converts its JSON contract into the upstream package's public API, plus one
capability probe described in `probe()`.
"""

from __future__ import annotations

import json
import sys

import llm_verifier
from llm_verifier.fine_grained_reward import (
    GRANULARITY,
    create_openai_client,
    resolve_model,
)


def scale_letters() -> list[str]:
    """Upstream's score-letter alphabet, both spellings it allows."""
    letters = [chr(65 + i) for i in range(GRANULARITY)]
    return letters + [" " + c for c in letters]


def probe_native(payload: dict) -> dict:
    """Prove package import, endpoint authentication, and model routing cheaply."""
    client = create_openai_client()
    model = resolve_model(client, payload["model"])
    client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Reply with one character."}],
        max_tokens=1,
    )
    return {"ok": True}


def probe(payload: dict) -> dict:
    """Sample the prefilled score position, so the caller can judge the endpoint.

    `llm_verifier` reads sampled score tags directly only on a DeepSeek base
    URL. Every other endpoint goes through `_score_tags_by_prefill`, which needs
    vLLM/SGLang `continue_final_message` plus `structured_outputs`. Two ways that
    fails, both silent in upstream:

    * the server rejects the unknown body fields, upstream catches it and returns
      tag-less data, and `extract_score` then returns a hard 0.5 for every pair;
    * the server ignores the fields and generates an unconstrained token, which
      may still be a valid A-T letter and so yields a plausible but meaningless
      score that no output check can distinguish from a real one.

    This reports what came back and leaves the verdict to the caller, which owns
    the policy and can be tested without a server. One token of output, spent
    before any candidate is generated.
    """
    letters = scale_letters()
    client = create_openai_client()
    model = resolve_model(client, payload["model"])
    prompt = "Rate this trajectory.\n<score_A>"
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "<score_A>"},
            ],
            max_tokens=1,
            temperature=1.0,
            logprobs=True,
            top_logprobs=20,
            extra_body={
                "add_generation_prompt": False,
                "continue_final_message": True,
                "structured_outputs": {"choice": letters},
            },
        )
    except Exception as err:  # noqa: BLE001 - any failure means unsupported
        return {"error": f"{type(err).__name__}: {err}"[:400]}
    choice = response.choices[0]
    alternatives: list[str] = []
    if choice.logprobs and choice.logprobs.content:
        alternatives = [
            alt.token for alt in (choice.logprobs.content[0].top_logprobs or [])
        ]
    return {
        "emitted": choice.message.content or "",
        "alternatives": alternatives,
        "letters": letters,
    }


def main() -> None:
    payload = json.load(sys.stdin)
    if "--probe-native" in sys.argv[1:]:
        json.dump(probe_native(payload), sys.stdout)
        sys.stdout.write("\n")
        return
    if "--probe" in sys.argv[1:]:
        json.dump(probe(payload), sys.stdout)
        sys.stdout.write("\n")
        return
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
