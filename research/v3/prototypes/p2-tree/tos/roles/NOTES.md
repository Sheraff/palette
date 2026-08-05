# P2 / `tos/roles` — the cycle-2 role stage

**Worker F, 2026-08-04.** Requirements list: `../../review-rounds/round-1-tree-families/OUTCOME.md`,
which is reviewer evidence and not a wish list. Three of its five cycle-2 obligations land here; the
other two (phantom gradient / laminarity calibration, and the dither falsifier) belong to siblings.

## What is here

| file | what it is |
|---|---|
| `text.ts` | arm-b §2.4's text detector, tree-adapted: stroke width from the ridge, grouping by the geometric conjunction |
| `rank.ts` | minimum raw APCA over the whole rendered field, and the ordering it induces |
| `assemble.ts` | the twin matrix, the walk that enforces it, the published-palette twin audit, and the role-swap check |
| `constants.ts` | every number cycle 2 adds, with its tag |
| `tests/` | the two acceptance cases, the demo-20 twin sweep, a synthetic glyph fixture, the double-run |

`pipeline.ts` and `candidate.ts` are wired to these; nothing else changed.

## Obligation 1 — foreground readability

Two mechanisms, in this order.

**The text detector leads.** The foreground's first candidates are the representatives of the
text-shaped groups, ranked by total coherent area (arm-b §2.6) with readability as the tie-break. On
`…d859a69094` the reviewer's ruling is *"black is the artwork's text → fg should be black"*; cycle 1
published `#939393` and cycle 2 publishes `#070506`.

**The chain collapse is what made the graft possible, and it is the most consequential change in this
cycle.** The tree of shapes names one glyph once per quantised L level: on that cover a single letter
of the title is twenty retained nodes, and the sixty-four largest marks are all slices of one grey
swoosh with no glyph among them. `COMPONENT_CHAIN_AREA_AGREEMENT` keeps only the deepest node of each
such chain — 512 marks become 95 components, and the title's letters are nine of them at their
near-black exact triples. The rule is **local to the role stage**: `stability.retained`, which the
dump publishes and the falsifier and the verifier read, is untouched.

**Everything else is ranked by contrast.** `minFieldContrast` is the minimum |raw pre-clamp APCA| of a
candidate against `background`, against `surface`, and — when a gradient is published — over the whole
OKLab interpolation between them, via the contract's own `minRawContrastOverRamp` at its own default
sampling. That is the function invariant 4 calls. **It is a ranking and not a gate**: no threshold
appears anywhere in `rank.ts`, the contract's floors stay where the constraint sheet puts them, and
what this chooses is the most readable of the artwork's *own* candidates.

Measured over demo-20: 17 of 20 covers yield at least one text group, and the foreground is the
leading group's colour on 13 of 20. The other 7 either found no type or had their leading group
refused by the contract, and fell through to the contrast ranking — which is the intended degradation.

## Obligation 2 — twins must collapse

The forbidden outcome as a matrix over the six role pairs (`assemble.ts` carries the table). Two pairs
have a sanctioned collapse and take it; the other four are re-resolved down the same ranking, and
every step is re-validated against the whole contract, so a repair cannot relocate the defect.

The hole cycle 1 had was not subtle: on exhaustion it published its first choice anyway, and that path
is *reachable by construction* whenever the defect is in the field pair — no choice of foreground
repairs a `surface` sitting inside `background`'s bar, so the walk exhausted on every candidate and
shipped the twin with a clean face. The field-pair collapse now happens in `parseTree`, before the
pools are ranked, so the ranking is against the field that will actually be published.

`forbiddenTwinPairs()` audits a *finished* palette, so the test asserts the property of the artefact
rather than trusting the code that produced it. Demo-20: 0 forbidden pairs, 0 contract violations.

## Folded in mid-cycle (peer amendment, released campaign evidence)

