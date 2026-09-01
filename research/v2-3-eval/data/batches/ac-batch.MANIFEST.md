# `ac-batch` — accent-candidacy review manifest

Arm: `research/v2-3-experiments/accent-candidacy/EXPERIMENT.md`, branch
`worktree-agent-a5161402d51c76cf3`, trunk `277e21e`.

Both sides are **real extractions** produced by the harness's own sweep and written in the
`CachedResult` schema:

- `research/v2-3-eval/data/results/ac-off/` — 223 records, `CHROMATIC_CANDIDACY_RESERVATION = "off"`,
  **byte-identical to genuine trunk `277e21e` on 223/223** (sha256 of the full extraction JSON).
  This is what ships.
- `research/v2-3-eval/data/results/ac-on/` — 223 records, `CHROMATIC_CANDIDACY_RESERVATION = "both"`.

Blinding is the harness's content-derived per-item coin flip: **3 items show `ac-on` as A, 2 show
`ac-off` as A**. Nothing was selected on outcome — the batch is *every artwork in the 223-artwork
corpus the mechanism moves*, all five of them.

## What the arm claims, so the batch can falsify it

The mechanism reserves one signature-lane seat and one identity-obligation place for the artwork's
strongest *chromatic accent claim* (relative chroma × `signatureAccentObservation`). Measured:

- reachability of the reviewer's asked-for accent **doubles, 5/19 → 10/19**;
- publication does **not** follow — 1 delivery in 38 corrections, and that one is against a
  **superseded** correction;
- blast radius **5/223 = 2.2 %**, 0 parity fixtures, 0 gradient flips;
- **all three verdict-carrying movers regress a standing `strong` verdict.**

**The arm recommends NOT enabling this.** The batch exists to test whether "regresses a standing
strong" means "worse to look at".

## Items

### 1. `ab67616d0000b273000d5cdbc67ed815efc360ad`

- side A = `ac-on`, side B = `ac-off`
- `ac-off` (= trunk): `#000000 #000000 #f7de67 #f22632`
- `ac-on`: `#000000 #000000 #c7c6c1 #cd1227`
- moved: foreground, accent · worst-role ΔE 58.5
- standing verdict: **strong** — batch-28, preferred `cr-m1` = the `ac-off` palette (6 records total)
- honest note: the `ac-on` accent `#cd1227` is the hex this reviewer typed as a correction **twice**
  (`review-25-decisions`, `batch-27`), but batch-28 is later and graded the trunk palette strong.
  The `ac-on` foreground `#c7c6c1` is the dim grey he rejected in words: *"The Dim grey feels too
  neutral for this artwork, it is not the focus of it. The gold and red are the important ones."*
  Roles held against the standing endorsed palette: `ac-off` 4/4, `ac-on` 2/4.

### 2. `ab67616d0000b2730009d178a401f9433fdddff2`

- side A = `ac-off`, side B = `ac-on`
- `ac-off` (= trunk): `#000000 #c42a42 #fafafa #15a6a9`
- `ac-on`: `#000000 #ed3358 #fafafa #15a6a9`
- moved: surface · worst-role ΔE 13.6
- standing verdict: **strong** — batch-31, preferred `ra-off` = the `ac-off` palette (5 records)
- honest note: this artwork's salience target (a red the reviewer asked for as the *accent*) becomes
  reachable under `ac-on` but still does not publish; what moves instead is the surface. Two earlier
  rounds asked for a stronger red surface — *"The surface color is a bit weak … carpaccio red or
  punch red"* (review-6), *"it would be stronger with a red surface"* (review-10) — and batch-31
  then graded the current surface strong. Genuinely uncertain which way this goes.

### 3. `ab67616d00001e02001031d1e10290f8e446bd68`

- side A = `ac-on`, side B = `ac-off`
- `ac-off` (= trunk): `#0c070b #25160f #faf3ed #e48068` · gradient
- `ac-on`: `#15090b #1e1413 #faf3ed #e7a37e` · gradient, midpoint `#08080a` appears
- moved: background, surface, accent · worst-role ΔE 17.6
- standing verdict: **strong** — batch-26, with **no side preferred**, i.e. both `x2-off` and
  `x2-coverage` were graded strong (2 records)
- honest note: the `ac-on` accent `#e7a37e` is exactly the accent of `x2-off`, the *other* palette
  batch-26 graded strong — so on that role it moves between two endorsed answers. The field move
  (`#0c070b/#25160f → #15090b/#1e1413`) matches neither graded palette.

### 4. `ab67616d00001e0200060491ade88c8893373d9f`

- side A = `ac-off`, side B = `ac-on`
- `ac-off` (= trunk): `#a07f5e #6a770e #120f16 #c7c3c0`
- `ac-on`: `#a07f5e #6a770e #c7c3c0 #04e3d1`
- moved: foreground, accent · worst-role ΔE 74.5
- standing verdict: **none** — off-panel, no review has seen this artwork
- honest note: the only artwork in the corpus that needs **both** reservations to move. The
  near-black foreground is replaced by the light grey that was the accent, and a vivid teal takes
  the accent slot. This is the mechanism doing exactly what it was designed to do, with no verdict
  to prejudge it.

### 5. `ab67616d00001e02001205216e977f1ac8c6280d`

- side A = `ac-on`, side B = `ac-off`
- `ac-off` (= trunk): `#2e2e30 #2b0303 #fa8f25 #fbe089`
- `ac-on`: `#2d2d2f #fc4f13 #fa8f25 #fbe089`
- moved: background, surface · worst-role ΔE 90.1
- standing verdict: **none** — off-panel
- honest note: the largest mover in the corpus. A near-black surface `#2b0303` becomes a vivid
  orange-red `#fc4f13`. The clearest available read on whether "reserve a place for the vivid thing
  the artwork shows you" is right in principle, independent of the accent question.

## Serving

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts ac-batch
```

## Revert rules

- **The whole mechanism**: `CHROMATIC_CANDIDACY_RESERVATION = "off"` in
  `research/v2-3/src/internal/palette-core.ts` — which is what is committed. `ac-off` is
  byte-identical to trunk on 223/223, so reverting is a no-op on every artwork.
- **Full deletion** (recommended if review does not endorse): remove the constant,
  `chromaticCeiling`, `chromaticAccentClaim`, `reserveChromaticSignatureSeat`, the one `if` in
  `buildNativePaletteEvidence` and the one block in `buildIdentityObligationSelection`.
  One file, +118/−1 in total.
- **If review prefers `ac-on` on ≥ 4 of 5**: do *not* just flip the constant. The delivery
  measurement says the mechanism does not produce asked-for colours; a majority preference would
  mean the reviewer likes reserved chromatic candidacy generally. The follow-up is the
  `signatureRoleScore` arm (EXPERIMENT.md §11.3), with these reservations re-measured on top.
- **If review prefers `ac-on` on items 4–5 but `ac-off` on 1–3**: predicted outcome — right idea,
  wrong site. Close the site; keep the funnel (§1) and the axis diagnosis (§5).
- **If review splits or prefers `ac-off`**: close the site and delete the constant.
- **Regardless of outcome, record a fresh verdict on `000d5cdb`.** Two arms in a row have had to
  reason about a superseded correction on that artwork.
