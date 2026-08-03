# `opus-eval142.jsonl` — provenance

**Status: NOT A BAKE-OFF ARM. Directional probe, reproducible scoring, un-reproducible generation.**
Quotable with the qualifier below; never to be listed in the arms table, `scores.json`, or any
sentence of the form "arm X scored Y".

Written 2026-08-03 to answer the adversarial review's finding
(`research/v3/reviews/phase-0-adversarial/docs-drift.md` §3.13): this file sat unlabelled beside the
real arms' outputs, with nothing marking it non-quotable. Everything below is established from the
file, from `git`, and from the two ground-truth artifacts already in the repo; the sections marked
INFERRED and UNKNOWN say exactly where the record stops.

## What it is

142 rows, schema `{path, answer, confidence}` — three columns, against the 43 the real arms carry.
No `arm`, `model_id`, `run_id`, `prompt_hash`, `prompt_variant`, `item_set`, `raw_text` or
`is_canary`. `path` values are **absolute paths on the author's machine**, not repo-relative.

| field | distribution |
| --- | --- |
| `answer` | `shaded_field` 38 · `multiple_distinct_fields` 33 · `flat_field` 32 · `full_scene` 32 · `pattern_or_texture` 7 |
| `confidence` | `medium` 83 · `high` 40 · `low` 19 |

All five `answer` values are in the frozen `ground_type` vocabulary the arms use — no
`none_discernible`, no `underdetermined` — so it is scored through the same `GRADIENT_MAP` in
`research/v3/oracle/premise/analyze.py`.

## Item set — eval-142, minus one, plus a duplicate

The paths are the `included: true` entries of `research/v3/data/oracle-premise/eval-set.json`
(144 entries, 142 included). Measured overlap by artwork stem: **141 of 142**.

Two defects, both confirmed:

- **One path does not exist on disk:** `…/08/ab67616d00001e02000e007955ee2f8b29f5b2b4`. The same
  basename lives under `0e/`, and that `0e/` path is *also* in the file, answered separately —
  the same artwork answered twice (`shaded_field`/`medium` and `shaded_field`/`low`). A
  mis-sharded duplicate.
- **One genuine eval-142 item is therefore absent:**
  `ab67616d0000b27300081dec93652e6af2582192`. It exists on disk, is in the eval set, and *is*
  covered by the qwen arm.

So the file covers 141 distinct artworks in 142 rows. Any join against it must de-duplicate on
artwork stem and must not assume 142 items.

## Git provenance — the whole record

```
b907bcc406f1d1bc9312aa6dfa18c2132214ee61  2026-08-03 12:55:29 +0200  Sheraff
research/v3: Opus blind probe extended to full 142 — [n=1] flag retired
```

Single-file commit, 142 insertions, nothing else in it. `git log --follow --all` shows exactly one
commit for the path: added, never modified. The commit body is the only prose provenance that
exists:

