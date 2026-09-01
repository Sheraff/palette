# Phase 3 — round 2 — cross-arm results

Arm A = `a-field-first-0.4.1` (batch `cal-029`, git `b2f349ab`, batch-complete 2026-08-29T20:30:22.044Z).
Arm B = `b-tree-first-0.1.0-m1` (batch `cal-030`, git `ca6f84a3`, batch-complete 2026-08-29T20:31:12.120Z).
Both batches: 8 items, same covers, same order (`covers.txt`), mode `absolute`, author `human:flo`,
preprocessing `sharp-0.33.5/srgb/no-resample`.

Sources: `node --experimental-strip-types src/warehouse/cli.ts query --batch cal-029,cal-030`
(20 records total: 18 verdicts + 2 batch-complete, no other record type; `grep -c` for the two
batch ids over the whole warehouse also returns 20, so nothing is hiding under another record
type). Arm A carries **three** verdicts on cover 8 — two superseded, see §0. Palettes were
cross-checked against each arm's staged `review-rounds/round-2/items.json` and are
**bit-identical** on all 16 items to the palettes carried in the verdict records.

**Version note, on the record:** Arm A changed version between rounds (`0.2.0` → `0.4.1`,
git `dd2c3ab7` → `b2f349ab`). Arm B carries the **same** `variantId` as round 1
(`b-tree-first-0.1.0-m1`) but a **different** git commit (`bc5ce47e` → `ca6f84a3`), and its
palettes changed on all three returning covers. The version string is therefore not a
reliable indicator of code identity for Arm B.

## 0. Evidence state — read before the table

Unlike round 1, this round has reviewer text — but only one line of it.

- **1 of 16 verdicts carries a comment**: cover 8, Arm A. The other 15 carry `comment: ""`.
- Both `batch-complete` records carry `note: ""`.
- There are **no** `note`, `veto`, `endorsed-sample` or `amendment` records for either batch,
  and none anywhere in the warehouse mentioning any of the eight round-2 cover ids.
- No verdict is confound-flagged; none is retracted.
- Cover 8 / Arm A was graded three times, all three `acceptable`, all three on the same
  palette. The comment was added on the second pass and extended on the third:
  - `v-mteu3qfo-cbc54fbf` @20:29:47.028 — `acceptable`, comment `""` *(superseded)*
  - `v-mteu44lu-ab78d221` @20:30:05.394 — `acceptable`, comment
    "accent should be the same color as foreground. There are only 3 colors on that artwork" *(superseded)*
  - `v-mteu4bzp-7ba00f35` @20:30:14.965 — `acceptable`, comment
    "accent should be the same color as foreground. There are only 3 colors on that artwork (Lemon, Serenade, Black Forest)" *(final; used throughout this file)*

Consequences the reader must carry through the rest of this file:

- §3 (failure classes) has input for **one** cover in **one** arm. For the other 15 items it
  is reported empty rather than filled with inference.
- §5 (cross-arm / round-design remarks) has **no** input: the one comment is about a single
  item in a single arm and says nothing about the other arm, the cover set, the UI, or the
  round.
- The face-as-background probe (cover 1) again cannot be resolved from the record — deciding
  whether a returned hex came from a depicted face needs the reviewer's note or a fresh look
  at the image. Marked `undetermined`, as in round 1.
- The grades are complete for all 16 items and remain the round's main reviewer signal.

## 1. Result table

