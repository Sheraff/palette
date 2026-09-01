"""Emit the spread-wording mini-pilot's candidate prompt files.

    .venv/bin/python make_spread_pilot_prompts.py

SCHEMA_V2_PROPOSAL.md §4 asks for three candidate wordings of `signature_carrier`'s new
"spread across several elements" value, chosen by what the MODEL understands rather than by
argument (the reviewer's ruling, verbatim: "what matters is that the model understands it, not
me"). This script derives each candidate from `prompts/group-bcde.v2.variant-e.json` by
swapping EXACTLY ONE value token and EXACTLY ONE gloss line, so that the only difference
between arms is the wording under test. Everything else — the other twelve questions, all eight
shared blocks, enum order, the JSON schema shape — is copied byte-for-byte from variant E.

Four arms are emitted, not three. §4's fourth metric is "shift in text/subject/background rates
vs the same covers WITHOUT the value", which is not computable from the three candidates alone;
arm N drops the spread value entirely and supplies that baseline. N is a control, never a
candidate — the pick rule in §4 ranges over A/B/C only.

Output goes to `prompts/spread-wording-pilot/`, a SUBDIRECTORY, on purpose: `selftest.py`'s
prompt inventory globs `prompts/*.json` non-recursively, so these four files do not trip it the
way the two v2 drafts do. They carry their own schema_version (`spread-wording-pilot.v1`) so
that `run_premise.py`'s "never mix question sets in one file" guard would refuse to append them
to any real run.

Writes nothing else and touches no existing file.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROMPTS_DIR, sha256_bytes  # noqa: E402

SOURCE = PROMPTS_DIR / "group-bcde.v2.variant-e.json"
OUT_DIR = PROMPTS_DIR / "spread-wording-pilot"
PILOT_SCHEMA_VERSION = "spread-wording-pilot.v1"

# The value token that variant E carries as its placeholder, and the gloss line it carries.
# Candidate A is that placeholder unchanged — §4 is explicit that A "is not a recommendation".
PLACEHOLDER_TOKEN = "several_places"
PLACEHOLDER_GLOSS = "   several_places - it sits in several places at once and you cannot pick out which ones"

# [REVIEWED] SCHEMA_V2_PROPOSAL.md §4, the three candidate wordings, transcribed verbatim from
# the table. All three keep the anti-escape-hatch clause; they differ in what "spread" means.
CANDIDATES: dict[str, dict[str, str]] = {
    "A": {
        "token": "several_places",
        "gloss": "it sits in several places at once and you cannot pick out which ones",
        "tests": "spread = several locations, unnameable. Matches the register of its four "
                 "siblings, which are all places.",
    },
    "B": {
        "token": "spread_throughout",
        "gloss": "it is spread through the whole cover rather than sitting on any one part",
        "tests": "spread = pervasive. Risk: overlaps `background`.",
    },
    "C": {
        "token": "all_over",
        "gloss": "it is all over the cover, not on any one part you could point to",
        "tests": "same idea as B in plainer words. Tests whether the register or the concept is "
                 "what the model is reading.",
    },
}


def build(arm: str, doc: dict) -> dict:
    """One arm. `arm` is 'A'|'B'|'C' (candidate) or 'N' (no-spread-value control)."""
    out = json.loads(json.dumps(doc))  # deep copy; never mutate the source document
    vocab = list(out["vocabularies"]["signature_carrier"])
    assert PLACEHOLDER_TOKEN in vocab, "variant E no longer carries the placeholder token"
    slot = vocab.index(PLACEHOLDER_TOKEN)
    prompt = out["prompt"]
    assert prompt.count(PLACEHOLDER_GLOSS) == 1, "placeholder gloss line is not uniquely findable"

    if arm == "N":
        vocab.pop(slot)
        # Drop the whole gloss line, and the newline that carried it, leaving the other five
        # values in their original order and the rest of the prompt untouched.
        prompt = prompt.replace(PLACEHOLDER_GLOSS + "\n", "", 1)
        note = ("CONTROL ARM. The spread value is absent entirely. Supplies the "
                "without-the-value baseline that SCHEMA_V2_PROPOSAL.md §4's fourth metric "
                "compares against. Not a candidate; the §4 pick rule does not range over it.")
    else:
        cand = CANDIDATES[arm]
        vocab[slot] = cand["token"]  # same position: enum option order is held constant
        prompt = prompt.replace(
            PLACEHOLDER_GLOSS, f"   {cand['token']} - {cand['gloss']}", 1)
        note = f"CANDIDATE {arm}. Tests: {cand['tests']}"

    out["vocabularies"]["signature_carrier"] = vocab
    out["prompt"] = prompt
    out["json_schema"]["properties"]["signature_source"]["items"]["enum"] = vocab
    out["schema_version"] = PILOT_SCHEMA_VERSION

    # [MEASURED 2026-08-04] The drafted v2 files declare `multi_select_fields` with PROMPT KEY
    # names (`lettering_kinds`, `signature_source`); `common.py`'s `load_prompt_variant` reads it
    # as CANONICAL names, which is what group-bcde.v1 carries (`text_roles`, `overlays`). As
    # drafted, both v2 files therefore raise KeyError: 'enum' on load — the array-valued property
    # falls through to the single-enum branch. SCHEMA_V2_PROPOSAL.md §9's checks were made on the
    # JSON shape without ever loading the files through the real code path, which is how this
    # survived. Not fixed here: the v2 drafts are unsigned and another workstream owns them. The
    # pilot arms are normalised to the canonical convention so they load.
    out["multi_select_fields"] = sorted(
        out["field_map"][k] for k in doc["multi_select_fields"])
    out["prompt_variant"] = arm
    out["provenance"] = {
        "derived_from": SOURCE.name,
        "derived_from_file_sha256": sha256_bytes(SOURCE.read_bytes()),
        "generated_by": "research/v3/oracle/premise/make_spread_pilot_prompts.py",
        "what_changed": ("exactly one value token and exactly one gloss line in question 13 "
                         "(signature_source); nothing else differs from variant E"),
        "arm_note": note,
        "status": "MINI-PILOT INSTRUMENT — measures wording comprehension only. These files are "
                  "NOT a schema proposal and must never be run as one: the pilot set is a "
                  "hand-picked probe set, not a sample, so no rate computed with them is a "
                  "corpus rate.",
    }
    return out


def main() -> int:
    doc = json.loads(SOURCE.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = []
    for arm in ("A", "B", "C", "N"):
        built = build(arm, doc)
        raw = (json.dumps(built, indent="\t", ensure_ascii=False) + "\n").encode("utf-8")
        path = OUT_DIR / f"spread-pilot.{arm}.json"
        path.write_bytes(raw)
        prompt_hash = sha256_bytes(("\0".join([built["system"], built["prompt"]])).encode("utf-8"))
        summary.append({
            "arm": arm,
            "file": str(path.relative_to(PROMPTS_DIR.parent)),
            "signature_carrier": built["vocabularies"]["signature_carrier"],
            "prompt_chars": len(built["prompt"]),
            "prompt_hash": prompt_hash[:16],
            "file_hash": sha256_bytes(raw)[:16],
        })

    # The arms must differ ONLY in question 13. Prove it rather than assert it in prose:
    # strip every line mentioning a spread token and the remaining prompts must be identical.
    tokens = {c["token"] for c in CANDIDATES.values()}
    stripped = set()
    for arm in ("A", "B", "C", "N"):
        p = json.loads((OUT_DIR / f"spread-pilot.{arm}.json").read_text(encoding="utf-8"))["prompt"]
        stripped.add("\n".join(l for l in p.splitlines()
                               if not any(t in l for t in tokens)))
    assert len(stripped) == 1, (
        "the four arms differ somewhere OTHER than the spread value's gloss line — the "
        "experiment would not be measuring the wording")

    print(json.dumps({
        "wrote": str(OUT_DIR),
        "arms": summary,
        "identical_outside_question_13": True,
    }, indent="\t"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
