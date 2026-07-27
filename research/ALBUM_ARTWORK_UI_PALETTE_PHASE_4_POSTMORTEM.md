# Album Artwork UI Palette V2 Phase 4 Postmortem

Status: closed failed directional evaluation. The reviewed candidate remains frozen as
`album-artwork-first-principles-0.4.4`; this document does not authorize adaptation against or another
run over the opened Phase 4 sources.

## Bound Result

- Protocol ID: `221af26a6be614b34ef22e3ce3098cf09c54eb497611aaba3ec7f89e8f728e43`.
- Review manifest ID: `b795cf08eb7bf9e3a91751b633107cf759cc3dcb5dfaff7711ffda147eff1e01`.
- Feedback SHA-256: `470a14bb064dfc66a5f5d154fd33dfb1029dd2669559bd83f15783d4639c58e5`.
- Technical-interpretation SHA-256: `4cac88b51e80d945a0888f46761d820c8a1e442ee50fc2dac99f573e3336fabf`.
- Candidate was stronger in 3 comparisons and the external baseline was stronger in 6; 2 were similarly
  valid and 1 had neither treatment acceptable.
- Candidate absolute quality was 3 strong, 6 acceptable, 1 weak fallback, and 2 unacceptable.
- The common-positive absolute-quality clause passed at 9 of 12.
- The relative-improvement clause failed.
- The no-repeated-systemic-failure clause failed.
- Final disposition:
  `phase4-directional-gate-failed-return-to-development-with-new-future-sample`.

The complete analysis remains at
`research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/phase-4-analysis.json`.

## General Failure Classes

### Signature-color ranking underselection

This class occurred twice. In one response, source-supported red and orange accent families reached
complete generation but did not survive the retained slate. In another, a source-supported yellow
accent was retained with a chromatic field treatment but lost to the selected achromatic treatment.
This is evidence that complete generation alone does not close signature-color availability through
direction retention and top-one ranking.

### Gradient-treatment ranking underselection

This class occurred twice. Source-supported gradient treatments were present in the retained slate,
but one-field collapsed treatments won. This is a selection failure rather than proof that gradient
evidence was unavailable.

### Low nonzero gradient-role contrast admission

This class occurred once. The selected treatment sampled the complete rendered gradient at positions
`0`, `0.25`, `0.5`, `0.75`, and `1`, but admitted low nonzero APCA values for required roles. The issue
was not endpoint-only measurement. The frozen rule rejected only literal APCA zero for every distinct
accent pair and imposed no foreground floor.

## Development Constraints

- The opened 12-source sample is excluded from all future development execution.
- Original comments and technical classes remain diagnostics only. They may not become target colors,
  named-case branches, model features, or fitted thresholds.
- No mechanism is validated against the opened sources.
- Future changes use the fixed development panel and source-independent synthetic fixtures.
- The candidate and external baseline are not rerun on the opened sample.
- Phase 5, promotion, persistence, and full-roster execution remain blocked.

## Future Sample Custody

Future sample 02 was selected and sealed before new candidate output using metadata only. Its manifest
ID is `9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671` and its seal commitment is
`9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846`.
It reserves 12 independent root-`10` families and preserves roots `11` through `14`. It may not be
listed, opened, decoded, or evaluated during development.

## Development Order

1. Test the smallest contrast-quantifier and candidate-backfill mechanism independently.
2. Measure bounded development deltas and candidate counts without changing Pareto priority.
3. Address gradient and signature top-one ranking in a separate declared revision if repeated
   underselection remains.
4. Run a bounded human development checkpoint.
5. Freeze one new candidate and a separate Phase 4 execution protocol only after all development gates
   pass.
