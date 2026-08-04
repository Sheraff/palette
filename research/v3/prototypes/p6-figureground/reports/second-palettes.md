# P6 second palettes — the two interpretation corrections, measured against W7's baseline

W8, 2026-08-04. Same worktree, same 18-cover scratch set, same command as `first-palettes.md`, rates
untouched. Everything below is `tools/first-palettes.ts` (`--probe --brief` per cover, one process
each, and `--run` over the dev-loop run) or the five test suites named at the point of use.

**The standing rule, restated:** nothing here moved an exchange rate and nothing here may be used to
move one. Both changes are *interpretation corrections* — the same class as SPEC directives 1 and 8:
the implementation was faithful to the proposal's words and measurably defeated the proposal's
stated intent, so the reading changed, at the definition site, with the measurement beside it.

**Headline, stated before the tables so it cannot be missed.** The corrections do what they were
argued to do at the term level and only partly at the palette level. Check 1 improves
(floor-clustering 12/18 → 9/18, median margin 1.70 → 4.97, three covers from invisible to |APCA|
28–51). Check 3 gets **worse** (12/16 → 15/16 covers publishing an accent under half the artwork's
mark chroma). Check 5 gets **worse** (accent-vs-background < 5 raw APCA on 7/18 → 12/18). Check 6 is
**not** repaired: the exact zeros drop 5 → 3, but every gap that used to be healthy (0.27–0.92)
collapsed to 1e-3–4e-2, for a new structural reason this report isolates. The solver tail shrinks
25% overall — and **not on the covers the unflattening hypothesis predicted**. Details below;
§7 answers the four hypotheses one at a time.

---

## 1. What changed

### 1.1 Task 1 — `FigureGroundField.ground` is the coarsest **local** rung

`substrate/figure-ground.ts` published `ladder.levels[0]` (σ ≈ shortEdge/2). It now publishes
`levels[HABITUAL_GROUND_RUNG]` = rung 2, σ = shortEdge/8, per the amended `types.ts` doc: the
coarsest rung that survives W6's geometric criterion — a rung's kernel reaches ±2σ, so rung *k*
spans `4σ_k = shortEdge/2^(k−1)`, and rungs 0 and 1 span the whole frame or more. A surround must be
local to be a surround.

The constant is `src/substrate/constants.ts:HABITUAL_GROUND_RUNG`, tagged `[MEASURED]` with both
anchors written out: W7's dead-coincidence census, and a two-sided synthetic bracket on the
white-on-black lettering fixture (the *fine* end fails because the stroke's ground becomes the
stroke's own interior; the *coarse* end fails because the field stops sitting on itself inside the
one-same-colour-bar kernel the energy reads it through). The bracket leaves `{2, 3}`; the geometric
criterion picks 2 without adding a digit. Two new tests pin it, one re-deriving the cut from
`ladderSigmas` rather than quoting the digit.

`inkEnergy` and `markEnergy` still average over all six rungs — the coarse rungs are excluded from
`fieldWeight` and from nothing else.

### 1.2 Task 2 — role fitness consumes the energies **per unit mass**

`energy/terms.ts` gains `inkDensity(stats) = inkEnergy / presence` and reads it, not the integral,
in `foregroundFitness`. `accentFitness` drops its area-integral factor and keeps only
`accentDensity`. `FitnessScales` is now `{ maxInkDensity, maxAccentDensity }`.

The zero-mass guard is explicit and deterministic: `perMass` returns **0** when either the energy or
the presence is non-positive (0/0 must be a number, never a NaN entering a barrier), and otherwise
divides by `max(presence, ENERGY_ANCHORS.presenceFloor)` — the same anchor `belongingCost` floors
its logarithm with, so the two terms cannot disagree about what "no mass" means. Pinned by test.

**Why the accent keeps one factor rather than two.** Applying the correction to `accentEnergy` turns
it into `accentDensity`, normalised by the same maximum — the proposal's two factors become one
quantity. Writing it twice would square a number in [0,1]: harmless to the ordering *among* accents,
but a uniform depression of every accent fitness against every foreground and field fitness. That is
a change to what the roles are worth against each other, i.e. an exchange rate, which is prohibited.
One factor is the reading that moves no rate. **It has a measured cost — see §6.**

### 1.3 Tests

