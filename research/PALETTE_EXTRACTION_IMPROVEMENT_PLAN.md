# Palette Extraction Improvement Plan

## Decision

Promotion-focused gradient research is paused. Canonical `region-graph-0.19.0` contains the accepted bounded chromatic-role improvement; the gradient topology and eligibility experiments remain frozen on their historical 0.17 baseline.

The gradient question is conditional: given a selected directed `background` to `surface` pair, should that exact pair be rendered as a gradient? It cannot establish that either endpoint was available in the candidate set, that the endpoint colors were assigned to the correct roles, or that the complete four-role palette represents the artwork. Continuing to fit a conditional classifier while those upstream choices are wrong would optimize the consequence instead of the cause.

The next work is therefore role-first palette extraction. Gradient classification remains a frozen downstream diagnostic until candidate availability and role assignment improve and pass complete-palette review.

## Evidence for the Pause

The accumulated review record contains direct upstream failures:

- The v3 development registry contains 11 `selected-colors-not-identifiable` responses. These are not gradient or flat labels. They mean that one or both selected endpoint colors could not be identified in the source artwork.
- The `02/` review explicitly identified surfaces with no visually attributable artwork support (`gv-385e29fbf301aa2fc340` and `gv-8b1b5f052c4cf5bb4b81`). Exact observed-pixel provenance did not make those role choices valid.
- Reviews also identified near-duplicate background/surface roles, a plausible but semantically unrepresentative background (`gc-583a7f4b2375592af971`), an individually sourced but collectively unfaithful palette (`gc-330aec036a8605e596c0`), missing multi-hue coverage (`gv-d121e2591909215324f1`), and an effectively invisible near-black accent/surface pair (`gv-ad255facc9eba8ff001f`).
- The v3 hard contrast suite remains unresolved. Six twice-confirmed music flats conflict with the four targeted positive pairs `birdsofprey.jpg`, `doja.jpg`, `muse.jpg`, and `nada.jpg`. No tested A-H variant or tested decision union/intersection resolves both sides.
- The exposed `images/` diagnostic looked good overall, but only `muse.jpg` received an exact label; it was a confirmed v3 false removal. The other 33 cases remain unlabeled and cannot support a performance claim.

These observations do not invalidate exact-pair gradient labels. They limit what those labels can prove about extraction quality.

## Strict Decomposition

Every future experiment must identify exactly one primary layer.

### 1. Candidate Availability

Question: does the source-derived candidate pool contain a human-identifiable color suitable for each role?

Candidate availability includes quantization, region/family support, source identity, chromatic coverage, and preservation of small but meaningful typography or accent colors. It does not choose the final role assignment and does not classify gradients.

Failure at this layer means no downstream ranker can select the desired color. A role or gradient adjustment must not be used to hide missing candidates.

### 2. Role Assignment

Question: given the available candidates, which colors should be `background`, `foreground`, `surface`, and `accent`, and which roles should collapse?

Role assignment includes semantic representativeness, coherent-region support, complete-palette identity, role separation, accessibility, and collapse decisions. It must be evaluated on the complete palette. It does not change the meaning of an existing gradient label for an unchanged exact directed pair.

### 3. Gradient Classification

Question: given a fixed, identifiable, directed `background` to `surface` pair selected by the frozen upstream pipeline, should that pair use a gradient treatment?

This layer may measure pair support, continuity, topology, progression, and ownership. It must never select replacement endpoints. A canonical-flat baseline is not promoted by the frozen v3 wrapper.

Results from one layer must not be reported as success in another. In particular, exact-pair accuracy is not role accuracy, and complete-palette preference is not proof that every internal gradient label is correct.

## Experimental Principles

