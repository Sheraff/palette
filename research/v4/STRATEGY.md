# Palette Research v4: Strategy

**Status:** v4 research strategy revised from independent audits as of 2026-08-30. This document
defines how v4 investigates the problem. It does not choose an algorithm, select components,
construct a graph, prescribe a capability ladder, set a build order, or duplicate the mechanism
census.

`PROJECT.md` defines the inherited product problem, output contract, evidence, corpus custody, and
negative results. In particular, v4 inherits no solution architecture and is not an implementation
of a v2-3 or v3 prototype. (`research/v4/PROJECT.md:1-8`, `:375-386`)

The v4 sibling documents have distinct jobs:

- `PROJECT.md` is the inherited problem, evidence, custody, and constraint context.
- `MECHANISMS.md` is the current compact mechanism census. It exists now; its coverage, entry
  boundaries, claims, and interpretations remain revisable as primary evidence is rechecked.
- `STRATEGY.md` is this research and authorization policy. It does not select entries from the
  census or turn their descriptive inputs and outputs into architecture.

Flo is the sole user-level scientific and quality decision authority. Flo's recorded rulings govern
funding, protected-data access, review serving, interpretation disputes, advancement, promotion,
closure, and any exception to standing policy. Agents and the orchestrator may identify a decision,
assemble and verify its evidence, recommend options, route it, and record Flo's ruling; they may not
make or imply the ruling themselves. An unresolved conflict or policy gap is escalated to Flo rather
than settled by agent consensus (`research/v4/PROJECT.md:108-115`).

## 1. What v4 is

V4 is an evidence-decomposition and mechanism-validation program before it is an algorithm
implementation.

The repository has repeatedly produced locally plausible mechanisms, mechanically valid outputs,
and complete implementations that still made poor complete treatments. It has also repeatedly
found that a useful color being present does not imply that it can reach the right role, survive
construction and filtering, or win
(`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:100-113`). Exact pixels,
deterministic execution, exhaustive search, provenance, and technical gates can all coexist with a
bad palette (`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:94-113`;
`research/PALETTE_EXTRACTION_QUALITY_RESET_HANDOFF.md:186-223`). V4 therefore starts by asking what
transformations have actually been tried, what each one claims, what evidence supports it, what
information it needs and loses, and how its behavior can be inspected independently.

The initial program is not to implement another top-to-bottom extractor. It is to:

- maintain the current mechanism census as falsifiable claims rather than as old files, modules, or
  named systems;
- define only the artifact contracts needed to inspect and test those claims;
- validate semantic mechanisms in isolation with purpose-built visualizations and scoped review;
- distinguish conditional competence from natural handoff performance and downstream utility;
- expose composition effects before treating mechanisms as compatible; and
- preserve complete rendered-treatment review as the only product-quality endpoint.

Only after the census evidence and the artifact contracts relevant to a future architecture question
are understood may future work infer component boundaries, dependency structure, capability
relationships, and build order. That future inference is not performed in this document.

## 2. Precise terminology

The terms below prevent research objects from quietly becoming architecture decisions.

### 2.1 Mechanism

A **mechanism** is a falsifiable causal claim embodied as a transformation or decision rule. A
compact census entry may describe its inputs, outputs, assumptions, expected consequences, and
possible conditions that would defeat its interpretation without yet defining typed artifact
contracts. Before implementation or evaluation, a richer experiment record declares the exact
transformation, formal falsifiers, and information effects. The preferred unit is the smallest
operation whose effect can be isolated honestly. If several operations cannot be separated without
changing the claim, the record identifies a compound mechanism rather than inventing false
atomicity.

A mechanism is not a component. One mechanism may later be implemented across several components,
and one component may later host several mechanisms.

A normative policy, prohibition, preference, or documentation rule is not by itself a mechanism.
It enters the mechanism census only when implemented as a testable transformation or gate with
explicit inputs, outputs, behavior-changing semantics, and a condition under which its causal claim
would fail. Otherwise it remains policy and is cited as authority rather than counted as algorithmic
evidence.

### 2.2 Artifact

An **artifact** is a possible immutable, typed, inspectable data product produced or consumed during
research. Its type describes semantics, units, cardinality, provenance, uncertainty, and null
behavior, not a future class hierarchy or public API. An artifact may be development-only, may have
multiple producers, may be consumed by several independent studies, or may never become a runtime
boundary.

Artifact typing is an inspection and custody tool. V4 must not serialize every intermediate value,
create a universal artifact base class, or freeze future APIs merely because a value can be named.

### 2.3 Reviewed artifact

A **reviewed artifact** is an artifact plus an immutable custody record and one or more immutable
review records. An endorsement is scoped to the exact item, supplied rendition, semantic question,
visualization or renderer, review version, and exposure history. It is not universal ground truth
and is not necessarily unique. Several accepted alternatives, question-scoped rejections,
ambiguity, no-answer, and null states remain in custody rather than being collapsed to one target.

The full reviewed artifact is never the consumer input. Diagnostic consumers receive a separately
materialized minimal projection under Section 6.

A reviewed artifact may be used as known-good diagnostic input under the firewall in Section 6. It
does not become runtime evidence, and a result obtained from it is not an end-to-end result.

### 2.4 Component

A **component** is a future implementation or runtime boundary with cohesive responsibilities,
ownership, lifecycle, and resource behavior. Components may be inferred only after mechanism and
artifact evidence exists. Historical modules and artifact types do not become components by
default.

No components are selected here.

### 2.5 Capability

A **capability** is an externally observable competence under declared conditions, supported by a
specific evidence scope. It is not a stage of code, a mechanism name, a score band, or a claim that
all prerequisites form a total order. Capabilities may be conditional, independent, overlapping, or
incomparable.

No capability ladder is prescribed here. Future evidence may support a partial order rather than a
ladder, and that outcome must remain allowed.

### 2.6 Dependency

A **dependency** is a supported claim that one study or behavior requires information or semantics
supplied by another result. Matching input and output types establish only possible compatibility.
They do not establish a dependency or an architectural edge. Dependencies may be conditional,
replaceable, bypassable, or satisfied by several alternative producers.

No dependency graph is constructed here.

## 3. Nonlinearity is a design constraint

The census must not be interpreted as a pipeline. Funded artifact-oriented experiments may describe
mechanisms as many-input, many-output transformations, but data and experimental dependencies must
be allowed to:

- fan out to several consumers;
- converge from several independent sources;
- bypass an intermediate interpretation;
- retain several competing hypotheses;
- use one of several interchangeable producers;
- participate in a versioned experimental cycle when iterative evidence or refinement genuinely
  requires one;
- remain incomparable rather than forcing a winner; or
- be absent, rejected, ambiguous, or out of domain.