**80/80 pass** across all five suites (`substrate` 23, `lattice` 12, `fieldmodel` 20, `energy` 16,
`semantics` 9) — W7's 77 plus three new ones (two substrate anchors, one zero-mass guard). No
assertion was weakened. The 600/600 brute-force-equality test in `energy.test.ts` and its fixtures
are **untouched and still pass**: it compares branch-and-bound against exhaustive enumeration under
whatever terms are shipped, so a term change cannot move it. Three semantics pins flipped from
WHAT-IS to WHAT-SHOULD-BE with the pre-fix values kept as comments, and one substrate test renamed
from "the ground planes are the coarsest rung" to "…the coarsest LOCAL rung".

---

## 2. Task 1's own measurement: `groundCoincidence`, dead → partly alive

Maximum `groundCoincidence` over **every** distinct triple of the cover, under the field the solver
chose. Below 1e-3 the factor annihilates both role fitnesses and the roles are decided by
`belonging` alone (W7 §2.1).

| demo # | set # | triples | max coincidence before | after | triples > 1e-3 before → after |
|---|---|---|---|---|---|
| 0 | 0 | 24 615 | 8.55e-24 | **1.04e-09** | 0 → 0 |
| 1 | 1 | 256 | 1.07e-41 | **2.80e-29** | 0 → 0 |
| 2 | 2 | 604 | 1.00e+00 | 1.00e+00 | 604 → 448 |
| 3 | 3 | 32 720 | 8.68e-05 | **2.21e-01** | 0 → 8 305 |
| 4 | 4 | 1 727 | 9.66e-01 | 9.99e-01 | 1 727 → 479 |
| 6 | 5 | 20 726 | 2.40e-05 | **9.86e-01** | 0 → 3 346 |
| 7 | 6 | 16 987 | 9.70e-01 | 6.71e-01 | 16 987 → 9 502 |
| 8 | 7 | 25 344 | 8.76e-02 | 5.49e-01 | 23 651 → 4 395 |
| 9 | 8 | 6 395 | 8.26e-01 | 9.83e-01 | 6 395 → 4 254 |
| 10 | 9 | 8 887 | 6.83e-05 | **3.67e-04** | 0 → 0 |
| 11 | 10 | 11 033 | 8.94e-33 | **4.00e-13** | 0 → 0 |
| 12 | 11 | 6 985 | 3.00e-08 | **1.31e-02** | 0 → 177 |
| 14 | 12 | 256 | 3.82e-33 | **3.09e-07** | 0 → 0 |
| 15 | 13 | 7 732 | 8.62e-01 | 9.56e-01 | 7 708 → 4 555 |
| 16 | 14 | 14 338 | 8.84e-03 | **9.58e-01** | 11 528 → 3 326 |
| 17 | 15 | 23 057 | 1.49e-29 | **9.96e-01** | 0 → 8 041 |
| 18 | 16 | 13 698 | 3.03e-03 | 6.77e-02 | 2 068 → 2 037 |
| 19 | 17 | 17 854 | 8.28e-08 | **2.08e-04** | 0 → 0 |

**Census.** Covers whose maximum coincidence is below 1e-3: **10 → 6** (demo 0, 1, 10, 11, 14, 19
remain). Below 1e-2: **12 → 6**. Covers with a *healthy* maximum (> 0.5): **5 → 9**. Five covers
moved from annihilated to alive by 4 to 29 orders of magnitude (demo 3, 6, 12, 16, 17); the six
survivors are the ones where the field colour genuinely is not what most pixels sit on at
σ = shortEdge/8 — three of them are very dark covers where OKLab's cube root at the 8-bit floor puts
even a faithful local surround several bars off the field (the same arithmetic that made anchor (a)
of the scale-band directive unreachable, `FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS`).

Note the second column moving *down* on the healthy covers (604 → 448, 1 727 → 479, 16 987 → 9 502):
that is the factor becoming a **measurement** rather than a near-constant. Before, a near-uniform
cover gave every triple the same global-mean ground and coincidence 1.0 across the board; now the
ground varies per candidate and the factor discriminates. Both directions of that change are the
same repair.