- Use the smallest experiment that can falsify one predeclared hypothesis.
- Prefer one composable evidence change over multiple case-specific rules.
- Do not add threshold exception branches for individual reviews, batches, filenames, styles, or failure examples.
- Treat `08/` through `0e/` as development evidence after their adaptive use. Exact POC.10 alone used `0f/` as independent promotion evidence. Any future promotion requires a newly declared untouched corpus.
- Preserve canonical output unless an experiment explicitly changes one declared layer.
- Keep hard constraints non-compensable: valid RGB, deterministic output, source provenance, foreground contrast tiers, generated foreground contrast, and accent visibility.
- Report source coverage, role assignment, gradient behavior, accessibility, stability, and human preference separately.
- Keep nondecisive and unidentifiable responses as their own labels. Do not map them into gradient, flat, acceptable, or unacceptable classes.

## Palette Presentation Contract

Every future human-facing palette presentation must show every emitted role with all four of the following fields:

1. A visible color swatch.
2. The role name: `background`, `foreground`, `surface`, or `accent`.
3. The `colornames-oklab` name returned by `closest()`.
4. The exact hexadecimal color.

The original artwork and the complete palette treatment must remain visible together. If two candidates are compared, side assignment must be deterministic and blinded, and the same presentation contract applies to both.

Color names are communication metadata only. They must not enter candidate features, optimization, role assignment, gradient features, labels, model fitting, semantic identity, or provenance hashes. The only permitted exception is an explicitly versioned presentation-metadata field whose version and rendered use are declared before review. A presentation hash may then bind that versioned display metadata, but the name still cannot affect algorithmic or label identity.

## Current Candidate And Role Outcome

Candidate-availability phase evidence is now concrete. `region-candidate-availability-0.1.0-poc.1` exposes at most two exact-source chromatic supplements while leaving canonical output untouched. It triggers on 3/37 development entries and 76/355 deduplicated `00/` entries. The reviewed missing-pastel case gains two stable hue-family representatives, proving candidate absence, but review did not prefer either generic one-accent treatment over canonical.

The first three role-integration iterations were evaluated without changing canonical 0.17:

1. POC.1 admitted every supplement. It improved two changed accepted palettes and tied one, but lost the rejected target it was designed to repair.
2. POC.2 limited role admission to omitted families with population at most `0.02`. Its nine-case unselected-holdout review had three candidate preferences, four ties, and two baseline preferences.
3. Frozen POC.3 also requires text evidence at least `0.5`. Its ten emitted palettes are an exact subset of prior blinded presentations: five candidate-preferred and five similarly valid, with five strong and five acceptable-but-not-ideal candidate ratings and zero hard-gate violations.

POC.4 through POC.9 successively added post-solver safety bounds after fresh `09/` through `0e/` reviews exposed baseline preferences or weak results. Those rounds became development evidence after each refinement. Exact POC.10 then passed the predeclared `0f/` protocol: five material changes, four candidate preferences, one similarly valid result, zero weak-or-worse candidates, zero baseline preferences, and zero hard violations. Its scientific payload was promoted unchanged as `region-graph-0.19.0`.

This is bounded progress, not a general four-role quality claim. The validation review covered every POC.10 material change, not every reserve palette. Canonical 0.19 still carries unresolved background, foreground, surface, collapse, accessibility, multi-hue, and whole-palette identity defects.

## Phased Work

### Phase 0: Preserve the Checkpoint

- Preserve canonical `region-graph-0.19.0` and its exact POC.10 equivalence archive.
- Keep gradient eligibility 0.8.6 and topology v1/v2 artifacts as historical diagnostics.
- Keep topology v3, its scorer, and its wrapper frozen as the current research baseline.
- Preserve the ten-case hard contrast suite and all exact labels.

### Phase 1: Failure Attribution