> Three parallel blind agents, corrected-criterion prompt. vs reviewer gold-30: 60% exact (up from
> 50%, still below local Qwen3-32B-dense's 63%); vs accepted flags: 69.6% binary on mapped; 28%
> unmapped despite the precedence instruction in-prompt — the escape-hatch leak is not fully
> promptable-away. Frontier capacity does not dominate the task; bulk-model race is incumbent vs
> 32B-dense.

## What produced it — nothing in the repo

Established negatives, all re-checkable:

- `grep -rl "opus-eval142\|opus-probe"` over `research/v3` `*.ts|*.py|*.sh`: **zero hits**. The only
  other mention of the filename anywhere is the review finding itself.
- The bake-off toolchain (`oracle/bakeoff/{run_bakeoff,score,bakeoff_common,config}.py`) never
  mentions opus and writes the 43-column schema, not this one.
- The three `run.*.log` files here contain zero occurrences of "opus".
- `scores.json` and `scores.txt` contain **zero** occurrences of "opus"; the ARMS table lists only
  `qwen3-30b-a3b`, `qwen3-32b-dense`, `gemma3-27b`. No `model-manifest.*.json` and no
  `arm-verification.*.json` exists for it.

**INFERRED** (from the commit subject, not from any recorded field): answered by Claude Opus, three
parallel subagents reading pixels in context, hand-serialised to JSONL. The mis-sharded duplicate is
consistent with hand transcription rather than script output.

**INFERRED, weaker:** the "corrected-criterion prompt" is the group-a v2 variant C/D wording that
landed in `dc8ece2` (2026-08-03 10:04:14 +0200, 2h51m earlier); `oracle/premise/CD_RESULT.md` uses
the same phrase. No `prompt_file_sha256` was recorded, so this is **not verifiable**.

**UNKNOWN, and unrecoverable from the repo:** exact model id/snapshot, sampling parameters, the image
tier and resize actually shown to the model, which of the three agents answered which item, whether
any canary or repeat-consistency check was run, and whether a `reason` field was elicited and dropped
(its predecessor has one; this file does not).

## Why it is still worth keeping

Every headline number in the commit message **recomputes exactly** from this file plus
`data/oracle-premise/eval-set.json` (`groundTruth.gradient`) and
`data/oracle-validation/premise-disambiguation-1-analysis.json` (`perArtwork.reviewerGroundType`),
under `analyze.py`'s `GRADIENT_MAP`:

| claim in `b907bcc` | recomputed | |
| --- | --- | --- |
| 60% exact vs reviewer gold-30 | 18/30 = 60.0% | matches |
| 69.6% binary on mapped, vs accepted flags | 71/102 = 69.6% | matches |
| 28% unmapped | 39/141 = 27.7% | matches |

So it is **reproducible as scored** while remaining **un-reproducible as generated**. It shares 141
items and the same ground truth with `qwen3-32b-dense.jsonl` (which covers all 142 across its
`eval142` + `gold30` item sets), so an opus-vs-qwen comparison on those 141 is legitimate.
`gemma3-27b.jsonl` is **gold30-only**, so opus-vs-gemma is comparable on 30 items only. The arms
record two prompt variants per item; this file records one answer per item with no variant label, so
no inter-variant statistic can be computed for it.

## The qualifier that must travel with any citation

1. It is a probe, not an arm: no recorded model id, prompt, or run conditions, and no canary or
   parse-failure accounting.
2. It inherits eval-142's own caveat. `eval-set.json` `meta.groundTruthEpistemology` states the
   ground truth is **an accepted algorithm decision, not an elicited human label**.
3. It inherits eval-142's corpus caveat. `data/coverage-set/COVERAGE_SET.md` records eval-142 as an
   inherited v2-era bench — 25 of 142 outside the embedded corpus, cluster-mix distance 0.2273
   against the coverage core's 0.0851 — and concludes it "cannot support any sentence of the form
   'on the corpus, the instrument does X'." Per `d-2026-08-03-coverage-set-canonical-bench`,
   eval-142 is retained **only** for truth-anchored comparisons against its existing labels.

## Relationship to `opus-probe-1.jsonl`

`research/v3/data/oracle-validation/opus-probe-1.jsonl` is the predecessor: 30 rows, schema
`{path, answer, confidence, reason}`, added by `6c25dde` (2026-08-03 09:42:54 +0200), never
modified. `oracle/premise/PREMISE_NEXT.md` flags it `[n=1, UNCALIBRATED]` — "no prompt file, no
script and no provenance… must not be quoted as a measurement".

Its 30 paths are a strict subset of both eval-142 and of this file's paths (30/30). The two runs sit
3h13m apart, on either side of the corrected-criterion prompt commit. Opus's answers changed on
**10 of the 30** between them (20/30 identical), so **they are not independent samples and must not
be pooled** — the later run supersedes the earlier on those 30 items.

Recomputed for the predecessor: 15/30 exact vs reviewer (the "50%" the later commit improved on),
14/20 binary vs reviewer, 10/22 vs accepted flag, 8/30 unmapped.

## Recommended disposition

This file is **not orphaned** — it is joinable, scored-reproducibly, and it funds a real conclusion
("frontier capacity does not dominate this task"). It should not be deleted or quarantined. What it
should get, if anyone runs Opus on this bench again:

1. Regenerate through a committed script that writes the arm schema, with `model_id`,
   `prompt_file_sha256` and `run_id` — at which point this file becomes history.
2. Fix the mis-sharded path (`08/` → `0e/`) and add the missing item, **in a new file**; this one is
   cited evidence and should not be edited in place.
3. Until then, treat the 141-artwork coverage and the two defects above as part of the measurement.