**Anchor check on the synthetic fixture** (`tests/substrate.test.ts`): the field's own habitual
ground sits **10.9 dark-neutral bars** off its own colour at rung 0 (coincidence 2e-26 — dead) and
**1.7 bars** at rung 2 (coincidence 0.23 — alive). That single number is W7's diagnosis reproduced
in a fixture: on `00007e97…` the *background's own* habitual ground was 10 bars from the background.

---

## 3. The eight checks, before and after

| # | check | before (W7) | after (W8) | verdict |
|---|---|---|---|---|
| 1 | fg min-\|APCA\| margin over the floor | min 0.01, p25 1.17, **median 1.70**, p75 9.70, max 106.09; **< 5 on 12/18** | min 0.02, p25 1.56, **median 4.97**, p75 26.02, max 106.09; **< 5 on 9/18** | **improved, still fails** |
| 2 | sibling twins (sub-bar published pairs) | 0 | 0 | passes |
| 3 | vivid accents | 12/16 chromatic covers under half the mark's chroma; 4 achromatic against a mark C ≥ 0.19 | **15/16** under half; 2 achromatic against a mark C ≥ 0.19, 4 more at C ≤ 0.007 | **worse** |
| 4 | gradient-first rate | 0/18 gradients published; 17/18 covers proposed one | 0/18 published; 17/18 proposed | unchanged, still not evidence |
| 5 | accent vs **background** | min −1.70, p25 2.95, median 7.03, p75 49.73, max 98.54; **< 5 on 7/18** | min −1.70, p25 1.54, median 2.29, p75 7.95, max 98.54; **< 5 on 12/18** | **worse** |
| 5 | accent vs **surface** | min −1.70, p25 0.56, median 5.60, p75 48.01, max 97.87; **< 5 on 8/18** | min −1.70, p25 0.17, median 4.16, p75 5.33, max 95.43; **< 5 on 12/18** | **worse** |
| 6 | (fg, accent) swap gap | 4 gaps 0.27–0.92; 11 ≤ 3e-3; **5 exactly zero** | **0 gaps above 0.04**; max 3.79e-2; **3 exactly zero** | **not repaired; changed shape** |
| — | contract scorecard | valid 18/18, 0 violations | valid 18/18, 0 violations | passes |

Collapses: 1 surface + 3 accent → 1 surface + 4 accent. **Zero escapes fired**, both runs.

### 3.1 Check 3 in full — and the reason it moved the way it did

| demo # | most chromatic significant mark (M ≥ 1e-3) | its C | accent before | C | ratio | accent after | C | ratio |
|---|---|---|---|---|---|---|---|---|
| 3 | `#ff00b9` | 0.2826 | `#f9f9f9` | 0.0000 | 0.00 | `#d6d2d3` | 0.0046 | 0.02 |
| 12 | `#ff0004` | 0.2575 | `#70ba25` | 0.1885 | **0.73** | `#f8faf9` | 0.0025 | **0.01** |
| 19 | `#ff0004` | 0.2575 | `#fafafa` | 0.0000 | 0.00 | `#fafafa` | 0.0000 | 0.00 |
| 0 | `#ff000d` | 0.2572 | `#f23704` | 0.2270 | **0.88** | `#ebece7` | 0.0067 | **0.03** |
| 7 | `#f2424d` | 0.2115 | `#f2f2f2` | 0.0000 | 0.00 | `#f4f6f5` | 0.0025 | 0.01 |
| 18 | `#d64ba8` | 0.1991 | `#000000` | 0.0000 | 0.00 | `#000000` | 0.0000 | 0.00 |
| 17 | `#b91827` | 0.1916 | `#202334` | 0.0322 | 0.17 | `#222838` | 0.0309 | 0.16 |
| 16 | `#ff6556` | 0.1906 | `#8e5b64` | 0.0680 | 0.36 | `#8d5b64` | 0.0667 | 0.35 |
| 10 | `#713207` | 0.1022 | `#3a180c` | 0.0579 | 0.57 | `#3a180c` | 0.0579 | 0.57 |
| 11 | `#58bfce` | 0.0972 | `#cfe2e9` | 0.0225 | 0.23 | `#cfe2e9` | 0.0225 | 0.23 |
| 6 | `#598e5a` | 0.0962 | `#5b615d` | 0.0098 | 0.10 | `#454c45` | 0.0146 | 0.15 |
| 15 | `#81402a` | 0.0960 | `#311a14` | 0.0387 | 0.40 | `#31190f` | 0.0426 | 0.44 |
| 8 | `#f8cc8d` | 0.0942 | `#ffe8e3` | 0.0262 | 0.28 | `#ffe8e3` | 0.0262 | 0.28 |
| 9 | `#99829f` | 0.0502 | `#717f88` | 0.0215 | 0.43 | `#728089` | 0.0215 | 0.43 |
| 4 | `#a9a484` | 0.0448 | `#111111` | 0.0000 | 0.00 | `#fdfdfd` | 0.0000 | 0.00 |
| 2 | `#060002` | 0.0329 | `#010000` | 0.0173 | 0.53 | `#e4e6e5` | 0.0025 | 0.08 |
| 1, 14 | greyscale artwork | 0.0000 | — | 0.0000 | n/a | — | 0.0000 | n/a |

