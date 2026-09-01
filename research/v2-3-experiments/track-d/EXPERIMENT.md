# Track D — Field-topology availability

Target failure class: the only discovery-stage failure left in the Phase 3 final showcase
postmortem — `loups`, "field / topology availability", 1 of 34 cases. Everything else in
that audit was ranking.

Branch: `worktree-agent-a88c1728c048702b4` (worktree of `research/palette-0.9-checkpoint`,
based on `c9395ac` "Scaffold v2-3 development line").

## Diagnosis (before designing anything)

The postmortem said `loups` produced "zero transition traces and zero fit evaluations".
`research/v2-3-experiments/track-d/probe.ts` on the baseline shows exactly why:

```
=== loups.jpg 500x500 families=31
field lane (12): ... field-lane total population fraction = 88.53%
  field-domain-16  kind=connected  pop=85.58%  border=0.637  quad=1  corners=1  wfs=0.620
                   families=12  eligible=false  "field domain owns fewer than two native corner fields"
gradient fits: 0, accepted: 0
```

The diffuse field **does** flood-fill into a single 85.58% connected domain spanning all
four quadrants with 0.637 border coverage and weighted field score 0.620. It is rejected by
exactly one gate: `ownedCornerCount >= 2`. It owns one corner.

`probe-corners.ts` explains the corner failure precisely:

```
field-domain-16 pop=85.58% corners=[65.4%, 9.8%, 9.7%, 40.6%] owned=1
  corner 0 outside-domain: family-8581[non-field]=25.8% family-9464[non-field]=6.9%
  corner 1 outside-domain: family-9464[non-field]=35.4% family-8581[non-field]=21.7%
  corner 2 outside-domain: family-8201[non-field]=31.5% family-5598[non-field]=21.6%
  corner 3 outside-domain: family-7319[non-field]=14.0% family-8201[non-field]=13.7%
```

The corners are held by families **outside the ranked field lane**. `bounds.fieldFamilies`
is 12; `loups` has 31 families because a diffuse airbrushed field is shattered by grain,
texture, and the width of its own progression. The fragments that fall below the lane
cut-off are not incidental — they sit at the *extremes* of the progression, which is where
the corners are. So the lane truncation removes precisely the pixels that would have proved
corner ownership, and would also have supplied the gradient's endpoint colours.

This is the mechanism behind the charter's "interior fields that don't own the border/corners
are unproposable": here the field *does* own the corners in the artwork, but not in the
evidence the domain builder is allowed to see.

## Hypotheses

**H-D1 — field-composite domain pass.** Direction (b) from the mission, family agglomeration
for field purposes only. Add a second connected-domain pass whose membership is the ranked
field lane *plus* every family transitively reachable from it across low-contrast adjacencies
that carry at least 75% of that family's total inter-family boundary. Membership is used for
domain flood-fill only; it never enters lane ranking, role assignment, or obligation
selection. The pass is additive: the lane pass runs first and unchanged, paired corridors are
still seeded from lane domains only, and composite domains get a distinct id prefix and
`kind: "diffuse-composite"` so downstream evidence can weigh them as what they are.

Rationale for the admission test: a fragment *of* a continuous field is embedded in it —
almost its entire boundary is a smooth adjacency to the field. A separate object, a stripe,
or a hard region is not, because it meets the field across a step the anchor radius rejects.
The existing per-pixel guard (`okDistance(pixel, neighbour) <= familyAnchorRadius`) is
untouched, so the walk still cannot cross a hard edge even inside an admitted family.

**H-D2 — eligible-lane containment guard.** A composite domain is emitted only if it does
not overlap a domain the lane pass already proposes (i.e. an *eligible* lane domain). The
composite pass exists to rescue fields that are otherwise unproposable, not to enlarge fields
that are already proposed.

## Changes

Single file, `research/v2-3/src/internal/palette-core.ts`:

| What | Where | Hypothesis |
| --- | --- | --- |
| `FIELD_COMPOSITE_EMBEDDED_BOUNDARY_FRACTION = 0.75` | new constant | H-D1 |
| `fieldCompositeFamilyIds(evidence)` — deterministic fixpoint closure, ascii-sorted additions | new function | H-D1 |
| `BackgroundFieldDomainEvidence["kind"]` gains `"diffuse-composite"` | type | H-D1 |
| `buildBackgroundFieldDomains` runs its connected walk as two passes (lane, then composite); composite domains use the `diffuse-field-domain-` id prefix; `connectedDomains` for pair seeding is sliced to the lane pass | refactor | H-D1 |
| `laneProposedAt` mask; a composite region overlapping it (or reproducing a lane domain exactly) is dropped | in the pass loop | H-D2 |

Most of the 169/94 line diff is re-indentation of the existing flood-fill body into the pass
loop. No thresholds, gates, or scores in the existing pipeline were altered.

## Threshold selection

`probe-guards.ts` sweeps the embedding fraction, transitive vs one-hop, over the subset. Top
connected domain per membership rule:

| case | lane-only | 1-hop ≥.90 | transitive ≥.90 | transitive ≥.75 | transitive ≥.50 |
| --- | --- | --- | --- | --- | --- |
| loups | 85.58% c1 **inelig** | 85.61% c1 inelig | 85.61% c1 inelig | **92.88% c3 elig** | 92.92% c3 elig |
| birdsofprey | 14.20% c2 | 14.20% c2 | 14.20% c2 | 15.91% c2 | 22.94% c2 |
| infected | 75.99% c4 | 75.99% c4 | 75.99% c4 | 79.01% c4 | 82.18% c4 |
| muse | 23.56% c1 | 23.56% c1 | 23.56% c1 | 28.81% c0 | 30.16% c0 |
| black / slipknot / knuckles / nada / artofficial / toxicity / orelsan | — | unchanged | unchanged | unchanged or ≤0.06pp | drifts |

Unguarded transitive closure (no embedding test at all) is far too greedy — it admits 145 of
147 families on `birdsofprey` and 55 of 58 on `muse`, dissolving the lane restriction
entirely. `≥0.90` is too strict to rescue `loups`. `≥0.50` starts drifting the controls.
`0.75` transitive is the only setting that rescues the target while leaving the controls
essentially untouched, so that is what is committed.

## Before / after

Baseline = `c9395ac`, which reproduces the frozen review fixtures exactly.

### H-D1 alone (no containment guard)

| case | stratum | before | after |
| --- | --- | --- | --- |
| **loups** | target | `#fdd98d #fdd98d #fd490c #fab14a` flat | `#fa7b34 #ebda8a #fde5d9 #fab14a` **gradient** |
| **infected** | gradient (strong) | `#241a4e #2b439d #49b7f6 #e24852` gradient | `#30388d #2f2959 #49b7f6 #e24852` gradient ⚠ |
| black, slipknot, artofficial, knuckles, nada, toxicity, muse, orelsan, birdsofprey | controls | — | unchanged |

`infected` is a genuine neutrality failure for H-D1 alone: the composite domain grew the
already-eligible 75.99% night-sky domain to 79.01% and ranking then preferred the reversed
polarity (blue → dark purple instead of dark indigo → blue). The postmortem judged `infected`
strong. This is what motivated H-D2.

### H-D1 + H-D2 (committed)

| case | stratum | before | after |
| --- | --- | --- | --- |
| **loups** | target (missing gradient) | `#fdd98d #fdd98d #fd490c #fab14a` flat, no midpoint | `#fa7b34 #ebda8a #fde5d9 #fab14a` **gradient**, no midpoint |
| black | 2-colour collapse | `#000000 #000000 #575757 #575757` flat | identical |
| slipknot | 2-colour collapse | `#000000 #000000 #fbfbfd #fbfbfd` flat | identical |
| artofficial | 4-colour flat | `#31305c #040325 #bdc1ca #fded9f` flat | identical |
| knuckles | 4-colour flat | `#bfb2c4 #9c99c4 #6c678f #d8cbdd` flat | identical |
| nada | 4-colour flat | `#44648b #919dcd #fbfcf7 #100d28` flat | identical |
| toxicity | 4-colour flat | `#b59e8e #805a33 #edebd2 #dd1434` flat | identical |
| muse | gradient (correct) | `#000000 #026faa #edf6fb #82d1ef` gradient | identical |
| orelsan | gradient (correct) | `#293949 #0c1222 #e9dec8 #6c5f57` gradient | identical |
| infected | gradient (correct) | `#241a4e #2b439d #49b7f6 #e24852` gradient | identical |
| birdsofprey | gradient (correct) | `#141975 #3fa72a #030102 #d02981` gradient, mid `#1880a7` | identical |