Fan-in is not neutral plumbing. Arbitration, caps, deduplication, pruning, ordering, normalization,
and tie-breaking are mechanisms whenever changing them can change an outcome. Candidate caps and
staged winners have historically created displacement and robustness avalanches
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:140-157`). Their information effects must be visible rather
than hidden behind an interface.

V4 should develop from image-facing foundations toward complete treatments because unsupported
assumptions closest to the image can contaminate everything that consumes them. This is research
priority informed by dependency risk, not a claim that the eventual algorithm is a linear
pipeline. Reviewed or manually curated artifacts can bootstrap parallel downstream studies before
a natural producer is ready. Bypass experiments can test whether an intermediate interpretation is
needed at all. Convergence and feedback may create cyclic experimental dependencies as long as
versions, termination, and information flow are explicit. Such a research cycle does not select a
runtime cycle. A single directed acyclic graph, or even the need for one, must not be assumed before
the evidence warrants it.

The research modes in Section 11 are non-sequential authorization classes, not stages. Any study may
seek pre-execution authorization as soon as its own prerequisites pass and may begin once that
authorization is granted. No mechanism is required to traverse every mode, and no mode establishes
runtime order. Studies may overlap, branch, fan out, converge, bypass one another, cycle through
versioned experiments, pause, or remain incomparable as long as custody and write ownership remain
explicit.

## 4. Minimal artifact discipline

V4 should define an artifact only when independent inspection, reproducibility, reuse, or controlled
substitution justifies one. No common serialization format or universal API is required at the
strategy stage.

When an artifact is persisted, its contract should carry the minimum information necessary for its
claim:

- artifact type and schema revision;
- exact source path and content hash where source-bound;
- supplied rendition identity, source dimensions, and processed dimensions;
- producer mechanism identity, code and configuration fingerprint, and parent artifact identities;
- coordinate system, color space, units, precision, and cardinality where applicable;
- semantic claim and declared scope;
- exact native-pixel witnesses or traceability where the claim depends on source pixels;
- alternatives, uncertainty, and abstention representation;
- distinct states for unknown, no evidence, evidence of absence, rejected, invalid, and out of
  domain where those distinctions matter;
- deterministic ordering and tie semantics;
- an information-loss ledger naming every discard, merge, cap, quantization, pruning operation, or
  irreversible decision; and
- visualization, question-contract, renderer, review, and exposure identities when reviewed.

The current product boundary requires exact source-pixel publication for ordinary colors and records
bounded input and rendition metadata; it does not imply broader provenance
(`research/v4/PROJECT.md:50-97`). Intermediate artifacts need exact native-pixel traceability only
where their own claims require it, but they must never imply stronger source custody than they
actually preserve.

Typed does not mean certain. An artifact contract should preserve alternatives or explicit
abstention rather than manufacture a scalar confidence. V3 found that model confidence could be
nearly constant and useless (`research/v3/oracle/premise/CD_RESULT.md:133-139`).

## 5. Isolated visualization and scoped review

Every semantic mechanism requires a purpose-built visualization that makes its exact claim
inspectable without requiring the reviewer to infer it from a final palette. The visualization
should show the supplied image, the mechanism output in its native semantic form, source witnesses
or overlays where applicable, alternatives, uncertainty, and abstention. It should not quietly ask
whether the output is attractive when the claim is structural or semantic.

Each semantic review must freeze:

- the question and answer vocabulary;
- the visualization and renderer version;
- the source bytes and rendition;
- the mechanism and artifact versions;
- presentation metadata, including any displayed color names;
- blinding and side-order rules;
- reviewer exposure history; and
- the interpretation and stop rule before responses are opened.

No review may be called blinded until an independent content-channel identifiability audit has
passed. The audit inventories every channel visible or inferable by the reviewer other than the
intended treatment content, including labels, names, IDs, ordering, layout, dimensions, rendering
artifacts, loading behavior, metadata, and deterministic side assignment. It then tests whether arm,
provider, expected answer, or review history can be identified from those channels. Side shuffling
alone is not sufficient. If consequential identity remains inferable, the review is described by
the narrower concealment it actually provides rather than as blinded.

The answer model must permit acceptance, rejection, ambiguity, no valid answer, and free text where
appropriate. It must not force an aesthetic score onto a semantic question. Prompt wording and UI
affordances have changed recorded judgments in prior work
(`research/v3/oracle/premise/CD_RESULT.md:9-23`;
`research/v2-3-eval/TRANSCRIPT_ARCHAEOLOGY.md:119-127`), while the Phase 3 grade-only rounds provided
little causal diagnosis (`research/v4/PROJECT.md:129-133`).

Mechanical claims use mechanical invariants, exact reconstruction, deterministic repeats,
inspection, and independent verification. A mechanical pass is not semantic support or visual
quality. The repository's strict custody protocols explicitly distinguish structural validity from
scientific support and preserve falsified, unsupported, contradictory, and incomparable results
without manufacturing an aggregate winner (`research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:450-493`).

Independent semantic review is also not product review. A locally correct semantic artifact can
still be placed in the wrong role, combined badly, or turned into an unfaithful treatment. Complete
treatments must be judged jointly (`research/v4/PROJECT.md:292-315`).

### 5.1 Finite human-review budget

Human review is a finite campaign resource, not an automatic consequence of generating an artifact.
Every proposed review batch must enter a review-budget ledger before it is served and declare:

- exact item count and duplicate-component count;
- question count per item, total question burden, and estimated reviewer time;
- the one named research or product decision the batch is intended to inform, with Flo as the
  decision-maker;
- a fixed completion and early-stop rule;
- expected information yield and why machine evidence cannot answer the question;
- risk strata and controls represented;
- follow-up work that is explicitly not authorized by the batch; and
- a positive reserve of genuinely fresh full-treatment review capacity that remains unavailable to
  semantic and diagnostic batches.

The exact reserve size is a Flo campaign-policy decision, but it must be set before diagnostic
review spending and cannot be backfilled with already exposed items. A batch that cannot name the
decision it informs, stop rule, or expected information yield is not eligible for pre-execution
authorization. A completed batch supplies evidence; it does not make the decision.

Full factorial human review is not presumed feasible. Automated censuses should establish blast
radius, asymmetry, mechanical interactions, and destination classes first. Risk-ranked covering
designs may select interactions, strata, and alternatives for human review when the full cross
product exceeds the declared budget. The design and omissions are preregistered before outcomes are
visible. Covering evidence remains scoped to the combinations represented; it cannot claim that
untested compositions are safe. Complete-treatment capacity remains reserved because only that
review can support product quality.

## 6. Reviewed artifacts as known-good diagnostic inputs

A reviewed output may serve as a known-good input to later research only under a narrow declaration:

```text
known-good(item, rendition, artifact type, semantic question,
           visualization or renderer, review version, exposure history)
