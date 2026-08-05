# P2 round 2 — flat vs gradient

**Kind:** oracle-style ground truth. **Items:** 8 artworks, one question, one keystroke each. **No
palette is shown, and no candidate is on screen** — there is nothing to blind, because nothing is
being compared. **Staged 2026-08-04** by the round-2 staging worker; the main orchestrator installs
it. Files: `build.ts`, `fixture.json`, `validate.ts`, this document.

> **Restaged 2026-08-05.** The first staging was aborted at install for a blinding defect: the batch
> id and the schema version both carried the prototype token, and both are served — the schema
> version drives page routing and the batch id is on screen. Every served string is now free of
> prototype, arm and round tokens, and `validate.ts` walks every string field of the fixture to keep
> it that way. Item selection, the question and the wording are unchanged.

## Routing — for the main orchestrator

**No new page and no round kit is required.** This is a single plain enum question with one-keystroke
hotkeys and an escape — exactly the shape the **existing `/oracle` page** already serves. The only
thing owed is a `batchReviewPaths` branch for `field-gradient-labels.v1`, pending on your side.

**The fixture's only forced choice carries the `cant_tell` escape** (hotkey `u`). There is one
question, and it is answerable without filing a reading the reviewer does not hold.

> **This document is not servable.** Everything the fixture deliberately does not carry lives here:
> the constants under consideration, the source study, the per-artwork legacy record and the
> per-artwork category. `validate.ts` scans `fixture.json`'s raw bytes and fails on any of it. Same
> arrangement round 1 used for `mapping.private.json` — nothing was dropped, it was moved.

## The question

**Of this artwork's background field: is it flat, is it a gradient, or is it neither?**

That is the whole round. It is asked because the pipeline answers it 192 times a run and nobody has
ever checked its answer against the person the product is for.

### Why it is being asked now

Round 1 returned one sentence that priced a constant nobody had priced: on `…c5ac790164` the
reviewer wrote *"almost very good, but this artwork is flat, not a gradient"*. Worker G's Q2 then
measured the decision and found it **unsettleable by the labels we hold**
(`../../tos/stability/q2-laminarity/REPORT.md`):

- the shipped operating point publishes a progression on **69% of the covers where it publishes one
  at all**, against the 144 usable legacy gradient booleans;
- it scores **45.8% agreement**, *below* the 52.8% you get by always answering "flat";
- and the best cell of the 77-cell grid does not survive its own multiplicity correction —
  **0 of 77 cells survive Holm at alpha 0.05**.

A grid with no defensible cell is not a calibration. It is a ranking of bad options. The only
instrument that can break the tie is the primary judge, looking at the artwork, with nothing on
screen telling them what the machine thinks.

## Items

Eight artworks. Selection was fixed before any of them was looked at, and `build.ts` executes the
rule rather than restating it.

| # | image path | category | itemId | stratum | legacy gradient record |
|---|---|---|---|---|---|
| 1 | `00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg` | **anchor** | `fg-fc39e6beb57f` | thumbnail ≤320 | none |
| 2 | `0a/ab67616d00001e02000a8aa1dafa651976a7bb44` | legacy-ramp regression | `fg-37a9174a754c` | thumbnail ≤320 | **ramp** (unanimous) |
| 3 | `0c/ab67616d0000b273000c42c61ba60f69e5a40a29` | legacy-ramp regression | `fg-ef4671233211` | standard ≤640 | **ramp** (unanimous) |
| 4 | `images/doja.jpg` | legacy-ramp regression | `fg-6db5579b6d14` | standard ≤640 | **ramp** (unanimous) |
| 5 | `01/ab67616d00001e0200015a7a9909e03141e001e3.jpg` | legacy-flat fix | `fg-4fa6dcef2404` | thumbnail ≤320 | flat (unanimous) |
| 6 | `01/ab67616d0000b2730001c404b8a04a8789db8dab.jpg` | legacy-flat fix | `fg-ac7ca45674c6` | standard ≤640 | flat (unanimous) |
| 7 | `00/ab67616d00001e0200001448e1c8dadd225466f4.jpg` | unlabelled flip | `fg-377b1cc24ef3` | thumbnail ≤320 | none |
| 8 | `02/ab67616d00001e02000200344e34f02b55e8292a.jpg` | unlabelled flip | `fg-7b3b6cd56203` | thumbnail ≤320 | none (no state recorded) |

### The selection rule, verbatim

1. **The anchor** is `…c5ac790164`, the reviewer's own round-1 phantom. It is the case that opened
   the question, and it is drawn first.
2. **Items 2–4** are *all three* legacy-ramp regressions in the monotone-only flip list
   (`out/flips-monotone-only.txt`): covers the legacy corpus calls a progression, on which moving
   `MONOTONE_MIGRATION_FRACTION` to its literal value would stop calling them one. This is the
   costliest error class the change can commit, so the round buys every member of it.
3. **Items 5–6** are the first two by sorted image path of the legacy-flat fixes in the same list —
   covers the legacy corpus calls flat, which the change would stop calling a progression.
