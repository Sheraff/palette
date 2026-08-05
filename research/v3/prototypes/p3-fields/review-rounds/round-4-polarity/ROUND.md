# Round 4 — near-neutral polarity pairwise. Six covers, two polarities each.

**For the orchestrator, not the reviewer.** Nothing in this file is served. The reviewer sees only
what `/api/batches/<id>` carries, and the server builds that itself (`blindSidePayload`) — no file in
this directory reaches the browser.

Palettes from candidate `p3-fields-0.3.0`, generated **from a pinned copy of commit `5a4f845`**, run
`run-coverage-220-0.3.0.jsonl` for the selection pool. Staged from the worktree `.worktrees/p3-fields`.

---

## Provenance: why this round runs from a pinned copy, and what "pinned" means here

Live `src/` is under 0.4.0 edit by another worker while this round is staged. A round whose palettes
came from a directory being written underneath it would carry a fingerprint that named a commit but
described no code, and no later reader could recover which. So every palette in this round was
generated from `_pinned-5a4f845/`, which is:

```
git show 5a4f845:research/v3/prototypes/p3-fields/src/<file>.ts
```

for each of the twelve modules of the selection path, plus **exactly two changes**, both of which
`VERIFY.md` check 9 re-derives mechanically (it re-extracts each file from git, undoes the two
changes, and demands byte equality — proven non-vacuous by a tampering probe recorded there):

1. **The import-depth rewrite.** `from "../../../src/…"` → `from "../../../../../src/…"`, because the
   pinned copy sits two directories deeper than `src/`. The same mechanical rewrite round 1's
   `_pinned-cb760d7/` and the attribution study's `_pinned-1ec99b6/` carry, for the same reason.
2. **The `P3_FORCE_BG_POLARITY` override**, described in full below. It exists in the pinned copy
   **only**; check 9 also asserts that live `src/field-roles.ts` does not carry it.

`src/tools/measure-edge-rank.ts` was not pinned — it is not on the `extractPalette` path and round 1's
pinned copy carries no tools either.

**The pinned copy reproduces the published candidate exactly.** With no override set, it produces all
**220/220** rows of `run-coverage-220-0.3.0.jsonl` byte-for-byte (`VERIFY.md` check 8). That run was
produced by `bead404`'s `src/`, and the only behavioural delta between `bead404` and `5a4f845` is
itself behind an unset env var (`P3_DEPTH_FLOOR_MODE`), so this one check establishes two things at
once: the pinned copy is the candidate, and the override is inert when unset.

### The fingerprint, and what it honestly claims

Both sides carry `gitCommit: "5a4f845"`, `dirty: false`.

- **Side 0** is byte-for-byte what `5a4f845` publishes — checked above, not asserted.
- **Side 1** is the same commit's pipeline asked a different question at one comparison. The commit is
  what produced it. What keeps that from being a lie is `algorithmVersion`, which reads
  `p3-fields-0.3.0-polarity-inverted` — round 3's `-flat-treatment` convention, so no later reader can
  mistake side 1 for something `p3-fields-0.3.0` emitted.

---

## The question this round answers

> **Which of these two treatments suits this artwork?**

Operationalised as a pairwise preference between two palettes of the **same artwork** that differ in
**which lightness extreme of the field is the background** and in nothing else.

The question is deliberately **artwork-level and version-independent**. It is not "is `0.3.0`'s
polarity rule right" — it is "does this artwork want the dark end behind or in front", whose answer
calibrates the convention for any version of the mechanism. If `0.4.0` changes how the ends are found,
the reviewer's verdict on whether cover `item-168` reads better dark-behind remains as true as it was.

### What it is anchoring

The **tie-band convention** in `field-roles.ts` step 5. When the two field ends' prevalence counts sit
within `BACKGROUND_PREVALENCE_TIE_BAND` (δ_bs = 0.10, `[UNCALIBRATED]`) of each other, the count is
declared to carry no information and a fixed convention decides instead: **the darker end (lower OKLab
L) is the background**. The source says plainly what that rests on:

> *"Why darker and not lighter: it is a convention and is defended as one, not as a measurement. Dark
> backgrounds are the album-artwork norm the corpus is drawn from, and — the reason that survives if
> that norm does not — it agrees with the foreground's own tie convention in `foreground.ts`."*

Nobody has ever asked a human. This round asks, on the covers where that convention is the thing
actually deciding.

### What funds it

Round 1's `item-14` — a near-neutral greyscale photograph whose background `#ffffff` and surface
`#040404` sit at opposite ends of the lightness axis — **graded strong**, and round 1's ROUND.md
branch (d) pre-registered exactly this follow-up:

> *"A ≥ 3 here is suggestive that the polarity choice matters less to a human than the robustness math
> implies — but **only one side is shown this round**, so it cannot settle it. … **Flag as a candidate
> follow-up: a pairwise round on near-neutral covers, the two polarities as the two sides.** Do not
> read (d) as settled from a single-sided grade."*

`VERDICTS.md` item 6 carried it forward verbatim. This is the round it was carried to. It also buys
something the robustness ledger needs: that work treats a background/surface flip as a full four-role
disagreement, and this round is the only thing that can say whether that weighting matches the eye.

**`fundedBy`** — round 1's VERDICTS.md records the grade and the branch but **not** the verdict id.
The installer should resolve it from the warehouse (batch `phase2-cal-003`, item `item-14`, released
2026-08-04T21:16:32Z) before pushing rather than invent one; the placeholder in the staging notes says
so.

## Proposed kind

**pairwise** — two sides per item, both graded, one preference (`REVIEW_UI.md` §2; `parseBatch` in
`src/review-server/batch.ts`).

| | |
| --- | --- |
| Kind | `pairwise` (no `kind` field on the push; absent means pairwise) |
| Mode | two sides on the mock, blinded as A and B |
| Grade scale | the four warehouse grades, per side: strong / acceptable / weak / unacceptable |
| Preference | `a` / `b` / **`no-preference`** |
| Veto | available per item |
| Notes | per-item, free text |
| Items | 6 |
| Purpose field | `calibration` — the round calibrates a convention, not a mechanism |
| Batch id | the installer's to set; round 1's was `phase2-cal-003` |

### The escape, confirmed present

`PREFERENCES = ['a', 'b', 'no-preference']` (`warehouse/records.ts`), the pairwise page binds it to the
`n` key and prints it in the footer, and `app.js` prefills nothing when the two grades are equal, so
"no preference" is never entered by accident. That matters more in this round than in any so far,
because **"these look the same to me" is the single most informative answer this round can receive** —
it is the branch that decides whether the robustness ledger should keep counting polarity flips at
full weight. It gets its own branch below rather than being folded into either side.

---

## The item table

`itemId` carries the coverage-220 run's own zero-based index, so `#130` in a measurement and
`item-130` here are the same cover. Rows in ascending prevalence gap — the order the decision rule
reads, deepest inside the convention's territory first.

