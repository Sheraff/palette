# Gradient Eligibility Development Experiment

## Scope

This experiment decides whether the selected `background` and `surface` colors are endpoints of one spatially continuous artwork field. It does not select another color, alter the four palette roles, or change canonical `region-graph-0.17.0` output.

The experiment never uses the image-level smooth-gradient fallback. All evidence is specific to the selected background-surface pair.

## Development Data

The music-artwork corpus contains 3,504 deduplicated families. Canonical 0.17 marks 1,327 family anchors as gradients; those anchors supply development evidence.

The human pilot contains 24 cases:

- 6 strong pair-continuous cases
- 6 cases rejected by the previous pair-only detector
- 6 suspected flat-background/isolated-surface cases, including both known failures
- 6 deterministic representative cases

The review UI uses black-and-white chrome. Each borderless artwork is embedded in a preview whose non-artwork colors are only the extracted background, foreground, surface, and accent. Every case supports structured classification, confidence, and free-form artwork feedback.

## Evidence

Pixels are projected onto the selected background-surface line in OKLab. The experiment records:

- endpoint and intermediate color-path coverage
- an endpoint-spanning four-connected component
- populated color-path bins within that component
- local progressive versus abrupt transitions
- directional ordering of projected color along image position
- endpoint flatness, border coverage, coherence, and interior isolation

The flat-background/isolated-surface risk combines a flat border-connected background endpoint, an interior or weakly border-connected surface endpoint, and missing directional or connected continuity.

## Pilot Result

The 24 labels contain 16 true background gradients, 7 flat-background/isolated-surface false positives, and 1 low-confidence uncertain case.

The previous pair-only detector fits only 11/16 true gradients and rejects 2/7 false gradients. Disabling the global fallback without replacing those thresholds is therefore too strict for true gradients and still too permissive for isolated subjects.

All 16 reviewed true gradients have complete endpoint-spanning color-path bins. Three false gradients do not. The remaining four false gradients have flat-background/isolated-surface risk from `0.468` to `0.985`; reviewed true gradients range from `0` to `0.0031`.

## Development Candidate

`gradient-eligibility-0.2.0-dev` applied two ordered rules:

1. Reject when endpoint-spanning connected-field continuity is below `1.0`.
2. Reject when flat-background/isolated-surface risk is at least `0.4`.

The candidate fits all 23 non-uncertain pilot labels. Across the 1,327 canonical gradient candidates it retains 1,118 and rejects 209: 114 for incomplete connected-field continuity and 95 for strong flat-background/isolated-surface risk.

Native-variant diagnostics showed that requiring all 14 core bins was unnecessarily brittle. Version `gradient-eligibility-0.3.0-dev` tolerates one missing bin by requiring at least 13/14 bins and adds a minimum endpoint-spanning component share of `0.05`. The reviewed true-gradient minimum is `0.216`; the reviewed false case recovered by the relaxed bin rule has share `0.026`. The flat-background/isolated-surface threshold remains `0.4`.

Version `gradient-eligibility-0.4.0-dev` adds an occlusion-tolerant path. When no single component spans both endpoints, the pair may still qualify with at least 13/14 global path bins, at least `0.4` intermediate-color share, and at least `0.4` linear directional ordering. This preserves pair-specific spatial evidence while allowing a subject or typography to split a real background gradient. Connected radial and irregular gradients continue through the primary connected-field rule and do not need linear ordering.

Version `gradient-eligibility-0.5.0-dev` limits the flat-background/isolated-surface veto to endpoint-dominated paths whose intermediate-color share is below `0.4`. Intermediate-rich paths are retained even when one endpoint forms a broad flat border field. This keeps all reviewed labels unchanged, retains ten additional music-corpus families, and reduces native-variant disagreement without weakening the disconnected-field requirement.

A four-case targeted review then classified `birdsofprey`, `doja`, `muse`, and `nada` as true gradients; the first three were high confidence and `nada` was low confidence. Version `gradient-eligibility-0.6.0-dev` lowers the pair-analysis endpoint distance to `0.025`, permits the occlusion path with `0.3` intermediate share and `0.15` directional ordering, and applies the flat-background veto only below `0.2` connected/path ordering. The seven reviewed flat-background false positives remain rejected.