Thirteen of eighteen rows barely move. The whole of check 3's regression is **two covers, 0 and 12,
where the vivid colour is still published — as the foreground.** On demo 0 the palette went
`fg #ebece7 / accent #f23704` → `fg #f23704 / accent #ebece7`; on demo 12,
`fg #f8faf9 / accent #70ba25` → `fg #70ba25 / accent #f8faf9`. Same published **set**, roles
exchanged. Demo 3 did the same with two neutrals.

So the artwork's identity colour did not leave the palette on those covers; the energy reassigned it.
That is `REVIEWER_EVIDENCE.md` row 6's exact subject matter — the reviewer's complaint was a request
for an fg↔accent swap of colours already in the palette — and this report cannot say which
assignment the reviewer wants. What it can say is that the per-mass ink term makes a small vivid
mark the best *ink* on those covers (it has the highest lightness-displacement density and a live
ground coincidence), and the check-1 and check-3 movements are the same three swaps read from two
sides.

### 3.2 Check 1's residual, isolated

The role-fitness term is now doing what it was argued to do, and it is outbid. On `…00000133…`
(demo 2), the cheapest candidate with |APCA| ≥ 45 vs the background is `#010000`:

| | leader `#fffeff` | `#010000` (\|APCA\| 91) |
|---|---|---|
| ink/mass ratio | 0.068 | **0.94** |
| ground coincidence | 0.18 | 0.16 |
| role fitness (their product) | 0.0123 | **0.150** — 12× the leader |
| belonging (rate 0.2) | **−0.607** | −0.0018 |
| unary total | **0.383** | 0.852 → **rank 189** |

Two contributors, and the counterfactuals separate them cleanly. `belonging = 0.2·ln(1.91e-2 / M)`
pays **−0.61** at M = 0.40 and ≈0 at M = 0.02, against a role-misfit range of exactly 1 — W7 §2.3,
unchanged. But the ink term's own gap is 0.94 − 0.068 = **0.87**, which *would* beat belonging: what
shrinks it to 0.14 is the ground coincidence, which is only 0.16–0.19 on **both** candidates. Forcing
the coincidence to 1 on this cover and leaving everything else as shipped puts `#010000` at **rank 1
by a clear margin** (`--probe` counterfactual, "ink per unit mass, coincidence forced to 1"). So the
residual on check 1 is *both* the belonging rate and a coincidence that is alive but still
suppressing every candidate's role evidence by ~5×; either alone would be survivable.

**Neither is touched here.** The rate is `tools/sensitivity.ts`'s alone. The coincidence suppression
is the second half of §8 item 3 and is a question about the kernel's scale, which is exactly the free
parameter this correction refused to invent.

The per-image normalisation is *not* the problem, checked rather than assumed: max ink density over
p99 ink density is **1.0–1.6×** on all 20 covers, so no single outlier triple is setting the scale.
Max over median runs 1.7–13×, which is the term correctly saying the field is not ink.

---

## 4. Timing, and the unflattening hypothesis

Dev-loop `computeMs`, 18 covers, 1 worker, `--no-cache`, contention-free, both arms:

| | before | after |
|---|---|---|
| min | 91 ms | 113 ms |
| median | 2 786 ms | **2 515 ms** |
| p95 | 93 323 ms | **41 977 ms** |
| max | 146 775 ms | **80 313 ms** |
| wall (18 covers) | 299 s | **225 s** (−25%) |
| covers over the 2 s defect line | 10/18 | 9/18 |

