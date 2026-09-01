# Album Artwork UI Palette Candidate Protocol V2 0.6.0

Status: predeclared bounded development exact-overlay gradient-challenger experiment. Normative product
direction remains `research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. Operational predecessor is frozen
candidate `album-artwork-first-principles-0.5.2`.

This protocol does not authorize Phase 4, Phase 5, promotion, persistence, or full-roster execution.
Future sample 03 remains sealed and unopened until all development and freeze gates pass.

## Purpose

Development evidence distinguishes three gradient cases:

- `development-06` already has accepted gradient evidence and a legal gradient preserving the flat
  winner's foreground and accent roles, but the flat treatment wins by one `0.04` foundation level.
- `development-22` has accepted gradient evidence, but its role-preserving gradient counterpart is
  dominated before frontier retention.
- `development-16` has no accepted gradient field hypothesis under the frozen evidence policy and may
  not receive a fabricated gradient.

Candidate `album-artwork-first-principles-0.6.0` isolates one constrained challenger policy. It does not
change gradient fitting or eligibility, field hypotheses, representative discovery, role quotas,
contrast, score formulas, Pareto blocks, evidence resolution, or ordinary ranking.

## Exact-Overlay Gradient Challenger

Run the complete `0.5.2` candidate generation, scoring, Pareto frontier, primary winner selection, and
ordinary retained-slate construction unchanged. Then evaluate a challenger only when the primary winner:

- is flat;
- has a distinct accent; and
- has at least one accepted gradient field variant.

A challenger must:

- use an accepted gradient field variant and retain its source gradient evidence;
- preserve the primary winner's exact canonical foreground and accent colors;
- preserve the primary winner's foreground and accent family IDs;
- preserve the primary winner's distinct-accent collapse state;
- pass the ordinary role-equality, source-support, APCA peak-observability, path-observability, and
  complete-treatment validation rules without exemption; and
- have `treatmentFoundation` no more than one existing `0.04` evidence level below the primary winner.

Search existing unique complete treatments first. If none qualifies, project the winner's exact
foreground and accent representatives onto the accepted gradient field variants and call the existing
`createTreatment` path. Evaluate at most six projected treatments, matching the existing maximum of
three gradient hypotheses times two field variants. Projection does not alter the primary complete
candidate count or Pareto frontier; it is reported separately.

Choose the best eligible challenger using the unchanged complete-treatment priority comparator. When a
challenger exists, it becomes the public winner. The primary `0.5.2` winner remains the second retained
alternative, followed by up to six unchanged ordinary retained treatments. The public slate remains
bounded at eight.

This is not a gradient score bonus. It is a constrained presentation challenger between treatments
that retain the same complete overlay assignment and differ only in accepted field treatment evidence.
No gradient is introduced when evidence eligibility rejected it.

## Diagnostics

Serialize an `exactOverlayGradientChallenger` trace containing:

- trigger eligibility and reason;
- accepted gradient variant count;
- existing exact-overlay gradient count;
- projected attempt and legal counts;
- selected challenger ID and source (`existing-complete` or `supplemental-projection`);
- incumbent and challenger treatment-foundation evidence levels; and
- whether the challenger replaced the primary winner.

The ordinary Pareto trace continues to report the unchanged primary winner separately from the final
selected treatment.

## Source Custody

- Development remains restricted to the fixed 28-source panel.
- Development execution must reject every source hash in the opened original Phase 4 sample, consumed
  future sample 02, and sealed future sample 03 before reading a development source.
- Future sample 03 manifest ID:
  `bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060`.
- Future sample 03 seal commitment:
  `139d9c9fe72838c9618f0cb575cda34d1b7b54c8e83a9d1446034c76b35b75ba`.
- Future sample 03 raw SHA-256:
  `690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183`.
- No future-sample path may be listed, opened, hashed, decoded, rendered, or passed to candidate code.
- Consumed future-sample output, feedback, comments, and technical interpretations may not participate
  in implementation, tuning, tests, fixtures, or gates.

## Mechanical Gates

- Generic tests prove exact overlay preservation, evidence-level eligibility, no-gradient rejection,
  ordinary legality, deterministic challenger ordering, and the six-projection bound.
- Per-source primary complete-candidate counts, frontier counts, frontier direction counts, primary
  winner IDs, and legacy scalar winner IDs are identical to `0.5.2` on all 28 sources.
- Existing `0.5.2` gradient winners remain exact final winners.
- Flat winners without accepted gradient evidence remain exact.
- Every changed final winner is a gradient whose predecessor is flat and whose foreground/accent
  colors, family IDs, and accent-collapse state are exact matches.
- Every changed challenger is within one foundation evidence level of its predecessor.
- Exactly `development-06` and `development-22` change final winner.
- `development-16`, `development-01`, `development-02`, `development-05`, and `development-23` remain
  exact flat controls.
- At most six supplemental projections are attempted and at most one challenger is selected per source.
- Complete candidate generation remains within 1,500; supplemental projection remains separately
  bounded at six; retained treatments remain at most eight.
- Future sample 03 remains unopened.

Any unexpected winner change, field-evidence change, ordinary ranking change, source-custody mismatch,
or bound violation fails the experiment rather than expanding review.

## Human Delta Gate

Only the two changed development winners receive a blinded paired review against their exact `0.5.2`
predecessors. Each side receives independent absolute quality, relative comparison, issue tags, and an
optional comment before identities are revealed.

Both changed challengers must:

- be rated `strong` or `acceptable`;
- be rated stronger than the predecessor, not merely similarly valid;
- receive neither `extraneous gradient` nor `incomplete artwork identity`; and
- preserve all custody and exact-treatment bindings.

Any failed pair stops this cycle and triggers the agreed approach reassessment. No additional tuning or
future-sample execution follows a failed development review.

## Advancement

Passing every mechanical and human gate makes `0.6.0` eligible for a separately bound candidate freeze.
Only that freeze may authorize one-way execution on future sample 03. The future directional gate keeps
the existing strict requirements: candidate-stronger count must exceed baseline-stronger count, at
least 7 of 12 candidate treatments must be strong or acceptable, and no technical failure class may
repeat.
