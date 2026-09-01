# Ramp-midpoint insertion

**Arm:** `ramp-midpoint-insertion` · **Trunk:** `b82c520` · **Date:** 2026-08-01
**Outcome: a mechanism ships behind `RAMP_MIDPOINT_INSERTION`, defaulting OFF.** Flag off, every
extraction is byte-identical to trunk. Flag on, three artworks in 201 change and two of them gain a
third stop; nothing with a strong verdict moves, and no artwork's `gradient` boolean moves in either
direction.

**Corpus for every number below:** the unscrambled shared checkout `/Users/Flo/GitHub/palette` —
201 artworks (every warehouse-reviewed artwork whose path a batch records, plus the on-panel
`images/` originals, deduplicated), with the four vetoed artworks excluded. The worktree's own
`images/` holds 34 `-scrambled` decoys and was never read; every run set
`PALETTE_IMAGES_ROOT=/Users/Flo/github/palette/images` and the sweep prints the resolved root.

---

## The mechanism, in one paragraph

A gradient renders as a straight OKLab interpolation from background to surface. Sample that line at
nine positions, convert each sample to sRGB, and ask how far it is — in ΔE — from the nearest colour
the artwork actually holds with real pixel population. The largest of those nine distances is the
ramp's **excursion**. When the excursion says the render has left the artwork, look for a third stop
among the artwork's own populated colours that brings the excursion back down, and publish it at
position 0.5. Nothing about which endpoints were chosen, and nothing about whether a gradient
publishes at all, is touched.

Code: `research/v2-3/src/internal/ramp-midpoint.ts`, wired at
`research/v2-3/src/internal/palette.ts` `applyRampMidpoint`.

---

## 1. The criterion

### 1.1 What "the artwork actually holds" means

`buildRampSupport` quantises every pixel of the native evidence into OKLab cells one
`familyBinStep` wide — the same cell size the rest of the evidence pass uses, so "a different colour"
means here what it means everywhere else — and keeps the cells occupying at least
`RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION` = 0.001 of the artwork. Each surviving cell is represented
by the exact source pixel nearest its centre (ties by lower pixel index), so the result is a pure
function of the image and no colour in it is a lone pixel: one thousandth is ~400 px on a 640×640
master and ~120 px on a 350 px thumbnail, two orders of magnitude above
`policy.mark.minimumComponentPopulation`.

Measured size of that set over the 201 artworks: median **75** colours, from 1 (`purewhite`, which is
one colour) to 238 (`birdsofprey`).

### 1.2 The excursion, on the two targets

**`00093ce4` — the endorsed teal/oxblood pair.** Flo endorsed background `#0e4355`, surface `#6b141a`
(verdict L448, `cs2-batch`) and wrote: *"would only work if we added a dark midpoint. But doing so
would make this palette extremely good."* Measured on that pair, against this artwork's own colours:

| t | rendered | ΔE to nearest artwork colour |
| --- | --- | --- |
| 0.1 | `#234150` | 6.14 |
| 0.2 | `#303e4a` | 4.66 |
| 0.3 | `#3a3b45` | 8.04 |
| 0.4 | `#43383f` | 8.22 |
| **0.5** | **`#4b343a`** | **9.28** |
| 0.6 | `#523034` | 6.54 |
| 0.7 | `#592b2e` | 1.83 |
| 0.8 | `#5f2528` | 6.79 |
| 0.9 | `#651e21` | 6.94 |

The worst sample is the middle one and it is `#4b343a` — a grey-mauve. That is the colour Flo
described as not feeling like part of the artwork, found by measurement rather than by being told
about it.

The same artwork's *currently published* endpoints (`#16272e` → `#3d181f`, gradient true, no third
stop) measure **9.19**, worst at t = 0.8. So this artwork is above the bar on both the endorsed pair
and the shipped pair.

