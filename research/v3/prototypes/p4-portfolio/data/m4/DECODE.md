# M4 `phase2-pair-023` — decoded verdicts (data only)

Batch `phase2-pair-023`, purpose `mechanism`, pushed 2026-08-11T18:42:56.843Z, **released**
2026-08-11T19:16:17.317Z (empty release note). 8 items, 0 vetoes, 0 retractions, 1 endorsement.
Machine-readable twin: `decode.json`. Regenerator: `decode.py` (reads the served API, the batch log,
`mapping.private.json`, `selection.json`; writes only into `data/m4/`).

Side letters below are the **served** letters the reviewer saw. `elected` = the selector's elected
palette (side under test); `p3` = `p3-fields`, SPEC §3 F3's comparator.

## 1. Decode verification — three joins, per item

Each item was decoded three ways and the three agree on **8 / 8** items (`disagreements: []`).

1. **Batch-log blinding join.** `batches.jsonl` line 47 (`blindingSalt`
   `2ea99c98…4778a33`) carries per-item `blinding: {A: idx, B: idx}` into the pushed side array,
   whose order is the fixture order. Letter = the one whose index equals the elected side's
   `fixturePosition` in `mapping.private.json`.
2. **Salt recomputation.** From `mapping.private.json`'s `salt` alone, per `build.ts` L152/L161:
   `flip = parseInt(sha256(salt|itemId|"order")[0:8],16) % 2 === 1`, order `[elected, p3]` flipped if
   set; `variantId = "v"+sha256(salt|itemId|member)[0:15]`. All 16 variantIds recomputed **match**
   the mapping's recorded tokens (`allVariantIdsRecomputed: true`); all 8 recomputed order parities
   **match** the mapping's recorded `fixturePosition` (`allOrderParitiesRecomputed: true`); each
   recomputed elected `variantId` sits at the recomputed position inside the batch log's pushed
   side array on all 8 items (`allVariantIdPushedPositionsMatch: true`).
3. **Palette-content join** (cross-check, independent of both): the served side's four role hexes +
   gradient stops + collapse flags matched the mapping's elected palette exactly on all 8 items.

`selection.json`'s elected member and marginBits agree with `mapping.private.json` on all 8 items.

| # | cover stem (tail) | elected member | elected letter | m1 | m2 | m3 | agree |
|---|---|---|---|---|---|---|---|
| 1 | `…2590bed1b2` | p2-tree | **A** | A | A | A | yes |
| 2 | `…e78a7dda49` | p5-fieldfit | **B** | B | B | B | yes |
| 3 | `…93d1073d33` | p5-fieldfit | **A** | A | A | A | yes |
| 4 | `…d8a3783eee` | p2-tree | **B** | B | B | B | yes |
| 5 | `…757a275520` | p5-fieldfit | **A** | A | A | A | yes |
| 6 | `…10224c5ca4` | p2-tree | **A** | A | A | A | yes |
| 7 | `…fd71ab8a6b` | p5-fieldfit | **B** | B | B | B | yes |
| 8 | `…285a15a23d` | p2-tree | **A** | A | A | A | yes |

## 2. Per item (margin ascending — ROUND.md §2 order)

### 1. `ab67616d00001e02000f9ddb5dfe0c2590bed1b2` — margin **971.53** bits, narrow, wf 0.214 / 14
Elected `p2-tree` = side **A**; p3 = side **B**. **electionFlippedByFix: true** (the flip cover).
grades: elected **unacceptable**, p3 **weak**. preference `b` (`prefilled`) → **p3**. score −1.
veto: none. revision 1. differing roles vs best: all 4. figure/ground: neither side.
Served names — elected: Shamrock Green / Rosy Taupe / Jade / Primrose, gradient Shamrock Green →
Rosy Taupe. p3: Brume / Amazon / Mana Tree / Luigi, no gradient.
Comment VERBATIM (side A = elected, side B = p3):
```
side A: no green-to-brown in this artwork
side B: pink is the color of the face of a person in this picture, it doesn't really fit as a background
both: the main text is white in this artwork, it might be good to have the foreground be white
```

