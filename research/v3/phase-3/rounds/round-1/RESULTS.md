# Phase 3 — round 1 — cross-arm results

Arm A = `a-field-first-0.2.0` (batch `cal-027`, released 2026-08-29T16:53:51.177Z).
Arm B = `b-tree-first-0.1.0-m1` (batch `cal-028`, released 2026-08-29T17:12:26.316Z).
Both batches: 8 items, same covers, same order, mode `absolute`, author `human:flo`.

Sources: `node --experimental-strip-types src/warehouse/cli.ts query --batch cal-027,cal-028`
(16 verdict records + 2 batch-complete records, 18 records total, no other record type);
palettes cross-checked against each arm's staged `review-rounds/round-1/items.json` and
found **bit-identical** to the palettes carried in the verdict records.

## 0. Evidence gap — read before the table

**The reviewer left no text.** Every one of the 16 verdicts carries `comment: ""`. Both
`batch-complete` records carry `note: ""`. There are **no** `note`, `veto`,
`endorsed-sample`, or `amendment` records for either batch, and no verdict is
confound-flagged or retracted. `grep -c 'cal-027\|cal-028'` over the whole warehouse
returns 18 — exactly the 18 records above, so nothing is hiding under another record type.

Consequences, which the reader must carry through the rest of this file:

- Section 3 (failure classes) and section 5 (cross-arm / round-design remarks) have **no
  input**. They are reported as empty rather than filled with inference.
- Section 4 can answer the two *gradient* probes from the palette output itself (whether a
  gradient was emitted is a fact of the record, not a reading of the artwork). It **cannot**
  answer the two *face-as-background* probes, because deciding whether a returned hex came
  from a depicted face requires either the reviewer's note or a fresh look at the image by
  someone other than the reviewer. Those are marked `undetermined`.
- The grades themselves are complete and are the round's only reviewer signal.

## 1. Result table

| # | cover (short id) | role | Arm A palette (`a-field-first-0.2.0`) | grade A | Arm B palette (`b-tree-first-0.1.0-m1`) | grade B | note A | note B |
|---|---|---|---|---|---|---|---|---|
| 1 | `ab67…be9b20` | probe:face-as-background | bg `#8d8cc8` / sf `#8d8cc8` *(collapsed)* / fg `#00bcfa` / ac `#7f7ca7` — grad n | **unacceptable** | bg `#fce8cf` / sf `#fce8cf` *(collapsed)* / fg `#000000` / ac `#000400` — grad n | **unacceptable** | *(none)* | *(none)* |
| 2 | `ab67…bed1b2` | probe:face-as-background | bg `#05933d` / sf `#0e7a46` / fg `#9f8382` / ac `#065d3b` — grad **y** | **weak** | bg `#01913a` / sf `#01913a` *(collapsed)* / fg `#080000` / ac `#71ceb3` — grad n | **acceptable** | *(none)* | *(none)* |
| 3 | `ddd8…d9b8c5` | probe:false-gradient | bg `#fdfad9` / sf `#f3bbd4` / fg `#494949` / ac `#734838` — grad n | **weak** | bg `#fefcd6` / sf `#f5bad6` / fg `#000204` / ac `#000000` — grad n | **weak** | *(none)* | *(none)* |
| 4 | `ab67…21f65e` | probe:missed-gradient | bg `#ffe7e2` / sf `#f2d2d3` / fg `#a99da1` / ac `#282627` — grad **y** | **weak** | bg `#fce4e2` / sf `#eecccd` / fg `#1e1a19` / ac `#000005` — grad **y** | **acceptable** | *(none)* | *(none)* |
| 5 | `ab67…89fe0c` | fresh | bg `#e0dcdd` / sf `#c4bec2` / fg `#aea4a5` / ac `#624d52` — grad **y** | **weak** | bg `#d3cdcf` / sf `#d3cdcf` *(collapsed)* / fg `#381f25` / ac `#4b343a` — grad n | **acceptable** | *(none)* | *(none)* |
| 6 | `ab67…efb995` | fresh | bg `#040605` / sf `#040605` *(collapsed)* / fg `#8e8e8e` / ac `#afafaf` — grad n | **acceptable** | bg `#050505` / sf `#050505` *(collapsed)* / fg `#3f3f3f` / ac `#626262` — grad n | **weak** | *(none)* | *(none)* |
| 7 | `ab67…9bb7b9` | fresh | bg `#000000` / sf `#14100d` / fg `#77543e` / ac `#77543e` *(collapsed)* — grad n | **unacceptable** | bg `#c18c48` / sf `#c18c48` *(collapsed)* / fg `#010000` / ac `#546167` — grad n | **unacceptable** | *(none)* | *(none)* |
| 8 | `ab67…e8f81f` | fresh | bg `#121214` / sf `#121214` *(collapsed)* / fg `#9d4d82` / ac `#8a74bc` — grad n | **acceptable** | bg `#131112` / sf `#161417` / fg `#fffeff` / ac `#2a302c` — grad n | **unacceptable** | *(none)* | *(none)* |

Short id key (full ids, in `covers.txt` order):

