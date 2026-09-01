# Legacy verdict distillation — v2-3 → v3 fixtures

Three fixture files distilled from the v2-3 verdict warehouse, per `research/v3/PHASE_0_DECISIONS.md` §5.

| file | what it holds | consumed by |
| --- | --- | --- |
| `known-bad.json` | palettes the reviewer graded `weak-fallback` or `unacceptable` | the **known-worse gate** (§3): zero v3 outputs may match a reviewed-bad palette |
| `endorsements.json` | reviewer corrections (`endorsed-sample`) and palettes graded `strong` | the **concordance dashboard** and reachability diagnostics (§3) |
| `acceptable.json` | palettes graded `acceptable` — a **not-rejected baseline tier**, explicitly *not* endorsements | the concordance dashboard **only** — never a gate |

**These are not verdicts.** v2-3 verdicts are deliberately *not* imported into the v3 warehouse. These
files are data inputs for mechanical checks only. Nothing in them is a judgement about any v3 output;
every entry carries `"contract": "v2-3"` so a later reader cannot mistake it for a current verdict.

## Two rules that govern every consumer

**Matching is within the bar, never exact hex.** A v3 palette matches a fixture entry when all four role
colors fall within the v3 same-color bar — the "one ruler" of `PHASE_0_DECISIONS.md` §3. Never on hex
equality. The fixtures store exact hexes precisely so that any bar can be applied after the fact.
**The bar has since been calibrated and frozen** (see "The bar, as of 2026-08-03" below): it is
region-dependent Euclidean OKLab distance, `sameColorBar(a, b)` in `research/v3/src/contract/color.ts`.
Compare on `roleSignature`, or per role. Do **not** gate on
`paletteSignature`: it folds in gradient, midpoint and collapse, which do not survive into the v3 contract,
so it is for provenance and de-duplication only. This string travels with the data as `meta.matchSemantics`.

**Conflicting grades resolve by recency — the latest grade wins.** The v2-3 records carry `recordedAt`, so
when the same artwork and the same exact palette were graded more than once, the most recent grade is the
pair's standing verdict and earlier grades are history, not live contradictions. Reviewer's call, 2026-08-02.
Consequences, all applied in the data:

- A palette whose latest grade is `weak-fallback`/`unacceptable` is a **hard-gate** known-bad entry even if
  an earlier comparison called it `strong` — marked `resolvedByRecency: true` with the full `resolution.gradeHistory`.
- A palette whose latest grade is `strong`/`acceptable` is **absent from `known-bad.json` entirely**, even
  though an earlier comparison graded it bad. It lives wherever its standing grade puts it
  (`endorsements.json` or `acceptable.json`), also marked `resolvedByRecency: true`. What was removed is
  listed in `known-bad.json` → `meta.droppedByRecency`.
- `contested: true` now means one thing only: **conflicting grades sharing an identical timestamp**, which
  recency cannot break. Those would warn rather than block. **There are none** — checked, not assumed
  (`meta.identicalTimestampConflicts` is empty). So all **37 known-bad entries are hard-gate entries**.
- **Membership is the signal — no `standingGrade` filtering needed.** A palette whose standing grade is bad
  lives in `known-bad.json` and **nowhere else**: it is removed from `endorsements.json` and
  `acceptable.json` entirely rather than kept there flagged as superseded history. A mechanical consumer
  reading `endorsements.json` can therefore treat every entry as endorsed without inspecting any field.
  What was removed is listed in each file's `meta.droppedAsStandingBad` (1 from endorsements, 2 from
  acceptable), and the full history survives on the matching known-bad entry's `resolution.gradeHistory`.
  **The two good-tier files now have zero overlap with `known-bad.json`.**
- `supersededByLaterGrade: true` survives for good→good supersessions only (22 in `endorsements.json`,
  9 in `acceptable.json`) — e.g. a palette graded `strong` and later `acceptable`. Both grades are good, so
  the entry legitimately stays; the flag just says which word is the latest.

Carried in the data as `meta.gatePolicy`, `meta.recencyRule`, `meta.membershipRule`,
`meta.hardGateEntryCount` (37), `meta.droppedAsStandingBad`, and a `resolution` block on every graded entry.