**`0009d178` — the thrice-asked rich gradient.** This artwork publishes `gradient: false` on trunk
(`#000000` → `#ed3358`), so **the mechanism cannot touch it**, and must not: making it gradient is an
endpoint/field decision and this arm is forbidden from changing the gradient set. Measured on the ramp
Flo actually asked for — Night Violet `#25213b` to Embarrassed `#ef74b5` (verdicts L247, L438) — the
excursion is **16.65**, worst at t = 0.7 (`#ae5b8e`, a washed mauve-pink). The criterion fires
emphatically on the ramp Flo wants; it is the endpoints that are out of reach, not the midpoint.

### 1.3 Separation, over 82 gradient artworks

All 82 gradient winners, flag off, ranked by excursion of what actually renders today (third stop
included where one exists) — the full table is §1 of `analyze.ts` output. The distribution:

| set | n | min | p25 | median | p75 | p90 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| all gradients | 82 | 1.92 | 5.90 | 6.76 | 7.82 | 8.67 | 18.63 |
| reviewed gradients | 66 | 1.92 | 5.96 | 6.88 | 7.82 | 8.67 | 18.63 |
| **reviewed strong** | 43 | 1.92 | 5.30 | 6.61 | 7.44 | 7.90 | **18.63** |

**Taken over all gradients, the criterion fails.** The single largest excursion in the corpus,
ΔE 18.63, belongs to `birdsofprey` — reviewed **strong five times** (L4, L11, L24, L156, L442), and
L11 is a batch where the midpoint value itself was A/B'd and accepted. A criterion whose top-ranked
case is the corpus's most-endorsed gradient is not a criterion.

**Restricted to the gradients that publish no third stop, it separates cleanly.** `birdsofprey`
already carries a transition-path midpoint; so do 40 others. On the 41 that do not:

| set | n | min | median | p75 | p90 | max |
| --- | --- | --- | --- | --- | --- | --- |
| add-only subset | 41 | 1.98 | 6.55 | 7.16 | 7.86 | 11.36 |
| of those, reviewed strong | 22 | 3.02 | 6.55 | 7.16 | 7.47 | **7.86** |

The top of that subset, in order:

| artwork | bg → surface | excursion | verdict on this exact palette |
| --- | --- | --- | --- |
| `horsley` | `#c99242` → `#cc615b` | 11.36 | unreviewed |
| `01c16db8` | `#80bbf7` → `#b6debc` | 10.86 | unreviewed |
| **`00093ce4`** | `#16272e` → `#3d181f` | **9.19** | acceptable — **the midpoint request** (L448) |
| `187e2051` | `#dbdce1` → `#fbfbfb` | 7.90 | acceptable (L165, L306) |
| `b6fb42e0` | `#046a54` → `#0a2f7d` | 7.86 | **strong** (L140) |
| `0aad7f30` | `#9dcfcc` → `#ccddd7` | 7.82 | **strong** (L167) |
| … 35 more, continuously down to 1.98 | | | |

**Every reviewed-strong gradient without a third stop is at or below 7.86. The artwork the reviewer
asked for a midpoint on is at 9.19. Nothing sits between 7.90 and 9.19.** That empty band is the
criterion's separation, and it is where the bar goes.

---

## 2. The bar, and how weak it is

`RAMP_EXCURSION_BAR = 2.5 × policy.distinctness.sameColor = 8.25`, stated as a multiple of the
just-noticeable-difference unit the midpoint distinctness rule is already stated in, and placed in the
(7.90, 9.19) band the corpus leaves empty.

Sensitivity, over the add-only subset:

