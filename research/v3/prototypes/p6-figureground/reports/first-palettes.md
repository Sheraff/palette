# P6 first palettes — the directive-8 fix, the foreground diagnosis, and demo-20

W7, 2026-08-04. Measured in `.worktrees/p6-figureground`, code as of this worker's changes, rates
untouched. Every number below is produced by `tools/first-palettes.ts` (`--probe` for the survivor
tables and the counterfactuals, `--run` for the set) or by the test suites named at the point of use.

**The standing rule, restated because this report is exactly the document it exists for**
(`REVIEWER_EVIDENCE.md` header): nothing here moved an exchange rate, and nothing here may be used to
move one. Two of the three findings below are *mechanism* findings — the terms are implemented as the
proposal states them and still prefer the wrong colour. The repair for those is a decision about the
mechanism, taken by the orchestrator and the reviewer, not a weight.

---

## 1. Directive 8 — `spatialSpread` was normalised twice; fixed on the consumer side

**What was wrong.** `lattice/index.ts:105` divides the raw trace of the normalised second spatial
moment by `UNIFORM_FRAME_SPATIAL_SPREAD` (= 1/12 + 1/12 = 1/6), so `CandidateStats.spatialSpread` is
already a ratio: 1.0 is a uniform frame-wide fill and a centred square of side *s* reads *s²*.
`terms.ts:181` then divided by `ENERGY_ANCHORS.uniformSpatialSpread`, which read `1/6`, a second
time. The field-fitness spread factor therefore saturated at **one sixth of a uniform fill** — a
centred square of side 0.408, **16.7% of the frame's area** — collapsing the upper five sixths of the
scale onto one value. Background and surface were scored on two discriminating factors, not three.

**The fix.** `ENERGY_ANCHORS.uniformSpatialSpread` is **redefined from `1/6` to `1.0`** and re-tagged
`[INHERITED — the statistic's own definition, ../lattice/index.ts:36]`: it is the value the
*statistic* takes at a uniform fill, which is what its name always meant, and it is now written
exactly like `borderNeutralAffinity`, the other saturating factor, whose anchor was never wrong. The
expression at `terms.ts:181` is unchanged — `ratio(stats.spatialSpread, anchor)` is now a clamp with
its neutral value named, which keeps SPEC rule 4 (no bare literal in a term file) true. The producer
side is untouched: `lattice/index.ts:105` and `types.ts`'s documented convention both say the
normalised form, so deleting the *first* division was the wrong repair.

The anchor is **not** a rate and did not become one: it trades no term against any other, and a
reader can check `1.0` against `lattice/index.ts:105` without exercising taste.

**Measured effect on the term.** Restored discrimination is exactly the size of the old defect: the
spread factor of a uniform fill is now **6×** that of a sixth-of-a-fill, where the two were equal.
Real covers now show a live spread column — e.g. on `00007e97…`, top field-fitness candidates carry
`spread` 0.62–0.80 and score 0.085–0.087 instead of saturating.

**Tests.** `tests/semantics.test.ts`'s three pins are flipped from WHAT-IS to WHAT-SHOULD-BE, with
the pre-fix values kept as comments so the flip is legible in the diff; the two test names changed
from `CONSUMER: terms.ts divides by 1/6 a second time` and `MISMATCH, measured: …` to their fixed
statements. Two fixtures in `tests/energy.test.ts` moved and say why: the field-fitness re-derivation
(`spatialSpread: 1/12` → `0.5`, same by-hand product of 0.2) and the collapse fixtures'
"this triple is the field" (`0.2` → `1`, which is what "as spread as a uniform fill" now costs). The
16 semantic assertions and the brute-force-equality test are untouched. **77/77 tests pass** across
all five prototype suites (`substrate`, `lattice`, `fieldmodel`, `energy`, `semantics`).

---

## 2. The fg-near-bg failure persists after the fix, and it is not the spread term

Directive 8's fix touches `fieldFitness` only — the factor background and surface are scored on. The
foreground and accent are scored on `foregroundFitness` / `accentFitness`, which the fix does not
enter, so it could not have repaired check 1 and did not. Re-run of the three probe covers, post-fix:

| cover | bg | surface | fg | accent | fg \|APCA\| vs bg | field | verdict |
|---|---|---|---|---|---|---|---|
| `00007e97…` | `#e9e6df` | `#ece0e0` | `#ebece7` | `#f23704` | **4.08** | flat | fg is the background, ±3 LSB |
| `…000000d8…` | `#000000` | `#000000` (collapsed) | `#fcfcfc` | `#0b0b0b` | 108.59 | flat | readable, but by barrier not by fitness (see §2.2) |
| `…00000133…` | `#e0e0e0` | `#dcdadb` | `#fefefe` | `#010000` | **20.21** | flat | fg is near-white on a light-grey field |

The text floor is **2.500** raw APCA (a near-zero parameter by design), so all three clear the
barrier. Nothing above is a barrier failure; all of it is the objective preferring unreadable ink.

### 2.1 First responsible term: `groundCoincidence` is annihilated on 2 of 3 covers

`groundCoincidence(stats, field) = exp(−½ · (d / POOLED_SAME_COLOR_BAR)²)` where `d` is the OKLab
distance from the candidate's `habitualGround` to the field path. It multiplies **both**
`foregroundFitness` and `accentFitness`. Measured over every distinct triple:

| cover | max coincidence over all triples | triples > 1e-3 | min *d* | median *d* | bar | min *d* in bars |
|---|---|---|---|---|---|---|
| `00007e97…` (24 615 triples) | **8.55e-24** | **0 / 24 615** | 0.1582 | 0.1655 | 0.01627 | **9.7** |
| `…000000d8…` (256 triples) | **1.07e-41** | **0 / 256** | 0.2108 | 0.2222 | 0.00932 | **22.6** |
| `…00000133…` (604 triples) | 1.00 | 604 / 604 | 0.0000 | 0.0074 | 0.01627 | 0.0 |

**Why.** `substrate/figure-ground.ts:173` sets `ground` to `ladder.levels[0]` — the **coarsest** rung,
σ ≈ short-edge/2, which on a 300² cover is a near-global average. `habitualGround` is therefore a
near-global mixture, not "the colour this ink sits on". On `00007e97…` even the **background's own**
habitual ground is `L=0.7756, a=0.0664, b=0.0345` against its own colour `L=0.9253, a=0.0004,
b=0.0099` — 0.1655 away, 10 bars. `terms.ts` then reads that mixture through a kernel one
**same-colour bar** wide, which is the contract's statement about when two *exact published colours*
are the same colour. A σ = short-edge/2 blur and a same-colour-bar kernel are not commensurable
quantities: the factor is 1.0 when the artwork happens to be near-uniform and ~1e-24 otherwise. It
never behaves as "how much of this ink's ground is the field".

**Consequence, and it is worse than a rescale.** Where coincidence is ~0, `foregroundFitness` and
`accentFitness` are ~0 **for every candidate**, so `roleMisfit = 1` identically and the role-fitness
term contributes *no ordering at all*. Foreground and accent are then chosen by `belonging` (+
representativeness) alone — and `belonging = 0.2 · ln(1.91e-2 / M)` is monotone *decreasing* in mass,
so it hands the role to the artwork's most massive colour, which on a light cover **is the
background**. That is the failure verbatim: on `00007e97…` the top 20 foreground candidates are all
within a few LSB of `#e9e6df`, all with `fitness 0.0000`, `roleMisfit 1.0000`, and the ranking driven
entirely by `belonging` −0.6515 … −0.6428.

**Class.** This is the same failure class as directives 5 and 8 — a producer/consumer scale mismatch
across a module seam — but on `habitualGround` rather than `spatialSpread`, and it spans two modules
this worker does not own (`substrate/figure-ground.ts` chooses the rung, `terms.ts` chooses the
kernel). It is **not** a mismatch between `terms.ts` and the proposal's stated form: §2.2 says
"mass-weighted mean surround" without naming a rung, and §2.4 says "coincides" without naming a
kernel. So it is reported, not fixed — widening the kernel would be inventing a free parameter, which
this worker is prohibited from doing and which would be the relapse the README pre-registers.

### 2.2 Second responsible term, independent of the first: `inkEnergy` is an area integral

`foregroundFitness = ratio(inkEnergy, maxInkEnergy) × groundCoincidence`. `inkEnergy` is the
**unnormalised** area integral (`tests/semantics.test.ts` confirms the W2→W4 seam; SPEC directive 5
names exactly this suspect), so it scales with a colour's area. The largest-area colour of a cover
therefore tends to carry the **maximum** ink energy in the artwork and score `ratio = 1.0` — the field
itself wins the "ink" score.