Regenerate (deterministic — same inputs produce byte-identical files):

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/legacy/distill-legacy-verdicts.ts
```

Sources, all read-only for this workstream:

- `research/v2-3-eval/data/verdicts.jsonl` — the warehouse, one JSON record per reviewed item
- `research/v2-3-eval/data/batches/*.json` — batch definitions (carry the artwork's repo-relative path)
- `research/v2-3-eval/data/results/<label>/<image>.json` — cached corpus runs (path fallback)

---

## The reconstruction problem, and why it turned out to be small

The concern going in was that a verdict references its palettes only by batch and label, so the actual
colors would have to be recovered from the batch files. **The v2-3 warehouse turned out to be
self-contained for palette content**: 478 of 495 records embed a `palettes` object keyed by true label,
holding both compared palettes in full (four roles with rgb/oklab/hex, gradient flag, both collapse
flags, midpoint, processed width/height). The warehouse README states this explicitly — *"Each record is
self-contained: it can be mined without the batch, key, or result files that produced it."* Of the 17
records with no `palettes` object (all hand-recorded, batch `conversational`), 4 carry a bare hex palette
under `palette` plus a `gradient` boolean, 2 carry a single corrected role, and 11 carry no palette at all.

**Zero palettes were lost.** What the batch and results files *were* needed for is the other half of
identity: the artwork's repo-relative **path**. The warehouse stores only an image basename/id and a
content hash, so paths come from `batches/*.json` (`imagePath`, 478 records) with `results/*/*.json` as
fallback for the hand-recorded batch (11 records). 6 records — all note-only or a gallery-wide survey —
have no resolvable path, and none of them carry palette content, so nothing was dropped. They are listed
verbatim under `meta.unrecoverable` in both fixtures.

Verification performed during generation, all clean:

- every resolved path exists on disk; **197 distinct artwork files**
- **478/478** records whose `imageSha256` could be checked match the sha256 of the actual file bytes;
  0 mismatches
- image dimensions come from the file header via `sharp().metadata()`, never from a filename
  (`processedSizeMatchesHeader` is `true` on all 296 full-palette entries — v2-3 processed at native
  resolution, no downscale)
- no image id maps to more than one path (asserted, not assumed)

---

## Grade vocabulary found in the source data

From `research/v2-3-eval/serve-review.ts:44`, and confirmed against every record:

```
strong · acceptable · weak-fallback · unacceptable
```

**There is no grade literally named `weak`.** `weak-fallback` is the era's equivalent — the brief's "weak"
maps to it. Record counts by grade (a record's grade applies to the label(s) in `verdictApplies`):

| grade | records |
| --- | --- |
| `strong` | 298 |
| `acceptable` | 154 |
| `weak-fallback` | 27 |
| `unacceptable` | 3 |
| *(null — note-only, correction-only, survey)* | 13 |

`comparison` vocabulary observed: `ab` (375), `identical` (103), `note-only` (10), `absolute` (4),
`correction-only` (2), `gallery-survey` (1). `correctionsKind` is `endorsed-sample` on 375 records and
absent on 120; the warehouse README says records written before the field carry the same meaning, so
**every** correction in these fixtures is treated as an endorsed sample.

---

## Mapping rules

The v2-3 record shape that matters: `verdict` is the **absolute judgement of the preferred side**, and
`verdictApplies` lists the label(s) it applies to — the preferred label, or both labels when the reviewer
answered *equal* (and both, always, for `identical` items).

### known-bad.json

1. Take every record with `verdict ∈ {weak-fallback, unacceptable}`.
2. For each label in that record's `verdictApplies`, take `palettes[label]` — that is a palette the
   reviewer explicitly graded bad.
3. Resolve the artwork: repo-relative path, absolute path, content sha256, byte count, and rendition
   (`format`, `width`, `height`) read from the file header.
4. De-duplicate on `(artwork content sha256, exact palette signature)`. Merged entries keep **all**
   contributing evidence rows.
5. Apply the **recency rule**: build the pair's full grade history across the whole warehouse, take the
   latest-timestamped grade as its standing grade, and **drop the entry if that standing grade is not bad**.
6. Attach `grades` (every grade ever recorded for the pair), `standingGrade`, `resolvedByRecency`,
   `contested` (identical-timestamp conflicts only), and the full `resolution` block (see A1).

### endorsements.json

Two kinds, both marked in the entry's `kind` field:

- **`correction-endorsed-sample`** — a non-empty `corrections` object (the reviewer's *"one palette you'd
  endorse"*). 100 come from batch records, 2 from hand-recorded conversation. Four roles as hex, no
  gradient information (the correction UI never asked for one), so `gradient` is `null` and
  `completeness` is `roles-only` (4 roles) or `partial` (fewer).
- **`grade-strong`** — a palette graded `strong` via `verdictApplies`, marked as such. 256 full palettes
  from batch records plus 4 `roles-only` palettes from hand-recorded `absolute` conversational records
  (batch `conversational`, label `calib-2`, which carry a hex palette and a gradient boolean but no
  midpoint or collapse flags).

De-duplication is on `(kind, artwork content sha256, exact palette signature)`; merged entries keep all
evidence rows. Every entry carries `"uniqueBest": false`.

### acceptable.json

Every palette graded `acceptable` via `verdictApplies`, same entry shape and scoping metadata as
`endorsements.json`, kind **`grade-acceptable`**, de-duplicated the same way.

> **This is a not-rejected baseline tier for the concordance dashboard ONLY.** These are explicitly **not
> endorsements**. Matching one of these entries means *"the reviewer once found this palette acceptable"* —
> nothing stronger. It was not preferred, not called good, and carries no claim that it is a target worth
> reaching. Never a gate, never a fitting target. The tier sits **below** `endorsements.json`, and the file
> says so in `meta.purpose` and in every entry's `epistemology`.

It exists because of an asymmetry worth being able to see on the dashboard: a v3 palette matching nothing
in `endorsements.json` has not thereby been rejected. This tier is how you tell "never seen" from "seen and
found tolerable".

> **`strong` ≠ unique-best.** The v2-3 warehouse epistemology is **censored and relative**: a grade was
> given to the winner of whatever blinded pair the reviewer happened to be shown, so it says "this was the
> better of these two, and it was good" — never "this is the best palette for this artwork". Several
> palettes can be valid for one artwork. The warehouse's own `correctionsKind: "endorsed-sample"` says the
> same thing about corrections: *one palette the reviewer would endorse — a sample from a possibly-
> multi-valid set, never an oracle*; an empty or partial correction is **not** disagreement. Use these
> entries for concordance and reachability ("can v3 reach this palette at all?"), never as targets to fit.
> Concrete proof from the data itself: 5 known-bad entries were also graded `acceptable` or `strong` in a
> different comparison — see A1.

### Fields on every entry

`contract` (always `"v2-3"`), `entryId` (stable 16-hex digest of artwork hash + palette signature),
`artwork`, `palette`, `paletteSignature`, `roleSignature`, `gradientAdvisory`, `evidence[]`. Each file's
`meta` additionally carries `matchSemantics` (decision 2) and the full source/count block.
Every color carries `hex`, `rgb`, and a nearest `name` from `colornames-oklab`
(`research/src/color-name.ts`) — presentation only, never an input to any check.

`evidence[]` preserves the free-text record: `warehouseLine`, `batch`, `label`, `recordedAt`,
`comparison`, `verdict`, `preferredLabel`, `tags`, **`notes`**, and `source` for hand-recorded rows.
23 of 37 known-bad, 115 of 351 endorsement, and 82 of 166 acceptable entries carry at least one non-empty
note. The notes are there for later human adjudication; they are not inputs to any mechanical check.

---

## Contract scoping — read before comparing gradients

Every entry carries this string in `gradientAdvisory`:

> v2-3 gradients reuse background/surface as the endpoints and pin the midpoint at t=0.5; v3 stops are
> decoupled from roles, so gradient comparison against this entry is advisory only. Role-level color
> matching is the reliable signal.

Concretely, the old contract rendered a gradient as
`linear-gradient(135deg in oklab, background 0%, midpoint 50%, surface 100%)`. There was no independent
stop list, no stop count 3–4, and no position freedom. In the v3 contract stops are decoupled from roles
and positions are free. So:

- **Reliable:** the four role colors. Compare on `roleSignature`, or per role.
- **Advisory only:** `gradient` (boolean), `midpoint`, and `collapse`. A v3 palette with different stops
  is not thereby different from a v2-3 entry, and a v3 palette with matching stops is not thereby the same.
- The **known-worse gate keys on role-level identity** (decision 2 above: all four roles within the
  same-color bar), not on the full `paletteSignature`, or it will silently stop firing the moment the
  gradient representation changes. `roleSignature` is provided for exactly this purpose.

`processedSize` records the width/height v2-3 processed; `rendition` records what the file header says.
They agree everywhere, which is worth knowing: these palettes were produced at native resolution.

---

## Counts (regenerate to refresh; also in each file's `meta.counts`)

| quantity | value |
| --- | --- |
| warehouse records read | 495 |
| records with embedded `palettes` | 478 |
| records with hex-only `palette` (hand-recorded) | 4 |
| records with non-empty `corrections` | 102 |
| records carrying no palette content at all | 11 |
| artwork path resolved from batch files | 478 |
| artwork path resolved from cached results | 11 |
| artwork path unresolvable | 6 (all note-only / survey — no palette content lost) |
| **palette instances recovered** | **830** |
| **palette instances unrecoverable** | **0** |
| labels in `verdictApplies` with no palette in the record | 0 |
| content hashes verified / mismatched | 478 / 0 |
| distinct artwork files touched | 197 |
| distinct artwork files appearing in the fixtures | 177 (152 sharded corpus, 25 dev set) |

| fixture | entries |
| --- | --- |
| **known-bad** | **37** (45 graded instances → 40 pairs → 3 dropped by recency) |
| **known-bad hard-gate set** (`contested: false`) | **37 — all of them** |
| known-bad marked `contested` (identical-timestamp conflict) | 0 |
| known-bad marked `resolvedByRecency` | 3 |
| known-bad dropped by recency (listed in `meta.droppedByRecency`) | 3 |
| known-bad, `standingGrade: weak-fallback` | 33 |
| known-bad, `standingGrade: unacceptable` | 4 |
| known-bad distinct artworks | 26 |
| **endorsements** | **351** |
| endorsements, kind `correction-endorsed-sample` | 92 (89 `roles-only`, 3 `partial`) |
| endorsements, kind `grade-strong` | 259 (255 full, 4 `roles-only`) |
| endorsements removed as standing-bad (`meta.droppedAsStandingBad`) | 1 |
| endorsements marked `supersededByLaterGrade` (good→good only) | 22 |
| endorsements distinct artworks | 173 |
| **acceptable** | **166** (from 244 graded instances, all full palettes) |
| acceptable removed as standing-bad (`meta.droppedAsStandingBad`) | 2 |
| acceptable marked `supersededByLaterGrade` (good→good only) | 9 |
| acceptable distinct artworks | 90 |
| endorsement entries overlapping known-bad by `roleSignature` | **0** |
| acceptable entries overlapping known-bad by `roleSignature` | **0** |
| identical-timestamp grade conflicts (checked) | 0 |

The `acceptable` tier de-duplicates hard — 244 graded instances collapse to 168 pairs, of which 2 are
removed as standing-bad, leaving **166 entries**, because the same palette was shown and found acceptable
across several batches. Evidence rows for surviving entries are all preserved; 82 entries carry at least
one non-empty note.

Not exported (see ambiguity A2): 15 ungraded losing sides of bad-graded A/B items.

---

## Ambiguities, and how each was resolved

### A1 — The same palette was graded both bad and good

**Found:** 36 (artwork, exact palette) pairs carry more than one grade across different comparisons. This is
the censored/relative epistemology showing through: the same palette wins one pairing and loses another.
Six of those pairs involve a bad grade — the ones that decide known-bad membership.

**Resolved by RECENCY (reviewer, 2026-08-02, superseding an earlier warn-not-block policy):** the
latest-timestamped grade is the pair's standing verdict. Every graded entry in all three fixtures carries a
`resolution` block with the full `gradeHistory`, `distinctGrades`, `latestGrade`, `latestRecordedAt`,
`resolvedByRecency`, `tiedLatestGrades`, and `supersededByLaterGrade`.

The six pairs that involve a bad grade, and where each went:

| artwork | roles (bg, surface, fg, accent) | grade history (oldest → newest) | outcome |
| --- | --- | --- | --- |
| `01/…1c404b8a04a8789db8dab.jpg` | `#070908 #070908 #fdf9fa #055226` | acceptable → **weak-fallback** | **stays in known-bad**, `resolvedByRecency` |
| `0b/…0b5fe0db38c29686e103dc` | `#f3f3f3 #f3f3f3 #010101 #012943` | unacceptable → **weak-fallback** | **stays in known-bad**, `resolvedByRecency` (both grades bad) |
| `0c/…0cd48fb26f462cd33760f6` | `#ffffff #ffffff #201f41 #b7f07d` | acceptable → strong → **weak-fallback** | **stays in known-bad**, `resolvedByRecency` |
| `01/…15083990110d3b1a4ea8a.jpg` | `#927f92 #fcfef9 #23232d #824892` | weak-fallback → strong → **acceptable** | **dropped** → `acceptable.json` |
| `0f/…0f815611cd5966187e2051` | `#dbdce1 #fbfbfb #1d1a21 #bebcbf` | weak-fallback → acceptable → **acceptable** | **dropped** → `acceptable.json` |
| `images/johns.jpg` | `#0d181c #0d181c #f7f8fa #ff5a62` | weak-fallback → **acceptable** | **dropped** → `acceptable.json` |