**The hypothesis was: dead coincidence → flat objective landscape → solver tail. It does not
survive the split.** Partitioning the 18 covers by W7's own dead-set (max coincidence < 1e-3 before):

| set | covers | Σ computeMs before | after | change |
|---|---|---|---|---|
| **dead** (demo 0, 1, 3, 6, 10, 11, 12, 14, 17, 19) | 10 | 130 479 ms | 133 348 ms | **+2%** |
| **alive** (demo 2, 4, 7, 8, 9, 15, 16, 18) | 8 | 168 781 ms | 91 918 ms | **−46%** |

The dead-set covers got *marginally slower*. All of the tail reduction is on covers whose
coincidence was already alive, and almost all of it is one cover: demo 16, 146 775 → 35 212 ms
(4.2×), whose coincidence went 8.84e-3 → 0.958 — i.e. the cover that was *partially* dead. Against
that, demo 7 went 6 981 → 9 835 ms and demo 15 went 2 926 → 13 164 ms (4.5× slower). The two covers
that never terminated under W7's 180 s cap **still do not terminate under a 300 s cap** (demo 5 and
demo 13, killed at 300 s, status 137), so the set is the same 18 and the two arms are comparable.

Per-stage, from the probe: substrate 51–79 ms and lattice 65–227 ms on every cover in both arms
(the upward drift late in the after-run is the machine warming, not the code). The distribution is
still entirely the solver, and the solver still costs more in per-candidate/per-hypothesis setup
than in descent — unchanged from W7 §3.1 and still outside this worker's paths.

**Verdict: no. Solve time is not a function of coincidence health.** A 25% wall reduction is real
but it is one cover's branch-and-bound behaving differently, not a mechanism.

---

## 5. The palettes, before and after

Set indices; the two non-terminating covers are absent from both arms.

| set # | bg | surface | fg | accent | fg min-\|APCA\| |
|---|---|---|---|---|---|
| 0 | `#e9e6df` → `#e9e6df` | `#ece0e0` → `#ece0e0` | `#ebece7` → **`#f23704`** | `#f23704` → `#ebece7` | 4.08 → **51.01** |
| 1 | `#000000` | `#000000` (collapsed) | `#fcfcfc` | `#0b0b0b` | 108.59 → 108.59 |
| 2 | `#e0e0e0` | `#dcdadb` | `#fefefe` → `#fffeff` | `#010000` → `#e4e6e5` | 20.21 → 20.40 |
| 3 | `#cecece` | `#c9c9c7` | `#d6d2d3` → **`#f9f9f9`** | `#f9f9f9` → `#d6d2d3` | 4.24 → **28.31** |
| 4 | `#ededed` | `#f1f2f6` → `#f3f3f3` | `#f8f8f8` → `#e4e4e6` | `#111111` → `#fdfdfd` | 4.26 → 5.42 |
| 5 | `#4b544f` | `#4c514b` | `#444d48` → `#5a605c` | `#5b615d` → `#454c45` | 2.51 → **6.66** |
| 6 | `#e9e5e4` → `#f0f0f0` | `#eeeced` → `#eceaeb` | `#f2f2f2` → `#f4f6f5` | (collapsed onto fg) | 4.10 → 4.03 |
| 7 | `#fbe2de` | `#fddbd9` | `#ffe8e3` | (collapsed onto fg) | 4.17 → 4.17 |
| 8 | `#908f9f` → `#808895` | `#788490` | `#b0a3ac` → `#aca0aa` | `#717f88` → `#728089` | 13.50 → 16.33 |
| 9 | `#faf9e4` | `#f3f4e2` | `#fffdee` | `#3a180c` | 3.26 → 3.26 |
| 10 | `#171c20` | `#151a1d` | `#22272a` | `#cfe2e9` | 2.55 → 2.55 |
| 11 | `#ffffff` | `#fdfff3` | `#f8faf9` → **`#70ba25`** | `#70ba25` → `#f8faf9` | 2.59 → **49.00** |
| 12 | `#2f2f2f` | `#242424` | `#070707` | `#171717` | 3.89 → 3.89 |
| 13 | `#38261a` | `#3b271e` | `#1d0a04` → `#1c0903` | `#311a14` → `#31190f` | 4.74 → 4.81 |
| 14 | `#a36268` | `#965e67` → `#965d66` | `#211f20` | `#8e5b64` → `#8d5b64` | 28.87 → 28.59 |
| 15 | `#272c3f` → **`#50545f`** | `#282e3c` → `#2a3040` | `#333743` → `#222838` | `#202334` → (collapsed) | 3.59 → 2.52 |
| 16 | `#363636` | `#313536` | `#000000` | (collapsed onto fg) | 8.28 → 8.28 |
| 17 | `#fdd000` | `#f7d909` | `#fd0100` | `#fafafa` | 42.69 → 42.69 |

