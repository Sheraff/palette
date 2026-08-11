# The bounded iteration's keep-or-kill round — the two arms, pairwise

**Staged, not installed.** Prototype orchestrator P1, 2026-08-11. The one round granted by
`DESIGN.md` § *V1 — the one bounded iteration (reviewer ruling, 2026-08-05)*, item 4.

| | |
|---|---|
| round kind | **pairwise** (already implemented: two blinded sides on the real mock) |
| items | **8** — the SAME eight the predecessor round served |
| batchId as staged | `b-20260811-9d47` (opaque date-serial; rename freely, nothing downstream of mine depends on it) |
| purpose | `arm` |
| fixture | `batch.json` — repo-relative `imagePath`s, `imagePathsRelativeTo: "repo-root"`; the installer rewrites them to absolute, the same convention as `src/review-server/fixtures/demo-batch.json` |
| never install, never serve | `KEY.json` — the blinding salt, the variantId → arm mapping, the true `algorithmVersion`s, and the predecessor round's per-item grades |
| kept only as a negative test | `batch.negative-test.json` — the predecessor round's retired first staging; it must **fail** the id-surface scan |
| material | `data/emitter/a-demo-20-2026-08-05-v1.jsonl` and `aprime-demo-20-2026-08-05-v1.jsonl`, rows `kind=p1-emitter-row`, 20/20 ok in both, escape branch fired on neither |
| attribution | `fingerprint.gitCommit 6b40db9`, `dirty false` — the commit that carries the emission of record |

## What this round is for

`DESIGN.md` § V1 granted exactly four things — a chromatic residual density for one arm
(`DESIGN` item 11), a λ recalibration plus disentangling the other arm's collapse degeneracy
(λ = 0.1, `[MEASURED]`), a re-emission of demo-20, and **this** round — after the
`MECHANISM-FALSIFIED` report on the predecessor round `phase2-pair-010` (zero strong grades, the
ink-recovery falsifier fired, coverage-vs-identity corroborated live, one arm degenerate 20/20
two-colour). The eight covers are held fixed **on purpose**: the keep-or-kill axis is the per-arm
grade **delta** on the same cover, which only exists if the cover set does not move.

## The question this round answers

**Which of these two palettes belongs to this artwork?**

Both sides come from the same measurement of the same file under the same preprocessing; the only
thing that differs is which objective priced the configuration. Per item, in the kind as it already
exists: grade **each** side `strong | acceptable | weak | unacceptable`, then state a preference
`a | b | no-preference`. The escape from the forced choice is `no-preference`, which is a statement
of its own and is already in the kind — the page prefills a preference only when the two grades
differ, and leaves an equal-graded item unjudged until a preference is pressed. Free text is the
primary channel and is never forced.

**Reading note carried forward:** in the predecessor round 5 of 8 preferences were *prefilled* from
differing grades and only 3 were pressed explicitly. Preference is therefore the weaker signal here;
the grades are the measurement, and the grades are what the delta axis reads.

## The eight items

Neutral one-line notes of what the two sides disagree about, read off the emitter rows. The server
shuffles the two sides per item under its own salt, so "one side / the other" below is not the order
the reviewer will see, and nothing here names an arm. The ordering of "one side / the other" is
stable across the tables in this document, so they can be read together — but it is mapped to an arm
**only** in `KEY.json`. Serve order is the table's order. itemId = the cover's image stem, so the
first column is also the filename under `00/`.

| # | itemId / artwork stem | what differs |
|---|---|---|
| 1 | `00007e976f2fb1819d1ec7e0cc2869f39d397ba3` | Both publish a near-white field with red ink. One keeps it flat and names two distinct reds (vivid `#f13303` foreground, darker `#b22013` accent); the other publishes a two-stop ramp between two near-whites `#e9e6dd → #e0e4e5` that are 0.0177 apart, and collapses both inks onto one deep red `#a4140c`. |
| 2 | `ab67616d00001e020000269ead63cf2376a6b67d` | One side publishes four mutually distinct colours flat — red background, near-black surface, yellow foreground, near-white accent. The other ramps near-white → yellow and puts two near-blacks in the ink roles (0.089 apart). |
| 3 | `ab67616d00001e02000025b4e66a00806cb6dd7d` | Field polarity inverts. One is a dark-grey flat field with a magenta `#be53a1` foreground and a black accent; the other is a near-white flat field with a dark-grey foreground and the same black accent. |
| 4 | `ab67616d00001e02000022e7e9d11c908479200b` | Same warm set, inverse assignment. One is a near-black background under a muted-rose surface with two orange inks; the other publishes three warm oranges as background/surface/foreground (all within 0.13 of one another) with the near-black demoted to accent. |
| 5 | `ab67616d00001e02000018e9b0ec8fc5ac790164` | One side is a two-colour palette: white field, one green `#70ba27` in both ink roles. The other is a white background over a pale-grey surface with two near-blacks as the ink pair (0.118 apart). |
| 6 | `ab67616d00001e0200000bbc3367a621256ce593` | Same pale-mint background on both. One keeps the field flat with a near-white foreground (0.086 from the field) and a vivid blue `#1016f0` accent; the other puts a near-black surface under the mint and swaps the ink roles — vivid blue foreground, near-white accent. |
| 7 | `ab67616d00001e020000099e97d17d28279e9184` | Near-identical publication. Same deep-blue field family and the same light-grey/near-white ink pair on both; one collapses the surface onto the background, the other publishes two deep blues 0.059 apart. |
| 8 | `ab67616d00001e0200001456cbd4881a798808bf` | The same three colours, differently assigned. One is a two-colour pale-blue field with a near-black ink pair; the other is a mid-grey field carrying the pale blue as foreground and the near-black as accent. |