| itemId | pool | prevalence far/near | rel. gap | e₁ (L) | e₂ (L) | ΔL | side 0 bg → surface | side 1 bg → surface | grad | artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `item-124` | tie-band | 18995 / 19097 | **0.00534** | `#fdf7f9` (0.9813) | `#28211b` (0.2537) | 0.7276 | `#28211b` → `#fdf7f9` | `#fdf7f9` → `#28211b` | 4 | display type over dark speakers |
| `item-130` | tie-band | 3125 / 3061 | **0.02048** | `#fcdf99` (0.9120) | `#deb355` (0.7873) | 0.1247 | `#deb355` → `#fcdf99` | `#fcdf99` → `#deb355` | 2 | photographic — coffee cup, title band |
| `item-168` | tie-band | 4110 / 4328 | **0.05037** | `#26211d` (0.2520) | `#0b0800` (0.1345) | 0.1174 | `#0b0800` → `#26211d` | `#26211d` → `#0b0800` | 2 | photographic — blue ink on near-black, no text |
| `item-009` | tie-band | 12026 / 12741 | **0.05612** | `#1c1208` (0.1923) | `#0a0904` (0.1387) | **0.0537** | `#0a0904` → `#1c1208` | `#1c1208` → `#0a0904` | 2 | flat graphic + type, tan on near-black |
| `item-065` | tie-band | 2098 / 1895 | **0.09676** | `#fefefe` (0.9970) | `#0b0b0b` (0.1496) | **0.8474** | `#0b0b0b` → `#fefefe` | `#fefefe` → `#0b0b0b` | — | dense dark illustration, red accents |
| `item-132` | **fill** | 18684 / 16770 | 0.10244 | `#ecf3b0` (0.9430) | `#c1282b` (0.5298) | 0.4132 | `#ecf3b0` → `#c1282b` | `#c1282b` → `#ecf3b0` | — | flat vector illustration + type |

Gaps span **0.00534 – 0.10244** against δ_bs = 0.10; five fired the band, one sits 0.0024 above it.
ΔL between the two ends spans **0.0537 – 0.8474** — a two-order spread that the decision rule below
reads as a variable, not as noise.

**Composition, against the round's stated breadth requirement.** Text present with the foreground role
live on four of six (`item-124`, `item-130`, `item-009`, `item-132`); photographic on three
(`item-130`, `item-168`, and `item-124`'s backdrop); flat vector/graphic on two (`item-009`,
`item-132`); dense illustration on one (`item-065`). No cover is escaped, none has a collapsed surface,
and the foreground regime splits ink 3 / luminance 3.

### Two per-item facts that must not be discovered after the verdicts

- **`item-124`'s accent is collapsed onto the foreground** (`accentCollapsed: true`, both `#fffefc`)
  on **both** sides — a `0.3.0` fact about that cover, unchanged by the manipulation, not something
  this round introduced.
- **`item-124` is the extreme contrast case.** Side 0 puts the foreground at |APCA| 107.5 over the
  background and **3.9** over the surface; side 1 swaps those two numbers exactly. Both sides are
  contract-clean, because the contract's `minTextContrast` default is **0** — I4 catches only
  exact-zero pairs, by design (`palette-design-constraints`: APCA intentionally low, parameterised).
  So the reviewer is being shown a real and large legibility difference on this cover, and it is
  *the same difference in both directions*. That is a property of the polarity question, not a
  confound the round could have removed, and branch (f) below is where it is read.

---

## How the six were chosen

Mechanically, from a full `P3_DIAG` sweep of the 220-cover coverage set run **from the pinned copy**.
No by-eye judgement entered the selection; the contact sheet was built only to *describe* the six in
the table above, after they were chosen.

**Step 1 — the tie-band pool.** Of 220 covers, the prevalence tie band **fired on 16**. (191 were
decided by prevalence; 13 never reach step 5 at all — the no-extent path, where the field is one
colour to the bit.)

**Step 2 — and here is the largest single fact about this pool: 11 of the 16 are collapsed.** A
collapsed field has `surface === background` — the two ends sit inside the contract's own same-colour
bar — so there is no polarity to invert, and the two sides would differ by an amount the contract has
already declared to be no difference. Those eleven (`#171 #211 #53 #32 #19 #120 #18 #68 #141 #26 #22`)
are excluded, and three of them fail `validatePalette` on the published side independently. This is
worth stating loudly: **the tie band, in practice, fires mostly on covers that then collapse.** The
convention it guards is doing less work on this corpus than its docstring implies, and that is itself
a finding for the robustness ledger regardless of what the reviewer says.