Nine of eighteen palettes are unchanged or changed by ≤ 2 LSB. Three are exact fg↔accent swaps of an
unchanged set (0, 3, 11) and a fourth is a swap up to a few LSB (5). Three changed a field role
(6, 8, 15). Set 15 is the only regression on check 1 (3.59 → 2.52, now 0.02 above the floor) and it
also collapsed its accent.

---

## 6. Check 6 did not recover, and the reason is new

| demo # | swap gap before | after |
|---|---|---|
| 2 | 9.238e−1 | 2.555e−5 |
| 15 | 5.085e−1 | 1.824e−3 |
| 4 | 3.634e−1 | 6.301e−5 |
| 9 | 2.695e−1 | 6.898e−3 |
| 16 | 3.195e−3 | 3.791e−2 |
| 6 | 1.236e−6 | 5.537e−3 |
| 3 | 8.214e−7 | 2.320e−3 |
| 12 | 9.552e−10 | 8.162e−6 |
| 10 | 8.216e−6 | 1.668e−7 |
| 19 | 5.246e−9 | 1.776e−15 |
| 0 | **0.000e+0** | 1.388e−11 |
| 1, 11, 14 | **0.000e+0** | **0.000e+0** |
| 7, 8, 18 | n/a (accent collapsed) | n/a |
| 17 | 0.000e+0 | n/a (accent collapsed) |

Exact zeros: 5 → 3. But the four healthy gaps are gone: **no cover now has a swap gap above 0.04**,
where four covers had 0.27–0.92. On the previously-dead set the gaps did rise (3: 8e-7 → 2.3e-3;
6: 1.2e-6 → 5.5e-3; 16: 3.2e-3 → 3.8e-2) — three orders of magnitude, and still three orders below
what a decided ordering looked like before.

**The mechanism, and it is a consequence of §1.2 that this report owes the orchestrator plainly.**
With the accent's area factor removed and `rates.accentAnisotropy = 1`,
`accentEnergy = markEnergy + 1·inkEnergy`. On a **greyscale** artwork `markEnergy` is exactly 0 at
every pixel, so `accentEnergy ≡ inkEnergy`, the per-image maxima scale with it, and
`accentFitness ≡ foregroundFitness` — an *identity*, not a near-tie. Measured over all 18 covers,
max |fgFitness − accentFitness| relative to max fgFitness:

| demo # | 1 | 14 | 2 | 12 | 4 | 10 | 11 | 6 | 7 | 0 | 17 | 15 | 9 | 8 | 16 | 3 | 18 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| relative gap | 4e-16 | 3e-16 | 2e-4 | 2e-3 | 4e-3 | 9e-3 | 3e-2 | 5e-2 | 6e-2 | 7e-2 | 8e-2 | 1e-1 | 1e-1 | 1e-1 | 3e-1 | 4e-1 | 4e-1 | 7e-1 |
| Σ markEnergy / Σ inkEnergy | 0.000 | 0.000 | 0.004 | 0.627 | 0.011 | 0.079 | 0.048 | 0.126 | 0.382 | 0.651 | 0.119 | 0.160 | 0.248 | 0.220 | 0.372 | 0.407 | 0.423 | 0.902 |

The two greyscale covers agree to float precision. The two roles are now distinguished *only* by the
artwork's chromatic content, which on album artwork is often small. Before, the area-integral factor
separated them — for the wrong reason (it rewarded area) but it did separate them.

