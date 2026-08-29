# Phase 3 build review — buildability and robustness

**Adversarial, defects only.** Tags: `[B]` buildability gap, `[R]` stability asserted rather than
real, or a threshold propagating into later steps, `[C]` contract compliance, `[$]` cost, `[P]` build
plan. Where a proposal is clean on a criterion it is said so in one line and nothing more. Palette
quality is not graded here.

## Cross-cutting — shared evidence defects

1. **"P5's bg/surface were bit-identical across nine versions" is not in the cited source.**
   `joint-search` §Step 1, `robustness-first` §S2, `ranks` §5 row 10, `tree-first` §2.8 and `unseeded`
   §2.2 cite it, mostly to `p5-fieldfit/STATE.md`, which does not contain it (its only "nine versions"
   line, `:33`, is about capability outranking stabilisation). The real result is a **per-trial** rate
   in two integration passes — `winteg-pass5.md:79` "(120/600…)", `winteg-pass6.md:82` "(157/600)":
   20% and 26% of trials, not invariance across releases. Five proposals found their substrate choice
   on it. STATE.md's bg/surface instability (19.5/21.0%) is real and does support the graft; every §4
   table leaning on "bit-identical" needs re-founding.
2. **P5's "0.35 s at 300², 4.2 s at 3000²" is a stale whole-pipeline figure, not the fit.** Source is
   `reports/wp11.md:18-23`, the **v0.6.1** cost pass: 300² whole palette 232–353 ms *including* the E2
   recursion. The v0.9 marks stage landed after and dominates — `wv9a.md:44-50` gives 3000² fit
   1.6–2.9 s **plus** marks 3.8–12.4 s; `wv9c.md:47` puts `readMarks` at 6.2 s post-optimisation, with
   `barNeighbourhoodMass` alone at 3.4 s (`snap.ts:184`). So 4.2 s understates the current 3000²
   pipeline ~2×, and any design grafting `marks.ts` inherits ~6–8 s for the mark read alone.
3. **The guide-stop census is n=7, not n=60.** "Zero owed stops on demo-20 + fresh-40 vs 42% legacy"
   is cited by all six and is real (`p2-tree/STATE.md:50-52`), but there is no report: in
   `tos/gradient/out/*.census.jsonl` the `owed` key appears only on ramp covers — **4 of 20 and 3 of
   40**. Six designs treat the guide-stop canon as settled on zero-of-seven.
4. **Headline robustness figures are quoted with inconsistent direction; no two proposals agree.**
   `robustness-first`'s preamble and `unseeded` §4 both flag it and disagree. Arithmetic settles P5
   against the brief: accent instability is 46.2% and a palette cannot disagree less often than its
   worst role, so **39% is agreement (≈61% disagreement)**. Hence `joint-search` falsifier 4 ("no
   better than P5's 39% overall") aims at a bar it clears trivially. Any falsifier phrased against a
   fleet number is unusable until direction is fixed.
5. **The accent floor is a conjunction** (|raw APCA| < ε_accent **AND** distance <
   `ACCENT_FUNCTIONAL_DISTANCE`, at the same ramp point). Only `field-and-marks` states it;
   `joint-search`, `robustness-first`, `tree-first`, `unseeded` write an APCA minimum alone, which is
   **over-strict** and refuses the chromatic accents 0.14591 exists to protect; `ranks` leaves it folded.
6. **Escape as a substitute for backtracking.** `robustness-first` and `unseeded` fix the field pair
   irrevocably, so "no foreground clears the floor *against that pair*" fires the white/black escape
   although a legal alternative pair exists — the contract's condition is "genuinely no other way".
   `field-and-marks`, `joint-search`, `tree-first` put a field-relaxation rung first and are right.

---

## field-and-marks

1. `[B]` §Step 1's "order 0 vs 1 by residual margin in bars" has no value and no rule (it is D1 in §4),
   and §Step 2's layer gate turns on a **core fraction** never defined in quantity or cut (§5: the P5
   anchor is `[UNCALIBRATED]`, one cover). The layer stack is not implementable.
