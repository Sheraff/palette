# P3 review-round queue (rulings 2026-08-04)

1. **round-2-calibration** — after W8 (0.3.0) + full re-measure. Re-grade the round-1 failure
   classes on the new candidate: the two ink covers (00, 02), the accent cover (07), item-19
   (swap check), plus fresh covers for breadth (4–10 items total). Question: did the evidence-
   driven fixes move the grades without breaking what was strong.
2. **flat-vs-gradient pairwise — APPROVED, stage after W8's re-measure** (main's recommendation,
   adopted: the pair selection needs 0.3.0's Spearman distribution data anyway, and the round
   then anchors the live ρ*). ~8 pairs, same artwork flat-vs-gradient as blinded sides,
   borderline covers chosen from the measured ρ distribution. Pre-register the question
   version-independently ("does this artwork read as shaded/graded or flat?" — an artwork
   question whose answer calibrates any version's ρ*). Staging protocol as round 1; Opus
   installer on main's side handles push + verification.
3. **near-neutral polarity pairwise — DEFERRED by ruling, not declined.** Behind round-2; one
   open question per reviewer visit. Re-propose after round 2 lands.

Standing: rounds are 4–10 items; every forced choice carries an escape; blinded side-cars; the
batch log is never read while a batch is open.

**Verdict-ingestion protocol (reviewer ruling, main commit 735024a):** on release, main sends a
content-free "batch <id> released" signal only. This orchestrator then spawns its own Opus
analyst — released warehouse payload + server batch log (readable post-release) — verifies the
decode against ROUND.md's outcome branches, and acts. Cross-arm evidence goes upward only through
§7 reports. Multi-prototype rounds remain main-tier.
