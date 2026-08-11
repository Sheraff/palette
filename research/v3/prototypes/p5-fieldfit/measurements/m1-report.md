# W-M1 — measurement only, nothing adopted

Probes: `measurements/probe-narcosis.ts`, `measurements/probe-fgfloor.ts` (read-only imports;
floor raised via the caller path `max(minTextContrast.effectiveRawMagnitude, FOREGROUND_MIN_RAW_APCA)`,
Lc 17.3 → raw **20.000** exactly). No file outside `measurements/` touched.

## 1 — NARCOSIS `…45baf46c90` (ruling R2)

Published: bg `#e9d3df` / sf `#d7e2e4` / fg `#161010` / ac `#98a9c3`. Accent shortlist = 3, all feasible.

| # | hex | source | **class** | ink verdict | mass | min\|raw\| | vis vs bg / sf (floor .07444) | twin ratio (÷8 bars) | families covered | OKLab C |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `#98a9c3` sky | component d2 | **B** | mort .357 / adj .601 → **not ink** | 45 730 | 27.27 | .1655 / .1783 ✓ | 33.91 ✓ | **none** | .0424 |
| 2 | `#5a1921` crimson | component d3 | **B** | mort .818 / adj .562 → **not ink** | 23 633 | 79.00 | .5712 / .5929 ✓ | 10.96 ✓ | **none** | **.0949** |
| 3 | `#36181a` | overlay | A | — | 55.6 | 83.13 | .6359 / .6547 ✓ | 8.76 ✓ | **none** | .0479 |

Every candidate clears every floor; no floor discriminates. Both region colours are class **B**
(ground-shaped: adjacency ≫ 0.10, so 15a's ink conjunct fails for both).

### (c) three orderings

| ordering | winner |
|---|---|
| current — union by mass | `#98a9c3` (sky) |
| **class-first** (overlay before ground components) | **`#36181a`** — the 55.6-mass speck, *not* the crimson |
| **coverage-first** | tie: all three cover **0** families; chosen coverage 1 = the field's own |

Identity set (F=4, 1× bar): `#e4e2e5` .049, `#d5e0e2` .036, `#ecd7dc` .032, `#c9e1e5` .018 — four
pale sky variants. `massRetained` **0.1819**: the 1e-4 triple floor discards 82% of the image, and the
textured crimson scrub is all of what it discards. The crimson appears **nowhere in the full 27-family
ranking**; nearest family centre is OKLab **0.579** away. At `P5_IDENTITY_BAR_MULTIPLE=8` only two
families survive (pale, near-black) and the accent is still the sky. At `P5_IDENTITY_FAMILIES=27`
coverage-maximisation picks `#36181a`/fg `#131210` — the speck again, never the crimson.

### (d) reading

**No mechanism in the current stack selects the crimson, and neither counterfactual ordering does
either.** Class-first is actively worse: it hands the accent to a 55.6-mass dark speck, because both
region colours are class B and the only class-A candidate is a fragment of the horizon line. Coverage
is inert here by construction — the identity set is read off surviving *exact triples*, so a smooth
pale sky (few triples, huge mass each) monopolises all four family slots while a textured 40%-of-frame
crimson field (thousands of sub-floor triples) contributes literally nothing; widening the family
radius 8× does not fix it, because the crimson never enters the ranking to be widened *into*. The one
quantity that separates the reviewer's colour from the published one is **chroma**: crimson C = .0949
against sky .0424, background .0290, surface .0122 — the crimson is the only candidate more than 2×
as chromatic as anything already published, and it is also 2.9× the sky on legibility (79.0 vs 27.3).
So: **only an identity/chroma-aware term would select it** — either a family definition whose mass is
spatially rather than triple-wise accumulated (mark/region-level grouping, R4's v0.9 item), or an
explicit chromatic-presence criterion. I say that plainly: R2's "adopt whichever measured mechanism
selects the reviewer's colour" has **no qualifying candidate**; on this measurement R2 escalates to
the v0.9 identity cycle.

## 2 — Foreground floor 15 → 20 (ruling R3)

**Cover count: 31, not 28.** `demo-20`(20) + `p5-round2-fresh`(2) + `p5-round3-fresh`(5) +
`p5-round4-fresh`(4), union deduped = 31. wp16's "27" is the first three sets; round 4's four are new.

**5 of 31 foregrounds change; 1 accent changes; no new escape; no cover loses every candidate.**

| cover | fg old → new | min\|raw\| old → new | mass old → new | note |
|---|---|---|---|---|
| **`fc8d58e0af`** | `#201c13` → **`#e0d0db`** | **16.93 → 57.04** | 666 → 563 | **round-4 item 4 — graded STRONG.** Accent `#9ba193` holds |
| **`10266bb9`** | `#dcdcdc` → `#d3d3d1` | **17.85 → 23.11** | 1460 → 966 | **round-4 item 5**, the fg-floor probe |
| `5a94002abc` | `#beabb1` → `#2a2924` | 17.26 → 38.99 | 817 → 164.7 | also swaps accent → `#beabb1` (unreviewed) |
| `949021f65e` | `#cfbaa5` → `#c4af9a` | 16.09 → 22.04 | 256.7 → 201 | same colour family (unreviewed) |
| `4130886c02` | `#1f5a00` → `#184d00` | 16.63 → 21.10 | 208.1 → 115 | same colour family (unreviewed) |

**Covers left with no class-A candidate ≥ 20: exactly one, `28279e9184`.** Its sole class-A candidate
`#eaeaea` (mass 42.6, raw 18.90) drops out and the shortlist becomes class-B-only. Nothing happens:
the class-B component `#fafafa` (11 795, raw 29.27) already held the slot via coverage — this is
wp16 §1(c)'s `classOverriddenByCoverage` cover, which simply loses the alternative it was overriding.
`8395a0f57b` was already on the escape at floor 15 (`#000000`, empty shortlist) and is unchanged.

### The finding R3 needs before it ships

R3's bracket is stated as **(17.85, 28.9]** with item 5's 17.85 as the sole interior datum. The sweep
falsifies the lower endpoint: **round-4 item 4 (`fc8d58e0af`) was graded STRONG with a foreground at
raw 16.93** — a reviewer-endorsed foreground *below* the proposed bracket floor. A floor of 20 replaces
it with `#e0d0db`, a pale pink at 57.04, on the cover that just closed the round-2 named-green
prediction. Any floor above ~16.93 costs that STRONG; the honest bracket on all current evidence is
**(10.6, 16.93]**, which excludes 20 and excludes 17.85.

Item 5's own outcome is also weak evidence for 20: the new fg `#d3d3d1` sits at 23.11 = **1.16×** the
raised floor, against the 1.19× that drew "works, but… on the edge". Round 4's finding 3 was
*margins, not floors*; a floor of 20 buys item 5 a margin of 1.16. The shortlist entry that would
actually answer the complaint is `#babbb5` at 36.77 (mass 497) — reachable only by a margin rule, not
by any floor that keeps item 4.
