# Round 1 outcome — decoded, verified, and what it decides

**Round `phase2-pair-002`, released 2026-08-04.** Decode verified by this orchestrator
row-by-row: batch-log blinding map (displayed letter → pushed side index, read only after
release) composed with `items.json` pushed-side order, cross-checked against
`mapping.private.json`. All 8 of the coordinator's attributions were correct.

## Verified per-item table (variant → candidate: v1 = p2-alpha, v2 = p2-tos)

| item (suffix) | class | p2-alpha | p2-tos | preferred |
|---|---|---|---|---|
| …f39d397ba3 | partitioned | UNACCEPTABLE (fg/accent invisible on surface) | ACCEPTABLE (a little flat; bg imposing) | tos |
| …ca2eff2a4a | flat | **STRONG** | ACCEPTABLE (fg/accent shade not exact match) | alpha |
| …d859a69094 | laminar | UNACCEPTABLE (fg unreadable) | ACCEPTABLE (black is the artwork's text → fg should be black) | tos |
| …21256ce593 | unreadable | UNACCEPTABLE (surface≈accent — **forbidden**) | WEAK (surface/bg don't match artwork) | tos |
| …35b967964d | textured | WEAK (accent wrongly collapsed — vivid red-orange missed; fg shade not in artwork) | UNACCEPTABLE (fg indistinguishable) | alpha |
| …5a94002abc | laminar | UNACCEPTABLE (identity missing, weak contrast) | WEAK (white fg would match identity) | tos |
| …dd225466f4 | laminar | WEAK | UNACCEPTABLE | alpha |
| …c5ac790164 | laminar | UNACCEPTABLE (fg unreadable) | WEAK ("almost very good, but this artwork is flat, not a gradient" — **phantom gradient**) | tos |

Aggregate: preference tos 5 – alpha 3. Grades: alpha {1 strong, 2 weak, 5 unacceptable},
tos {3 acceptable, 3 weak, 2 unacceptable}.

## Same-day instrument picture (cycle-1 crudeness, both families)

| | p2-alpha | p2-tos |
|---|---|---|
| robustness overall (600 trials) | 37.8% [34.0–41.8] | 12.0% [9.6–14.8] |
| jpeg-q92 | 64.0% (incumbent anchor: 72.8%) | 12.0% |
| dither-lsb1 (pre-reg line >10%) | 37.0% — **fired** | 34.0% — **fired** |
| endorsed-colour node reachability | 57.4% | 86.6% |
| pre-reg reachability falsifier (>25%) | 6.4% — not falsified | 3.4% — not falsified |

## Decision (per ROUND.md's pre-declared outcome plan, now confirmed three ways)

**Tree of shapes is the family carried forward. p2-alpha is demoted to reference** — kept
runnable for comparison, no further investment. Reviewer evidence, robustness, and
reachability agree; no instrument dissents.

## Cycle-2 obligations from the reviewer's notes (via the main orchestrator)

1. **Foreground readability is the dominant failure class** (7 of 10 unacceptables across
   sides). Adopt APCA-over-rendered-ramp foreground ranking; graft arm-b's text detector.
2. **Forbidden outcome named:** indistinguishable sibling pairs must collapse — never publish
   twins. Enforce as assembly machinery, not a hope.
3. **Phantom gradient** (tos, flat artwork): the laminarity cut is now reviewer-priced;
   calibrate before publishing more gradients ([UNCALIBRATED] → measured or reviewed).
4. **Artwork identity binds:** vivid accents must be mined (…35b967964d's missed red-orange is
   the hue-anchored-supplementation recall case P2 must re-earn); exact shades; the artwork's
   own text colour (e.g. black) is the foreground's first candidate.
5. **Dither falsifier fired for BOTH families (34–37%)** — the shared representative rule /
   small-node churn is the suspect, since it is the one component common to both. Diagnose
   before patching.