Version 0.6 fits all 27 determinate labels across the music and targeted reviews. It retains all 13 gradients in the previously reviewed development corpus and 156 of 166 gradients in the development-facing holdout. Its originally reported music-corpus retention count was later invalidated by the stale-evidence issue described below.

Inspection of the ten remaining holdout rejections found two connected gradients missing only two or three of the 14 path bins. Version `gradient-eligibility-0.7.0-dev` lowers connected-field continuity from 13/14 to 11/14 while retaining the `0.05` connected-path share, stricter 13/14 occlusion-path rule, endpoint-dominance checks, and flat-background safeguards.

The version 0.6 and initial version 0.7 music-corpus reports incorrectly reused evidence generated for version 0.4. That evidence predated the version 0.6 endpoint-analysis floor change from `0.045` to `0.025`, so the reported 1,178/1,327 and 1,188/1,327 retention counts are invalid. Evidence is now independently versioned as `gradient-eligibility-evidence-0.2.0-dev`, decisions reject mismatched evidence versions at runtime, and development generation reuses the same canonical analysis and candidates as the end-to-end wrapper.

Fresh version 0.7 evidence retains 1,205 of 1,327 music-corpus gradients and rejects 122: 62 for flat-background/isolated-surface risk and 60 for insufficient spatial continuity. It retains all 13 previously reviewed development gradients and 158 of 166 gradients in the development-facing holdout. Native-variant stability remains 630 of 637 comparable variants. The end-to-end wrapper changes only the spatial gradient boolean and preserves all other canonical output across 392 validation entries.

The changed-palette review received 41 responses from 50 planned cases; 9 intentionally skipped cases remain unlabeled. The responses contain 5 `should-be-gradient`, 21 `should-not-be-gradient`, and 15 `either-way` decisions. With fresh evidence, version 0.7 retains all five positive cases and rejects all 21 negative cases. One `either-way` case that leans toward a gradient is retained; the remaining 14 are rejected. All 18 strict negative votes for the flat-background/isolated-surface rule remain rejected, and that rule received no positive vote. Skipped and `either-way` cases are excluded from binary fit.

## Sealed Validation

The independent `01/` corpus was sealed before evaluation with the version 0.7 implementation and thresholds. Its 353 source files form 325 artwork identities; one exact duplicate identity was excluded, leaving 324 families with no artwork-ID or exact-source overlap against `00/` and no exact-source overlap against the music manifest.

Canonical 0.17 marks 157 sealed families as gradients. Version 0.7 retains 143 and vetoes 14, all of which received blinded gradient-versus-flat comparison. The reviewer submitted 11 judgments and explained that the three unanswered cases had no visible difference between treatments. Every decision applies only to the displayed background-surface pair, not to other colors that could have been selected from the same artwork.

The review contains 8 flat, 1 gradient, 2 either-way, and 3 no-visible-difference outcomes. All eight flat judgments exercise the insufficient-spatial-continuity rule. The flat-background/isolated-surface rule has one gradient judgment and two either-way judgments. The gradient judgment for `#010101` to `#562556` is a sealed false rejection, so version 0.7 fails its predeclared promotion rule.

## Version 0.8 Development

The sealed false rejection has a full connected path, `0.212` whole-image intermediate coverage, and a non-flat surface endpoint (`0.115` flatness), but near-zero linear ordering from a broad nonlinear purple field. Version `gradient-eligibility-0.8.0-dev` exempts the flat-background/isolated-surface veto when intermediate coverage is at least `0.2` and surface flatness is at most `0.2`. The continuity gate remains unchanged.

