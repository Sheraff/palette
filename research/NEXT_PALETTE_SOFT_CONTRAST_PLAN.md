# Next Palette Soft-Contrast Plan

Status: development planning only. This document does not authorize candidate freeze, canonical
promotion, reserve access, or broader human review.

## Intended Product Use

The four palette roles have the following application semantics:

| Role | Intended use |
| --- | --- |
| `background` | Principal background covering most of the application. |
| `surface` | Less frequently used secondary background or a second endpoint for a background gradient. |
| `foreground` | Text rendered over both background and surface. Font size and weight can vary. |
| `accent` | Minor UI elements, details, and borders, mostly over background and only rarely over surface. |

The extractor is not intended to guarantee perfect accessibility according to WCAG or APCA usage
guidelines. APCA is one source of evidence for choosing a useful palette. Lower contrast may be
acceptable when source fidelity, role semantics, and complete-palette composition support it.

## Policy Correction

The development thresholds `Lc 60` for foreground and `Lc 10` for accent were provisional policy,
not product requirements.

- `Lc 60` acted as a conservative text-readability stand-in.
- `Lc 10` was calibrated around retained low-contrast identity accents.
- Neither value was derived from the intended product contract.
- Treating either value as a hard feasibility gate incorrectly excluded source-faithful palettes.

Prior findings such as "no source foreground is feasible at 60 Lc" must therefore be interpreted
as failures under the provisional experiment policy, not proof that a source color is unusable.
Generated white, omitted identity colors, and rejected field pairs may have been consequences of
that policy rather than failures of perception or topology.

## Constraint Boundary

Future development candidates should not use fixed APCA floors during extraction.

Hard constraints remain limited to:

- exact normalized-source provenance for non-generated colors;
- maximum four-color cardinality;
- explicit source-derived field and overlay membership;
- complete deterministic inference and recomputable certificates;
- explicit surface and accent collapse semantics;
- generated-color provenance and authorization;
- finite, signed APCA diagnostics for every declared relation.

APCA magnitude is soft comparative evidence. It does not independently reject a source candidate.

## Contrast Evidence

### Foreground

Foreground is used over both fields, so each foreground candidate retains a two-dimensional
contrast vector:

```text
foregroundContrast(f) = [
  abs(Lc(f, background)),
  abs(Lc(f, surface))
]
```

Candidates should be compared without a fixed floor:

1. Remove candidates contrast-dominated on both fields by another otherwise comparable candidate.
2. Prefer stronger worst-field contrast when role evidence is otherwise comparable.
3. Use total contrast only as a later tie-breaker.
4. Preserve signed polarity in diagnostics even when ranking uses magnitude.
5. Let source typography, identity, and complete-palette evidence decide among contrast-comparable candidates.

This reflects that text can appear on either field without pretending one font-agnostic APCA value
is universally required.

### Accent

Accent is primarily rendered over background. Its contrast evidence is ordered rather than
collapsed into an arbitrary weighted average:

```text
primary:   abs(Lc(accent, background))
secondary: abs(Lc(accent, surface))
```

Background contrast participates directly in accent ranking. Surface contrast remains diagnostic
or a later tie-breaker because accent-on-surface placement is rare. There is no absolute `Lc 10`
admission floor.

## Evidence Reclassification

Every reviewed miss should be assigned to one of these mechanisms before changing inference:

| Mechanism | Question |
| --- | --- |
| Candidate availability | Does a corresponding exact-source family survive perception? |
| Representative fidelity | Does the retained exact representative faithfully express its connected family? |
| Provisional-policy rejection | Was a useful source candidate rejected only by a fixed APCA floor? |
| Source role membership | Is the candidate supported as a field, foreground, or identity detail? |
| Complete-tuple feasibility | Can it participate after provenance, cardinality, and role membership constraints? |
| Complete-tuple ranking | Is it feasible but outranked by another complete palette? |
| Field relation | Are the background/surface endpoints and flat or gradient state supported by the source? |
| Consumer ambiguity | Does choosing between valid source families require product context not present in the image? |

Review comments remain diagnostic evidence. They must not inject filenames, target hex values, or
case-specific branches into inference.

## Reusable Components

The following existing components remain available:

- canonical `region-graph-0.19.0`, including the incumbent-preserving `0.17` complete solver;
- immutable region, histogram, candidate, and family evidence;
- exact source provenance and deterministic certificates;
- complete tuple enumeration and explicit role collapse;
- source-derived field eligibility from the `0.3` relation architecture;
- harmonic field conjunction and separate collapsed, distinct-flat, and gradient states;
- connected-family availability, exact masks, and overlay-only membership from `0.4`;
- explicit overlay-to-field consumer relation declarations;
- provenance-bound evaluation, exact judgment transfer, and blinded complete-palette review.

The broad `0.1` objective system, `0.2` noisy-OR field support, global family-population coverage,
and hard `Lc 60/10` feasibility gates should not be reused.

