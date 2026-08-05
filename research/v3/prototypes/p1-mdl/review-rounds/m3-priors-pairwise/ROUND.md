# M3 round 1 — the two priors, pairwise

**Staged, not installed.** Prototype orchestrator P1, 2026-08-05. Per
`research/v3/phase-2/PROTOTYPE_ORCHESTRATOR_BRIEF.md` §6.

| | |
|---|---|
| round kind | **pairwise** (already implemented: two blinded sides on the real mock) |
| items | **8** |
| batchId as staged | `b-20260805-4a2e` (opaque date-serial; rename freely, nothing downstream of mine depends on it) |
| purpose | `arm` |
| fixture | `batch.json` — repo-relative `imagePath`s, `imagePathsRelativeTo: "repo-root"`; the installer rewrites them to absolute, the same convention as `src/review-server/fixtures/demo-batch.json` |
| never install, never serve | `KEY.json` — the blinding salt, the variantId → source mapping, and the id continuity map |
| kept only as a negative test | `batch.retired.json` — the retired first staging; it must **fail** the id-surface scan |

### Restaged after a blinding defect

The first staging (`priors-pairwise-20260805a`) was **retired at install, before any item was
reviewed** — record `bc-msfp99so-4a5548d2`. Its itemIds were `m3-item-01`…`m3-item-08`, which put
the round ordinal on the served surface: an itemId appears in the review URL (`?item=`), in
`/media/:batchId/:itemId`, and in anything quoted back from a report. Second prototype to ship this
class, so it is now a campaign standard — no round, milestone, arm or prototype token anywhere a
reviewer can reach.

Three strings were carrying one, not just the itemIds, and the sweep found the other two:

| where | was | now |
|---|---|---|
| `itemId` | `m3-item-01` … | the cover's 40-hex image stem (campaign convention, cross-round joinable) |
| `batchId` | `priors-pairwise-20260805a` | `b-20260805-4a2e` |
| `fingerprint.algorithmVersion` | `p1-mdl-v0-emitter-0.1.0` — the prototype slug | `v3-emitter-v0-0.1.0` |
| `fundedBy` (**served**, via `/api/queue` and `/api/dashboard`) | cited `M1`, `falsifier`, "prior" | the same provenance in neutral words |

No verdict is scoped to the retired batch, so nothing needed rescoping. `KEY.json` carries
`retiredBatchId`, `retirementRecordId` and a per-item `retiredItemId`, so the retirement record
stays joinable to this staging.

**One thing the installer must get right:** resolve the repo-relative `imagePath`s against the
**main checkout root**, not a worktree root. `readArtworkIdentity` stores the absolute path it was
pushed with, and a worktree path would put a prototype directory slug into the stored artwork
identity — the same defect through a different door. Every cover here exists at
`<main-checkout>/00/<stem>.jpg`; verified.

## The question this round answers

**Which of these two palettes belongs to this artwork?**

Both sides come from the same measurement of the same file under the same preprocessing; the only
thing that differs is which prior priced the configuration. Every earlier answer P1 has about that
question came from legacy verdicts collected under old priors, and M1 got no signal out of them
(see below). This round asks it of fresh palettes, under current priors, from the only judge.

What the reviewer does, per item, in the kind as it already exists: grade **each** side
`strong | acceptable | weak | unacceptable`, then state a preference `a | b | no-preference`, with
a per-item **veto** available for the artwork itself. The escape from the forced choice is
`no-preference`, which is a statement of its own and is already in the kind — the page prefills a
preference only when the two grades differ, and leaves an equal-graded item unjudged until a
preference is pressed. Free text is the primary channel and is never forced.

## The eight items

Neutral one-line notes of what the two sides disagree about, read off the emitter rows. The server
shuffles the two sides per item under its own salt, so "one side / the other" below is not the
order the reviewer will see, and nothing here names a prior.

Serve order is the table's order. itemId = the cover's image stem, so the first column is also the
filename under `00/`.

| # | itemId / artwork stem | what differs |
|---|---|---|
| 1 | `00007e976f2fb1819d1ec7e0cc2869f39d397ba3` | Field polarity inverts: a flat near-white field carrying vivid red ink, against a deep-red→pale two-stop ramp carrying pale ink. All four roles differ. |
| 2 | `ab67616d00001e020000269ead63cf2376a6b67d` | Background flips near-white ↔ black; one side's ink pair is a saturated yellow, the other's is a mid-grey foreground with a near-white accent — the yellow appears in no role. |
| 3 | `ab67616d00001e02000025b4e66a00806cb6dd7d` | **Minimal-diff control.** Background, surface and foreground are byte-identical; only the accent differs — pure black (collapsed onto the foreground) against near-white (a separate fourth colour). |
| 4 | `ab67616d00001e02000022e7e9d11c908479200b` | Same accent on both sides (near-black). One side is a flat muted-rose field with a near-black foreground; the other is a yellow background over a mauve surface with a light-orange foreground. |
| 5 | `ab67616d00001e02000018e9b0ec8fc5ac790164` | Same pale background. One side keeps it flat with near-white ink (both inks collapsed); the other ramps pale→saturated green and puts vivid red in both ink roles. |
| 6 | `ab67616d00001e0200000bbc3367a621256ce593` | Same surface blue on both sides. One publishes it flat with near-white ink; the other publishes a two-stop ramp between two blues of the same hue family, with a dark-grey foreground and a near-white accent. |
| 7 | `ab67616d00001e020000099e97d17d28279e9184` | A flat light-grey field with near-white ink, against a near-black navy background over a near-black surface with a mid-blue ink pair. |
| 8 | `ab67616d00001e0200001456cbd4881a798808bf` | Light/dark inversion: the same two colours change places. Pale blue field + near-black ink, against near-black field + pale ink (and a second, lighter accent). |

