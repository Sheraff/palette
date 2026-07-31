# Track P — Series 2: where does the vividness preference stop?

Probes only. **No runtime change**; the merge of trunk `c2366d2` adds 12 lines to
`palette-core.ts`, all comments, zero code.

Batch 17 answered *whether*: 8 vivid-preferred / 3 equal / 0 incumbent-preferred
across 11 cases, with no gating on mark evidence and no gating on hue jump. So
Series 2 probes **the edge** — the falsifying end, where a "no, that's too far"
verdict is what would make any future threshold calibratable rather than fitted.

## Fixes carried in from Series 1

- **Flat treatments now emit no `researchRender` key at all.** Series 1 emitted a
  `{ kind: "solid" }` shape that is not in the schema and had to be stripped by
  hand. Verified: 8 flat files carry no key, 14 gradient files carry
  `linear-gradient`, zero schema problems.
- **Two-colour artworks are excluded from contests.** On Track K2's rule an
  interior chord blend between the artwork's only two colours has no identity of
  its own, so the accent slot is not a live contest there — it collapses.
  Excluded on K2's own measure (background family + foreground family ≥
  `accentBlend.minimumTwoColourCoverage` = 0.8). **103 artworks excluded**, 4.5 %
  of the draw.

## The widened detector

`detect-boundary-contest.ts`. Series 1's signature with two floors lowered so the
edge is reachable at all, plus per-hit cell assignment:

| parameter | Series 1 | Series 2 |
| --- | --- | --- |
| chroma lead | ≥ 0.06 | **≥ 0.03** |
| challenger population | ≤ 1.5 % | **0.05 %** – 1.5 % |
| incumbent chroma / population, population ratio, accent-only discipline | unchanged | unchanged |

Cells: **same-hue** when the two accents are within 40° (the selector's own
`identityDirectionHueDegrees`); **boundary** when the challenger is tiny (≤ 0.4 %),
thin-lead (< 0.06) or thin-evidence (mark < 0.05 or ≤ 4 observed components);
**replicate** otherwise. A `challengerWeakness` score (0 = Series-1 strength,
1 = at every floor at once) orders the ladder.

## The mine

**2,310 images, all previously unsampled** (the draw excludes every file Series 1
touched), deterministic stride across all 21 roots.

**77 contests across 72 artworks → 3.1 % hit rate** (Series 1: 1.25 % at the
tighter signature). By cell: same-hue 46, boundary 26, replicate 5. Hits in 20 of
21 roots. **Zero errors in 2,310 extractions.**

Cumulative: 4,077 of 7,550 images now run (54 %), zero crashes.

## The series — 11 cases

`vivid-series-2-incumbent/` and `vivid-series-2-vivid/` under the shared
checkout's `data/results/`, plus `vivid-series-2-manifest.json`. Committed copies
under `research/v2-3-experiments/track-p/review-series-2/`.

Same discipline as Series 1: the vivid side is a **real treatment from the actual
slate**, differing from the incumbent in exactly one colour.

### Boundary ladder (5) — ordered strongest challenger to weakest

| rung | case | incumbent → vivid | challenger | lead | margin |
| --- | --- | --- | --- | --- | --- |
| 1 | `05/…05318308` | `#fcdc65` 4.23 % → `#f51702` | 0.462 %, p0 obligation, 6 mark-components | 0.104 | **0.0062** |
| 2 | `0e/…0e91d6c3` | `#fbf072` 2.65 % → `#fb7739` | 1.306 %, 22 mark-components of 796 | **0.031** | 0.0413 |
| 3 | `13/…13bebcae` | `#d5c47f` 6.23 % → `#035ba5` | 1.274 %, **8 components, mark 0.000** | 0.049 | 0.0127 |
| 4 | `0a/…0a392cb5` | `#ffd800` 19.19 % → `#0626f7` | **0.125 %**, mark 0.000, 169° hue jump | 0.108 | 0.1122 |
| 5 | `08/…08601958` | `#fbb94b` 9.87 % → `#f34e2e` | **0.149 %, 2 components, mark 0.000** | 0.062 | 0.1108 |

Rung 1 is a strong challenger the objective *nearly* picks already (0.0062
behind, rank 2). Rung 2 tests the thinnest chroma lead in the corpus (0.031) —
"barely more saturated". Rung 3 has a real size but almost no evidence quality.
**Rungs 4 and 5 are the deliberate falsifier candidates**: rung 5's challenger is
two connected components at 0.149 % of frame with zero mark support — if
"prefer vivid" has any limit at all, a blue-collar noise speck promoted to accent
is where it should appear.

### Same-hue cell (4) — the thin, mixed cell from batch 17 (n was 2)

