# Robustness-first: integral statistics, soft supports, and a semiorder election

*Author's angle: design backwards from the robustness goal. Every quantity that any decision reads
is an integral over many pixels with a scale-free kernel; every discrete decision has a deadband
measured against the perturbation harness; and there are eight discrete decisions in the whole
pipeline, not nine hundred.*

**One arithmetic fact sets the whole frame.** A ±1-LSB step is ~0.0008–0.0025 OKLab
(`src/contract/color.ts` `colorDistance`, sampled), while the tightest same-colour bar is
0.00932 and the loosest 0.02293 (`src/contract/constants.ts` `SAME_COLOR_BAR_BY_REGION`). The
harness's verdict is "every role within its regional bar" (`src/robustness/compare.ts`). So a
dither **cannot** break a palette by moving a published value: 1 LSB is 4–25× below the bar. v2-3's
0-of-114 was therefore *entirely* decision flips. Robustness is a decision-count and
decision-margin problem, not a colour-precision problem. Everything below follows from that.

*Direction note, because the arms report opposite conventions:* P3's figures are **disagreement**
(16.0% overall ⇒ 84% agreement; `p3-fields/STATE.md` §3, and P5's STATE quotes it as "P3's 81.8%");
P2's and P5's are **agreement** (P2 9.0% overall / 15.0% dither, `p2-tree/STATE.md` §3; P5 39.0%
overall, `p5-fieldfit/STATE.md`). Incumbent anchor: 72.8% on jpeg-q92 (`src/robustness/README.md`).

---

## 1. The design in one paragraph

Decode at native resolution. Fit one robust affine colour field over the *whole* image by Tukey
IRLS; the per-pixel IRLS weight — a smooth number in [0,1], never thresholded — is the field
membership, and its complement is the mark membership. The **background and surface** are the two
extreme weighted order statistics of the field population along the field's own OKLab principal
axis; whether the pair is a **gradient** is a property of that same fit (one continuously shaded
surface vs two blocks vs no field), so gradient truth is never a separate detector and the marks
can never influence it. Over the mark population, build a smooth joint colour×space support
function whose local maxima are the **mark candidates**; each candidate publishes the weighted
medoid of its own pixels, so every published colour is an exact artwork pixel that is an order
statistic over a population rather than a point pick. Enumerate every contract-feasible
(background, surface, foreground, accent, gradient) tuple with exact branch-and-bound, and elect
one by a **lexicographic cascade with deadbands** — never a weighted sum, never a scalar score:
foreground goes to the artwork's ink among floor-clearing candidates, accent to the strongest
remaining identity colour in a colour family the artwork itself keeps separate, and any comparison
whose margin falls inside its measured deadband passes to the next criterion instead of coin-flipping.
The palette is one object throughout: the contract is the feasible set of the joint search, not a
repair pass.

## 2. Mechanism

Notation: pixels have normalized coordinates `x ∈ [0,1]²` and OKLab colour `c`. Every spatial
radius is a fraction of the image diagonal; every count is a mass fraction. This is
`PHASE_0_DECISIONS.md` §1's "resolution agnosticism" taken literally: **no operator has a support
measured in pixels.** No resampling anywhere (§1, "No resampling, ever").

**S1 — decode.** Pinned decoder, native resolution, OKLab per pixel. Refuse real transparency
loudly (§1). *Decisions: none.* [contract]

**S2 — the field fit.** Fit `c ≈ A·x + b` (OKLab 3-vector affine in space) by Tukey biweight IRLS
over **all** pixels, ~12 iterations, tuning constant at the literature's 4.685σ. Output: coefficients,
the residual scale σ, and a per-pixel weight `w(p) ∈ [0,1]` that decays smoothly with residual.
Then repeat once on the residual population to get a second field component if one exists (P5's
E2). *From: P5, robust-fit-as-segmentation (`p5-fieldfit/STATE.md` §1, §5).* *Decisions: none — an
M-estimator is a fixed point of a weighted sum over all pixels.* Evidence that this is the right
substrate: P5's bg/surface were **bit-identical across nine versions** and "field path bit-stable
under dither at ≤1.06× amplification" (STATE §3).

**S3 — the field verdict (decision D1).** Two integral statistics over the whole image: the
**explained fraction** (mass-weighted share of pixels with residual under a multiple of σ — P5's
absolute-form detector, which "cleanly split block covers from photographs, both paths
judge-graded", GRAFT_INVENTORY) and **t-continuity** (project field pixels onto the fitted
direction `t = â·x`; the colour path along `t` is either continuous or two blocks — P5's
discriminator, "zero false gradients ever", STATE §2). D1 chooses one of three states: *one shaded
field*, *two blocks*, *no field* (photograph/illustration; the retreat path). Deadband: measured
(§5); inside it, choose *two blocks*, the state that yields a flat palette, because flat is also
what a collapse yields and the two answers then differ least in published colour.

**S4 — the field pair (background, surface).** Take the field population weighted by `w`. Compute
its **colour principal axis** over the field's own pixels only (the field guide §6 is explicit that
restricting to the field's pixels "is what makes it sound"). Background = the pixel at the weighted
2nd percentile along that axis; surface = the 98th. These are order statistics attaining on real
pixels — no synthesis, no "ideal colour then nearest-pixel snap" (the field guide indicts that
sub-mechanism by name as a stability liability). The 2/98 band is not an endpoint aim point: the
guide records that reading endpoints at 0.1/0.9 was "systematically too narrow" and that re-aiming
alone bought −5.8%, because *the pool*, not the aim, binds; taking the order statistic over the
field's own colour-axis distribution is the pool fix. Orientation (which end is background) is
decision **D2**: the end with the greater border mass fraction is the background — "fields own
borders; marks float" (field guide §5) — with a deadband falling through to the darker end.
*Decisions: D2 only; the two colours themselves are order statistics, not decisions.*

**S5 — collapse and stops (D3, D4).** If the two ends are within their regional bar, `surfaceCollapsed`
and no gradient (contract consequence, `PHASE_2_HANDOFF.md` §5: "it's in the specs") — **D3** is a bar
test on two published colours, with the bar as its own deadband. Otherwise the gradient boolean is
already fixed by D1. **D4** adds at most one interior guide stop, and only for excursion reduction
(`PHASE_0_DECISIONS.md` §2): sample the rendered OKLab segment; at each sample compute the artwork's
**colour density** (kernel mass of artwork pixels within `h_c` of that colour — an integral, not a
nearest-neighbour distance); if density collapses below a fraction of the endpoints' over a
contiguous run, insert the pixel that maximizes density near the worst sample. *From: P2 guide-stop
canon (zero owed stops on demo-20 + fresh-40 vs 42% legacy) + P1/P6 excursion probes.*

**S6 — mark candidates.** Mark weight `m(p) = 1 − w(p)`, smooth, unthresholded, positive almost
everywhere — so **there is no candidacy wall and no mass floor**: every colour in the artwork is
reachable by every figure role (goal 3; the corpus fact is that the median endorsed role colour has
8.9e-5 exact-pixel share, GRAFT_INVENTORY). Define the **support function**

  `S(p) = Σ_q m(q) · K_c(c_q − c_p) · K_x(x_q − x_p)`

with `K_c` a Gaussian of bandwidth `h_c` in OKLab and `K_x` a ladder of Gaussians at octave
fractions of the diagonal (P6's blur-ladder surround — verified salvage). `S` is an integral over
many pixels by construction. Candidates are the local maxima of `S`; each candidate's published
colour is the **weighted medoid** of the pixels in its basin (P3's cascade-pixel primitive: iterated
medians restricted to attaining pixels, so the answer terminates on a real pixel and inherits the
median's 50% breakdown point). Candidates within a regional bar of each other are merged into one
semiorder class (P2's ruler-indifference machinery) — after this, *a flip between two members of one
class is invisible to the harness and to the reviewer by construction.*
Per candidate, compute three scale-free integral descriptors:
- **salience** = mark-mass share ÷ area share — over-representation relative to area. This is
  production's single load-bearing foreground signal (`PRIOR_ART_CHECK.md` §B2.4: the saliency-delta)
  and *no Phase 1 or Phase 2 proposal computed it*. It is what "salience beats mass" (P5 round-5:
  a 2%-sticker palette graded STRONG; mass-1505 rejected for a named mass-306) means numerically.
- **scale profile** = how the candidate's mass distributes across the blur ladder. Ink and type sit
  at small scales; fields at large ones.
- **span** = the normalized second moment of the candidate's mass. Title text spans the canvas; a
  label logo does not. This is the measurable half of the spatial-extent semantics that P3 recorded
  as an honest limit (EVIDENCE 14, round-7: "title-text marks accepted, logo marks refused").
- Candidacy is also opened to **tree-of-shapes nodes** whose colour is not already a class member,
  as a reachability backstop (P2: 91.9% endorsed reachability vs 36.4% control). The tree generates;
  it never decides.

**S7 — the joint election (D5 foreground, D6 accent, D7 accent-collapse, D8 escape).** Enumerate
every tuple (background, surface, foreground, accent, gradient) that is **contract-feasible** with
P6's exact branch-and-bound (bit-identical to exhaustive enumeration at real scale, 280M tuples
costed, 5–249 visited). The background/surface/gradient half is fixed by S4–S5: the field subsystem
owns the field seats and the figure subsystem cannot overrule it. Feasibility = all four roles exact
pixels; every published pair above its regional bar or a declared sanctioned collapse; foreground and
accent clearing their raw-APCA floors as a **minimum over the whole rendered OKLab ramp**, evaluated
on raw pre-clamp values (the field guide §7 warns that two samples straddling APCA's zero-clamp
plateau report a phantom sign flip); ramp ends exactly the field pair.

Then order the feasible tuples by a **lexicographic cascade with deadbands**. Each level is a
comparison, never a term in a sum; there are no exchange rates anywhere in this design.

1. **Ink.** Prefer the tuple whose foreground has the higher ink profile (small-scale mass, wide
   span, high salience). *From: P2 text-led foreground, judge-proven 16/20 and prescribed constantly
   — cal-022 "the main text is white on this artwork, we should have a white foreground too";
   cal-025 "foreground should be white like the huge typography".*
2. **Legibility within the floor.** Tie → prefer higher `min |raw APCA|` over the rendered ramp.
   *From: P5, converged in P3; the reviewer's own demonstration verdict is "the floor stands, the
   pick was the defect" (pair-018), i.e. identity leads and legibility breaks ties.*
3. **Identity recovery.** Tie → prefer the accent with higher salience in a colour family not already
   published. *From class E, 9 items: cal-020 "accent should probably be the red color that occupies
   the bottom half of the artwork, without it we're losing a lot of the artwork's identity".*
4. **Family fidelity (the near-twin test).** Two published colours count as *one colour of the
   artwork* iff the artwork's own colour density along the OKLab segment between them never dips
   below a fraction of its endpoint values — a **mode-connectivity** test, not a margin constant.
   Tuples that publish two colours the artwork keeps in one connected mode lose to tuples that do
   not. This is the structural form of "the palette's family structure should mirror the artwork's"
   (GRAFT_INVENTORY reframing) and of cal-022's "there aren't 2 shades of yellow on that artwork".
5. **Structure economy.** Tie → prefer the simpler structure (collapse < flat < ramp) at P1's
   measured λ = 0.1 — used *only* as this sub-decision, never as the objective (P1's kill).

**D7** (accent collapse) fires when no feasible accent survives level 3; **D8** (escape to
`#ffffff`/`#000000`) when the feasible set is empty, declared, one colour, background or foreground
only. **User-raised floors** are applied last, as a re-pick from the already-enumerated feasible set —
so defaults are byte-identical to the unparameterized algorithm and raising a floor changes only
artworks that violate it (`PHASE_0_DECISIONS.md` §2's paradigm-neutral requirement, and the field
guide §3's measured 10:1 collateral when the same rule ran during generation instead).

**Where the contract enters, and why there.** Contract *invariants* are the feasible set of the
joint search — during, not after — because a post-hoc repair relocates the defect: the field guide's
canary 2 records the first foreground/surface repair moving the zero onto the accent in 13 of 15
cases. Contract *user parameters* are a last-minute re-pick over that same set — after — because the
same guide's §3 measured a generation-stage contrast filter moving 148 artworks to fix 14.

## 3. Why it does not die the way the six died

- **No scalar currency judges (P1, P4).** There is no score. The election is a lexicographic
  cascade of comparisons; nothing is summed, so nothing has authority by being larger.
- **Role assignment is a separate competence (P1's kill).** Levels 1–3 *are* the role-assignment
  competence, and they run over a tuple space where the same colour set can be seated many ways;
  the search enumerates permutations explicitly rather than being indifferent to them.
- **Optimizers sit on floors; the judge grades margins (P6).** Nothing minimizes toward a barrier.
  Distinctness is decided by mode-connectivity against the artwork's own density (level 4), which
  prices *what the reviewer says* ("there aren't 2 shades of yellow") without a hand-set margin rate
  — the exact relapse that fired P6's falsifier 3.
- **Selectors die (5×).** There is no election between rival whole palettes. Two subsystems compose
  structurally: the field subsystem owns background/surface/gradient, the figure subsystem owns
  foreground/accent, and the joint search only enforces the contract between them.
- **Mass floors block endorsed colours.** There is no floor. Mark weight is `1 − w`, positive
  almost everywhere; salience is over-representation, so smallness is a *virtue* in the statistic,
  matching "salience beats mass".
- **Exchange rates without principle (P6).** None exist: lexicographic ordering has no coefficients.
- **The dev-set trap (GRAFT_INVENTORY §8).** No constant is fitted to reviewed covers; deadbands are
  measured on the perturbation corpus, which is 50/50 reviewed/unseen by construction.

## 4. Robustness argument

**The eight discrete decisions**, and why each is stable:

| # | decision | statistic it reads | why stable |
|---|---|---|---|
| D1 | field verdict (shaded / two blocks / none) | explained fraction + t-continuity, both integrals over **all** pixels | noise averages as 1/√N over millions; deadband at 3× measured perturbation spread |
| D2 | which field end is background | border mass fraction | an integral over a border band that is a fixed *fraction* of the image |
| D3 | surface collapse | distance between two published colours vs the bar | the bar **is** the deadband: inside it, both answers are the same colour |
| D4 | interior guide stop | ramp colour-density profile | kernel mass, an integral; a flip changes an interior stop only, never a role |
| D5 | foreground | ink profile, then min·APCA | integrals over a candidate's whole mass; ties resolve down the cascade |
| D6 | accent | salience + family novelty | same; candidates pre-merged at the bar so intra-class flips are invisible |
| D7 | accent collapse | feasibility of any accent | a contract predicate over the feasible set |
| D8 | escape | emptiness of the feasible set | a contract predicate |

**Why deadbands help rather than moving the boundary.** With a strict argmax, a flip happens when
`|s_A − s_B| < noise`, i.e. on a set of images of measure ≈ 2·noise·density(0) — and *precisely
there* the criterion carries no information, so the answer is a coin flip. With a deadband δ ≫ noise,
flips move to `|s_A − s_B| ≈ δ`, where the criterion *does* carry information, and they only occur
if the next criterion disagrees there. The cascade is therefore ordered so each level is a
*refinement* of the level above (ink → legibility of that ink → identity of what is left), not a
rival to it, which is what makes the disagreement probability at the band edge small. This is a
structural argument, not tuning: no deadband width makes it false, only less effective.

**Why the published values are stable given a stable decision.** Every published colour is a
weighted order statistic (percentile pixel, or medoid) over a population of many pixels. Perturbing
values by 1 LSB moves an order statistic by ≤1 LSB. Perturbing the *weights* moves the quantile
position continuously; the value jumps only if the population's colour distribution has a gap there
— which is why populations are built to be colour-coherent (a medoid inside one basin of `S`, not
across basins) and why the field ends are read at 2/98 with 2% of field mass behind each.

**Causes removed.** (i) P3's located cause — "the binary edge/depth substrate couples to resolution
(slope −0.212) and to noise (β-depth drift 0.34 log units across renditions)" (`p3-fields/STATE.md`
§3) — is removed at the root: there is no binary mask, no edge operator, and no fixed-pixel support
anywhere. (ii) P2's assignment-set churn (its "hardest open item"; 9.0% agreement) is removed by
never letting node membership decide anything. (iii) v2-3's quantization grid (origin on the neutral
axis, so neutrals live on bin boundaries and flap 50% of pixels under one bit) is removed: the only
lattice is a quadrature device at ≤ `h_c`/8, and its inertness is a pre-registered falsifier (§8).
(iv) ASCII/lexicographic tie-breaks on content-derived ids (55.85% of v2-3's corpus moved on a pure
relabel) do not exist; every tie-break in the cascade is a content statistic.

**Causes inherited, honestly.** (a) P5's measured finding that accent instability is "the
argmax-near-margins shape, not any one rule" (51–53% constant across three selection rules) is only
*mitigated* here — by bar-quotient merging and deadbands — not abolished. Accent will still be the
least stable role. (b) Rendition pairs differ in **size** as well as encoding (`src/robustness/pair-set.ts`:
"two encodings, two sizes"), so a small mark genuinely absent at 147 px cannot be recovered at 482 px.
`PHASE_0_DECISIONS.md` §1 calls this *informed* rather than *chaotic* disagreement; the design targets
chaotic → 0 and should report the split rather than claim the pair number. (c) The `S` maxima count
is itself input-dependent; merging at the bar bounds the damage but does not remove it.

## 5. Free parameters

| constant | anchor | if wrong |
|---|---|---|
| `h_c` — OKLab kernel bandwidth | a fixed small multiple of the pair's regional same-colour bar (contract-derived, `SAME_COLOR_BAR_BY_REGION`) | too small → P5's fragmentation (one black = 70 families); too large → merges shades the reviewer names separately |
| spatial ladder — octaves from ~1/128 to 1/2 of the diagonal | derived: lower end at the measured resolution floor ~241 px (`PHASE_0_DECISIONS.md` §7), upper end the image | a short ladder blurs the ink/field distinction; extra octaves cost time, not answers |
| Tukey `c = 4.685σ` | literature (95% Gaussian efficiency); **not** fitted here | field/mark split gets soft or brittle; measurable directly on the explained fraction |
| explained-fraction split for D1 | reviewer round — P5's detector is already judge-graded on both paths | false/missed gradients, both live complaint directions |
| **deadband widths (D1, D2, D5, D6)** | **measured**: 3× the statistic's own standard deviation across the four perturbation arms of `src/robustness/` | too narrow → flips return; too wide → the cascade's first level stops deciding and level 2 rules, visible as a quality regression, not a silent one |
| ramp density-dip fraction (D4, level 4) | reviewer round; bracketed by the margins evidence (1.5× silent, 5.4× still complained-about) | over-inserted guide stops (banding) or surviving near-twins |
| lattice spacing | held at ≤ `h_c`/8 and **required to be inert** (§8 falsifier) | if it is not inert the design is refuted, not retuned |
| λ = 0.1 (structure economy, level 5) | P1's measured 72-cell probe | too much or too little structure diversity; lowest-stakes level in the cascade |

Eight constants, of which two are contract-derived, two measured on the robustness corpus, one
from the literature, two owed to a reviewer round, and one held-and-falsifiable. Against v2-3's ~908
tunable sites at ~11 human-anchored values (field guide §8), that is the order of magnitude the goal
asks for. The APCA floors are the contract's user parameters and are not counted as mine.

## 6. The failure classes

- **Wrong field colour (11 items — the largest class).** *Partly structural.* The background is the
  robust fit's field, not the most massive colour, which removes the "a black bar wins the population
  contest" mechanism; D2's border-mass ordering removes "an interior region is the background".
  **Not handled: face-as-field.** cal-020 "this color is the face of the character and not actually
  the background"; cal-026 repeats it. P5 confirmed over three rounds that this is structurally
  inexpressible in pixel machinery. A large smooth face *is* a field by every statistic I have. I
  claim no fix and would show it to the reviewer early.
- **False / missed gradient (7).** *Structural.* The boolean is a property of the field fit, and the
  mark subsystem cannot reach it — the guide's §2.4 neutrality-by-construction rule. Note the
  reviewer's own methodological point (warehouse note, `criterion/both-readings-defensible`): the
  flag "can really depend on which colors were picked for background/surface", and 5 of 7 complaints
  named the *stop colours* rather than flatness. Deciding the pair and the boolean from one fit is
  the design's answer to that.
- **Unreadable foreground (9).** *Structural.* The floor is enforced as a minimum over the whole
  rendered ramp, inside the feasible set, on raw pre-clamp APCA — so an unreadable tuple is never
  enumerable, and there is no repair pass to relocate the defect.
- **Foreground should be the artwork's ink (7).** *Handled by level 1* of the cascade, the fleet's
  strongest judge-proven graft. This is also where P3's recorded limitation lives (white type on
  photographs ranked low by surround coherence); span + salience, not surround coherence, is my
  ink statistic, which is the specific change that should fix that class — unproven.
- **Colour only in a label/logo, or accidental (8).** *Partly handled* by span (second moment) and
  scale profile: a logo is small-scale **and** low-span; title text is small-scale and high-span.
  This is the fleet's one confirmed shared inexpressible, so I flag it as the most likely place my
  new statistic fails to reproduce the reviewer's semantics.
- **Right colours, wrong roles (6).** *Structural.* Role assignment is the cascade, run over an
  enumerated permutation space; the cleanest datum in the corpus is the same four colours graded
  acceptable and then weak on swap alone (cal-017 → cal-022), which a swap-indifferent mechanism
  cannot express and this one can.
- **Two near-identical shades (4).** *Structural*, by level 4's mode-connectivity test, which is
  also the one place this design says something new about margins.
- **Field guide §10 cases I consider decisive.** §10.9 black bar / frame — my honest weak point:
  border ownership *helps* a frame steal the background. Mitigation proposed, unproven: a frame's
  complement is a single central region, so compare candidate field components by mass-weighted
  distance-to-border profile and prefer the enclosed one. §10.6 scrambled twins — a genuine
  discriminator for this design, since a scramble destroys the affine fit and must flip the gradient;
  keep them in the corpus, excluded from quality metrics. §10.3 white-text class — level 1 plus
  polarity. §10.14 degenerate artworks — D8's escape, with every stage having a defined empty path.

## 7. Cost

Per file, cold, native resolution, no tables or models. Roughly 35 linear passes over pixels
(decode+OKLab, ~24 IRLS passes over two components, one quadrature splat, ~7 separable ladder
convolutions, ~2 medoid passes per candidate over its own basin only) plus one 64³-lattice
smoothing whose cost is independent of image size. **300 px (90k px): ~0.10–0.20 s**, dominated by
decode and the fixed lattice. **3000 px (9M px): ~2.5–4.5 s**, dominated by IRLS and the ladder.
Comparable to P5 (0.35 s / 4.2 s, `p5-fieldfit/STATE.md` §1). The branch-and-bound election is
negligible (P6 visited 5–249 nodes of 280M).

## 8. Expected failures and falsifier

**Expected bad at:** photographic and dense-illustration covers where the affine fit explains
little, so the whole palette rests on the mark subsystem alone (P5's item-6 class, no structural
answer here either); faces and figures read as field; frames and bars; and any judgment that is
semantic rather than spatial ("its presence in the artwork looks accidental", pair-023). I expect
accent to remain the least stable role.

**Falsifiers, pre-registered.**
1. **Quadrature inertness.** Halve and double the lattice spacing. If any palette on a 100-cover
   sample moves beyond the regional bar, the lattice is a decision device and the design is refuted
   — this is exactly P6's measured failure ("cellsPerBandwidth coarser moves 17% of palettes").
2. **The seed's own premise.** Set every deadband to 3× its measured perturbation spread and run
   the harness. If `dither-lsb1` agreement does not clear ~90%, then the instability is *not*
   near-tie-shaped, margins do not fix it, and this design is wrong rather than under-built. This is
   the falsifier I care most about, because it tests the thesis and not the implementation.
3. **The field premise.** If the first reviewer round draws "that is not the background of this
   artwork" on half or more of the items, then "the field is what a robust affine fit explains" is
   false for album art, and no amount of building fixes it.

A first round that comes back weak on *identity* (missing colours, wrong ink) would mean under-built;
weak on *fields* would mean wrong.

## 9. Build plan

- **Stage 1 (~3 days) — palettes in front of the reviewer.** S1–S5 plus a placeholder figure rule
  (highest-salience mark for foreground, second family for accent) and the contract feasibility
  check. This already exercises the largest complaint class (fields), the gradient boolean, and the
  collapse machinery, and it is the half with the strongest robustness evidence behind it. Run
  falsifier 1 and the harness immediately; a first 8-item round at the end of the stage.
- **Stage 2 (~4 days) — the figure subsystem.** `S`, medoids, the three descriptors, bar-merging,
  and the lexicographic cascade with deadbands measured from stage 1's harness run. Run falsifier 2.
  Second reviewer round: the ink and identity classes.
- **Stage 3 (~3 days) — relational and contract polish.** Mode-connectivity distinctness, guide-stop
  insertion, the tree-of-shapes reachability backstop, the escape path, the enclosure mitigation for
  frames. Third round mixes returning covers with fresh draws (the fresh-cover draw is load-bearing,
  not hygiene — the dev-set trap emerged within ~3 rounds in Phase 2).
- Stageable later: the enclosure/frame work, the second field component, and geometry reporting.