`sweep-corpus.ts` extends this to all 34 review fixtures: **1 of 34 changed — `loups`.**
Every other artwork, including the nine other below-acceptable cases, is byte-identical.

## Did new hypotheses actually appear? (instrumented)

`sweep-instrument.ts` counts, per artwork, composite domains emitted, composite domains that
pass the *unchanged* eligibility gates, and gradient hypotheses in the retained slate that
originate from a composite domain:

| | cases |
| --- | --- |
| ≥1 composite domain emitted | 18 of 34 |
| ≥1 **eligible** composite domain | **1 of 34** (`loups`) |
| ≥1 slate hypothesis from a composite domain | **1 of 34** (`loups`, 13 of 13 gradient hypotheses) |

So the mechanism does not flood the pipeline: on 33 of 34 artworks the composite domains that
survive the containment guard are small fragments that never clear population / corner /
field-score, contribute zero hypotheses, and exert zero ranking pressure. Only the diffuse
field gets through.

On `loups` the discovery stage goes from **0 fits / 0 gradient hypotheses** to **24 fits, 13
accepted, 13 gradient hypotheses**, top fidelity 0.983:

```
diffuse-field-domain-0 kind=diffuse-composite pop=92.88% border=0.782 quad=1 corners=3
                       wfs=0.600 families=16 eligible=true
gradient:diffuse-field-domain-0:linear:vertical:family-7363:family-9924:#fa7b34:#ebda8a fidelity=0.983
```

This is a **full** success, not the partial one the mission anticipated: ranking selected the
new hypothesis without any ranking-side change. Track A's work is not required to realise it
(though it may still change which of the 13 wins).

## Representativity and determinism

- Endpoints are `dense-exact` exemplar pixels selected inside the endpoint bands and backed by
  the family's existing `SourceSupportRecord` (`endpointBandRepresentatives` refuses any family
  whose representatives lack a non-generated support record). No bare pixels, no synthesis. The
  composite only changes *which* families are walkable, never how a colour is justified.
- `fieldCompositeFamilyIds` is a fixpoint over ascii-sorted additions — order-independent by
  construction. Determinism verified by running `loups` and `infected` twice: identical output.
- `node_modules/.bin/tsc -p research/v2-3/tsconfig.json` — clean.
- `research/v2-3/test/architecture.test.ts` — 2/2 pass (imports still closed; no case IDs,
  fixture paths, hashes, or expected colours in runtime code).
- `research/v2-3/test/parity.test.ts` is expected to fail on `loups` only. Not run repeatedly
  per charter; `sweep-corpus.ts` covers the same 34 fixtures with a per-case diff.
- Runtime cost: a second flood fill. `loups` 1.3s → 2.2s; corpus max ~6s. Within charter
  tolerance (accuracy over speed).

## Honest assessment

What I am confident about:

- The diagnosis is exact and was measured, not inferred: `loups` failed on one gate,
  `ownedCornerCount >= 2`, because lane truncation hid the corner-holding fragments of its own
  field. This also predicts the failure will recur on any artwork whose field fragments past 12
  families, which is a structural property, not a property of this image.
- Neutrality is as strong as I can make it at the discovery stage: 33 of 34 fixtures byte-identical,
  and on 33 of 34 the mechanism provably contributes zero hypotheses, so there is nothing for
  ranking to prefer.

What I am not confident about, and what review must settle:

1. **Is the new `loups` winner actually right?** Discovery availability is proven; semantic
   correctness is not. The reviewer asked for gradients and fuller identity; the winner is now
   an orange→cream gradient with both of the artwork's dominant field colours present, against
   a collapsed single cream before. I believe it is better on both tagged issues, but I did not
   judge it.
