# P3 state — for cross-prototype judgment (2026-08-05)

## 1. Mechanism

Every published colour is the pixel holding a designated rank in per-pixel scalar fields — no
clustering, no candidate set, nothing colour-bearing ever created (arm-d's line, held and
audited twice: HOLDS-WITH-RULINGS, zero violations).

## 2. Judge-validated strengths (round/verdict provenance)

- **Complaint-to-fix cycle closes.** Round-1's three weak covers re-graded STRONG in round-2
  (phase2-cal-006, 4/4 re-grades up, zero repeat complaints) — ink-regime black fg `#010000`,
  role swap on item-19 as prescribed, accent complaint gone.
- **Identity story matches what the judge grades up:** exact-pixel guarantee (structural),
  designer's-ink foreground (round-1 item-12 strong, round-2 item-1 strong), and — after the
  eligibility adoption — the twice-asked-for chromatic marks published at rank 0 (purple
  `#421b50`, cinnamon `#97191a`; in round-5 phase2-cal-017 for judgment).
- **Grade trajectory:** round-1 3S/2A/3W/0U → round-2 4S/2A/3W, zero vetoes ever.
- **Determinism:** byte-identical across runs/parallelism, independently re-verified in every
  audit cycle (W3, W15, W16b, W17-adjacent staging).
- **Honest-process yield:** pre-registered falsifier, decision rules, and branches have fired
  correctly four rounds running (incl. two honest nulls: ρ* unmoved, polarity unmoved).

## 3. Measured weaknesses, located causes