2. `[B]` §Step 3's `GIRTH_MIN` has **no value and no anchor** (§5: "my most likely wrong constant"), so
   the ground identity — the one new idea — cannot be built; same for `EXTENT_MIN`, `TIE_BAND`, §4 D9's
   band width, and §Step 7(c)'s "adjacent to, and a darker version of". §Step 5 prices a
   Douglas–Peucker vertex at P1's λ=0.1, an MDL bits-of-model constant, with no unit conversion.
3. `[B]` §Step 9 represents strata by a **pixel** medoid, but single-linkage separated **shape**
   medoids — so Step 6(i)'s "distinctness by construction" does not follow, and nothing else enforces
   distinctness.
4. `[R]` **The one new idea is the shape the design claims to have removed.** `enclosure` is a flood
   fill through the complement of `claim = {residual < 4 bars}` and `girth` a **max-EDT** on the same
   thresholded set; §4 calls both "integrals, hence dither-stable". One pixel opening a 4-connected
   channel swings enclosure between ≈0 and ≈1 globally, and one bridging pixel moves a max-EDT — the
   `p3-fields/src/coherence.ts:16-18` shape the proposal quotes to claim immunity.
5. `[R]` §Step 8's `mortality` erodes at 3% of the short side (P5's `INK_SCALE_FRACTION`,
   `components.ts:84`, applied there to components ≥10% of canvas). On individual marks — the median
   endorsed role colour covers 8.9e-5 — everything below the erosion scale vanishes, so mortality ≈1
   for essentially every mark and `ink(F) = Σ mass × mortality` degenerates to `Σ mass`: D9, the
   headline fix for P5's accent, restores the mass ordering §3.5 disclaims.
6. `[R]` §Step 2 **drops P5's component ink veto**, which is load-bearing — `fieldfit.ts:840-842`
   filters survivors on `componentIsInkLike` — so P5's measured stability for the peel does not
   transfer, yet §Step 2 presents the graft as "P5's E2 recursion". §4 is right that every gate stays
   a step function, and the gates decide the ground.
7. `[C]` `Bar` is fixed to `POOLED_SAME_COLOR_BAR` (`contract/constants.ts:255`), which PHASE_0 §3
   names "metrics-only reference, **never the gate's bar**". `FAMILY_RADIUS = 0.0307` clears the widest
   regional bar (0.02293) only at 1.34×, under §5's own 1.5×-reads-distinct bracket, and Step 9's
   surface rule and Step 10's validation use it where the invariant uses `sameColorBar(pair)`.
8. `[C]` **The relaxation chain breaks gradient neutrality.** Rung 2 drops the gradient "which shortens
   the ramp the foreground must clear" — the boolean changed by figure-role feasibility after colours
   are chosen, contradicting §Step 4 and §6. A late repair on the most neutrality-sensitive output;
   everything else is enforced during, with no repair stage.
9. `[$]` 300 px "0.4–0.7 s" is defensible after correction (0.35 s is P5's whole 300² palette
   *including* recursion). §7's 3000 px arithmetic double-counts: 4.2 s is the whole palette *after*
   the ≈9 s recursion cost (`SPEC.md:207`) was paid down, not "the base fit" plus it.
10. `[P]` Stage A publishes four roles + boolean + 2-stop ramps quickly, but drops both the tree and
    the family partition — the only distinctness mechanism — so round 1 ships with none specified.

---

## joint-search

1. `[B]` §Step 3 selects the field structure by `L(residual | model) + λ·L(model)` with **no coding
   scheme, no distribution, no quantisation and no units** for either `L`, and λ=0.1 transplanted from
   P1's MDL — so the gradient boolean, the design's neutrality claim, rests on an unspecified
   objective. It then "additionally consults" P5's t-continuity discriminator at the `TWO_FLAT`/`RAMP`
   boundary with no combination rule and no tiebreak.
2. `[B]` §Step 2 unions two enumerators (P5 `readMarks`, P2 tree nodes) with no de-duplication rule,
   and defines a representative circularly ("max-mass triple inside **its own** bar neighbourhood").