1. **The accent joins the APCA ranking.** The accent order is now `minFieldContrast` descending —
   the same measurement over the same rendered field, since the reviewer grades the accent against
   both field roles. arm-b′ §2.6's chroma-from-field and lightness-movement survive as **tie-breaks**
   rather than as the primary key. **This is a real trade and it is recorded as one:** obligation 4 of
   the round ("vivid accents must be mined", `…35b967964d`'s missed red-orange) is *not* helped by
   this change and may be hurt by it, because the most readable mark on a light field is usually the
   darkest one and not the most saturated one. The chromatic lanes are a sibling's work; when they
   land, whether readability or chroma should lead the accent is a question for a review round, not
   for either worker.
2. **The role-swap check.** After assembly, if each settled colour ranks strictly better in the
   *other* role's ordering, publish the swap — re-validated, strict on both sides, zero constants.
   **Measured: a no-op on all twenty covers**, and `tests/acceptance.test.ts` records that as the
   assertion. The reason is structural: the foreground ranking leads with text groups and the accent
   ranking does not, so a strictly-better swap needs the settled accent to sit ahead of the settled
   foreground in the foreground's own ranking — which only happens for a candidate the foreground walk
   skipped, and a skipped candidate is one the contract refused. It is cheap insurance against an
   inversion this pipeline does not currently make.

## Constants added

| name | value | tag |
|---|---|---|
| `COMPONENT_CHAIN_AREA_AGREEMENT` | 0.8 | **`[UNCALIBRATED]`** |
| `TEXT_COMPONENT_LIMIT` | 512 | **`[UNCALIBRATED]`** (cost guard) |
| `TEXT_MIN_COMPONENTS` | 4 | `[INHERITED]` (arm-b §2.4 verbatim) |
| `STROKE_WIDTH_RIDGE_FACTOR` | 2 | `[INHERITED]` (arm-b §2.4 verbatim) |
| `TEXT_STROKE_WIDTH_CV` | 0.4 | **`[UNCALIBRATED]`** |
| `TEXT_HEIGHT_CV` | 0.35 | **`[UNCALIBRATED]`** |
| `TEXT_COLLINEARITY_CUT` | 0.15 | **`[UNCALIBRATED]`** |
| `TEXT_ROW_CENTROID_TOLERANCE` | 0.5 | **`[UNCALIBRATED]`** |

The APCA ranking and the twin matrix add **no** constants: both consume the contract's own
(`minRawContrastOverRamp`, `sameColorBar`, `FOREGROUND_ACCENT_SEPARATION_DISTANCE`).

## Cuts and known weaknesses, stated before anyone measures them

- **Elongation from second moments is not implemented.** arm-b §2.4 lists it among the per-component
  attributes; nothing downstream reads it this cycle and a computed-but-unused attribute is a claim the
  code does not make. Recorded here rather than left silently missing.
- **Mixed-case type is a false negative.** `TEXT_HEIGHT_CV` at 0.35 admits a line of capitals and
  refuses a line with descenders. Deliberate: arm-b's own framing is that *"its recall is mediocre and
  that is fine"*, and a false negative costs the foreground its first candidate and nothing else.
- **Non-text mark *groups* are not typed.** arm-b §2.4 also types `subject`, accent carriers and
  overlays; here everything that is not text is one undifferentiated pool ordered by contrast.
- **`COMPONENT_CHAIN_AREA_AGREEMENT` has no evidence behind it.** It has to be below 1 and above the
  ratio at which a genuinely nested different region is swallowed by its container. A round sweeping it
  against text recall is the obvious next measurement, and it is the number most likely to move.
- **Cost, and it is the loudest number in this file.** ~700 ms per 300×300 cover against cycle 1's
  ~180 ms, and **5.7 s per palette averaged over the robustness corpus** (3,409 s in-candidate over 600
  trials), whose covers are larger. Almost all of it is the ramp minimisations:
  `RAMP_SAMPLES_PER_SEGMENT` + `RAMP_REFINEMENT_SAMPLES` ≈ 6,100 APCA evaluations per *candidate*, and
  a busy cover offers a hundred candidates. Scores are memoised per exact triple across both rankings;
  nothing else has been optimised. Using a coarser sampling for a *ranking* was rejected because it
  would put a second contrast policy beside the contract's — but truncating the candidate set before
  scoring would not, and that is where a cost round should look first.

## Robustness, this cycle against cycle 1

Same harness, same sets, `--bar-mode regional`, 600 trials, 0 errored.

| | cycle 1 | cycle 2 |
|---|---|---|
| overall | 12.0% [9.6–14.8] | **14.7% [12.1–17.7]** |
| jpeg-q92 | 12.0% | 21.0% [14.2–30.0] |
| jpeg-q85 | — | 11.0% [6.3–18.6] |
| jpeg-q75 | — | 11.0% [6.3–18.6] |
| rendition-pair | — | 6.0% [3.5–10.2] |
| dither-lsb1 (pre-reg line >10%) | 34.0% — fired | 33.0% — **still fired** |

Overall did not regress; the intervals overlap heavily and nothing here is a claim that the role stage
*improved* stability. **The dither falsifier is still fired at 33.0%** and this cycle did not move it,
which is the expected result: the pre-registered suspect is the shared representative rule and the
small-node churn, both of which are upstream of everything in this directory and belong to the
sibling diagnosing them.

Role instability is the number to read next to the reviewer's evidence: `foreground` moved on 69.2% of
comparisons and `accent` on 65.8%, against `background` 28.8% and `surface` 32.5%. The mark roles are
where this pipeline is unstable, and the chain collapse — which decides *which level of a glyph chain
is the component* — is a new place for a one-LSB perturbation to change the answer. That is a
hypothesis this cycle produced and did not test.

---

## Superseded by the integration pass (worker H, 2026-08-05) — appended, not edited away

Three statements above are **no longer true of the code**, and the reason each changed is a ruling, not
a preference. The full account is `../integration-NOTES.md`; this is the index.

1. **"The accent joins the APCA ranking"** (§*Folded in mid-cycle*, item 1) is **reversed**.
   `DECISIONS.md` D1 ruled at the W-E/W-F fan-in that chroma-from-field leads the accent and lightness
   movement is the tie-break, because that order matches the reviewer's only direct quote about a
   specific accent on a specific cover (`…35b967964d`'s missed vivid coral) and readability keeps its
   guard through the contract's own machinery. The measurement itself is kept: `minFieldContrast` is
   computed for every accent candidate and published in `Parse.accentCandidates` and in the node dump,
   so the round that prices the exchange rate has the numbers. This worker's own note — *"whether
   readability or chroma should lead the accent is a question for a review round, not for either
   worker"* — is exactly what happened.

2. **"`pipeline.ts` and `candidate.ts` are wired to these; nothing else changed"** understates what the
   role stage now reads. Its component population is the **three lanes'** retained marks, chain-collapsed
   per lane (D2), so the text detector and the foreground ranking see isoluminant type. Every geometric
   test in `text.ts` is unchanged and lane-agnostic by construction; the colour clause is still the one
   bar. Measured on demo-20 after the merge: **19 of 20** covers yield at least one text group (was 17)
   and the foreground is the leading group's colour on **16 of 20** (was 13).

3. **The foreground ranking has a level in front of it.** D3 (*salience gates identity*) puts an MSER-
   growth eligibility level ahead of `minFieldContrast`, so an incidental low-stability node cannot lead
   the foreground. Text groups and residual colours are exempt, and the split is the pool's own median
   rather than a new constant. The accent measures the level and does **not** rank on it — that is a
   stated deviation from the integration brief, with its evidence and the calibration it owes written
   down in `../integration-NOTES.md` §5.

The cost figure in *Cuts and known weaknesses* (~700 ms per 300 × 300 cover, 5.7 s per palette on the
robustness corpus) is also superseded; the merged numbers are in `../integration-NOTES.md` §9.