| bar | fires | of which a nominee clears | reviewed strong | reviewed acceptable | unreviewed |
| --- | --- | --- | --- | --- | --- |
| 5.00 | 31 | 16 | 9 | 3 | 4 |
| 6.00 | 27 | 22 | 13 | 4 | 5 |
| **6.60** (−20 %) | 19 | 17 | **10** | 3 | 4 |
| 7.00 | 12 | 11 | 7 | 3 | 1 |
| 7.50 | 6 | 5 | 2 | 2 | 1 |
| 7.90 | 4 | 3 | 0 | 2 | 1 |
| **8.25 (shipped)** | **3** | **2** | **0** | **1** | **1** |
| 9.00 | 3 | 3 | 0 | 1 | 2 |
| 9.20 | 2 | 2 | 0 | 0 | 2 |
| **9.90** (+20 %) | 2 | 2 | 0 | **0** | 2 |
| 11.00 | 1 | 1 | 0 | 0 | 1 |

**This bar is not robust and I am not going to pretend otherwise.** At −20 % it hands a new third stop
to ten gradients that are reviewed strong without one. At +20 % it stops firing on the only artwork
that motivated it. The band it sits in is 1.29 ΔE wide, and it has **exactly one positive anchor** —
one human judgement saying "this ramp needs a midpoint" — against 22 negative ones. That is a
cliff-shaped constant fitted to a single case, and it is the single strongest reason this ships
behind a flag rather than on.

What would fix it is more positives, not more tuning: the review batch in §6 is designed to produce
them.

### 2.1 A currency that was tried and refuted

The excursion is an absolute ΔE, so it grows with how far the ramp travels. The obvious repair is to
normalise: excursion as a *share* of the endpoint separation. Measured (`normalized.ts`), that is
strictly worse. The top of the normalised ranking is:

| artwork | span ΔE | excursion | share | verdict |
| --- | --- | --- | --- | --- |
| `3ee0724b` | 6.6 | 5.96 | 0.900 | **strong** |
| `5e5a5ff6` | 9.7 | 7.47 | 0.769 | **strong** |
| `187e2051` | 11.1 | 7.90 | 0.711 | acceptable |
| `orelsan` | 10.1 | 6.85 | 0.681 | **strong** |
| `228e62c4` | 11.0 | 7.42 | 0.672 | acceptable |

`00093ce4` ranks 23rd of 82 on that measure. Normalising rewards short ramps, and short ramps are
exactly the ones nobody complains about. Refuted.

---

## 3. Selecting the midpoint

`nominateRampMidpoint` scores only colours from `buildRampSupport`, and applies four gates:

1. **Real population** — implied by being in the support set at all.
2. **A different colour from both endpoints** — ΔE ≥ `policy.distinctness.sameColor` (3.3) to each,
   the same bar and the same constant the existing three-stop route uses, itself read off seven human
   midpoint judgements. Two near-blacks are one colour, and this is the rule that says so.
3. **It must move the render** — chord deviation ≥ one `familyBinStep`, reused from the existing
   route, where it is exactly the maximum difference between the three- and two-stop renders.
4. **It must solve the problem** — the resulting excursion must fall back under the bar.

Among survivors: lowest resulting excursion wins; nominees within one just-noticeable difference of
the best are held equal and the one covering more of the artwork wins; the hex settles the rest. Gate
4 is a gate rather than a post-hoc check on purpose — checking it afterwards lets a merely-populated
nominee inside the tie band displace one that works, and then fail, losing a real answer to a rule
about ties.

### 3.1 What it picks on the two targets

**`00093ce4`, endorsed endpoints `#0e4355` → `#6b141a`:**

| rank | nominee | population | excursion after |
| --- | --- | --- | --- |
| best excursion | `#0c1d24` | 5.9 % | 6.60 |
| | `#003547` | 0.3 % | 6.65 |
| **selected** | **`#14272e`** | **28.6 %** | **6.75** |
| | `#04151c` | 0.2 % | 7.07 |
| | `#29212c` | 2.1 % | 7.20 |

Selected `#14272e` — nearest dictionary names *Nero*, *Jaguar*, *Midnight Blue* — at 28.6 % of the
artwork, the largest populated colour it has. Published ramp would be
**`#0e4355` → `#14272e` → `#6b141a`**: teal, through the artwork's own near-black slate, into oxblood.
Excursion 9.28 → 6.75. **That is a dark midpoint, which is what Flo asked for**, and the three
best-scoring nominees are all dark, so the answer is not sensitive to the tie rule in kind, only in
which dark.