### 2. `ab67616d00001e020006bd0cd831e3e78a7dda49` — margin **8 052.92** bits, narrow, wf 1.000 / 4
Elected `p5-fieldfit` = side **B**; p3 = side **A**.
grades: elected **strong**, p3 **strong**. preference `b` (`explicit`) → **elected**. score +1.
veto: none. revision 1. differing roles: all 4. figure/ground: neither side.
Served names — elected: Kelp / Field Drab / Ice / Walnut, gradient Kelp → Field Drab. p3: Walnut /
Caveman / Lost in Time / Spring Roll, gradient Walnut → Caveman.
Comment VERBATIM: `` (empty).

### 3. `ab67616d0000b273000def1df4b5be93d1073d33` — margin **12 172.50** bits, mid, wf 0.875 / 8
Elected `p5-fieldfit` = side **A**; p3 = side **B**. figure/ground class: elected side true.
grades: elected **acceptable**, p3 **weak**. preference `a` (`prefilled`) → **elected**. score +1.
veto: none. revision 2. differing roles: all 4.
Served names — elected: Iron Grey / Tuna / Obsidian / Lead, gradient Iron Grey → Tuna. p3: Hickory /
Umbra / Starlight / Rustling Leaves, no gradient.
Comment VERBATIM: `` (empty).

### 4. `ab67616d0000b2730008e0e708edbad8a3783eee` — margin **98 724.04** bits, mid, wf 1.000 / 4
Elected `p2-tree` = side **B**; p3 = side **A**. figure/ground class: elected side true. 3 roles
differ (surface, foreground, accent).
grades: elected **unacceptable**, p3 **weak**. preference `a` (`prefilled`) → **p3**. score −1.
veto: none. revision 9.
Served names — elected: Lake Blue / Cocoa / Bay / Taxi Yellow, gradient Lake Blue → Cocoa. p3: Blue
Blood / Rain Check / Mole / Paprika, gradient Blue Blood → Rain Check.
Comment VERBATIM (side A = **p3**, side B = **elected**):
```
side A: orange is a poor pick for an accent, its presence in the artwork looks accidental, when there are strong yellows and greens
side B: there are no blue-to-brown gradients in this artwork
```

### 5. `ab67616d0000b2730014c3a0501a86757a275520` — margin **116 916.93** bits, large, wf 1.000 / 4
Elected `p5-fieldfit` = side **A**; p3 = side **B**. figure/ground class: elected side true.
grades: elected **acceptable**, p3 **unacceptable**. preference `a` (`prefilled`) → **elected**.
score +1. veto: none. revision 1. differing roles: all 4.
Served names — elected: Rum / Pebble / Taxi Yellow / Frost, gradient Rum → Pebble. p3: Dandelion /
Garnet / A Frond in Need / Marsala, no gradient.
Comment VERBATIM: `` (empty).

### 6. `ab67616d0000b27300103b70ede16610224c5ca4` — margin **493 698.89** bits, large, wf 1.000 / 4
Elected `p2-tree` = side **A**; p3 = side **B**. figure/ground class: **p3** side true.
grades: elected **strong**, p3 **strong**. preference `b` (`explicit`) → **p3**. score −1.
veto: none. revision 1. differing roles: all 4.
Served names — elected: Powder Cornflower / Storm's Coming / Oil / Khaki, gradient Powder Cornflower
→ Storm's Coming. p3: Bare Mintimum / Adrift on the Nile / Lamplighter / Duckweed, gradient Bare
Mintimum → Adrift on the Nile.
Comment VERBATIM: `` (empty).