The exception recovers the sealed endpoint pair and one additional unlabeled music family, a broad white-to-orange radial field. It collides with none of the 36 strict negative labels. Version 0.8 fits all 62 determinate endpoint-pair labels accumulated across development and the former sealed corpus, retains 1,206 of 1,327 music gradients, all 13 prior development gradients, 158 of 166 development-facing holdout gradients, and 144 of 157 gradients in the former sealed corpus. Native-variant stability remains 630 of 637.

At that stage, version 0.8 was not promotion-eligible because it had changed after observing the `01/` result. The `01/` corpus remains development evidence for 0.8, so promotion required another independent sealed corpus.

## Version 0.8 Promotion Validation

The independent `02/` corpus was sealed after version 0.8 was frozen. Its 356 files form 330 artwork identities with no internal exact duplicates, no artwork-ID or exact-source overlap against `00/` or `01/`, and no exact-source overlap against the music manifest.

Canonical 0.17 marks 160 families as gradients. Version 0.8 retains 144 and vetoes 16. All 16 changes received blinded endpoint-pair review: 6 flat, 8 either-way, and 2 no-visible-difference, with no unanswered cases and no gradient preference. The continuity veto accounts for 4 flat, 3 either-way, and 2 no-visible-difference judgments; the flat-background/isolated-surface veto accounts for 2 flat and 5 either-way judgments.

Version 0.8 therefore has zero sealed false rejections and satisfies the predeclared promotion rule. Two comments identified separate upstream surface-role defects: some surface colors lack visually attributable artwork support, and distinct surfaces can be perceptually indistinguishable from background. Those issues are recorded in `RESEARCH.md`; they do not alter the frozen gradient candidate or its pair-specific validation result.

## Broader Music Promotion Audit

The sealed result established narrow safety on the 16 changed `02/` cases but did not establish that retained music gradients were generally correct. A complete follow-up queue contained 78 previously unseen removals and 1,183 previously unseen retained gradients.

The removals form received no stored submissions, but the reviewer explicitly recorded `gc-15a1a79ee427004b55f5` (`#a0061e` to `#7c191e`) as a gradient incorrectly rejected for insufficient spatial continuity and noted that other removals may also have failed. The reviewer also described many removals as either-way.

The retained audit received 102 submissions: 43 keep-gradient, 37 should-be-flat, and 22 either-way. The 37 flat judgments demonstrate substantial residual false-positive gradients among cases retained by version 0.8.

The reviewer therefore rejected version 0.8 promotion despite its sealed changed-case pass. Canonical 0.17 remains unchanged. Future gradient work must address both the recorded false removal and the retained false-positive population, then repeat independent validation rather than treating the `02/` result as sufficient.

The manual decision and qualitative findings are frozen in `data/experiments/gradient-eligibility-0.8.0-music-promotion-interpretation.json`. `data/experiments/gradient-eligibility-0.8.0-music-promotion-audit-analysis.json` binds that interpretation to both review plans, rendered HTML files, and feedback stores by SHA-256.

## Version 0.8.1 Development

The version 0.8.0 rejection did not close gradient eligibility research. It froze only the interpretation of the exact candidate tested in `02/`. The active development candidate is now `gradient-eligibility-0.8.1-dev`; all earlier corpora, including `02/`, are development evidence for this changed rule.

Version 0.8.1 adds two pair-specific decisions over the unchanged evidence schema:

1. A coherent nonlinear-path exception recovers a pair when no endpoint-spanning connected component exists, but the pair detector is positive, all core path bins are occupied, intermediate path share is at least `0.6`, and pair coherence is at least `0.5`. This uniquely recovers the recorded false removal `gc-15a1a79ee427004b55f5` among the 121 version 0.8.0 music removals without colliding with prior rejected labels.
2. A sparse progressive-field veto rejects a retained gradient when whole-image intermediate coverage is at most `0.08`, the background endpoint covers at least `0.2` of the image, and its largest connected component covers at least `0.03` of the perimeter. This targets broad border-connected backgrounds whose selected surface is linked by a narrow photographic or object-local tone path rather than a substantial background field.