**`00093ce4`, the endpoints trunk publishes today (`#16272e` → `#3d181f`):** selected `#003e56`
(*Typhoon*), 2.9 % population, excursion 9.19 → 7.58. Also dark, also teal-side. This is the change
the flag actually makes on trunk right now.

**`0009d178`, on the ramp Flo asked for (`#25213b` Night Violet → `#ef74b5` Embarrassed):**

| rank | nominee | population | excursion after | nearest names |
| --- | --- | --- | --- | --- |
| 1 | `#cd3b68` | 0.5 % | 7.67 | Anarchist, Cherryade |
| 2 | `#f61a33` | 0.3 % | 7.77 | — |
| 3 | `#e70128` | 0.2 % | 7.90 | — |
| **selected** | **`#f84080`** | **1.2 %** | **8.02** | Atomic Pink, Confetti |
| 5 | `#ff528b` | 0.1 % | 8.15 | — |

Every one of the top five is a red or red-pink. Flo asked for *"embarrassed → carpaccio → night
violet"* and named Carpaccio `#e33665`, Cherry Cola `#bd384b`, Punch `#c82554` in earlier records; the
runner-up `#cd3b68` sits ΔE 12 from Carpaccio and the selected `#f84080` is the more saturated
neighbour of the same colour. **The selection rule finds the carpaccio red on its own**, from the
artwork's pixels, with no colour names anywhere in the runtime. This is the arm's strongest evidence
that the selection rule is right, and it is worth stating plainly that it is evidence about
*selection only* — the endpoints it was measured on are not endpoints trunk can produce.

---

## 4. Gradient neutrality

Structural, not statistical. `applyRampMidpoint` is called on the return value of
`applyGradientSupport`, i.e. after winner selection, transition promotion, and the supported-path flat
fallback have all finished. It reads `gradient.winner.gradient` and returns
`gradient.midpoint` unchanged when it is false. It never constructs, mutates, or reorders a treatment,
and it is the last thing that happens before `restrictTextRoleToStrongestClaim` (which only exchanges
the two mark roles and cannot reach the field). There is no code path by which it can make a flat
winner gradient or a gradient winner flat.

Measured confirmation: over the 201-artwork corpus, 82 gradients flag off and 82 gradients flag on,
the same 82.

---

## 5. Blast radius, flag on

| | |
| --- | --- |
| gradient artworks | 82 |
| publishing a third stop today | 41 |
| **in scope** (gradient, no third stop) | **41** |
| criterion fires | 3 |
| — fires but no nominee clears the bar | 1 (`horsley`) |
| — **gains a third stop** | **2** |
| existing third stops changed | **0** (structural — this route never replaces) |
| `gradient` boolean changes | **0** |
| flat artworks affected | 0 |

Every mover, and there are only two:

| artwork | bg → surface | excursion before → after | midpoint gained | population | verdict on this exact palette |
| --- | --- | --- | --- | --- | --- |
| `01c16db8` | `#80bbf7` → `#b6debc` | 10.86 → 7.24 | `#8cb9fa` (*Pastel Blue*) | 18.4 % | **unreviewed** |
| `00093ce4` | `#16272e` → `#3d181f` | 9.19 → 7.58 | `#003e56` (*Typhoon*) | 2.9 % | acceptable (L448) — **the artwork that asked for this** |

`horsley` (`#c99242` → `#cc615b`, excursion 11.36, unreviewed) fires and finds nothing: its best of 55
gate-passing candidates only reaches 8.90, above the bar. The mechanism declines rather than
publishing a third stop that does not fix the problem.

### 5.1 Warehouse check

Only one mover's exact published palette carries any verdict at all:

- `00093ce4` → `#003e56` · **L448** `cs2-batch` · **acceptable**, gradient true, no midpoint —
  *"The 'One palette you'd endorse' palette i'm proposing here would only work if we added a dark
  midpoint. But doing so would make this palette extremely good, so we should investigate."*