- `ab67…be9b20` = `ab67616d0000b27300094a786a28459646be9b20` (640x640, probe:face-as-background)
- `ab67…bed1b2` = `ab67616d00001e02000f9ddb5dfe0c2590bed1b2` (300x300, probe:face-as-background)
- `ddd8…d9b8c5` = `ddd8a0e7961edcf8e95b771ae0d9b8c5` (1280x1280, probe:false-gradient)
- `ab67…21f65e` = `ab67616d00001e0200001073a73e3a949021f65e` (300x300, probe:missed-gradient)
- `ab67…89fe0c` = `ab67616d00001e02000bb7843b5e4572ce89fe0c` (300x300, fresh)
- `ab67…efb995` = `ab67616d00001e020010fe367a0d2ff504efb995` (300x300, fresh)
- `ab67…9bb7b9` = `ab67616d0000b273000131a334d00155369bb7b9` (640x640, fresh)
- `ab67…e8f81f` = `ab67616d0000b27300096a633744f98a17e8f81f` (640x640, fresh)

Gradient stops in full, for the four palettes that emitted one (Arm A three, Arm B one):

- cover 2, Arm A: y (2 stops: #05933d@0, #0e7a46@1)
- cover 4, Arm A: y (3 stops: #ffe7e2@0, #f1d8c4@0.792891, #f2d2d3@1)
- cover 4, Arm B: y (2 stops: #fce4e2@0, #eecccd@1)
- cover 5, Arm A: y (2 stops: #e0dcdd@0, #c4bec2@1)

## 2. Grade tallies

| grade | Arm A (cal-027) | Arm B (cal-028) |
|---|---|---|
| strong | 0 | 0 |
| acceptable | 2 | 3 |
| weak | 4 | 2 |
| unacceptable | 2 | 3 |
| **vetoes** | 0 | 0 |
| endorsed samples | 0 | 0 |
| confound-flagged | 0 | 0 |

Neither arm earned a `strong` on any of the eight covers. Vetoes: none were cast in
either batch (the warehouse holds exactly one `veto` record in total, and it belongs to
neither of these batches).

Per-cover agreement: the arms received the **same** grade on 3 of 8 covers
(cover 1 `unacceptable`, cover 3 `weak`, cover 7 `unacceptable`). Arm B graded higher on covers 2, 4, 5;
Arm A graded higher on covers 6, 8. No cover was graded `acceptable` or better by both
arms at once.

## 3. Per-cover failure class, attributed to arm

**Not derivable.** A failure class is a reading of what the reviewer said went wrong, and
the reviewer said nothing on any of the 16 items. No line is written here for any of the
eight covers, in either arm, because every such line would be this analyst's guess about a
grade's reason rather than a record of the reviewer's complaint. Writing them would also be
exactly the "turn notes into rules" move the round is supposed to avoid — with the notes
themselves missing, it would be worse: rules from nothing.

What *is* on the record, per cover, is the grade (section 1) and the palette. Palette facts
that need no interpretation are listed in the appendix below and are explicitly **not**
attributed to the reviewer.

To fill this section, the round needs a re-review of the same two batches with comments, or
a follow-up pass in which the reviewer annotates the covers already graded.

## 4. Probe outcomes

Probe complaints are quoted from `COVERS.md`, which quotes the Phase 2 verdict records.

### Cover 1 — `ab67…be9b20` — probe:face-as-background

Phase 2 complaint (batch `phase2-cal-026`, verdict `v-msp1who6-06e3dd29`), verbatim:

> Capri blue foreground is a very good pick, the rest is not good.
> There are many colors in that artwork, having the surface collapsed with the background misses some of the artwork's identity
> the Sushi Rice beige is the face of the subject on this artwork, not a background
> the Mecha Metal accent is not an accent in the artwork, it might be a subtle color somewhere but there are many stronger possible picks

- **Arm A — undetermined.** Grade `unacceptable`. Surface is still collapsed into
  background (`#8d8cc8` twice), so the one mechanically checkable half of the complaint —
  "having the surface collapsed with the background" — is **not** fixed. Whether the new
  background is or is not a face region is unknowable from the record.
- **Arm B — undetermined.** Grade `unacceptable`. Surface also still collapsed
  (`#fce8cf` twice); the collapse half of the complaint is **not** fixed. Note the Arm B
  background `#fce8cf` is a pale beige, in the same region of colour space as the
  "Sushi Rice beige" the Phase 2 note objected to, but the record does not say where in the
  image it came from and no reviewer note comments on it.

Both arms retained the `unacceptable` grade this cover carried in Phase 2.

### Cover 2 — `ab67…bed1b2` — probe:face-as-background

Phase 2 complaint (batch `phase2-pair-023`, verdict `v-msp1ib2f-de9a78d4`), verbatim:

> side A: no green-to-brown in this artwork
> side B: pink is the color of the face of a person in this picture, it doesn't really fit as a background
> both: the main text is white in this artwork, it might be good to have the foreground be white

- **Arm A — undetermined, one part unfixed.** Grade `weak`. Neither arm was asked to
  reproduce the Phase 2 sides, so the "green-to-brown" line does not transfer; but Arm A
  emitted a green-to-green gradient (`#05933d` → `#0e7a46`) with a warm grey-brown
  foreground `#9f8382`, which is **not** the white foreground the third line asked for.
  Whether the background is a face is undetermined.
- **Arm B — partly.** Grade `acceptable` (up from the `weak`/`unacceptable` pair in
  Phase 2). Background `#01913a` is green, not pink, so the specific pink-face pick is
  gone; the foreground `#080000` is near-black, so the "foreground be white" suggestion is
  **not** taken. The grade improved but no note confirms why.

### Cover 3 — `ddd8…d9b8c5` — probe:false-gradient

Phase 2 complaint (batch `phase2-cal-017`, verdict `v-msocpkt1-ae64ab30`), verbatim:

> there is no gradient in this artwork, it's very clearly all flat

- **Arm A — yes.** `gradient: null`. No gradient emitted, so the false gradient is gone.
  The grade is nonetheless `weak`, so something else about the palette is wrong; the
  record does not say what.
- **Arm B — yes.** `gradient: null`. Same: false gradient gone, grade still `weak`.

This is the round's cleanest probe result and the only complaint both arms demonstrably
fixed. It is also the only 1280x1280 cover, so both arms cleared it at a resolution none of
the other seven reach.

### Cover 4 — `ab67…21f65e` — probe:missed-gradient

Phase 2 complaint (batch `phase2-pair-024`, verdict `v-msp1nbzo-85f5ee1a`), verbatim:

> should be a gradient
> side B: foreground is unreadable

- **Arm A — yes on the gradient.** A 3-stop gradient was emitted
  (`#ffe7e2` → `#f1d8c4` @0.792891 → `#f2d2d3`). Grade `weak`. The foreground
  `#a99da1` is a mid grey on a very light pink field — the "unreadable foreground" half of
  the Phase 2 note applied to that round's side B, not to this arm, and no reviewer note
  here repeats or clears it.
- **Arm B — yes.** A 2-stop gradient was emitted (`#fce4e2` → `#eecccd`), and the
  foreground is near-black `#1e1a19`. Grade `acceptable`, the joint-best grade in the
  round. Both halves of the Phase 2 note point the right way here, though only the gradient
  half is verifiable from the record.

### Probe summary

| probe | complaint | Arm A | Arm B |
|---|---|---|---|
| 1 — face-as-background | face picked as background; surface collapsed | undetermined (collapse **not** fixed); `unacceptable` | undetermined (collapse **not** fixed); `unacceptable` |
| 2 — face-as-background | pink face as background; wants white fg | undetermined; fg not white; `weak` | partly (bg no longer pink; fg not white); `acceptable` |
| 3 — false-gradient | gradient emitted on a flat artwork | **yes**; `weak` | **yes**; `weak` |
| 4 — missed-gradient | flat palette on a gradient artwork | **yes**; `weak` | **yes**; `acceptable` |

Both gradient probes were fixed by both arms. Neither face-as-background probe can be
called fixed or unfixed on this evidence, and on cover 1 the collapse half of the complaint
is verifiably still present in both arms.

## 5. Cross-arm and round-design remarks from the reviewer

**None on the record.** The reviewer wrote no batch note, no per-item comment and no
free-standing `note` record for either batch, so there is nothing said about both arms
together, about the cover selection, about the review UI, or about the round design.

The one observation available about the round is procedural rather than substantive, and it
is an inference from timestamps, not a reviewer statement: cal-027 was graded in 110 s
across 8 items (gaps 18.5, 22.8, 11.4, 16.1, 13.6, 5.5, 22.2 s) and cal-028 in 73 s (gaps
15.6, 9.3, 14.1, 7.8, 14.6, 7.9, 4.0 s). That pace is consistent with a deliberate
grade-only pass. Whether comments were skipped by intent or by accident is not knowable
from the data and should be asked before the round is read as a comparison of the two arms.

## Appendix — mechanical palette facts (NOT reviewer-attributed)

These are properties of the returned palettes, readable from the verdict records without
looking at an artwork and without a reviewer's opinion. They are listed so the grades are
not the only structured signal carried forward. **None of these is a failure class**; no
reviewer said any of them is a problem.

| # | Arm A | Arm B |
|---|---|---|
| 1 | surface = background; no gradient | surface = background; no gradient |
| 2 | gradient, 2 stops | surface = background; no gradient |
| 3 | no gradient | no gradient |
| 4 | gradient, 3 stops | gradient, 2 stops |
| 5 | gradient, 2 stops | surface = background; no gradient |
| 6 | surface = background; no gradient | surface = background; no gradient |
| 7 | accent = foreground; no gradient | surface = background; no gradient |
| 8 | surface = background; no gradient | no gradient |

Counts across the 8 covers: Arm A collapsed the surface into the background 3 times and the
accent into the foreground once, and emitted a gradient 3 times. Arm B collapsed the surface
5 times, never collapsed the accent, and emitted a gradient once.
