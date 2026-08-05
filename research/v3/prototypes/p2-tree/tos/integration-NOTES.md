# P2 / `tos` — the cycle-2 integration pass

**Worker H, 2026-08-05.** Input: `../DECISIONS.md` D1–D3 (binding rulings), `../SPEC.md`,
`roles/NOTES.md`, `lanes/pool.ts`, and `../review-rounds/round-1-tree-families/OUTCOME.md` including
its CORRECTION section. This file records what the merge did, the two places it deviated from the
brief, and the calibrations it refused to invent.

## 1. One candidate carries everything

`p2-tos` and `p2-tos-chroma` were two modules over two pools while the lane work and the role work ran
in parallel. They are now **one implementation**:

| file | what it is now |
|---|---|
| `pipeline.ts` | takes optional `extraLanes`; owns per-lane chain collapse, the shared clustering, the text detector, both identity orders |
| `lanes/pool.ts` | orchestration only — decode once, build three lanes, hand two of them to `parseTree` |
| `candidate.ts` | the contract adapter, over the merged pipeline. Publishes `p2-tos-0.3.0-cycle-2-merged` |
| `candidate-chroma.ts` | a **thin alias**: re-exports `candidate.ts`'s `paletteOf` unchanged, overrides `candidateId` only |

`pipeline.ts`'s `runPipeline` is **left in place as the L-only entry** — `parseTree` with no extra lanes
is byte-for-byte the parse round 1 was judged on, and `stability/q1-dither`, `stability/q2-laminarity`
and `lanes/tests/parity.test.ts` all need exactly that to have something to compare the merge against.
Nothing that publishes a palette calls it any more.

**Both ids are kept, and the dev-loop cache cannot conflate them.** `src/devloop/run.ts` keys every row
on `computeCodeVersion(candidatePath)` — a digest over the entry module's bytes *and* its transitive
import graph — composed with the image's content hash, and stamps `candidateId` into the run id and the
run header. The alias file's bytes differ from `candidate.ts`'s, so the two ids carry different code
versions, land in different cache entries and write different run files. They now *agree* on every
palette, byte for byte, which is what the merge means; nothing merges their cache entries. The alias is
kept rather than deleted because cycle-2 run files, report paths and review-round `items.json` entries
name `prototypes/p2-tree/tos/candidate-chroma.ts` as a candidate path, and a dangling path in a released
artefact is worse than a two-line alias.

## 2. Two populations, and why the accent is not behind the component rule

The merge exposed a real structural choice that neither worker had to make alone.

- **`poolMarks`** — every retained mark node of every lane. The **accent** ranks over this directly.
- **`components`** — the chain-collapsed subset, per lane. The **text detector** and the foreground's
  non-text tier rank over this.

Putting the accent behind chain collapse was tried first and it **broke D1's acceptance case**: on
`…35b967964d` the vivid coral lives on *mid*-chain nodes, and the deepest node of each of those chains
is a duller red. The published accent became `#b9545c` at chroma 0.133; the coral `#d25068` at 0.169 was
not in the candidate set at all. That is W-E's reasoning confirmed by measurement — *"nothing in the
accent's ordering is geometric, so the accent needs no component rule"* — and the split is now explicit
in the code rather than a consequence of file ownership.

## 3. D1 — chroma-first accent: applied

The APCA-first accent path is gone. The accent order is `chromaFromField` descending, `lightnessMove`
descending, then lane index, then node id; admissibility is the contract's own machinery
(`FOREGROUND_ACCENT_SEPARATION_DISTANCE`, invariant 4 at the user floors) plus the twins-must-collapse
walk in `roles/assemble.ts`. **The APCA measurement is kept and reported**, per accent candidate, in the
new `Parse.accentCandidates` and in the node dump's `accentCandidates` array, alongside the chroma, the
lightness movement, the MSER growth and D3's salience level — so the coming round prices the exchange
rate on the numbers the pipeline actually saw rather than on a re-run.

On the acceptance cover the merged candidate publishes
`bg #dfe0d0 · surface #f3f3f3 · fg #edbab9 · accent #d25068`.

## 4. D2 — isoluminant foregrounds: applied

