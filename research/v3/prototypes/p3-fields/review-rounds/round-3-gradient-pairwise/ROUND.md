# Round 3 — flat-vs-gradient pairwise. Eight covers, two treatments each.

**For the orchestrator, not the reviewer.** Nothing in this file is served. The reviewer sees only
what `/api/batches/<id>` carries, and the server builds that itself (`blindSidePayload`) — no file in
this directory reaches the browser.

Palettes from candidate `p3-fields-0.3.0`, commit `bead404`, run `run-coverage-220-0.3.0.jsonl`.
Staged from the worktree `.worktrees/p3-fields`.

---

## The question this round answers

> **Does this artwork's field read as shaded/graded, or flat?**

Operationalised as a pairwise preference between two treatments of the **same artwork**: one with the
published gradient as the field, one with the field flat.

The question is deliberately **version-independent**. It is a question about the *artwork*, not about
a candidate — "is there a shaded field here at all?" — so its answer calibrates ρ\* for any version of
the mechanism, not just `0.3.0`. If `0.4.0` moves every ρ by a constant, the reviewer's verdict on
whether cover `item-168` is shaded remains exactly as true as it was.

### What it is anchoring

ρ\* — the rank-correlation threshold above which the mechanism publishes a gradient — currently
**0.62**, marked **[UNCALIBRATED]**. Nobody has ever asked a human whether the artworks on either
side of that line are actually shaded. This round asks, on the eight covers closest to it.

### What funds it

Round 1's `item-11`: graded **strong**, and the reviewer's own comment on it, after two revisions of
hesitation, was *"i'm not sure i recognize a gradient in that artwork"* (verdict
`v-msf5q2ig-9bd0a4a8`, superseding `v-msf5poni-f61e47f2` and `v-msf5pwyy-88a2810c`, batch
`phase2-cal-003`). Round 1's ROUND.md branch (e) pre-registered exactly this: *"a note calling either
flat jumps ρ\* calibration to the front of the iteration queue."* It fired. This is the round it
jumped to.

`fundedBy`: `["v-msf5q2ig-9bd0a4a8"]`.

## Proposed kind

**pairwise** — the default batch kind; two sides per item, both graded, one preference
(`REVIEW_UI.md` §2; `parseBatch` in `src/review-server/batch.ts`).

| | |
| --- | --- |
| Kind | `pairwise` (no `kind` field on the push; absent means pairwise) |
| Mode | two sides on the mock, blinded as A and B |
| Grade scale | the four warehouse grades, per side: strong / acceptable / weak / unacceptable |
| Preference | `a` / `b` / **`no-preference`** |
| Veto | available per item |
| Notes | per-item, free text |
| Items | 8 |
| Purpose field | `calibration` — the round calibrates a threshold, not a mechanism |
| Batch id | the installer's to set; round 1's was `phase2-cal-003` |

### The escape, confirmed present