So known-bad went from 40 entries to **37**, and because there are **zero identical-timestamp conflicts**
(checked — `meta.identicalTimestampConflicts` is empty), all 37 are hard-gate entries. The three dropped
palettes are itemised in `known-bad.json` → `meta.droppedByRecency`, each with its grade history and the
file it now lives in, so nothing disappears silently.

**Cross-file consequence — resolved by removal (verifier caveat, 2026-08-02).** An earlier build kept the
superseded instances in the good-tier files, flagged `supersededByLaterGrade: true`, so one `grade-strong`
and two `grade-acceptable` entries were simultaneously known-bad. Because these fixtures are consumed
mechanically, that made correctness depend on a consumer remembering to filter. They are now **removed from
`endorsements.json` and `acceptable.json` entirely** and listed in each file's `meta.droppedAsStandingBad`
with the grade history and the file they moved to.

**The claim that matters is exact, and it is narrower than "the three files are disjoint".** What is 0
is the **good-tier ∩ known-bad** overlap — the one the known-worse gate depends on. Measured on
(`artwork.contentSha256`, `roleSignature`) over the three files as they stand:

| pair | overlapping keys |
| --- | --- |
| `endorsements.json` ∩ `known-bad.json` | **0** |
| `acceptable.json` ∩ `known-bad.json` | **0** |
| `endorsements.json` ∩ `acceptable.json` | **31** |