Measured on `00007e97…`: `maxInkEnergy = 3.84277e-2`, and the background `#e9e6df` **is** the triple
that attains it (`inkE 3.84e-2`, `M 0.496`, `ink/mass 0.0774`). On `…00000133…`, where coincidence is
healthy and cannot be blamed, the whole top-20 foreground list has `ink/mass` between **0.0566 and
0.0580** — indistinguishable per unit mass — while `M` runs 0.288 → 0.402. The ordering of the
foreground role there is, arithmetically, a ranking by area.

**Counterfactuals** (each replaces one factor of the same term by its stated alternative and
re-ranks; measurement only, and none of them is a proposal to change the energy):

| cover | as implemented | coincidence forced to 1 | ink **per unit mass** | both |
|---|---|---|---|---|
| `00007e97…` | `#e9e6df` \|APCA\| 1 — readable at **rank 2150** (+0.364) | `#e9e6df` — rank 2099 (+1.131) | `#e9e6df` — rank 2150 (+0.364) | `#e9e6df` — readable at **rank 535 (+0.091)** |
| `…000000d8…` | `#000000` \|APCA\| 1 — readable at rank 13 (+1.126) | `#000000` — rank 13 (+2.110) | `#000000` — rank 13 (+1.126) | `#000000`, then **`#fcfcfc` \|APCA\| 109 at rank 2** (+0.356) |
| `…00000133…` | `#fefefe` \|APCA\| 20 — readable at rank 39 (+0.966) | `#fefefe` — rank 38 (+0.929) | **`#010000` \|APCA\| 91 at rank 1** | **`#010000` \|APCA\| 91 at rank 1** |

Read across: **fixing the coincidence alone repairs nothing** (rank 2150 → 2099); **switching
`inkEnergy` to a per-mass mean is what moves readable ink to the top of the list**, decisively on
`…00000133…` (rank 39 → rank 1, |APCA| 20 → 91) and to rank 2 on `…000000d8…`.

**Class.** Also a mechanism finding, not an implementation defect. Proposal §2.2 defines E_L as an
"M-weighted integral" and §2.4 gives the foreground "ink energy E_L" with **no** per-unit-area factor
— while giving the *accent* "mark energy E_C times saliency-per-unit-area", i.e. both the integral and
the density. `terms.ts` implements exactly that asymmetry. The finding is that the asymmetry is the
bug: an area integral answers "how much of this colour's ink is there", which the field always wins,
where the role needs "how ink-like is this colour", which is the density. Correcting it is a change
to the proposal's stated form and belongs to the orchestrator, not to this worker.

### 2.3 What is left deciding the foreground: `belonging`, a rate

On `00007e97…`, even with **both** counterfactual repairs applied the background family still leads
(`#e9e6df` u 0.0102) and the cheapest readable candidate is +0.091 behind. The residual is
`belonging`: at M = 0.496 it pays **−0.6515**, which is 65% of the *entire* role-misfit range (role
misfit spans exactly 1 by construction). A mass reward that large is comparable to the whole of the
role evidence it is traded against. The rate is `0.2` `[UNCALIBRATED]` and **this report does not
touch it** — `tools/sensitivity.ts` is the only process allowed to move it, and it moves it to measure
it. Recorded here as the third contributor so the orchestrator can see all three at once.

### 2.4 CHECK 6, and why it lands here: role ordering is degenerate where coincidence dies

Swapping the foreground and the accent leaves the published *set* unchanged, so the field, coverage,
collapse charges and both field-role unaries cancel: the whole energy gap is the difference of the two
roles' unary costs.

| cover | as-is | swapped | **gap** | total energy | gap / total |
|---|---|---|---|---|---|
| `00007e97…` | 1.186912 | 1.186912 | **0.000e+0** | 4.018628 | 0 |
| `…000000d8…` | 2.684148 | 2.684148 | **0.000e+0** | 4.653488 | 0 |
| `…00000133…` | −0.221831 | 0.701942 | 9.238e−1 | 1.532681 | 0.603 |