- **Robustness far below the incumbent anchor and flat:** full-600 overall 18.2% (0.1.0) →
  16.8% (0.3.0) → 16.0% (0.4.1) vs the incumbent's 72.8% q92 anchor; all-four-role flips
  114 → 88 → 88. Quality iterations bought no robustness (0.3.0's q92 34.0 gave back to 28.0).
  **Located:** the binary edge/depth substrate couples to resolution (slope −0.212; degenerate
  side = higher-edge side 16/16 one-side pairs) and to noise (β-depth drift 0.34 log units
  across renditions ≈ 0.32 under dither); `e1-colour` downstream owns 43/54 pair flips and
  11/12 perturbation whole-palette flips (attribution studies, committed).
- **Overfit direction:** ratio 1.294×; unseen-cover agreement 19.5 → 17.0 while reviewed froze.
- **Accent is the least stable role** (68–70% across versions) and the reviewer's main
  attention site (8 identity-coverage counts + 2 cross-round confirmations).
- **Gradient boolean is necessary-not-sufficient:** false gradient at ρ 0.769 (r2-item-6),
  asked-for gradient missing (r2-item-7); ρ* threshold work cannot fix endpoint mismatch.
- **Cover-114 class:** bar-count prevalence is spread-sensitive (flat patch 6.06% beats
  textured field 1.45% whose median IS the field colour).
- **I4.ramp between-stops failure class** (~17 covers): priced consequence of stop-pixels-only
  selection; guide stops fix some (4 cleared in 0.4.0), not all.

## 4. Open questions and cost to answer

| question | state | cost |
|---|---|---|
| Substrate replacement (continuous coherence field) | **ANSWERED 2026-08-05: FALSIFIED** (pre-registered Measurement A: e1-ordering drift reduced only 18% vs 50% required, 14.9× own perturbation drift, inverts on same-radius pairs; ruling in `measurements/substrate/SUBSTRATE_2_RULING.md`) | closed; a NEW family would cost a fresh design + trial cycle, no candidate exists |
| Swap role-assignment (chromatic mark → fg or accent?) | round-5 item df58b175 arbitrates; decode pending | decode + one targeted cycle |
| Eligibility shape at thin-fill edges (admitted set = 48) | round-5 branch (b); decode pending | if fired: one small cycle + re-round |
| Identity-vs-legibility bracket (ink at min-ramp 6.12 vs 89.37) | unpurchased twice | one round item pair |
| Twin-collapse width | 2 counts, passive gathering | free, or one ladder round |
| ρ* lower-direction anchor | needs force-gradient dev path | small dev + one pairwise round |

## 5. Components graftable to other arms

- **Contract-metric fg ordering** (min |APCA| over the rendered ramp's stops) — judge-validated
  via round-2 re-grades.
- **fg↔accent swap comparator** (outcome-validated round-2; fire rate 28.2%; its role-assignment
  edge case is round-5's question).
- **Coherence-shaped eligibility** (presence ≠ eligibility; publishes tiny coherent marks,
  removed 18 accent collapses, measured free on robustness/contract axes) — answers the
  campaign-wide candidacy-wall finding (goal 3) and the corpus fact 8.89e-5.
- **Guide-stop canon machinery**: min spacing (banding provenance from two rounds), monotone
  chord-progression check, per-stop excursion-reduction records, 4th-stop gate.
- **Band-then-cascade selection** (replaces single-rank tail reads; all-four flips 114 → 88).
- **Process patterns**: pinned-code rounds, stem itemIds, pre-registered decision rules +
  branches, per-mechanism credit attribution via diagnostics, owed-commit ledger.

## 6. Honest promise assessment

P3's quality trajectory is real and judge-fed: every complaint class from rounds 1–3 was fixed
and re-graded strong, the identity story (exact pixels, designer's ink, chromatic marks) matches
what the reviewer consistently grades up, and iteration is fast because the paradigm's decisions
are few and localised — the audit trail shows fixes land where attribution points. The unsolved
core is robustness: rank discipline alone did not deliver stability, because the substrate the
ranks are computed on is the noise amplifier, and the one designed replacement so far moved
stability between axes rather than creating it. Absent a substrate win, P3 plateaus near 16%
agreement against an incumbent anchor of 72.8% — the mechanism's founding robustness claim is
currently unproven and trending flat. **Update 2026-08-05: the designed-and-gated substrate
experiment RAN and FALSIFIED the coherence-field family** (pre-registered Measurement A;
worker-escalated ambiguity; conjunctive ruling — the passing statistic was constant by
construction and confirming on it would have been a tautology). Net, current: high promise on
quality/identity with the fastest verdict-response loop of my visibility; robustness is
plateaued (~16% pooled, pairs 9%) with the cause LOCATED but the first designed fix REFUTED —
remaining options are incremental decision-site work (measured diminishing returns), a new
substrate family (no candidate; full design cycle), or judging the mechanism on
quality/identity as-is. Read P3 as: quality-strong,
robustness-plateaued-with-located-cause-and-refuted-first-fix.

## Round-6 outcome (decoded and APPLIED, 2026-08-05)

Legibility won the arbitration unanimously (4/4 conflict covers unacceptable, three prescribing
the fg colour); the pre-registered branch fired and 0.4.3 (`2fc45768`) implements it: floor
clause MIN_RAMP_HOLD_FLOOR=5.0 + partial swap return + a root-caused ground-lump exclusion in
fg selection. **The 168 arc closed at its strongest possible reading:** reviewer ground truth
revealed a paired-family target (two greys gradient:true + two blues; EVIDENCE item 13,
figure-vs-ground family separation), and the general machinery REACHED it without
special-casing. Row-0's black-fg prescription met (the |L−0.5| extremity read had made a white
GROUND the L-extreme — fixed). Purple shade fix validated strong; first fresh-cover strong
since round-2; cover-19 regression confirmed (neutral-accent branch in flight, W24, with a
sub-rankable-lump guard).

**Structural limitation, recorded per commissioning ruling (2026-08-05): rows 5/6 unmet, cause
located — the ink score's surround-coherence ranks white-on-photo type low while source support
wins the regime choice; the prescribed colour sits at luminance rank-0 on all three affected
covers. The ink-score redesign is DEFERRED to the mechanism-selection outcome: if P3 is
selected it is the first post-selection cycle; if not, this limitation stands as recorded.**

## Round-6 staging record (superseded by the outcome above)

8 items on 0.4.2 (`b9c41a4`): 4 identity-vs-legibility conflict covers (min-ramp 2.67–4.93,
chromatic accent held over a weak fg), 4 re-grades (168 blue-as-accent delivered after three
rounds of asking; 039 magenta returned at fg 3.07; purple shade `#5d1988` C 0.1714; cover-19
`#f3f300` vs the reviewer's round-1 prescribed white — regression check), 1 fresh (watch).
**Pre-registered branches, quoted:** *identity wins → 0.4.2's chromatic-mark hold rule stands
and legibility floors stay user-parameters; legibility wins → the hold rule gains a floor
clause and the swap partially returns.* A grade-split across the min-ramp range is surfaced,
never interpolated. Whichever branch fires is the LAST queued change; applying it closes P3's
active iteration at the local optimum described in §6. Pairs on 0.4.2 measured 8.5% (flat vs
9.0%; slot migration confirmed — accent stabilised at fg's expense; substrate bound unchanged).

## Round-5 state (decoded 2026-08-05, after this document's first commit)

phase2-cal-017: 1 strong / 3 acceptable / 3 weak / 2 unacceptable, 0 vetoes. **Named marks
validated** (3/4/3 — branch (a); purple's only note is a within-lump shade nuance). **The
eligibility-shape risk discharged for the sample** (0/4 artifact notes on the admitted covers,
thin-fill edges included). **Both fresh covers ≤2** — the overfitting watch fired, corroborating
the harness's unseen-cover decline (§3): fresh-cover regression is measured AND judged. **168:
the reviewer wants the blue in the accent slot, third round running** — the swap comparator
mis-assigns the chromatic mark; fix direction recorded in the round's VERDICTS.md. **The
dominant complaint class moved to field roles** (6/9 notes: background/surface correctness,
gradient existence — third gradient-existence error on record): the judge's complaints and the
robustness attribution now CONVERGE on the edge/depth substrate. §4's first row is therefore
both the robustness lever and the top quality item — the decisive experiment for this
mechanism, designed, gated, and cheap.