**Step 3 — both sides must pass `validatePalette`, or the cover is excluded.** Pre-registered, and it
follows from what this round *cannot* settle (below). All five surviving tie-band covers pass on both
sides; none was dropped at this step.

**Step 4 — fill, because five is not six.** The stated fallback: take the covers with the **smallest
prevalence gap above the band**. That is `item-132` at 0.10244, the single closest of 172 above-band,
non-collapsed, contract-valid covers. It is labelled `pool: "fill"` on its item line and it is the one
row whose polarity was decided by *prevalence* rather than by the convention.

**The fill cover does one thing the five tie-band covers cannot.** All five tie-band covers are
published **dark**-background — necessarily, since the convention *is* "darker is background". If all
six were like that, a reviewer who consistently preferred the darker-background side and a reviewer
who consistently preferred the as-published side would produce identical data and could not be told
apart. `item-132` is published **light** (background `#ecf3b0`, L 0.9430; surface `#c1282b`, L 0.5298),
so it separates those two hypotheses. That is a consequence of the mechanical fill rule, not a reason
it was chosen — but the decision rule below uses it.

---

## The override: what it is, where it lives, and how it was checked

`P3_FORCE_BG_POLARITY=dark|light`, read once at module load by
`backgroundPolarityOverrideInUse()` in the **pinned** `constants.ts`, consumed at exactly one site: the
step-5 comparison in `chooseFieldEnds`.

**It replaces the whole of step 5** — both the prevalence comparison and the tie band's darker-end
convention — with a single L comparison:

- `dark` — the darker end (lower OKLab L) is the background. This *is* the tie-band convention.
- `light` — the lighter end is the background. The convention, inverted.

An exact L tie between the two ends resolves to the near end under both values, which is the same
0.1.0 fallback the shipped tie branch already uses, so the override introduces no order-of-comparison
dependence that the shipped path does not have. An unrecognised value **throws** — the same contract
`edgeRankInUse` and `depthFloorModeInUse` follow, so a typo in a measurement's environment cannot
quietly produce the baseline and be read as "the override does nothing".

**Nothing is swapped by hand.** Side 1 is a second full run of `extractPalette`. The gradient, the
foreground, the accent, the collapse test and `validatePalette` are all re-derived by the normal
cascade from the new background.

### The diff-verification, and its result

Run over all **19** scanned candidates (the 5 tie-band + the 14 nearest above-band), two legs:

**Leg 1 — reproduction. 19/19.** Forcing the polarity the shipped rule *already chose* reproduces the
published palette **byte-for-byte**. On a tie-band cover this is a real check rather than a
restatement precisely because `dark` and the convention are the same rule reached by different code.

**Leg 2 — swap. 19/19.** Against the published run: identical `{e₁, e₂}` pixel-index pair, identical
field median, identical ends step, identical field-set rule; `farIsBackground` inverted;
`background`/`surface` hexes exactly exchanged; **`foreground` and `accent` byte-identical**.

> **Polarity-only: confirmed.** The override moves which end is called background and nothing else.

**Two consequences worth recording, because they are mechanism findings and not artefacts:**

- **The text roles do not move.** On all 19 candidates the foreground and accent are identical between
  the two sides. That is not luck: the foreground's ordering is built against the *published field
  ramp*, which is the set of both ends plus the guide stops — a set, and therefore symmetric under
  exchanging its endpoints. So a polarity flip is, on this corpus, a pure field manipulation. It also
  means the reviewer's two mocks differ **only** in the field and in the ramp's direction, which is as
  clean a two-sided question as this instrument can pose.
- **The ramp genuinely reverses.** Stop colours come back in reverse order with positions reflected
  about ½ — including the interior guide stops, whose new positions are computed by the excursion
  machinery on the second run rather than by `1 − t` applied afterwards (`item-124`: 0.4062 / 0.5625
  → 0.4375 / 0.5938). `VERIFY.md` check 3 asserts the reversal with a one-rank-step tolerance for
  exactly that reason.
