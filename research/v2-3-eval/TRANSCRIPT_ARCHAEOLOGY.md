# Transcript archaeology — what the raw session record holds that compressed memory lost

An agent read the complete raw transcript of the v2-3 campaign session (9,240 lines,
Jul 30 → Aug 2, 2026; 130 human messages, 513 assistant reports) against the field guide
and the verdict warehouse, and reported everything the orchestrator's context compression
had dropped, flattened, or inverted. The field guide (revision 2) has absorbed the
corrections; this file preserves the full findings, most importantly the standing-asks
ledger (§E) that the close-out plan draws from.

The five categories: (A) reviewer statements not captured elsewhere, (B) ideas proposed
and never pursued, (C) incidents with generalizable lessons, (D) findings contradicting
the guide's first draft (all now corrected in revision 2), (E) named artworks with
unresolved asks.

---

## A. Reviewer statements not previously captured

- **A1. The warehouse holds censored, relative judgments.** "Careful if trying to set
  weights based on the warehouse, it may not contain the *best* palettes for each reviewed
  artwork (even when tagged 'strong', when presented with a better palette the human
  reviewer may change their mind), and also it is possible to have several equally valid
  strong or acceptable palettes." Derived rules: a reviewed palette is never a regression
  target; the only usable fitting signal is pairwise preference among the pair actually
  shown; "equal" verdicts contribute no ordering constraint; objective-vs-verdict
  disagreement is a review item, not a fitting error.