| # | cover (short id) | role | Arm A palette (`a-field-first-0.4.1`) | grade A | Arm B palette (`b-tree-first-0.1.0-m1`) | grade B | note A | note B |
|---|---|---|---|---|---|---|---|---|
| 1 | `ab67…be9b20` | returning (r1 #1, probe:face-as-background) | bg `#8d8cc8` / sf `#8d8cc8` *(collapsed)* / fg `#00bcfa` / ac `#7f7ca7` — grad n | **unacceptable** | bg `#00bdfd` / sf `#00bdfd` *(collapsed)* / fg `#000000` / ac `#000400` — grad n | **unacceptable** | *(none)* | *(none)* |
| 2 | `ab67…9bb7b9` | returning (r1 #7, was fresh) | bg `#000000` / sf `#14100d` / fg `#77543e` / ac `#77543e` *(collapsed)* — grad n | **unacceptable** | bg `#000000` / sf `#000000` *(collapsed)* / fg `#4c5051` / ac `#e2dbc9` — grad n | **unacceptable** | *(none)* | *(none)* |
| 3 | `ddd8…d9b8c5` | returning (r1 #3, probe:false-gradient) | bg `#fdfad9` / sf `#f3bbd4` / fg `#494949` / ac `#734838` — grad n | **weak** | bg `#fefcd6` / sf `#f5bad6` / fg `#010200` / ac `#000000` — grad n | **weak** | *(none)* | *(none)* |
| 4 | `ab67…b17bb1` | fresh | bg `#373c35` / sf `#394038` / fg `#9a866d` / ac `#3a5544` — grad **y** | **weak** | bg `#373c35` / sf `#373c35` *(collapsed)* / fg `#7e887d` / ac `#434a43` — grad n | **unacceptable** | *(none)* | *(none)* |
| 5 | `ab67…0731ca` | fresh | bg `#896d55` / sf `#736660` / fg `#fafbf6` / ac `#ab7e5d` — grad n | **unacceptable** | bg `#ac8b6a` / sf `#ac8b6a` *(collapsed)* / fg `#11110f` / ac `#29261f` — grad n | **unacceptable** | *(none)* | *(none)* |
| 6 | `ab67…a5744f` | fresh | bg `#272729` / sf `#2a2a2c` / fg `#dddddd` / ac `#9f9f9f` — grad n | **weak** | bg `#050505` / sf `#050505` *(collapsed)* / fg `#222224` / ac `#636365` — grad n | **unacceptable** | *(none)* | *(none)* |
| 7 | `ab67…b2cca1` | fresh | bg `#6d5950` / sf `#6d5950` *(collapsed)* / fg `#9a6b63` / ac `#9a6b63` *(collapsed)* — grad n | **unacceptable** | bg `#690d12` / sf `#690d12` *(collapsed)* / fg `#180002` / ac `#d8cac7` — grad n | **unacceptable** | *(none)* | *(none)* |
| 8 | `21be…c09139` | fresh | bg `#f9ec2c` / sf `#ee5f94` / fg `#191b03` / ac `#403e05` — grad n | **acceptable** | bg `#f6e928` / sf `#ed6094` / fg `#050500` / ac `#050500` *(collapsed)* — grad n | **strong** | "accent should be the same color as foreground. There are only 3 colors on that artwork (Lemon, Serenade, Black Forest)" | *(none)* |

Short id key (full ids, in `covers.txt` order):

- `ab67…be9b20` = `ab67616d0000b27300094a786a28459646be9b20` (640x640, returning — round-1 cover 1)
- `ab67…9bb7b9` = `ab67616d0000b273000131a334d00155369bb7b9` (640x640, returning — round-1 cover 7)
- `ddd8…d9b8c5` = `ddd8a0e7961edcf8e95b771ae0d9b8c5` (1280x1280, returning — round-1 cover 3)
- `ab67…b17bb1` = `ab67616d00001e020012f9db24c5203787b17bb1` (300x300, fresh)
- `ab67…0731ca` = `ab67616d00001e02000485aa752a4671880731ca` (300x300, fresh)
- `ab67…a5744f` = `ab67616d0000b273000c550197e477cd44a5744f` (640x640, fresh)
- `ab67…b2cca1` = `ab67616d0000b273000fe1a62d8cc2643cb2cca1` (640x640, fresh)
- `21be…c09139` = `21bebfd319e1d7a27648b317a5c09139` (1500x1500, fresh)

Gradient stops in full — exactly one palette in the round emitted a gradient:

- cover 4, Arm A: y (2 stops: `#373c35`@0, `#394038`@1)

Arm B emitted **no** gradient on any of the eight covers.

## 2. Grade tallies, and the returning covers round 1 → round 2

| grade | Arm A (cal-029) | Arm B (cal-030) |
|---|---|---|
| strong | 0 | 1 |
| acceptable | 1 | 0 |
| weak | 3 | 1 |
| unacceptable | 4 | 6 |
| **vetoes** | 0 | 0 |
| endorsed samples | 0 | 0 |
| confound-flagged | 0 | 0 |
| superseded verdicts | 2 (all on cover 8) | 0 |

Cover 8 / Arm B is the **first `strong`** either arm has been given in Phase 3 (round 1: none
in either arm).

Per-cover agreement: the arms received the **same** grade on 5 of 8 covers
(1, 2, 3, 5, 7 — four of them `unacceptable`, one `weak`). Arm A graded higher on covers 4
and 6; Arm B graded higher on cover 8. Cover 8 is the only cover graded better than `weak` by
either arm.

### Returning covers — grade per arm, round 1 → round 2

| r2 # | r1 # | cover | Arm A r1 → r2 | Arm B r1 → r2 |
|---|---|---|---|---|
| 1 | 1 | `ab67…be9b20` | unacceptable → unacceptable (**unchanged**) | unacceptable → unacceptable (**unchanged**) |
| 2 | 7 | `ab67…9bb7b9` | unacceptable → unacceptable (**unchanged**) | unacceptable → unacceptable (**unchanged**) |
| 3 | 3 | `ddd8…d9b8c5` | weak → weak (**unchanged**) | weak → weak (**unchanged**) |

All six returning grades are unchanged. Two mechanical facts sit alongside them and are
**not** reviewer statements:

- **Arm A returned bit-identical palettes on all three returning covers** (same four hexes,
  same `gradient: null`, same `paletteHash`) despite the `0.2.0` → `0.4.1` version change. The
  unchanged grades on those three covers are therefore grades on unchanged output.
- **Arm B's palettes changed on all three** returning covers (cover 1 bg `#fce8cf` → `#00bdfd`;
  cover 2 bg `#c18c48` → `#000000`; cover 3 fg `#000204` → `#010200`) and the grades still did
  not move.

## 3. Per-cover failure class, attributed to arm

Class vocabulary: round 1 derived **no** classes (it had no reviewer text at all), so the list
used here is the one the round's own brief names —
`research/v3/phase-3/PROPOSAL_BRIEF.md` §4: *wrong field colour (e.g. a face taken as
background); false gradient; missed gradient; unreadable foreground; colour only present in a
label logo; a strong artwork colour missing from the palette; right colours in the wrong roles;
two near-identical shades where the artwork has one.*

| # | Arm A | Arm B |
|---|---|---|
| 1 | *no reviewer note — no class* | *no reviewer note — no class* |
| 2 | *no reviewer note — no class* | *no reviewer note — no class* |
| 3 | *no reviewer note — no class* | *no reviewer note — no class* |
| 4 | *no reviewer note — no class* | *no reviewer note — no class* |
| 5 | *no reviewer note — no class* | *no reviewer note — no class* |
| 6 | *no reviewer note — no class* | *no reviewer note — no class* |
| 7 | *no reviewer note — no class* | *no reviewer note — no class* |
| 8 | **two near-identical shades where the artwork has one** | *no reviewer note — no class* |

**Cover 8, Arm A — "two near-identical shades where the artwork has one".** The reviewer's
words, verbatim:

> accent should be the same color as foreground. There are only 3 colors on that artwork (Lemon, Serenade, Black Forest)

Arm A returned four distinct colours — `#f9ec2c`, `#ee5f94`, `#191b03`, `#403e05` — where the
reviewer counts three in the artwork, and the two dark ones are the pair he says should be one.
The mechanically checkable half is that `accentCollapsed` is `false` on this item: the
sanctioned accent→foreground collapse was available and was not taken. That is the whole of the
class attribution; the grade the reviewer nonetheless gave is `acceptable`, so this is a note
attached to a passing palette, not the reason for a low grade.

Fifteen of the sixteen items carry an **empty** note. No class is written for them, in either
arm, because any such line would be this analyst's guess at a grade's reason rather than a
record of the reviewer's complaint. In particular, the four covers where both arms landed on
`unacceptable` (1, 2, 5, 7) remain undiagnosed — cover 2 for the second round running.

## 4. Probe outcomes on the returning covers

Two of the three returning covers carry a Phase 2 probe complaint (quoted in `COVERS.md`).

### Cover 1 — `ab67…be9b20` — probe:face-as-background

Phase 2 complaint (`phase2-cal-026`, verdict `v-msp1who6-06e3dd29`), verbatim:

> Capri blue foreground is a very good pick, the rest is not good.
> There are many colors in that artwork, having the surface collapsed with the background misses some of the artwork's identity
> the Sushi Rice beige is the face of the subject on this artwork, not a background
> the Mecha Metal accent is not an accent in the artwork, it might be a subtle color somewhere but there are many stronger possible picks

- **Arm A — undetermined; the collapse half is still unfixed.** Grade `unacceptable`, palette
  bit-identical to round 1: surface still equals background (`#8d8cc8` twice). Whether the
  background is a face region is unknowable from the record.
- **Arm B — undetermined; the collapse half is still unfixed.** Grade `unacceptable`; surface
  still equals background (`#00bdfd` twice). The round-1 pale beige `#fce8cf` — the colour that
  sat in the same region as the "Sushi Rice beige" the Phase 2 note objected to — is **gone**,
  replaced by a saturated cyan close to the "Capri blue" the Phase 2 note praised as a
  foreground; but that cyan is now in the **background** role, and no reviewer note here says
  anything about it.

Both arms have now held `unacceptable` on this cover across Phase 2, round 1 and round 2.

### Cover 3 — `ddd8…d9b8c5` — probe:false-gradient

Phase 2 complaint (`phase2-cal-017`, verdict `v-msocpkt1-ae64ab30`), verbatim:

> there is no gradient in this artwork, it's very clearly all flat

- **Arm A — still fixed.** `gradient: null`, grade `weak` — identical outcome to round 1.
- **Arm B — still fixed.** `gradient: null`, grade `weak` — identical outcome to round 1.

The probe stays passed in both arms and the residual `weak` stays unexplained in both, for the
second round running: nothing on the record says what else is wrong.

### Cover 2 — `ab67…9bb7b9` — no probe

This cover carries no Phase 2 complaint. It was `unacceptable` in both arms in round 1 with no
note, and is `unacceptable` in both arms in round 2 with no note. It is now a two-round
undiagnosed joint failure.

| probe | complaint | Arm A | Arm B |
|---|---|---|---|
| cover 1 — face-as-background | face picked as background; surface collapsed | undetermined (collapse **not** fixed); `unacceptable` | undetermined (collapse **not** fixed); `unacceptable` |
| cover 3 — false-gradient | gradient emitted on a flat artwork | **passed**; `weak` | **passed**; `weak` |

## 5. Cross-arm and round-design remarks from the reviewer

**None on the record.** The reviewer wrote no batch note (both `batch-complete` records carry
`note: ""`), no free-standing `note` record, no veto, no endorsed sample and no amendment for
either batch. The round's one comment is a per-item remark on cover 8 in Arm A only; it names
that artwork's colours and says nothing about the other arm, the cover selection, the review
UI, or the round design.

One observation is available about the round, and it is procedural, inferred from timestamps
rather than stated by the reviewer: cal-029's first pass ran 8 items in 60.5 s
(gaps 9.8, 10.1, 3.9, 11.4, 11.8, 3.9, 9.5 s), then the reviewer went back to cover 8 twice
over the next 28 s to add and then extend a comment on an already-`acceptable` item. cal-030
ran 8 items in 29.5 s (gaps 4.1, 6.5, 2.9, 2.9, 2.8, 3.4, 6.8 s) with no comment and no
revisit. Whether the near-total absence of comments is intent or omission is not knowable from
the data; it was flagged in round 1 and one comment in sixteen does not settle it.

## 6. Trajectory across rounds 1–2 (grades only)

**Arm A.** Round 1 (`cal-027`, `a-field-first-0.2.0`): strong 0, acceptable 2, weak 4,
unacceptable 2. Round 2 (`cal-029`, `a-field-first-0.4.1`): strong 0, acceptable 1, weak 3,
unacceptable 4.
On the three covers common to both rounds the grade is unchanged in all three (unacceptable,
unacceptable, weak); the other five covers differ between rounds, so the two tallies are counts
over different cover sets.

**Arm B.** Round 1 (`cal-028`, `b-tree-first-0.1.0-m1`): strong 0, acceptable 3, weak 2,
unacceptable 3. Round 2 (`cal-030`, same `variantId`, different commit): strong 1, acceptable 0,
weak 1, unacceptable 6.
On the three covers common to both rounds the grade is unchanged in all three (unacceptable,
unacceptable, weak); the other five covers differ between rounds, so the two tallies are counts
over different cover sets.

## Appendix — mechanical palette facts (NOT reviewer-attributed)

Properties of the returned palettes, readable from the verdict records without looking at an
artwork and without a reviewer's opinion. **None of these is a failure class**; except on
cover 8 / Arm A, no reviewer said any of them is a problem.

| # | Arm A | Arm B |
|---|---|---|
| 1 | surface = background; no gradient | surface = background; no gradient |
| 2 | accent = foreground; no gradient | surface = background; no gradient |
| 3 | no gradient | no gradient |
| 4 | gradient, 2 stops | surface = background; no gradient |
| 5 | no gradient | surface = background; no gradient |
| 6 | no gradient | surface = background; no gradient |
| 7 | surface = background; accent = foreground; no gradient | surface = background; no gradient |
| 8 | no gradient | accent = foreground; no gradient |

Counts across the 8 covers, with round 1 in brackets: Arm A collapsed the surface into the
background 2 times [3], the accent into the foreground 2 times [1], and emitted a gradient
once [3]. Arm B collapsed the surface 6 times [5], the accent once [0], and emitted no
gradient at all [1].

The one place where a mechanical fact and the reviewer's one comment line up: on cover 8 the
reviewer asked Arm A for `accent == foreground`; Arm B's palette on that same cover has
`accentCollapsed: true` (`#050500` in both roles) and was graded `strong`. The reviewer did
not say this — he wrote nothing on Arm B's item — and it is recorded here as a coincidence of
two records, not as a finding.