The conservative sparse-field thresholds were selected after checking reviewed-label fit, corpus impact, and native-resolution stability. A broader `0.10`/`0.035` two-signal rule caught 23 of 37 reviewed false retentions but destabilized 19 of 637 comparable native variants and added 211 music removals. The final three-signal rule catches 20 of 37, changes none of the 43 submitted gradient judgments or 22 either-way judgments, restores stability to 630 of 637, and adds 123 music removals.

Across all accumulated development judgments, version 0.8.1 preserves all 69 positive labels and all 42 prior strict negative labels. It retains 1,084 of 1,327 music gradients, all 13 development-corpus gradients, and 156 of 166 holdout gradients. The two new holdout rejections and 103 unreviewed music rejections form a provenance-bound 105-case delta review in `data/experiments/gradient-eligibility-0.8.1-iteration-review.json`.

Version 0.8.1 is an active development candidate, not a promotion candidate yet. Its delta review must be completed and interpreted before freezing the rule. If the rule changes after that review, development continues under another candidate version; when a candidate is finally frozen, promotion requires a new independent corpus that reviews both removals and a predeclared representative sample of retained gradients.

The 105-case delta queue was traversed after the rule was frozen. Twenty-seven cases received individual decisions: 22 should-not-be-gradient and 5 either-way, with no should-be-gradient response. The remaining 78 were described qualitatively as mostly flat but were intentionally not converted into individual labels because the queue was visually repetitive and overrepresented photographs of physical discs or CD-ROMs. Combined with 20 earlier retained-audit labels captured by the same veto, the individually labeled affected set contains 42 flat, 5 either-way, and 0 gradient judgments. The interpretation is frozen in `data/experiments/gradient-eligibility-0.8.1-iteration-interpretation.json` and analyzed in `data/experiments/gradient-eligibility-0.8.1-iteration-analysis.json`.

Version 0.8.1 is now frozen for a future independent validation. Its exact rule remains development-derived and is not promoted by the favorable delta review.

## Version 0.8.2 Geometry Diagnostic

A diagnostic branch tested whether selected-component core-bin density, surface-endpoint edge enclosure, and surface-endpoint background affinity could safely remove the 17 reviewed false retentions left by version 0.8.1. The branch regenerated all 3,504 music families under evidence version 0.3 and joined 65 exact positive, 86 exact negative, and 39 either-way music labels.

The diagnostics shifted in the expected direction but did not separate the remaining errors safely. The best wide-margin rule captured only 2 of 17 residual false retentions while removing 35 additional unlabeled music gradients. Nine residual errors were componentwise overlapped by at least one exact positive across all three signals. A fitted maximum captured 6 of 17 but removed 156 additional gradients and three exact either-way cases.

The geometry branch is therefore rejected. Its conclusion is frozen in `data/experiments/gradient-eligibility-0.8.2-geometry-conclusion.json`; no geometry field or threshold is retained in the active implementation. Version 0.8.1 remains the frozen candidate.

The next promotion attempt is defined in `GRADIENT_ELIGIBILITY_VALIDATION_0_8_1.md`. It requires a new independently sampled `03/` corpus and reviews every canonical gradient, not only candidate removals. Promotion requires zero decisive false removals, complete responses, at least 40 decisive retained cases, and a retained flat-judgment rate no greater than 10%. The resulting round-3 validation is recorded below.

## Version 0.8.1 Promotion Validation

The `03/` corpus was sealed after version 0.8.1 and its round-3 protocol were frozen. Its 366 files form 330 artwork families with 36 multi-source families and no internal exact duplicate groups. No family overlaps `00/`, `01/`, or `02/` by artwork identifier or exact source bytes, and no source exactly matches the music manifest. Manifest `772325272093f526eb0478bb6ebc31c40cefb9f1b3ba603d71a5d8874f4edae8` binds the candidate implementation, thresholds, evidence version, protocol, source inventory, and runtime.

Canonical 0.17 marks 163 of the 330 families as gradients. Frozen version 0.8.1 retains 144 and vetoes 19: 13 for insufficient spatial continuity, 4 for flat-background/isolated-surface risk, and 2 for insufficient progressive-field support. All 163 canonical gradients are in the blinded review so retained precision and changed-case safety are evaluated together. Promotion status remains unknown until that review is complete.

