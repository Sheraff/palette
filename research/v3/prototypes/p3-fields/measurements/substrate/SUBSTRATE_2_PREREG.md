# Substrate cycle 2 — pre-registration (orchestrator, 2026-08-05, before the worker exists)

Motivation: quality complaints (round-5: 6/9 notes name field roles) and robustness attribution
(e1 43/54 pair flips, edge-field coupling) converge on the edge/depth substrate. Trial 1 built
the coherence field but moved stability between axes (pairs +6pp, perturbation −6.7pp) and
never measured its central claim. This cycle measures the claim, attributes trial 1's
perturbation regression, revises, and re-measures against gates fixed here.

## Measurement A — the coupling claim (run FIRST; it can falsify the family)

On the rendition-pair set (both sides, full 200 pairs) and a 50-cover dither/q92 perturbation
sample: the field's summary statistic drift (F-membership fraction and the e1-relevant ordering
distribution) as median |log ratio|, cross-rendition vs same-resolution perturbation, for BOTH
substrates (binary-edge baseline: cross-rendition 0.34 / perturbation 0.32 log units on
β-depth). **Claim confirmed iff the coherence field's cross-rendition drift is (i) ≤ half the
binary field's AND (ii) not materially above its own perturbation drift.** If the claim fails,
the coherence-field family is FALSIFIED for P3's purpose — record, stop the cycle, report
MECHANISM-limited honestly (robustness story then rests on incremental e1 work only).

## Measurement B — trial-1 perturbation regression attribution (only if A confirms)

First-divergence attribution of the field-mode's smoke150 losses vs control (q75 10.8→5.4,
dither 24.3→13.5): which downstream decision does the new field destabilise? Named suspects to
check, not assume: the top-(1−β) percentile cut on the coherence product (a new quantile
boundary — near-ties at the F membership edge), and the cross-scale product's sensitivity at
single scales. Fix within the line (band/tie-band patterns already in the codebase are the
sanctioned shapes).

## Adoption gate (full 600-trial run of the revised field, no --limit)

ALL of: (1) pairs ≥ 12.0% (control 9.0% + 3pp); (2) pooled overall ≥ 15.0% (control 16.0% − 1
allowance for noise); (3) no single arm > 5pp absolute below control; (4) all-four flips ≤ 80
(control 88); (5) demo-20 20/20 byte-deterministic; (6) coverage-220 contract PASS within ±3 of
200, gradient rate within ±5 of 86 (neutrality watch — a larger swing is a finding to report,
not tune away); (7) the discipline line audited by reading the diff (no created colours).
Informational, not gating: the three round-5 field-role complaint covers (a33dac6a, ea2461a4,
05687107) — report old/new backgrounds + diagnostics.

Anything less than ALL gates → flags stay off, report the numbers, and the next §7 carries the
honest assessment. No post-hoc gate reinterpretation: this file is the reading.
