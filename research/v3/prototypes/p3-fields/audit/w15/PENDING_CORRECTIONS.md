# Pending src corrections from the W15 audit (blocked: W13 owns src/ until its gates land)

1. **constants.ts MIN_GUIDE_STOP_SPACING evidence table — strike or re-derive.** W15 replay
   (pinned 5a4f845 + W9 bead404 corroboration): narrowest spacings 048 6.25%, 181 12.50%,
   114 12.50%, 188 6.25% — not the 3.13%/3.13% the table claims for 114/188; the 048 row mixes
   0.4.0 hexes with 0.3.0 positions. The CUT SURVIVES (strict >0.125 rejects all four named
   cases; r2-item-0's independent 3.125% anchor holds) — only the "one grid step is the class"
   argument is struck. Rewrite the comment citing W15's replay numbers.
2. **ACCENT_REDESIGN req 7 partially implemented:** margin FILTERS (>= lump lower-median) but
   never RANKS; cascadePixel ignores margin. Decide in 0.4.x: promote margin into the
   narrowing order (before lightness) and measure accent stability before/after.
3. **ACCENT_REDESIGN req 5 deviation:** "dominant" redefined mass -> higher-departure with a
   LUMP_GAP_RATIO threshold injected into the robustness-worst role — exactly the near-tied
   boundary req 5 forbade without a declared tie-band + convention. Add the tie-band/convention
   pattern or revert to mass-dominant; measure.
4. Cosmetic: gradient.ts halt-reason reports stop-budget when bar-met also holds (diagnostic
   only).