The reviewer completed positions 1-64 and then stopped to avoid an oversized human task. Fifty-nine cases received individual decisions: 27 gradient, 8 flat, and 24 either-way. Five additional prefix cases could not be judged because the selected background or surface color was not visually identifiable in the artwork; positions 65-163 remain unreviewed. Every gradient or flat judgment applies only to the displayed endpoint pair.

Version 0.8.1 fails this round. Two of six reviewed candidate removals require the gradient treatment. Among candidate-retained cases, 6 of 31 decisive judgments require flat treatment, a `19.35%` rate above the predeclared `10%` limit. The partial interpretation and provenance-bound result are stored in the round-3 validation directory. Per the reviewer's process guidance, `03/` now becomes development evidence and can support a small number of further iterations before another corpus is added.

## Version 0.8.2 Development

Version `gradient-eligibility-0.8.2-dev` preserves evidence version 0.2 and all version 0.8.1 thresholds, then adds four narrow decision branches fitted to the reviewed round-3 prefix:

1. A broad, strongly ordered ten-bin connected field recovers a low-contrast dark gradient that missed the prior `11/14` continuity threshold.
2. A high-separation, strongly ordered path recovers one pink-to-blue multihue graphic flow without globally lowering intermediate-share requirements.
3. A weak disconnected-path veto rejects low-coverage, low-coherence endpoint layouts that were mistaken for occluded gradients.
4. A fragmented-connected-path veto rejects small endpoint-spanning bridges that occupy little of the full path.

Across 206 accumulated decisive endpoint-pair labels, version 0.8.2 moves from 95 true gradients, 86 true flats, 23 false retentions, and 2 false removals under version 0.8.1 to 97 true gradients, 90 true flats, 19 false retentions, and 0 false removals. It preserves every prior label and either-way decision. Music retention changes from 1,084 to 1,082 of 1,327; the 392-entry validation result and 630/637 native-variant stability remain unchanged. On the round-3 prefix it retains all 27 gradient judgments and rejects 6 of 8 flat judgments.

The next review is intentionally limited to 25 untouched round-3 cases: all 13 version 0.8.2 removals from original positions 65-163 plus a deterministic sample of 12 retained cases. It includes an explicit selected-colors-not-identifiable response. This is development review, not promotion evidence.

All 25 responses were completed. The 13 candidate removals contain 7 flat, 3 either-way, and 3 no-visible-difference judgments, with no gradient judgments. The 12 retained cases contain 8 gradient, 2 flat, and 2 either-way judgments. Combined with the reviewed prefix, version 0.8.2 therefore retains 4 flat endpoint pairs among 39 decisive retained cases, a `10.26%` rate, while retaining all 35 gradient judgments. The complete provenance-bound result is in `data/experiments/gradient-eligibility-0.8.2-round3-followup-analysis.json`.

## Version 0.8.3 Development

Version `gradient-eligibility-0.8.3-dev` adds one narrow veto for the newly reviewed false retention `gv-b49a8364ccc9d1779cbd`. It rejects a pair when both selected endpoints cover at least `0.27` of the image border while connected intermediate path support is at most `0.17`. This identifies two broad border-connected flat fields rather than a progressive field between the endpoints.

The rule changes only that reviewed round-3 decision relative to version 0.8.2: it moves from retained to `separate-border-connected-flat-fields`. The other retained flat case, `gv-6dc8acd1ee9a52027407`, has no safe separator in the existing evidence and remains retained. Across 223 accumulated decisive endpoint-pair labels, version 0.8.3 has 105 true gradients, 98 true flats, 20 false retentions, and no false removals. Within the 89 reviewed round-3 cases, it retains 3 flat endpoint pairs among 38 decisive retained cases, a `7.89%` rate, while retaining all 35 gradient judgments.