## Plan Of Action

### Stage 1: Read-Only Contrast Frontier

Build a separately versioned diagnostic that changes no palette output.

For the same 392 authorized development sources, record:

- canonical foreground APCA over background and surface;
- canonical accent APCA over background and surface;
- every exact-source foreground and accent alternative;
- generated black and white alternatives;
- candidates previously rejected only by an APCA floor;
- Pareto frontiers across contrast, source role evidence, identity evidence, and provenance;
- signed polarity and magnitude for every declared relation.

Re-evaluate every existing commented case and classify whether its miss is availability,
representative fidelity, provisional-policy rejection, role membership, feasibility, or ranking.

Stopping rules:

- output must remain byte-for-byte canonical;
- no source under `10/` through `14/` may be opened;
- all APCA relations must be finite and recomputable;
- the diagnostic must not label a target family from comment text;
- fixed APCA floors must not enter feasibility.

### Stage 2: Connected-Family Representative Fidelity

Improve connected-family availability without passing new candidates to role inference.

- Retain multiple component-local exact representatives when one hue-window center merges visibly
  different source modes.
- Keep deterministic ordering, exact masks, mask hashes, and source-pixel provenance.
- Preserve the non-overlapping Lloyd field partition.
- Keep connected-family candidates absent from every field edge.

Stopping rules:

- all six known availability cases remain covered;
- equal-histogram isolated specks remain rejected;
- every representative lies inside its exact connected mask;
- the previously green-shifted yellow family exposes a more faithful source representative;
- canonical palette output remains unchanged.

### Stage 3: Incumbent-Preserving Accent Candidate

Use canonical `0.19` as the incumbent. Freeze:

- background;
- foreground;
- surface;
- gradient state;
- expressive output;
- quantized output.

Enumerate only the incumbent accent, exact-source connected-family accent proposals, and existing
legal foreground/accent collapse.

A challenger may replace the incumbent only when:

- it has stronger role-local identity evidence;
- it is not clearly contrast-dominated by the incumbent on the primary background;
- its background APCA evidence remains finite and source-recomputable;
- surface APCA is retained as secondary evidence rather than a hard gate;
- it satisfies source provenance, role membership, cardinality, and collapse constraints;
- it changes no collateral role or gradient state;
- it passes the established incumbent-relative chroma, saliency, and collateral-loss guards.

Evaluate every material change directly against canonical `0.19`, not against a rejected or
unreviewed successor.

Development review passes only if:

- every changed complete palette is reviewed;
- no candidate is weak or unacceptable;
- no baseline is judged stronger;
- at least one candidate is judged stronger;
- no hard structural violation occurs;
- every unchanged output remains exact canonical `0.19`.

### Stage 4: Foreground Policy Experiment

Keep generated fallback behavior unchanged until this separate stage.

Then compare source and generated foreground alternatives using:

- APCA magnitude over both fields;
- worst-field contrast as comparative evidence;
- source typography and detail evidence;
- source identity and palette composition;
- an explicit generated-color prior;
- complete-palette comparison rather than isolated text contrast.

Expose the source-versus-generated Pareto frontier instead of declaring source candidates
infeasible below one font-agnostic floor. Use targeted review to learn the acceptable product
tradeoff. Do not derive a universal threshold from one artwork or one font assumption.

### Stage 5: Field-Only Candidate

Freeze canonical foreground and accent. Allow changes only to background, surface, and gradient
state.

Use the `0.3` relation components to generate alternatives:

- source-derived field eligibility;
- jointly observed endpoint mass;
- zero-preserving harmonic conjunction;
- connected source topology;
- separate distinct-flat and gradient evidence;
- positive-distance subtle-gradient legality;
- explicit collapse.

Foreground APCA over both fields remains part of complete-palette evidence but does not veto a
field pair at a fixed `Lc` value. Compare every emitted field treatment directly with canonical
`0.19`, especially all known under-collapse, over-collapse, and endpoint cases.

### Stage 6: Composition

Combine only modules that independently beat canonical `0.19` on their complete changed sets.

```text
canonical 0.19
  -> field proposals
  -> foreground proposals
  -> accent proposals
  -> hard provenance and role constraints
  -> Pareto comparison against the incumbent
  -> emit an attributable reviewed improvement or preserve canonical exactly
```

The combined candidate requires a new version and a new complete changed-set review. Passing one
module does not transfer quality evidence to an interacting composition.

## Success Definition

Beating canonical does not require solving every known miss in one release. A narrow candidate is
an improvement when it:

- preserves canonical output for every unchanged source;
- produces zero hard violations;
- receives no weak or unacceptable judgments on its complete changed set;
- receives no baseline-stronger judgments;
- receives at least one candidate-stronger judgment;
- has an attributable mechanism and predeclared stopping rules.

Generalization and promotion remain separate claims. No reserve should be opened until a candidate
is frozen after passing its authorized development evaluation and complete changed-set review.
