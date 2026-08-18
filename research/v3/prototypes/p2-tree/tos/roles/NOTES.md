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

---

# Cycle 3 — comparisons against the ruler (worker J, 2026-08-05)

**Input:** `stability/q1-dither/REPORT.md` (the diagnosis), `DECISIONS.md` D7 / D9 / D10.2,
`review-rounds/round-3-quality/OUTCOME.md` item 6. **New file:** `indifference.ts`, plus
`tests/indifference.test.ts`.

## What was wrong

The report's attribution is unambiguous: of the 66 covers whose palette moved under a ±1-LSB dither,
**82% are `c-winner`** — both supplying nodes survived, both representatives held, and *the ranking
named a different one*. The colours stood still. What moved was a lexicographic order over
floating-point quantities, which has no indifference at all: two candidates whose chroma differs in
the fifth decimal are strictly ordered, and one LSB reverses them.

## The repair, and the one thing it is not

arm-b′ §2.6's principle, unimplemented until now: **each lexicographic level is compared against the
ruler for its own quantity, and falls through when the difference is under it.**

The naive form of that — `|a − b| < ε ⇒ tie`, inside the comparator — is unusable. It is a semiorder,
not an equivalence, so `Array.prototype.sort` over it is unspecified and its output depends on the
input order: strictly worse than the exact comparison it replaces. `indifferenceClasses` builds
**indifference classes** first and compares class indices, which are integers. The linkage is by
**leader**, not by neighbour, because single linkage chains through a dense population and would delete
the level entirely (256 accent candidates over 0.19 of chroma have a mean gap of 0.0007). A class
therefore spans strictly less than one band, and `tests/indifference.test.ts` asserts that bound.

Boundaries are placed by the data's own gaps and never by a fixed edge, for the reason
`pipeline.ts`'s representative rule already gives for refusing a lattice.

## The bands — four, all derived, none new

| level | band | source |
|---|---|---|
| accent chroma-from-field, accent lightness movement | `sameColorBar(a, b)` for the pair | the contract's one colour ruler, per pair, regional |
| foreground readability, text-group readability, the residual's order | `APCA_RAW_IDENTICAL_CEILING` = 1.98152 | `src/contract/constants.ts`, `[MEASURED]` — the magnitude raw APCA returns for two *identical* colours, i.e. the size of its own zero |
| text-group area, the component cut | `1 − COMPONENT_CHAIN_AREA_AGREEMENT` = 0.2, **relative** | `roles/constants.ts` — already this stage's answer to "when are two areas one region's area" |
| the ramp's polarity projection | `√MIN_NODE_AREA_FRACTION` = 0.02236 | `tos/constants.ts` — the *linear* extent of the grain: a square of the smallest retained area has that side, in normalised image units |