## Pre-registered outcome reading

Written before any verdict is seen. Sides are de-blinded after release from the server's batch log
joined with `KEY.json`; the reading is on the **de-blinded** source, never on the reviewer's
displayed a/b, which is shuffled per item.

### (a) The keep-or-kill axis is grade DELTAS, per arm, per cover

The predecessor round's per-arm grades on these same eight covers are recorded in `KEY.json`
(`items[].predecessorGrades`) and in
`review-rounds/m3-priors-pairwise/verdicts.json`. Its distribution:

| arm (de-blinded) | strong | acceptable | weak | unacceptable |
|---|---|---|---|---|
| one arm | 0 | 1 | 4 | 3 |
| the other | 0 | 0 | 2 | 6 |

The repair is judged by **movement in these grades on these covers**, not by how different the new
palettes look and not by our own instruments. A palette that is measurably different and graded the
same has not been shown to be better. Per `DESIGN` item 7 (gradient-wrongness pricing is
unpredictable round-to-round), the delta is read as a **direction over the eight**, never as
per-verdict grade arithmetic on one item.

### (b) The kill condition, pre-registered (`DESIGN` § V1)

> *"Hard scope, no growth … **Kill condition, pre-registered:** if the iteration needs ANYTHING
> beyond this recorded repair, that fact itself is the kill signal."*

So: if the verdicts demand repairs outside the four granted items — a contrast/legibility term, a
salience notion, a colour-family notion, a distinctness reward, a candidate filter — **the kill
fires**, and it fires on the demand, not on the grade. It is not a prompt to implement the demand.
The falsification record filed on the predecessor round stands either way.

The indistinguishable-inks axis is **deliberately untouched** (`DESIGN` § V1): the contract floors
are the reviewer's. If the round dies there again, that is kill data, not a repair prompt.

### (c) Watch-classes, with what the fixture actually contains

Each is a `DESIGN` class, paired with the measured state of *this* fixture so the read is against
data rather than recollection.

**Unreadable / indistinguishable inks — fold item 1 (the falsifier that already fired).** The
predecessor round drew *"accent and foreground are impossible to distinguish on top of the surface"*
at min-|APCA| 2.55. In this emission the reported min-|APCA| over the rendered field, per side, are:

| item | one side (fg / accent) | the other (fg / accent) |
|---|---|---|
| 1 | 53.7 / 69.6 | 71.5 / 71.5 |
| 2 | 46.0 / 69.7 | 83.9 / 83.9 |
| 3 | 28.9 / **8.8** | 98.5 / 106.9 |
| 4 | 30.4 / 49.6 | **12.6** / 76.2 |
| 5 | 49.6 / 49.6 | 90.5 / 90.5 |
| 6 | **13.4** / 75.5 | **14.1** / **13.7** |
| 7 | 70.2 / 97.3 | 66.3 / 93.4 |
| 8 | 88.2 / 88.2 | 56.2 / 36.5 |

The floor is unchanged and still requested at `Lc 0` (`effectiveRawMagnitude 2.5`) on every side —
contrast is bounded, never rewarded, and that stance is not under repair. Five sides sit under 15:
item 3 (accent 8.8), item 4 (fg 12.6), item 6 (both sides, 13.4 / 14.1 / 13.7). If *those* are the
sides that draw the same verdict, fold item 1 fires a second time and the honest status is
`MECHANISM-FALSIFIED` again — never answered with an APCA reward term. Read it against **fold item
10**: identity can outrank legibility, so a low number is not itself the finding; the reviewer's
words are.