So the two **good tiers do overlap each other**, by 31 keys, and `acceptable.json` additionally holds
**9** entries whose `standingGrade` is `"strong"` (the other 157 are `"acceptable"`). That overlap is
harmless in itself — both good-tier files feed the concordance dashboard only, and `entryId` is disjoint
across all three files (0 shared ids) — but it is **not** a licence to concatenate the three files:
doing so double-counts 31 palettes. Read the tiers separately, or de-duplicate on
(`contentSha256`, `roleSignature`) first.

### A2 — The losing side of a bad-graded comparison

**Question:** when the *winner* of an A/B item was graded `weak-fallback`, the loser was presumably worse
still. Should it be known-bad? There are 15 such ungraded losing sides.

**Resolved: not exported, and settled (orchestrator, 2026-08-02) — stays excluded, no flag.** The brief says
"palettes the reviewer graded weak or unacceptable", and `verdict`/`verdictApplies` is the only place the
reviewer attached a grade to a specific palette. "Worse than something weak" is an inference, not a verdict,
and a hard gate built on inference will eventually block something nobody ever rejected. The count is kept
as `meta.counts.ungradedLosingSidesInBadRecords = 15`; that record is considered sufficient.

### A3 — where `acceptable` belongs

**Originally resolved:** exported nowhere — not bad enough to gate on, not an endorsement.
**Superseded (orchestrator, 2026-08-02):** exported as its own third fixture, `acceptable.json`, kind
`grade-acceptable` — a not-rejected baseline tier for the concordance dashboard only, explicitly not
endorsements. 244 palette instances → 168 pairs → **166 entries** after 2 are removed as standing-bad.
The instance count is `meta.counts.acceptableGradedInstances` (244) — renamed from the original
`acceptableInstancesNotExported`, which stopped being true the moment the tier was exported.
The reason the tier is worth having is the asymmetry it resolves: a v3 palette matching nothing in
`endorsements.json` has *not* thereby been rejected — it may match an `acceptable` palette, or simply never
have been shown, and only this tier tells those apart.

