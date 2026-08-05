# P3 review-round queue (rulings 2026-08-04)

1. **round-2-calibration** — after W8 (0.3.0) + full re-measure. Re-grade the round-1 failure
   classes on the new candidate: the two ink covers (00, 02), the accent cover (07), item-19
   (swap check), plus fresh covers for breadth (4–10 items total; fresh items drawn from BEYOND
   demo-20 — coverage-set — per the overfitting flag that fired for P5, EVIDENCE item 9).
   Question: did the evidence-driven fixes move the grades without breaking what was strong.
   Watch: any "that colour is just a shadow/artifact" note = the salience principle firing on us
   (EVIDENCE item 6); the 00/02 grades arbitrate identity-vs-legibility (EVIDENCE item 8).
2. **flat-vs-gradient pairwise — APPROVED, stage after W8's re-measure** (main's recommendation,
   adopted: the pair selection needs 0.3.0's Spearman distribution data anyway, and the round
   then anchors the live ρ*). ~8 pairs, same artwork flat-vs-gradient as blinded sides,
   borderline covers chosen from the measured ρ distribution. Pre-register the question
   version-independently ("does this artwork read as shaded/graded or flat?" — an artwork
   question whose answer calibrates any version's ρ*). Staging protocol as round 1; Opus
   installer on main's side handles push + verification.
3. **near-neutral polarity pairwise — APPROVED 2026-08-05 (after round-2 landed), staging as
   round-4.** ~6 tie-band covers, two polarities as blinded sides, palettes from PINNED
   5a4f845 code (dev-only polarity override lives in the pinned copy only — live src is under
   0.4.0 edit). Decision rule pre-registered in its ROUND.md.

Standing: rounds are 4–10 items; every forced choice carries an escape; blinded side-cars; the
batch log is never read while a batch is open.

**Verdict-ingestion protocol (reviewer ruling, main commit 735024a):** on release, main sends a
content-free "batch <id> released" signal only. This orchestrator then spawns its own Opus
analyst — released warehouse payload + server batch log (readable post-release) — verifies the
decode against ROUND.md's outcome branches, and acts. Cross-arm evidence goes upward only through
§7 reports. Multi-prototype rounds remain main-tier.

**Staging convention (from the round-4 install, 2026-08-05):** emit ARTWORK CONTENT STEMS
(basename of imagePath, 32/40-hex) as itemIds directly at staging time — no run-ordinal ids —
so the installer never rewrites ids and private↔served mappings stay trivial.

**Purpose + fundedBy policy (main ruling, 2026-08-05):** staging docs declare `purpose: <legal
enum value>` and installers honor it verbatim (round-4's "mechanism" stands as pushed,
append-only; VERDICTS.md is the correction of record). fundedBy stays LINKAGE-FREE while a
batch is open (citing prior batch/item ids is identity information under the blinding
standard); motivating verdict ids are recorded post-release via the release-note amendment
(main-tier). Decode commits remain the canonical chain meanwhile.