**This is handed upward, not patched here.** The proposal separates the roles by "lightness-dominant
vs chroma-dominant" (§2.1) and then prices the accent's lightness component *up* by λ (§2.4); at
λ = 1 those two statements are in tension and no reading of the ink/mark asymmetry resolves it inside
`terms.ts`. The available levers are λ (a rate, prohibited here) or a term the proposal does not have.
Recorded at `terms.ts:accentFitness` as well as here.

---

## 7. The four hypotheses, answered

**(a) Does check 1 pass now — are the fg margins off the floor?** *Improved, not passed.* Median
margin 1.70 → 4.97, floor-clustering 12/18 → 9/18, and three covers moved from 2.5–4.2 to 28–51 raw
APCA. But the distribution is still piled near the floor at the low end (min 0.02, p25 1.56) and the
mechanism that keeps it there is now cleanly isolated into two named contributors: the role term
prefers readable ink correctly (12× the fitness on the probe cover, and 14× on the ink factor alone),
and it loses because `belonging` pays −0.61 against a role range of 1 **and** because the coincidence
factor, though no longer dead, still multiplies every candidate's role evidence by ~0.17 on that
cover. Forcing the coincidence to 1 alone puts readable ink at rank 1. Both remaining levers — a rate
and a kernel scale — are outside this correction. §3.2.

**(b) Check 3 — are vivid accents found?** *No; worse.* 12/16 → 15/16 chromatic covers publish an
accent with under half the artwork's mark chroma. The regression is confined to the two covers that
previously published a vivid accent and now publish that same vivid colour **as the foreground**
(demo 0 `#f23704`, demo 12 `#70ba25`). The identity colour stayed in the palette and changed roles.
§3.1.

**(c) Check 6 — are the swap gaps nonzero on the previously-dead set?** *Nonzero, but three orders of
magnitude below a decided ordering, and the healthy gaps elsewhere collapsed.* Dead-set gaps rose
from 1e-9…8e-6 to 2e-3…4e-2; the previously-healthy 0.27–0.92 gaps fell to 3e-5…7e-3. Exact zeros
5 → 3, of which two are the greyscale identity described in §6. The core claim — role assignment read
out of one energy — is now *weakly* determined nearly everywhere rather than vacuous on ten covers
and firm on four. Whether that is progress is a judgement this report does not make.

**(d) Solver tail reduction?** *Yes overall (−25% wall, p95 halved, max halved), no on the predicted
set.* The dead-coincidence covers got 2% slower; the alive covers got 46% faster, almost all of it
one cover. The unflattening hypothesis is not supported. §4.

---

## 8. What is owed, in the order it matters

1. **The accent/foreground identity at λ = 1 (§6).** New, introduced by task 2, measured, disclosed.
   The two role terms coincide on greyscale artwork and differ by < 1% on near-greyscale artwork.
   The lever is a rate or a missing term; either is the orchestrator's and the reviewer's.
2. **`belonging` at 0.2 (§3.2).** One of exactly two remaining contributors to check 1's failure
   (was one of three). −0.61 at M = 0.40 against a role-misfit range of exactly 1.
   `tools/sensitivity.ts`.
3. **The coincidence kernel's scale, in two forms (§2, §3.2).** (i) Six covers still have a maximum
   coincidence below 1e-3; three are very dark artworks where OKLab's cube root at the 8-bit floor
   puts any faithful *local* surround several bars off the field — the same arithmetic that made the
   scale-band directive's anchor (a) unreachable, which no rung choice can fix. (ii) Even on covers
   where the factor is alive, the candidates that matter sit at 0.16–0.19, suppressing all role
   evidence five-fold. Both point at the one-same-colour-bar kernel width, which this worker
   deliberately did not widen: widening it invents a free parameter, which is the relapse the README
   pre-registers. The producer-side repair is done; the consumer-side question is open and is the
   orchestrator's.
4. **The solver's cost (§4).** Unchanged as a finding: two covers do not terminate in 300 s, 9 of 18
   exceed 2 s at 300×300, and the cost is in per-candidate setup. `solve.ts`/`coverage.ts`.
5. **Check 5's regression.** Accent-vs-background margins fell (< 5 raw APCA on 7/18 → 12/18) as a
   direct consequence of the vivid colours moving into the foreground role on three covers. It is the
   same three swaps as checks 1 and 3; it is not an independent finding.
6. **A set with real gradients on it**, before check 4's zero means anything. Unchanged from W7.