### A4 — Which label does a `corrections` object correct?

**Resolved: none of them.** A correction is a standalone palette assembled from swatch chips (exact
artwork pixels plus the colors of both palettes under review), not an edit of side A or side B. So
correction entries carry `label: null` in their evidence, and the record's own `verdict` and
`preferredLabel` are preserved in the evidence row for context. This matches the warehouse README's
description of the correction UI.

### A5 — Corrections carry no gradient information

**Resolved:** `gradient: null`, `midpoint: null`, `collapse: null` on correction entries, and
`completeness` is `roles-only`/`partial` rather than `full`. The review UI's correction control only ever
collected four role hexes; the live preview borrowed the gradient shape from whichever side was seeded, so
inferring a gradient from a correction would be inventing data. Never guessed.

### A6 — Partial corrections

**Found:** 3 corrections are incomplete — one with 3 roles (`rw-batch-roleflip`) and two single-role
conversational corrections (an accent `#d01510` on `images/placebo.jpg`, an accent `#706c6d` on
`0a/…0a2927c0f27657e4a2aeaa`).

**Resolved:** kept, with `completeness: "partial"` and only the roles actually set. The warehouse README is
explicit that partial answers are usable and that skipping is not disagreement, so a consumer must compare
only the roles present. Do **not** treat a missing role as a constraint.