Music retention remains 1,082 of 1,327, the 392-entry development and holdout validation result remains 13/13 and 156/166 retained, and native-variant stability remains 630/637. Focused boundary tests include both the two-border flat-field veto and the previously recovered high-separation sparse ordered path.

Every current round-3 rejection has now been reviewed. A deterministic 25-case sample from the remaining 74 untouched candidate-retained cases was frozen in `data/experiments/gradient-eligibility-0.8.3-round3-retained-review.json` and completed. It contains 13 gradient, 1 flat, and 11 either-way judgments. Across the resulting 114 reviewed round-3 cases, version 0.8.3 retains all 48 gradient judgments and 4 of 18 flat judgments. Its retained flat rate is `4/52`, or `7.69%`. Across all 237 accumulated decisive labels, it has 118 true gradients, 98 true flats, 21 false retentions, and no false removals. The provenance-bound result is in `data/experiments/gradient-eligibility-0.8.3-round3-retained-analysis.json`.

## Version 0.8.4 Development

Version `gradient-eligibility-0.8.4-dev` addresses the retained batch's sole flat judgment, `gv-3001b164bd162db234ad`. The selected road-gray and sky-blue regions are separate fields in a complex street photograph. The basic connected-field route retained them despite pair-specific detection being negative and progressive intermediate support being sparse.

The new veto requires all four conditions: pair-specific detection is negative, intermediate coverage is at most `0.04`, connected-field coverage is at least `0.05`, and background coherence is at most `0.3`. The conjunction captures a sparse connected color path over fragmented endpoint support. It matches no accumulated gradient, either-way, no-visible-difference, or selected-colors-not-identifiable judgment. Three earlier flat music labels also match but were already rejected by existing rules.

Across the same 237 accumulated decisive labels, version 0.8.4 has 118 true gradients, 99 true flats, 20 false retentions, and no false removals. Within the 114 reviewed round-3 cases, it retains all 48 gradient judgments and 3 flat judgments among 51 decisive retained cases, a `5.88%` flat rate. It retains 140 of the 163 canonical round-3 gradients; all 23 candidate rejections have human review, and 49 candidate-retained cases remain untouched.

The rule additionally rejects one unlabeled music pair whose selected blue background and skin-colored subject are separate fields, reducing music retention from 1,082 to 1,081 of 1,327. Development and holdout validation remain 13/13 and 156/166 retained, and native-variant stability remains 630/637. No routine review of the remaining `03/` cases is planned: further review cannot make a rule fitted on `03/` independent, so the next promotion attempt requires a newly sealed corpus.

## Version 0.8.4 Sealed Validation

The `04/` corpus was sealed under `GRADIENT_ELIGIBILITY_VALIDATION_0_8_4.md` after version 0.8.4 was frozen. Its 355 extensionless JPEG sources form 323 artwork families with 32 multi-source families and no internal exact duplicate groups. One family was excluded for an exact prior-source match; no family overlaps prior corpora by artwork identifier and none exactly matches the music manifest. Manifest `ff2f7bf25e36b6e702396254e80adc48acb4cd61c8b7c408b40e5b11dec4194c` binds the candidate, thresholds, protocol, source inventories, and runtime.

Canonical 0.17 marks 145 of the 322 included families as gradients. Frozen version 0.8.4 retains 131 and rejects 14: 9 for insufficient spatial continuity, 2 for flat-background/isolated-surface risk, 2 for insufficient progressive-field support, and 1 for an unsupported disconnected color path. All 14 removals form the first blinded review batch. Retained precision will be assessed separately with deterministic batches of at most 25 after removal safety is known.

All 14 responses were completed: 6 flat, 2 gradient, 2 either-way, 3 no-visible-difference, and 1 selected-colors-not-identifiable. Both flat-background/isolated-surface removals, `gv-d592d349e55cc27e9f55` and `gv-bea1bd989fffb8d5d9c9`, received decisive gradient judgments. Version 0.8.4 therefore fails its zero-false-removal condition. No retained batch was collected because retained precision cannot reverse that failure. The sealed manifest, evaluation, review, feedback, interpretation, and analysis remain frozen as negative validation evidence for the exact 0.8.4 candidate.