- The completed `palette-role-00-audit-0.2.0-development` review covers a deterministic 30-case sample: 10 diversity, 10 diagnostic-risk, and 10 random canonical `00/` palettes.
- Preserve each rating as a judgment of the displayed complete palette, not a claim that it is uniquely correct or that alternatives cannot work.
- Use the provenance-bound interpretation of all 12 comments to separate candidate availability, role feasibility/ranking, collapse, and gradient endpoint handling.
- The completed `palette-role-counterfactual-trace-0.1.0-development` diagnostic freezes the other three displayed roles and exposes exact hard gates, objectives, candidate provenance, hidden spatial evidence, pair gradients, and normal collapse alternatives.
- Its 596 production-selectable evaluations contain 361 hard-infeasible alternatives, 191 feasible rank/admission losses, 44 incumbent semantic selections, and no production Pareto admission. This does not make the displayed palettes unique or convert comments into target colors.
- Strict gradient-surface recovery is superseded without a new run. Gradient detection remains paused because endpoint evidence depends on the role colors and is not reliable enough to drive role selection.
- The opt-in foreground contrast profile uses ordinary floors of `3.5:1` on background and `3.0:1` on surface, with strong-typography floors of `3.0:1` and `2.5:1`; generated fallback remains `4.5:1`.
- POC.1 changed 150/355 `00/` palettes and 44/95 accepted palettes. POC.2 retained `4.5:1` preference/scoring but still changed 36/355 and 13/95 accepted. Both are rejected without review, neither changes the red-surface case, and canonical defaults remain unchanged.
- Do not infer corpus-wide prevalence or promotion evidence from this development sample.

### Phase 2: Candidate Availability

- Test one candidate-generation or candidate-support hypothesis at a time.
- The three audit-confirmed failures are now traced separately. White is below normalized light-typography thresholds; red fails saliency and overlaps brown; green is below the population floor; salmon has strong text evidence but was collapsed into achromatic gray.
- `region-typography-candidate-availability-0.2.0-poc.1` recovers the salmon family on 7/355 `00/` sources, including 1/95 accepted and 0/5 rejected sources, without changing canonical output or frozen availability.
- Its role-integration POC is rejected without review: the unchanged solver does not select the target, foreground contrast is only `1.3659:1`, and an accent substitution falls below the POC.10 visibility floor while losing accent and identity objectives.
- The palette contract permits at most four colors. A constrained trace forced salmon into accent and enumerated all 144 production background/surface pairs while freezing readable foreground. Only the canonical gray pair was hard-feasible and no pair passed POC.10 safety, so no fifth role or four-color reallocation is proposed.
- Measure whether the desired source-observed color or coherent candidate family becomes available without removing required typography, foreground, or hard-contrast colors.
- Stop a candidate experiment if it requires downstream exceptions to remain safe.
- Retain `region-candidate-availability-0.1.0-poc.1` as the bounded availability diagnostic. Do not conflate its broad-family certificates with permission to assign those families to roles.
- Retain the original typography POC as an availability diagnostic. The separate APCA-bound configured POC now authorizes complete-palette review of six accent-only treatments; do not lower population, saliency, or foreground thresholds to broaden it.
- Any future multi-hue work must explicitly redefine one of the four existing role semantics; increasing palette cardinality is out of scope.

### Phase 3: Role Assignment

- Test role ranking only after the candidate pool can express the desired answer.
- Prioritize supported distinct surfaces, exact background collapse for indistinguishable surfaces, background semantic representativeness, complete-palette color fidelity, multi-hue coverage, and accent-to-surface visibility.
- Keep canonical foreground contrast defaults unchanged. The lower profile is an explicit consumer option, not a promoted default.
- Treat accent as a meaningful UI token, not a decorative identity-only slot. The current configured contract is absolute APCA `Lc 10` against both background and surface, with accent passed as the APCA foreground over each field.
- The typography-salmon target clears that floor at `+15.5785 Lc` against its retained background/surface field. The APCA-bound `typographyChromaticAccent` evaluation emits six accent-only treatments across 392 entries with zero technical violations and rejects one treatment requiring non-accent role changes. Partial review found two treatments worse than baseline and one unjudgeable; three remain pending, global promotion is stopped, and file-specific exclusions are not authorized.
- The historical WCAG 2 `3:1` audit found 147/355 `00/` failures, including 47/95 accepted palettes; seven failures had no source-safe accent with other roles frozen. Retain those counts only as historical evidence and test the APCA redesign under a separately identified configuration.
- The opt-in historical `region-ui-accent-joint-0.1.0-poc.1` complete solver corrected all 147 WCAG 2 failures with zero technical violations and preserved all 208 safe incumbents exactly. The current APCA profile requires a fresh complete audit and broad stratified development review before it can be considered for canonical promotion.
- Compare complete palettes, not isolated role scores.
- Treat the promoted POC.10 bounds as canonical behavior; any change starts a new candidate identity and requires new validation.