### A7 — `identical` records grade two labels at once

**Found:** 103 records where both labels produced the same displayed palette; `verdictApplies` lists both.

**Resolved:** de-duplication on (artwork, palette signature) collapses them to one entry, and both label
rows survive in `evidence[]`. The warehouse README warns *"never mine an `identical` record as a genuine
preference for equality"* — nothing here does; `comparison` is preserved on every evidence row so a
consumer can filter.

### A8 — Hand-recorded conversational verdicts

**Found:** batch `conversational` (17 records) is where evidence relayed in conversation was written down
by hand. 4 are `comparison: "absolute"` with `verdict: "strong"` and a bare hex palette.

**Resolved:** exported as `grade-strong` with `completeness: "roles-only"` and the `gradient` boolean the
record carries, `source: "flo-direct-message"` preserved in the evidence row. The remaining 13 are
note-only, correction-only, or a gallery-wide survey; the 2 correction-only records became partial
endorsements (A6), and the 11 with no palette content produce nothing. One of those 11 is a gallery-wide
endorsement of 37 artworks at a given trunk commit — a genuine endorsement with **no per-palette content**,
so it cannot become a fixture entry. It is listed under `meta.unrecoverable` with its note intact.

### A9 — Artwork identity when the warehouse stores only a basename

**Resolved:** identity is **full path + content sha256 + rendition from the file header**, as
`CONVENTIONS.md` requires; the basename is kept only as `imageId` for cross-referencing back to the v2-3
tooling. Paths come from batch files first, cached results second; the script asserts that no image id
maps to two different paths, and verifies every recorded `imageSha256` against the real bytes.

Note that the fixtures span **two corpora and many renditions** — the sharded corpus (`00/`…`14/`: 300 px
and 640 px Spotify renditions, plus one 600 px file) and the dev set (`images/`: 340–1400 px, including
one HEIF at 483 px). All are JPEG except that one HEIF.
Known-bad renditions: 25×640 px, 12×300 px, and one each at 600, 700, 1400. Since the v3 palette attaches
to the *file*, not the artwork (`PHASE_0_DECISIONS.md` §1), a known-bad entry constrains only the exact
rendition it was judged on. The gate must match on `contentSha256`, never on album identity.

---

## Decision log

Four open questions were raised with the orchestrator and settled on 2026-08-02. All four are applied in
the generator and in the data.