The two zeros are not near-ties, they are **identities**: where `groundCoincidence ≈ 0`, both role
fitnesses are ~0, so both roles' unary cost is the *same expression* — `belonging + 1 +
representativeness`. The energy is then exactly indifferent between "this is the text and that is the
accent" and the reverse, and the assignment is decided entirely by which colour the barriers happen to
admit in which role. On covers of that shape, P6's central claim — that role assignment is read out of
one energy rather than labelled — is vacuous. Where the coincidence works (`…00000133…`) the gap is a
healthy 0.92, 60% of the cover's total energy. Full demo-20 census in §3.

### 2.5 CHECK 5's implementation question, answered: the accent–surface barrier is present

Verified by reading, not assumed. `barriers.ts:339–380` builds `flatPairs` containing **both**
accent→background and accent→surface and applies `accentFloor` to each; `barriers.ts:387–399` adds the
whole-ramp test. The factorised search path matches: `solve.ts:589–602` applies
`accentContrastFromFact` against a *pinned* surface, and `solve.ts:999–1011` applies
`accentContrastIndexed` against a *free* surface inside the search — the flat-hypothesis-with-distinct-
surface case the addendum asked about. Proposal §2.4 term 5's conjunction (background **and** surface
**and** ramp) is fully implemented, and the 600/600 exhaustive-equivalence test in
`tests/energy.test.ts` is what keeps the factorised path honest about it. **No defect; nothing changed.**

---

## 3. demo-20

### 3.0 A deviation, stated first: two covers never finished

The mandated command
(`src/devloop/run.ts --candidate prototypes/p6-figureground/src/candidate.ts --set data/devloop/sets/demo-20.txt`)
**does not complete on demo-20.** Run with 14 workers it emitted 5 rows and then sat at ~400% CPU for
over half an hour with four covers still in flight; it was killed. A sequential re-measurement, one
process per cover with a **180 s wall cap**, found the reason: **2 of 20 covers exceed the cap** —

- index 5 `…0000bbc3367a621256ce593.jpg` — killed at 180 s
- index 13 `…00001a9be12b7116a8247378.jpg` — killed at 180 s

and a third, index 16, needed **134 s**. So the numbers below are over **18 of 20** covers, run as
`--set <the 18> --workers 1 --no-cache` so the timings are contention-free and comparable
(`data/devloop/runs/p6-figureground-0.1.0-demo-20-terminating-20260804T214048757Z.jsonl`; the set file
is a scratch file, not a committed set). The two excluded covers are excluded because the exact search
does not terminate on them in three minutes, not because anything about them was inconvenient.

### 3.1 Timing — the splat is not the problem, the search is

**End-to-end (`computeMs`, 18 covers, 1 worker, cold): min 91 ms, median 2 786 ms, p95 93 323 ms,
max 146 775 ms.** Wall for the 18: 299 s. Every cover is 300×300.

Stage breakdown from the per-cover probe (same code, same machine):

| stage | min | max | note |
|---|---|---|---|
| substrate (decode + ladder + figure–ground) | 40 ms | 56 ms | flat |
| **lattice (enumerate + splat + convolve)** | **65 ms** | **156 ms** | flat |
| field model | 5 ms | 39 ms | flat |
| **solve** | **5 ms** | **133 446 ms** | four orders of magnitude |

**Directive 6's splat tail is not what showed up.** Directive 6 priced heavily dithered covers at
~660 ms of splat; measured here the lattice stage is 65–156 ms on every cover including the 32 720-triple
one, i.e. well inside its budget and *not* the tail. The entire distribution is the solver.

And the solver's cost is **not** the tuple count:

| demo # | triples | tuples evaluated | solve |
|---|---|---|---|
| 3 | 32 720 | **10** | **23 828 ms** |
| 8 | 25 344 | **2** | 6 405 ms |
| 0 | 24 615 | 4 136 | 2 788 ms |
| 16 | 14 338 | 2 630 | **133 446 ms** |
| 17 | 23 057 | **541 729** | 74 751 ms |

Ten tuples and 24 seconds says the cost is in the **per-candidate, per-hypothesis setup** — the barrier
lists and `coverageGains` over every triple, three hypotheses deep — not in the branch-and-bound
descent; cover 17 shows the descent can blow up too. Both live in `solve.ts`/`coverage.ts`, outside
this worker's paths, so this is a measurement handed over, not a diagnosis. Against SPEC's performance
envelope (1000×1000 priced at 0.4 s, **>2 s a defect to report**), **11 of 18 covers exceed 2 s at
300×300**, which is a ninth of the priced pixel count.

**The directive-8 fix is not the cause**, checked rather than assumed. A/B on demo #3, same process,
anchor mutated at runtime so both arms run identical code: `uniformSpatialSpread = 1.0` → **23 774 ms**,
`= 1/6` (the pre-fix value) → **25 622 ms**, both 10 tuples, both the same palette. The tail predates
the fix and is very slightly *worse* without it.

### 3.2 The palettes (18 covers)

| # | bg | surface | fg | accent | field | collapse | escape | fg min-\|APCA\| | margin |
|---|---|---|---|---|---|---|---|---|---|
| 0 | `#e9e6df` | `#ece0e0` | `#ebece7` | `#f23704` | flat | — | — | 4.08 | 1.58 |
| 1 | `#000000` | `#000000` | `#fcfcfc` | `#0b0b0b` | flat | surface | — | 108.59 | 106.09 |
| 2 | `#e0e0e0` | `#dcdadb` | `#fefefe` | `#010000` | flat | — | — | 20.21 | 17.71 |
| 3 | `#cecece` | `#c9c9c7` | `#d6d2d3` | `#f9f9f9` | flat | — | — | 4.24 | 1.74 |
| 4 | `#ededed` | `#f1f2f6` | `#f8f8f8` | `#111111` | flat | — | — | 4.26 | 1.76 |
| 5 | `#4b544f` | `#4c514b` | `#444d48` | `#5b615d` | flat | — | — | **2.51** | **0.01** |
| 6 | `#e9e5e4` | `#eeeced` | `#f2f2f2` | `#f2f2f2` | flat | accent | — | 4.10 | 1.60 |
| 7 | `#fbe2de` | `#fddbd9` | `#ffe8e3` | `#ffe8e3` | flat | accent | — | 4.17 | 1.67 |
| 8 | `#908f9f` | `#788490` | `#b0a3ac` | `#717f88` | flat | — | — | 13.50 | 11.00 |
| 9 | `#faf9e4` | `#f3f4e2` | `#fffdee` | `#3a180c` | flat | — | — | 3.26 | 0.76 |
| 10 | `#171c20` | `#151a1d` | `#22272a` | `#cfe2e9` | flat | — | — | **2.55** | **0.05** |
| 11 | `#ffffff` | `#fdfff3` | `#f8faf9` | `#70ba25` | flat | — | — | **2.59** | **0.09** |
| 12 | `#2f2f2f` | `#242424` | `#070707` | `#171717` | flat | — | — | 3.89 | 1.39 |
| 13 | `#38261a` | `#3b271e` | `#1d0a04` | `#311a14` | flat | — | — | 4.74 | 2.24 |
| 14 | `#a36268` | `#965e67` | `#211f20` | `#8e5b64` | flat | — | — | 28.87 | 26.37 |
| 15 | `#272c3f` | `#282e3c` | `#333743` | `#202334` | flat | — | — | 3.59 | 1.09 |
| 16 | `#363636` | `#313536` | `#000000` | `#000000` | flat | accent | — | 8.28 | 5.78 |
| 17 | `#fdd000` | `#f7d909` | `#fd0100` | `#fafafa` | flat | — | — | 42.69 | 40.19 |

