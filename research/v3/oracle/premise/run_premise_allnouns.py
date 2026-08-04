"""Runner for the `subject-nouns-all.v1` prompt set — the list-ALL-things elicitation.

    .venv/bin/python run_premise_allnouns.py --out <results.jsonl> [--limit N] [--dry-run]

Every argument, every hygiene rule and every provenance field is `run_premise.py`'s: this module
does not reimplement the worker, it calls it. What it adds is exactly two things that
`subject-nouns-all.v1` needs and no prompt set before it did.

WHY THIS FILE EXISTS AT ALL, stated plainly. The two additions below are three lines of behaviour
that would sit more naturally inside `common.py`. They are here instead because `common.py` and
`selftest.py` are both carrying STAGED, UNCOMMITTED work from the run that produced
`sam-eval-142-v4-nouns`, and this workstream was instructed not to commit either. Editing a file
whose index copy is someone else's parked work, in order to commit a change that depends on it,
produces a commit that cannot be reproduced from itself. A new module that only ADDS is the honest
shape for that constraint. If and when the parked set lands, folding `_validate_with_free_text_arrays`
into `common.validate_and_canonicalize` is a mechanical move and is the right end state — this
docstring is the record of why it was not done here.

ADDITION 1 — the prompt set is registered at run time, not in `common.PROMPT_SETS`.
Registration is a one-entry dict insert into the very object `common` and `run_premise` both hold
a reference to, so `default_variants()`, the `--prompt-set` choices list and the schema-mixing
guard all see it exactly as if it had been declared in the module.

ADDITION 2 — free-text ARRAY answers validate.
`common.validate_and_canonicalize` knows two answer shapes: a single free-text string, and a
`multi_select_fields` array whose every item is checked against a closed vocabulary. This set is
the third: an array whose items are open vocabulary and must be checked against NOTHING. The patch
derives which canonical fields take that shape FROM THE VARIANT'S OWN json_schema — the field is in
`free_text_fields` and its schema type is `array` — so a prompt document stays the single source of
truth for its own answer shape and this module hardcodes no field name. Any variant that does not
declare such a field is passed straight through to the original function, unaltered.

WHAT IS NOT RELAXED. The patch still requires: the exact key set, every item a string, no empty
list, no empty or whitespace-only entry. `minItems`/`maxItems` are enforced by the grammar during
decode and re-checked here against the schema, so a grammar regression fails the row rather than
passing silently. Distinctness is NOT checked and NOT enforced: `uniqueItems` is not implementable
in llguidance 1.7.6, greedy decoding means a retry reproduces a repeat exactly, and failing the row
would discard seven good nouns to punish one duplicate. Repeats are kept verbatim and collapsed —
countably — at derivation time. That is the treatment ORACLE_QUESTION_SET.md §A.6.6 established for
self-contradiction and `common.py` already applies to multi-selects.

Exit codes are `run_premise.py`'s: 0 done, 1 unexpected, 3 canary mismatch, 4 attempt cap.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common  # noqa: E402
import run_premise  # noqa: E402
from common import PromptVariant, SchemaViolation  # noqa: E402

# [REVIEWED] The set this module runs. The glob is disjoint from `subject-noun.v1`'s
# ("subject-noun.v1.variant-*.json" cannot match "subject-nouns-all.v1.variant-J.json"), so the
# two sets can never be globbed into one process — which is pipeline §11's requirement, not an
# accident of naming.
PROMPT_SET_NAME = "subject-nouns-all.v1"
PROMPT_SET_ENTRY = ("subject-nouns-all.v1", "subject-nouns-all.v1.variant-*.json")

_ORIGINAL_VALIDATE = common.validate_and_canonicalize


def free_text_array_fields(variant: PromptVariant) -> frozenset[str]:
    """Canonical fields this variant answers with a LIST of open-vocabulary strings.

    Read off the variant itself: declared free text AND declared an array in the json_schema.
    A field that is only one of the two is not this shape and is left to the original validator.
    """
    out = set()
    for key, canonical in variant.field_map.items():
        if canonical not in variant.free_text_fields:
            continue
        if canonical in variant.multi_select_fields:
            continue  # closed-vocabulary array; common.py already handles it
        if variant.json_schema["properties"][key].get("type") == "array":
            out.add(canonical)
    return frozenset(out)


def _validate_with_free_text_arrays(payload: Any, variant: PromptVariant) -> dict[str, Any]:
    """common.validate_and_canonicalize, plus the free-text-array shape. Same exception type."""
    array_fields = free_text_array_fields(variant)
    if not array_fields:
        return _ORIGINAL_VALIDATE(payload, variant)

    if not isinstance(payload, dict):
        raise SchemaViolation(f"top level is {type(payload).__name__}, not an object")
    expected = set(variant.field_map)
    if set(payload) != expected:
        raise SchemaViolation(f"keys {sorted(payload)} != required {sorted(expected)}")

    out: dict[str, Any] = {}
    for key, canonical in variant.field_map.items():
        value = payload[key]
        if canonical not in array_fields:
            # Delegate the single-field case by re-entering the original on a one-key document,
            # so the vocabulary and string rules stay defined in exactly one place.
            out.update(_ORIGINAL_VALIDATE(
                {key: value},
                _single_field_view(variant, key)))
            continue
        prop = variant.json_schema["properties"][key]
        if not isinstance(value, list):
            raise SchemaViolation(f"{key} must be a list, got {type(value).__name__}")
        min_items = prop.get("minItems", 1)
        max_items = prop.get("maxItems")
        if len(value) < min_items:
            raise SchemaViolation(f"{key} has {len(value)} items; minItems is {min_items}")
        if max_items is not None and len(value) > max_items:
            raise SchemaViolation(f"{key} has {len(value)} items; maxItems is {max_items}")
        for entry in value:
            if not isinstance(entry, str):
                raise SchemaViolation(
                    f"{key} contains a {type(entry).__name__}, not a string")
            if not entry.strip():
                raise SchemaViolation(f"{key} contains an empty entry")
        # Verbatim. Every normalization — case, articles, plurals, duplicates — belongs to the
        # derivation step, which records each rule it fires. Nothing is cleaned in the run file.
        out[canonical] = list(value)
    return out


def _single_field_view(variant: PromptVariant, key: str) -> PromptVariant:
    """The variant as if it asked only `key`. Used to delegate one field to the original validator
    without duplicating its vocabulary rules here."""
    import dataclasses
    canonical = variant.field_map[key]
    return dataclasses.replace(
        variant,
        field_map={key: canonical},
        json_schema={**variant.json_schema,
                     "properties": {key: variant.json_schema["properties"][key]}},
        canonical_fields=(canonical,),
    )


def install() -> None:
    """Register the prompt set and the third answer shape. Idempotent."""
    existing = common.PROMPT_SETS.get(PROMPT_SET_NAME)
    assert existing in (None, PROMPT_SET_ENTRY), (
        f"{PROMPT_SET_NAME} is already registered as {existing}, not {PROMPT_SET_ENTRY}")
    common.PROMPT_SETS[PROMPT_SET_NAME] = PROMPT_SET_ENTRY
    common.validate_and_canonicalize = _validate_with_free_text_arrays


def main() -> int:
    install()
    argv = sys.argv[1:]
    if not any(a == "--prompt-set" or a.startswith("--prompt-set=") for a in argv):
        argv = argv + ["--prompt-set", PROMPT_SET_NAME]
    sys.argv = [sys.argv[0]] + argv
    return run_premise.main()


if __name__ == "__main__":
    raise SystemExit(main())