**Why item 6 (`…0bbc3367a621256ce593`) is the gradient item.** Three covers in this run have one
side publishing a two-stop ramp where the other publishes a flat field. Two of them — items 1 and 5
— are already in this round for other reasons, and on both of them every role changes at the same
time, so a preference there cannot be attributed to the ramp. Item 6 is the clean one: the surface
is the *identical* blue on both sides and the ramp runs between two blues of one hue family, so the
field is as close to "same colours, ramp or not" as this run offers. The inks still differ
(near-white pair against dark-grey + near-white), and that is stated rather than claimed away.

## Pre-registered outcome reading

Written before any verdict is seen. Sides are de-blinded after release from the server's batch log
joined with `KEY.json`; the reading is on the **de-blinded** source, never on the reviewer's
displayed a/b, which is shuffled per item.

- **Consistent preference for the side that de-blinds to the mass-normalised prior** → that prior
  wins P1's internal experiment; it becomes the single energy carried into M4 and the
  serialization prior is retired to the record.
- **Consistent preference for the side that de-blinds to the schema-derived (serialization) prior**
  → the reverse, symmetrically.
- **Mixed** → no winner is declared. The result is read per cover against the two failure classes
  M1 already put on the table, cited here so the reading is attributable:
  - **coverage-vs-identity** — `DESIGN.md` § *Milestones* → **M1 OUTCOME** (recorded 2026-08-04):
    no pre-registered signal for either prior at any λ; attribution was *spread* for one prior and
    a *single culprit, `genericBits`*, for the other — "the residual pays for coverage, the
    reviewer pays for identity". If the mixed pattern sorts by whether the preferred side took the
    artwork's identifying colour or its most-covering one, that is the same finding arriving from
    live rounds.
  - **salience** — `DESIGN.md` § *Reviewer evidence …*, P5-round-2 addendum **fold item 8**: this
    mechanism has no salience notion, mass and extent are its only axes. If the graded-down sides
    are the ones whose foreground or accent came from a shadow or an incidental region, that is
    fold item 8 confirmed on our own output, and per that item it feeds the **paradigm verdict**,
    not a term tweak.

Two special reads, both pre-registered in `DESIGN.md` § *Reviewer evidence …*:

- **Any "unreadable foreground" verdict** — in a grade, a veto, or free text — feeds **fold item 1**
  directly. That item states the consequence in advance: *"if our foregrounds draw the same
  'unreadable' verdicts, that falsifies the ink-recovery story, not the tuning."* It is a
  falsification of the no-contrast-reward stance, and it is reported as such (`MECHANISM-FALSIFIED`
  is the honest status if it lands), never answered with an APCA reward term. Read it against
  **fold item 10**: identity can outrank legibility, so a low min-|APCA| diagnostic is not itself
  the finding — the reviewer's words are.
- **Item 6 prices gradient-on-flat**, which is **fold item 4**: a gradient on a flat artwork
  is a graded-down error, and that class is λ's calibration anchor from above. If the ramp side is
  graded down here, λ is too low and the M1 sweep gets re-read with this item in hand. Per **fold
  item 7**, this is read as a *direction* only — one item's grade arithmetic calibrates nothing.

## What is not being asked

No λ round, no new round kind, no new metric. The λ review round is gated on the M1 sweep not
being flat (`DESIGN.md` decision 2), and this round does not touch it.

## Blinding

`batch.json` is safe to read: `variantId`s are `sha256(salt · itemId · source)` truncated — opaque,
unique per item, and **not** recomputable from the fixture, because the salt exists only in
`KEY.json`. Both sides of every item carry one shared `algorithmVersion` (the two real ones name
their arm; they are in `KEY.json`) and an identical `preprocessingVersion`, asserted equal across
the two runs before it was carried through. Sides are emitted sorted by `variantId`, so file
position carries no signal either. `validate.mjs` asserts all of this, plus that the two sides of
an item are separable by nothing but the palette.

On top of that, the **id surface**: `validate.mjs` walks every string in the fixture — ids, paths,
fingerprints, `fundedBy` — against the forbidden token classes (milestone tokens, `falsifier`,
"prior" as a side label, item ordinals, arm names, prototype slugs). The one exclusion is
`purpose`, which is the server's own six-value enum and identifies nothing. The scan is checked
against `batch.retired.json`, which must trip it — a blinding check that cannot fail is not a
check.

## Reproducing and checking

```
node research/v3/prototypes/p1-mdl/review-rounds/m3-priors-pairwise/build-fixture.mjs
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p1-mdl/review-rounds/m3-priors-pairwise/validate.mjs
```

The build is deterministic (it reuses `KEY.json`'s salt; two runs give a byte-identical
`batch.json`). `validate.mjs` runs the endpoint's own `parseBatch` from
`research/v3/src/review-server/batch.ts` — the same function `POST /api/batches` calls — over the
fixture with absolute paths, then checks every image resolves and hashes to the
`inputContentHash` both emitter runs recorded, that every fingerprint is complete, the blinding
properties above, and the id surface with its negative test.

Last run: **8 items, 16 sides, all passed, exit 0**; 163 strings scanned in `batch.json` with 0
hits, and the retired fixture tripping 55 — the negative test holds.