## Version 0.8.5 Development

The two round-4 false removals are genuine broad fields: a diffuse magenta glow into black and red illumination fading through dark red shadows. Version `gradient-eligibility-0.8.5-dev` adds a direct recovery inside the flat-background risk branch when pair-specific detection is positive, at least `0.993` of color-path pixels belong to one endpoint-spanning component, pair coherence is at least `0.55`, and surface coherence is at most `0.3`. A direct positive decision is required because the black-to-magenta case also satisfies the later sparse-progressive veto.

The recovery preserves every accumulated flat judgment. It additionally recovers one music pair already judged either-way, changes no unlabeled music anchor, leaves development and holdout validation at 13/13 and 156/166 retained, and preserves native-variant stability at 630/637. Music retention returns from 1,081 to 1,082 of 1,327. Reanalysis of round 4 as development data retains 133 of 145 canonical gradients and fits all 8 decisive removal labels: 2 true gradients, 6 true flats, and no errors.

Across 245 accumulated decisive endpoint-pair labels, version 0.8.5 has 120 true gradients, 105 true flats, 20 false retentions, and no false removals. Because the recovery was fitted after observing round 4, `04/` is development evidence for version 0.8.5 and cannot validate promotion. Another independent sealed corpus is required.

## Version 0.8.5 Sealed Validation

The `05/` corpus was sealed under `GRADIENT_ELIGIBILITY_VALIDATION_0_8_5.md` after version 0.8.5 was frozen. Its 386 extensionless JPEG sources form 355 independent artwork families with 31 multi-source families, no internal exact duplicate groups, no prior-corpus overlap by artwork identifier or exact source, and no exact music-manifest match. Manifest `63828ea05f5fb0c8465cb0adfde3bb899093194defd25ec223fa66ba014c0a34` binds the candidate, thresholds, protocol, all prior inventories, and runtime. The evaluator reverified every family variant. The `06/` and `07/` datasets remain untouched reserves.

Canonical 0.17 marks 159 of the 355 families as gradients. Frozen version 0.8.5 retains 143 and rejects 16: 13 for insufficient spatial continuity, 2 for flat-background/isolated-surface risk, and 1 for insufficient progressive-field support. All 16 removals form the first blinded review batch. Retained sampling begins only if every removal batch passes the zero-false-removal condition.

All 16 responses were completed: 5 flat, 2 gradient, 5 either-way, 2 no-visible-difference, and 2 selected-colors-not-identifiable. The decisive gradient judgments are `gv-c390f308d44dd4fc0cad` and `gv-f384728cd4663a785a06`, both rejected for insufficient spatial continuity. Version 0.8.5 therefore fails its zero-false-removal condition. No retained batch was collected because retained precision cannot reverse that failure. Round-5 artifacts remain frozen as negative validation evidence for exact version 0.8.5.

## Version 0.8.6 Development

Version `gradient-eligibility-0.8.6-dev` adds two narrow recoveries for the round-5 failures. First, the endpoint-distance floor for the existing perfect-continuity, strongly ordered sparse path is reduced from `0.3` to `0.2`; continuity remains `1` and directional ordering remains at least `0.85`. Second, a low-distance, low-coverage disconnected path can qualify when it fills at least 13/14 core bins, has directional ordering at least `0.15`, and its pair coherence is greater than `0.3`. This second branch uses the coherent side of the exact support bounds already used by the unsupported-disconnected veto; all downstream vetoes remain active.

The combined change recovers exactly the two round-5 gradient judgments across music and `00/` through `05/`. It changes no known flat or nondecisive label, no other anchor, and no endpoint-comparable native variant. Round-5 development reanalysis retains 145 of 159 canonical gradients and fits all 7 decisive removal labels: 2 true gradients, 5 true flats, and no errors. Music remains 1,082/1,327 retained, development and holdout validation remain 13/13 and 156/166 retained, and native stability remains 630/637.

