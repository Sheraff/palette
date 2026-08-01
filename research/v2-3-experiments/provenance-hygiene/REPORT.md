# Provenance hygiene sweep — 2026-08-01

Comment-only truth pass over the pinned configuration (`research/v2-3/test/configuration.test.ts`)
and its citation trail, triggered by the evidence-audit adversarial review
(`research/v2-3-experiments/adversarial-evidence/REVIEW.md` §2.3, branch
`worktree-agent-ac1274da01d885d69` @ `4d521b5`). Zero behaviour change, proven mechanically: the
non-comment diff under `research/v2-3/{src,test}` is empty; tsc clean; architecture + configuration
10/10; parity 39/39 on the shared corpus.

## What changed

- The file's false header claim ("every value here was derived by a measured experiment and
  confirmed by human review") is replaced by per-pin provenance tags:
  `[REVIEWED]` / `[MEASURED]` / `[n=1]` / `[INHERITED]` / `[UNCALIBRATED]` / `[HELD]`.
- Records cited by pins but living only on unpushed agent branches are imported docs-only, each
  with an `IMPORTED.md` naming branch + commit: `track-x/EXPERIMENT.md` (`b37cb14`),
  `carrier-ranking/{EXPERIMENT,ROUND-2,ROUND-3,ROUND-4}.md` (`44dfd74`), `track-q/EXPERIMENT.md`
  (`7f3adc5`). Note in each: those arms shipped their mechanism OFF in their own records because
  they deferred to review — batches 26 and 30 supplied the enabling call; without that note the
  imported records read as contradicting the trunk they justify.

## Per-pin disposition (flagged pins)

| pin | old claim | finding | new tag |
|---|---|---|---|
| `qualityWeights.fieldFidelity = 0.15` | "Track A round 4 … 0.45 holds every reviewed win" | Misattribution: that sentence describes `FIELD_OWNERSHIP.collapsedSurfaceFidelity = 0.45`. 0.15 is a bare literal from `3d3cea2`, one of eleven weights summing to 1; `track-p/LEDGER.md:194-203` and `AGENDA.md:181-186` had flagged it and it was never fixed | `[INHERITED]` |
| `maximumQualityLoss = 0.12` | implied reviewed | No measurement in full history; `PLAN_V2.md:420`'s "the existing 0.12" landed in the commit that created it. Both facts on record are cautionary (3–6× headroom; the one time it bound it excluded `birdsofprey`'s reviewed-strong pink by 0.0016) | `[INHERITED]` |
| `mark.minimumComponentCount = 3` | reviewed | One half-clause at `track-e/EXPERIMENT.md:76`; no sweep, no ablation; Track N's later mention validates 8, not 3 | `[n=1]` |
| `mark.minimumComponentPopulation = 12` | reviewed | Track E disowns it; Track W measured the floor's *form* (absolute vs scale-relative), not its magnitude | `[INHERITED]` |
| `TRANSITION_PROMOTION_ORDER = "coverage-first"` | (no comment, in a file claiming "reviewed") | Review contradicted it per its own doc; retained because the measured alternative lands on a third accent and fails too | `[HELD]` |
| `GAMUT_COVERAGE.saturation = 0.75` | reviewed with the batch-26 operating point | Track X: "the one number here I cannot derive" | `[UNCALIBRATED]` |
| two pins reasoning from `0cd48f` | pre-batch-27 state | RECENCY CORRECTION added: batch-27 graded both teals strong; batch-28 graded `#a7dbd9` STRONG over the trunk navy. The measurements stand; the arguments built on them don't | (corrected) |

Verified-correct pins: `BAND_TIE_BREAK` (best-evidenced in the file), `identityChromaticSeparation`,
`authorizedIdentity`, `PROMOTION_ENVELOPE` (`[n=1]`, never batch-adjudicated), `contrast.hardMinimum`
(charter rule 2); `knuckles` fg/bg ΔE recomputed = 9.188, confirming the pinned 9.19 bound. Seven
previously-uncommented pins traced to inherited v2-2 values and tagged `[INHERITED]`;
`bounds.identityObligations = 4` is a revert to the inherited value, not a finding.

Further defects repaired beyond the reviewer's list: the "six midpoint judgements" arithmetic
(seven are enumerated) in three places; `palette-core.ts` citing the wrong round doc for the
`FOREGROUND_CONTRAST_SCALE` sweep.

## Value-level concerns (report only — nothing acted on)

1. `maximumQualityLoss = 0.12` is load-bearing and unevidenced; top calibration candidate.
2. All eleven `BASE_QUALITY_WEIGHTS` are underived; the off-trunk tier-B perturbation measurement
   (`worktree-agent-a9652f5642a9e2b25`) is the natural import when the sweep completes.
3. `FIELD_OWNERSHIP.collapsedSurfaceFidelity = 0.45` — the algorithm's most expensively-found
   constant — was pinned nowhere. **Addressed post-sweep by the orchestrator: pin added** (see
   configuration.test.ts, `[MEASURED]`, Track A round 4).
4. `0cd48f` carries an unpaid verdict-mandated debt (teal foreground, batches 27–28).
5. `track-a/EXPERIMENT.md:388` reads as current but is superseded (`johns` latest verdict is strong
   on the `#315a92` surface).
6. `bounds.identityObligations = 4` is one-sided (3 and 5 never tried); saturated on all 31
   non-degenerate artworks.
7. The seven midpoint anchors have no experiment record; bar documented over-strict by one case
   (ΔE 2.58 on a preferred output).
8. Pin coverage is thin: ~20 of ~908 constants; six sibling `mark.*` thresholds equally unanchored.