That is the request, not an endorsement of the no-midpoint form. **Zero reviewed-strong palettes
change.** Zero reviewed-acceptable palettes change other than the one that asked to.

The reason that number is zero and not larger is the add-only restriction, and the case that forced it
is worth recording: applied to artworks that already carry a third stop, the mechanism would have
replaced `birdsofprey`'s `#1880a7` with `#09d3c7` (excursion 18.63 → 8.37) — a five-times-strong
palette whose midpoint had already been A/B'd. That measurement is why "this route never replaces" is
a structural rule and not a preference.

---

## 6. Proposed review batch — 4 items, not served

The bar has one positive anchor. These four items are chosen to add anchors on both sides rather than
to confirm anything.

| label | artwork | A | B | question |
| --- | --- | --- | --- | --- |
| `rmi-1` | `00093ce4` | trunk (`#16272e` → `#3d181f`, no stop) | flag on (`… → #003e56 → …`) | does the mechanism help on the endpoints trunk actually publishes? |
| `rmi-2` | `00093ce4` | endorsed pair, two stops | endorsed pair, `#14272e` third stop | the arm's headline: is this the dark midpoint that makes the endorsed palette "extremely good"? |
| `rmi-3` | `01c16db8` | trunk | flag on (`#8cb9fa`) | the only unreviewed mover — is a gained third stop welcome where nobody asked? |
| `rmi-4` | `b6fb42e0` | trunk (`#046a54` → `#0a2f7d`, no stop, excursion 7.86, **strong** L140) | the same pair with `#00694d` — what a bar of 7.5 would give it | the negative anchor. If the reviewer prefers B, the bar is too high and the empty band is an artefact. |

`rmi-2` needs endpoints trunk cannot produce, so it must be rendered from a fixture rather than an
extraction; the manifest has to say so. `rmi-4` is the item that can refute this arm, and it is the
one I would keep if only one slot were available.

---

## 7. Verification

| check | result |
| --- | --- |
| trunk base | `b82c520`; worktree reset from a stale `bb979dc` |
| typecheck `research/v2-3/tsconfig.json` | pass |
| typecheck `research/v2-3-experiments/ramp-midpoint-insertion/tsconfig.json` | pass |
| `research/v2-3/test/architecture.test.ts` | 2/2 pass (no artwork identity, no fixture colour, imports closed) |
| `research/v2-3/test/configuration.test.ts` | 12/12 pass |
| **byte identity, flag off** | **GATE PASS: 108/108 byte-identical** |
| gradient neutrality, measured | 0 gradient booleans changed over 201 artworks; 82 flag off, 82 flag on |
| role colours changed, flag on | **0** of 201 |
| determinism | `measure.ts` run twice on `00093ce4` → byte-identical output |
| machine budget | sweeps ran 4 workers with `VIPS_CONCURRENCY=1`, one checkpoint file per artwork, resumable; interactive probes never exceeded 2 concurrent |

### 7.1 The byte-identity gate

Run with `research/v2-3-experiments/perf-pass-2/harness/gate.mjs` over its own 108-entry corpus
(34 on-panel originals + 34 scrambled decoys + 37 off-panel artworks), comparing the canonicalised
**complete** `extractPaletteDetails` return value — every score, not the four hexes.

The baseline was produced from the committed pre-arm state, not from memory: the three runtime files
this arm touches were reverted with `git checkout b82c520 --` (and `ramp-midpoint.ts` deleted), the
dump taken, and the arm restored with `git checkout HEAD --`. So the baseline is genuinely trunk's
output and the comparison is genuinely against it.

```
imagesRoot=/Users/Flo/github/palette/images
corpus=108
compared 108 extractions against .../gate-baseline
GATE PASS: 108/108 byte-identical
```

### 7.2 The flag-on comparison