```

Known-good means adequate for that declared claim. It does not mean unique, globally correct, fit
for every consumer, or admissible at runtime.

The full custody record must preserve:

- every accepted alternative rather than a single canonical target;
- rejected alternatives without broadening the question they answer;
- ambiguity and reviewer abstention;
- null and no-answer states;
- the exact question and presentation;
- any earlier exposure to related artifacts or complete treatments; and
- superseding review without rewriting the earlier record.

Rejection is scoped only to the review question, item, rendition, and presentation. A rejected answer
to one semantic question is not a generally invalid artifact, a known-bad complete treatment, an
out-of-domain case, or evidence that every consumer should reject it.

Human-authored and reviewed artifacts are development-only. They must never enter the cold runtime
path described by `PROJECT.md` (`research/v4/PROJECT.md:17-24`). Their use must not be reported as
generalization or complete treatment quality.

### 6.1 Consumer-facing minimal projection

A diagnostic consumer never receives the reviewed artifact or its custody envelope directly. An
independent projection step produces the smallest value that satisfies the declared consumer input
contract. Review and exposure metadata remain in a separate custody store joined only by the
experiment harness after consumer output is sealed.

The consumer-facing projection must exclude:

- comments and free-text rationale;
- reviewer corrections and original proposals;
- acceptance, rejection, preference, or grade labels;
- exposure history and review chronology;
- review, batch, artwork, and alternative identifiers;
- alternative ordering or the number of sibling alternatives unless cardinality is itself the
  preregistered semantic input;
- filenames, corpus membership, and duplicate-component identity; and
- downstream-answer equivalents, role targets, expected colors, or any field from which a trivial
  decoder can recover the desired downstream result.

The projection may carry only the semantic value, uncertainty or abstention state, coordinate and
unit contract, and source witnesses required by the consumer. It receives its own schema revision
and content hash. Harness-side mappings from projections to custody records are inaccessible to the
consumer.

An intentionally answer-bearing upper bound is not a known-good projection. It uses the distinct
input class `answer-bearing-upper-bound`, a separate diagnostic consumer and experiment identity,
and a declaration of the exact answer-equivalent semantics supplied. It may contain only the minimum
semantic answer needed for the bound, never verdicts, grades, comments, preferences, corrections,
exposure history, source identity, or custody metadata. Its outputs are labeled privileged
diagnostics and are barred from natural-handoff, generalization, runtime, product-quality, and
advancement claims. They may not be mixed with standard consumer results or used to fit the natural
producer or consumer.

Before use, an independent agent performs a target-sufficiency and metadata-channel audit. The test
rebuilds inputs with removable metadata deleted, nonsemantic metadata permuted, transport IDs
regenerated, and accepted alternatives reordered outside the consumer boundary. Consumer output
must remain invariant. Any changed output is leakage or an underspecified semantic contract. If a
trivial decoder can recover the downstream answer from a standard projection, the study fails the
firewall. The input may be rebuilt only under a new `answer-bearing-upper-bound` record with the
restrictions above.

### 6.2 Accepted alternatives and condition matrix

Conditional testing covers every accepted alternative for an item unless the protocol freezes a
non-outcome-selected sample before downstream results are generated. Sampling may be risk-stratified
or budget-limited, but it cannot select the alternative that makes the consumer look best. Reports
identify the sampling rule, give the outcome for each tested alternative, and report spread,
worst-case behavior, disagreements, and sensitivity across alternatives. An average alone is not
sufficient.

Natural and known-good inputs form a joint diagnostic matrix. Known-good input is not a temporary
stage that is later replaced by natural input. Each funded study preregisters every applicable cell
and explains any omitted cell:

| source condition | nominal | perturbed | null or out of domain |
| --- | --- | --- | --- |
| natural producer | actual handoff behavior | producer and interface sensitivity | absence, invalidity, or unsupported natural state |
| accepted known-good projection | conditional competence per tested alternative | consumer sensitivity independent of natural producer | explicit abstention and failure containment |

Question-scoped rejected artifacts may appear in a separate negative-control row only when the
consumer claim asks the same question under the same contract. They are not silently mapped to null,
invalid, or out of domain.

The matrix separates questions that must not be collapsed:

- **Conditional competence:** can the mechanism perform its own claim across accepted adequate
  inputs?
- **Handoff performance:** does it still work with natural upstream errors, uncertainty, and
  distribution?
- **Downstream utility:** does its output improve the declared consumer behavior rather than only a
  local proxy?
- **Complete-treatment quality:** does the final rendered treatment work for the artwork?

Known-good success with natural-input failure points toward an upstream or interface limitation.
Failure in both conditions points toward the consumer or an underspecified contract. Success in
isolation followed by failure in composition is a new interaction failure. Natural success with
known-good failure requires investigation of representativeness and contract mismatch rather than a
favorable headline.

## 7. Review-data firewall and custody

The review-data firewall is a hard boundary around all mechanism code, including development-only
mechanisms, as well as inference and runtime code. Source IDs, filenames, hashes used as identity
shortcuts, verdicts, grades, comments, corrections, preferences, target colors, color names,
expected outputs, exposure history, and custody mappings never enter a mechanism process, feature,
prompt, configuration, ranker, fitter, fallback, or cache. Runtime behavior must not depend on corpus
lookup, reviewed artifacts, or precomputed per-item data.

The only review-field exception is harness-side use for custody, batch sampling, offline evaluation
scoring, and adjudication. Those operations run outside the mechanism process after its output is
sealed; their allowlisted result may enter a report, but their review fields and derived encodings do
not flow back into mechanism execution. Outcome-aware sampling is recorded as development exposure.
The separately typed `answer-bearing-upper-bound` diagnostic in Section 6.1 is not a waiver for raw
review fields: its dedicated consumer receives only the declared minimal semantic answer projection
and its result remains privileged and non-generalizing.

Required controls are:

- allowlisted input fields for every research runner and runtime candidate;
- process or serialization boundaries that make harness custody joins unavailable to mechanism code;
- exact source-path and content-hash custody rather than prefix IDs;
- duplicate-component separation and automatic development-exposure tracking;
- append-only review and decision records with supersession;
- a generated per-study exposure log rather than manual recollection;
- blinded semantic and complete-treatment presentation where the question permits;
- separation in reviewer session or reviewer pool between artifact endorsement and downstream
  treatment review where feasible;
- implementation scans for forbidden labels, fixture paths, source hashes, and expected colors;
- transitive scans and perturbation checks for derived encodings of forbidden fields;
- independent reconstruction of review inputs immediately before serving; and
- explicit labeling of every manual, reviewed, model-assisted, or otherwise runtime-inadmissible
  artifact.

Any development exposure of an item automatically marks every member of its current detected
duplicate component exposed for the corresponding evidence channel. Exposure events include human
review, manual curation, known-good construction, correction access, prompt or threshold fitting,
targeted debugging, and outcome-aware sampling. The tracker records component-graph version,
source hashes, event type, question, renderer, and timestamp. When duplicate membership changes,
fresh and held-out eligibility is recomputed conservatively. The graph is known to undercount
duplicates, so component separation is a lower-bound control rather than proof of independence
(`research/v4/PROJECT.md:205-212`).

The warehouse contains autosave snapshots, and review volume must be deduplicated by batch and item
rather than counted as rows (`research/v4/PROJECT.md:135-157`). Existing verdicts are scoped,
relative, rendition-bound guardrails, not fitting targets (`research/v3/V3_PLAN.md:60-66`).

### 7.1 Citation and revision anchoring

Path and line citations are navigation aids, not immutable evidence identity. Mutable or untracked
working v4 drafts may use paths and line ranges during exploration and need not contain or acquire a
self-hash. They remain explicitly draft and non-authoritative; their statements cannot by themselves
authorize execution, protected access, review, advancement, or promotion.

Exact revision binding becomes mandatory when a source or finding is frozen into a protocol or
preregistration, handed off as authority, or used to support authorization, scientific
interpretation, advancement, or promotion:

- tracked files use repository commit and blob identity plus path;
- untracked or mutable files use raw content hash, byte count, path, and observation timestamp;
- generated artifacts use content hash, generator identity, configuration, and regeneration command;
- review claims bind warehouse record IDs and the query or deduplication rule used; and
- web or literature sources use a stable primary reference plus a captured-content hash when local
  analysis depends on mutable retrieved content.

For a bound untracked document, a workspace path alone is not a stable authority. A document cannot
contain a hash of its own final bytes; an external manifest, handoff, freeze record, or decision
record binds it. If a bound source hash changes, an independent citation/source-checking agent must
re-read and either reaffirm, amend, or supersede the dependent finding before authoritative reuse.
Frozen execution evidence applies the same principle to source bytes, code, configuration,
renderer, and question contracts (`research/GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md:7-21`,
`:56-65`).

## 8. Evaluation without a composite score

There is no single v4 performance score. The product admits multiple valid answers, scalar
currencies tested in prior work failed as aesthetic judges, and aggregate improvement stories have
already hidden incomparable populations and objectives (`research/v4/PROJECT.md:163-187`,
`:330-345`).

Each experiment must pre-register one or more primary statistics appropriate to its exact claim,
their direction, bars, falsifiers, and stop conditions. Primary statistics do not become a global
currency. Results are also reported through a multidimensional scorecard containing the applicable
dimensions:

- structural and contract validity;
- semantic acceptance, rejection, ambiguity, and abstention;
- coverage and missing-output rates;
- false additions and false removals, reported symmetrically where both are harms;
- natural versus known-good handoff gap;
- downstream utility under a declared consumer;
- complete-treatment pairwise and absolute review distributions when applicable;
- changed-output destination classes and blast radius;
- robustness under relabeling, re-encoding, rendition, resolution, and small perturbations;
- sensitivity to caps, ordering, ties, and each tunable parameter;
- runtime, peak memory, and resource failures;
- parameter count and provenance; and
- structure-stratified distributions, tails, worst cases, contradictions, and incomparable results.

Advancement uses noncompensatory bars. A gain on one dimension cannot buy permission to violate a
hard invariant, leak review data, cross a runtime limit, create a severe known-worse destination, or
fail a preregistered falsifier. Means must not hide strata or one-way damage. Asymmetric mechanisms
require a census because a sampled batch may not reveal the damaging direction
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:218-231`).

