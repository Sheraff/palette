# Palette Extraction Improvement Plan

## Decision

Promotion-focused gradient research is paused. Canonical `region-graph-0.17.0` remains unchanged.

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
- Do not tune on `08/` or later evidence before freezing a candidate and protocol.
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

## Phased Work

### Phase 0: Preserve the Checkpoint

- Keep canonical `region-graph-0.17.0` unchanged.
- Keep gradient eligibility 0.8.6 and topology v1/v2 artifacts as historical diagnostics.
- Keep topology v3, its scorer, and its wrapper frozen as the current research baseline.
- Preserve the ten-case hard contrast suite and all exact labels.

### Phase 1: Failure Attribution

- Revisit only documented role failures and the five currently unshippable development palettes.
- For each failure, record whether the needed color is absent from candidates, present but ranked to the wrong role, present and correctly assigned but incompatible with another role, or correctly assigned with only the gradient treatment wrong.
- Do not alter extraction while attribution is incomplete.

### Phase 2: Candidate Availability

- Test one candidate-generation or candidate-support hypothesis at a time.
- Start with visually attributable surface support and missing chromatic identity coverage because both have explicit reviewed examples.
- Measure whether the desired source-observed color or coherent candidate family becomes available without removing required typography, foreground, or hard-contrast colors.
- Stop a candidate experiment if it requires downstream exceptions to remain safe.

### Phase 3: Role Assignment

- Test role ranking only after the candidate pool can express the desired answer.
- Prioritize supported distinct surfaces, exact background collapse for indistinguishable surfaces, background semantic representativeness, complete-palette color fidelity, multi-hue coverage, and accent-to-surface visibility.
- Preserve or strengthen foreground-on-background and foreground-on-surface contrast gates.
- Compare complete palettes, not isolated role scores.

### Phase 4: Complete-Palette Development Review

- Freeze the candidate and role-assignment implementation before rendering.
- Review all changed known cases plus deterministic controls from unchanged accepted and rejected palettes.
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
- Use the next untouched reserve only after development gates pass.
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
- `08/`, `09/`, `0a/`, and `0b/` are untouched reserves.

Reserve batches must not be listed, read, decoded, hashed, or summarized before the relevant protocol and implementation are frozen. Once a reserve informs a change, it becomes development evidence for that changed candidate.

## Exact-Pair Label Transfer

A gradient label transfers only when the exact directed pair identity is unchanged:

`SHA-256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)`

The source bytes, background RGB, surface RGB, and direction must all match. Family name alone is insufficient. Swapping endpoints creates a different pair. Changing either selected role creates a new question and requires a new label if that question matters.

Transferred labels retain their original category and evidence class. `either-way`, `no-visible-difference`, `selected-colors-not-identifiable`, `uncertain`, and unanswered cases are never converted into decisive labels. Pair labels do not transfer into claims about role correctness or complete-palette quality. A materially changed rendering or presentation protocol must be versioned and re-reviewed rather than silently carrying the label.

## Eventual Joint Inference

The decomposition is a debugging and evidence discipline, not a permanent architectural ban. If candidate availability and role assignment are separately sound but residual cases show that endpoint choice and field interpretation are inseparable, a future experiment may jointly infer role assignments, collapse state, and gradient treatment.

Such a model must still expose candidate support, role evidence, hard constraints, and the final exact pair. It must compare against the decomposed baseline, use complete-palette review, predeclare its objective, avoid threshold exception branches, and freeze before reserve access. Joint inference is a later option, not a shortcut around the current upstream defects.