- **Contrast pairs exchange rather than degrade.** |APCA| fg‖bg and fg‖surface swap values between the
  sides on every cover. Neither polarity is systematically the "low contrast" one; which surface
  carries the legible text is what moves.

---

## Blinding

**This round is properly blinded, and unlike round 3 that is not a caveat.** Round 3's ROUND.md had to
concede that `blinding.ts` names its exact shape as unblindable from the payload alone — *"the side
with a gradient is arm-beta"*. Nothing of that kind applies here. Both sides carry a gradient or
neither does; both have the same stop count; the foreground and accent hexes are identical. There is
no structural feature of the served payload that separates "as-published" from "inverted".

What is served, per side, is what `blindSidePayload` builds: roles, collapse flags, display stops and
`fieldCss`. **No `variantId`, no fingerprint, no palette hash** — `VERIFY.md` check 11 asserts the
pushed side shape and greps the served fields for mechanism vocabulary.

`items.jsonl` carries a fixed pushed order — index **0 = as-published**, index **1 = inverted** — and
`blindItem` maps pushed indices to blinded A/B per item from the per-batch salt, which is never served.
No side order was chosen by the staging worker.

**The one residual, stated.** Anyone who knew both that this round is about polarity *and* that the
convention is "darker is background" could unblind the five tie-band items by picking the
darker-background side as side 0. The protections are that the reviewer is told none of that, that the
`item-NNN` ids carry no hint, and that the shuffle is per-item and salted. `item-132`, published light,
breaks even that rule.

**Sidecar: none**, following round 3. `render-preview.json` is a **local** artifact for eyeballing the
two treatments during staging and for `verify.ts` to compare against; it is **not a server input** and
must not be copied anywhere. Round 3 renamed it away from `sidecar.data.json` for exactly this reason.

---

## The decision rule — written before any verdict exists

### Per cover

The preference is the datum; the two grades are context.

| verdict | reading |
| --- | --- |
| **prefers the darker-background side** | this artwork wants the dark end behind. On a tie-band cover that is the convention being ratified by the eye |
| **prefers the lighter-background side** | this artwork wants the light end behind. On a tie-band cover the convention chose against the reviewer |
| **no preference** | **the polarity is invisible on this cover.** Not a tie broken toward the status quo, not weak evidence for either. Recorded, and it is the input to branch (c) — the only branch that can downgrade how the robustness ledger weights a flip |

A veto removes the cover from the round entirely and from the aggregate.

**Note the axis.** Verdicts are read as *darker-background vs lighter-background*, **not** as
*published vs inverted*. The two coincide on the five tie-band covers and are opposite on `item-132`,
which is what makes the aggregate below able to tell "prefers dark" from "prefers what we shipped".

### Aggregate

**Per-cover contradictions are surfaced, never averaged.** If the reviewer prefers dark-behind on
`item-168` (ΔL 0.1174) and light-behind on `item-130` (ΔL 0.1247), that is not "polarity is a coin
flip" — it is evidence that **something other than polarity per se is what the reviewer is answering
on**, and the right output is a report naming the candidate variable, not a majority count. No mean,
no proportion-with-a-confidence-interval over six points. Six items cannot carry a fitted preference
and this round will not pretend otherwise.

The candidate variables to check first, in order, before any aggregate is believed:
**(i) ΔL** — the six span 0.0537 to 0.8474, and a polarity flip between two near-identical
near-blacks (`item-009`) is a different perceptual event from one between `#0b0b0b` and `#fefefe`
(`item-065`); **(ii) text presence** — four of six carry type, and a flip changes which surface the
title sits on; **(iii) the ramp's direction** — four of six publish a gradient, and reversing it
reverses which end the field appears lit from.

### Outcome branches

Every case, with what the orchestrator does.