The last two are scale-free (a ratio; a fraction of the image's own side). `MIN_NODE_AREA_FRACTION`
was rejected as an *absolute* area band on both counts: it is not scale-free, and the component
population is dense immediately above it, so it would have put the whole small end into one class.

## Where the fall-through lands — and the measurement that changed the design

The settled tie-break is **lexicographic RGB — the colour itself** — ahead of lane index and node id at
every ranking site. A node id is an artefact of the retained set, which turns over at 7.5% under a
dither, so a tie-break on it is a coin flip; a colour is not.

**But the accent's winner is still the extremum, and that is a measured retreat from the design.** The
first implementation let the accent fall all the way through: chroma class, then lightness class, then
lexicographic RGB. The harness refused it. Full run, 600 trials, against the cycle-2 baseline:

| | overall | dither | rendition-pair | q92 |
|---|---|---|---|---|
| cycle-2 baseline | 9.0% | 23.0% | 5.5% | 11.0% |
| full fall-through on the accent | **7.8%** | **22.0%** | 5.0% | 7.0% |

and the role table says exactly where it went: **background 173/600, surface 195/600, foreground
462/600 — byte-identical to the baseline** — while the accent went 447 → **464**. Every band on the
field and foreground paths was a *no-op on this corpus*; the accent's band was the whole of the −7.

**The mechanism, stated so it is not rediscovered.** An indifference band is stabilising when the
candidate *set* is fixed and two members jitter across each other. It is **destabilising when the set
churns**, and this pipeline's set churns: `argmax(chroma)` is unaffected by any candidate that is not
the maximum, but `argmin(packed)` over `{c : chroma(c) > chroma_max − bar}` is decided by *every*
member of that band, so widening the winner's support from one candidate to a class hands the decision
to the churn. That is the opposite of what the brief's model of the defect predicts, and it is why the
accent now uses its classes for the truncation boundary and for ordering *below* the leader, while the
leader itself is still the extremum. Verified on the dither arm alone (a 100-trial probe over the
harness's own cache and comparator): full fall-through **22%**, extremum-preserving **23%**.

## The truncations

`stableCut` extends a cut **through** the indifference class that straddles it, so membership changes
only when a class boundary moves. Applied to `ACCENT_CANDIDATE_LIMIT` (cut down the chroma order),
`TEXT_COMPONENT_LIMIT` (down the area order) and `RESIDUAL_POOL_SIZE` (down the APCA order). Extending
rather than retreating is D8's direction — *"mass floors exclude exactly what the reviewer asks for"* —
and the overshoot is bounded by one band's population, not by the tail. Measured on the acceptance
cover: the accent cut extends 256 → 257 and the component cut does not bind (425 < 512).

**`MARK_NODE_LIMIT` is not touched, because nothing live reads it.** It survives only in
`stability/q1-dither/` (which re-derives the *pinned* cycle-1 stage on purpose) and in one test's
message. The live area-ordered cut is `TEXT_COMPONENT_LIMIT`, and that is the one that moved.

## D10.2 — polarity, and the answer the cover gave

`ramPolarityAIsBackground` is three levels: the 135° projection, then D10.2's *lighter end is the
background*, then arm-b′'s declared chain. **The projection keeps priority** and the lightness level
speaks only inside the band, because one reviewer note may not outrank a geometric fact about where
the gradient is actually drawn. The parse records which level decided (`ramp-polarity:…`).

**On round 3a item 6 it changes nothing, and that is the measurement, not an assumption.** The ends
project 0.70475 and 0.60692 — a gap of **0.0978 against a band of 0.0224, 4.4×** — so the projection
decides clearly and `#646464` stays the background. Per the brief, nothing beyond the indifference
structure was implemented and the finding is recorded instead: **the note needs a different
mechanism.** No band derivable from an existing constant reaches 0.0978, and widening one until item 6
flips is taste with a derivation stapled to it. Two candidates worth a round, neither of them a
constant: (a) the projection may be the wrong statistic — the outer end of a ground chain is the
*root*, whose centroid is the image centre by construction, so this comparison is really "is the inner
end up-left or down-right of centre"; (b) D10 may be about lightness order outright rather than about
geometry with a lightness tie-break. Across demo-20's four laminar covers the projection gap is 0.376,
0.130, 0.056 and 0.032 — every one of them over the band — so on this evidence the lightness level is
reachable almost nowhere, which is itself the argument that (a) or (b) is the real question.

## D7 — margins, reported

`roleMargins()` publishes all six pairwise role margins: the OKLab distance, the contract's regional
bar for that pair, and their ratio. On `CandidateDiagnostics.margins` for the **published** palette
(post-assembly-walk) and in the node dump's `roleMargins` for the parse's roles. **Report-only** — no
ranking, no filter, no floor. D10.5 records the single data point that exists (a 0.0304 margin the
reviewer did not read as one colour), which is not a calibration.

## The lever this cycle found and did not pull

Both of the above are about *comparisons*. The measurement points somewhere else: **which member of a
cluster publishes.** A cluster is a set of nodes the bar calls one colour, so that choice is a sub-bar
choice by construction — and it is made by **area**, which the report measures as one of the churniest
orders in the parse. Publishing the *most chromatic* member of an accent cluster instead (the accent's
own ranking quantity; an existing attribute; no constant) is the largest single stability effect
cycle 3 found: on the dither arm the accent moves on **42 of 100** covers against 50, and the arm goes
23% → **24%**.

**It is implemented, measured, and reverted, on quality.** It publishes `#ee5567` on `…35b967964d` in
place of `#d25068` — the one accent hex in this campaign with a direct reviewer endorsement (D9,
verbatim: *"the correct shade of red (Strawberry Moon)"*). It also moves `…d859a69094`'s accent
`#161415` → `#282425`, and it lifts the **L-only** pool to the same 0.18996 chroma as the merged pool
on the coral cover, which would dissolve the recall evidence D2's lanes rest on. Agreement is not
quality; one point of it does not buy the named shade. **This is a round item, and it is the highest-
value one cycle 3 produced.**

The symmetric move on the foreground — publish a cluster's most *readable* member, since readability is
what the foreground is ranked on — was also implemented and is refused harder: `…d859a69094` stops
publishing the artwork's own `#070506`, and on `…35b967964d` the accent collapses to `#f6b3bc` (chroma
0.085) because the foreground moved and took the separation budget with it. The reason is structural: a
cluster is one colour under the bar but its members are **not** all within a bar of each other (the
relation is a transitive closure), so an extremal choice on any axis can walk to the far end of a chain.
`findTextGroups` keeps the `memberScore` hook, defaulted to area, so the next attempt is one line.

## What it cost on demo-20

20 ok · 0 failed · **0 contract violations · 0 forbidden twin pairs** — and **all twenty palettes are
byte-identical to the cycle-2 merged run**. That is the honest summary of what shipped: the
indifference structure, the stable cuts and the polarity levels change no published palette on
demo-20, because on this set no level's difference ever lands inside its band. Both acceptance cases
therefore hold trivially: `…35b967964d` publishes `#d25068` (D9's *"correct shade of red"*), and
`…d859a69094` publishes the artwork's own `#070506` through a text group.

The intermediate build that *did* move nine of the twenty accents was the full fall-through, and every
one of those moves was inside the bar on chroma-from-field (deltas 0.0008–0.0222 against bars
0.0093–0.0229). It is the build the harness rejected; the numbers are two sections up.

## The robustness table, shipped state, 600 trials

| | cycle-2 baseline | shipped |
|---|---|---|
| **overall agreement** | 9.0% [7.0–11.6] | **9.0% [7.0–11.6]** (54/600) |
| **dither-lsb1** | 23.0% | **23.0%** (23/100) |
| rendition-pair | 5.5% | 5.0% (10/200) |
| jpeg-q92 | 11.0% | 12.0% (12/100) |
| jpeg-q85 | 5.0% | 4.0% |
| jpeg-q75 | 4.0% | 5.0% |
| role moved: bg / surface / fg / accent | 173 / 195 / 462 / 447 | 173 / 195 / 462 / **445** |
| reviewed-vs-unseen, perturbation (healthy ≈ 1.0) | 0.955× | 1.095× |
| errored trials | 0 | 0 |

**The topline did not move, and the brief's success criterion is not met.** Every arm is inside its
own confidence interval and the arms move in both directions, so the two-point differences on q85/q92
are noise, not signal. What the table does say, read against the role row, is that nothing in this
cycle's design touched the three roles it was aimed at: background, surface and foreground disagree on
exactly the same trials as before, to the trial. **The instrument's verdict on the brief's hypothesis
is that comparison-level indifference is not where this candidate's instability lives.** The two
sections above name where the measurement says it does live, and why that lever was not pulled.

Reachability, endorsed-173, dump regenerated on the shipped code: **1284/1397 = 91.9% [90.4–93.2]**,
falsifier rate 24/1397 = 1.7% — unchanged from the cycle-2 merged pool, as the lanes-only-add-nodes
argument predicts and as a change that publishes the same palettes must.

---

# Cycle 3 — D12's two defects (worker L, 2026-08-11)

**Input:** `DECISIONS.md` D12 (both fixes), D3 (*salience gates identity*, the principle),
`identity/q1/report.json`, `identity/q2/report.json`, `identity/q3/report.json` (the measurements).
**New files:** `coincidence.ts`, `eligibility.ts`, `tests/identity-eligibility.test.ts`. **Constants
added: none.**

## 1. Cross-lane dedup — `coincidence.ts`

`TEXT_MIN_COMPONENTS` is a count of *distinct marks*, and the population it counted was a population of
**namings**. Round 3a item 5's published foreground came from a group of four components measured as:

| node | lane | box (px) | area (px) | centroid |
|---|---|---|---|---|
| 41 | L | 115,109–130,139 | 143 | 0.4078, 0.4164 |
| 42 | L | 115,112–127,138 | 112 | 0.4048, 0.4218 |
| 65 | a | 115,104–133,139 | 200 | 0.4131, 0.4068 |
| 74 | b | 117,109–130,137 |  99 | 0.4115, 0.4089 |

One blob. Three lanes named it, and the L lane named it twice because the two L nodes' areas agree at
**0.783** — just under `COMPONENT_CHAIN_AREA_AGREEMENT`, so chain collapse left both. Coincident
centroids make `collinearity` answer **0 vacuously**, so a single mark satisfied every clause of
arm-b §2.4's conjunction and elected a foreground of raw APCA 7.7.

**The merge criterion** (conjunction; transitively closed by union–find, lane-agnostic on purpose —
`clusterByBar`'s construction and `clusterByBar`'s argument):

1. **colour** — `okLabDistance(a, b) < sameColorBar(a, b)`, the contract's own regional ruler;
2. **position** — centroid distance `< NORMALISED_LENGTH_INDIFFERENCE` (`√MIN_NODE_AREA_FRACTION`, the
   grain's linear extent), in normalised units;
3. **extent**, both readings required — **containment** `|A ∩ B| ≥ COMPONENT_CHAIN_AREA_AGREEMENT ·
   min(|A|,|B|)`, measured because two lanes' trees share no ancestry, **and box agreement**, every edge
   within `NORMALISED_LENGTH_INDIFFERENCE`.

Clause 1 is what the brief demanded and it is not decoration: an isoluminant glyph exists only in the
chromatic lanes, so its lanes' namings are the same colour and clause 1 costs that case nothing — while a
glyph **over a scrim** sits in the same place in a genuinely different colour, and position alone would
delete one of the two. Clause 3's box reading is what stops a **concentric nesting** (a badge in a panel
is 100% contained and shares its centroid — the case `COMPONENT_CHAIN_AREA_AGREEMENT`'s own doc comment
says a region rule must not swallow). On item 5 the six pairs measure containment 0.727–1.000 and box
gaps 0.0067–0.0267 against a band of 0.02236. Four of the six pairs clear both readings (41–42, 41–65,
41–74, 65–74); 42–65 fails the box clause at 0.0267 and 42–74 fails containment at 0.727, and the
transitive closure joins all four namings anyway — which is the reason the relation is closed rather
than applied pairwise.

A merged component **counts once**; its area is the carrier's own area and never a sum; the carrier is
the largest shape (then lexicographic RGB, lane, node id); every member's node id is kept as provenance
and is what `Parse.textGroups[].nodeIds` publishes. A node id **is** the lane provenance — the parse's id
space is laid out lane by lane — so D2's isoluminant evidence, *every node behind this group is a
chromatic-lane node*, survives the merge unchanged. `Parse.textGroups[].componentCount` is new beside it,
because `nodeIds.length` is no longer the count `TEXT_MIN_COMPONENTS` is compared against.

## 2. Antialias ineligibility — `eligibility.ts`

W-I measured the class: item 2's published `#fcffff` is five components of **inradius 1 px and boundary
fraction 1.0** tracing the outline of the cover's photograph, and 30 of q3's 113 reachability failures
are the same `antialias-only` class. Item 1's `#fcfefd` is the counter-case: inradius **57.9 px**,
boundary fraction 0.116, and it must stay eligible.

**The predicate is topological and adds no constant:** a region *traces a boundary* when it has **no
interior pixel** — every pixel has a 4-neighbour outside the mask. That is exactly "inradius 1 px", and
1 px is the **floor of the measurement's own range** rather than a value anyone chose; it is also exactly
"boundary fraction 1.0". The two attributes D12 names are one measurement and one linear pass over a mask
the pipeline already cuts.

**Applied as ordering, never retention.** No node leaves any pool. The foreground's non-text tier
composes it with D3's salience level as `2·tracing + salience`, tracing outermost; the accent takes the
tracing level alone, ahead of chroma-from-field. **D3's salience level still does not rank the accent**
(`integration-NOTES.md` §5's deviation stands, and for its own reason); the tracing level does, because
it does not unseat D1's coral — that node has an interior, and `lanes/tests/accent-acceptance.test.ts`
still passes unchanged. A **text group's** colour is exempt from both levels, as it already was from D3's:
after the merge a group can no longer be one mark counted four times, which was the route by which a
halo used to reach that exemption.

Where each region comes from: a **node's** mask for a cluster (a cluster traces only when *every* member
does — `salient`'s polarity), and the contract's own **bar mask** for a residual triple, which is
`identity/pixels.ts`'s unit and the only one that works (item 1's white is 330 scattered exact-triple
pixels; only the bar mask shows the 16,937-pixel region they belong to). The residual's **cut** is still
made on the readability order alone and only the **order** inside the pool changes.

## 2b. The one case with a known ground truth

`roles/tests/isoluminant-text.test.ts`'s fixture is six strokes, and the merged parse used to see
**twelve** components — each stroke named once by the `a` lane and once by the `b` lane, since an
isoluminant glyph has no L-lane node at all. On this code the parse notes read
`coincident-components-merged:6 · components:6`, the group carries **6 components and 12 node
namings**, and every one of those namings is still a chromatic-lane id. Six strokes, six components,
and D2's evidence intact: the merge is doing exactly what it says on the one cover where the answer is
known by construction, and it is why `TEXT_MIN_COMPONENTS` is now compared against a count of regions.

## 3. What moved on demo-20, and why each one moved

`20 ok · 0 failed · 0 contract violations · 0 forbidden twin pairs`. Six of twenty palettes moved — **five
of them from the merge, one from the tracing level** — and every one is a phantom group dissolving:

| cover | foreground | what changed |
|---|---|---|
| `…0000099e` | `#cdc2d2` (5.1) → `#a08341` (34.7) | its only group was 4 namings of one mark; the old colour is itself a boundary tracer |
| `…000023e9` | `#88878f` (31.1) → `#a1f9fd` (87.0) | leading group was 9 namings; the genuine group behind it now leads |
| `…000018e9` | `#ff0b0a` (20.5) → `#f52733` (21.9) | same red, groups re-formed after the merge |
| `…00000ee5` | `#a0a3aa` (38.8) → `#292017` (11.5) | leading group was 4 namings of one mark; the surviving genuine group leads, and text-colour-leads is what it costs |
| `…0001073` | `#333037` (81.3) → `#f8dab8` (2.7) | **the one that costs readability.** The old leader was 5 namings of one mark *and* a boundary tracer; what is left is a genuine group at raw APCA 2.7 — above the contract's `EPSILON_TEXT_RAW` floor by 0.2 |
| `…000000d8` | accent `#bdbdbd` → `#a9a9a9` | the tracing level, on the accent; no components merged on this cover |

Recall and readability against the cycle-2/W-J merged baseline:

| | baseline | this |
|---|---|---|
| covers yielding ≥1 text group | 19/20 | **18/20** |
| foreground is the leading group's colour | 16/20 | **15/20** |
| published fg min \|raw APCA\|: median / mean / min | 30.3 / 35.4 / 2.9 | **28.1 / 34.5 / 2.7** |
| components merged | — | 366 over 19 of 20 covers |

**The recall loss is a phantom loss** on both covers where it happened, and it is stated as a trade rather
than as a win: the detector's precision went up and its published readability went very slightly down,
because a phantom group's colour is often the *most contrasty* thing in a pool (it is usually a halo, and
a halo is usually near-white or near-black against its field). `…0001073` is the cover to put in front of
the reviewer if one is needed.

## 4. Cost

Sequential demo-20, one process, measured against the same baseline in the same sitting (the machine
was shared with two other prototypes' robustness runs, so the **ratio** is the number to read and the
absolute figures are not comparable with `integration-NOTES.md` §9's):

| | ms per cover |
|---|---|
| baseline (W-J shipped) | 588–703 |
| this, with the residual measurement indexed | 670 |

Instrumented breakdown of the new work, per cover over demo-20: coincidence merge **1 ms**, the
accent candidates' interior masks **9 ms**, the distinct-colour index **6 ms**, the residual bar-mask
measurement **98 ms → 25 ms** once the labs and `PaletteColor`s of the image's distinct colours are
built once instead of per candidate. The merge is free because clause 2 windows the scan on centroid
`y` and the pixel intersection only runs for pairs that already agree on colour, position and box.

## 5. Reachability — unchanged to the slot, as it must be

`tos/dump.ts --set falsifier/out/endorsed-173.txt` regenerated on this code, falsifier re-run:

| | baseline | this |
|---|---|---|
| endorsed colours reachable from retained nodes | 1284/1397 = 91.9% [90.4–93.2] | **1284/1397 = 91.9%** |
| reachable from the control set | 508/1397 = 36.4% | 508/1397 = 36.4% |
| falsifier rate (line: >25% fires) | 24/1397 = 1.7% | **24/1397 = 1.7%** — not falsified |
| unreachable from both | 89 | 89 |

Identical in every count, which is the check that the ineligibility level is **ordering and not
retention**: nothing this cycle touches `selectStableNodes`, `stability.retained` or `Parse.nodes`, and
a level that removed a node from the pool would have shown up here as a lost slot.

## 5b. Robustness — 600 trials, `--bar-mode regional`, same harness and same sets

| | baseline (W-J shipped) | this |
|---|---|---|
| **overall agreement** | 9.0% [7.0–11.6] (54/600) | **8.5% [6.5–11.0] (51/600)** |
| **dither-lsb1** | 23.0% (23/100) | **20.0% (20/100)** |
| rendition-pair | 5.0% (10/200) | 5.0% (10/200) |
| jpeg-q92 | 12.0% (12/100) | 14.0% (14/100) |
| jpeg-q85 | 4.0% | 3.0% |
| jpeg-q75 | 5.0% | 4.0% |
| role moved: bg / surface / fg / accent | 173 / 195 / 462 / 445 | 173 / 195 / **458** / **441** |
| reviewed-vs-unseen, perturbation (healthy ≈ 1.0) | 1.095× | 1.412× |
| errored trials | 0 | 0 |

**The topline did not move, and it did not move in the direction the brief hoped for either.** Every arm
sits inside its own confidence interval, the intervals overlap almost completely (8.5% [6.5–11.0] against
9.0% [7.0–11.6]), and the arms move in **both** directions — q92 up two trials, dither down three, q85 and
q75 down one each. Three trials out of six hundred is not a signal, and neither is the plausible story
that goes with it. The one row that moves the way the hypothesis predicted is the role table: the two mark
roles disagree on four fewer trials each (fg 462 → 458, accent 445 → 441) while the two field roles are
byte-identical to the trial, which is what a change confined to the mark stage must look like. Shrinking
the phantom and halo candidate sets did **not** buy agreement; the churn W-J attributed to candidate-**set**
membership is still there and is still round-priced (D12).

`reviewed-vs-unseen` at 1.412× is worth a line only to say it is two small rates (24/200 against 17/200)
and is not read as a finding here.

Cost, from the same run: **4,096 s wall / 15,266 s in candidate** against the baseline's 3,164 s / 11,726 s
— but the machine was shared with another prototype's robustness run for the whole of it, so §4's
sequential measurement (+~15%) is the number to trust and this one is an upper bound.

## 6. What this leaves owed

- **`…0001073` is round material, not a bug to tune around.** Removing that cover's phantom group left a
  genuine text group at raw APCA **2.7** as the artwork's own text colour, and the identity-over-legibility
  rule published it. The contract accepts it (`EPSILON_TEXT_RAW` is 2.5) and no rule in this directory may
  raise that floor without putting a second contrast policy beside the contract's. What the reviewer has
  never been asked is whether identity still outranks legibility *this far down* — one pairwise item on
  this cover (the artwork's type at 2.7 against the most readable candidate) prices it.
- **`tracingLevel` is measured per accent candidate and is not in the node dump.** It is on
  `Parse.accentCandidates` beside `stabilityLevel`, `chromaFromField` and `fieldContrast`, which is where
  a test reads it; `tos/dump.ts` publishes the other four and would need one line to publish this one.
  Not taken, because `dump.ts` is outside this pass's ownership list — owed the moment a round wants the
  eligibility level on the numbers it stages.
- **The residual's eligibility is measured on eight colours** (`RESIDUAL_POOL_SIZE`), because that is the
  pool. If a later change deepens the residual walk, the measurement's cost grows with it linearly and
  the indexing in §4 is the thing to look at first.
- **`identity/q2`'s `nodeIds`-as-member-count reading is now stale.** That report counted a group's node
  ids as its component count, which was true before the merge and is not after; `componentCount` is the
  field to read. The report itself is a released artefact and is left alone.

---

# Cycle 5 — D18.1's two cluster-member levers, adopted with a measured bound (worker P, 2026-08-18)

**Input:** `DECISIONS.md` D18.1 (the mandate), `review-rounds/round-5-pricing/OUTCOME.md` items 1–2 (the
verdicts), W-J's *"the lever this cycle found and did not pull"* above (the measurement). **New export:**
`indifference.ts`'s `extremalMember`. **Constants added: none.**

## 1. What the round released, restated exactly

W-J's figures, re-derived from the section above rather than from anyone's recall: the chroma-extremal
**accent** member moves the accent on **42 of 100** dither covers against 50, and carries that arm's
agreement **23% → 24%**. (The `447` in the adoption brief is a different measurement — the 600-trial
role-moved count of the cycle-2 baseline; W-J's shipped build read 445. Nothing measured a churn of 42
per 600.) The costs W-J recorded and withheld the lever for: `#d25068` → `#ee5567` on `…35b967964d`,
`#161415` → `#282425` on `…d859a69094`, and the L-only pool lifted to the merged pool's chroma. The
**contrast-extremal foreground** member loses `#070506` on `…d859a69094`.

Round 5 priced two of those and the reviewer preferred neither side (item 1 weak/weak, item 2
**strong/strong**), so D18.1 releases both levers. Both are now installed:

| pool | site | quantity | ruler |
|---|---|---|---|
| accent | `pipeline.ts`'s `accentClusters` | chroma from the field | `sameColorBar` for the pair |
| foreground | `findTextGroups`'s `memberRule` | `minFieldContrast` over the rendered field | `RAW_APCA_INDIFFERENCE` |

The **shared** `clusters` representative — the accent's second tier *and* the foreground's non-text tier
— keeps the area rule, because one repr cannot be extremal on two pools' different quantities. Splitting
it into two is a design with its own measurement and is **owed**, not silently taken.

## 2. The deviation, and the measurement that forced it

The brief asked for the unbounded extremum: publish the member in the **best** class. Implemented and
measured first, and it does not do what the round priced. `clusterByBar` closes the same-colour relation
**transitively**, so an extremal member can be many bars from the colour published today:

| cover | role | unbounded result | distance, in bars of the pair |
|---|---|---|---|
| `…d859a69094` | foreground | `#070506` → `#050304` | 1.77 — **the priced substitution** |
| `…35b967964d` | accent | `#d25068` → `#dc565f` (chroma-indifferent from `#ee5567`) | 1.28 — **the priced substitution** |
| `…35b967964d` | foreground | `#edbab9` → `#c65d61` | **10.4** — priced by nobody |

The third one is the whole finding. It takes the foreground/accent separation budget with it, and the
published accent collapses `#d25068` → `#f6b3bc`, **chroma 0.085 against the coral's 0.169** — round 1's
*"accent wrongly collapsed — vivid red-orange missed"*, reintroduced on the cover that named it, against
the one accent hex in this campaign with a direct reviewer endorsement (D9). Unbounded demo-20:
**17 of 20 palettes move** (foreground 15, accent 11), including `#a1f9fd` → `#f4fcfe` and `#88744f` →
`#4d2818`. Two assertions of `lanes/tests/accent-acceptance.test.ts` fail on it: the published accent is
no longer the top of the accent ranking, and it no longer out-chromas the foreground.

**The bound, and why it is the round's own object.** Both *priced* substitutions are **intra-class**:
`#070506` and `#050304` differ by **0.03** of raw APCA against a band of 1.98, and `#d25068` sits inside
the chroma class its cluster's leader opens. So `extremalMember` publishes the settled member of the
class the **incumbent** — the area-largest member, the colour published today — already occupies. Area
stops deciding *which colour*; the tie-break decides, and the tie-break is the colour itself
(lexicographic RGB, then node id), which is the churn the lever was aimed at. What the bound gives up is
the part of W-J's measurement that came from crossing classes; **the dither arm is unmeasured here** (the
robustness harness is the orchestrator's to run after this lands) and the honest statement is that the
42/100 figure was measured on the unbounded rule and does not transfer unexamined.

## 3. What came true, and what did not

| W-J's prediction | this build |
|---|---|
| foreground `#070506` → `#050304` | **true**, and it is round-5 item 2's own trade |
| accent `#161415` → `#282425` on the same cover | **`#181818`** — same cluster, settled by the ruler and not by the exact extremum |
| accent `#d25068` → `#ee5567` | **did not fire.** `#ee5567` is not a member of `#d25068`'s cluster; the unbounded rule reaches it by re-ordering *between* clusters, which the bound does not do. `#d25068` still publishes |
| L-only pool lifted to the merged pool's chroma (D2's evidence on that cover) | **true of the unbounded rule** — L-only best 0.17062 against merged 0.16929, i.e. the merged pool no longer strictly wins. **Not true of this build**: `lanes/tests/accent-acceptance.test.ts` passes unchanged, including `accentChroma > lOnlyBest` |

`roles/tests/isoluminant-text.test.ts` **passes and still discriminates**: the L-only parse still finds
no text group on the isoluminant fixture and the merged parse still finds exactly one whose every node
id is a chromatic-lane id. The member rule changes which member of a group publishes and cannot change
whether the group exists, so D2's evidence is untouched by construction as well as in fact.

## 4. Demo-20, this build

`20 ok · 0 failed · 0 contract violations · 0 forbidden twin pairs`, role-swap check still a no-op.
**14 of 20 palettes move** — foreground on 11, accent on 6 — against `out/demo-20-cycle5-before.run.jsonl`.
Both acceptance covers are in it, and the rest are near-identical inks of one mark: `#7f7f7f`-class
substitutions, `#9c9c9c` → `#9a9a9a`, `#62a2ac` → `#58a2ad`. Two are larger and are re-orderings rather
than substitutions (`…a621256ce593`'s accent `#d9dd16` → `#f95427`, `…3a949021f65e`'s foreground
`#f8dab8` → `#e6e5d0` — the latter moves off the triple round-5 item 5 called unacceptable).

## 5. What this leaves owed

- **One test fails and it is not in this pass's ownership.** `coverage/tests/acceptance.test.ts:64`
  asserts the published foreground of `…35b967964d` is chromatic; the substitution `#edbab9` → `#e4bdb6`
  is **0.72 of the pair's bar** — exactly the sub-bar kind the round released — but it crosses the
  contract's own region boundary (chroma 0.0591 → 0.0461, `light-saturated` → `light-neutral`). The
  coverage prototype is uninstalled (D18.2) and its owner has the one-line call: assert the *family*, or
  re-pin. Suite is **117/118**.
- **The house tie-break has no colorimetric direction.** Inside an indifference class the settled order
  is lexicographic RGB, which is stable and meaningless, so a class settled by it drifts toward the
  low-RGB member. That is how `#e4bdb6` won above. It is the right tie-break for *stability* and it is
  worth a round item to ask whether a class should settle on chroma or on lightness instead.
- **The unbounded variant is a run away, not a rewrite.** `extremalMember`'s `incumbent` argument is the
  whole of the bound; `out/demo-20-cycle5-mandated.run.jsonl` is its demo-20 for comparison.