Chain collapse runs **per lane**, over that lane's own parent links, because a chain is a run of levels
inside one tree; collapsing across the merged array would let a large a-lane region swallow an L-lane
glyph that is nowhere beneath it. The collapsed components of all three lanes go into one area-ordered
set, one same-colour clustering, and one text detector.

**The detector's geometric tests are lane-agnostic and stay that way.** Stroke width, height agreement,
centroid collinearity and row linkage are measured in image pixels, which every lane shares. Colour
agreement is the one bar, applied once, in `clusterByBar`. Nothing in `roles/text.ts` knows which tree
found a glyph — a title set in a colour that only moves in `a` is type by exactly the same evidence as
a title that moves in `L`.

Regression test: `roles/tests/isoluminant-text.test.ts`. Six strokes of one width, one height and one
baseline, drawn in an ink whose OKLab lightness equals its field's (0.4853 both, by a scan over sRGB,
asserted in the test) and whose chroma is 0.167 away. The **L-only** parse retains one node — the root —
finds no text group and falls through to the residual; the **merged** parse finds one group of twelve
components, every one of them a chromatic-lane node, and publishes its representative as the foreground.
Both halves are asserted, because only the pair is evidence.

## 5. D3 — salience gates identity: applied to the foreground, **deviated on the accent**

### What was implemented

Salience is the MSER growth rate `selectStableNodes` already computes for every retained node in every
lane — the area derivative per level, small for a region that holds its shape across the level axis and
large for one that appears and dissolves. It is applied as a **lexicographic level** (0 leads, 1 may
not) ahead of the foreground's readability key, with two exemptions:

- a **text group's** colour is level 0 whatever its nodes' growth says — D3 is explicit that identity
  outranks legibility and that the artwork's own text colour claims the foreground first;
- a **residual** colour (a common exact triple with no node behind it) is undemoted. D3 demotes
  incidental *nodes*; reading it as a demotion of everything that is not a node would be a different
  rule.

The split is the pool's own **lower median growth**, an order statistic of the marks that image
produced. No new constant: there is no calibrated growth rate at which a node stops being incidental,
and a rank-based split is invariant under any monotone re-scaling of growth.

### What it costs the reviewer's dominant failure class: measured, and it is ~nothing

Foreground readability is round 1's dominant failure class, so a level in front of the readability key
is exactly the kind of change that could quietly undo cycle 2's main repair. It was measured rather than
argued, on demo-20, against the same pipeline with the level removed and everything else identical:

| | published foreground's minimum \|raw APCA\| over the rendered field |
|---|---|
| with D3's level | median **30.3**, mean **35.4**, min **2.9** |
| without it | median 30.5, mean 35.7, min 2.9 |

The **published** foreground moves on **2 of 20** covers, for −0.3 mean raw APCA.

The reason the cost is this small is worth recording, because the *pool head* moves on 4 of 20 and there
it looks alarming — on `…20cac4b472` the level puts `#141414` (contrast 2.0) ahead of `#ffffff`
(contrast 106.5). **The assembly walk absorbs it.** `roles/assemble.ts` re-validates every candidate
against the whole contract and takes the next item in the same ranking on a violation, so a
near-invisible level-0 head is refused by invariant 4 and the walk descends into level 1 and publishes
the readable colour anyway. D3's level therefore reorders *eligibility among candidates the contract
already accepts*, which is the scope the ruling asks for, and the contract's floors remain the thing
that decides legibility.

### Where it stopped, and why

**The level is measured for the accent and is not ranked on.** The brief asks for it ahead of both
identity orders. On the acceptance cover it inverts D1:

| candidate | chroma from field | cluster's best growth | pool median growth | level |
|---|---|---|---|---|
| `#d25068` (the coral D1 names) | **0.169** | 0.0559 | 0.0149 | **1** |
| `#e7768a` | 0.146 | 0.0013 | — | 0 |

Every split this file can construct without a calibrated number demotes exactly the colour D1 names:
the population median does, and so does the threshold-free alternative (a node is salient when it is at
least as stable as its own retained parent — the coral's node is 0.056 against its parent's 0.001). D1
forbids re-introducing an order that unseats the coral. The brief's own escape clause applies: *"if you
find you need a threshold, stop, write the need into `integration-NOTES.md`, and use pure ordering
instead."*

### The calibration that is owed

