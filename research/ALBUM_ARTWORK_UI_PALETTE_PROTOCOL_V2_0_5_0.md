# Album Artwork UI Palette Candidate Protocol V2 0.5.0

Status: predeclared bounded development mechanism experiment. Normative product direction remains
`research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. This protocol does not authorize Phase 4, Phase 5,
promotion, persistence, or full-roster execution.

## Purpose

Candidate `album-artwork-first-principles-0.5.0` isolates one conservative contrast-admission change
and one directly coupled availability correction. It does not change gradient detection, field
hypotheses, representative discovery, score formulas, Pareto evidence levels, top-one priority blocks,
or retained-slate policy.

## Contrast Contract

- Contrast remains signed APCA Lc from `apca-w3@0.1.9`.
- A gradient is evaluated over the complete rendered color path at positions `0`, `0.25`, `0.5`,
  `0.75`, and `1`, using the existing OKLab interpolation followed by canonical sRGB conversion.
- Flat one-field treatments use one sample. Distinct flat fields use both field colors.
- A required foreground is structurally observable when at least one applicable sample is outside
  APCA's literal zero-output dead zone.
- A distinct accent is structurally observable when at least one applicable sample is outside APCA's
  literal zero-output dead zone.
- No explicit `5`, `8`, epsilon, or fitted positive hard floor is added. With the bound APCA library,
  nonzero output already starts near magnitude `7.3`; the library's own dead zone is the only hard
  contrast boundary in this experiment.
- Zero or low contrast at another sample remains legal and visible in diagnostics. Existing mean and
  worst-sample foreground/accent utilities continue to penalize it softly over every rendered sample.
- The generated black/white emergency condition remains the independent predeclared maximum-supported
  magnitude below `5`; this experiment does not alter it.

This changes the accent quantifier from universal observability to peak observability. It is a
relaxation of the frozen `0.4.4` accent rule, not a stronger contrast floor. It also makes the same peak
condition explicit for the required foreground. The experiment is intentionally conservative about
hard accessibility policy; a higher minimum may be considered only under a separately declared,
general product contract.

## Availability Closure

- Foreground options that fail peak observability are removed before the per-field family-direction
  quota is filled, allowing the next legal foreground family to backfill.
- Distinct-accent options that fail peak observability are removed before the four-family accent quota
  is filled, allowing the next legal signature family to backfill.
- Accent-collapse opportunity is computed from the legal accent list. An illegal option cannot consume
  a slot or penalize collapse.
- Rejected foreground and accent option counts are serialized separately.
- The global 1,500-complete-treatment bound is unchanged.

## Source Custody

- Development remains restricted to the existing 28-source development panel.
- Development execution must reject every variant hash in both the opened Phase 4 sample and sealed
  future sample 02 before reading a development source.
- Future sample 02 manifest ID:
  `9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671`.
- Future sample 02 seal commitment:
  `9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846`.
- No future-sample path may be listed, read, hashed, decoded, rendered, or passed to candidate code.

## Mechanism Gates

- Generic tests prove the exact one-, two-, and five-sample field contracts.
- Every returned required foreground has at least one nonzero sampled APCA value.
- Every returned distinct accent has at least one nonzero sampled APCA value.
- A role with all sampled APCA values equal to zero is rejected.
- A role with a mix of zero and nonzero values remains eligible, and its worst-sample utility retains
  the zero evidence.
- An illegal high-ranked role family cannot consume a bounded direction slot that a lower-ranked legal
  family can fill.
- All complete treatments remain within the unchanged 1,500-candidate per-source bound.
- The complete development run reports changed winners, treatment counts, rejected-option counts,
  field-treatment changes, signature-family availability, and exact unchanged treatments against
  `0.4.4`.
- No result from the opened Phase 4 sources participates in a gate.

## Advancement

Passing these gates establishes only the contrast/admission mechanism. It does not establish product
quality or resolve the repeated gradient and signature ranking classes by itself. If bounded
development still shows those ranking failures, the next revision must change ranking separately and
predeclare its own mechanism gate before another human checkpoint.