4. **Items 7–8** are the first two by sorted image path of the unlabelled flips, **excluding the
   anchor**, which is itself an unlabelled flip. Without that exclusion the round would be seven
   artworks wearing eight names.

**No substitution was needed.** Every category was full in the primary set, so the best-agreement
backfill was not drawn from. `build.ts` still implements the backfill and would record it in
`selection.counts.backfilled` and on stdout.

Ordering inside every category is a sort over the image path, so no artwork was chosen for how it
looks. `fixture.json`'s `items` array is sorted by **content hash**, not by category, and the serve
order is a seeded shuffle — so neither the file order nor the screen order carries the category.

### What the three operating points predict for these eight

This is the fact that makes the round decisive. **All eight are flips**: at the shipped point every
one of them is read as a progression and published as a gradient; at both proposed points every one
of them stops being one.

| point | `LAMINARITY_CUT` | `MONOTONE_MIGRATION_FRACTION` | predicts, on all 8 |
|---|---|---|---|
| **P1 shipped** `[UNCALIBRATED]` | 0.15 | 0.8 | **gradient** |
| **P2 monotone-only** | 0.15 | 1.0 | **not a gradient** |
| **P3 best-agreement** | 0.10 | 1.0 | **not a gradient** |

## What each outcome does

The reviewer's per-item answers *are* the calibration targets. There is no model answer, no legacy
flag and no published verdict recorded beside any item, so nothing in this round can be scored
against anything but the artwork.

**Declared before the round is released.**

### On `MONOTONE_MIGRATION_FRACTION` — the constant this round actually settles

- **≥ 6 of 8 answered `flat` or `neither`** → the shipped point is publishing progressions that the
  primary judge does not see. `MONOTONE_MIGRATION_FRACTION` moves from 0.8 to **1.0** — literal
  monotone migration, i.e. `NOTES.md` deviation 2 is reverted — and the constant loses
  `[UNCALIBRATED]`.
- **≥ 6 of 8 answered `gradient`** → the shipped point is right and the *labels* are wrong. The
  constant stays at 0.8, the 69% phantom rate is re-read as a property of the legacy gradient
  boolean rather than of the cut, and the next piece of work is the label source, not the ratio.
- **A 3–5 split either way** → neither point is selected. A constant that the primary judge
  half-agrees with on the covers built to discriminate it is not a constant that a scalar sweep can
  fix; the work moves to the gate below and the vocabulary below, and no value is written.

### On `LAMINARITY_CUT` — what this round cannot do, stated plainly

P2 and P3 differ on exactly one cover in the whole 69-cover verdict set, and **it is not one of
these eight**. This round therefore cannot separate them, by construction. Q2 already showed the
laminarity residual saturates above 0.2 while the monotonicity ratio moves the phantom rate from 83%
to 29%. If the round selects P2, `LAMINARITY_CUT` stays at 0.15 and stays `[UNCALIBRATED]` — the
honest state — and the cover that separates the two points goes into a later round on its own.

### On `UNREADABLE_COVERAGE_FRACTION` — what the escape answers price

The coverage gate (0.5, also `[UNCALIBRATED]`) runs **before** the laminarity test and gates out 124
of 192 covers, including 52 of the 68 legacy ramps — which caps *every* cell of Q2's grid at 63.9%.
All eight items here **passed** that gate. So:

- **≥ 3 of 8 answered `can't tell`** → the gate is admitting covers whose field the primary judge
  cannot read at all. The defect is the gate, not the ratio: `UNREADABLE_COVERAGE_FRACTION` is the
  next constant to be measured, and no laminarity constant is written until it is.
- **0–1 `can't tell`** → the gate is admitting readable fields on this slice, and the low agreement
  ceiling is a recall problem (ramps gated out), not a precision problem (unreadable covers gated
  in). The gate work is then about the 52 excluded ramps, not about these eight.

### On the verdict vocabulary itself

**If `neither` is the majority answer across the eight**, the finding is *not* about any cut. It says
the five-way verdict vocabulary is mis-specified: covers the pipeline sorts into a single field with
a progression across it are covers the primary judge sees as **several distinct colour areas, a
pattern, or a material** — and no value of any threshold in a flat-versus-progression test can
produce that reading, because that reading is not on the test's menu. In that outcome the
calibration is abandoned and the field-verdict vocabulary is redesigned before any constant moves.

### On the anchor specifically

Item 1 is the one artwork the reviewer has already judged in prose, but they judged it **beside a
palette**. Answering it again with no palette on screen separates two things round 1 could not:

- **`flat` or `neither`** → the round-1 note was a judgement about the *artwork*, and it is the
  ground truth this whole calibration is anchored to.
- **`gradient`** → the round-1 note was a judgement about the *palette's rendering* of a progression
  that really is there. The premise of this round would then be wrong, and the finding is recorded
  as such rather than argued away.

## The question set — a new schema version, and why

