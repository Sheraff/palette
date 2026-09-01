"""Model-free self-test for the bake-off machinery.

    .venv/bin/python selftest.py

Covers everything that does not need 26-36 GB of weights: the arm registry's internal
consistency, item-set construction, the gold-30 join, resume keys, the attempt ledger, the
schema validation the retry path depends on, and — the one that actually matters — that
score.py reproduces the reviewer-facing gold-30 analysis and the premise agreement report
number for number from the same raw run file. If those two checks pass, this scorer and the
existing analyses mean the same thing by "agreement".

The parts that DO need a model (does it load, does the grammar bind, how long does a decode
take) live in verify_load.py, which is the setup phase's only permitted GPU work.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from bakeoff_common import (  # noqa: E402
    AttemptLedger, JsonlSink, SchemaViolation, bakeoff_row_key, completed_keys,
    default_variants, gold30_reviewer_labels, load_items, read_jsonl, validate_and_canonicalize,
)

PASS, FAIL = "ok  ", "FAIL"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(f"{PASS if condition else FAIL} {name}{(' — ' + detail) if detail else ''}")
    if not condition:
        failures.append(name)


def main() -> int:
    # ---- the arm registry ------------------------------------------------------
    for arm, spec in config.ARMS.items():
        check(f"arm {arm}: revision looks like an HF commit",
              len(spec["hf_revision"]) == 40 and all(c in "0123456789abcdef" for c in spec["hf_revision"]),
              spec["hf_revision"])
        check(f"arm {arm}: has a role and a size", bool(spec["role"]) and bool(spec["params"]))
        if not spec.get("available"):
            check(f"arm {arm}: unavailable arms carry a reason", bool(spec.get("blocked_reason")))
    check("registry: every bake-off arm is registered",
          all(a in config.ARMS for a in config.BAKEOFF_ARMS))
    check("registry: no two arms share a repo+revision",
          len({(s["hf_repo"], s["hf_revision"]) for s in config.ARMS.values()}) == len(config.ARMS))
    check("registry: the incumbent inherits its manifest instead of re-hashing 26 GB",
          bool(config.ARMS[config.ARM_QWEN3_30B_A3B]["manifest_inherited_from"]))
    check("registry: the incumbent's results are the premise run",
          config.results_path(config.ARM_QWEN3_30B_A3B, config.ITEMS_EVAL142) == config.PREMISE_RUN_PATH)
    check("registry: a fresh arm writes into the owned data directory",
          config.results_path(config.ARM_GEMMA3_27B, config.ITEMS_GOLD30).parent == config.DATA_DIR)

    # ---- prompts and item sets -------------------------------------------------
    variants = default_variants()
    check("prompts: two variants load from the premise workstream", len(variants) == 2,
          ", ".join(v.id for v in variants))
    check("prompts: the two variants are genuinely different text",
          variants[0].prompt_hash != variants[1].prompt_hash)

    eval142 = load_items(config.ITEMS_EVAL142)
    gold30 = load_items(config.ITEMS_GOLD30)
    check("items: eval142 holds 142 included entries", len(eval142) == 142, str(len(eval142)))
    check("items: gold30 holds 30 entries", len(gold30) == 30, str(len(gold30)))
    check("items: gold30 is a subset of eval142",
          {i.image_sha256 for i in gold30} <= {i.image_sha256 for i in eval142})
    check("items: every image resolves to a file on disk",
          all(i.absolute_path.exists() for i in eval142))
    labels = gold30_reviewer_labels()
    check("gold30: every reviewer label is in the frozen vocabulary", len(labels) == 30)
    check("gold30: the join is by content hash, and every hash matched",
          {i.image_sha256 for i in gold30} == set(labels))

    # ---- resume identity -------------------------------------------------------
    item = eval142[0]
    key_a = bakeoff_row_key("arm-one", item.image_sha256, variants[0])
    key_b = bakeoff_row_key("arm-two", item.image_sha256, variants[0])
    key_c = bakeoff_row_key("arm-one", item.image_sha256, variants[1])
    check("resume: the arm is part of the row key", key_a != key_b)
    check("resume: the prompt variant is part of the row key", key_a != key_c)

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "run.jsonl"
        sink = JsonlSink(out)
        sink.write({"row_key": key_a, "status": "ok"})
        sink.write({"row_key": key_b, "status": "failed"})
        sink.write({"row_key": key_c, "status": "running"})
        sink.close()
        done = completed_keys(out)
        check("resume: ok and failed are both terminal", {key_a, key_b} <= done)
        check("resume: a non-terminal row does not satisfy the queue", key_c not in done)
        check("resume: canary rows carry a suffix that cannot collide",
              (key_a + "|canary") not in done)

        ledger_path = out.with_suffix(".attempts.jsonl")
        ledger = AttemptLedger(ledger_path)
        for _ in range(3):
            ledger.record(key_a, item.image_path)
        ledger.close()
        check("ledger: attempts persist across processes",
              AttemptLedger(ledger_path).attempts(key_a) == 3)
        check("ledger: writes one line per attempt", len(read_jsonl(ledger_path)) == 3)

    # ---- schema validation, the retry path's trigger ---------------------------
    variant = variants[0]
    good = {k: (variant.json_schema["properties"][k]["enum"][0]
                if "enum" in variant.json_schema["properties"][k] else "")
            for k in variant.field_map}
    canonical = validate_and_canonicalize(good, variant)
    check("schema: a valid document canonicalizes to the analysis field names",
          set(canonical) == set(variant.field_map.values()))
    for bad, why in (
        ({**good, list(variant.field_map)[0]: "not_a_vocabulary_word"}, "value outside the vocabulary"),
        ({f"1. {k}": v for k, v in good.items()}, "numbered keys, the failure the grammar prevents"),
        ("a string", "top level is not an object"),
    ):
        try:
            validate_and_canonicalize(bad, variant)
            check(f"schema: rejects {why}", False)
        except SchemaViolation:
            check(f"schema: rejects {why}", True)

    # ---- the repair suffix used by the no-grammar fallback ---------------------
    rendered = config.REPAIR_SUFFIX.format(keys=json.dumps(sorted(variant.field_map)))
    check("fallback: the repair instruction names the required keys",
          all(k in rendered for k in variant.field_map))

    # ---- GPU faults are classified apart from ordinary failures ----------------
    from bakeoff_common import is_gpu_fault  # noqa: PLC0415
    metal_timeout = RuntimeError(
        "[METAL] Command buffer execution failed: Caused GPU Timeout Error "
        "(00000002:kIOGPUCommandBufferCallbackErrorTimeout)")
    check("gpu fault: the observed Metal timeout is recognised", is_gpu_fault(metal_timeout))
    check("gpu fault: a schema violation is NOT one",
          not is_gpu_fault(SchemaViolation("ground=nonsense is outside the vocabulary")))
    check("gpu fault: a JSON error is NOT one",
          not is_gpu_fault(json.JSONDecodeError("Expecting value", "x", 0)))

    # ---- the scorer, against two published analyses ----------------------------
    with tempfile.TemporaryDirectory() as tmp:
        out_json = Path(tmp) / "scores.json"
        result = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "score.py"),
             "--arm", config.ARM_QWEN3_30B_A3B,
             "--out", str(out_json), "--table-out", str(Path(tmp) / "scores.txt")],
            capture_output=True, text=True)
        check("scorer: runs on the incumbent's existing results", result.returncode == 0,
              result.stderr.strip()[-300:])
        if out_json.exists():
            report = json.loads(out_json.read_text())
            check("scorer: reproduces the published gold-30 analysis exactly",
                  report.get("self_check", {}).get("passed") is True,
                  "; ".join(report.get("self_check", {}).get("problems", [])))
            # And the premise agreement report, cell for cell, on the full 142.
            published = json.loads(
                (config.PREMISE_DATA_DIR / "premise-run-1.agreement.json").read_text())
            mine = report["per_arm"][config.ARM_QWEN3_30B_A3B][config.ITEMS_EVAL142]
            for variant_id in ("A", "B"):
                theirs = published["per_variant"][variant_id]
                check(f"scorer: eval142 strict agreement matches premise/analyze.py ({variant_id})",
                      mine[variant_id]["strict_all_labels"] == theirs["strict_all_labels"])
                check(f"scorer: eval142 P6 buckets match premise/analyze.py ({variant_id})",
                      mine[variant_id]["p6_buckets"] == theirs["p6_buckets"])

    print()
    if failures:
        print(f"{len(failures)} FAILED: " + ", ".join(failures))
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