Parameter provenance remains explicit from birth: reviewed, measured, fitted, inherited, held,
uncalibrated, or single-case evidence as applicable. A fitted value records its fitting population
and artifact. Parameter budgets and sensitivity checks are established before accumulation, not
reconstructed later. The historical parameter and perturbation evidence makes this a primary
research dimension rather than code hygiene
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:501-510`).

Before implementation evidence can advance, an agent other than the implementation author must
generate a parameter census independently from the complete code and execution closure, then
reconcile it against the author's declared record. The census includes behavior-affecting choices,
not only numeric constants:

- numeric thresholds, weights, scales, budgets, and resource limits;
- booleans, enums, branch and fallback order, stop conditions, and relaxation order;
- prompts, answer vocabularies, parsing rules, and model settings;
- tie policies, sort keys, iteration order, seeds, and identity keys;
- renderers, color conversions, interpolation rules, decoders, and preprocessing;
- inclusions, exclusions, sampling rules, masks, corpus filters, and exception paths;
- caps, deduplication keys, normalization domains, and arbitration rules; and
- anonymous literals or behavior sites absent from the declared parameter record.

The independent census reports declared-only, code-only, anonymous, and provenance-mismatched sites.
Unreconciled sites block scientific interpretation of sensitivity and parameter honesty. When the
implementation emits outputs, sensitivity is measured separately on reviewed or development-exposed
duplicate components and on unseen duplicate components, with the ratio and distributions reported.
This check is required even when aggregate sensitivity appears acceptable because prior work was
materially more stable on reviewed than unseen artwork
(`research/v2-3-experiments/provenance-hygiene/REPORT.md:59-76`).

## 9. Census entries and funded experiment records

V4 uses two record depths. The current `MECHANISMS.md` is a compact census, not a collection of
fully specified artifact transformations. A richer experiment record is required only when a census
entry or a bounded composition is funded for implementation or evaluation. This avoids freezing raw
historical descriptions into premature APIs.

### 9.1 Compact census entry

Each current census entry follows the descriptive model already used by `MECHANISMS.md`: identity
and title, four named status dimensions, causal claim, descriptive inputs and outputs, losses and
risks, and evidence navigation. Authorization is a fifth orthogonal field, not part of any status
dimension. Because the current census grants no action, every existing entry is interpreted as
`inventory-only` unless it points to a separate rich record and Flo ruling. Diagnostic, selection,
composition, funding, and product-use authority or prohibition belongs only in authorization; it is
never encoded as scientific interpretation, implementation state, evidence scope, or runtime
admissibility.

```yaml
censusId: "<stable-descriptive-id>"
title: "<title>"
status:
  scientificInterpretation: "<supported | falsified | unsupported | inconclusive | unmeasured>"
  implementationState: "<live | historical | prototype | instrument | unbuilt>"
  evidenceScope: "<one-or-more compact scope labels>"
  runtimeAdmissibility: "<permitted | prohibited | unresolved>"
authorization: "inventory-only"
claim: "<intended causal effect and what would defeat the compact interpretation>"
inputsOutputs: "<plain-language semantics, cardinality, uncertainty, and provenance>"
lossesAndRisks: []
evidence:
  - source: "<path-or-stable-primary-reference>"
    navigationRange: "<line-range-or-section>"
boundaryNotes: []
```

Compact scientific interpretations help navigate historical evidence; they are not funded-study
dispositions and do not authorize implementation. The compact description of what would defeat an
interpretation is not a frozen preregistered falsifier. Content hashes, exact revision identities,
formal falsifiers, bars, and stop conditions become mandatory only when the claim is frozen,
authoritatively handed off, or promoted into the rich record below. Census entries need not name
persisted artifacts, settle exact mechanism boundaries, or claim a complete transformation
contract. Entries may split, merge, or change interpretation when source rechecking warrants it,
with revision history preserved.

Normative policy remains outside these mechanism statuses unless code implements it as the testable
transformation or gate defined in Section 2.1. Such an implementation receives an ordinary
implementation state; its selection or product authority, if any, still requires separate
authorization.

### 9.2 Rich experiment record

Before implementation or evaluation begins, the funded question receives the richer record below.
The schema is a research template, not a frozen serialization API. Fields that do not apply are
explicitly marked not applicable rather than populated with invented structure.

```yaml
schemaVersion: "<experiment-record-version>"
experimentId: "<stable-id>"
revision: "<behavior-and-protocol-version>"
sourceCensusEntries: []
authoritativeSourceAnchors: []
title: "<descriptive-title>"
granularity: "atomic | compound"

claim:
  hypothesis: "<falsifiable causal statement>"
  intendedEffect: "<scoped effect>"
  nullHypothesis: "<expected result if ineffective>"
  falsifiers: []
  includedScope: []
  excludedScope: []
  unresolvedScope: []