### Phase 4: Complete-Palette Development Review

- Freeze the candidate and role-assignment implementation before rendering.
- Use the broad `00/` audit for absolute failure discovery across all palettes. Candidate reviews must still cover all changed known cases plus deterministic controls.
- Collect the primary complete-palette decision before any failure tags.
- Treat the result as development evidence. If the candidate changes, the reviewed corpus becomes development data for the next version.

### Phase 5: Conditional Gradient Recheck

- Run the frozen topology v3 scorer on canonical gradients produced by the improved role pipeline without refitting it.
- Separate unchanged exact pairs from newly selected pairs.
- Re-run the ten hard contrasts as development tests. A role improvement may legitimately change an endpoint and therefore create a new exact-pair question.
- Do not consume reserve data unless a role candidate and any gradient hypothesis are frozen together.

### Phase 6: Fresh Validation

- Predeclare complete-palette and conditional-gradient endpoints, sampling, decisive/nondecisive handling, gates, stopping rules, and interpretation.
- Freeze implementation files, source inventory, runtime, rendering, presentation metadata version, and hashes before opening a reserve batch.
- Freeze a candidate and protocol against the custody-sealed `10/` through `14/` inventory before decoding one declared reserve. The other source-inventoried/output-unseen roots remain reserved.
- Report results for the selected review population only. Do not claim deployment prevalence or population accuracy from enriched or temporal batches.

## Complete-Palette Review Protocol

The primary review object is the full spatial palette in its intended UI treatment, beside the source artwork. Pair-only gradient options may be a secondary task only after the complete-palette decision.

The primary blinded response set should remain compatible with the established corpus workflow:

- prefer A
- prefer B
- no preference
- neither acceptable

Absolute review may use shippable/unshippable when no comparator is appropriate. Failure tags are collected only after the primary choice and must distinguish candidate absence, wrong background, wrong foreground, wrong surface, wrong accent, inappropriate collapse, insufficient role separation, inaccessible contrast, incomplete artwork identity, unidentifiable color, and gradient treatment.

Every review artifact must bind source bytes, complete emitted roles, algorithm versions, presentation version, deterministic side assignment, HTML, and feedback. Unanswered cases remain unanswered. Qualitative batch comments remain qualitative and are never converted into per-case labels.

## Known Role Defects

| Defect | Existing evidence | Required direction |
| --- | --- | --- |
| Surface source identifiability | `gv-385e29fbf301aa2fc340`, `gv-8b1b5f052c4cf5bb4b81`, and unidentifiable endpoint reviews | Require meaningful coherent-region or family support for a distinct surface. |
| Surface separation | Technically distinct but visually indistinguishable background/surface colors | Collapse exactly to background or pass a validated role-aware separation rule. |
| Background representativeness | `gc-583a7f4b2375592af971` | Distinguish framing/dominant background identity from a merely feasible color. |
| Whole-palette fidelity | `gc-330aec036a8605e596c0` | Evaluate the role set jointly, not only per-role provenance. |
| Endpoint identifiability | 11 development responses across reviewed temporal batches | Gate the interpretation of both selected endpoints and preserve the explicit response. |
| Chromatic coverage | `gv-d121e2591909215324f1` | Represent exceptional multi-hue identity without replacing accessible role colors. |
| Accent-to-surface visibility | `gv-ad255facc9eba8ff001f`, contrast `1.0087:1` | Add a validated accent/surface visibility floor; OKLab distance alone is insufficient near black. |

