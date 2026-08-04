# Round 1 verdicts (phase2-cal-003, released 2026-08-04T21:16:32Z) — mapping to actions

Re-verified against the warehouse directly (final rows match the analyst relay verbatim; 8/8
released, 0 vetoes). Grades: 3 strong / 2 acceptable / 3 weak / 0 unacceptable.

One nuance from the append-only trail (recorded, not weighed as a verdict): item-00's superseded
revisions flagged accent readability too ("foreground and accent are hard to read", "foreground is
hard to read on top of accent") before settling on foreground-only — weak corroboration of
item-07's accent complaint.

## Evidence → action

1. **Ink-regime fg readability (00 weak, 02 weak: "foreground is hard to read on top of
   surface").** 0.2.0's min-ramp |APCA| re-ranking covered only the LUMINANCE regime; the ink
   regime publishes its cascade with contrast entering only via near-zero verification floors.
   And item-02's fg is `#c8c8c8` where the cover's ink is black — the cascade landed mid-tone,
   i.e. the same cascade-over-a-bimodal-band defect the robustness work suspects (W6b probing).
   → 0.3.0: lump-aware cascade (land in the dominant density lump, never straddle the gap) in the
   ink population; min-ramp |APCA| feasibility pressure on ink output. One fix, two symptoms
   (quality + robustness) — pending W6b's numbers to confirm the bimodal mechanism.
2. **item-19 (acceptable): reviewer prescribes fg↔accent ROLE SWAP** (fg should be black, accent
   white; bg/surface ratified). Ordering evidence, not extraction — both colours were published.
   → 0.3.0: post-assignment comparator — if the accent-candidate strictly exceeds the
   fg-candidate on min-ramp |APCA| and each clears the other's qualification, swap roles. Scalar
   comparisons only; inside the line. Also consistent with the campaign's black-text→black-fg
   identity evidence.
3. **item-07 (weak): "accent is hard to read on top of surface or background."** The accent
   ordering has no contrast term; the contract's accent metric is APCA over the rendered ramp.
   → 0.3.0: accent gains min-ramp |APCA| feasibility (mask, per contract metric); the
   lexicographic ordering stays.
4. **item-11 (strong): "i'm not sure i recognize a gradient in that artwork"** — the
   pre-registered false-gradient watch TRIGGERED (hedged, zero grade cost). Per the watch, ρ*
   calibration jumps the queue. → 0.3.0: measure the Spearman/ρ distribution over a coverage-set
   slice, set a provisional ρ* above item-11's value with provenance; PROPOSE to main: a small
   flat-vs-gradient pairwise round (arm-d §4's proper anchor). item-02's gradient drew no
   complaint — one point each way.
5. **Contradicted predictions, recorded:** item-12's collapsed-surface-on-white drew no
   complaint (strong); item-05's fg `#d69a8f` on saturated blue drew no complaint (acceptable).
   Both were branch-(c) predictions. Do not fix what the judge accepted.
6. **item-14 strong (near-neutral, single side)** — branch (d): suggestive only. Carry the
   proposal: pairwise round on near-neutral covers, the two polarities as the two sides.

## Branch outcomes

(a) not carried (ink trio weak/strong/acceptable); (b) does not fire (no unacceptable, weakness
not class-localised — but note it spans 3 of 5 classes); (c) fires via notes (all mapped above);
(d) fires, suggestive; (e) false-gradient triggered, twin-sibling did not.

## 0.3.0 scope (dispatch after W6b's attribution lands)

Items 1–3 above + provisional ρ* with measurement + honesty tagging pass over src/ (4.1%
documented is the current lower bound). Then: full robustness re-measure, falsifier re-run,
round-2 staging.