relations:
  - relationId: "<local-id>"
    when: "<condition under which this relation exists>"
    inputs:
      - name: "<semantic input>"
        interfaceKind: "raw | artifact-contract | control | external-observation"
        inputClass: "natural | known-good-projection | answer-bearing-upper-bound | control | external-observation"
        contractReference: "<optional>"
        cardinality: "<cardinality>"
    outputs:
      - name: "<semantic output>"
        interfaceKind: "raw | artifact-contract | diagnostic"
        contractReference: "<optional>"
        cardinality: "<cardinality>"
    relation: "one-to-one | fan-out | fan-in | many-to-many | bypass | feedback"
    ordering: "irrelevant | significant | unresolved"
    missingInputBehavior: "<abstain, partial, invalid, or other>"
    terminationOrCycleRule: "<required for feedback, otherwise not-applicable>"

information:
  preserved: []
  derived: []
  discarded: []
  irreversibleDecisions: []
  capsPruningDeduplication: []
  tieBreaking: []
  uncertaintyAndAbstention: []
  informationLossLedger: "<reference>"
  nativeEvidenceTraceability: "required | not-required | unresolved"

artifactAndInstrumentContracts:
  persistedArtifactReferences: []
  purposeBuiltVisualization: "<identity, plan, or not-applicable>"
  mechanicalValidators: []
  consumerProjectionContract: "<reference-or-not-applicable>"

admissibility:
  runtime: "permitted | prohibited | unresolved"
  researchOnlyInputs: []
  prohibitedInformationAudit: "not-run | passed | failed"
  coldPerFileCompatibility: "yes | no | unresolved"
  resourceEnvelope: "<measured-or-unresolved>"

parameters:
  declaredBudget: "<budget>"
  authorDeclaration: "<reference>"
  independentCodeCensus: "<reference-or-pending>"
  reconciliation: "<reference-or-pending>"
  reviewedVsUnseenSensitivity: "<reference, pending, or not-applicable>"

evaluation:
  preregistration: "<content-anchored-reference>"
  unitOfAnalysis: "<unit>"
  sourcePopulationAndSplit: "<custody-reference>"
  primaryStatisticVector: []
  noncompensatoryBars: []
  stopConditions: []
  strata: []
  conditionMatrix: "<natural, known-good, perturbed, null plan>"
  acceptedAlternativeRule: "<all-or-preregistered-sample>"
  downstreamUtilityQuestion: "<question-or-not-applicable>"
  completeTreatmentQuestion: "<question-or-not-applicable>"

reviewCustody:
  questionContract: "<identity-or-not-applicable>"
  visualizationRenderer: "<identity-or-not-applicable>"
  contentChannelIdentifiabilityAudit: "<reference-or-not-applicable>"
  exposureTracker: "<reference-or-not-applicable>"
  targetSufficiencyAndMetadataAudit: "<reference-or-not-applicable>"
  reviewBudget:
    itemAndComponentCount: "<count>"
    questionBurden: "<count-and-time>"
    decisionToInform: "<one Flo decision>"
    stopRule: "<rule>"
    expectedInformationYield: "<claim>"
    reservedFreshFullTreatmentCapacity: "<remaining-reserve>"

composition:
  exactConstituentRevisions: []
  testedContexts: []
  coveringDesign: "<reference-or-not-applicable>"
  untestedInteractions: []
  orderingSensitivity: []
  displacementEffects: []
  conflictingAssumptions: []

evidence:
  entries:
    - claim: "<one atomic claim>"
      scope: "<one evidence scope>"
      condition: "<one input or treatment condition>"
      population: "<one exact population and split>"
      statisticVector: []
      disposition: "<one scientific disposition>"
      sourceArtifacts: []
      revisionAnchors: []
      boundedInterpretation: "<what this establishes>"
      forbiddenInterpretations: []

delegation:
  authorAgent: "<agent-id>"
  independentVerifierAgent: "<different-agent-id>"
  citationSourceCheckingAgent: "<agent-id>"
  integrationReviewAgent: "<agent-id-or-not-applicable>"
  exclusiveWritePaths: []

knownFailures:
  failureModes: []
  harmfulDestinations: []
  outOfDomainBehavior: []
  openQuestions: []

authorization:
  preExecution:
    state: "proposed | authorized | denied | expired"
    mode: "<one named research mode>"
    question: "<one named question>"
    allowedActions: []
    forbiddenActions: []
    floRulingOrStandingPolicy: "<external decision-record reference>"
    recordedAt: "<timestamp>"
  postResultUse:
    state: "not-evaluated | held | authorized | denied | closed"
    requestedUse: "<exact use-or-not-yet-requested>"
    allowedUses: []
    forbiddenActions: []
    floRuling: "<external decision-record reference-or-pending>"
    supersedes: []
    recordedAt: "<timestamp-or-pending>"
```

One experiment can contain several conditional relation descriptions because cardinality and
information flow may differ by condition. The record has no pipeline position, assigned component,
selected dependency edge, capability tier, build order, or aggregate score.

## 10. Evidence-status vocabulary

Scientific interpretation or disposition, implementation state, evidence scope, runtime
admissibility, and authorization are five separate questions. None is derived from another. A
mechanism may have several evidence entries, but each entry addresses exactly one atomic claim, one
scope, one input or treatment condition, one exact population and split, and one preregistered
statistic vector. It receives one scientific disposition. Mechanical and semantic results, natural
and known-good conditions, development and held-out populations, or isolated and complete-treatment
claims never share one disposition. These labels are not a maturity ladder.

### 10.1 Scientific dispositions

| disposition | meaning |
| --- | --- |
| `unmeasured` | The claim is recorded but has no valid result under the declared protocol. |
| `invalid` | Structural, provenance, determinism, schema, leakage, or execution failure prevents a scientific interpretation. |
| `supported` | The preregistered bar passed within the exact recorded scope. This is not universal validation. |
| `falsified` | A preregistered falsifier fired for the recorded mechanism revision and scope. |
| `unsupported` | The valid study did not support the claim, but no declared falsifier closed it. |
| `inconclusive` | The valid evidence is insufficient, contradictory, underpowered, or incomparable under the protocol. |
| `superseded` | A later record replaces this result for current use without deleting its history. |

An invalid run is not a null result. A valid falsification, unsupported result, tie, contradiction,
or incomparable vector is a publishable scientific outcome. Bars do not move and mechanisms do not
change under the same experiment identity after results are visible. Experiment-level summaries may
list the atomic entries but do not receive a synthetic disposition across them.

### 10.2 Evidence scopes

Each evidence entry uses exactly one of these scope values:

| scope | what was tested |
| --- | --- |
| `mechanical` | Invariants, reconstruction, custody, determinism, or resource behavior. |
| `isolated-semantic` | The mechanism's own semantic output under a purpose-built review. |
| `conditional-known-good` | Consumer behavior given reviewed or curated adequate input. |
| `natural-handoff` | Consumer behavior using the natural producer and interface. |
| `perturbation` | Sensitivity, error amplification, and abstention behavior. |
| `downstream-utility` | Effect on a declared consuming behavior without claiming product quality. |
| `composition` | Joint behavior of a specific frozen set of mechanism revisions. |
| `complete-treatment` | Human judgment of the full rendered UI treatment. |

Implementation state uses `live`, `historical`, `prototype`, `instrument`, or `unbuilt`; `tested` is
only a cited qualifier. It cannot upgrade scientific evidence. Runtime admissibility uses only
`permitted`, `prohibited`, or `unresolved` and asks whether the transformation can execute within the
product boundary, not whether it may be selected or used. Compact authorization remains
`inventory-only`, with `diagnostic-only` or a narrower prohibition recorded when applicable; a rich
record carries any named next action. Authorization can arise only from the applicable Flo ruling or
standing policy. A supported diagnostic does not authorize selection, runtime integration,
protected data access, human review, or product promotion unless those actions are explicitly
granted.

## 11. Non-sequential research modes

The modes below are independent authorization classes, not phases, milestones, or a path through
which every mechanism must pass. A study may seek pre-execution authorization in any mode once that
study's own prerequisites are satisfied and may begin after Flo grants it. Modes may run in parallel,
fan out from one artifact, converge on a shared question, use alternate producers, bypass an assumed
dependency, or participate in a versioned experimental cycle. Results may remain incomparable. No
ordering below defines runtime order, a build order, or an architecture.

Within a pre-execution authorization, **Authorized result** below means the scoped artifact or
evidence the study may produce. It is not a scientific disposition, a Flo interpretation, or
post-result permission to use, advance, integrate, or promote what was produced.

### Census-maintenance mode

**Purpose:** maintain the compact `MECHANISMS.md` census from current code, historical code,
experiments, protocols, postmortems, reviews, literature, and other source-backed evidence.

**Prerequisites:** scoped source access, revision anchors, and an assigned research agent plus a
different citation/source-checking agent.

**Authorized result:** revised compact entries, new entries, split or merged boundaries, corrected
evidence anchors, and explicit unknowns. Positive, negative, null, retired, diagnostic-only, and
runtime-inadmissible work remain visible. Important historical claims are re-derived because records
and summaries have repeatedly drifted
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:237-243`).