## Success and Freeze Gates

### Candidate Gate

- The candidate pool contains the human-identifiable colors required by the documented cases.
- Exact source provenance and deterministic candidate identity remain intact.
- Existing hard foreground, typography, and ten-case gradient contrast colors are not lost.
- Native-resolution, resize, re-encode, crop, and noise diagnostics remain separately reported.

### Role Gate

- The changed complete palettes pass a predeclared blinded development review.
- No hard accessibility gate regresses.
- Known unidentifiable, near-duplicate, semantically wrong, chromatically incomplete, and accent/surface failures are explicitly rechecked.
- Unchanged accepted palettes and fixed rejected palettes are included as controls.

### Freeze Gate

- Hypothesis, features, optimization, thresholds, protocol, source inventory, rendering, color-name presentation version, runtime, and implementation hashes are fixed before reserve access.
- There are no filename, batch, example, or post-review exception branches.
- A changed candidate gets a new identity. Prior validation does not transfer to the changed implementation.

### Promotion Gate

- A fresh reserve review evaluates complete palettes and both sides of any conditional gradient change.
- Predeclared gates pass without reinterpretation or post-review tuning.
- Canonical promotion requires an explicit code and version change; favorable research diagnostics do not promote themselves.

## Corpus Policy

The numbered `00/` through `0b/` batches are treated as temporal samples from the same theoretically uniform deployment artwork source population, not as semantic cohorts. Finite sampling, source delivery, adaptive case selection, changing review context, and reviewer drift can still produce batch differences. Batch-specific parameters are prohibited.

Current status:

- Music and `00/` through `06/` are accumulated development evidence for current research.
- `07/` is consumed, prediction-enriched validation evidence for frozen topology v3. It is not a prevalence sample.
- `08/` through `0f/` were consumed by adaptive chromatic-role development and final POC.10 validation.
- `10/` through `14/` are source-inventoried/output-unseen reserves. Their inventory contains 1,835 files, 1,680 artwork families, and 1,676 future-validation-eligible families after prior-byte exclusions.

Custody inventory may record paths, raw byte counts, exact hashes, artwork-family grouping, and file signatures without decoding images or producing algorithm outputs. This does not constitute scientific consumption, but the batch must be described as source-inventoried/output-unseen rather than untouched. A candidate, protocol, exclusions, runtime, and implementation hashes must be frozen against inventory ID `3907c57f94cd7dfea992c5d1ce98da6de2165c720b75259b32f0250da1881c7f` before any reserve is decoded. Once extraction output or review from a reserve informs a change, that reserve becomes development evidence for the changed candidate.

## Exact-Pair Label Transfer

A gradient label transfers only when the exact directed pair identity is unchanged:

`SHA-256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)`

The source bytes, background RGB, surface RGB, and direction must all match. Family name alone is insufficient. Swapping endpoints creates a different pair. Changing either selected role creates a new question and requires a new label if that question matters.

Transferred labels retain their original category and evidence class. `either-way`, `no-visible-difference`, `selected-colors-not-identifiable`, `uncertain`, and unanswered cases are never converted into decisive labels. Pair labels do not transfer into claims about role correctness or complete-palette quality. A materially changed rendering or presentation protocol must be versioned and re-reviewed rather than silently carrying the label.

## Eventual Joint Inference

The decomposition is a debugging and evidence discipline, not a permanent architectural ban. If candidate availability and role assignment are separately sound but residual cases show that endpoint choice and field interpretation are inseparable, a future experiment may jointly infer role assignments, collapse state, and gradient treatment.

Such a model must still expose candidate support, role evidence, hard constraints, and the final exact pair. It must compare against the decomposed baseline, use complete-palette review, predeclare its objective, avoid threshold exception branches, and freeze before reserve access. Joint inference is a later option, not a shortcut around the current upstream defects.