Separately, three sides publish the ink pair **collapsed** (item 1 one side, items 5 and 8 one side
each) — the contract's own answer to a near-twin. Closest *distinct* ink pairs: item 2 at 0.089,
item 5 at 0.118, item 4 at 0.122, item 7 at 0.131 on both sides.

**Missing chromatic identity — `DESIGN` item 11, the repair under test.** The predecessor round
named this twice in free text: item 2 *"missing too much of the artwork's identity. The artwork has
4 colors (white, yellow, red, black), and the background is yellow"*, and item 3 *"missing the
significant magenta from the artwork"* / *"incorrect background"*. In this fixture item 2 has one
side publishing four mutually distinct colours including that yellow and that red, and item 3 has
one side publishing a magenta. **The read:** whether the complaint recurs on those two covers, and
on which side. Recurrence on the side that carries the repair is the repair failing at its own
located cause. A new complaint of the same class on a cover that did not draw one before is the same
axis arriving from a new direction, not a separate finding.

**Salience / shadow sourcing — `DESIGN` item 8.** This mechanism has no salience notion; mass and
extent are its only axes. If graded-down sides are the ones whose foreground or accent came from a
shadow or an incidental region, that is fold item 8 confirmed on our own output, and per that item it
feeds the **paradigm verdict**, not a term tweak.

**Accent family — `DESIGN` item 14** (the accent should sit in a different colour *family* than
background/surface; this mechanism has no family notion). Measured on the fixture — OKLab chroma,
against the region boundary of 0.05 the contract already uses to call a colour neutral:

- **Chromatic accent against a neutral or near-neutral field** (the shape the reviewer asked for) —
  item 1 both sides (red accents on near-white fields), item 5 the green two-colour side, item 6 the
  side whose accent is the vivid blue `#1016f0` against pale mint.
- **Neutral accent against a neutral or near-neutral field** (the same-family shape) — item 3 both
  sides, item 5 the two-near-black side, item 7 both sides, item 8 both sides.
- **Mixed** — item 2, where one side's accent is near-white against a red background and the other's
  is black against a near-white background; and item 4, where one side's accent is the near-black
  against three oranges while the other's is a light orange (h 72°) over a near-black background and
  a rose surface (h 11°).

Item 6's blue-on-mint side is the cleanest instance of the shape item 14 describes; whether it is
graded up for it is the read.

**Banding / stops — `DESIGN` items 12–13.** Within these eight there are **two ramps, both 2-stop
`[0, 1]`, both on the same side** (item 1: `#e9e6dd → #e0e4e5`; item 2: `#fafaf8 → #fcd000`);
every other side of every other item is flat. 2-stop was the winning shape in every cross-arm round,
so the banding class is **structurally under-represented in this round** — a quiet result here is not
evidence that the stop-buying risk is absent.

The mid-stop ramps this emission did buy sit on covers **outside** the eight, and are listed so the
read is not mistaken for coverage:

| run | cover | stops |
|---|---|---|
| `a-…-v1` | `ab67616d00001e0200000ee5a62175fc8d58e0af` | 3 — `[0, 0.5, 1]` |
| `a-…-v1` | `ab67616d00001e02000013cdd885595a94002abc` | 3 — `[0, 0.5, 1]` |
| `a-…-v1` | `ab67616d00001e02000023e98b7381eaed77a9cb` | 3 — `[0, 0.5, 1]` |
| `aprime-…-v1` | `ab67616d00001e0200001a9be12b7116a8247378` | 3 — `[0, 0.5, 1]` |

Four covers, one interior stop each, always at exactly 0.5 — the ramp grammar's mid-point, not a
placement the search chose freely. `DESIGN` item 13's v1 reading rule (*"many-stop ramps at tiny
per-stop cost are the banding failure the reviewer already named"*) is therefore **checked and not
triggered at emission**: no 4-stop ramp exists in either run, and no ramp in the round carries an
interior stop. The rule stays live for the next emission, not for these verdicts.

**Margins — `DESIGN` item 15** (the reviewer grades margins; optimizers sit on floors). Sub-0.03
role pairs **inside the round: exactly one** —

| item | side | pair | distance | its bar | multiple |
|---|---|---|---|---|---|
| 1 | the ramped side | background / surface | **0.0177** | 0.0163 | **1.09×** |

That one pair is also the two endpoints of that side's ramp, so it is a double datum: a two-stop
ramp whose ends are 1.09× the same-colour bar apart can read as *no visible gradient* or as
*banding*, and which one it draws is informative either way. Across the full emission (all 20
covers), sub-0.03 distinct pairs are 2/102 for one run and 6/112 for the other, minimums 0.0181 and
0.0144 — comparable to the pre-round measurement in `DESIGN` item 15 (4/80 and 3/106) and still no
epsilon-sitting.