**(a) Consistent preference for the darker-background side (≥ 5 of 6 with a preference, no
contradiction).**
The tie-band convention **gets reviewer provenance**. `BACKGROUND_PREVALENCE_TIE_BAND`'s docstring
stops saying *"it is a convention and is defended as one, not as a measurement"* and starts citing this
batch, with its scope stated: six covers, near-neutral, ΔL 0.05–0.85, 2026-08-05. The band's *width*
(δ_bs = 0.10) is **not** anchored by this — that is a different parameter with its own unrun plan, and
nothing here touches it.

**(b) Consistent preference for the lighter-background side.**
The convention is **inverted**: step 5's tie branch becomes "the lighter end is the background". Two
things must move with it, or the fix relocates the defect: the `foreground.ts` tie convention, which
the docstring names as the reason darker survives *"if the album-artwork norm does not"* — an inverted
field convention that leaves the foreground's alone is exactly the two-conventions-pulling-in-opposite-
directions case the source warns about; and the robustness baseline, which must be re-measured after,
because every flip count in the ledger is relative to the old convention.

**(c) Mostly `no-preference` (≥ 4 of 6).**
**The polarity genuinely does not matter to the eye at these ΔL values.** Action, and it is the
concrete one this round was funded to produce: the robustness ledger reclassifies a
background↔surface flip as **cosmetic-but-instrumented** — still counted, still reported, still
attributable, but **deprioritised against role-content flips** (a foreground or accent landing on a
different colour) when triage decides what 0.4.0 fixes. It does **not** mean the flip is free: a flip
still tells us the selection is sitting on a cliff, and W4's original finding — that one comparison
moves all four roles at once — stands. What changes is the ranking, not the counting. State the ΔL
range the finding covers; do not extend it past `item-065`'s 0.8474.

**(d) Mixed and contradictory.**
Report it as the finding, with the three candidate variables above checked in order. **Do not move the
convention on a contradictory round.** If ΔL separates the answers cleanly, the proposal that follows
is not "invert the convention" but "the tie branch should be conditional on ΔL", which is a new
parameter and needs its own round.

**(e) The reviewer prefers as-published on all five tie-band covers AND on `item-132`.**
Then the preference tracks *the shipped rule* rather than *lightness*, across a cover where those two
point in opposite directions. Since the reviewer cannot see which side is published, the only reading
left is that **prevalence is doing real perceptual work even where the band declared it noise** — i.e.
δ_bs is too **wide**, and the covers inside it should have been decided by the count after all. That
is a live outcome and it is the one that would put the band's *width* back on the queue.

**(f) Any note about legibility rather than about the artwork** — "the text is hard to read on one of
these" — especially on `item-124`, where fg‖surface is 3.9 on one side and 107.5 on the other.
The comment is evidence about the **contract's floor**, not about polarity, and it must be routed
there: `minTextContrast` defaults to 0 by design, and a reviewer complaint is the first evidence that
the default is doing harm on a real cover. Surface it separately; do **not** let it decide the
polarity branch, and do **not** silently re-read it as a polarity preference.

**(g) A veto.** Removes the cover from the aggregate. Record the reason against the corpus, not
against the convention.

### What this round can and cannot settle

**It cannot settle contract validity, and was constructed so that it never appears to.** Both sides of
all six covers pass `validatePalette` independently (`VERIFY.md` check 6, 12/12). A pair with one
contract-invalid side would be a leading question — round 3 ruled exactly this when it dropped a cover
whose gradient side failed `I4.ramp-below-contrast-floor` — so such pairs are excluded by the selection
rule, not judged by the reviewer. **No verdict in this round is evidence for or against any invariant.**

**It cannot settle δ_bs's width.** Five of six covers are inside the band and one is 0.0024 outside it.
That is a sample from the convention's territory, not a sweep across its boundary. Branch (e) is the
only branch that even points at the width, and it points at it as a question.

