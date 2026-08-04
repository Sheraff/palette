"""Selftest for the `subject-nouns-all.v1` prompt set and its runner. No model, no GPU.

    .venv/bin/python selftest_allnouns.py

WHY THIS IS A SEPARATE FILE, AND THE ONE-LINE FIX IT STANDS IN FOR. `selftest.py` ends with an
inventory guard — "prompts/ holds no file this selftest does not know about" — whose known-new set
is a hardcoded literal. That guard is CORRECT and it is currently FAILING on
`subject-nouns-all.v1.variant-J.json`, exactly as designed: a new prompt file is additive or it is a
regression, and the guard makes the author say which. The fix is one line, adding this filename to
the set at `selftest.py:534-536`.

**That line was not written, because `selftest.py` was carrying another agent's staged,
uncommitted work when this round ran and this workstream was instructed not to commit it.** Editing
its working copy would mean either committing someone else's parked changes under this round's
message, or leaving an edit that exists in no commit. Neither is acceptable, so the failure is left
standing and declared here and in `RESIDUAL_V5_NOTES.md` §12.10 rather than hidden. **Whoever lands
the parked set should add the filename and delete this paragraph.**

What this file covers in the meantime is everything about the new set that `selftest.py` would have
covered anyway, plus the one thing it could not: the third answer shape.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common  # noqa: E402
import run_premise_allnouns as allnouns  # noqa: E402

FAILURES: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'ok  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)


def main() -> int:
    allnouns.install()

    # ---- the prompt set loads, and loads as exactly one variant ----
    variants = common.default_variants(allnouns.PROMPT_SET_NAME)
    check("prompt set resolves to exactly one variant", len(variants) == 1,
          ", ".join(v.id for v in variants))
    v = variants[0]
    check("schema version is subject-nouns-all.v1", v.schema_version == "subject-nouns-all.v1")
    check("variant letter is J, not H (reserved) and not I (ambiguous)", v.variant == "J")
    check("decode budget is declared per-variant", v.max_tokens == 128, str(v.max_tokens))

    # ---- the envelope is an array of OPEN vocabulary, which is the whole point ----
    prop = v.json_schema["properties"]["all_things"]
    check("answer is an array", prop.get("type") == "array")
    check("items are unconstrained strings", prop["items"] == {"type": "string"},
          json.dumps(prop["items"]))
    check("minItems 1 — the empty list is not an answer", prop.get("minItems") == 1)
    check("maxItems 8 — the cap is in the grammar", prop.get("maxItems") == 8)
    check("no uniqueItems (llguidance 1.7.6 does not implement it)", "uniqueItems" not in prop)
    check("no closed vocabulary anywhere", v.vocabularies == {}, str(v.vocabularies))
    check("field is declared free text", v.free_text_fields == ("subject_nouns_all",))
    check("field is NOT declared multi-select (that means closed-vocabulary array)",
          v.multi_select_fields == ())

    # ---- the runner recognises the third answer shape, from the variant alone ----
    check("free_text_array_fields derives the field from the schema",
          allnouns.free_text_array_fields(v) == frozenset({"subject_nouns_all"}))

    def validate(payload):
        return allnouns._validate_with_free_text_arrays(payload, v)

    ok_doc = {"all_things": ["woman", "cello", "candle"]}
    check("a well-formed list validates and is canonicalized",
          validate(ok_doc) == {"subject_nouns_all": ["woman", "cello", "candle"]})
    check("the escape validates as an ordinary one-element list",
          validate({"all_things": ["none"]}) == {"subject_nouns_all": ["none"]})
    check("answers are stored VERBATIM — no cleanup in the run file",
          validate({"all_things": ["  A Woman  ", "CELLOS"]})
          == {"subject_nouns_all": ["  A Woman  ", "CELLOS"]})

    for label, bad in (
        ("a bare string is not a list", {"all_things": "woman"}),
        ("an empty list violates minItems", {"all_things": []}),
        ("nine entries violate maxItems", {"all_things": [f"x{i}" for i in range(9)]}),
        ("a non-string entry is rejected", {"all_things": ["woman", 3]}),
        ("an empty entry is rejected", {"all_things": ["woman", "   "]}),
        ("an extra key is rejected", {"all_things": ["woman"], "extra": 1}),
        ("a missing key is rejected", {}),
        ("a top-level list is rejected", ["woman"]),
    ):
        try:
            validate(bad)
            check(label, False, "validator accepted it")
        except common.SchemaViolation:
            check(label, True)
        except Exception as exc:  # noqa: BLE001
            check(label, False, f"raised {type(exc).__name__}, not SchemaViolation")

    # ---- duplicates are KEPT, deliberately: §A.6.6's treatment of self-contradiction ----
    check("a repeated entry is kept, not rejected (collapsed at derivation, counted there)",
          validate({"all_things": ["woman", "woman"]})
          == {"subject_nouns_all": ["woman", "woman"]})

    # ---- the patch must not touch any other prompt set ----
    for other in ("group-a.v1", "group-bcde.v1", "subject-noun.v1"):
        ov = common.default_variants(other)[0]
        check(f"{other} is untouched by the patch (no free-text array field)",
              allnouns.free_text_array_fields(ov) == frozenset())
    g = common.default_variants("subject-noun.v1")[0]
    check("subject-noun.v1 still validates through the original path",
          allnouns._validate_with_free_text_arrays({"main_thing": "cello"}, g)
          == {"subject_noun": "cello"})

    # ---- identity: the prompt file's hash is what the rows carry ----
    rows = common.read_jsonl(
        common.DATA_DIR / "subject-nouns-all-1.jsonl", require=False)
    if rows:
        stored = {r["prompt_file_sha256"] for r in rows}
        check("every stored row carries this prompt file's hash",
              stored == {v.file_hash}, f"{len(rows)} rows, {len(stored)} distinct hash(es)")
        stored_p = {r["prompt_hash"] for r in rows}
        check("every stored row carries this prompt text's hash",
              stored_p == {v.prompt_hash})

    # ---- the guard this file stands in for ----
    known_new = {"group-bcde.v1.variant-e.json", "group-bcde.v1.variant-f.json",
                 "subject-noun.v1.variant-g.json"}
    check("DECLARED KNOWN-NEW: selftest.py's inventory guard does not yet list this file "
          "(one-line fix owed, see module docstring)",
          v.path.name not in known_new, v.path.name)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {FAILURES}")
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