`RAMP_MIDPOINT_INSERTION` was flipped to `true` in the source, the full 201-artwork sweep re-run into
`data/flag-on/`, and the flag flipped back. `neutrality.ts` compares the two sweeps:

```
compared 201 artworks (ranked vs flag-on)
gradient booleans changed: 0
gradients flag off: 82 · flag on: 82
role colours changed:      0
midpoints changed:         2
  00093ce4…: none -> #003e56 (ramp-support), #16272e -> #3d181f, excursion 9.19
  00100a3e…01c16db8: none -> #8cb9fa (ramp-support), #80bbf7 -> #b6debc, excursion 10.86
midpoints flag off: 41 · flag on: 43
```

Two changes in the whole corpus, both additive third stops, and one of them is the artwork that asked
for it.

---

## 8. Honest self-assessment

- **High confidence** that the criterion measures the thing Flo described. The worst sample on the
  endorsed `00093ce4` pair is `#4b343a`, a grey-mauve, found without being told what to look for, and
  the worst sample on the `0009d178` ramp Flo asked for is `#ae5b8e`, the washed mauve-pink that ramp
  would invent. Both are the complaint.
- **High confidence** in the selection rule. It returns a dark midpoint for `00093ce4` and a carpaccio
  red for `0009d178` — both what was asked for, neither told to it, from artwork pixels only.
- **Low confidence in the bar.** One positive anchor, a 1.29 ΔE band, and a −20 % move that breaks ten
  reviewed-strong outcomes. This is the arm's weak joint and no amount of writing changes that.
- **The add-only restriction is a measured retreat, not a design.** The criterion is refuted on
  artworks that already have a third stop, and I restricted the mechanism to where it survives rather
  than repairing it. Whether a criterion exists that covers both halves is open; nothing here
  suggests one.
- **`0009d178` is not delivered.** The arm was pointed at two targets and reaches one. The second
  needs its gradient and its endpoints first, and those belong to other arms. What this arm can say is
  that once they exist, the midpoint is reachable and is the red Flo named.
- **Not measured:** whether the 0.001 population floor is the right one. It was set from a
  scale-invariance argument, not swept. A lower floor would make the artwork look richer and shrink
  every excursion, which would move the bar; the two constants are coupled and I measured only one
  point in that plane.
- **Not measured:** the mechanism's cost when on. `buildRampSupport` is one extra full-resolution pass
  plus a hash per pixel, run once per extraction on gradient winners only. Nobody has profiled it,
  because it is off.

---

## Files

- `ramp-midpoint.ts` (in `research/v2-3/src/internal/`) — the mechanism.
- `criterion.ts` — re-exports it, so the harness never measures a second implementation.
- `corpus.ts` — the 201-artwork measurement corpus, vetoed artworks excluded, decoys excluded.
- `measure.ts` — one artwork's measurement: published extraction, support set, excursion of what
  renders today, and the full gate-passing candidate ranking with the bar deliberately not applied.
- `sweep.ts` — resumable 4-worker driver, one checkpoint file per artwork.
- `analyze.ts` — corpus aggregation: the excursion table, the separation study, the bar sweep, the
  blast radius, and the warehouse check.
- `normalized.ts` — the refuted scale-free variant of the criterion.
- `neutrality.ts` — flag-off sweep against flag-on sweep: every role colour, gradient boolean and
  midpoint that differs.
- `probe.ts` — single-artwork instrumentation with `--bg` / `--surface` overrides, which is how the
  two hypothetical endpoint pairs in §1.2 and §3.1 were measured.
- `data/ranked/` — one measurement per artwork, flag off, 201 files.
- `data/flag-on/` — the same sweep with `RAMP_MIDPOINT_INSERTION` genuinely flipped, 201 files.
- `data/probes/` — the two target hypotheticals.
- `data/ANALYSIS.md`, `data/NORMALIZED.md`, `data/NEUTRALITY.txt` — the three scripts' output as run,
  so every table above can be checked without re-running a sweep.