**Does not imply:** typed artifact contracts, priority, implementation funding, component assignment,
dependency edges, capability relationships, or selection of a base.

### Artifact-and-instrument mode

**Purpose:** define the smallest artifact contract or instrument needed to inspect, substitute, or
reproduce a funded claim.

**Prerequisites:** a rich experiment record, a reason persistence or independent inspection is
needed, declared information losses, and assigned author and independent verifier agents.

**Authorized result:** purpose-specific visualization and question contract for semantic claims;
invariants and independent inspection for mechanical claims; validated source custody,
serialization if used, coordinate and color semantics, deterministic ordering, null states, and
information-loss ledger.

**Does not imply:** that every raw census item needs an artifact, that an artifact type has one
producer or consumer, that a contract is a future API, or that instrument validity establishes
mechanism quality.

### Isolated-claim mode

**Purpose:** test one atomic mechanical or semantic claim without requiring a complete treatment.

**Prerequisites:** a rich experiment record, applicable instrument, exact population, atomic evidence
entry design, finite review budget when human judgment is needed, and independent verification.

**Authorized result:** mechanical evidence from invariants or isolated-semantic evidence from scoped
review, including structure strata, fresh cases where budgeted, repeats, negative controls,
ambiguity, abstention, and worst cases.

**Does not imply:** downstream utility, natural handoff, product capability, or complete-treatment
quality.

### Conditional-consumer mode

**Purpose:** test whether a consumer can perform its declared claim given adequate reviewed or
curated input without waiting for a natural producer.

**Prerequisites:** minimal consumer projections, target-sufficiency and metadata audits, automatic
duplicate-component exposure tracking, accepted-alternative coverage rule, and applicable
known-good, perturbed, and null matrix cells.

**Authorized result:** conditional competence per accepted alternative or preregistered sample,
alternative spread, input sensitivity, required semantics, and abstention behavior. Question-scoped
rejections may be negative controls only for the same question.

**Does not imply:** natural handoff, generalization, runtime admissibility, downstream utility, or
end-to-end quality.

### Natural-handoff-and-utility mode

**Purpose:** test natural producer outputs jointly with known-good projections and determine whether
a local output helps a declared consumer.

**Prerequisites:** applicable natural and known-good matrix cells under one frozen protocol, exact
producer and consumer revisions, handoff contract, perturbation and null plan, and atomic evidence
entries for each condition and population.

**Authorized result:** handoff gap, producer/interface/consumer attribution where identifiable,
error amplification, and downstream utility. Candidate availability, role reachability,
construction, retention, and final selection remain separately visible because they have failed at
different points historically
(`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:100-113`).

**Does not imply:** that known-good input has been replaced, that a local proxy is product quality,
or that composition is safe.

### Composition mode

**Purpose:** test new behavior created when exact frozen mechanism revisions interact.

**Prerequisites:** a rich compound experiment record, exact constituent revisions, risk-ranked
interaction plan, automated blast-radius census where applicable, finite review budget, and an
independent verifier who authored none of the constituent implementation under test.

**Authorized result:** scoped evidence for represented interactions using on/off ablations, covering
designs or fuller factorials as justified, ordering tests where order should not matter, boundary
perturbations, destination adjudication, and treatment review within the finite covering design when
the composition affects the rendered result.

Separately supported mechanisms have previously produced unreviewed outcomes and destroyed known
wins when combined (`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:225-227`). Approval is never
inherited from the parts, and covering evidence does not extend to omitted combinations.

**Does not imply:** universal compatibility, safety under another revision, or architecture
selection.

### Future architecture-inference mode

**Purpose:** in a separate future effort, infer whether evidence warrants component boundaries,
structural relationships, capability relationships, and a build order.

**Prerequisites:** the current census has been source-checked for the question at hand; relevant
artifact semantics and loss contracts are understood; pertinent isolated, handoff, bypass, and
composition evidence is available; incomparable and cyclic experimental dependencies remain
visible; and an independent adversarial review has challenged the proposed inference.

**Possible questions:** whether responsibilities justify component boundaries; whether demonstrated
dependencies, alternatives, bypasses, fan-out, fan-in, convergence, or cycles justify a structural
representation; whether capabilities are prerequisite, independent, conditional, or incomparable;
and which build order minimizes uncertainty and integration risk.

Type compatibility alone is not evidence for an edge. Historical module boundaries are not evidence
for components. Research priority is not runtime order. Capability evidence is not necessarily a
ladder.

This strategy does not authorize this mode yet and stops before its choices. No graph, components,
capability ladder, build order, or v4 architecture are selected now.

### Eventual end-to-end evaluation mode

**Purpose:** evaluate a future candidate cold from the supplied file through a complete rendered
treatment.

**Prerequisites:** a separately proposed and independently reviewed candidate, cold-runtime and
output-contract validity, duplicate-safe frozen data, genuinely fresh reserved review capacity,
controlled rendition and perturbation sets, parameter and runtime audits, destination adjudication,
and a passed content-channel identifiability audit before any claim of blinding.

