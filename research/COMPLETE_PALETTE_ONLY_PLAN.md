# Complete-Palette-Only Plan

Status: frozen design direction after the user stopped `controlled-field-state-supervision-0.1.0-development` during batch 1 on 2026-07-25. Complete palettes are the only valid human-review object. This document does not authorize candidate fitting, reserve access, review generation, promotion, or a canonical code change.

## Decision

The factorized field-state path is closed. Ordered-pair, multiplicity, and gradient judgments cannot be interpreted independently when the fixed foreground, accent, background, surface, or complete treatment is unacceptable.

The ten submitted factorized cases remain append-only qualitative stop evidence. Their structured preferences are not fitted or reinterpreted from comments. The remaining 62 cases stay unjudged.

## Review Unit

Each option is one complete emitted palette in its intended interface treatment:

- background;
- foreground;
- surface;
- accent;
- flat or gradient field treatment;
- exact generated/source status and provenance for every role.

All roles are judged jointly. Gradient is part of the complete treatment, not a secondary label fitted independently. A comparison may change any roles required by a coherent complete-palette hypothesis, but each option must be generated and frozen as one indivisible tuple.

## Candidate Boundary

A future candidate must be deterministic and source-grouped before review. It must:

- enumerate and rank complete four-role tuples jointly;
- evaluate background identity, foreground readability, surface identity or justified collapse, accent visibility against both fields, role separation, and gradient treatment together;
- preserve exact source provenance for source colors and explicit provenance for generated colors;
- emit no filename, case, batch, comment, or target-color branches;
- remain within exposed development roots until a separate reserve protocol is authorized;
- preserve the canonical palette exactly when no complete candidate is admissible.

Source-exact membership alone is not sufficient. A selected color must also have role-relevant, human-identifiable support in the artwork.

## Review Contract

Use the established complete-palette review schema and presentation rather than the stopped controlled-field UI. Every eligible source records:

1. absolute quality of option A: `strong`, `acceptable-not-ideal`, `weak-fallback`, `unacceptable`, or `uncertain`;
2. absolute quality of option B using the same scale;
3. `a-stronger`, `b-stronger`, `both-similarly-valid`, `neither-acceptable`, or `uncertain`;
4. optional structured failure classes for each option;
5. an optional qualitative note that never becomes a label, feature, color target, or gate.

The review must visibly explain that `both-similarly-valid` means both treatments work and `neither-acceptable` means both fail. Source eligibility and treatment validity remain separate decisions.

## Failure Classes

Structured failures must distinguish:

- needed source color absent from the candidate pool;
- wrong background;
- wrong foreground;
- wrong surface;
- wrong accent;
- inappropriate surface collapse or unnecessary second field;
- insufficient role separation;
- inaccessible foreground or accent contrast;
- incomplete artwork identity;
- selected color not visually identifiable in the artwork;
- incorrect flat or gradient treatment;
- complete-palette ranking failure.

Failure classes are diagnostic outcomes, not direct optimization targets.

## Sampling

- The independent unit is exact encoded-source SHA-256.
- Build and freeze complete tuples before assigning option sides.
- Counterbalance sides deterministically from experiment and source identity.
- Deduplicate exact sources and exact semantic tuple pairs.
- Keep diagnostic sources and all reserve roots sealed unless a later protocol explicitly opens them.
- Use small development batches and stop immediately when repeated complete-palette failures make the candidate direction nonviable.
- Unanswered cases remain unanswered; partial review never implies completion.

## Evaluation

Report absolute quality and paired preference separately. A relative preference does not make either option shippable. `Neither acceptable`, two negative absolute ratings, and uncertain outcomes never become directional labels.

At minimum report:

- source-grouped coverage;
- quality counts for baseline and candidate;
- both-positive, baseline-positive/candidate-negative, candidate-positive/baseline-negative, and both-negative counts;
- paired preference counts;
- structured failure counts by option;
- exact changed and unchanged complete-tuple controls.

Do not fit role-specific or gradient-specific models from complete-palette feedback. New architecture may be motivated by aggregate failure classes, but implementation and gates must be frozen before another review.

## Development Gates

Before any reserve review can be proposed:

1. every changed option passes hard accessibility, cardinality, provenance, and determinism checks;
2. no previously positive complete palette becomes negative;
3. no candidate-preferred result has a negative candidate quality;
4. known wrong-background, invisible-accent, unidentifiable-endpoint, inappropriate-collapse, and gradient regressions are represented in development controls;
5. complete-palette failures do not require named-case or post-review exceptions;
6. the candidate demonstrates enough positive complete-palette evidence to justify a separately authorized reserve protocol.

Passing development gates authorizes only a reserve protocol proposal. It does not authorize reserve access or promotion.

## Stop Conditions

Stop without further review if complete palettes are repeatedly unacceptable, fixed technical gates fail, required identity colors are absent, apparent improvement depends on comments or named cases, or evidence would require independent factor labels. Do not return to pair-only, multiplicity-only, or gradient-only human supervision.