(Rows are the 18-cover run's own indices. Collapses: 1 surface, 3 accent. **Zero escapes fired.**)

**Contract scorecard: `valid` on 18/18, zero violations.** Every palette above is contract-legal. Every
finding in this report is about the objective, not the contract.

### 3.3 The four committed checks, plus the addendum's two

**CHECK 1 — foreground readability: FAILS, and it is the floor-clustering failure the row predicted.**
Foreground min-\|APCA\| over everything it is rendered on, margin above the 2.500 floor:
**min 0.01, p25 1.17, median 1.70, p75 9.70, max 106.09**. **12 of 18 covers sit within 5 raw APCA of
the floor**, three of them within 0.1 (covers 5, 10, 11). The distribution is not "above the floor with
room" — it is piled *on* the floor. Per `REVIEWER_EVIDENCE.md` row 1 this is reported as a finding:
above the barrier, foreground fitness is supposed to *be* lightness displacement and therefore to
prefer readable ink; §2 measures why it does not — the ink term is an area integral that the field
wins, and on 10 of these 18 covers it is multiplied by a ground-coincidence factor of ~0 and vanishes
altogether.

**CHECK 2 — sibling twins: PASSES. 0 published sub-bar pairs across 18 covers** (all 6 role pairs per
cover tested against `sameColorBar`, declared collapses exempted). Structural, as designed, and now
also measured.

**CHECK 3 — small dark saturated accents lose: FAILS, badly.** Per cover, the artwork's most chromatic
*significant* mark (neighbourhood mass M ≥ 1e-3) against the published accent's chroma:

| demo # | most chromatic significant mark | its C | its M | published accent | accent C | ratio |
|---|---|---|---|---|---|---|
| 19 | `#ff0004` | 0.2575 | **0.116** | `#fafafa` | **0.0000** | **0** |
| 3 | `#ff00b9` | 0.2826 | 3.1e-3 | `#f9f9f9` | **0.0000** | **0** |
| 7 | `#f2424d` | 0.2115 | 2.6e-3 | `#f2f2f2` | **0.0000** | **0** |
| 18 | `#d64ba8` | 0.1991 | 3.4e-3 | `#000000` | **0.0000** | **0** |
| 17 | `#b91827` | 0.1916 | 1.1e-3 | `#202334` | 0.0322 | 0.17 |
| 16 | `#ff6556` | 0.1906 | 6.9e-3 | `#8e5b64` | 0.0680 | 0.36 |
| 6 | `#598e5a` | 0.0962 | 1.0e-3 | `#5b615d` | 0.0098 | 0.10 |
| 11 | `#58bfce` | 0.0972 | 1.2e-3 | `#cfe2e9` | 0.0225 | 0.23 |
| 8 | `#f8cc8d` | 0.0942 | 1.0e-3 | `#ffe8e3` | 0.0262 | 0.28 |
| 15 | `#81402a` | 0.0960 | 1.0e-3 | `#311a14` | 0.0387 | 0.40 |
| 9 | `#99829f` | 0.0502 | 9.8e-3 | `#717f88` | 0.0215 | 0.43 |
| 4 | `#a9a484` | 0.0448 | 1.0e-3 | `#111111` | 0.0000 | 0 |
| 10 | `#713207` | 0.1022 | 1.1e-3 | `#3a180c` | 0.0579 | 0.57 |
| 2 | `#060002` | 0.0329 | 9.8e-3 | `#010000` | 0.0173 | 0.53 |
| 12 | `#ff0004` | 0.2575 | 9.4e-3 | `#70ba25` | 0.1885 | 0.73 |
| 0 | `#ff000d` | 0.2572 | 2.0e-2 | `#f23704` | 0.2270 | 0.88 |
| 1, 14 | greyscale artwork | 0 | — | — | 0 | n/a |

**12 of the 16 chromatic covers publish an accent with less than half the chroma of the artwork's most
saturated significant mark, and 4 publish a completely achromatic accent** (C = 0.0000) against a mark
at C ≥ 0.19. The worst is demo #19: the artwork carries pure red `#ff0004` at **11.6% neighbourhood
mass** — not a small dark mark at all, the loud thing in the picture — and the published accent is
`#fafafa`. The proposal's §7 fragile case ("small dark saturated marks lose to brighter blander
candidates") is not just present, it is the *typical* outcome, and it is present in a stronger form
than §7 anticipated: the losing mark need not be small. Same root cause as §2 — `accentFitness` is
`ratio(accentEnergy, max) × ratio(accentDensity, max) × groundCoincidence`, `accentEnergy` is an area
integral, and the coincidence factor is dead on 10 of 18 covers.

**CHECK 4 — gradient-first rate: PASSES on the letter, and is not evidence yet.** **0 of 18 covers
published a gradient** — every field hypothesis that won was flat. Nothing to enumerate as a false
positive, which is what row 4 asked. But zero is also not a demonstration that the model *selects*
correctly: the neutrality census and a set with real ramps in it are still owed, and the repaired rate
0.33 has not been shown to accept anything on real artwork. The field model did *propose* a gradient
hypothesis on 16 of 18 covers (`hypotheses 3 (flat,flat,gradient)`); the energy chose flat every time.

**CHECK 5 (addendum) — accent against both fields.** Accent floor 2.500 raw APCA.

- vs **background**: min **−1.70**, p25 2.95, median 7.03, p75 49.73, max 98.54; **< 5 on 7/18**.
- vs **surface**: min **−1.70**, p25 0.56, median 5.60, p75 48.01, max 97.87; **< 5 on 8/18**.

Same floor-clustering shape as check 1, slightly less severe. The negative minimum is demo #1
(`#0b0b0b` on `#000000`, \|APCA\| 0.80): legal, because the accent's functional-distance escape applies
when the accent floor is at ε, and the scorecard agrees — but it is a black accent on a black
background and a reviewer will call it invisible. Covers 12, 13, 14, 15 all sit under 0.5 raw APCA of
margin against the surface.

**CHECK 5's implementation question: no defect.** See §2.5 — `barriers.ts` and both solver paths apply
the accent floor against background **and** surface **and** the ramp, including the
flat-hypothesis-with-free-surface case. Nothing changed.

**CHECK 6 (addendum) — role-ordering fragility: the core claim is vacuous on 11 of 15 covers.** Raw
(foreground, accent) swap gaps, everything else fixed (3 covers have a collapsed accent and no swap):

| demo # | swap gap | | demo # | swap gap |
|---|---|---|---|---|
| 2 | 9.238e−1 | | 16 | 3.195e−3 |
| 15 | 5.085e−1 | | 3 | 8.214e−7 |
| 4 | 3.634e−1 | | 6 | 1.236e−6 |
| 9 | 2.695e−1 | | 10 | 8.216e−6 |
| | | | 12 | 9.552e−10 |
| | | | 19 | 5.246e−9 |
| | | | 0, 1, 11, 14, 17 | **0.000e+0 (exact)** |

No threshold is chosen. The shape speaks without one: **4 covers have a gap of order 0.3–0.9** (10–60%
of the cover's total energy) and **11 have a gap of 3e−3 or less, five of them exactly zero.** The
zeros are identities, not near-ties — where `groundCoincidence ≈ 0` both role fitnesses are ~0 and both
roles' unary cost is literally the same expression, so the energy cannot tell text from accent and the
barriers decide alone (§2.4).

**The two censuses line up exactly.** Covers whose maximum `groundCoincidence` over all triples is
below 1e-3: **10 of 18** (demo 0, 1, 3, 6, 10, 11, 12, 14, 17, 19; maxima from 1.07e−41 to 8.68e−5).
Add the two partial cases (16 at 8.8e−3, 18 at 3.0e−3) and it is 12 of 18. The small-swap-gap set is
that set. Six covers have a healthy coincidence (max ≈ 0.83–1.00: demo 2, 4, 7, 8, 9, 15) and they are
the covers with real gaps. One term's scale mismatch is producing the role-ordering fragility, the
foreground failure and the accent failure at once.

---

## 4. What is owed, in the order it matters

1. **`habitualGround`'s scale (§2.1).** `substrate/figure-ground.ts:173` publishes the coarsest ladder
   rung (σ ≈ short-edge/2) as the ground; `terms.ts` reads it through a one-same-colour-bar Gaussian.
   The two are not commensurable and the factor is 0 or 1 rather than a measurement, on 12 of 18
   covers. The repair with a checkable anchor is the one directive 1 already applied to `fieldWeight`:
   compute the ground at a **fine/mid** rung, chosen by an anchor of the same kind ("a synthetic
   letterform's habitual ground equals the page colour; a field pixel's equals itself"). Cross-module,
   two owners, not this worker's to take.
2. **`inkEnergy`'s normalisation for the foreground role (§2.2).** The proposal gives the accent both
   an integral and a per-unit-area density and gives the foreground only the integral. Measured, that
   asymmetry hands the foreground role to the largest-area colour. Changing it changes the proposal's
   stated form and is the orchestrator's call; the counterfactual says it is the single change that
   moves readable ink to rank 1.
3. **The solver's cost (§3.1).** 11 of 18 covers over 2 s at 300×300, two covers over 180 s, and the
   cost is in the per-candidate setup rather than the tuple count. `solve.ts`/`coverage.ts`.
4. **`belonging` at 0.2 (§2.3).** Reported, not touched. A −0.65 reward at M = 0.5 against a role-misfit
   range of exactly 1 is the third contributor. `tools/sensitivity.ts` is the only thing that may move
   it.
5. **A set with real gradients on it** before check 4's zero means anything.