`labelSchemaVersion` is **`field-gradient-labels.v1`**, minted here; `batchId` is
**`field-gradient-labels-1`**. Both are deliberately neutral — the first staging used
`p2-field-gradient.v1` / `p2-field-gradient-1`, and that is the defect it was aborted for. Question
key `field-gradient`, kind `enum`, four answers: `flat` (1), `gradient` (2), `neither` (3),
`cant_tell` (u) — the escape.

Reuse of the standing ground-structure schema `group-a.v2` / `ground_type` was considered first — its
`flat_field` / `shaded_field` vocabulary is close — and rejected on two facts, either sufficient:

1. **`01/…89db8dab.jpg` (item 6) already carries a live `ground_type` answer** from
   `premise-disambiguation-1`. The server keys an answer by `(questionKey, imageId)`, so re-asking
   `ground_type` would write a second standing label for that pair with nothing saying which is
   current — and this round is not a supersession of that one, so `supersedesBatchId` would be false.
2. **`group-a.v2` offers no escape.** All six of its answers are substantive readings of the ground.
   A reviewer who cannot judge a field would have to file a reading anyway, and a forced reading is
   precisely the evidence a calibration target must not be built on.

The wording — stem, referent preamble, framing, glosses — is written for this round and carries no
placeholder. The framing states the criterion in plain language: *what the field does across itself,
not what it depicts*; near-enough-to-one-colour is flat; a subtle progression is still a gradient;
two colour areas meeting are **neither**, however soft the join, because softness of a join is never
the test; and `can't tell` is a real answer that is measured, not penalized.

## Provenance

### Logical names in the fixture → true repository paths

`generatedBy` and `builtFrom` are fields of a **served** fixture, and this round's builder and this
document live at paths that name the prototype and the round. A true path there is a leak in a field
nobody thinks of as reviewer-visible, which is exactly how the first staging failed. The fixture
therefore carries logical names, resolved here:

| in the fixture | true path |
|---|---|
| `field-gradient-labels/build.ts` | `research/v3/prototypes/p2-tree/review-rounds/round-2-flat-vs-ramp/build.ts` |
| `field-gradient-labels/ROUND.md` | `research/v3/prototypes/p2-tree/review-rounds/round-2-flat-vs-ramp/ROUND.md` |
| `research/v3/data/oracle-premise/eval-set.json` | unchanged — it carries no token, so it is named outright |

The provenance is not lost; it is one hop away and out of the served payload. The round directory
holds exactly one `build.ts`, so the resolution is unambiguous.

- Selection source: `../../tos/stability/q2-laminarity/report.json`, `flips[]` at role
  `monotone-only` (22 covers), with role `best-agreement` (23 covers) as the declared backfill. The
  same sets are written as `../../tos/stability/q2-laminarity/out/flips-monotone-only.txt` and
  `out/flips-best-agreement.txt`. Study pinned to commit `4d7c9d89`.
- Legacy gradient booleans: `data/legacy/endorsements.json` joined on `entryId`, as
  `../../tos/stability/q2-laminarity/labels.ts` documents. They appear in this file and nowhere the
  server can reach.
- Renditions: five of the eight are rows of `research/v3/data/oracle-premise/eval-set.json` and carry
  its own `entryId`; the other three have no eval-set row, and the builder is recorded as the source
  of their rendition choice. Every width, height and long edge is read from the **file header** via
  `sharp`, never from a filename or a cached table, and where an eval-set row exists the builder
  asserts the header agrees with it.
- Content hashes are computed from the bytes on disk by `build.ts` and re-checked by `validate.ts`;
  the push re-checks them a third time and fails loudly if any file has moved under the round.

## Reproducing

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types build.ts     # rewrites fixture.json
NODE_NO_WARNINGS=1 node --experimental-strip-types validate.ts  # exit 0 or it does not ship
```

`validate.ts` asserts: 8 items; every image file exists under the repository root; every `sha256`
matches the bytes; exactly one question, of kind `enum`, with a stem, an instruction, a preamble, a
framing and four distinctly-hotkeyed answers; an escape answer present; no placeholder markers;
`serveOrder` covering every item exactly once; and a **deterministic rebuild** — it runs `build.ts`
twice more and byte-compares both results against the committed file.

The **leak scan** is the check the restage strengthened. It now walks **every string field of the
parsed fixture — values and object keys alike** — and then re-scans the raw bytes as a backstop, so
no field is exempt by being unfamiliar. Forbidden: the prototype, round and arm tokens (`p2`,
`p2-tree`, `prototype`, `round-1`, `round-2`, the candidate and family names), the constants and
measurement words under consideration, the pipeline's verdict vocabulary minus the two the reviewer
is offered, the legacy record, and palette output. `flat` and `gradient` are absent from that list
only because they are the reviewer's own answer vocabulary here.

The scan is itself checked before it is trusted: `validate.ts` runs it against the retired
`p2-field-gradient.v1`, in the field that id rode in on, and fails if no finding is produced — and it
runs it against this round's own schema id and fails if one is. Verified end to end as well: the
committed fixture was tampered with to carry the retired id, `validate.ts` failed with
`$.labelSchemaVersion leaks "p2"` plus the raw-byte backstop, and the file was then rebuilt and
byte-compared back to the committed bytes.