Across 252 accumulated decisive endpoint-pair labels, version 0.8.6 has 122 true gradients, 110 true flats, 20 false retentions, and no false removals. Because this rule was fitted after observing round 5, `05/` is development evidence for version 0.8.6. Independent promotion validation moves to the untouched `06/` corpus, while `07/` remains reserved.

## Version 0.8.6 Sealed Validation

The `06/` corpus was sealed under `GRADIENT_ELIGIBILITY_VALIDATION_0_8_6.md` after version 0.8.6 was frozen. Its 340 extensionless JPEG sources form 317 independent artwork families with 23 multi-source families, no internal exact duplicate groups, no prior-corpus overlap by artwork identifier or exact source, and no exact music-manifest match. Manifest `c0fffc6201ce82b005175b54e033bf97a1bea2da9fdcf723c88ce279881c2957` binds the candidate, thresholds, protocol, prior inventories, and runtime. The `07/` dataset remains an untouched reserve.

Canonical 0.17 marks 141 of the 317 families as gradients. Frozen version 0.8.6 retains 127 and rejects 14: 9 for insufficient spatial continuity, 3 for flat-background/isolated-surface risk, 1 for insufficient progressive-field support, and 1 for an unsupported disconnected path. All 14 removals form the first blinded review batch. Retained sampling begins only if removal safety passes.

All 14 removal responses were completed: 4 flat, 2 gradient, 5 either-way, 2 no-visible-difference, and 1 selected-colors-not-identifiable. The decisive gradient judgments are `gv-175abbc6434137b08ab8` and `gv-2f9abd3d883f74b0f820`. Version 0.8.6 therefore fails the predeclared zero-false-removal rule, as versions 0.8.4 and 0.8.5 did with two false removals each.

Three independent rounds now show a stable tradeoff rather than convergence toward zero misses: 15 clear flat fixes, 6 false removals, 19 neutral judgments, and 4 unidentifiable pairs among 44 reviewed removals. False removals represent 6 of 445 canonical-gradient cases across those rounds (`1.35%`), while clear fixes outnumber them 2.5 to 1. Fitting another narrow recovery before measuring retained behavior would continue optimizing only one side of the classifier and consume the final `07/` reserve without resolving that tradeoff.

Version 0.8.6 therefore remains unchanged. A deterministic 25-case retained sample from round 6 is collected as supplemental engineering evidence even though it cannot turn the original protocol result into a preregistered pass. Pragmatic acceptance requires at least 20 decisive retained responses, a retained flat rate no greater than `10%`, at least two clear removal fixes per false removal, and a false-removal point rate no greater than `2%` of canonical-gradient cases. Results and uncertainty remain explicit; `07/` stays untouched.

All 25 retained responses were completed: 11 gradient, 5 flat, 7 either-way, and 2 selected-colors-not-identifiable. Only 16 responses are decisive, below the 20-case target, and the retained flat rate is `5/16`, or `31.25%`, far above the `10%` ceiling. Even another 25-case batch containing no additional flat judgment could reduce the cumulative rate only to `5/41`, or `12.20%`. Further retained review therefore cannot rescue the candidate under the stated rule.

Version 0.8.6 fails both its predeclared removal-safety rule and the supplemental pragmatic acceptance rule. Across all 274 accumulated decisive labels it has 133 true gradients, 114 true flats, 25 false retentions, and 2 false removals. Canonical 0.17 remains accepted. Gradient threshold fitting and review stop here; `07/`, `08/`, `09/`, `0a/`, and `0b/` remain unconsumed reserves for future role-aware or end-to-end palette work rather than another narrow eligibility patch.

## Limits

The music and `00/` through `05/` results are development evidence for version 0.8.6 and cannot establish its generalization. Round 6 is independent negative evidence for exact version 0.8.6. The original `02/` result remains valid promotion evidence only for the exact frozen version 0.8.0 implementation; it does not freeze subsequent development or validate background or surface role selection. Canonical 0.17 remains unchanged until a later candidate passes a new independent validation and receives an explicit promotion change.
