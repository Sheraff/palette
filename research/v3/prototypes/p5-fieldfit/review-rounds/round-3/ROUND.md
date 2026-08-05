# P5 round 3 — the component field reading, judged mostly on unseen covers

**Proposed kind:** calibration (grade 1–4, veto, per-item `f` notes). **Item count:** 8.
**Source:** fresh runs of `p5-fieldfit-0.5.1` at staging time. Round-2's overfitting flag binds:
**5 of 8 items are fresh draws** — the rulings were derived from demo-20 + round-2 covers, so the
round's weight sits on covers no ruling has seen.

## The questions this round answers

(a) Does the component field reading (v0.5) produce the identity the reviewer asked for — the
sunset's gradient, the painted sky, vivid fields — on its evidence covers *and* on unseen covers
of the same classes? (b) Does the identity-first accent/foreground policy (v0.4.x) hold up off its
training evidence? (c) The white question, third pass: `2376a6b67d` now carries the artwork's
white as *surface* — is the palette complete in the reviewer's eyes?

## Composition

| # | cover | why | grade informs |
|---|---|---|---|
| 1 | `16a8247378` (returning, R2 UNACCEPTABLE) | painted autumn sky now carries the field via the decoupled smooth gate (pass-9 verified) | the smooth-gate ruling on its only evidence cover |
| 2 | `908479200b` (returning, R2 WEAK ×2) | the sunset now publishes its gradient (`#7a545f→#fd7b61`) | E2's motivating reading; "we would expect such a gorgeous gradient" answered directly |
| 3 | `2376a6b67d` (returning, R2 WEAK) | white now in the palette as surface; accent is the known near-black residual | whether the identity set is satisfied; more formula-calibration evidence if the accent note recurs |
| 4–8 | fresh, staged by census | one painted/textured-field cover; one panel/two-component cover; one vivid photograph; one light-field-with-light-text cover; one high-chroma gradient cover | each ruling's class, unseen |

Staging picks 4–8 from coverage-set-1 by stated input-only criteria (census statistics named
before ranking, no palette computed before selection, holdout excluded by id and path, demo-20 and
round-2 artworks excluded). Record rules, pools, runners-up, and diagnose JSONs in STAGING.md —
diagnostics never enter the payload.

## What we do differently per outcome

- **(1) or (2) still 3+** → the component reading fails its motivating evidence; E2 goes back to
  mechanism (component role assignment, not gate values). Graded 1–2 → smooth-gate and E2 stand.
- **(3) accent note recurs on the near-black pair** → third strike for the formula near black;
  compiled with the measured ratios (6.6, 11.4) into the upward calibration packet. Palette-level
  grade improves → white-as-surface accepted; the criterion question closes.
- **(4–8) at parity with returning covers** → rulings generalize; the next cycle is the cost pass
  + robustness stabilization, then bake-off prep. **Markedly worse** → the rulings overfit two
  review rounds; the cycle re-opens on whichever class failed, and round 4 goes wider still.
- **Any fresh cover exposing an absurd component** (texture qualifying as field) → the 0.4 gate
  moved too far; it has one evidence cover, so one counterexample re-opens it.

## Blinding

As rounds 1–2: payload and side-car carry palette + render data only; no version labels, no
diagnostics, no mechanism names, no returning/fresh framing. The mapping stays in this file.

---

# APPENDED POST-RELEASE — verdicts (`phase2-cal-013`) and rulings, 2026-08-05

**Decode independently re-verified by the P5 orchestrator against the warehouse** (all 8 final
grades + comments match the analyst; distances 0.03357 / 0.04803 / 0.04205 / 0.09197 / 0.08871
reproduce to five decimals). Analyst's full text is in the orchestration transcript.

## Verdicts (final warehouse records; absolute mode; no veto, no confound)