**Authorized result:** pairwise and absolute human judgments of complete treatments, robustness and
runtime distributions, failure notes, and tightly scoped product-quality evidence. Every human
quality item includes roles, collapse state, and the rendered gradient when present. Several
treatments may be valid for one artwork. An equal verdict imposes no ranking constraint, and a
reviewed-strong result is not a unique permanent target
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:185-195`).

No artifact score, isolated semantic result, mechanical certificate, handoff result, or composition
metric can substitute for this mode. Human judgment of the full rendered treatment remains the only
product endpoint (`research/v4/PROJECT.md:99-106`, `:375-386`).

## 12. Authorization, advancement, and closure rules

There is no global advancement status and no required traversal through the research modes. Two
authorization moments are separate: pre-execution authorization permits one named study to perform
specified actions, while post-result authorization permits specified use of evidence already
produced. Neither promotes a mechanism generally. Both are recorded Flo rulings or applications of
an explicit standing policy issued by Flo; agents and the orchestrator may verify prerequisites and
recommend an outcome but may not grant either authorization.

### 12.1 Pre-execution study authorization

Pre-execution authorization permits only the named question, mode, access, implementation,
execution, instrument, or review actions in one frozen rich record. It does not predict a scientific
disposition or authorize later use. It may be granted only when:

- the question, requested mode, allowed actions, forbidden actions, and expiration or completion
  boundary are explicit;
- the causal claim, exact scope, protocol, primary statistics, noncompensatory bars, falsifiers, and
  stop conditions are frozen before implementation outcomes or result inspection;
- planned source population, split, custody, exposure eligibility, condition matrix, and applicable
  accepted-alternative rule are frozen;
- information inputs, losses, runtime admissibility, forbidden-data controls, and any required
  target-sufficiency or content-channel audit are specified and scheduled before protected use;
- the parameter budget and author declaration exist, and an independent census and reconciliation
  are assigned for any implementation that will be produced;
- any human review fits the prospective finite budget and preserves the fresh full-treatment
  reserve fixed by Flo;
- author, verifier, citation/source checker, integration reviewer where applicable, exclusive write
  paths, resources, and serialized heavy operations are assigned; and
- Flo's ruling or standing-policy reference records the exact authorized actions.

No execution artifact, result, scientific disposition, passed bar, destination analysis, completed
parameter census, or downstream evidence is required at this point. Requiring one would make study
authorization circular. Material change to the frozen question, protocol, data access, review
burden, or allowed action requires renewed pre-execution authorization.

### 12.2 Post-result use and advancement authorization

After a structurally valid run has a frozen-rule proposed disposition, its evidence may be used for
one named interpretation, follow-up, integration, advancement, promotion, or product claim only
when:

- execution and evidence artifacts are structurally valid and independently reproduced by an agent
  other than the author;
- source, code, configuration, question, renderer, exposure, and result custody are complete;
- every evidence entry contains one atomic claim, scope, condition, population, statistic vector,
  and mechanically proposed disposition;
- the relevant noncompensatory bars and falsifiers were applied without a hard-invariant or firewall
  violation;
- all changed destinations and material worst cases are accounted for at a scale proportionate to
  blast radius;
- the independently generated parameter census reconciles to code, and parameters are within budget
  with provenance and applicable reviewed-versus-unseen sensitivity evidence;
- any completed human review stayed within its authorized budget and preserved the fresh
  full-treatment reserve;
- the requested interpretation and use remain within the evidence scope and do not rely on an
  `answer-bearing-upper-bound` result for natural, runtime, generalization, advancement, or product
  claims; and
- Flo records the allowed uses, forbidden actions, and decision rationale.

A protocol may mechanically determine a proposed scientific disposition from frozen rules, but that
calculation does not settle a user-level scientific or quality decision. A passing result never
self-authorizes use, advancement, integration, protected access, more review, or promotion.

Evidence scopes create non-implications, not a sequence:

- Mechanical support establishes only its atomic mechanical claim.
- Isolated semantic support does not establish handoff, utility, composition, or treatment quality.
- Conditional known-good support does not establish natural handoff.
- Natural-handoff and downstream-utility claims receive separate atomic evidence entries even when
  tested in one matrix.
- Downstream utility does not establish safe composition.
- Composition support applies only to the exact frozen combination tested.
- Only complete-treatment review can support a product-quality claim.
- A study may be authorized directly in any applicable mode without collecting irrelevant evidence
  scopes first.

### 12.3 Run closure and proposed scientific disposition

A run closes as invalid when custody, determinism, schema, source safety, leakage, completeness, or
execution requirements fail. It yields no scientific disposition beyond invalidity.

After structural validity, each atomic claim under its exact scope, condition, population, and
statistic vector receives exactly one mechanically proposed disposition under the preregistered
precedence: `falsified` when a falsifier fires; `supported` when its support bar passes and no
falsifier fires; `unsupported` when the valid study misses support without satisfying the stronger
falsifier; or `inconclusive` when the frozen protocol says the evidence is insufficient,
contradictory, underpowered, or incomparable. A mechanism class closes only if the falsifier was
declared at class scope; one failed implementation does not silently refute every possible
formulation. These classifications preserve results; Flo's post-result ruling alone controls their
user-level interpretation and authorized use.

Inconclusive, contradictory, null, and incomparable results are preserved. They do not trigger
threshold repair, bar movement, selective case deletion, or a favorable aggregate. A changed
mechanism, artifact contract, question, bar, or interpretation requires a new revision and new
record. Closed work may be revived only with an explicit new hypothesis or evidence condition.
Supersession is append-only.

## 13. Composition safeguards

Scoped composition evidence is mandatory before promotion because independent quality does not
compose automatically. Human review remains subject to Section 5.1 rather than applying to every
cross-product. For each proposed combination, v4 must ask:

- Do both mechanisms preserve the evidence the other assumes?
- Does fan-in create duplicate authority or contradictory semantic claims?
- Can a new candidate or hypothesis evict an existing one through a cap?
- Does normalization change when another branch is present?
- Does deduplication erase distinct provenance or uncertainty?
- Is a tie-break deciding non-equivalent outcomes?
- Does execution order matter, and should it?
- Does an abstention from one branch become an accidental positive in another?
- Are parameter sensitivities correlated?
- Does robustness worsen even when each isolated output is stable?
- Does the complete treatment expose a role, collapse, gradient, or identity failure absent from the
  isolated views?

Use factorial ablations where feasible and report interaction effects per scorecard dimension, not
as one interaction score. When a full factorial is infeasible, a preregistered risk-ranked covering
design targets shared capacity, convergence, hard interfaces, ordering, correlated parameters, and
known harmful destinations. Automated censuses cover mechanical reach and asymmetry before scarce
human review. Big-swing and asymmetric compositions require a corpus census, destination
adjudication, and budgeted review of high-stakes unknowns. Small compositions may use a fully
adjudicated blast radius. After a constituent revision, rerun the affected regression and
interaction set identified by the frozen risk model rather than claiming that every historical
cross-product was retested. The field guide's historical rule remains the minimum: scoped
composition evidence is required before a composition can be promoted
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:206-240`).

## 14. Specialized-subagent orchestration

