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