- **A2. The areal-constants refutation is contested as a protocol defect.** "It seems
  normal that scale-dependent metrics would change when we convert them if we have
  calibrated all our weights on the former. We might need a re-calibration… this seems
  more like a protocol defect than a real math defect." Conceded; a joint
  convert-and-recalibrate test was designed (task #47) and never run.
- **A3. Three reasons for small frequent reviews** — witnessing progress, catching issues
  before time is sunk, and compounding the warehouse toward autonomy — plus the rationale
  for parallel arms: staggered arrival at the review gate, not throughput.
- **A4. Correction epistemology.** Fuzzy comments preferred over exact suggestions ("might
  feel like biasing a little bit too much towards a specific result"); corrections are
  endorsed samples, not oracles; the reviewer must be able to preview any palette they
  assemble.
- **A5. The winner-stage-policy principle originated with the reviewer**, reading a blast
  radius: "let's just not do that, and prevent them at the last minute."
- **A6. Idle-time rule:** when blocked on agents, serve fresh artworks — discovery or
  dataset growth, never idle.
- **A7. Machine discipline:** one corpus sweep at a time, few workers, VIPS_CONCURRENCY=1,
  checkpoint-resumable sweeps, background work yields when arms are funded.
- **A8. Never block on a human-held credential** — queue commits/pushes, keep working.
- **A9. Before funding a mechanism, ask whether a one-constant change captures the win**
  (the reviewer's endpoint three-way ablation instinct; it killed the cheap hypothesis
  with −5.8%).
- **A10. "Can FAMILY_BIN_STEP be solved with colorimetric maths?"** — it could; 0.04 was
  derived, validating the inherited value across ~95% of color decisions.

## B. Ideas proposed and never pursued (ranked)

- **B1. Multi-stop gradients by spatial-t regression + Douglas–Peucker with an MDL stop
  penalty** (literature item I7). Stops are observed input pixels by construction; MDL
  prices gradient claims symmetrically (principled neutrality); acceptance statistic p95
  per-pixel ΔE. Target set includes every standing multi-stop ask (E1, E2).
- **B2. Identity-coverage as a first-class signal** — the reviewer's most frequent
  complaint class (27 notes); still reaches the winner only bundled inside another term.
  Held behind an arm queue and forgotten. Largest single unmined idea.
- **B3. The candidate↔fit binding arm** — the best-diagnosed unbuilt mechanism: the
  reviewer's endorsed three-stop colors are literally buildable at zero blast radius; the
  wall is that the winning palette carries its own fit's band and the evaluation never
  sees colors living on a different fit. Pre-flagged traps: don't select by contrast;
  don't resurrect the batch-12 midpoint refusals.
- **B4. `additionalGeometries` still hardcoded off** — measured at 18/101 artworks
  changing (all toward more gradients, +74% runtime), never adjudicated.
- **B5. Detected gradient geometry is discarded** — 7 of 9 dev-set gradient winners
  detected radial, rendered as fixed 135° linear; the radial detector itself likely dead
  code (bounding-box position bug trips the spatial-gap gate).
- **B6. The indistinct-fraction statistic** — continuum length of ramp below the contrast
  adequacy bar; validated against the reviewer's own language (loups 31%, birdsofprey
  43%); never shipped for lack of a gate to serve.
- **B7. Helmholtz–Kohlrausch correction** — APCA doesn't correct for it; the bias is
  largest and hue-dependent exactly at this project's low-contrast operating range.
- **B8. The chroma bin-grid origin defect** — neutral axis sits on a bin boundary; pure
  blacks/whites flap 50% of pixels under one-bit dither. Cheap partial fix for encoding
  sensitivity.
- **B9. Machine-curated outlier mining** as standing review practice (accidentally
  validated: 25% defect rate inside one incidental detector's picks).
- **B10. `representativesPerRole = 2`** — named "the real blocker" by two arms, never
  relaxed.
- **B11. The 0.028-vs-3.3 ruler conflict** — an unreviewed OKLab literal overrules the
  reviewed same-color bar in one path; well-posed, output-moving, undone.
- **B12. The typography detector penalizes large type** — directly fighting the "giant
  display text is the foreground" rule.
- **B13. Whole-palette relational properties beyond gamut coverage** — foreground-ness as
  separability, surface-ness as support; 16% of corrections are pure permutations of
  published colors.
- **B14. Spatial-progression check for the endpoint walk** — designed, confirmed on one
  loss, never built.
- **B15. The scoped grain successor** — merge only the two single-grey bins; one-week arm
  with a stated firing trigger.
- **B16. Deleting the measured-inert weight layer** — still shipping.
- **B17. The ±1-LSB perceptual calibration item** — promised twice: if the reviewer can't
  tell the inputs apart but palettes differ, the ε=0.04 significance bar overstates
  instability.
- **B18 (condensed).** Pixel-level least-squares gradient fit; phantom sign-flip fix
  (birdsofprey zero-clamp plateau); T50 polarity-degeneracy detector; hue-direction
  support prior + log-det/DPP diversity; convex-hull direction generator; Immerkær texture
  gate; FH merge predicate; granulometry; MSER stroke variance; slate relaxation (4→8
  seats, delete reserved-seat patches); peripheralCoverage alternative; 60° cross-hue
  legacy proxy; all-neutral spot-check; "slight gradient with the background";
  midpoint-position banding; "wanting both hues"; designed elicitation with the Lc
  13–24.3 empty band; the n=75 calibration protocol (specified, never run); family
  partition replacement (root cause of encoding chaos; a campaign decision, not an arm);
  hue-conditional APCA (closed as "a solution without a case", untested).

## C. Incidents with generalizable lessons

(Absorbed into field-guide §8; kept here as the incident ledger.)

C1 uncommitted policy invisible to worktree agents (bit three times). C2 `git apply
--3way` fails partially and silently. C3 frozen guardrails go stale (one long-protected
guardrail had been reversed by a later batch). C4 guardrail verdicts carry less weight
than assumed (32 one-palette "strongs"; one unreviewed fixture killed six mechanisms; 22
"strong" artworks carry open asks; agents self-document rule-driven kills). C5 the ASCII
tie-break: diagnosed day one, measured at 55.85%, never fixed, no relabel-invariance test.
C6 silent white alpha-flatten decides every transparent artwork's field. C7 the review UI
couldn't record gradient objections — all 14 gradient notes pointed one way. C8 a
four-arm thread founded on a flag-contaminated replay (the motivating accent didn't exist
in the pool). C9 additive mechanisms silently evict candidates under a cap. C10
separately-approved mechanisms don't compose without a composition batch. C11 asymmetric
mechanisms need censuses, not batches (vividness deleted accents on 31.5% of touched).
C12 records rot; re-derive before reviving. C13 the orchestrator's own algebraic shortcut
was wrong in the dangerous direction (APCA non-monotone). C14 enlarge the artwork before
calling a regression. C15 sweeps perturb non-tunable math and typed parameters (1,196
silent failed cells). C16 the CPU profiler misattributes by 4× after passes. C17 verify
against the configuration, not the branch. C18 the big-swing protocol (census →
destination adjudication → sampled batch). C19 orphaned subagents deliver to the wrong
parent; relay or lose findings.

## D. First-draft contradictions (all corrected in field guide revision 2)

D1 five-point contrast sampling is accidentally exact (the guide had claimed the
opposite); the real hazard is phantom flips across APCA's clamp plateau. D2 "ranking, not
generation" was retracted — candidacy is the wall (0 of 19 publish). D3 the graveyard 21%
is the revivable-candidate share, not a win rate; adjudication mostly produced closure.
D4 vividness direction endorsed 4:1; the deletion side rejected 7:1; 31.5% of touched, not
of corpus. D5 early-stopping figures: 335/335 across six orderings at ~47% skip; 43% is a
stricter variant; census-prune saves 24%. D6 four perf passes ≈5.7× cumulative (not two at
1.86×); "~45% of extraction was recomputation"; 0.7 s is the median, mean 1.29 s. D7 the
~97% needs its noise band (35% clean strongs, ~62% strong rate, 88% regrade agreement,
rendition-scoped). D8 stability: "stable per file, sensitive per encoding, scoped per
rendition"; ±1-LSB changes all 114 test palettes; 72.8% re-encode agreement; ~67%
cross-rendition ceiling. D9 the 0.04 bin step is derived, not merely pinned. D10 the
ontology had not closed (two new structural classes on the final day). D11 the mature
integrations were big-swing censuses, not tiny radii. D12 the gamut-coverage axis (AUC
0.872) was missing from the evidence inventory. D13 the literature skeptical-flags table
was missing. D14 the overfitting diagnostic (1.61×/2.50× reviewed-vs-unseen; 908 sites vs
11 anchors; fragility⊥pins) was missing. D15 the weight-fitting null (54 constraints vs 12
coefficients; held-out 66.7%→51.9%) was missing. Numeric drift: repair fixes 15 (23 with
midpoint protection); wide guard 148/149; loups Lc 8.4 anchor; floor sweep 0/0/7/29 over
floors 0/5/9/15.

## E. Named artworks with unresolved asks (the standing-asks ledger)

Ranked by strength of mandate:

1. **ab67616d0000b2730009d178a401f9433fdddff2** — the black-bar / carpaccio-red rich
   gradient. Asked three times in nearly the same words; fully diagnosed (midpoint
   machinery finds the red; the black bar wins the background so no gradient fires; its
   background/surface "are wrong first").
2. **ab67616d0000b27300127e4552b22c761d50c8f5** — Bleu Ciel → Linen → Amber three-stop.
   Asked twice; colors proven buildable at zero blast radius; wall = candidate↔fit
   binding (B3).
3. **ab67616d0000b27300093ce40fe3f073dcd87ab5** — white foreground + #34bbeb cyan accent;
   corrected identically three times (cs2, rmi, geeg). Gradient side now settled; role
   side unpaid.
4. **ab67616d0000b273000a392cb5a08d9801562845** — sunbeam-yellow giant-text foreground;
   asked twice; violates the reviewer's own established rule.
5. **horrorwood, nada** — promised "the natural next batch items"; never served.
6. **Four knowingly-shipped accent regressions** from the accent-evidence integration
   (doja, the "dull surface" artwork, horsley, +1) — reviewer-confirmed, accepted as
   costs, unrepaired.
7. **Two composition-drift accents** — vivid green #1eb721 and fire red #fa1903, both
   previously adjudicated wins degraded by a composed integration; flagged, never
   followed up.
8. **Drift tail casualties** — 0db903 (bg/surface swap vs its calibration-2 orientation)
   and 0f58e7 (churned to unendorsed orange/rust). Detected by repeats, never repaired.
9. **ab67616d0000b2730013095d1c1a5350d21f448d** — fresh sky-and-grass instance the
   reviewer doubts ("very significant straight line separation between linen and green");
   the confirming example the gradient-semantics null waits for.
10. **0d5cdb** — gold delivered; "this time with the original red" restated; foreground
    side-effect proven non-separable.
11. **10b864** — "the dark-blue problem child," five batches, unresolved.
12. (Condensed) marmalade #ee7326 (thrice-confirmed, unreachable-on-principle); krafty's
    Golden Mango foreground (unreachable without crossing johns); 0cd48f's "unpaid teal
    debt"; 0f8156 pink-vs-brown (candidacy); nobs' white foreground (held against three
    mechanisms); infected's blue ("no measurable property" separates it); 000eaebc73
    ("the only artwork whose best-known output you've never liked"); 1031d1 (honest
    regression served deliberately, never explained); the calibration-3 "weird artifact";
    the cream artwork (the open case in the 17/18 gradient record); Equestrienne's
    transition-zone plum-mauve; 03e50500's orange-gold; the Halo-on-midpoint question;
    plus banked final-review corrections (Leaf Bud; Snow-vs-Linen; green-to-red and
    paddock→flame-scarlet gradient ideas; teal/magenta whole-field ask; two strong-artwork
    movers with unjudged destinations).