All substantial v4 research, writing, implementation, testing, adversarial review, revision,
verification, citation and source checking, integration review, and read-only git inspection is
performed by scoped specialized subagents. This rule applies to strategy and protocol documents as
well as code and generated evidence.

The orchestrator schedules agents, gives each one a bounded scope, passes source-backed findings
between them, assembles decision packets, escalates user-level research and quality decisions to
Flo, and records and routes Flo's rulings. It does not resolve those decisions itself. It also does
not perform substantial repository inspections, source archaeology, drafting, editing,
implementation, test execution, review analysis, verification, citation checking, integration
review, or git inspection itself. A revision or integration agent applies edits; a read-only
git-inspection agent reports status and diffs; the orchestrator routes those reports rather than
reproducing their work.

Every subagent brief must declare:

- one bounded question and its non-goals;
- allowed read paths and exclusive write paths;
- source documents and evidence precedence;
- expected deliverables and their artifact identities;
- required tests, falsifiers, and stop conditions;
- forbidden data and authorization limits;
- resource requirements and whether a heavy run needs serialization;
- the exact handoff format, including file and line citations; and
- unresolved user-level research or quality decisions that must be escalated through the
  orchestrator to Flo rather than hidden or decided by the agent.

Subagents may work concurrently only when their write paths are disjoint. Concurrent edits to the
same artifact are prohibited. Shared-file edits, heavy corpus sweeps, GPU work, review serving,
revision, integration, staging, and publication are serialized by orchestrator scheduling and
performed by the assigned agents. This extends the existing
path-ownership and single-owner resource discipline (`research/v3/CONVENTIONS.md:19-48`, `:73-81`;
`research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:632-645`).

Research, writing, and review-analysis agents hand off source-backed findings with citations, scope,
conditions, uncertainty, and draft status intact. Revision anchors required by Section 7.1 accompany
any finding handed off as authority or used for authorization, interpretation, advancement, or
promotion. Exploratory draft handoffs may remain path-and-line navigation but cannot serve those
uses until frozen and bound.

Independent verification by an agent other than the author is mandatory for every substantial
deliverable. The verifier reconstructs material claims from frozen artifacts, checks authorization
and source anchors, and reports discrepancies before the work can support advancement. An author
cannot verify its own research, prose, implementation, tests, review analysis, citations, or
integration. Testing may be delegated separately from verification, but author-written tests alone
never satisfy independent verification.

An integration-review agent other than the edit author inspects the integrated result and confirms
the intended path set, contract, tests, evidence scope, and absence of unrelated changes. A
read-only git-inspection agent supplies repository status, diff, history, and revision facts; it
receives no write path. Agents do not merge their own work or convert a local pass into an
authorization decision. Only Flo may make the user-level ruling after the verified packet is routed.

The evidence for parallel delegation is bounded. Six parallel read-only agents completed one prior
art search without collisions, but the same record says collision avoidance depended on read-only
scopes and that written work needs explicit path ownership
(`research/v3/phase-1/PRIOR_ART_CHECK.md:119-132`). The native scale-space protocol separately
requires disjoint subagent files and serialized shared edits and publication
(`research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:632-645`). These sources support scoped delegation and
ownership discipline, not unrestricted concurrency or self-verifying agents.

## 15. Anti-patterns

V4 must reject the following patterns:

- choosing an existing algorithm and relabeling its modules as the inventory;
- treating the current compact census as complete, immutable, or already experiment-ready;
- counting a normative policy as a mechanism when no testable transformation or gate implements it;
- requiring every raw census entry to declare a fully typed artifact transformation;
- requiring a mutable working draft to self-hash or treating its path as frozen authority;
- drawing a graph first and then collecting evidence to justify its edges;
- assigning every mechanism a pipeline stage or every artifact one producer;
- requiring every mechanism to traverse the same research modes;
- treating image-facing research priority as proof of runtime order;
- forcing independent or incomparable capabilities into a total ladder;
- turning artifact types into frozen public APIs before their semantics are validated;
- persisting every internal value and creating artifact bureaucracy without an inspection need;
- treating reviewed artifacts as unique truth or runtime inputs;
- passing review or custody envelopes to consumers instead of minimal projections;
- selecting the accepted alternative that gives the best downstream outcome;
- broadening a rejection beyond its exact review question;
- leaking corrections, verdicts, comments, IDs, names, or expected colors into inference;
- calling mechanism access to review fields an unrestricted development-instrument exception;
- reporting an `answer-bearing-upper-bound` result as natural, generalizing, runtime, or product
  evidence;
- claiming end-to-end quality from known-good or manually curated input;
- optimizing an isolated semantic proxy without measuring downstream utility;
- replacing ambiguity with an uncalibrated confidence number;
- collapsing scorecard dimensions into a weighted composite or leaderboard;
- moving bars, fitting thresholds, or deleting cases after results are visible;
- assigning one scientific disposition across mixed claims, scopes, conditions, or populations;
- merging scientific interpretation, implementation, scope, runtime admissibility, or authorization;
- requiring post-result artifacts or passed bars before a study can receive pre-execution
  authorization;
- treating pre-execution authorization or a passing result as permission for post-result use;
- treating fan-in, arbitration, caps, pruning, ordering, or tie-breaking as neutral plumbing;
- inheriting composition approval from independently supported mechanisms;
- using technical validity, determinism, or source support as evidence of aesthetic quality;
- using grade-only batches to invent causal failure explanations;
- calling a review blinded without a content-channel identifiability audit;
- requesting full factorial human review without a finite budget and expected information yield;
- spending the fresh full-treatment reserve on diagnostic convenience;
- counting autosave rows as independent judgments or mixing rendition-scoped labels;
- hiding worst cases behind average performance or role-blind matching;
- allowing agents to write concurrently to the same artifact;
- accepting agent conclusions without primary-source citations and independent verification;
- allowing an author agent to verify its own substantial deliverable;
- allowing an agent or the orchestrator to make a user-level scientific or quality decision for Flo;
- leaving substantial inspection, editing, verification, integration review, or git inspection to
  the orchestrator; and
- letting semantic review consume the human-review budget needed for complete treatments.

## 16. Current non-decisions

This strategy deliberately leaves the following unresolved for later evidence-backed work:

- completeness, granularity, and boundaries of the current `MECHANISMS.md` census;
- which values merit persisted artifact contracts;
- which artifact types have natural producers, alternate producers, or legitimate bypasses;
- any component boundary;
- any dependency graph or runtime topology;
- whether a single graph is an appropriate representation;
- any capability relationship or ladder;
- any algorithm paradigm, search method, role-selection method, or composition policy;
- any build order;
- numerical bars for mechanisms that have not yet received a scoped protocol;
- the point at which evidence is sufficient to begin architecture inference;
- the campaign-wide human-review budget and exact fresh full-treatment reserve;
- quantitative pass criteria for content-channel identifiability audits;
- when accepted-alternative volume justifies a preregistered sample rather than complete automated
  conditional testing; and
- how conservatively to respond when the duplicate-component graph later gains new edges.

These are not omissions to fill informally. They are decisions that require the current census,
artifact-contract studies, and scoped evidence described above.
