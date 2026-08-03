"""Derive the six-way tag from probe-arm rows, then hand off to analyze.py unchanged.

    .venv/bin/python derive_probes.py --results <probe-run.jsonl> --out <derived.jsonl>
    .venv/bin/python analyze.py --results <derived.jsonl>

PREMISE_NEXT.md §13 item 3. The derivation is a **LOOKUP** against the committed 729-row table
`prompts/derivation.group-a.probes.v1.json`, never a reimplementation of its rules: "an
implementation that disagrees with any of the 729 entries is wrong, not the table." The rules
are evaluated in exactly one place in this repo — `selftest.py`, purely to prove the shipped
table matches its own stated rules — and never on the path that produces data.

What this writes: one row per (image, variant) for bundled mode, or one row per image for
separate mode, carrying `parsed["ground_type"]` / `["field_texture"]` / `["shading_geometry"]`
so `analyze.py` reads it exactly as it reads an A/B/C/D row. The probe answers, the vector,
the disposition and the tensions all survive alongside.

Separate mode (§13 item 4): the six solo rows for one image are joined into one vector first.
A row missing any of its six probes derives `underdetermined:incomplete` — counted, never
silently dropped.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    DATA_DIR, INCOMPLETE_DISPOSITION, JsonlSink, ProbeDerivation,
    assert_rows_not_superseded, join_probe_answers, read_jsonl, utc_now,
)

# [REVIEWED] Fields the derivation writes into `parsed` so analyze.py needs no change.
DERIVED_FIELDS = ("ground_type", "field_texture", "shading_geometry")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--mode", choices=("auto", "bundled", "separate"), default="auto")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    rows = read_jsonl(args.results)
    # §13.2 — a v1 probe hash anywhere in the file invalidates the whole run.
    checked = assert_rows_not_superseded(rows, str(args.results))

    derivation = ProbeDerivation()
    out_path = args.out or args.results.with_suffix(".derived.jsonl")
    assert out_path != args.results, "refusing to overwrite the raw results file"
    if out_path.exists():
        out_path.unlink()   # derived output is a pure function of the input; regenerate it

    canary_rows = [r for r in rows if r.get("is_canary")]
    work = [r for r in rows if not r.get("is_canary")]

    variants = sorted({r.get("prompt_variant", "?") for r in work})
    mode = args.mode
    if mode == "auto":
        # Solo variants are named S-<probe> by the prompt files; bundled are P and Q.
        mode = "separate" if all(v.startswith("S-") for v in variants) and variants else "bundled"

    sink = JsonlSink(out_path)
    stats: Counter = Counter()
    dispositions: Counter = Counter()
    tags: Counter = Counter()
    unsure_answers = 0
    probe_answers = 0

    def emit(base: dict, source_rows: list[dict], answers: dict) -> None:
        nonlocal unsure_answers, probe_answers
        for probe in derivation.probe_order:
            if probe in answers:
                probe_answers += 1
                if answers[probe] == "unsure":
                    unsure_answers += 1
        derived = derivation.derive(answers)
        row = dict(base)
        parsed = dict(answers)
        for key in DERIVED_FIELDS:
            parsed[key] = derived[key]
        row["parsed"] = parsed
        row["probe_answers"] = answers
        row["derivation"] = derived
        row["derived_from_rows"] = [r.get("row_key") for r in source_rows]
        row["derived_at"] = utc_now()
        row["presentation_mode"] = mode
        # analyze.py drops rows whose status is not ok; an incomplete join is a real result,
        # so it stays `ok` and is identified by its disposition instead.
        row["status"] = "ok" if any(r.get("status") == "ok" for r in source_rows) else "failed"
        sink.write(row)
        stats["derived_rows"] += 1
        dispositions[derived["disposition"]] += 1
        tags[derived["derived_tag"]] += 1

    if mode == "bundled":
        for row in work:
            answers = join_probe_answers([row])
            base = {k: v for k, v in row.items() if k not in ("parsed",)}
            emit(base, [row], answers)
    else:
        grouped: dict[str, list[dict]] = defaultdict(list)
        for row in work:
            grouped[row["image_sha256"]].append(row)
        for sha in sorted(grouped):
            group = sorted(grouped[sha], key=lambda r: r.get("prompt_variant", ""))
            answers = join_probe_answers(group)
            first = group[0]
            base = {k: v for k, v in first.items() if k not in ("parsed",)}
            # The joined row is not any single variant's answer.
            base["prompt_variant"] = "S-joined"
            base["prompt_hash"] = "joined:" + ",".join(
                sorted({r.get("prompt_hash", "?")[:12] for r in group}))
            base["solo_row_count"] = len(group)
            base["solo_variants"] = sorted({r.get("prompt_variant", "?") for r in group})
            emit(base, group, answers)

    sink.close()

    incomplete = dispositions.get(INCOMPLETE_DISPOSITION, 0)
    report = {
        "generated_by": "research/v3/oracle/premise/derive_probes.py",
        "at": utc_now(),
        "results_file": str(args.results),
        "derived_file": str(out_path),
        "mode": mode,
        "variants_in_results": variants,
        "rows_checked_for_superseded_prompts": checked,
        "derivation": {
            "file": derivation.path.name,
            "sha256": derivation.sha256,
            "schema_version": derivation.schema_version,
            "probe_order": list(derivation.probe_order),
            "table_rows": len(derivation.table),
        },
        "counts": {
            "input_rows": len(rows),
            "canary_rows_ignored": len(canary_rows),
            "work_rows": len(work),
            "derived_rows": stats["derived_rows"],
            "incomplete": incomplete,
            "unsure_answers": unsure_answers,
            "probe_answers": probe_answers,
            "unsure_rate": round(unsure_answers / probe_answers, 4) if probe_answers else None,
        },
        "dispositions": dict(dispositions),
        "derived_tags": dict(tags),
        "note": "Lookup against the committed table, never a reimplementation (PREMISE_NEXT.md "
                "§13 item 3). `incomplete` counts rows missing at least one probe (§13 item 4); "
                "they derive `underdetermined:incomplete` and are never dropped.",
    }
    report_path = args.report or DATA_DIR / (args.results.stem + ".derivation.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent="\t") + "\n")
    print(json.dumps(report, indent="\t"))
    print(f"wrote {out_path}")
    print(f"wrote {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