| case | incumbent → vivid | hue gap | note |
| --- | --- | --- | --- |
| `0e/…0eaebc73` | `#78d429` 1.90 % → `#7df20d` 0.373 % | **1°** | purest intensification available |
| `05/…05a54a9e` | `#6c0808` 14.13 % → `#fd645f` 0.261 % | 3° | 54× population ratio, dark red → coral |
| `10/…1031d1e1` | `#e7a37e` 6.83 % → `#f3a630` 0.358 % | 23° | peach → amber, close margin (0.0156) |
| `0d/…0d804960` | `#774e0c` 2.09 % → `#fcd552` 0.130 % | 20° | same-hue **and** tiny — the two cells crossed |

### Replicate cell (2) — stability checks

| case | incumbent → vivid | note |
| --- | --- | --- |
| `01/…014fb430` | `#fbd17f` 2.00 % → `#4bca23` 0.818 % | mark 0.195, 23 mark-components — a real graphic, 57° jump |
| `0e/…0e3f0c79` | `#030c51` 4.28 % → `#f9f61f` 0.719 % | navy → yellow, 157° jump, mark 0.056 |

## Incidental finds (770-image subset of the new draw)

164 flagged. **No crashes, no generated colours.**

| flag | count | rate | reading |
| --- | --- | --- | --- |
| `all-neutral` | 98 | **12.7 %** | replicates Series 1's 13 % on a disjoint sample — a stable corpus property, not a fresh-roots artefact |
| `extreme-field` | 72 | 9.4 % | mostly legitimate black/white artwork |
| `double-collapse` | 26 | 3.4 % | up from Series 1's 2 % — consistent with K2's two-colour rule landing, so expected behaviour rather than a defect |
| `flat-gradient` | 3 | 0.4 % | gradient claimed with endpoints < 0.05 OKLab apart |
| `near-duplicate` | 1 | 0.1 % | **worth a look** |

**The one I would escalate:** `09/…092c140f` →
`#efe1ee #0041fd #eee1ee #a9b1f2`. Background `#efe1ee` and foreground `#eee1ee`
are distinct hexes but **0.02 OKLab apart** — the text is very nearly the
background colour. The surface is a vivid blue, so this is not a two-colour
artwork; it looks like a genuine foreground-selection failure. One case, not
diagnosed.

The three `flat-gradient` cases (e.g. `14/…140a2591` `#0d1015 → #161b21`) claim a
gradient across endpoints that are almost the same colour. Possibly correct under
the midpoint machinery, possibly a gradient that should not have been allowed —
the charter's "incorrectly allowed is as bad as incorrectly prevented" makes this
worth one look.

## What the ladder can settle

- **If rungs 4–5 come back incumbent-preferred and 1–3 vivid-preferred**, the
  boundary is an *evidence-quality* floor, and the natural mechanism is a
  component-count or mark floor on accent candidacy — which the system already
  measures (`markSupport`, `observedComponentCount`).
- **If rung 2 alone is rejected**, the boundary is the chroma lead, and the
  threshold sits between 0.031 and 0.049.
- **If all five come back vivid-preferred**, there is no boundary in the range
  the slate can offer, and the mechanism is unconstrained on the vivid side — in
  which case the constraint has to come from somewhere other than the artwork
  evidence.
- **The same-hue cell separates "vivid" from "hue-novel".** If `0e/…0eaebc73`
  (1° apart) is preferred, saturation alone is wanted and the `skap`
  hue-diversity principle does not govern the accent role.

## Honest notes

- The 3.1 % hit rate is not comparable to Series 1's 1.25 % — the signature was
  deliberately widened. On the Series-1 signature this draw would yield fewer.
- `challengerWeakness` is my own composite of five floors, used only to order the
  ladder for presentation. It is not a measurement the algorithm makes and no
  threshold should be read off it.
- Rungs 4 and 5 have large relation margins (0.11) and deep slate ranks (164,
  86). They are legal treatments, but the objective ranks them far down — if
  review prefers them, that is a much stronger statement than rung 1, where the
  objective was nearly there already.
- One case (`0d/…0d804960`) belongs to two cells at once (same-hue *and* tiny). I
  filed it under same-hue; its verdict informs both.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-p/detect-boundary-contest.ts <out.jsonl> --list <paths>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-p/harvest-anomalies.ts <out.jsonl> --list <paths>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-p/build-review-series.ts data/all-hits.jsonl selection.txt
```

`data/sample.txt` is the draw (deterministic stride, disjoint from Series 1),
`data/all-hits.jsonl` the 77 contests, `selection.txt` the 11 chosen,
`data/anom*.jsonl` the incidental finds.