3. `[B]` §Step 6's bound is asserted to transfer from P6 "with the quantity swapped from energy to
   margin". P6 bounds a **scalar** (`p6/src/energy/solve.ts:16`); leximin over a margin *profile* is a
   vector order, and the stated break rule bounds only the first key, so P6's verified
   bit-identity-to-exhaustive property (`verification-1.md:57-59`) does **not** follow. At B5/B6 the
   search enumerates `(background, surface)` over all distinct triples — 10¹⁰–10¹² outer pairs at
   3000 px — under that unproven bound, uncosted. The design is named for this search.
4. `[R]` **Requirement F is arithmetically unsatisfiable on the artworks it targets.** F demands
   `#families(published) == #families(accepted populations)` capped at 4, while under `RAMP` bg and
   surface share a family by construction — so a ramp artwork with ≥4 populations publishes at most 3
   families and fails B0 always. Falsifier 2 ("ladder inertness") tests a defect predictable on paper.
5. `[R]` **The ladder level is the unacknowledged cliff.** §4 quantises the *rungs* and calls the rung
   boundary the dominant residual, but bundle membership is a boolean over the whole tuple: one
   population appearing or vanishing flips B0 feasible→infeasible and moves the palette wholesale.
   Largest blast radius in the design; the "ladder level" row does not name it.
6. `[R]` **A threshold propagates into role assignment.** P-fg is gated on P2's typographic boolean —
   `tos/roles/text.ts`, `TEXT_MIN_COMPONENTS = 4` plus three CV cuts — and a flip relocates the
   foreground. §4's stability table omits it, and §5's "B4 catches it by relaxation" is another
   whole-palette jump, not containment.
7. `[R]` §7's tie-break 3 (mass-maximising snap) is the only stabiliser under a tie, and it is mass,
   the quantity the design bans everywhere else.
8. `[C]` No defect beyond the accent floor (cross-cutting 5): C is the feasible set, never relaxed,
   enforced during; guide stops come after with full re-validation and refusal (§Step 8); the
   whole-ramp unary factorisation is verified in P6 code (`solve.ts:27-29`, `barriers.ts:24-30`).