The forced choice carries an escape and it is **not** something this round has to add.
`PREFERENCES = ['a', 'b', 'no-preference']` (`warehouse/records.ts`), the pairwise page binds it to
the `n` key and prints it in the footer (`review-ui/index.html:43` — *"**a** prefer A · **b** prefer B
· **n** no preference"*), and `app.js` treats it as a statement that has to be pressed: when the two
grades are equal nothing is prefilled, so "no preference" is never entered by accident
(`app.js:95-98`). It is also the one preference value the warehouse documents as contributing no
ordering constraint.

That matters here more than usual, because "I cannot tell" is a **real and expected answer** on
borderline covers, and the decision rule below gives it its own branch rather than folding it into
either side.

---

## The item table

`itemId` carries the coverage-220 run's own zero-based index, so `#181` in a measurement and
`item-181` here are the same cover. Rows in descending ρ — the order the aggregate rule reads.

| itemId | best ρ | ρ − ρ\* | stops | geometry | background → surface | collapsed | imagePath |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `item-048` | 0.6498 | +0.0298 | 4 | linear | `#0b0310` → `#85d6d0` | — | `music-artworks/e/d/d/edd28ba0f4a489a0b3f1f5851003ede1.jpg` |
| `item-181` | 0.6385 | +0.0185 | 4 | linear | `#183966` → `#ffc7dd` | accent | `12/ab67616d0000b2730012db16a41f984c378a6071` |
| `item-039` | 0.6365 | +0.0165 | 2 | radial | `#0c0e0d` → `#101c36` | accent | `music-artworks/d/7/6/d76d845e33b98c986bb8b1297e49487b.jpg` |
| `item-114` | 0.6341 | +0.0141 | 4 | linear | `#eaeceb` → `#904039` | — | `09/ab67616d0000b2730009e00f495b4584cfdd4ef7` |
| `item-208` | 0.6323 | +0.0123 | 2 | radial | `#b7b29e` → `#75828b` | — | `03/ab67616d0000b2730003f2b6590090abe420d104.jpg` |
| `item-130` | 0.6228 | +0.0028 | 2 | linear | `#deb355` → `#fcdf99` | — | `0c/ab67616d00001e02000c4ff9e01aba5eae6cbec4` |
| `item-168` | 0.6221 | +0.0021 | 2 | linear | `#0b0800` → `#26211d` | — | `11/ab67616d0000b2730011a326091e7dd7df58b175` |
| `item-188` | 0.6217 | +0.0017 | 4 | linear | `#e1f8ee` → `#094f59` | — | `13/ab67616d0000b273001398589df77e24a722fe6a` |

ρ range **0.6217 – 0.6498**; all eight sit above ρ\* = 0.62, by between 0.0017 and 0.0298. Four
2-stop and four 4-stop gradients; six linear, two radial. Selection used **no by-eye judgement at
all** — no contact sheet was built, because nothing in this round's criteria is a visual class.

### How the eight were chosen

From `measurements/gradient-borderline-0.3.0.json`, the W9 draw pool: the 20 coverage-set-1 artworks
whose best rank correlation sits closest to ρ\* from either side.

1. Keep only the **10 with `publishedGradient: true`**. See the design limitation below — this is
   forced, not preferred.
2. Drop anything failing `validatePalette` on **either** treatment. One dropped:
   `02/…0002881a851f1e14c374562b.jpg` (ρ 0.6307), `I4.ramp-below-contrast-floor` ×2 — foreground
   `#bd3a88` over the rendered ramp at t = 0.361 and accent `#784d7b` at t = 0.268. Note *which* side
   fails: the **gradient** side is contract-invalid and the flat side passes. A palette that already
   fails the contract is not a question, and this one would have been a leading question.
3. Of the 9 survivors, keep the **8 closest to ρ\* by |ρ − ρ\*|**. Dropped:
   `music-artworks/e/2/0/e20395f…jpg` (ρ 0.6547, distance 0.0347).

---

## The design limitation, stated before the verdicts

**There is no force-gradient path.** Nothing in the candidate exposes a switch that publishes a
gradient on an artwork whose ρ falls below the threshold, and `src/` is read-only to the worker that
staged this round. So the *gradient* treatment can only exist for covers where `0.3.0` **already
published** one — that is, only for covers at ρ ≥ ρ\*.

Two consequences, both real:

1. **Every pair in this round is a published-gradient cover.** The below-boundary direction — "here
   is a cover at ρ = 0.58, does it look shaded to you?" — is not in this round and cannot be, without
   a dev-only force-gradient path. **Deferred**, named as owed work.
2. **The flat side is constructed here, not generated.** It is the published palette with `gradient`
   set to `null` and nothing else touched. It stays contract-valid because the gradient's ends *are*
   the field roles (reviewer's ruling, 2026-08-04: *"the first stop is the `background` and the last
   stop is the `surface`"*), so removing the ramp removes nothing the roles do not already carry —
   re-verified with `validatePalette` on all 16 palettes, `VERIFY.md` check 7. Its true name says so:
   `variantId` and `algorithmVersion` are both `p3-fields-0.3.0-flat-treatment`, so no later reader
   can mistake it for something `0.3.0` emitted.

### Blinding: the shuffle is unguessable, the sides are not

Stated plainly because `blinding.ts` states it plainly, and it names *this exact shape*:

> *"a two-arm batch where one arm is always flat and the other always a 2-stop gradient is unblinded
> 24/24 from the served payload alone, by the one-line rule 'the side with a gradient is arm-beta'"*

That is this round. The reviewer will know which side carries the gradient, because a gradient looks
like a gradient. **This is not a defect here** — the manipulation *is* the question, not a hidden
treatment, and there is no version of "does this read as shaded?" that can be asked while hiding
which side is shaded.

What the salted shuffle still buys, and why side order is left to the server anyway: it removes
**position bias**. The gradient side is not always A. No side order was chosen by the staging worker;
`items.jsonl` carries a fixed pushed order (index 0 = gradient, index 1 = flat) and `blindItem` maps
pushed indices to blinded A/B per item from the per-batch salt. The payload carries nothing that
separates the sides beyond the palettes themselves — `blindSidePayload` serves roles, collapse flags,
stops and `fieldCss`, and no variant id, no fingerprint, no palette hash. `VERIFY.md` check 5
confirms the two sides differ in `gradient` and in **nothing else**, so no incidental field can carry
a second signal.

---

## The decision rule — written before any verdict exists

### Per cover

The preference is the datum; the two grades are context.

| verdict | reading | effect on ρ\* |
| --- | --- | --- |
| **prefers the flat side** | the published gradient was **false** — this artwork does not read as shaded, and 0.3.0 published a ramp on it anyway | ρ\* must move **above** this cover's ρ |
| **prefers the gradient side** | the artwork does read as shaded at this ρ; publishing here was right | ρ\* stays **below** this cover's ρ |
| **no preference** | **no signal.** Not a tie broken toward the status quo, not weak evidence for either. Recorded and excluded from the aggregate | none |

A veto removes the cover from the round entirely and from the aggregate.

### Aggregate

**ρ\* is set above the highest ρ at which the reviewer preferred flat — if the preferences are
consistent.** Consistent means: every cover below that ρ that got a preference also got a
flat-preference, and every cover above it that got a preference got a gradient-preference. Then
ρ\*<sub>new</sub> = the smallest ρ among gradient-preferred covers, or — if none of the covers above
the flat-preferred ones got a preference — ρ\*<sub>new</sub> is reported as *"above X, unbounded by
this round"* rather than invented.

**Contradictions are surfaced, never averaged.** If the reviewer prefers flat at ρ = 0.6221 and
gradient at ρ = 0.6217, that is not a threshold at 0.6219 — it is evidence that **ρ is not the
variable the reviewer is answering on**, and the right output is a report saying so, not a number.
No mean, no median, no logistic fit over eight points. Eight items cannot carry a fitted threshold
and this round will not pretend otherwise.

### Outcome branches

Every case, with what the orchestrator does.

**(a) Gradient preferred on all eight.**
ρ\* = 0.62 is **confirmed at its lower edge for 0.3.x**, and the question is **closed for 0.3.x**. It
is not confirmed as *optimal* — this round never tested below the boundary, so "0.62 could be lower"
remains open and untested. Remove ρ\* calibration from the iteration queue; the [UNCALIBRATED] mark
becomes "calibrated from above only, 8 covers, 2026-08-05".

**(b) Flat preferred on all eight.**
ρ\* is **too low across this whole band** — 0.62 through 0.65 is publishing gradients nobody sees.
This round bounds it only from below (ρ\* > 0.6498) and cannot say how much higher it belongs. Action:
raise ρ\* above 0.6498 as an interim, and **immediately queue a second round one band higher**
(the ρ ∈ [0.65, 0.78] covers), because a threshold pushed past the top of its own evidence is a guess.

**(c) Mixed and consistent** — flat preferred below some ρ, gradient above.
The intended outcome. Apply the aggregate rule; report ρ\*<sub>new</sub> with the two ρ values that
bracket it and the count of covers each side. This narrows ρ\* to a measured interval for the first
time.

**(d) Mixed and contradictory.**
Report it as the finding. Candidate explanations to check before touching ρ\*, in order:
**(i)** stop count — four of the eight are 4-stop and four are 2-stop, and a 4-stop ramp may read as
shaded at a ρ where a 2-stop one does not, in which case ρ alone is the wrong gate;
**(ii)** geometry — two radials among six linears, and the display mapping renders every family as a
135° linear, so a radial fit that scores well may render as something the artwork never showed;
**(iii)** field contrast — `item-130`'s two ends are `#deb355` → `#fcdf99` (a near-invisible ramp)
where `item-114`'s are `#eaeceb` → `#904039`. **Do not move ρ\* on a contradictory round.**

**(e) Mostly `no-preference`** (≥ 5 of 8).
The instrument, not the threshold, is what this round measured. Reading: at these ρ values the two
treatments are **indistinguishable on the mock**, which is itself an answer — if the reviewer cannot
tell whether the field is graded, the gradient is not doing perceptual work near the boundary and
ρ\*'s exact value matters less than the queue assumes. Report upward; do not re-run the same round
with more covers at the same band.

**(f) Any note calling a *cover* flat while preferring the gradient side** (or vice versa).
The comment outranks the preference for the ρ\* question, because the question is about the artwork
and the preference is about a palette. Surface both; do not silently reconcile them. Round 1's
`item-11` was exactly this shape — graded **strong** with the comment *"i'm not sure i recognize a
gradient in that artwork"* — and it is why this round exists.

**(g) A veto.**
Removes the cover from the aggregate and from the ρ\* evidence. It says nothing about ρ\*; record the
reason against the corpus, not against the threshold.

### What this round can and cannot move

**One-sidedness — the caveat that governs every branch above.** All eight pairs are
published-gradient covers at ρ ≥ ρ\*. Therefore:

- **This round can only RAISE ρ\*, or confirm it.** It has no cover below 0.62 and so cannot produce
  the evidence that would lower it.
- Branch (a) does **not** mean 0.62 is right. It means 0.62 is not *too low* over [0.6217, 0.6498].
  A reviewer who would also call a ρ = 0.55 cover shaded would be telling us 0.62 is too **high**,
  and this round cannot hear that.
- **Owed work, named now so it is not rediscovered as a surprise:** a dev-only force-gradient path
  (publish the best-fit ramp regardless of ρ, behind an env flag, never on the shipping path), and a
  companion round drawn from the 10 flat-side borderline covers already sitting in
  `gradient-borderline-0.3.0.json` (ρ 0.5959 – 0.6167). Until that exists, the lower bound on ρ\* is
  untested and every statement about it must say so.

---

## Staging notes the installer needs before pushing

1. **`items.jsonl` is the push shape, with one transform: `imagePath` is repo-relative.**
   Every other field is exactly what `parseItem` wants — `itemId`, `collection`, `artworkId`,
   `sides: [side, side]`, each side `{ variantId, palette, fingerprint }` and each palette
   `{ background, surface, foreground, accent, gradient, surfaceCollapsed, accentCollapsed }`.
   `parseItem` requires `imagePath` **absolute**: prefix `/Users/Flo/GitHub/palette/`. The round was
   staged from a worktree whose corpus shards are symlinks back to the main checkout, so the run's
   own absolute paths carry a meaningless `.worktrees/p3-fields/` prefix; the repo-relative form is
   the one that resolves for the consumer, and `VERIFY.md` check 1 checks it against the **main**
   checkout.
2. **Pushed side order is fixed and meaningful to the orchestrator only:** index **0 = gradient**
   (`variantId: p3-fields-0.3.0`), index **1 = flat**
   (`variantId: p3-fields-0.3.0-flat-treatment`). Nothing was pre-shuffled. `blindItem` decides A/B
   per item from the batch salt at push time, and the salt is never served.
3. **Three orchestrator-only keys ride along on each line**, the same way round 1 carried
   `selectionClass`: `bestRho`, `distanceFromRhoStar`, `runIndex`. `parseItem` reads only the fields
   it names and ignores these; they are here so one grepped line says which ρ the item anchors.
   Strip them if the installer prefers a clean push — nothing depends on their being sent.
4. **`geometry` is not pushed.** The run records it as an object (`{kind: "radial", center: […]}`);
   `PaletteSnapshot.geometry` is a string ≤ 64 chars; and the pinned display mapping renders every
   family as a 135° linear ramp regardless (`review-server/gradient.ts`). Round 1 dropped it for the
   same reason. It is in the item table above so the orchestrator can read branch (d)(ii).
5. **`render-preview.json` is NOT a server input.** The `/pairwise` page takes everything from
   `/api/batches/<id>`, where `blindSidePayload` builds each side's roles, names, display stops and
   `fieldCss` server-side. Round 1's `sidecar.data.json` was the same kind of local artifact under a
   name that invites confusion; this one is renamed so it cannot be mistaken for one of
   `review-ui/*.data.json`. Do not copy it anywhere.
6. **The fingerprint is honest as written.** `gitCommit: bead404, dirty: false` on both sides. The
   worktree's `research/v3/src` and `prototypes/p3-fields/src` are clean, have **zero diff** against
   `bead404`, and the run header's `codeVersion` reproduces byte-for-byte from the working tree —
   `VERIFY.md` check 9. Unlike round 1, no pinned-source re-extraction was needed.
