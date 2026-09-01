# `cs-batch` — review manifest (10 items)

**Arm:** `chromatic-surface-supply` · **Trunk:** `3d43e2b` · **Branch:** `worktree-agent-ae3c857a6e3b14f80`
**Labels:** `cs-off` (= trunk, proven byte-identical) vs `cs-on`
**Full record:** `research/v2-3-experiments/chromatic-surface-supply/EXPERIMENT.md`

## What this batch asks

Both sides are real algorithm output on the same image bytes. One side is today's algorithm exactly;
the other adds **one** thing — the ability to offer a colour as the **surface** even when that colour
is not a spatial region of the artwork's field. Today every background/surface pair is built from
field regions only, so a colour that is "a supporting colour" rather than "an area" can become the
accent or the foreground but can never become the surface, no matter how important it is.

> When a palette's surface is collapsed or grey and the artwork has a strong supporting colour going
> spare — should that colour be allowed to become the surface, and did we pick the right one?

## Honest notes — read before reviewing

1. **Four of the ten items are here because I think they may be wrong**, not because they look good.
   Items 4, 5, 7 and 8 are the ones I would bet against. Please judge them as harshly as they
   deserve — a bad result on them is more useful to me than a good one on the rest.
2. **Item 4 is the arm's weakest delivery.** It does lift the collapse, but it may have put a colour
   into the surface that belongs in the accent. If that is what you see, say so plainly.
3. **The mechanism can only ever add a distinct surface, never remove one.** So it lifts collapses
   and never imposes them. If you think an artwork was right to be collapsed, that is exactly the
   signal I need — it cannot be read off the numbers.
4. **Gradients are untouched.** Across 63 artworks, zero gradients were gained and zero were lost.
   Nothing in this batch is a gradient question.
5. **The change only ever *adds* options.** Every palette today's algorithm could reach, it can still
   reach — verified as an exact set comparison on all 63 artworks. So a difference you see is the
   algorithm *preferring* something new, never being *deprived* of something old. An earlier version
   of this change did not have that property, and one item in the earlier draft of this batch turned
   out to differ only because of that flaw; it has been removed and replaced by item 10.
6. **Blinding balance:** `cs-on` is side A on 6 items and side B on 4. The batch name is shown to you
   but encodes nothing about which side is which.
7. **Corrections are samples, not oracles.** "One palette you'd endorse" is one valid answer among
   possibly several — I use it as a destination to aim at, never as the only right answer.
8. Two items (9, 10) are **fresh artwork no review has ever seen**. Nothing is being defended there;
   they are in to check that this does not misbehave off the panel.

## Items