### 7. `ab67616d0000b27300133fe10d39cafd71ab8a6b` — margin **1 712 029.68** bits, huge, wf 0.646 / 48
Elected `p5-fieldfit` = side **B**; p3 = side **A**.
grades: elected **weak**, p3 **strong**. preference `a` (`prefilled`) → **p3**. score −1.
veto: none. revision 1. differing roles: all 4. figure/ground: neither side.
Served names — elected: Pitch Black / Pitch Black (**surfaceCollapsed: true**) / Sesame / Snow, no
gradient. p3: Soot / Pitch Black / Greige / Orange You Glad, no gradient.
Comment VERBATIM: `` (empty).

### 8. `ab67616d0000b27300046beb8271bf285a15a23d` — margin **6 283 763.60** bits, huge, wf 1.000 / 4
Elected `p2-tree` = side **A**; p3 = side **B**. figure/ground class: **p3** side true.
grades: elected **weak**, p3 **acceptable**. preference `b` (`prefilled`) → **p3**. score −1.
veto: none. revision 6. differing roles: all 4.
Served names — elected: Marzipan / Starling / Sour / Lemon Posset, gradient Marzipan → Starling. p3:
Beige / Sheaf / Oblivion / Fly-by-Night, gradient Beige → Sheaf.
Comment VERBATIM (side A = elected, side B = p3):
```
side A: there is no beige to dark gradient in that artwork
side B: black foreground doesn't really match this artwork, a better foreground might be Lemon Curd or other yellow tones
```
**Endorsement** (1, not retracted, empty comment): the **p3** side's palette with the foreground
replaced — background `#d4c4b7` (Beige), surface `#d1a298` (Sheaf), accent `#151c60` (Fly-by-Night),
gradient Beige → Sheaf all unchanged; foreground `#0d0d31` (Oblivion) → `#f1e998`.

## 3. Aggregates

**Preference counts (decoded):** elected **3**, p3 **5**, no-preference **0**.

**Grade distribution per side:**

| side | strong | acceptable | weak | unacceptable |
|---|---|---|---|---|
| elected | 2 | 2 | 2 | 2 |
| p3 | 3 | 1 | 3 | 1 |

**Net score, ROUND.md §3's read rule** — verbatim: *"Scored per item from the pairwise preference:
**+1** the selector's side, **−1** P3's side, **0** no-preference."* → per-item scores in margin
order: −1, +1, +1, −1, +1, −1, −1, −1. **Net = −2** (3 × +1, 5 × −1, 0 × 0).

**Preference vs margin, at the pre-registered gap** (median split of the §2 ascending order):

| half | items (bits) | preferences elected / p3 / none | net |
|---|---|---|---|
| narrower four | 972, 8 053, 12 173, 98 724 | 2 / 2 / 0 | **0** |
| wider four | 116 917, 493 699, 1 712 030, 6 283 764 | 1 / 3 / 0 | **−2** |

Half-net difference **|−2 − 0| = 2** (threshold ≥ 4); wider half's net **−2** (not positive).
Kendall's tau-b, margin rank vs item score, descriptive: **−0.342**.
Secondary, reported not tested — decisiveness split: winFraction 1.000 (n = 5) net **−1**;
winFraction < 1.000 (n = 3; 0.214, 0.875, 0.646) net **−1**.

## 4. Pre-registered branches, applied mechanically

Scope note quoted from §3: *"'Majority' below means a strict majority of the eight items."* → 5 of 8.

**(a)** criterion verbatim: *"**(a) The selector's sides preferred on a majority → F3 survives; the
selector earns its existence.**"* — elected preferences **3**, required **5**. **Does not fire.**

**(b)** criterion verbatim: *"**(b) P3's sides preferred on a majority → F3 FIRES.**"* — p3
preferences **5**, required **5** (5 ≥ 5, strict majority of eight). **FIRES.**

