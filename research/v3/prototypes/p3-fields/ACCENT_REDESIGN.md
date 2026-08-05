# Accent redesign note — for 0.4.0 (authored by the P3 orchestrator, 2026-08-05)

## Evidence this answers (all reviewer-verbatim, two rounds + cross-arm)

Seven identity-coverage counts: r2-item-4 ("very distinct purple... we could use instead (as
the accent)"), r2-item-2 ("some pink and blue... missing for a complete palette identity"),
039 ("magenta color / white text"), 208 ("missing the significant yellow (album title, artist
name)"), 130 ("beautiful brown colors (cinnamon, coffee)... would be great accents instead of
Holy Crow black"), 168 ("accent would be better within the blue family instead of... the same
color family as the background and surface"), 188 ("missing some significant colors to reflect
the full artwork's identity"). Plus: r2-item-8 (swap-demoted ex-foreground "very hard to see"
as accent — min-ramp |APCA| matters for accent findability), r2-item-0/round-1 item-07 accent
readability, and the convergent cross-arm diagnosis (another arm's reviewer notes demanded
artwork-membership chromatic accents over its rule's preference; EVIDENCE item 10). Campaign
principles in force: vivid accents mined from the artwork; salience gates identity (a shadow
lump is ineligible); perception-4's direction (at matched distance, lightness-moving accents
function ~2× better — a DIRECTION, never a coefficient).

## Diagnosis of the current design

Tier-1 (lightness-moving) vs tier-2 (chroma-only, fragile) is a TIER WALL: any qualifying
L-moving pixel — typically a grey — beats every chromatic mark by construction. The reviewer
keeps asking for the chromatic mark. The wall inverts the priority the evidence demands, and
the wall (not the ranking inside it) is the defect. Accent is also the robustness-worst role
(69.5% instability; attribution block 22), so the redesign must not add near-tied boundaries.

## Requirements (binding on the implementer)

1. **Chromatic departure leads.** Among qualified pixels (clear the same-colour bar from both
   field ends), the primary ordering is chromatic distance from the FIELD'S colour family —
   chroma-relative-to-field and hue separation, as scalar fields (168's family-separation
   evidence). Percentile products (arm-d′ graft, weight-free) are the sanctioned combination;
   no hand weights, no new exchange rates.
2. **Lightness movement is a tie-break/preference inside the ordering, not a tier.**
   perception-4's direction is spent exactly there. The old tier-1/tier-2 wall is deleted.
3. **min-ramp |APCA| stays a preference** (r2-item-8), same pattern as the ink amendment:
   never an eliminator at default floors, order within the qualified set.
4. **Salience guard:** a candidate lump must be coherent (annulus/ink-style coherence or
   support with spatial spread) so accidental-shadow lumps are ineligible (EVIDENCE item 6).
   Reuse existing scalar machinery; no new detector.
5. **Stability:** selection lands via band-then-cascade in the DOMINANT chromatic lump (the
   e1/e2 pattern) — no single-rank tail reads, no near-tied lump election without the declared
   tie-band + stated-convention pattern already used elsewhere.
6. **The line holds.** Every published accent is an exact pixel; chroma/hue-relative-to-field
   are numbers attached to pixels; no colour-family object is ever materialised as a colour.
7. **Collapse semantics unchanged** (accent→fg when no qualified population survives), and the
   swap comparator keeps operating downstream of the new ordering — re-measure its fire rate
   after (36.4% at 0.3.0; expect it to drop if fg/accent selection improves).

## Falsifier / acceptance evidence

- The seven identity-coverage covers, re-run: the named chromatic marks (purple, pink/blue,
  magenta, yellow, cinnamon/coffee, blue-family) should be published or beaten by something
  defensibly more salient — check each by eye + diagnostics before any round.
- Robustness: accent instability must not worsen (69.5% baseline; attribution block 22). A
  redesign that publishes the right colour unstably trades one graded-down failure for another.
- Round-4 calibration then re-grades a sample of the seven + fresh covers.

## Non-goals

No ACCENT_FUNCTIONAL_DISTANCE resurrection (twice-refused constant); no new review-blocking
bars; no CVD scoring axis; no changes to fg selection here beyond the swap interaction.
