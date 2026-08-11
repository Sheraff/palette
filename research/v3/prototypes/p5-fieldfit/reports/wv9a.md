# W-V9a — the mark/region instrument, built and measured. Nothing wired.

`src/marks.ts`, `tests/marks.test.ts`, `measurements/v9a-{marks,cost,split}.ts` — owned paths only.
Types proposed in `reports/wv9a-types.md`. `ALGORITHM_VERSION` unmoved.

## (a) NARCOSIS `45baf46c90` — **anchor met**

| set | top-4 | retained | families |
|---|---|---|---|
| v1 triple-wise | `#e4e2e5` .049 · `#d5e0e2` .036 · `#ecd7dc` .032 · `#c9e1e5` .018 | **.1819** | 27 |
| **v2 material** | `#e6dde2` .334 · `#94aac2` .112 · **`#8d2639` .101** · `#271515` .082 | **.6945** | 8 |

A crimson enters at **rank 3** — mark, 41 195 px, C **.1376** (m1: sky .0424). But it is *not* m1's
`#5a1921`, which is region rank **5** (.058, C .0949) and covers **no** v2 family at 1× bar.

## (b) the three other identity covers

| cover | v1 top-4 (retained) | v2 (retained) | verdict |
|---|---|---|---|
| r4-3 `9646be9b20` | `#01bdfd` `#fde9d0` `#f9f1fe` `#ffffff` (.221) | `#7f7ca7` .78 · `#00bcfa` .16 (.945) | **worse** — the retreat's one region medians a vivid illustration to mud; the published cream is gone |
| r4-5 `10266bb9` | `#ffffff` `#dcdcdc` `#d3d3d1` `#ccccca` (.872) | `#ffffff` .81 · `#bfbfb7` .19 (1.000) | fg `#dcdcdc` covered v1 r2, covers no v2 family |
| r4-6 `8395a0f57b` | none (escape, no assignment) | `#1b86bc` .89 · `#2996cf` .11 | first identity set this cover has |

**v2 is a union candidate, not a replacement.** A region is *one* colour; a ramped or illustrated
field is many. It fixes the cover v1 cannot see and loses colours v1 had on 2 of 3 comparables.


## (c) 15b, round-3 items 4 + 8

| cover | ask | material within 1 bar | grouped as | mortality |
|---|---|---|---|---|
| `4130886c02` | white title | **6 px** (`#ffffff`) / 91 px pale | ≥4 marks of ~30 px | 1.000 — ink-shaped but **fragmented** |
| `757a78343d` | black type | **43 px** | mark `#6e3406`, 24 225 px | **.898 ≥ .85 → ink-shaped** |

15b now fires — on item 8's *accent* colour, not the reviewer's black; on item 4 the asked-for white
is ~10⁻³ of frame and the scale choice fragments it.

## (d) `fc8d58e0af` — **the preference must sit below holding class**

`#201c13`'s material is 764 px inside mark `#565b57` (31 750 px, mortality **.647 → not ink**). The
only ink-shaped entries are `#9ba193` (.933, the published accent) and a 214-px mark — so an ink
preference would displace the STRONG.

## (e) cost — inside envelope at corpus sizes, out at 3000²

| size | fit ms | marks ms | ×fit |
|---|---|---|---|
| 300² | 143–246 | 62–524 | 0.38–2.13 |
| 640² | 370–646 | 350–498 | 0.54–1.35 |
| 3000² | 1633–2909 | 3819–12430 | 2.03–**7.61** |

Profiled (`v9a-split.ts`) of an 8.2 s 3000² read: `barNeighbourhoodMass` 3.4 s,
`chessboardDistanceToComplement` 2.7 s, `labelComponents` 2.3 s. One answer-preserving fix applied
(snap inventory restricted to 2 bars — exact, −1 s). Two exact ones left for V9b: an erosion
short-circuit below the ink scale (pad 113→23 px), and a one-pass mass in `snap.ts` — not my file.

## Synthetics and verification

11/11 new: text→ink-shaped marks at the stable scale; textured region→massive, not ink; ±1-LSB
idempotence of grouping **and** family set; cropped ink ≡ wp12's whole-frame `inkStatistics` (incl.
border replication); ladder scale-free; supports disjoint; determinism; monotone merging.
**Suite 107/107**. **demo-20 byte-identical**, 20/20 at 0.0000. `tsc --strict` clean but the two
pre-existing contract errors.

## Three rulings needed

1. **15a's adjacency conjunct is inert at mark level** — 1.000 on every mark, by construction.
   `inkShaped` (mortality alone, same constant) is proposed. Not clean: NARCOSIS's scrub reads
   **.954**, inside wp12's own (.67, .99) bracket.
2. **arm-f's criterion is unstable.** A plateau exists on 4 of 7 covers; otherwise the log-log
   fallback takes a ladder end (r=1/473 marks vs r=23/7 marks). The `N(r)` curve is published.
3. **v2 beside v1, never instead** — §(b).