**(c)** criterion verbatim: *"**(c) Mixed → the per-cover read against margin size, and the rule is
fixed now.**"* — not mixed: (b)'s majority is satisfied. **Does not fire.** Its numbers are reported
above anyway; had it been reached, its own sub-rule — verbatim: *"**Margin-size dependence is
declared only if** the two halves' net scores differ by **≥ 4** (two items' worth of swing) **and**
the wider half's net is positive."* — would **not** be met (delta 2 < 4; wider net −2 ≤ 0), leaving
its residual clause *"Any other mixed pattern is reported as **"no read at n = 8"**."*

**(d)** criterion verbatim: *"**(d) A within-pair family-sharing complaint** — the reviewer objecting
that a side gives background/surface or foreground/accent "the same colour twice" — is handled in
`NOTES-cross-arm.md` note 2's vocabulary: **family separation is evaluated figure-vs-ground, never
within a pair**"* — **no such complaint occurs.** No comment objects to a repeated colour within a
pair. The condition existed and drew no complaint on item 7, where the elected side served
background and surface both as Pitch Black (`surfaceCollapsed: true`) and its comment is empty.
All four non-empty comments are semantic/gradient-plausibility objections instead: "no green-to-brown
in this artwork", "there are no blue-to-brown gradients in this artwork", "there is no beige to dark
gradient in that artwork", "orange is a poor pick for an accent", "pink is the color of the face of a
person in this picture", "black foreground doesn't really match this artwork".

**Comments referencing colour NAMES** (branch (d) vocabulary check): item 8 side B — *"a better
foreground might be Lemon Curd or other yellow tones"*: **Lemon Curd is not a served name on that
item** (served there: Marzipan, Starling, Sour, Lemon Posset / Beige, Sheaf, Oblivion, Fly-by-Night)
— external naming vocabulary. Item 8 side A — *"no beige to dark gradient"* uses "beige" lower-case
while **Beige** is the *opposite* (p3) side's served background name on the same item; the elected
side's gradient there is Marzipan → Starling. Item 1 uses generic colour words only ("green-to-brown",
"pink", "white"), item 4 likewise ("orange", "blue-to-brown", "yellows", "greens"). Cross-side served
name collisions exist on two items: item 2 (Walnut = elected accent `#3c362a` and p3 background
`#3d3522`) and item 7 (Pitch Black = elected background+surface `#010000` and p3 surface `#000000`).

## 5. Outside the pre-registered branches — flagged verbatim

1. **Preference provenance is not independent of the grades on 6 of 8 items.** `preferenceSource`:
   `prefilled` **6**, `explicit` **2**. All 6 prefilled preferences point at the higher-graded side
   (6 / 6). The only 2 explicit preferences are the two grade-tied items (both strong/strong):
   `…e78a7dda49` → elected, `…10224c5ca4` → p3. ROUND.md §3 scores "the pairwise preference" without
   distinguishing prefilled from explicit; the distinction is not pre-registered.
2. **An endorsement was recorded** (item 8, p3's palette with foreground `#f1e998`). ROUND.md's
   branches score preferences only and say nothing about endorsements.
3. **Grade-vs-preference divergence is absent by construction** on the 6 prefilled items, so the
   grade distribution in §3 is not an independent second measurement of the same 8 items.
4. **Verdict revisions**: revision 9 on `…d8a3783eee`, 6 on `…285a15a23d`, 2 on `…93d1073d33`;
   `amendmentCount` is 0 and `amendedAt` null on all 8 (revisions predate release, no amendments).
5. **The escape went unused**: 0 `no-preference`, 0 vetoes, 0 `confound` flags on 8 items, though
   ROUND.md §4 states *"`no-preference` is a real answer here, not a failure"*.
6. **Item 1 is the flip cover** (`electionFlippedByFix: true`) and scored −1; ROUND.md §2 pre-states
   *"No verdict here will be read as evidence for or against the ruling's direction."*
7. **The disclosed blinding asymmetry held on the payload as served**: the elected side publishes a
   gradient on 7 of 8 items, p3's side on 4 of 8 (`blindingCaution` in `mapping.private.json`), and
   three of the four non-empty comments turn on whether a *gradient* is warranted by the artwork.