| # | artwork | standing verdict | what moves (`cs-off` → `cs-on`) | why it is here |
|---|---|---|---|---|
| 1 | `0001c404…` | **weak-fallback** (`sr-batch`), corrected twice | surface `#070908` → `#086a43` (collapse lifted, green); accent `#055226` → `#cfc497` | The arm's flagship. You asked for Woodland Green **as the surface** twice, most recently after the accent work. The new accent is ΔE 2.1 from the cream you drew; the background and foreground match yours. Is the green surface right, and is it the right green? |
| 2 | `000acce6…` | acceptable (`calib-batch-3`) | surface `#4a4d52` → **`#7f80ac`** (exactly your correction); bg `#353537` → `#373737` | Your endorsed sample moved the purple from accent to surface. This produces that surface **exactly**. The accent it picks instead (`#696b91`) is not the teal you drew. |
| 3 | `000b5fe0…` | **weak-fallback** (`batch-33`), **unacceptable** before (`batch-32`) | `#f3f3f3 #f3f3f3 #012943 #0171bb` → `#010101 #fb1b1c #f3f3f3 #032842` | You rejected the white-on-white reading twice and drew a black background, blue surface, white foreground, red accent. This gets your **background and foreground exactly**, but puts the red in the surface and the blue in the accent — your two colours, swapped. Better, worse, or still wrong? |
| 4 | `0007447d…` | acceptable (`batch-34`, gradient side) | surface `#131313` → `#872b74` (collapse lifted) | **The item I trust least.** You asked for a "dark muted purple surface" and a bordeaux accent. This produces a surface that is ΔE 7 from the *bordeaux you wanted as the accent*, at high chroma. I suspect it is the right colour in the wrong role. |
| 5 | `0003e505…` | **strong** (`batch-28`) | surface `#152312` → `#496036` (chroma 14 → 27) | **Adversarial.** You graded this strong and your endorsed sample moved the surface toward a *paler* green. This pushes it the opposite way. If that is worse, this is the clearest evidence that the mechanism over-saturates. |
| 6 | `000442ca…` | strong both sides (`batch-30`) | surface `#0d140d` → `#0b2b13` (collapse lifted) | At `batch-30` you said "weak preference for option B, even better if option B is a gradient" — B had a separated dark-green surface. This lands ΔE 2.5 from that colour, i.e. the same colour. Does the weak preference hold up? |
| 7 | `000db903…` | acceptable (`batch-34`, flat side) | surface `#8ad1cd` → `#eac22d` (teal → yellow) | **Guardrail.** One of the three artworks you said must stay flat. It **does** stay flat — but the surface changes hue completely. Does the yellow represent the artwork better or worse than the teal? |
| 8 | `000f58e7…` | acceptable (`batch-31`, `calib-batch-1b`) | `#f99c3d #b7452b #171c16 #62478a` → `#1a1c1b #df5d29 #fba037 #62478a` | **Adversarial, biggest change in the batch.** Background and foreground effectively swap roles. Twice your endorsed sample for this artwork collapsed the surface away entirely, so I expect you to dislike at least one of these. |
| 9 | `02/…00020034…` | none — fresh off-panel | surface `#172027` → `#e7072c` (collapse lifted, vivid red) | Fresh artwork, no prior verdict, nothing defended. Does lifting a collapse to a vivid red read as the artwork, or as an invention? |
| 10 | `0e/…000e0079…` | none — fresh off-panel | surface `#3d4e60` → `#4dabc7`, accent `#4dabc7` → `#3d4e60` — **a straight swap** | Fresh artwork, no prior verdict. The cyan the palette spent on the accent becomes the surface and the muted slate takes the accent — the same move you asked for by name on items 1 and 2, found on an artwork nobody prompted it with. The cleanest test of whether the class generalises. |

## Serving

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts cs-batch
```

## What each outcome commits us to

Decided before the batch is seen.

- **`cs-on` preferred on items 1 and 2, and no worse than `cs-off` on items 4, 5, 7, 8.**
  The supply defect is confirmed fixed and the mechanism ships as-is, pending the corpus-scale sweep
  in EXPERIMENT.md §7. The residual becomes a chroma-calibration question inside the
  `surfaceContribution` weight, handled as a follow-up, not a re-design.
- **`cs-on` preferred on items 1 and 2, but harmed on two or more of 4, 5, 7, 8.**
  The mechanism is right and the *choice of ground and colour* is wrong. Do not ship. The next arm
  narrows which grounds the seat may pair against, using the destinations from this batch as
  evidence — and it will have a real threshold question, which this arm does not.
- **`cs-off` preferred on item 1 or item 2.**
  The class is refuted at its two strongest cases. Close the line and record it in the graveyard —
  the reviewer named the colour and the role on both, so if delivering them is not an improvement,
  nothing weaker in the class will be.
- **Split with no pattern.**
  Treat as unresolved, keep OFF, and spend the next batch on chroma alone: the same artworks with the
  `surfaceContribution` weight halved, so the arrangement is held constant and only vividness varies.

## Revert rules

Auto-kill only on movement to a destination already reviewed negatively (charter, 2026-08-02);
movers to unadjudicated palettes go to review. Additionally auto-kill if any reviewed collapse
(`00092c14`, `meteora`, `00015a7a`, `000955cc`, `0003580b`) moves in the corpus-scale sweep — none
moved on the 49-artwork panel. Reverting is deleting `CHROMATIC_SURFACE_SUPPLY`,
`chromaticSurfaceProposals`, `reserveChromaticSurfaceSlot` and the `surfaceEvidence` field from
`research/v2-3/src/internal/palette-core.ts`, and restoring the four lifted constants to literals.