**Foreground/accent ordering — `DESIGN` item 6.** New datum, pre-registered here because it is
readable in advance: the F/A-swap energy delta is **exactly 0 on every side of every item where the
two inks are distinct** (it is `null` on the three collapsed sides). The two energies are indifferent
to which ink is foreground and which is accent; the assignment comes from decision 3's ordering
convention, not from the minimisation. So **any role-swap request in this round lands on a zero
delta**, and per `DESIGN` item 6 that makes the ordering — not the currency — the weak part, and
decision 3's deferral gets revisited. This is a diagnostic reading, not a granted repair; if it is
what the verdicts demand, the kill condition in (b) is what governs.

**Search honesty.** Both runs are `searchCertificate: UNCERTIFIED-V0`; 14 of 16 sides hit the
budget (`effort.budgetExhausted`). Reported optimality gaps to the first runner-up are 0.0003–0.0117
nats on one arm and 0–3178 bits on the other. A grade is a grade on the palette that was published;
none of this excuses one, and none of it is offered as an explanation of one.

## What is not being asked

No λ round, no new round kind, no new metric, no second iteration. This is the one round § V1
granted, and the scope does not grow on the way to it.

## Blinding

`batch.json` is safe to read: `variantId`s are `sha256(salt · itemId · source)` truncated — opaque,
unique per item, and **not** recomputable from the fixture, because the salt exists only in
`KEY.json`. Both sides of every item carry one shared `algorithmVersion` (the two true ones,
`p1a-0.2.0` and `p1ap-0.2.0`, name their arm; they are in `KEY.json`) and an identical
`preprocessingVersion`, asserted equal across the two runs before it was carried through. Sides are
emitted sorted by `variantId`, so file position carries no signal either. `validate.mjs` asserts all
of this, plus that the two sides of an item are separable by nothing but the palette.

On top of that, the **id surface**: `validate.mjs` walks every string in the fixture — ids, paths,
fingerprints, `fundedBy` — against the forbidden token classes. The list is the predecessor round's
(milestone tokens, `falsifier`, "prior" as a side label, item ordinals, arm names, prototype slugs)
plus **one new class: the iteration marker** (`v0`, `v1`) and the words naming the decision
(`keep-or-kill`, `kill`). An iteration marker on a served string would tell the reviewer that this
cover has been graded before and that one side is a repair — that is a prior, and it is precisely the
prior this round must not plant. Consequently the blinded `algorithmVersion` is `v3-emitter-0.2.0`
with no iteration segment (the predecessor's was `v3-emitter-v0-0.1.0`), and `fundedBy` cites the two
runs as `data/emitter/*-demo-20-2026-08-05-*.jsonl`, a glob that resolves to exactly those two files
without spelling one.

The scan is checked twice, because a blinding check that cannot fail is not a check:
`batch.negative-test.json` (the predecessor round's retired staging) must trip it, and a synthetic
in-memory copy of *this* fixture with `…-v1-…` written into one `algorithmVersion` must trip it too —
the second probe exists because the retired fixture carries no iteration marker and so cannot prove
the new class works.

## Reproducing and checking

```
node research/v3/prototypes/p1-mdl/review-rounds/v1-keep-or-kill/build-fixture.mjs
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p1-mdl/review-rounds/v1-keep-or-kill/validate.mjs
```

The build is deterministic (it reuses `KEY.json`'s salt; two runs give a byte-identical
`batch.json` — verified by hash). `validate.mjs` runs the endpoint's own `parseBatch` from
`research/v3/src/review-server/batch.ts` — the same function `POST /api/batches` calls — over the
fixture with absolute paths, then checks every image resolves and hashes to the `inputContentHash`
**both** emitter runs recorded, that every fingerprint is complete and pins `6b40db9` / `dirty
false`, that the eight items are the predecessor round's eight in order, that `KEY.json` derives
every variantId and agrees with the version each emitter actually stamped, the blinding properties
above, and the id surface with both negative tests.

Last run: **8 items, 16 sides, all passed, exit 0**; 162 strings scanned in `batch.json` with 0 hits,
the retired fixture tripping 88, and the iteration probe tripping 2.

## One thing the installer must get right

Resolve the repo-relative `imagePath`s against the **main checkout root**, not a worktree root.
`readArtworkIdentity` stores the absolute path it was pushed with, and a worktree path would put a
prototype directory slug into the stored artwork identity — a blinding defect through a different
door. Every cover here exists at `<main-checkout>/00/<stem>.jpg`; verified (385 files present in
both checkouts, and all eight hash-matched against both emitter runs).
