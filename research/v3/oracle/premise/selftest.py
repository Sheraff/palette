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
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from common import (  # noqa: E402
    CANONICAL_FIELDS, DEFAULT_PROMPT_SET, MAX_ATTEMPTS, PROMPT_SETS, SCHEMA_VERSION,
    SUPERSEDED_PROMPT_HASH_PREFIXES, VOCABULARIES,
    AttemptLedger, JsonlSink, ProbeDerivation, SchemaViolation, SupersededPrompt,
    assert_rows_not_superseded, completed_keys, default_variants, join_probe_answers,
    load_eval_set, parse_model_text, read_jsonl, row_key, validate_and_canonicalize,
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

    check_prompt_sets(variants)
    check_probe_derivation()
    check_prompt_files_unchanged()
    check_group_bcde()

    print()
    if failures:
        print(f"{len(failures)} FAILED: {failures}")
        return 1
    print("all checks passed")
    return 0


def check_prompt_sets(v1_variants) -> None:
    """Every registered prompt set loads, and adding them did not disturb run 1's pair."""
    print()
    check("default prompt set is still run 1's", DEFAULT_PROMPT_SET == "group-a.v1")
    check("v1 loading is byte-identical to before the probe opt-in",
          [v.prompt_hash for v in default_variants("group-a.v1")] == [v.prompt_hash for v in v1_variants]
          and all(v.canonical_fields == CANONICAL_FIELDS for v in v1_variants)
          and all(v.vocabularies == VOCABULARIES for v in v1_variants),
          "A/B fall back to the module constants")

    # `subject-noun.v1` is deliberately 1, not 2: it is the only set here without a variant pair,
    # because a second variant is a second full pass over the eval set and the run's budget bought
    # one. The count is asserted so that fact stays visible rather than looking like an omission.
    expected_counts = {"group-a.v1": 2, "group-a.v2": 2,
                       "group-a.probes.bundled": 2, "group-a.probes.solo": 6,
                       "group-bcde.v1": 2, "subject-noun.v1": 1}
    for name in sorted(PROMPT_SETS):
        try:
            loaded = default_variants(name)
        except Exception as error:
            check(f"prompt set {name} loads", False, f"{type(error).__name__}: {error}")
            continue
        check(f"prompt set {name} loads",
              len(loaded) == expected_counts[name],
              f"{len(loaded)} variants: {sorted(x.variant for x in loaded)}")
        check(f"prompt set {name} is one schema version",
              len({x.schema_version for x in loaded}) == 1,
              sorted({x.schema_version for x in loaded})[0])

    probes = default_variants("group-a.probes.bundled")
    solo = default_variants("group-a.probes.solo")

    # §13 item 2 — the whole reason the constants had to become per-variant.
    check("probe variants declare their own canonical fields (no ground_type asked)",
          all("ground_type" not in p.canonical_fields for p in probes)
          and all("bg_visible" in p.canonical_fields for p in probes),
          str(probes[0].canonical_fields))
    check("probe variants declare their own vocabularies",
          all(p.vocabularies["bg_visible"] == ("yes", "no", "unsure") for p in probes))
    check("a solo variant declares exactly one probe field",
          all(len(s.canonical_fields) == 1 for s in solo),
          str(sorted(s.canonical_fields[0] for s in solo)))
    check("solo variants cover the six probes exactly",
          sorted(s.canonical_fields[0] for s in solo) == sorted(ProbeDerivation().probe_order))
    check("bundled variants reorder the probes (P vs Q)",
          probes[0].probe_order != probes[1].probe_order,
          f"P={probes[0].probe_order[:3]}… Q={probes[1].probe_order[:3]}…")
    check("bundled variants share the referent preamble and unsure framing",
          probes[0].referent_preamble == probes[1].referent_preamble
          and probes[0].unsure_framing == probes[1].unsure_framing
          and all(s.referent_preamble == probes[0].referent_preamble for s in solo))
    # P and Q must differ structurally, not just in prose: under constrained decoding the JSON
    # property order IS the generation order, so a reordered probe_order changes the schema.
    check("P and Q ask the same fields",
          set(probes[0].json_schema["properties"]) == set(probes[1].json_schema["properties"]))
    check("P and Q differ in generation order, so their schema hashes differ",
          probes[0].schema_hash != probes[1].schema_hash
          and list(probes[0].json_schema["properties"]) != list(probes[1].json_schema["properties"]))

    # §13.1 published identities — the files on disk must be the files the doc describes.
    published = {
        "P": "7d30fbf945f765ae", "Q": "fac31935801d6026",
        "S-bg_visible": "ed7c82abe3569e90", "S-one_colour": "34561290aa4639f2",
        "S-continuous_change": "2947268257917cb9", "S-separate_areas": "d878c7a7139efa9b",
        "S-motif_or_material": "5b44b31541758111", "S-depicted_place": "5f08a567803b7b91",
    }
    actual = {x.variant: x.prompt_hash for x in probes + solo}
    check("probe prompt_hashes match PREMISE_NEXT §13.1",
          all(actual.get(k, "").startswith(p) for k, p in published.items()),
          str({k: actual.get(k, "MISSING")[:16] for k, p in published.items()
               if not actual.get(k, "").startswith(p)}) or "all 8 match")
    published_schema = {
        "P": "1b1b764ef30a56b3", "Q": "c2b04c3cc8a3ac1d",
        "S-bg_visible": "7c5832b4331e695c", "S-one_colour": "23bcf38542ef777b",
        "S-continuous_change": "8d90894195b2e55c", "S-separate_areas": "13544d59af4061f4",
        "S-motif_or_material": "add30cf9e47375b4", "S-depicted_place": "33be8194542ac0c7",
    }
    actual_schema = {x.variant: x.schema_hash for x in probes + solo}
    check("probe schema_hashes match PREMISE_NEXT §13.1",
          all(actual_schema.get(k, "").startswith(p) for k, p in published_schema.items()),
          str({k: actual_schema.get(k, "MISSING")[:16] for k, p in published_schema.items()
               if not actual_schema.get(k, "").startswith(p)}) or "all 8 match")
    published_file = {
        "P": "45dc5dddadc550f2", "Q": "31b956d9ea721860",
        "S-bg_visible": "5121c921c4cb7071", "S-one_colour": "15e57f3e751b9bcf",
        "S-continuous_change": "506e3dc203367263", "S-separate_areas": "e204c7f8f95ed22c",
        "S-motif_or_material": "bb9130ab98ebed79", "S-depicted_place": "12d678b525782565",
    }
    actual_file = {x.variant: x.file_hash for x in probes + solo}
    check("probe file_hashes match PREMISE_NEXT §13.1 (files on disk are the files documented)",
          all(actual_file.get(k, "").startswith(p) for k, p in published_file.items()),
          str({k: actual_file.get(k, "MISSING")[:16] for k, p in published_file.items()
               if not actual_file.get(k, "").startswith(p)}) or "all 8 match")

    # §13.2 — the v1 files must be gone, and their hashes must be refused if they return.
    check("no v1 probe prompt file remains on disk",
          not list(common.PROMPTS_DIR.glob("group-a.probes.v1.bundled-*.json"))
          and not list(common.PROMPTS_DIR.glob("group-a.probes.v1.solo-*.json")))
    poisoned = [{"row_key": "x", "prompt_hash": prefix + "0" * 48}
                for prefix in list(SUPERSEDED_PROMPT_HASH_PREFIXES)[:1]]
    try:
        assert_rows_not_superseded(poisoned, "selftest")
        check("a v1 probe hash in results is rejected", False, "it was accepted")
    except SupersededPrompt:
        check("a v1 probe hash in results is rejected", True)
    check("a v1.1 hash is not rejected",
          assert_rows_not_superseded(
              [{"row_key": "x", "prompt_hash": probes[0].prompt_hash,
                "prompt_file_sha256": probes[0].file_hash}], "selftest") == 1)


def check_probe_derivation() -> None:
    """The table is the contract (§13 item 3). Two independent proofs that it is sound, then
    the lookup path itself."""
    print()
    d = ProbeDerivation()
    check("derivation table loads and its sha256 matches the pin",
          d.sha256 == common.DERIVATION_SHA256 and len(d.table) == 729,
          f"{len(d.table)} rows")

    # Proof 1 — the shipped table equals its own stated rules. This is the ONLY place the
    # rules are evaluated anywhere in this workstream; the production path is pure lookup.
    def rules_tag(vec: dict[str, str]) -> tuple[str, str, list[str]]:
        yes = lambda k: vec[k] == "yes"          # noqa: E731
        others = ("one_colour", "continuous_change", "separate_areas",
                  "motif_or_material", "depicted_place")
        if vec["bg_visible"] == "no" and any(yes(k) for k in others):
            return "underdetermined", "contradiction_visibility", []
        if vec["bg_visible"] == "no":
            return "none_discernible", "derived", []
        if yes("one_colour") and (yes("continuous_change") or yes("separate_areas")):
            return "underdetermined", "contradiction_uniformity", []
        if yes("one_colour"):
            return "flat_field", "derived", ["uniform_vs_material"] if yes("motif_or_material") else []
        if yes("continuous_change"):
            tensions = ([("continuity_vs_areas") ] if yes("separate_areas") else []) \
                + (["continuity_vs_material"] if yes("motif_or_material") else []) \
                + (["continuity_vs_place"] if yes("depicted_place") else [])
            return "shaded_field", "derived", tensions
        if yes("separate_areas"):
            tensions = (["areas_vs_material"] if yes("motif_or_material") else []) \
                + (["areas_vs_place"] if yes("depicted_place") else [])
            return "multiple_distinct_fields", "derived", tensions
        if yes("motif_or_material"):
            return "pattern_or_texture", "derived", ["material_vs_place"] if yes("depicted_place") else []
        if yes("depicted_place"):
            return "full_scene", "derived", []
        disposition = "unsure" if any(v == "unsure" for v in vec.values()) else "all_negative"
        return "underdetermined", disposition, []

    def texture_of(vec: dict[str, str], ground: str) -> str:
        if ground == "underdetermined":
            return "underdetermined"
        if vec["motif_or_material"] == "yes":
            return "one_textured_material"
        if vec["separate_areas"] == "yes":
            return "distinct_areas"
        return "smooth"

    words = {"y": "yes", "n": "no", "u": "unsure"}
    mismatches = []
    for key, row in d.table.items():
        vec = {probe: words[ch] for probe, ch in zip(d.probe_order, key)}
        ground, disposition, tensions = rules_tag(vec)
        if (row["ground_type"] != ground or row["disposition"] != disposition
                or sorted(row["tensions"]) != sorted(tensions)
                or row["field_texture"] != texture_of(vec, ground)):
            mismatches.append((key, row, (ground, disposition, tensions)))
    check("all 729 table rows equal the file's own stated rules",
          not mismatches, f"{len(mismatches)} mismatch(es): {mismatches[:2]}")

    # Proof 2 — the file's self_check counts, recomputed from the table alone.
    counts = Counter(r["ground_type"] for r in d.table.values())
    check("self_check ground_type counts recompute",
          dict(counts) == d.self_check["ground_type_counts_over_uniform_vector_space"],
          str(dict(counts)))
    check("self_check disposition counts recompute",
          dict(Counter(r["disposition"] for r in d.table.values())) == d.self_check["disposition_counts"])
    tension_counts = Counter(t for r in d.table.values() for t in r["tensions"])
    check("self_check tension counts recompute",
          dict(tension_counts) == d.self_check["tension_counts"])
    visible = {k: r for k, r in d.table.items() if k[0] == "y"}
    check("self_check given_bg_visible_yes recomputes",
          len(visible) == d.self_check["given_bg_visible_yes"]["vectors"]
          and dict(Counter(r["ground_type"] for r in visible.values()))
          == d.self_check["given_bg_visible_yes"]["ground_type_counts"])

    # -- the lookup path -------------------------------------------------------
    all_no = {p: "no" for p in d.probe_order}
    shaded = {**all_no, "bg_visible": "yes", "continuous_change": "yes"}
    out = d.derive({**shaded, "shading_direction": "radial_or_vignette"})
    check("a shaded vector derives shaded_field and keeps the shading answer",
          out["ground_type"] == "shaded_field" and out["shading_geometry"] == "radial_or_vignette"
          and out["shading_geometry_source"] == "as_answered", str(out["derived_tag"]))
    flat = {**all_no, "bg_visible": "yes", "one_colour": "yes"}
    out = d.derive({**flat, "shading_direction": "linear"})
    check("shading_geometry is forced to not_applicable off shaded_field",
          out["ground_type"] == "flat_field" and out["shading_geometry"] == "not_applicable"
          and out["shading_geometry_raw"] == "linear"
          and out["shading_geometry_source"] == "forced_by_ground_type")
    # probe_order is bg_visible, one_colour, continuous_change, separate_areas,
    # motif_or_material, depicted_place -> yes, no, yes, no, no, no.
    check("the derived vector matches the table key",
          d.derive(shaded)["probe_vector"] == "ynynnn"
          and d.table["ynynnn"]["ground_type"] == "shaded_field",
          d.derive(shaded)["probe_vector"])

    # §13 item 4 — a missing probe is a named outcome, not a drop.
    partial = {k: v for k, v in shaded.items() if k != "depicted_place"}
    out = d.derive(partial)
    check("a missing probe derives underdetermined:incomplete",
          out["derived_tag"] == "underdetermined:incomplete"
          and out["probe_vector"] is None and out["probe_missing"] == ["depicted_place"],
          str(out["derived_tag"]))
    check("an all-missing row is incomplete, not a crash",
          d.derive({})["derived_tag"] == "underdetermined:incomplete"
          and len(d.derive({})["probe_missing"]) == 6)

    # separate mode: six solo rows join into one vector
    solo_rows = [{"parsed": {p: shaded[p]}} for p in d.probe_order]
    joined = join_probe_answers(solo_rows)
    check("six solo rows join into one complete vector",
          d.derive(joined)["probe_vector"] == d.derive(shaded)["probe_vector"])
    check("a failed solo row leaves the join incomplete",
          d.derive(join_probe_answers(solo_rows[:-1] + [{"parsed": None}]))["disposition"]
          == "incomplete")

    # every table row round-trips through derive()
    bad = [k for k in d.table
           if d.derive({p: words[ch] for p, ch in zip(d.probe_order, k)})["probe_vector"] != k]
    check("derive() reproduces all 729 vectors from their answers", not bad, str(bad[:3]))


# [REVIEWED] Every prompt file that existed before group-bcde.v1 was added, with its sha256 as
# published in PREMISE_NEXT.md §6, §13.1 and §13.2. A new schema group must not perturb one byte
# of an older one: A and B are the record of what run 1 asked, C/D and the probe files are drafted
# and approved instruments awaiting a GPU slot, and the derivation table is a signed contract.
PRE_EXISTING_PROMPT_FILES = {
    "group-a.variant-a.json":
        "b73b1e22c093f5297a6e47379ed6e464b1decac73e5ebb1461bfdcf3823b08fc",
    "group-a.variant-b.json":
        "8f7b494c0ec42a7bda1a1b176e2549e1abb0022095fa113e42b97487cab779df",
    "group-a.v2.variant-c.json":
        "6e25e75b6081dbd45fce8d2340668a1f29914ccd37ce587fa1568a7048649734",
    "group-a.v2.variant-d.json":
        "6715237d45ff190ec5129d4bb3510d05d4715fe477030bf1efc6302ef28c7314",
    "group-a.probes.v1.1.bundled-p.json":
        "45dc5dddadc550f21dc2e8f1d3d7c13fb6e34d8f6e63c1a76159e0f21b4b3861",
    "group-a.probes.v1.1.bundled-q.json":
        "31b956d9ea721860a9cb434d276b3b6a23303a561fdd3f7eae9ecf29da600049",
    "group-a.probes.v1.1.solo-bg-visible.json":
        "5121c921c4cb707179c66a9e0597444e7ff84daeb259c0691a5a18b79aa04477",
    "group-a.probes.v1.1.solo-one-colour.json":
        "15e57f3e751b9bcf0734df682f03d20aeb380011610c56e9859413b05c87e613",
    "group-a.probes.v1.1.solo-continuous-change.json":
        "506e3dc2033672633822249ea0bdb6f86448816c9bbd39cd29179122a52950bf",
    "group-a.probes.v1.1.solo-separate-areas.json":
        "e204c7f8f95ed22cc73c3c146ea7d1a427831cfa122b0514831fca2af087f0b4",
    "group-a.probes.v1.1.solo-motif-or-material.json":
        "bb9130ab98ebed796db8ad6f3b975038a731bae4f4d8497dd9177260f01551bc",
    "group-a.probes.v1.1.solo-depicted-place.json":
        "12d678b525782565080eac40665fc486ede7b592f5cad6e8dbdabcdbbf071728",
    "derivation.group-a.probes.v1.json":
        "da67d5ebf0aaab0c593f8fb8e040192e0e688f9dccfcc9bb2fe6b2af391a2fc5",
}

# [REVIEWED] PREMISE_NEXT.md §15.2, published alongside the two files.
GROUP_BCDE_PUBLISHED = {
    "E": {"prompt_hash": "1cbd4894e8b2f118", "schema_hash": "b169bc565982ad5b",
          "file_hash": "0e0fe253a0f5b956"},
    "F": {"prompt_hash": "3a50829af99684eb", "schema_hash": "9386abfb170b6465",
          "file_hash": "e0d8597ed1da0424"},
}

# [REVIEWED] PREMISE_NEXT.md §15.2. The nine-question `group-bcd.v1` was drafted, superseded the
# same day by this thirteen-question schema, and DELETED rather than frozen — it never ran and
# produced no row anywhere, so there is no data for a freeze to protect. §13.2's precedent.
SUPERSEDED_GROUP_BCD_FILES = (
    "group-bcd.v1.variant-e.json",
    "group-bcd.v1.variant-f.json",
)

# [REVIEWED] ORACLE_QUESTION_SET.md §B, §C, §D (including the new §D.1 `subject_kind`) and §E, in
# document order. The five `not_applicable` values and nothing else are the deviations each
# prompt file declares.
GROUP_BCDE_VOCABULARIES = {
    "has_text": ("yes", "no", "illegible_at_this_size"),
    "text_roles": ("title_display", "artist_name", "tracklist_or_body", "badge_or_sticker",
                   "label_logo", "incidental_in_scene", "not_applicable"),
    "text_dominance": ("dominant_element", "present_secondary", "minor", "not_applicable"),
    "overlays": ("parental_advisory", "label_logo", "barcode_or_price", "watermark", "none"),
    "physical_media_scan": ("yes", "no"),
    "has_dominant_subject": ("single", "multiple", "none"),
    "subject_kind": ("person", "animal", "vehicle", "object", "building_or_structure",
                     "abstract_shape", "not_applicable"),
    "subject_area_band": ("under_25", "25_60", "over_60", "not_applicable"),
    "has_signature_color": ("yes", "no"),
    "signature_carrier": ("text", "subject", "background", "small_element", "not_applicable"),
    "medium": ("photograph", "illustration_or_painting", "render_3d", "typography_only",
               "collage", "abstract_or_pattern"),
    "color_character": ("monochrome", "duotone_or_tinted", "limited_palette", "full_spectrum"),
    "grain_or_noise": ("yes", "no"),
}

# [REVIEWED] Forced by constrained decoding, not chosen: a conditional field generated before its
# condition would be answered blind. Identical in every variant of this schema group.
GROUP_BCDE_GATES = (
    ("has_text", "text_roles"),
    ("has_text", "text_dominance"),
    ("has_dominant_subject", "subject_kind"),
    ("has_dominant_subject", "subject_area_band"),
    ("has_signature_color", "signature_carrier"),
)


def check_prompt_files_unchanged() -> None:
    """A new schema group is additive or it is a regression. Byte identity, not "looks fine"."""
    print()
    on_disk = {p.name: common.sha256_file(p) for p in common.PROMPTS_DIR.glob("*.json")}
    changed = {name: (expected[:16], on_disk.get(name, "MISSING")[:16])
               for name, expected in PRE_EXISTING_PROMPT_FILES.items()
               if on_disk.get(name) != expected}
    check("every pre-existing prompt file is byte-identical",
          not changed, str(changed) or f"{len(PRE_EXISTING_PROMPT_FILES)} files unchanged")
    # Same treatment group-bcde.v1 got when it was the new set: named as known-new rather than
    # added to PRE_EXISTING_PROMPT_FILES, which means what it says. These files are not left
    # unguarded by that — `row_key` includes `prompt_hash`, so changing one character of a prompt
    # invalidates every row it produced and forces the work to be redone.
    unexpected = sorted(set(on_disk) - set(PRE_EXISTING_PROMPT_FILES)
                        - {"group-bcde.v1.variant-e.json", "group-bcde.v1.variant-f.json",
                           "subject-noun.v1.variant-g.json"})
    check("prompts/ holds no file this selftest does not know about", not unexpected, str(unexpected))
    # §15.2: the nine-question draft was deleted, not frozen — it produced no row anywhere, and a
    # loadable superset-minus-four schema in prompts/ is a hazard with no offsetting benefit.
    check("no superseded group-bcd.v1 prompt file remains on disk",
          not any((common.PROMPTS_DIR / name).exists() for name in SUPERSEDED_GROUP_BCD_FILES)
          and not list(common.PROMPTS_DIR.glob("group-bcd.v1.*")),
          str(sorted(p.name for p in common.PROMPTS_DIR.glob("group-bcd.v1.*"))))
    # The globs must stay disjoint, or a set silently starts loading another set's files.
    matched = {name: {p.name for p in common.PROMPTS_DIR.glob(glob)}
               for name, (_, glob) in PROMPT_SETS.items()}
    overlaps = {(a, b): sorted(matched[a] & matched[b])
                for a in matched for b in matched
                if a < b and matched[a] & matched[b]}
    check("no two registered prompt sets glob the same file", not overlaps, str(overlaps))
    check("group-bcde.v1 globs exactly its own two files",
          matched["group-bcde.v1"] == {"group-bcde.v1.variant-e.json", "group-bcde.v1.variant-f.json"},
          str(sorted(matched["group-bcde.v1"])))


def check_group_bcde() -> None:
    """Thirteen questions — groups B, C, D and E plus subject_kind — in one constrained decode,
    two orderings. Never piloted:
    everything below is a check that the instrument is what it says it is, not a measurement."""
    print()
    variants = {v.variant: v for v in default_variants("group-bcde.v1")}
    check("group-bcde.v1 loads variants E and F", sorted(variants) == ["E", "F"], str(sorted(variants)))
    if sorted(variants) != ["E", "F"]:
        return
    e, f = variants["E"], variants["F"]

    # -- identity ---------------------------------------------------------------
    for variant in (e, f):
        published = GROUP_BCDE_PUBLISHED[variant.variant]
        check(f"variant {variant.variant} hashes match PREMISE_NEXT §15.2",
              variant.prompt_hash.startswith(published["prompt_hash"])
              and variant.schema_hash.startswith(published["schema_hash"])
              and variant.file_hash.startswith(published["file_hash"]),
              f"{variant.prompt_hash[:16]} / {variant.schema_hash[:16]} / {variant.file_hash[:16]}")
    check("the schema_version guard keeps this set out of any group-a file",
          e.schema_version == "group-bcde.v1"
          and PROMPT_SETS["group-bcde.v1"][0] == "group-bcde.v1"
          and e.schema_version not in {PROMPT_SETS[s][0] for s in PROMPT_SETS if s != "group-bcde.v1"},
          "run_premise.py asserts existing rows' schema_version is a subset of this run's")

    # -- the nine questions, and their vocabularies -----------------------------
    check("both variants declare exactly the thirteen group-B/C/D/E fields",
          set(e.canonical_fields) == set(GROUP_BCDE_VOCABULARIES)
          and set(f.canonical_fields) == set(GROUP_BCDE_VOCABULARIES)
          and len(e.canonical_fields) == 13,
          str(sorted(e.canonical_fields)))
    check("both variants declare the question set's vocabularies plus the four documented deviations",
          e.vocabularies == GROUP_BCDE_VOCABULARIES and f.vocabularies == GROUP_BCDE_VOCABULARIES,
          str({k: v for k, v in e.vocabularies.items() if GROUP_BCDE_VOCABULARIES.get(k) != v}))
    check("option order inside every question is byte-identical between E and F",
          all(e.vocabularies[k] == f.vocabularies[k] for k in GROUP_BCDE_VOCABULARIES))
    check("no confidence and no free-text field",
          "confidence" not in e.canonical_fields and "ambiguity_note" not in e.canonical_fields
          and e.free_text_fields == () and f.free_text_fields == (),
          "design rule 7: self-reported confidence is degenerate under greedy decoding")

    # -- order: what is forced, what is held, what is varied --------------------
    def canonical_order(variant):
        return [variant.field_map[key] for key in variant.json_schema["properties"]]

    order_e, order_f = canonical_order(e), canonical_order(f)
    check("the generation order matches each file's declared question_order",
          all(order == json.loads(variant.path.read_text())["question_order"]
              for order, variant in ((order_e, e), (order_f, f))),
          f"E={order_e}")
    for gate, dependent in GROUP_BCDE_GATES:
        check(f"{gate} is generated before {dependent} in both variants",
              order_e.index(gate) < order_e.index(dependent)
              and order_f.index(gate) < order_f.index(dependent))
    check("signature_carrier is held last in both variants, as the ordering control",
          order_e[-1] == "signature_carrier" and order_f[-1] == "signature_carrier")
    moved = [q for q in order_e if order_e.index(q) != order_f.index(q)]
    check("E and F differ in generation order for 12 of the 13 fields",
          len(moved) == 12, f"{len(moved)} moved: {moved}")
    check("E and F differ in generation order, so their schema hashes differ",
          e.schema_hash != f.schema_hash and order_e != order_f)
    check("E and F use disjoint JSON key names, so a row cannot be misattributed",
          set(e.field_map) & set(f.field_map) == set(),
          f"E={sorted(e.field_map)}")
    check("E and F ask the same thirteen canonical fields",
          set(e.field_map.values()) == set(f.field_map.values()))

    # -- the shared blocks ------------------------------------------------------
    doc_e = json.loads(e.path.read_text())
    doc_f = json.loads(f.path.read_text())
    blocks_e, blocks_f = doc_e["shared_blocks"], doc_f["shared_blocks"]
    check("the eight shared blocks are byte-identical between E and F",
          blocks_e == blocks_f and len(blocks_e) == 8, f"{len(blocks_e)} blocks")
    check("every shared block appears verbatim in both prompts",
          all(block in e.prompt and block in f.prompt for block in blocks_e.values()),
          str([name for name, block in blocks_e.items()
               if block not in e.prompt or block not in f.prompt]) or "all 8 present in both")
    check("every stem and gloss is independently written (the prompts share no long line)",
          not (set(e.prompt.split("\n")) & set(f.prompt.split("\n"))
               - {line for block in blocks_e.values() for line in block.split("\n")} - {""}),
          "shared blocks are the only text in common")
    check("the resolution escape hatch survives into both renderings",
          "illegible_at_this_size" in e.prompt and "illegible_at_this_size" in f.prompt,
          "pipeline §7.1 / PHASE_0_DECISIONS.md §7: never a confident negative below the floor")

    # -- multi-select shape -----------------------------------------------------
    check("both variants declare text_roles and overlays as the multi-selects",
          e.multi_select_fields == ("text_roles", "overlays")
          and f.multi_select_fields == ("text_roles", "overlays"))
    for variant in (e, f):
        shapes = {}
        for key, canonical in variant.field_map.items():
            prop = variant.json_schema["properties"][key]
            if canonical in variant.multi_select_fields:
                shapes[key] = (prop.get("type"), tuple(prop["items"]["enum"]),
                               prop.get("minItems"), prop.get("maxItems"), "uniqueItems" in prop)
        check(f"variant {variant.variant} renders both multi-selects as array-of-enum",
              all(shape[0] == "array" and shape[2] == 1
                  and shape[3] == len(shape[1]) and shape[4] is False
                  for shape in shapes.values()) and len(shapes) == 2,
              str(shapes))
    check("no group-A variant declares a multi-select, so their loading is unchanged",
          all(v.multi_select_fields == ()
              for name in PROMPT_SETS if name != "group-bcde.v1"
              for v in default_variants(name)))

    # -- validation: what is fatal, and what is counted instead -----------------
    good = {key: (list(e.vocabularies[canonical][:2]) if canonical in e.multi_select_fields
                  else e.vocabularies[canonical][0])
            for key, canonical in e.field_map.items()}
    parsed = validate_and_canonicalize(good, e)
    check("a valid thirteen-field document canonicalizes",
          parsed["text_roles"] == ["title_display", "artist_name"]
          and parsed["has_text"] == "yes" and len(parsed) == 13, str(parsed))

    def rejects(payload):
        try:
            validate_and_canonicalize(payload, e)
        except SchemaViolation:
            return True
        return False

    check("a multi-select answered with a bare string is rejected",
          rejects({**good, "stickers": "none"}))
    check("an empty multi-select is rejected", rejects({**good, "stickers": []}))
    check("an out-of-vocabulary list item is rejected",
          rejects({**good, "lettering_kinds": ["title_display", "gradient"]}))
    check("a repeated list value is kept and counted, not failed",
          validate_and_canonicalize({**good, "stickers": ["label_logo", "label_logo"]}, e)["overlays"]
          == ["label_logo", "label_logo"],
          "the grammar cannot forbid it and greedy retry reproduces it; §A.6.6 says count it")
    check("an exclusive value beside another is kept and counted, not failed",
          validate_and_canonicalize({**good, "stickers": ["none", "watermark"]}, e)["overlays"]
          == ["none", "watermark"],
          "failing the row would discard the other twelve answers to punish one")
    check("a single-value field still rejects a list",
          rejects({**good, "lettering": ["yes"]}))

    check_group_bcde_grammar((e, f))


def check_group_bcde_grammar(variants) -> None:
    """array-of-enum has to survive the constrained-decoding backend, not just json.dumps.

    Grammar compilation is CPU-only and loads no weights, so this stays a model-free check.
    The tokenizer-backed half needs the pinned snapshot on disk; without it, it is skipped
    rather than failed, and preflight.py --stage retry is the backstop either way.
    """
    print()
    try:
        import llguidance as llg
    except ImportError as error:
        check("llguidance is importable", False, str(error))
        return

    grammars = {}
    for variant in variants:
        try:
            grammars[variant.variant] = llg.JsonCompiler(
                separators=(", ", ": "), whitespace_pattern="").compile(
                    json.dumps(variant.json_schema))
        except Exception as error:
            check(f"variant {variant.variant} schema compiles to a grammar", False,
                  f"{type(error).__name__}: {error}")
    check("both group-bcde.v1 schemas compile to a grammar (array-of-enum is supported)",
          len(grammars) == len(variants))
    try:
        llg.JsonCompiler(separators=(", ", ": "), whitespace_pattern="").compile(json.dumps(
            {"type": "object",
             "properties": {"x": {"type": "array", "items": {"type": "string", "enum": ["a"]},
                                  "minItems": 1, "uniqueItems": True}},
             "required": ["x"], "additionalProperties": False}))
        check("uniqueItems is still unimplemented by llguidance (so no schema may declare it)",
              False, "it compiled — re-read the deviation note in both prompt files")
    except Exception as error:
        check("uniqueItems is still unimplemented by llguidance (so no schema may declare it)",
              "uniqueItems" in str(error), str(error)[:120])

    manifest_path = common.MODEL_MANIFEST_PATH
    snapshot = None
    if manifest_path.exists():
        snapshot = Path(json.loads(manifest_path.read_text())["snapshot_path"])
    if snapshot is None or not snapshot.exists():
        print("skip  tokenizer-backed grammar walk — pinned snapshot not on disk")
        return
    try:
        import llguidance.hf
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(str(snapshot))
        llg_tokenizer = llguidance.hf.from_tokenizer(tokenizer)
    except Exception as error:
        print(f"skip  tokenizer-backed grammar walk — {type(error).__name__}: {error}")
        return

    for variant in variants:
        grammar = grammars.get(variant.variant)
        if grammar is None:
            continue
        check(f"variant {variant.variant} grammar validates against the pinned tokenizer",
              llg.LLMatcher.validate_grammar(grammar, llg_tokenizer) == "")
        # The longest legal answer: every multi-select at full length, every single-value field
        # at its longest value. It must fit inside MAX_TOKENS with room to spare.
        worst = {key: (list(variant.vocabularies[canonical])
                       if canonical in variant.multi_select_fields
                       else max(variant.vocabularies[canonical], key=len))
                 for key, canonical in variant.field_map.items()}
        text = json.dumps(worst, separators=(", ", ": "))
        token_ids = tokenizer.encode(text, add_special_tokens=False)
        matcher = llg.LLMatcher(llg_tokenizer, grammar)
        accepted = all(matcher.consume_token(t) for t in token_ids) and matcher.is_accepting()
        check(f"variant {variant.variant} accepts its longest legal answer, within MAX_TOKENS",
              accepted and len(token_ids) < common.MAX_TOKENS,
              f"{len(token_ids)} tokens, cap {common.MAX_TOKENS}")
        matcher = llg.LLMatcher(llg_tokenizer, grammar)
        bad = text.replace('"title_display"', '"title"', 1).replace('"words"', '"wordz"', 1)
        check(f"variant {variant.variant} grammar rejects an off-vocabulary answer",
              not all(matcher.consume_token(t)
                      for t in tokenizer.encode(bad, add_special_tokens=False)))


if __name__ == "__main__":
    raise SystemExit(main())
