# Region Graph 0.11.0 Corpus Review

The provenance-locked selection, eligibility decisions, and absolute judgments are stored in `selection.json`, `curation.json`, and `absolute-feedback.json`.

## Eligibility

- Sources screened: 112
- Sources accepted: 100
- Sources vetoed: 12
- Accepted quotas: 50 diversity, 30 diagnostic risk, 20 deterministic random controls
- Veto reason assignments: 9 not artwork, 1 unusable quality, 4 out of distribution, 1 other
- Curation permanently frozen: `2026-07-18T16:09:00.434Z`

Reason counts can exceed the number of vetoes because one decision can carry multiple reasons.

## Absolute Review

- Palettes reviewed: 100
- Shippable: 83
- Unshippable: 17
- Failure reason assignments: 3 background, 2 foreground, 7 surface, 7 accent, 2 lacking artwork identity

The reviewer deliberately used a severe shippability threshold to prioritize release quality. Three unshippable judgments explicitly record low confidence:

- `00/ab67616d0000b273000062690f9a82145c2fb5df.jpg`
- `00/ab67616d00001e0200005ddc313068597b41ae3b.jpg`
- `00/ab67616d0000b27300003d2a08ce63af9a2c19b0.jpg`

These remain unshippable in the binary totals; the notes identify sensitivity cases rather than silently relabeling their outcomes. This review used development-facing validation artwork and does not establish performance on a new sealed corpus.

## Deferred Ideas

The future-work list in `../RESEARCH.md` retains two role-model experiments without changing the accepted algorithm: an optional fifth identity color and an evidence-gated third gradient control stop for artwork-supported hue paths.