> **A calibrated eligibility cut on MSER growth.** The median demotes half the pool by construction,
> which is "the less stable half" and not "an accidental shadow". What is needed is the growth rate at
> which the reviewer stops calling a region part of the artwork's identity — a number no instrument in
> this prototype can produce and no worker may invent. A round item that shows one cover twice, with and
> without the level on the accent, is the cheapest way to price it; the numbers to show it with are
> already published per candidate in `accentCandidates`.

### D3, surfaces: verified, no fix needed

`surface` is drawn only from the ground chain (laminar, flat) or from the root's field-sized children
(partitioned, textured, unreadable), ranked by **subtree** area. A polaroid's white border is a node
whose *shape* covers the border and everything inside it, so its subtree area is large, `kind` is
`field`, and it lands in both of those sets. Nothing anywhere ranks by own area or demotes an enclosure.

Measured on demo-20, counting a field node as enclosure-shaped when its own area is under half its
shape's area: **19 of 20 covers have at least one; on all 19 at least one is reachable in the surface
order; on 13 of 20 one is what actually published as the surface.** So arm-b §2.3's enclosure reasoning
and arm-f′'s frames are honoured by the existing order.

> **Unverified until round 3: the polaroid case specifically.** No demo-20 cover is a depicted object
> with a white border around a photograph, which is the reviewer's actual example. What is verified is
> that ring-shaped field nodes are reachable and frequently published; what is *not* verified is that
> the border of a depicted frame is the node the reviewer would name. Round 3 draws beyond demo-20
> (D3's round-composition clause) and is where that case should be put in front of them.

## 6. What the shared cost guard costs

`TEXT_COMPONENT_LIMIT` (512, `[UNCALIBRATED]`, a cost guard) is now **one cut over three lanes'
components**, ordered by area, rather than one cut over the L lane's. A per-lane cap was rejected: the
pool is one pool, and three caps would be three cost guards where the spec has one.

It binds on busy covers. On `…35b967964d` five pale L-lane candidates lose their place to larger
chromatic components and reach neither pool. `lanes/tests/accent-acceptance.test.ts` asserts the
property that actually matters — **nothing dropped could have won**: the published accent out-chromas
every one of them, so the ordering and not the cut decided the accent. The cut is the obvious first
place for a cost round to look, and it is the second `[UNCALIBRATED]` number this pass leaves standing.

## 7. Files touched outside the strict ownership list

Recorded because the brief named an ownership list and these are not on it, and none of them is on the
do-not-touch list either:

- `tos/dump.ts` — one import swapped (`runPipeline` → `runChromaPipeline`) so the dump is the **merged**
  pool, plus the `accentCandidates` array D1 asks to be reported. Without this the "regenerate the dump
  with the merged pool" step would have regenerated the L-only dump.
- `tos/lanes/dump.ts` — `base` → `parse`, since the merged pipeline no longer returns a separate L-only
  parse.
- `tos/lanes/tests/{parity,accent-acceptance}.test.ts` — the two assertions that pinned the *pre-merge*
  split ("the foreground pool passes through untouched", "the accent pool is a superset") are now false
  by design: D2 grafts lane marks into the foreground, and the shared cost guard can drop an L
  component. Both were replaced with what the merge actually claims, not weakened.
- `tos/roles/tests/fixtures.ts` — gained `isoluminantInkAndField` and `writeChromaticBars` for D2's
  regression test.

Nothing in `tree.ts`, `lanes/{channels,nodes,constants}.ts`, `stability/`, `alpha/`, `falsifier/`,
`verify/` or `review-rounds/` was touched.

## 8. Constants

**None added.** D1 removes a ranking key and adds none. D2 reuses `COMPONENT_CHAIN_AREA_AGREEMENT` and
`TEXT_COMPONENT_LIMIT` unchanged. D3's level uses an order statistic of the image's own pool. The one
new named export is `MERGED_ALGORITHM_VERSION` in `candidate.ts`, a `[UNCALIBRATED]` *label* that
nothing reads as a number; `constants.ts`'s `ALGORITHM_VERSION` is left alone so the round-1 artefacts
keep meaning what they said.

## 9. The verification sweep

### (a) Test suites — 79 tests, 5 suites, 0 failures

`node --experimental-strip-types --test` over `prototypes/p2-tree/{alpha,falsifier,tos}/tests/*.test.ts`,
`tos/{lanes,roles}/tests/*.test.ts` and `verify/verify.test.ts`. Two acceptance cases carried the merge:

- `lanes/tests/accent-acceptance.test.ts` — the coral publishes on `…35b967964d` (D1's case), asserted
  structurally rather than as a hex, plus the new assertion that `candidate-chroma.ts` returns
  `candidate.ts`'s palette byte for byte;
- `roles/tests/acceptance.test.ts` — `…d859a69094` still publishes the artwork's own black `#070506`
  through a text group, demo-20 still has zero forbidden twin pairs and zero contract violations, and
  the role-swap check is still a no-op on all twenty covers.

New: `roles/tests/isoluminant-text.test.ts` (D2's regression case, §4 above).

### (b) Dev loop, demo-20

`20 ok · 0 failed`, **0 contract violations, 0 forbidden twin pairs** over the twenty published palettes.
Role-stage recall against the pre-merge measurement in `roles/NOTES.md`:

| | cycle-2 pre-merge | merged |
|---|---|---|
| covers yielding ≥ 1 text group | 17/20 | **19/20** |
| foreground is the leading text group's colour | 13/20 | **16/20** |

Published foreground's minimum |raw APCA| over the rendered field, merged: median 30.3, mean 35.4,
minimum 2.9.

### (d) Reachability falsifier, endorsed-173, merged pool

The dump regenerated from `tos/dump.ts --set falsifier/out/endorsed-173.txt` is now the merged pool: the
L block unchanged and the a and b lanes appended (257 nodes against 123 on `…f39d397ba3`; 638 per cover
on demo-20). Reachability **did not regress, as the lanes-only-add-nodes argument predicts**:

| | cycle 1 (L only) | merged |
|---|---|---|
| endorsed colours reachable from retained nodes | 1210/1397 = 86.6% [84.7–88.3] | **1284/1397 = 91.9% [90.4–93.2]** |
| reachable from the control set (unchanged by construction) | 508/1397 = 36.4% | 508/1397 = 36.4% |
| **pre-registered falsifier rate** (line: >25% fires) | 47/1397 = 3.4% [2.5–4.4] | **24/1397 = 1.7% [1.2–2.5]** — not falsified |
| unreachable from both (the control's own ceiling) | 140 | 89 |

The chromatic lanes recovered 74 endorsed colour slots that no L-lane node could reach, 23 of which the
control set could reach — which is the isoluminant blindness, priced.

One provenance detail, so it is not discovered later: `tos/out/endorsed-173.nodes.jsonl` was written
before the `accentCandidates` array was added to `tos/dump.ts`, so that file carries the merged **nodes**
(which is all the falsifier reads) and not the accent measurements. `tos/out/demo-20.nodes.jsonl`, which
is what review rounds are built from, carries both — 638 nodes and 109 accent candidates per cover on
average. Regenerating the endorsed dump would not move a reachability number, since the node data is
identical.

### (e) Cost

Measured in one sitting on one machine, so the ratio is the number to trust; the absolute figures in
`roles/NOTES.md` were taken under different conditions and are not comparable line for line.

| | demo-20, sequential, ms per cover |
|---|---|
| `runPipeline` — the same code with the lanes switched off (L only) | **235** |
| `runChromaPipeline` — the merged parse, three lanes | **617** |
| ratio | **2.63×** |
| `candidate.paletteOf` end to end, including the assembly walk | **627** mean (median 685, min 196, max 1,572) |

**The lanes are the whole of the cost and the merge added none of its own.** Two extra trees, two extra
stability passes, two extra retained-node constructions and their share of the distance transforms is
2.63×, which is the figure the lane worker predicted for the accent-only version. The role stage's own
cost did not grow: the text detector's component budget is shared across the lanes rather than tripled,
and D1's removal of the APCA-first accent ranking took a ramp minimisation per accent candidate back out
of the hot path (the measurement is still computed, but only once per published cluster rather than as a
sort key).

Where a cost round should look, in order: the shared `TEXT_COMPONENT_LIMIT` cut (§6), and then the
distance transform per component, which the chromatic lanes now pay for twice more.