9. `[$]` 3000 px ~8–12 s understates its own grafts: P5's `readMarks` costs 6.2 s there and the fit
   1.6–2.9 s, i.e. ~8–11 s **before** the tree of shapes it also runs and before the B5/B6 search — a
   floor presented as a range. (300 px ~0.9 s is the one correct use of P5's 0.35 s.) §7's mitigation
   — tree on a bounded-resolution copy for discovery only — is the right answer, but it changes what
   B0/B1 can see and no measurement of the population loss is proposed.
10. `[P]` Week 1 is well shaped and reaches a round, but needs §Step 3's undefined `L()` first.

---

## ranks-new-substrate

1. `[B]` `ρ*` — the gradient boolean's only threshold — has **no value**; §5 row 8 owes it to a
   reviewer round, yet §9 stage 2 ships ramps at day 4.
2. `[B]` §S8's candidates come from "the top-K **windows** of the ink ordering" with no window width;
   P3's `topWindow(sorted, fraction, step)` (`primitives.ts:140`) needs both. §S6's guide stop is "the
   cascade pixel of the ground-band pixels **nearest u in OKLab**" with the size of the "nearest" set
   unspecified, so the stop colour is undefined; `ρ = min/median` has no guard for a small ground
   band; §S2's softening has no transition width.
3. `[R]` No serious defect. The Lipschitz line (§2.0) is an auditable design rule; the octave ladder is
   indexed to the long edge, the specific repair for P3's measured −0.212 resolution slope
   (`p3-fields/STATE.md:29`); each `a_j` ships a per-perturbation bound; boolean eligibility becomes a
   weight; no thresholded decision is propagated. `ρ*` is correctly quarantined — A and B are computed
   identically on both branches, so the boolean cannot feed back into the colours.
4. `[C]` **§S8 checks the foreground against "the ramp's published *stops*"**, not the interpolated
   ramp — precisely the per-stop check PHASE_0 §2 records as refuted ("it's not 'each stop' … the
   contrast issue could happen somewhere in the middle of 2 points too"). §1 and §6 claim the
   whole-ramp minimum; the mechanism does not implement it.
5. `[C]` **§S8 publishes below the floor** — "if none clears, the argmax wins". Invariant 4 makes such
   a palette invalid: refused or repaired. There is no fallback to relaxation or to the escape.
6. `[C]` **§S8 sets `accentCollapsed` on a distance test** (key-1 < 1) without making the accent
   exactly the foreground — invariant 3's "near-identical-but-unequal with the flag set" violation.
7. `[C]` **Both figure roles are margin-maximised, inverting the evidence cited for them.** The
   foreground's ranking key *is* `min |raw APCA|` and the accent's key 1 *is* separation, identity
   admitted only inside an indifference band. §S8 quotes "the floor stands, identity picks within it"
   (GRAFT_INVENTORY learning 4) while implementing the converse: contrast is the selector, not the
   filter.
8. `[C]` §S2 softens the frozen regional bar and then uses the softened value inside the collapse and
   distinctness tests, which the validator evaluates on the frozen values (`contract/color.ts:249`).
   The algorithm can believe a pair distinct that the gate rejects, or set a flag the gate refuses.
   The motivation — a 1.7× ruler jump triggered by one LSB — is real; the fix is sound as an internal
   weight, not as the gate quantity.
9. `[$]` 3000 px "~5–9 s" with "IRLS ≈15%" allots 0.75–1.35 s to a fit measured at 1.6–2.9 s
   (`p5/reports/wv9a.md:44-50`) — understated ~2×, corrected total ~6–11 s. It grafts neither
   `marks.ts` nor a tree, so it avoids the 6–8 s mark read the other field designs inherit.
10. `[P]` No defect; the fastest first deliverable in the set (day 4: three real roles, judged boolean,
    2-stop ramps, accent collapsed), with a day-2 pre-reviewer substrate kill. It does depend on `ρ*`.

---

## robustness-first

1. `[B]` **§S6's central object has no evaluation scheme.** `S(p) = Σ_q m(q)·K_c(c_q−c_p)·K_x(x_q−x_p)`
   is a joint 5-D kernel density over every pixel pair — O(N²) as written. §7 prices it as "one
   quadrature splat plus one 64³-lattice smoothing", but a 64³ lattice is *colour only* and supplies
   no `K_x`. With no data structure stated the candidate generator — and with it foreground and accent
   — is not implementable, and "candidates are the local maxima of `S`" leaves domain, neighbourhood
   and basin delimitation unspecified too.
2. `[B]` §S3's D1 picks among three states from two statistics with **no combination rule and no cut
   for either**; §5 owes the explained-fraction split to a round. §S5's D4 ("below **a fraction** of
   the endpoints' … **near** the worst sample") and §S7 level 4's mode-connectivity fraction are also
   unvalued.
3. `[R]` **§S2's "Decisions: none — an M-estimator is a fixed point of a weighted sum over all pixels"
   is false.** Tukey's biweight is redescending, so IRLS is a non-convex fixed-point iteration with
   multiple attractors whose solution can jump with the initialisation. P5's measured stability is
   real evidence; this argument is not, and it carries the two roles the reviewer calls blocking.
4. `[R]` **The deadbands are measured on the instrument that then scores the design.** §5 anchors them
   at "3× the statistic's own standard deviation across the four perturbation arms of
   `src/robustness/`" and §8 falsifier 2 then reports `dither-lsb1` agreement from that same harness —
   train-on-test. §3's "no constant is fitted to reviewed covers" is beside the point: these are
   fitted to the metric.
5. `[R]` **The deadband argument (§4) is asserted.** A deadband relocates a boundary rather than
   removing it: flips move from `|s_A − s_B| ≈ 0` to `≈ δ`. That they do not occur there rests
   entirely on "each level is a *refinement* of the level above, not a rival" — stated, never argued
   or measured. With five cascade levels there are five such boundaries where there was one.
6. `[R]` **`salience` = mark-mass share ÷ area share is, over a candidate's own basin, the mean of `m`
   inside it** — bounded by 1 and near 1 for any clean mark, so it cannot rank candidates. It is
   called "production's single load-bearing foreground signal" and carries cascade level 3 plus half
   the accent decision.
7. `[C]` §S7 claims to enumerate `(bg, surface, fg, accent, gradient)` with P6's branch-and-bound, then
   says S4–S5 fix the field half; the search is over a few dozen (fg, accent) pairs and the B&B is dead
   machinery. The consequence is real: no path back to the field pair, so D8's escape fires for
   artworks with a legal alternative (cross-cutting 6). Otherwise the strongest contract handling in
   the set — invariants as the feasible set during, user floors as a re-pick after, the only explicit
   answer to PHASE_0 §2's paradigm-neutral requirement. Accent floor APCA-only (cross-cutting 5).
8. `[$]` **300 px "~0.10–0.20 s" is below P5's whole-palette 300² figure of 232–353 ms** while doing
   strictly more — two IRLS components, a 7-octave ladder, the 5-D support function, per-candidate
   medoids — and the anchor it calls "comparable to P5" is v0.6.1, pre-marks. 3000 px "~2.5–4.5 s" sits
   below the fit alone plus everything else, and the 5-D kernel is uncosted at both sizes.
9. `[P]` Stage 1 (S1–S5 plus a placeholder figure rule) is fast and exercises the largest complaint
   class, but it sidesteps §S6 — so the novel half is unproven at round 1 and the cost untested.

---

## tree-first

1. `[R]` **§2.5 builds pigments by leader linkage over patches in descending `area + ink` order.**
   Leader linkage is order-dependent by construction and the order is a continuous float, so two
   patches with near-equal evidence swapping places repartition the pigment set. The claim is "the
   ranked item is the colour, and its attributes are sums" — but the *partition that defines the
   colours* is an order-sensitive greedy on exactly the kind of float whose ranking flips produced the
   82% `c-winner` class (`q1-dither/REPORT.md:25`). Relocated, not removed, in the central mechanism.
2. `[B]` §2.5's `ink` = "patch area weighted by thinness `inradius/√area`". That ratio is **small for
   thin shapes and large for discs**, so as written it ranks blobs above strokes — inverting the
   quantity that carries T2 and T5.
3. `[B]` §2.8 gives no statistic and no cut for "the residual is continuous in the fitted parameter
   *t*"; §5 leaves the explained-fraction cut "measured" with no value; §2.6's supplemented triples
   carry no persistence, undefined in T4 which ranks on it; §8's falsifier 1 has no rule for comparing
   two pigment sets. §2.3's "persistence-at-the-bar subsumes antialias-ineligibility free" is **false**
   (a halo between black and white has π ≈ 0.5); the interior test is kept, so only the argument fails.
4. `[R]` **§2.7's majority descent trades an argmax for a cliff and presents it as a fix.** "Two
   children cannot both hold a majority, so there is no argmax" is beside the point: the *stop* is a
   threshold at exactly 1/2 on a continuous area fraction, so a cover near 0.5 flips the canvas node,
   which determines the entire field half — a fair trade against P2's ground chain (length changed on
   69% of covers, `q1-dither/REPORT.md:45`), but a trade. It also has **no absolute-area floor**: each
   step needs only a majority *of its parent*, so nothing stops the canvas landing on a tiny node.
5. `[R]` **T3, the leading seating test, is near-inert.** With bg and surface fixed by §2.8, "the count
   of distinct pigments the four published colours represent" is 2 + |{fg, accent} distinct and new|,
   i.e. 4 for almost every non-collapsed seating. It delivers (ii) no twins and (iii) priced collapse,
   but not (iv) set-conditioning ("black accent could work if all other picks are very chromatic") —
   it never distinguishes *which* pigment. On most covers the decision falls to T4.
6. `[R]` **T4 is an extremum, not an aggregate.** It maximises the minimum persistence among seated
   figure pigments, and a pigment's persistence is the **max** over its members — one high-contrast
   patch. So the quantity that actually decides is a per-patch float, the shape §2.5 exists to
   abolish, and it prefers the most contrasty mark over the identity colour in the accent seat.
7. `[C]` No defect other than the accent floor (cross-cutting 5): Σ is the feasible set, enumerated and
   never repaired; distinctness at `sameColorBar(pair)`; whole-ramp minimum; ramp ends are the field
   roles; the relaxation ladder ends at the declared escape with the field relaxing first.
8. `[$]` **The weakest cost claim in the set, extrapolated from no data.** P2 measured ~617 ms for the
   3-lane parse and 627 ms end-to-end at **300×300** (`tos/integration-NOTES.md:268-270`), and **no P2
   measurement above 300² exists anywhere**. 3000² is 100× the pixels on a quasi-linear build, so
   ~60–90 s against the tabled "~5–9 s", with no mechanism offered for a 10× gain. §7 also mis-orders
   the work: §2.3's retention needs `representativeColor` **for every node of three trees** before
   pruning, so "my retention prunes harder" cannot reduce that pass.
9. `[P]` No defect; week 2 reaches a first round and week 1's substrate falsifier precedes it.

---

## unseeded

1. `[B]` **§2.8, the design's core, cannot be computed as described.** "IRLS coefficients get the
   weighted-least-squares perturbation bound plus the biweight's Lipschitz weight term" — Tukey's
   biweight is redescending, so the IRLS fixed point has no global Lipschitz bound in the input. There
   is no valid certified interval for the fit's coefficients without assumptions the document does not
   state, and every downstream certificate inherits the gap.
2. `[R]` **Connectivity has no usable interval, and `thickness` is the banned shape.** §2.3's `reach`
   is over a component's *largest 4-connected support*; §2.8 swings ambiguous pixels both ways, but one
   such pixel can join or split two large regions, so the interval spans one piece to the union.
   Intervals overlap essentially always and the ground falls through to the convention ("the thicker")
   — abdication, not §2.8's "conservatism, never instability". And `thickness` is a **max-EDT on a
   thresholded support**, an extremum one bridging pixel moves: §2.3's "aggregates, not thresholds on
   a noisy per-pixel map" is true of `reach` only.
3. `[B]` `T` (thickness), minimum ground reach, `S` (span), `M` (mass) and `μ` all have **no values**;
   four gate candidacy or the ground. §2.5's endpoint walk runs "while source support holds" (no rule)
   and is guarded against "the publication margin of another published colour" — but fg and accent are
   not chosen until §2.7.
4. `[C]` **§2.1 re-specifies the colour space the contract's frozen ruler was calibrated in.** The bar
   is a `[REVIEWED]` freeze over 130 fitted points in Euclidean OKLab (PHASE_0 §3), where the
   validator, the harness (`compare.ts` via `barFor`) and adjudication all keep measuring. `Y0 = 0.005`
   changes dark distances up to 5×, so family, collapse and margin decisions run on a different ruler.
5. `[R]` **The flare's premise contradicts the measurement it cites.** PHASE_0 §3 gives the direction
   of the near-black mis-calibration — "the reviewer's eyes discriminate dark neutrals ~2× finer than
   OKLab distance predicts", which is why dark-neutral (0.00932) is the **tightest** bar. The flare
   compresses dark distances, merging darks more readily — the opposite direction.
6. `[R]` **§2.7 puts coverage above ink.** Maximising the count of distinct identity families the four
   published colours span, as the *first* criterion, over-diversifies — the mechanism form of the
   force-included minor hue pathology P5 forbids — and it outranks the text-led fg graft at level 2.
7. `[R]` §2.5 forces the background by geometry (`t = 0` at the render's 135° start), but the consumer
   renders every ramp at 135° regardless of the artwork's gradient direction (PHASE_0 §2), so this ties
   the background to image position, not to the artwork. §2.6's `span ≥ S` **OR** `mass ≥ M` widens the
   candidacy wall rather than removing it: a compact mark with small span *and* small mass — the median
   endorsed role colour at 8.89e-5 plausibly is one — fails both.
8. `[C]` Otherwise clean: feasible set during, no repair, correct ramp ends, whole-ramp minimum, guide
   stops re-validated, distinctness at `μ × bar` stricter than the invariant. The escape fires when no
   feasible foreground exists against a field pair §2.7 will not revisit (cross-cutting 6) — §2.5
   *does* backtrack for ramp-end distinctness, so the machinery is simply not wired to that case.
9. `[$]`/`[P]` No defect. The only cost section consistent with the corrected numbers (8–15 s at
   3000 px is right for a design grafting `marks.ts`), and days 1–5 produce a complete algorithm with
   **no intervals** — falsifier 1 does not need §2.8, so failing it costs 4 days, not the arm.

---

## Ranking

**(a) buildability** — can an implementer build it from the document alone. **(b) robustness
argument** — are the stability claims integrals or explicit deadbands with stated bounds, or
assertions, and does any step propagate a threshold. **(c) cost** — does the estimate survive the
prototype numbers it cites, corrected for the stale and absent anchors in cross-cutting 1–2.

| | (a) buildability | (b) robustness argument | (c) cost |
|---|---|---|---|
| **ranks-new-substrate** | **1st** — every field has a formula; the holes are `ρ*`, the ink window width and one "nearest" set | **1st** — the Lipschitz line is an auditable design rule, the ladder is resolution-indexed against P3's measured −0.212 slope, the one threshold is quarantined from the colours; loses ground only because both figure roles are margin-argmaxes | 3rd — understated ~2× at 3000 px (IRLS at 15% vs a 1.6–2.9 s measured fit), but it grafts neither `marks.ts` nor a tree, so it avoids the 6–8 s mark read the others inherit |
| **tree-first** | 2nd — P2 code named file by file and verified present; blocked by inverted `ink`, order-dependent leader linkage, an unvalued explained-fraction cut | 3rd — §4.1's persistence-at-the-bar is genuinely structural and removes a verified mass floor, but majority descent is a 1/2 cliff on the field pair, T3 is near-inert, and the real decider T4 is a per-patch extremum | **6th** — "~5–9 s" at 3000 px extrapolated from 617 ms at 300² with **no measurement above 300² existing anywhere**; ~60–90 s is honest, and the representative pass is mis-ordered |
| **unseeded** | 4th — §2.1–2.7 buildable, §2.8 (the core) is not, and four candidacy/ground constants have no values | 4th — the most honest treatment of the nearest prior null, but the certificates cannot be computed for a redescending IRLS or for connectivity, and `thickness` is the banned max-EDT shape | **1st** — the only estimate consistent with the corrected numbers, and the only one that names its own weakest figure |
| **joint-search** | 5th — `L()` has no coding scheme, the leximin bound does not inherit P6's exactness, two enumerators union with no dedup rule, F is unsatisfiable on ramps | 2nd — quantised rungs plus a stable fallback is a real structural claim, honestly bounded and self-exposed; loses points because bundle membership is an unacknowledged whole-palette cliff and a typographic boolean gates the foreground | 2nd — the only correct use of P5's 0.35 s; 3000 px is a floor presented as a range and B5/B6 is uncosted |
| **field-and-marks** | 6th — `GIRTH_MIN`, `EXTENT_MIN`, `TIE_BAND` and "core fraction" have no values; λ is transplanted across units | **6th** — the one new idea (enclosure + girth) is a flood fill and a max-EDT on a thresholded claim, asserted as "area integrals"; `mortality` at 3% of the short side degenerates `ink` back to mass | 4th — 300 px defensible after correction; §7's 3000 px arithmetic double-counts a recursion cost already paid down |
| **robustness-first** | **6th (tied)** — the candidate generator `S` is O(N²) with no evaluation scheme, D1 has no rule, basins are undefined | 5th — the deadband argument is asserted rather than shown, the deadbands are fitted to the harness that then scores them, "an M-estimator makes no decision" is false, and `salience` cannot rank | 5th — 300 px sits below P5's whole-palette figure while doing strictly more; the 5-D kernel is uncosted at both sizes |

Best contract handling: `robustness-first` (§S7's defaults/floors split is the only explicit answer to
PHASE_0 §2's paradigm-neutral requirement). Best relaxation ordering: `tree-first`. Fastest honest
first palettes: `ranks-new-substrate` (day 4), then `robustness-first` (~day 3, on a placeholder
figure rule) and `unseeded` (day 5, complete). Only pre-reviewer kill that would stop the work:
`ranks-new-substrate` at day 2, with `tree-first`'s week-1 substrate falsifier close behind.