| # | question | decision | where it lives now |
| --- | --- | --- | --- |
| 1 | Should contested known-bad entries block the gate? | **Superseded — see row 1b.** First answer was warn-never-block with 35 hard-gate entries. | — |
| 1b | *(reviewer, superseding row 1)* How do conflicting grades resolve? | **By recency: the latest-timestamped grade wins.** Latest grade bad → hard-gate entry marked `resolvedByRecency`; latest grade good → dropped from known-bad entirely, lives where its standing grade puts it. Identical-timestamp conflicts alone fall back to warn-not-block — **there are none**. Result: 37 entries, all hard-gate. | `known-bad.json` → `meta.recencyRule`, `meta.gatePolicy`, `meta.hardGateEntryCount` (37), `meta.droppedByRecency`, `meta.identicalTimestampConflicts` (empty); `resolution` per entry; A1 above |
| 2 | Exact-hex match, or within the same-color bar? | **Within the bar, on all four roles, never exact hex.** The bar was `[UNCALIBRATED]` when this was decided; it has since been calibrated per region and frozen. | `meta.matchSemantics` in all three fixtures; "Two rules" section above; "The bar, as of 2026-08-03" below |
| 3 | Export the 15 ungraded losing sides? | **No — stay excluded, no flag.** The recorded count is enough. | `meta.counts.ungradedLosingSidesInBadRecords`; A2 above |
| 4 | What to do with `acceptable`? | **Export as a third fixture**, `acceptable.json`, kind `grade-acceptable` — a not-rejected baseline tier for the concordance dashboard only, explicitly not endorsements. | `acceptable.json` → `meta.purpose`; A3 above |
| 5 | *(verifier caveat)* 3 standing-bad palettes sat in the good-tier files as flagged history. Is a flag enough? | **No — file membership must BE the signal.** Removed from `endorsements.json` (1) and `acceptable.json` (2) entirely; listed in `meta.droppedAsStandingBad`; good-tier overlap with known-bad is now 0. The stale counter `acceptableInstancesNotExported` was renamed `acceptableGradedInstances`. | `meta.membershipRule`, `meta.droppedAsStandingBad` in both good-tier files; A1, A3 above |

Decision 1 was raised by me, answered by the orchestrator (warn-never-block), then **superseded by the
reviewer on the same day** with the recency rule. Both are recorded above rather than one overwriting the
other, because the fixtures were built once under each and the counts differ (35 hard-gate entries under the
first answer, 37 under the second).

### The bar, as of 2026-08-03 — settled, for whoever wires the gate

**This section supersedes the earlier "still open" note.** The same-color bar (decision 2) was a
**v3-wide** open item, not a legacy-fixture one, and it has since **landed**. The reviewer bracketing
round ran twice (round 1 clarified + round 2, pooled), and it **refuted a single threshold**: the bar is
**region-dependent**, on quadrants of OKLab lightness 0.55 and chroma 0.05 — see
`PHASE_0_DECISIONS.md` §3 and §8, and the raw data in `research/v3/data/calibration/`. It is implemented as
`sameColorBar(a, b)` in `research/v3/src/contract/color.ts`, over `SAME_COLOR_BAR_BY_REGION` in
`src/contract/constants.ts`; when a pair straddles two regions the **larger** bar wins. The bar is
**frozen** at its per-region point estimates by decision `d-2026-08-03-same-color-bar-freeze` in
`research/v3/data/decisions/decisions.json` (no bracketing round 3; the light-saturated hue split is
deliberately **not** adopted), on the calibration-consequence analysis.

So a consumer of these fixtures **can compute a real match today** — call `sameColorBar()` per role
pair; do not re-derive a threshold, and do not fall back to exact hex. Two things to carry with it:

- **`POOLED_SAME_COLOR_BAR` (0.01535) is not the gate's bar.** It exists for corpus metrics and
  dashboards that need one number comparable across runs. Every *per-pair* judgement — including the
  known-worse gate — uses the regional `sameColorBar()`.
- **Hit counts computed before 2026-08-03 are still provisional** and should be re-run, because they
  were produced under an exact-hex approximation rather than the bar.

Each fixture's `meta.matchSemantics` **was** rewritten when the bar landed — an earlier draft of this
paragraph said it had deliberately been left describing the bar as pending, and that is no longer true.
All three files now carry identical, current wording naming the bar as the **frozen** region-dependent
`sameColorBar(pair)` of `src/contract/`, calibrated on bracketing rounds 1+2 and frozen 2026-08-03. The
fixture strings and this README agree; either can be read as the current statement.