| # | cover | grade | comment (verbatim) |
|---|---|---|---|
| 1 | `16a8247378` (ret., R2 UNACCEPTABLE) | **acceptable** | "- accent is a little hard to see on top of the background / - the gradient might be better with a 3rd or 4th stop added to lead the interpolation through colors that better match the artwork" |
| 2 | `908479200b` (ret., R2 WEAK) | **strong** | *(empty)* |
| 3 | `2376a6b67d` (ret., R2 WEAK) | **acceptable** | "This palette is missing the strong red color. It would make for a good accent instead of having a 2nd shade of black as the accent that is indistinguishable from the foreground black" |
| 4 | `4130886c02` (fresh, textured field) | **acceptable** | "- Ideally the foreground would be white, like the typography of the album title on this artwork / - i wonder if this gradient might more strongly represent the identity of this artwork by using a 3rd or 4th stop (i'm not sure)" |
| 5 | `91a16672c4` (fresh, panel) | **acceptable** | "the accent is a little hard to see on top of this surface" |
| 6 | `9646be9b20` (fresh, vivid illustration) | **unacceptable** | "the Capri blue is used in an incorrect role: on the artwork it is not the gradient but the main typography color / the artwork contains many colors, and this palette is only blue/white/black. The identity of the artwork is not represented correctly" |
| 7 | `a8942d6547` (fresh, substituted) | **strong** | *(empty)* |
| 8 | `757a78343d` (fresh, re-cut gradient) | **weak** | "the accent is very hard to read on top of the background / the foreground should probably be black, like the main typography of the artwork" |

Returning mean 1.67 — **net +5 grade-steps vs round 2, every R2 complaint retired by name**;
fresh mean 2.40; two silent STRONGs (2, 7).

## Confirmed findings (verified where quantitative)

1. Smooth gate, E2, guide-stop/discriminator: **passed** (plan A's graded-1–2 branch; no
   false-gradient complaint on six ramps; the re-cut item-8 ramp drew none).
2. **Role sourcing is the new mechanism finding**: display-typography colour belongs in a
   text-bearing role — publishing it as the field is the only UNACCEPTABLE (6); items 4/8 ask
   fg = type colour; item 7 (fg+accent = the type colours) is the silent positive control.
3. **Identity coverage is a set problem**: item 3's four-colour set rotated (v0.3 red/no-white,
   v0.6 white/no-red, both wasting a role on a near-black fg-twin); two other arms independently
   named the same set on the same cover. Per-role argmax cannot satisfy a set criterion.
4. **Accent-vs-field visibility orders by raw OKLab distance, not bar ratio**: complained 0.034 /
   0.042 / 0.048 (ratios up to 5.2×); silent ≥ 0.092. Contract's own
   `ACCENT_VISIBILITY_COLOR_DISTANCE = 0.07444` separates the batch 8-for-8 and sits inside the
   evidence gap.
5. **Margins are role-aware**: tightest pairs in the batch were bg×surface (item 7 at 1.21× bar,
   STRONG, silent). No uniform margin gate.
6. **Ramp-path identity, not stop count** (cross-arm prior 4 withdrawn as written): interior
   stops should lead the interpolation through the artwork's colours; a stop must carry a colour
   the endpoints do not.
7. **Near-black third strike**: 0.08871 clears both elevated bars (1.19×) and is still called
   indistinguishable → upward packet.
8. Item-8's deliberate 1.46×-bar accent: **rejected** — strongest visibility language of the
   round; distance framing, never family.

## Rulings (v0.7 direction; SPEC edits follow W-P11 collection)

- **R1**: everything under test stands unchanged.
- **R2 (ink-shape sourcing)**: adopt arm-e-r3 §2.4's ink statistics (erosion mortality × ground
  adjacency — shape measurements; only that arm's lexicographic ranking was excluded) as an
  ink-likeness instrument: (a) field-candidacy veto — an ink-shaped extensive component cannot
  carry the field (fixes 6; answers the tripwire by mechanism, not gate value); (b) foreground
  preference — ink-like mass leads among floor-clearing candidates.
- **R3 (accent visibility floor)**: `ACCENT_VISIBILITY_COLOR_DISTANCE` becomes an
  accent-vs-both-field-colours feasibility floor at selection. Role-aware (no bg×surface
  analogue, finding 5). Prerequisite: measure which rule admitted items 1/5/8's accents.
  Distinct from the disavowed fg/accent-collapse use of the same numeral — this is the
  contract's own accent-vs-field constant at its intended site, with 8-point evidence.
- **R4 (ramp-path excursion)**: restore arm-f §2.6's original formulation — excursion from the
  component's fitted path g(t) to the rendered polyline (not distance-to-any-occupied-colour);
  interior stops must carry colours the endpoints do not; spacing floor per the banding prior.
- **R5 (set-level assignment)**: restore arm-f §2.7's joint four-role assignment, set-coverage
  entering lexicographically (feasibility → distinct identity-family coverage → per-role
  criteria) — never a weighted objective.
- **R6**: near-black datum joins the upward formula packet.
- **R7 (round 4)**: widen the light-field draw beyond coverage-set-1 (0/213); targeted item-7
  confirmation question; item 6's cover returns after R2 lands.