**It cannot speak for the collapsed majority.** Eleven of the sixteen covers on which the tie band
actually fired are collapsed and are not in this round, and cannot be — there is no second side to
show. Whatever the reviewer says here applies to the **five non-collapsed tie-band covers in 220**, and
the honest scope line for any downstream claim is that number, not "near-neutral covers".

**Owed work, named now so it is not rediscovered as a surprise:** a round that asks whether a
*collapsed* near-neutral field is the right output at all — that is the question those eleven covers
actually pose, and it is a calibration question about the same-colour bar, not about polarity.

---

## Staging notes the installer needs before pushing

1. **`items.jsonl` is the push shape, with one transform: `imagePath` is repo-relative.** Every other
   field is exactly what `parseItem` wants — `itemId`, `collection`, `artworkId`, `sides: [side, side]`,
   each side `{ variantId, palette, fingerprint }`, each palette
   `{ background, surface, foreground, accent, gradient, surfaceCollapsed, accentCollapsed }`.
   `parseItem` requires `imagePath` **absolute**: prefix `/Users/Flo/GitHub/palette/`. The round was
   staged from a worktree whose corpus shards are symlinks back to the main checkout, so the repo-
   relative form is the one that resolves for the consumer; `VERIFY.md` check 1 checks it against the
   **main** checkout.
2. **Pushed side order is fixed and meaningful to the orchestrator only:** index **0 = as-published**
   (`variantId: p3-fields-0.3.0`), index **1 = polarity-inverted**
   (`variantId: p3-fields-0.3.0-polarity-inverted`). Nothing was pre-shuffled; `blindItem` decides A/B
   per item from the batch salt at push time, and the salt is never served.
3. **Eight orchestrator-only keys ride along on each line**, the way round 3 carried `bestRho`:
   `pool`, `prevalenceRelativeGap`, `tieBandFired`, `decidedBy`, `publishedPolarity`, `backgroundL`,
   `surfaceL`, `deltaL`, `runIndex`. `parseItem` reads only the fields it names and ignores these.
   **`publishedPolarity` names which side is which — it must never be shown to anyone reviewing.**
   Stripping them all is safe; nothing depends on their being sent.
4. **`fundedBy` needs a real verdict id.** Round 1's VERDICTS.md recorded item-14's grade and branch
   but not its verdict id. Resolve it from the warehouse (batch `phase2-cal-003`, `item-14`) before
   pushing. Do not invent one, and do not push with a batch id in the `fundedBy` slot.
5. **`geometry` is not pushed.** The run records it as an object; `PaletteSnapshot.geometry` is a
   string ≤ 64 chars; and the pinned display mapping renders every family as a 135° linear ramp
   regardless (`review-server/gradient.ts`). Rounds 1 and 3 dropped it for the same reasons.
6. **`render-preview.json` is NOT a server input.** The `/pairwise` page takes everything from
   `/api/batches/<id>`. Do not copy it anywhere.
7. **`work/` is scratch.** The three scan files under it are the round's raw evidence and `verify.ts`
   reads them, so they should travel with the round; the shard files, logs, diagnostics dirs and
   contact sheets in there are disposable.

---

## Install record (main-tier, 2026-08-05) — needed by the decode

Live as **batch phase2-pair-011**, 6 items, verified clean. The installer REPLACED the
run-ordinal itemIds (item-124 style) with ARTWORK CONTENT STEMS at push (blinding precedent):
one 32-hex md5 (the music-artworks cover), the rest 40-hex. The batch log's blinding map is
keyed on the SERVED stems. **Decode analyst: re-key this round's private mapping via
imagePath → basename stem before joining verdicts.** Also stripped at push (orchestrator-only
fields): publishedPolarity, pool, prevalenceRelativeGap, tieBandFired, decidedBy, backgroundL,
surfaceL, deltaL, runIndex — the served payload carries none of them; this file and items.jsonl
remain the private key.