2. **The accent has a zero-contrast crossing.** APCA across the five gradient sample positions:
   foreground `#fde5d9` = −42.0 / −34.3 / −26.2 / −17.4 / −8.4 (single sign, clean); accent
   `#fab14a` = −16.6 / −8.9 / **0.00** / **0.00** / +12.2 — a sign flip, i.e. the accent
   disappears in the middle of the gradient. Policy only requires one observable sample for a
   distinct accent, so this passes the gate legally, but the charter names sign flips a defect.
   This is not introduced by my mechanism (the same accent `#fab14a` was already the winner's
   accent when the background was flat) — it is exposed by the background now being a gradient.
   It belongs to accent selection against a gradient path, i.e. Track A / ranking territory.
   Flagging it, not fixing it.
3. **H-D2 may be over-conservative.** It suppresses composite rescue wherever the lane pass
   already proposes *any* eligible field, even a small one inside a much larger diffuse field.
   The `infected` H-D1-only result is the evidence: without the guard, the enlarged domain won
   with the opposite polarity. I assumed the postmortem's `strong` verdict means the original
   polarity is right, and guarded accordingly — but nobody has actually compared the two.
   Review item 2 below settles whether the guard is correct or merely convenient.
4. **`0.75` is fitted to a 34-artwork set, 11 of which I looked at closely.** It is a
   principled quantity (fraction of a family's boundary that is smooth adjacency to the field),
   but the specific value is a threshold chosen on the same corpus the postmortem warns is
   overfit. It should be re-checked on the widened corpus before integration.
5. **Only one artwork in the corpus exercises the mechanism.** n=1 for the positive case. The
   postmortem counts field-topology availability as 1 of 34 failures, so this is expected, but
   it means the true positive rate is unmeasured.

## Proposed human review batch (6 items)

| # | Case | Ask |
| --- | --- | --- |
| 1 | `loups.jpg` — new winner `#fa7b34 #ebda8a #fde5d9 #fab14a` gradient, vs old `#fdd98d #fdd98d #fd490c #fab14a` flat | Does the gradient now represent the artwork? Are the endpoint colours the right two field colours? |
| 2 | `loups.jpg` — accent `#fab14a` against the new gradient | The accent crosses zero contrast mid-path. Acceptable as artwork-faithful, or a defect that should force a different accent? |
| 3 | `infected.jpg` — H-D1-only variant `#30388d #2f2959 #49b7f6 #e24852` vs committed `#241a4e #2b439d #49b7f6 #e24852` | Which gradient polarity is right? Decides whether the H-D2 containment guard stays or is replaced by an evidence-weighted comparison. |
| 4 | `muse.jpg` — unchanged | Composite pass fires and is suppressed here. Confirm the current gradient is still the right one (neutrality control, gradient stratum). |
| 5 | `birdsofprey.jpg` — unchanged | Same, with a source-supported midpoint (neutrality control, gradient + midpoint stratum). |
| 6 | `slipknot.jpg` and `toxicity.jpg` — unchanged | Neutrality controls for 2-colour collapse and 4-colour flat, the two strata the postmortem says already work. |

## Files

- `research/v2-3/src/internal/palette-core.ts` — the only algorithm change.
- `research/v2-3-experiments/track-d/run-subset.ts` — target + regression subset runner.
- `research/v2-3-experiments/track-d/sweep-corpus.ts` — all 34 fixtures vs frozen expectations.
- `research/v2-3-experiments/track-d/sweep-instrument.ts` — composite-domain / slate instrumentation.
- `research/v2-3-experiments/track-d/probe.ts` — lane, domains, gates, fits, hypotheses per image.
- `research/v2-3-experiments/track-d/probe-corners.ts` — corner-ownership forensics.
- `research/v2-3-experiments/track-d/probe-composite.ts` — unguarded composite comparison.
- `research/v2-3-experiments/track-d/probe-guards.ts` — embedding-threshold sweep.

Images are read from `$PALETTE_IMAGE_ROOT` (default `/Users/Flo/github/palette/images`),
since `images/*.jpg` is gitignored and absent from worktrees.
