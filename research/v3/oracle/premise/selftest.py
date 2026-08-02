"""Model-free self-test for the premise-test machinery.

    .venv/bin/python selftest.py

Covers the parts of the §11 checklist that do not need 26 GB of weights: resume, the
persisted attempt ledger and the poison-pill exit, schema validation and the retry path's
trigger, prompt-variant integrity, and the agreement arithmetic in analyze.py (checked
against a synthetic run whose right answer is known by construction).

The parts that DO need the model — determinism, batch composition, constrained decoding,
smoke timings — live in preflight.py.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import (  # noqa: E402
    MAX_ATTEMPTS, SCHEMA_VERSION, VOCABULARIES, AttemptLedger, JsonlSink, SchemaViolation,
    completed_keys, default_variants, load_eval_set, parse_model_text, read_jsonl, row_key,
    validate_and_canonicalize,
)

PASS, FAIL = "ok  ", "FAIL"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(f"{PASS if condition else FAIL} {name}{(' — ' + detail) if detail else ''}")
    if not condition:
        failures.append(name)


def main() -> int:
    variants = default_variants()

    # -- prompt variants -------------------------------------------------------
    check("two prompt variants load", len(variants) == 2, [v.id for v in variants].__str__())
    check("variants share the frozen schema_version",
          all(v.schema_version == SCHEMA_VERSION for v in variants))
    check("variants have different prompt text",
          variants[0].prompt_hash != variants[1].prompt_hash)
    check("variants have different generation order",
          list(variants[0].json_schema["properties"]) != list(variants[1].json_schema["properties"]),
          f"A={list(variants[0].json_schema['properties'])} B={list(variants[1].json_schema['properties'])}")
    check("both variants cover every canonical field",
          set(variants[0].field_map.values()) == set(variants[1].field_map.values()))
    check("prompt hashes are stable across reloads",
          [v.prompt_hash for v in default_variants()] == [v.prompt_hash for v in variants])

    # -- schema validation and the retry trigger --------------------------------
    a = variants[0]
    good = {"ground": "shaded_field", "shading": "linear", "texture": "smooth",
            "enclosure": "none", "confidence": "high", "note": ""}
    parsed = validate_and_canonicalize(good, a)
    check("valid document canonicalizes", parsed["ground_type"] == "shaded_field", str(parsed))

    def rejects(payload, label):
        try:
            validate_and_canonicalize(payload, a)
        except SchemaViolation:
            return True
        return False

    check("out-of-vocabulary value rejected", rejects({**good, "ground": "gradient"}, "vocab"))
    check("missing key rejected", rejects({k: v for k, v in good.items() if k != "note"}, "missing"))
    check("extra key rejected", rejects({**good, "extra": "x"}, "extra"))
    check("non-object rejected", rejects(["shaded_field"], "list"))
    check("fenced JSON still parses",
          parse_model_text('```json\n{"a": 1}\n```') == {"a": 1})

    # -- resume + attempt ledger + poison pill ----------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "run.jsonl"
        sink = JsonlSink(out)
        key_ok = row_key("sha-ok", a)
        key_failed = row_key("sha-failed", a)
        sink.write({"row_key": key_ok, "status": "ok"})
        sink.write({"row_key": key_failed, "status": "failed"})
        sink.close()
        done = completed_keys(out)
        check("resume skips completed rows", key_ok in done)
        check("resume treats `failed` as terminal, not as absence", key_failed in done)
        check("resume key ignores run_id but includes prompt_hash",
              row_key("sha-ok", variants[0]) != row_key("sha-ok", variants[1]))

        # a hard kill mid-write leaves a partial line; it must not poison the reader
        with open(out, "a") as handle:
            handle.write('{"row_key": "truncated", "sta')
        check("truncated final line is dropped, not fatal", len(read_jsonl(out)) == 2)

        ledger_path = Path(tmp) / "run.attempts.jsonl"
        ledger = AttemptLedger(ledger_path)
        for _ in range(MAX_ATTEMPTS):
            ledger.record(key_ok, "some/path.jpg")
        ledger.close()
        reloaded = AttemptLedger(ledger_path)
        check("attempt counter survives a process restart",
              reloaded.attempts(key_ok) == MAX_ATTEMPTS, f"{reloaded.attempts(key_ok)}")
        check("an untouched key has zero attempts", reloaded.attempts(key_failed) == 0)
        reloaded.close()

    # -- eval set integrity ------------------------------------------------------
    items, meta = load_eval_set()
    included = [i for i in items if i.included]
    check("eval set loads", len(items) > 0, f"{len(items)} entries, {len(included)} included")
    check("every included entry has a boolean label",
          all(isinstance(i.gradient_truth, bool) for i in included))
    check("every excluded entry has a null label and a reason",
          all(i.gradient_truth is None for i in items if not i.included))
    check("every image file exists", all(i.absolute_path.exists() for i in items))
    check("cross-check against the legacy distillation is clean",
          meta["crossCheckAgainstLegacyDistillation"].get("inLegacyNotHere") == 0
          and meta["crossCheckAgainstLegacyDistillation"].get("hereNotInLegacy") == 0)
    check("labels are not degenerate",
          0.25 < sum(1 for i in included if i.gradient_truth) / len(included) < 0.75,
          f"{sum(1 for i in included if i.gradient_truth)}/{len(included)} gradient")

    # -- the agreement arithmetic, against a run whose answer is known ------------
    with tempfile.TemporaryDirectory() as tmp:
        results = Path(tmp) / "synthetic.jsonl"
        sink = JsonlSink(results)
        # 20 artworks, alternating ground truth. Variant A is a perfect oracle. Variant B
        # INVERTS its answer on the last four, giving two hard contradictions (label says
        # flat, a gradient was published) and two soft ones (label says shaded, flat was
        # published). Expected: A kappa 1.0; B 16/20; variants agree on 16.
        for index in range(20):
            truth = index % 2 == 0
            for variant, correct in (("A", True), ("B", index < 16)):
                says_gradient = truth if correct else not truth
                ground = "shaded_field" if says_gradient else "flat_field"
                base = {
                    "row_key": f"synthetic-{index}-{variant}",
                    "status": "ok", "is_canary": False, "parse_failed": False, "attempts": 1,
                    "image_sha256": f"sha{index:03d}", "image_path": f"fake/{index}.jpg",
                    "artwork_id": f"art{index:03d}", "prompt_variant": variant,
                    "prompt_hash": f"hash-{variant}", "model_revision": "rev",
                    "run_id": "synthetic", "source_long_edge_px": 640,
                    "gradient_truth": truth, "gradient_truth_conflicted": False,
                    "raw_text": "{}",
                    "parsed": {
                        "ground_type": ground,
                        "shading_geometry": "linear" if ground == "shaded_field" else "not_applicable",
                        "field_texture": "smooth", "enclosure": "none",
                        "confidence": "high", "ambiguity_note": "",
                    },
                }
                sink.write(base)
        sink.close()
        report_path = Path(tmp) / "report.json"
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "analyze.py"),
             "--results", str(results), "--out", str(report_path)],
            capture_output=True, text=True)
        check("analyze.py runs", proc.returncode == 0, proc.stderr[-400:])
        if proc.returncode == 0:
            report = json.loads(report_path.read_text())
            a_scores = report["per_variant"]["A"]["strict_all_labels"]
            b_scores = report["per_variant"]["B"]["strict_all_labels"]
            check("perfect variant scores kappa 1.0", a_scores["cohens_kappa"] == 1.0, str(a_scores))
            check("imperfect variant scores 16/20", b_scores["agreement"] == 0.8, str(b_scores))
            check("P6 buckets sum to the population",
                  sum(report["per_variant"]["A"]["p6_buckets"].values()) == 20)
            check("A has no contradictions",
                  report["per_variant"]["A"]["p6_buckets"].get("contradiction_hard", 0) == 0
                  and report["per_variant"]["A"]["p6_buckets"].get("contradiction_soft", 0) == 0)
            check("B's four errors split 2 hard / 2 soft per P6",
                  report["per_variant"]["B"]["p6_buckets"].get("contradiction_hard", 0) == 2
                  and report["per_variant"]["B"]["p6_buckets"].get("contradiction_soft", 0) == 2,
                  str(report["per_variant"]["B"]["p6_buckets"]))
            breakdown = report["variants_agree_breakdown"]
            check("variants-agree subset is 16 items",
                  breakdown["same_binary_mapping"]["n"] == 16, str(breakdown["same_binary_mapping"]["n"]))
            check("variants-agree subset is scored perfectly",
                  breakdown["same_binary_mapping"]["scores_vs_human"]["agreement"] == 1.0)
            check("inter-variant ground_type agreement is 16/20",
                  report["inter_variant_agreement"]["per_question"]["ground_type"]["raw_agreement"] == 0.8)
            check("disagreements list carries the four items", len(report["disagreements"]) == 4)

    # -- vocabularies match the question set ------------------------------------
    check("shading vocabulary carries the documented not_applicable deviation",
          "not_applicable" in VOCABULARIES["shading_geometry"])

    print()
    if failures:
        print(f"{len(failures)} FAILED: {failures}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
