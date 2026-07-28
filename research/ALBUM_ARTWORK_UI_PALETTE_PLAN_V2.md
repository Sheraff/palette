# Standalone First-Principles Album Artwork UI Palette Plan

Status: sole normative product-research and implementation direction as of 2026-07-28. This revision adds the
authorized fast Phase 3 iteration mode, shared historical-review evidence, and shared review infrastructure.

This plan supersedes `research/ALBUM_ARTWORK_UI_PALETTE_PLAN.md`. The superseded file remains a
historical artifact and must not be edited or deleted.

An implementation agent should use this document as the complete plan. Historical research plans do
not supply additional architecture, behavior, gates, or defaults and should not be read unless the
user explicitly asks for historical investigation. Existing code under `research/` may be inspected
and reused when it genuinely serves this plan, but prior selector policy is not inherited implicitly.
Code and tests outside `research/` belong to previous attempts and are out of scope.

This plan does not authorize a full-roster or multi-hour run. One remaining multi-hour run may occur
only after all bounded development and preflight gates pass and the user gives a separate literal
`GO`.

## Mission

Build a palette extractor specifically for music album artwork and its use in UI treatments.

Given one supplied album artwork image, return a complete assignment of background, surface,
foreground, and accent roles plus a gradient decision. The assignment must use two to four distinct
colors, feel representative of that particular artwork, and work as one coherent treatment.

This is not a generic dominant-color extractor. It is not a general-purpose image-understanding API,
and it does not need to preserve the logic or architecture of any earlier extractor.

The first-principles product question is:

> Which field treatment, foreground, and optional distinct accent best carry this album artwork's
> identity into the consuming UI?

The next milestone is a fast native-resolution prototype that repeatedly produces several convincing
complete treatments on a diverse development panel. It is not a cache, a learned model, or a
full-roster run.

## Scope

### Input domain

The input is one static music album artwork image. Album artwork may contain photography,
illustration, typography, collage, broad fields, gradients, borders, symbols, or small signature
details, but those structures are considered in the context of album-cover identity rather than as a
generic image taxonomy.

Use the exact supplied image and do the best possible work with it:

- do not search for another copy or resolution of the artwork;
- do not substitute a supposedly better source;
- do not require two different files depicting the same artwork to produce the same palette;
- do not add a cross-resolution or source-variant robustness gate;
- do not create alternate source versions merely to test output stability.

The extractor must still tolerate compression noise and ordinary within-image color variation well
enough to understand the supplied pixels. That is part of interpreting the current image, not a
requirement to make different source files agree.

### Product unit

The quality unit is always a complete role assignment:

```text
(background, surface, foreground, accent, gradient)
```

These values are coupled. A field choice changes which foreground and accent choices work; a useful
accent may reduce the value of a separate surface; role collapse changes cardinality; and a gradient
decision changes how both field colors behave.

Intermediate color families, regions, field hypotheses, endpoint bands, and isolated swatches are
diagnostic evidence. They are not partial products and are not expected to look good by themselves.
Because the five output values are interdependent, an intermediate result can also look misleadingly
bad in isolation even when it is useful evidence for a strong complete treatment. Human
palette-quality judgment before complete assignments exist would therefore reward partial appearance
rather than the product unit. The first product-quality checkpoint intentionally occurs only after
complete assignments can be generated and reviewed jointly in Phase 3. Earlier phases use technical
and evidence gates, not isolated-swatch or partial-palette quality gates.

## Practical Execution Rules

### Research working boundary

All implementation code, tests, scripts, plans, diagnostics, and generated research artifacts for
this effort belong under `research/`.

- Do not run tests or application code outside `research/`; they belong to previous attempts.
- Do not use an unscoped root test command that discovers tests outside `research/`.
- Run focused tests under `research/tests/` that cover the code currently being changed.
- Root package-management and runtime tooling may be used to launch a `research/` entry point, but the
  executed product or test code must remain inside the research boundary.
- If implementation appears to require changing or running code outside `research/`, stop and ask the
  user rather than silently expanding scope.

Artwork source folders remain outside `research/` and are read-only inputs, as defined under Data And
Custody.

### Fast Phase 3 iteration mode

Phase 3 development must optimize for useful complete-treatment feedback, not procedural artifact production.
Historical protocols and postmortems may explain prior results, but their one-factor restrictions, separate
authorization boundaries, immutable handoffs, hash ceremonies, and stop rules do not govern new ordinary
development iterations. This document is the sole current authority.

The working unit is one mutable Phase 3 development candidate. Do not assign a new semantic version, create a
new protocol, publish an immutable experiment namespace, hash every dependency, run multiple worker schedules,
blind development output, or write a postmortem for each threshold, weight, quota, geometry, representative, or
small implementation change.

An ordinary iteration is:

1. state the mechanism or product failure being addressed in a short scratch plan;
2. implement the generic change;
3. run focused mechanism tests and contract tests;
4. run only the development sources needed to answer the current question;
5. emit normalized complete treatments and diagnostics into a replaceable scratch namespace;
6. look up exact historical review evidence before requesting new feedback when the corresponding warehouse
   adapter is available;
7. inspect materially changed complete treatments in the shared review UI, or an existing compliant gallery
   while the shared service is being bootstrapped; and
8. keep, revise, combine, or discard the change based on visible product value and generic behavior.

Ordinary iterations do not need to prove an independent scientific claim. One deterministic execution is
normally enough. Repeat an execution when nondeterminism is suspected, when concurrency changes, or when a
candidate is approaching a meaningful checkpoint. Development comparisons may be direct and unblinded.
Blinding and counterbalanced side assignment are reserved for a meaningful candidate comparison or the Phase 4
fresh directional review.

Several independently justified mechanisms may be developed and combined when the product has several failure
causes. Do not require one mechanism to repair unrelated cases, and do not reject a useful selector repair
because a separate source still needs field discovery. Use ablations when they help decide whether a mechanism
earns integration, not as a ritual for every numeric adjustment.

The following remain mandatory in every iteration:

- inference depends only on supplied image pixels and frozen generic policy;
- output obeys the complete role, collapse, gradient, source-support, and emergency-color contract;
- deterministic source-independent ordering is used;
- source IDs, hashes, paths, filenames, review IDs, comments, labels, color names, prior treatment keys, and
  literal target colors do not enter inference;
- focused generic fixtures cover the mechanism being changed, including relevant negative controls;
- output is evaluated as a complete UI treatment rather than isolated swatches; and
- no full-roster or multi-hour run occurs without the separately required literal `GO`.

#### Iteration tiers

Use three levels of rigor.

**Scratch iteration** is the default:

- mutable output under `research/data/scratch/album-artwork-palette-v2/`;
- one bounded source subset and one worker schedule;
- focused tests rather than the complete historical suite;
- no protocol, implementation closure, raw-hash manifest, blind assignment, or postmortem;
- direct comparison with the current Phase 3 anchor and exact historical evidence; and
- immediate deletion or replacement of unhelpful generated scratch output is allowed.

**Integration checkpoint** is used after one or more mechanisms show visible value:

- one explicit candidate/configuration identity;
- the 28-source development panel under one normal schedule;
- exact changed-winner and changed-slate reporting against the current Phase 3 anchor;
- the known-failure sources and known-strong controls called out explicitly in the report;
- historical exact-treatment evidence joined after extraction;
- short human review queues containing only unresolved materially changed treatments; and
- one repeat or alternate worker schedule when the integrated execution path changed in a way that could affect
  determinism.

**Candidate freeze** is used only when the integrated candidate appears ready to leave Phase 3:

- frozen implementation and configuration identity;
- complete local executable closure and source manifest;
- deterministic reproduction under the declared schedules;
- immutable normalized candidate and review manifests;
- blinded comparison where a relative product claim is being made;
- absolute quality judgments in addition to relative preferences; and
- the complete Phase 3 gate before any new Phase 4 sample is opened.

Rigor may move upward when the expected decision value warrants it. It must not be applied retroactively to
make an already visibly poor treatment authoritative.

### Parallel Phase 3 development

Use parallel agents for genuinely different work, not duplicate ceremony around one implementation. One
integration owner controls shared core files. Attempt agents should work in isolated worktrees or own distinct
new modules, fixtures, tests, and scratch namespaces so their changes can be evaluated independently and merged
without concurrent edits to the central extractor.

Create one behavior-neutral Phase 3 attempt contract before the first attempt wave. It should expose read-only
native evidence and bounded extension points for field proposals, endpoint representatives, role obligations,
logical treatment descriptors, materialization, ranking, and slate construction. The existing `0.7.2` default
and closed `0.7.4` anchor must remain byte-identical through this extraction. Attempt modules must not load
historical results, reviews, source manifests, or filesystem metadata.

The initial parallel attempt wave should cover these independent tracks:

1. **Role-aware identity and selection:** distinguish foreground-like typography or polarity evidence from
   accent-like signature evidence, retain ambiguity when evidence is ambiguous, and compare complete
   complementary role assignments.
2. **Native field-transition discovery:** permit source-connected broad transitions to use intermediate bridge
   families and multi-stage internal progressions without treating hard regions, stripes, object-local lighting,
   or unrelated colorful objects as fields.
3. **Band-local endpoint refinement:** retain the useful same-family gradient idea while deriving endpoint
   distributions, representatives, and support from their actual spatial bands rather than cloning whole parent
   families.
4. **Factorized complete-treatment materialization and slate:** prevent traversal order and the 1,500-treatment
   cap from denying construction or slate space to later high-value field, role, collapse, and identity
   directions.
5. **Deterministic complete-treatment selection:** improve winner and slate ordering over already available
   treatments with interpretable complete-treatment relations rather than historical incumbent lookup or an
   opaque learned score.

Each attempt must emit the same normalized result contract:

- attempt and configuration identity;
- exact source SHA-256 for evaluation custody, never as inference input;
- complete canonical role assignment and gradient state;
- public alternatives;
- source-support and legality diagnostics;
- score and selector trace;
- runtime; and
- material differences from the current Phase 3 anchor.

Attempt agents may use all authorized development images and historical review evidence to choose research
questions and evaluate output. Their extraction modules may not read that metadata or evidence. A dedicated
architecture test must reject imports of review, warehouse, artifact, manifest, path, and filesystem modules
from candidate-generation and ranking modules.

Develop the tracks concurrently, then integrate based on product evidence. Candidate availability changes are
normally integrated before selector changes so ranking does not hide a deficient domain, but an independently
useful selector or slate fix may enter the working candidate while field research continues. Do not assume that
every successful attempt belongs in the final combination. Compare the integrated candidate with and without a
mechanism when its contribution is unclear.

Use one global compute budget across concurrent attempts. Up to ten source workers may run in total; do not give
each attempt its own ten-worker pool and oversubscribe the host. Prefer small diagnostic subsets while several
agents are active.

### Historical review evidence warehouse

All historical review artifacts, including files previously marked private, protected, or sealed, are
authorized for development evidence recovery. Build one derived read-only SQLite warehouse at
`research/.cache/palette-review-evidence/warehouse.sqlite`. Existing JSON and generated review artifacts remain
the authoritative immutable inputs; the database is disposable and reproducible.

The warehouse must preserve rather than flatten review semantics. Store absolute judgments, pairwise
preferences, setwise valid-option judgments, gradient or field-state classifications, issue tags, and free-text
comments as distinct record types. Never convert an unselected option into an absolute rejection, a pairwise
preference into a quality tier, or a historical `shippable` response into `strong`.

At minimum, normalize:

- raw artifact path, byte identity, schema adapter, and exact JSON pointer;
- exact source SHA-256 and any separately recorded artwork-family relationship;
- exact visible treatment identity from role RGB values, generated flags, collapse semantics, and gradient
  state;
- a separate render-variant identity when direction, topology, interpolation, typography intervention, or
  presentation materially changes the judged treatment;
- candidate version and configuration provenance;
- review contract, presentation version, side assignment, and unblinded treatment mapping;
- original structured response, issue tags, comment, and timestamp verbatim;
- copied, transferred, repeated, superseded, and independent-judgment lineage; and
- unresolved or conflicting bindings without guessing.

Human evidence is directly reusable only when exact source bytes, exact visible treatment, compatible rendering,
and compatible review question match. Perceptually related treatments, alternate source files, comments about a
desired color, and same-artwork-family matches are diagnostic context only. Conflicting exact judgments remain
conflicted and enter a review queue rather than being resolved by latest-write or majority shortcuts.

The warehouse should produce these practical reports for every integrated candidate:

- exact absolute-quality coverage;
- exact pairwise history;
- repeat and conflict audit;
- related-treatment context for engineering diagnosis;
- unresolved source or treatment bindings;
- a minimal new-review queue; and
- estimated review work avoided by exact evidence reuse.

The warehouse is evaluation infrastructure, never an inference input. Keep its tooling outside extractor modules,
do not export warehouse readers from product research code, and add an architecture test that prevents candidate
generation, scoring, ranking, or tie-breaking from importing SQLite, warehouse reports, feedback, comments, or
review-derived labels.

### Shared complete-treatment review service

Create one reusable complete-treatment review application and stop creating experiment-specific review UIs.
The canonical implementation should live under `research/complete-palette-review-v2/`, with shared types under
`research/src/complete-palette-review-v2.ts` and one configurable server entry point.

Attempt and integration agents submit a validated review manifest; they do not write HTML, CSS, client logic,
or a new server. The service supports:

- absolute review of one complete treatment;
- pairwise review with independent absolute quality for both sides;
- autosave, per-case editing, keyboard navigation, and resumable feedback;
- exact V2 gradient rendering and legal collapse display;
- artwork embedded borderlessly in the treatment;
- black-and-white surrounding chrome;
- mandatory `colornames-oklab` labels, role names, generated status, and collapse status;
- canonical quality labels, pairwise labels, issue tags, and verbatim comments; and
- atomic per-case feedback upserts rather than one irreversible batch submission.

The manifest binds source bytes and complete treatments. The server derives presentation-only color names and
collapse labels, hides candidate identity when a job is blinded, validates role legality, and exposes one stable
API for review, existing feedback, feedback updates, and artwork bytes.

The shared queue builder should:

1. group exact duplicate treatments across attempts;
2. skip visually unchanged anchor comparisons;
3. use exact historical evidence when compatible;
4. queue conflicts, genuinely novel top-one changes, diagnosis-relevant alternatives, and the novel slate
   treatments needed to evaluate representative strategy, collapse, cardinality, and candidate availability;
5. compare novel groups with one declared anchor instead of creating every pairwise combination; and
6. keep ordinary review waves short by default while allowing the reviewer to request or continue into more
   items.

Development review need not be blinded. Use blinded deterministic side assignment when selecting between major
integrated candidates or performing Phase 4. Presentation-side assignment never enters scientific output.
Queue minimization and historical evidence reuse apply only to development and integration review. Phase 4 must
show every member of its frozen sample under the complete Phase 4 contract even when a treatment is unchanged or
has historical development evidence.

### Fast iteration rollout

Execute the loop in waves with explicit file ownership.

**Wave 0 runs three infrastructure tasks in parallel:**

1. extract the behavior-neutral Phase 3 attempt contract and build the bounded multi-attempt runner;
2. build and validate the historical-review warehouse and exact-evidence query reports; and
3. build the shared complete-treatment review service and manifest validator.

Each infrastructure task should deliver a thin usable vertical slice first. The runner initially needs only the
closed anchor and one attempt adapter; the warehouse initially needs only exact V2 treatment lookup; and the
review service initially needs only validated absolute and pairwise jobs with per-case save. Broader historical
adapters, reports, autosave refinements, and additional algorithm adapters continue in parallel and must not
block useful algorithm output.

Before Wave 1, select and seal a replacement Phase 4 directional sample from candidate-output-unseen root `12/`
using source-only metadata. Exclude that exact sample from development extraction and warehouse candidate-output
queries. Keep roots `13/` and `14/` as later reserves unless a recorded checkpoint decision deliberately consumes
them.

**Wave 1 runs the five algorithm attempts in parallel** after the minimal attempt contract is stable. Each attempt
owns new modules and tests, uses a distinct scratch namespace, and compares against the same closed `0.7.4`
anchor. The warehouse and shared review service may continue expanding during this wave. Attempt agents may
request review through the shared queue or bootstrap gallery but may not implement new experiment-specific
review infrastructure.

**Wave 2 integrates the strongest mechanisms:**

1. preserve or improve candidate availability before relying on ranking;
2. integrate field-transition and endpoint work through the common field contract;
3. integrate role-aware obligations and complementary role construction;
4. integrate factorized materialization and slate retention; and
5. apply selector changes to the resulting complete domain.

The integration owner uses small mechanism-specific subsets during merges, then runs one 28-source integration
checkpoint. Review only unresolved materially changed treatments after exact historical lookup. Failed attempts
remain ordinary development history and do not require postmortems.

**Wave 3 freezes only a visibly useful candidate.** Perform strict implementation closure, deterministic
reproduction, bounded development review, and the complete Phase 3 gate once. If it fails visibly, return to the
working candidate rather than creating a custody-only successor version.

### Parallel work

When a repetitive compute-heavy operation is likely to take more than a few seconds serially,
consider running independent units with a bounded worker pool of up to ten workers.

- Prefer source-level or other naturally independent tasks.
- Use fewer than ten workers when task count, I/O, CPU oversubscription, or measured contention makes
  that safer or faster.
- Do not add parallel machinery when startup and coordination cost would dominate a small task.
- Declare the worker count in command output and diagnostics.
- Give each worker independent output ownership and use atomic per-source writes when output persists.
- Scientific output and final ordering must be identical regardless of worker scheduling or worker
  count.
- Optimize for useful feedback latency and total repeated CPU cost, not for a low memory number. This
  plan imposes no arbitrary RSS cap; use available memory freely unless measurement shows paging,
  instability, or worker contention that slows or compromises the work.
- Do not pause scientifically useful research for speculative performance engineering. Profile first,
  and optimize when a measured bottleneck materially slows iteration or is multiplied across numerous
  reruns.
- The final authorized full run is different: it must use exactly ten source workers.

### No randomness

Do not use randomness, including seeded pseudo-randomness, in candidate discovery, clustering
initialization, search, pruning, ranking, sampling, testing, or model fitting unless there is a strong
documented scientific reason and the final scientific result remains deterministic.

Prefer deterministic initialization, explicit total ordering, exhaustive bounded choices, and
predeclared data partitions. Results for the same source bytes, code, policy, and runtime binding must
be identical across repeated runs and worker counts.

The only anticipated presentation exception is blinded left/right assignment in pairwise human
review, where counterbalancing controls a known positional bias. Implement that assignment with a
predeclared deterministic cryptographic-hash rule, not a runtime or seeded PRNG. Presentation-side
assignment must never affect extraction, ranking, or stored scientific palette output. Any additional
exception requires an explicit rationale in the candidate protocol before execution.

## Sole Source Of Product Policy

The implementation must derive behavior from this plan and the supplied artwork, not from incumbent
output or historical case-specific policy.

`region-graph-0.19.0` may be used only as:

- an external comparison baseline after the new extractor has produced its own result;
- historical evidence that some implementation approaches were useful or problematic;
- a possible source of low-level, candidate-independent code that independently satisfies this plan.

It must not be an inference input, fallback palette, ranking anchor, tuple-domain constraint, or source
of inherited thresholds. The new extractor must be able to run without executing or loading the
baseline.

## Product Contract

### Color representation

The plan does not require RGB as the internal or public representation. The implementation may use
OKLab, OKLCH, RGB, or another explicitly chosen representation if it supports the required perceptual
operations and can be displayed correctly in the review UI.

Phase 0 must bind one canonical output representation, its channel ranges, gamut behavior, equality
semantics, and conversion used for display. Internal evidence may retain other representations and
exact source-pixel provenance.

Conceptually, the public result is:

```ts
interface AlbumArtworkPalette<Color> {
  background: Color
  surface: Color
  foreground: Color
  accent: Color
  gradient: boolean
}
```

All four role fields are always present. Cardinality means the number of distinct canonical output
colors, not the number of fields in the object.

### Role collapse

In practice, many artworks are expected to produce their strongest treatment with four distinct
colors because both a separate field and a separate accent can carry additional artwork identity.
This is an empirical expectation, not a preference for four colors or for greater cardinality by
itself. A distinct optional role must improve the fidelity or coherence of the complete treatment; it
collapses when the artwork does not support a defensible contribution from that role. Candidate
generation and ranking must not reward raw color count.

Exactly two equalities may represent collapse:

- `surface === background` means there is no distinct surface;
- `accent === foreground` means there is no distinct accent.

No other role equality is legal. In particular, background and foreground must always be distinct.

Supported cardinalities are:

| Distinct colors | Required equality | Meaning |
| ---: | --- | --- |
| 2 | `surface === background` and `accent === foreground` | One field color and one foreground color |
| 3 | `surface === background`, distinct accent | No separate surface |
| 3 | distinct surface, `accent === foreground` | No separate accent |
| 4 | no equality | Four distinct roles |

Additional invariants are:

- `gradient: true` requires `surface !== background`;
- `surface === background` requires `gradient: false`;
- a distinct surface with `gradient: false` represents a separate flat field or UI layer;
- a distinct surface with `gradient: true` is the second artwork-supported field color;
- for research extraction, review, and contrast measurement, `gradient: true` is rendered as one
  linear gradient from `background` to `surface` with color interpolation in OKLab;
- Phase 0 binds the linear-gradient direction, endpoint placement, gamut conversion, and sampling
  positions, which then remain identical throughout a candidate and its comparisons;
- foreground and accent are inferred against the complete field treatment;
- a weak or redundant optional role must collapse rather than consume a color to increase
  cardinality;
- near-duplicate colors that only imitate a distinct optional role should be penalized in favor of an
  honest collapse.

Role collapse is part of joint inference. It must not be applied later as a repair to an independently
selected four-color palette.

### Exceptional unsupported color

Ordinary output colors must be supported by the supplied artwork. A source-supported color may be an
exact observed color or a tightly bounded representative synthesized inside a densely occupied source
distribution, as defined later in this plan.

One exceptional unsupported color may be introduced only when every artwork-supported
background/foreground pairing has exceptionally low contrast. This includes the degenerate case where
the artwork-supported domain cannot produce the required minimum of two distinct role colors, such as
a genuinely uniform pure-black artwork. Phase 0 must bind the concrete exceptional-low-contrast
eligibility criterion before candidate outputs are reviewed.

This criterion controls only whether an emergency alternative may enter the joint search. It is not a
general contrast floor: source-supported treatments remain legal and contrast remains continuous
evidence. Generated black or white is a last resort, carries an explicit preference penalty relative
to source-supported colors, and may win only when it resolves the exceptional contrast failure well
enough to justify the loss of complete artwork support.

The exception is strictly bounded:

- the introduced color must be pure black or pure white, converted into the canonical output space;
- it may fill either `background` or `foreground`;
- the choice between generated background and generated foreground is made jointly with the complete
  treatment;
- it is considered only after artwork-supported background/foreground alternatives and their contrast
  have been constructed;
- at most one unsupported color may be introduced;
- it must not create an independent surface or accent;
- when it fills background, surface may collapse to it;
- when it fills foreground, accent may collapse to it;
- it is not allowed merely to improve a palette whose source-supported contrast does not meet the
  predeclared exceptional-low-contrast condition;
- authorization does not make it preferred over source-supported alternatives;
- its generated status and reason must be retained in diagnostics and shown in human review.

This emergency black-or-white exception is different from a source-supported synthesized
representative. The latter must remain inside occupied artwork color evidence; the former is
deliberately outside the artwork-supported domain and legal only as the bounded exceptional-contrast
fallback described above.

## Core Principles

### Native resolution is the discovery source

Do not resize the supplied artwork before discovering color families, connected regions, or
signature-color candidates. Downsampling may erase small typography, symbols, objects, highlights,
and other colors that matter to an album's identity.

Blurred, aggregated, or lower-frequency observations derived from the same native raster are allowed
only as supplemental evidence for broad field or gradient interpretation. They must not be the sole
discovery path for a candidate or erase a native candidate before its role evidence is measured.

If an artwork is too large for one in-memory pass, implementation may tile or stream over the exact
supplied pixels. Such optimization must preserve the evidence and connectivity needed by the selected
algorithm rather than silently replacing the artwork with a smaller raster.

### Spatial meaning matters more than global population

The most common color is not automatically the best background, and a small color is not
automatically irrelevant. Keep at least three explicit evidence lanes:

- field evidence from broad, coherent, background-like regions;
- signature evidence from distinctive objects, typography, symbols, and repeated or salient small
  regions;
- foreground evidence from artwork-supported colors that remain usable over the selected field
  treatment.

Lower-level color families may contribute to multiple lanes, but role-specific evidence must not be
collapsed into one generic dominance score.

### Field treatment and field colors are inferred together

A gradient is not an after-the-fact judgment that two independently selected colors interpolate
pleasantly. A gradient hypothesis begins with evidence that the artwork contains a spatially coherent
background transition. Its field colors represent supported portions of that transition.

A non-gradient two-field hypothesis must identify distinct artwork fields or a defensible
background/surface relationship. The generator must not manufacture a distinct surface merely to
reach four colors.

### Representativeness is evidence, not one universal color rule

Neither exact source pixels nor synthesized representatives are universally correct:

- an exact pixel can be compression noise, a transient highlight, or an irrelevant outlier;
- an arithmetic centroid can create a color that does not feel present in the artwork;
- a global medoid can have poor spatial support, especially across a broad gradient;
- a small but coherent exact-color region can be an essential signature color.

Every ordinary emitted color must therefore carry source-support evidence. Exactness is one feature
of that evidence, not the complete policy.

### Candidate availability precedes ranking

First prove that the candidate domain commonly contains good complete treatments. Do not use ranking,
learning, or incumbent fallback to hide missing signature colors, bad field hypotheses, unsupported
representatives, or absent role-collapse alternatives.

### Human quality is judged on complete UI treatments

When human feedback is requested, show each complete palette in a small UI that applies all roles and
the gradient decision together. The UI may be purpose-built for the review; it does not need to become
production infrastructure. Isolated swatches may appear as diagnostics but must not be the sole basis
for quality judgment.

Every human-facing color must be labelled with a color name produced by the `colornames-oklab`
library. This includes development alternatives, selected candidates, baseline comparisons, collapsed
roles, and exceptional generated black or white. Generated black or white must also be labelled as
"generated", often done with a `*` symbol.

Color names are presentation aids only:

- names must not enter candidate generation, scoring, ranking, gates, or learned features;
- names must not define color equality or material difference;
- two distinct colors may legitimately receive the same name;
- review comments that mention a color name remain qualitative feedback, not a target color;
- role labels and collapse status must remain visible alongside the color names.

## First-Principles Architecture

```text
one supplied static album artwork
  -> native raster and perceptual pixel evidence
  -> tolerant color families and connected region hierarchy
  -> role-specific field, signature, and foreground evidence
  -> structured field-treatment hypotheses
       one field
       separate flat fields
       spatially supported gradient field
  -> source-supported representative options
  -> bounded joint search over all four roles and collapse states
  -> pairwise contrast diagnostics
  -> deterministic complete-treatment ranking
  -> diverse complete-palette slate
  -> human review with colornames-oklab labels
  -> optional learned ranking only if later justified
```

## Native-Resolution Evidence

### Pixel evidence

Decode and inspect the supplied artwork at its native dimensions. Preserve enough information to
answer:

- which perceptual colors are present;
- how densely each color neighborhood is occupied;
- where those colors occur;
- whether support is connected, repeated, scattered, or noise-like;
- which colors participate in broad fields, transitions, edges, typography-like structures, or
  salient local regions.

Use a perceptual color space for distance and density calculations. Retain the information required
to convert displayed output faithfully and to link representatives back to source evidence.

### Tolerant color families

Compression and natural within-image variation make exact-value connected components insufficient.
Build color families from perceptually nearby pixels while retaining spatial structure and distinct
modes.

A family should retain at least:

- a color distribution rather than only one center;
- population and local density summaries;
- connected regions or equivalent compactness evidence;
- border, center, quadrant, and broad spatial coverage;
- local contrast and neighboring-family relationships;
- chroma and tone distributions;
- edge and detail evidence;
- source exemplars near important modes.

Do not merge two visibly distinct modes merely because a single arithmetic center lies between them.

### Region hierarchy

Use a region representation capable of retaining both broad fields and small signatures. A fixed-size
region or minimum-population filter must not erase a coherent small region before its saliency and role
evidence are measured.

Useful evidence includes:

- connected area and bounding geometry;
- local contrast to neighboring regions;
- repetition of similar regions;
- border connectivity and corner support;
- interior coverage;
- texture and edge density;
- typography-like or stripe-like geometry;
- membership in larger parent regions.

Candidate and family counts should be capped to avoid extremely long runtime. Use lane-specific
retention so that broad field candidates cannot consume all capacity at the expense of small signature
candidates, or vice versa. Pruning occurs only after the evidence needed to distinguish coherent
support from noise has been measured.

## Field-Treatment Inference

Field inference produces structured hypotheses, not independent background and surface lists.

### One field

A one-field hypothesis identifies one broad artwork-supported family suitable for the UI field. It
records spatial support, texture, border/interior evidence, and representative options.

When selected, it emits `surface === background` and `gradient: false`.

### Separate flat fields

A separate-flat-field hypothesis identifies a background/surface relationship supported by distinct
artwork regions. Evidence may include containment, adjacency, border-versus-interior structure,
coverage, and repeated layering.

It must not be inferred solely from color distance. If the second field does not add defensible
identity or UI value, use the one-field collapse instead.

### Gradient field

A gradient hypothesis must be based on a spatial color transition in a background-like region. Retain
enough internal evidence to distinguish a field gradient from photography, lighting on an object,
several discrete regions, stripes, or a small overlay.

Candidate evidence may include:

- supporting region and coverage;
- fitted direction or topology as internal evidence;
- monotonicity or coherent progression along that topology;
- residual error and unexplained structure;
- endpoint spatial bands;
- color-density support within each endpoint band;
- evidence that both endpoints belong to the same field treatment.

Gradient direction, topology, endpoint bands, progression, and related spatial evidence should remain
available internally for as long as they usefully inform field-color selection, complete-treatment
generation or ranking, contrast diagnostics, pruning explanations, or later persistence. Do not reduce
a gradient hypothesis to its public boolean before those consumers have used the relevant evidence.

The final output does not need to expose gradient direction or topology. The public boolean is only a
projection of the richer internal hypothesis, not a limit on internal representation. The consuming
research UI uses the Phase 0-bound linear-gradient rendering described in the Product Contract rather
than changing its rendering to match each inferred topology.

Select background and surface from robust, supported portions of the observed transition. Do not use
absolute extreme pixels by default, and do not use a whole-gradient center as an endpoint merely
because it is globally representative.

Representative endpoint strategies to compare include:

- dense observed exemplars from robust low and high spatial bands;
- local modes within those bands;
- source exemplars nearest robust band prototypes;
- density-constrained synthesized representatives when no exact exemplar adequately represents an
  occupied band.

## Representative-Color Policy

### Source-support record

Every ordinary candidate color should expose a compact support record containing:

- exact-source status and exemplar coordinates when exact;
- anchor family and region identities;
- perceptual density around the candidate;
- total and connected support near the candidate;
- spatial coverage and concentration;
- distance from robust family or endpoint prototypes;
- outlier and noise evidence;
- any synthesis operation and its bounded distance from occupied source colors.

The exceptional generated black-or-white color instead records its generated role, the source-supported
alternatives considered, the proof that their background/foreground contrast met the predeclared
exceptional-low-contrast condition, and the generated-color preference penalty. When the domain could
not form two distinct colors, that degenerate condition is recorded explicitly.

### Selection hierarchy

Use this initial preference order:

1. Prefer an observed color near a dense family or region mode with meaningful connected support.
2. Use robust means, medoids, or fitted prototypes to locate representative neighborhoods, not
   automatically as emitted colors.
3. Allow a synthesized representative only inside a densely occupied portion of the relevant source
   distribution and when it improves fidelity or avoids noisy exemplars.
4. Penalize exact colors supported by isolated or scattered pixels.
5. Reject colors that introduce an unrelated hue or bridge visibly separate modes through an empty
   portion of color space.

Role-specific behavior is expected:

- field colors may favor broad spatial support and faithful field structure;
- gradient endpoints favor support in their corresponding endpoint bands;
- accents may favor coherent signature regions and local modes, even when globally small;
- foregrounds favor artwork support and compatibility with the complete field treatment;
- exceptional pure black or white is considered only after all artwork-supported
  background/foreground alternatives meet the predeclared exceptional-low-contrast condition;
- even when authorized, exceptional pure black or white remains explicitly disfavored relative to
  source-supported treatments and is selected only through complete-treatment comparison.

Do not freeze exact-source versus density-constrained representation as a global binary choice before
the representative-strategy review in Phase 3.

## Contrast Policy

Contrast is useful UI evidence, but this research plan does not impose a substantive accessibility or
consumer contrast floor. Productized extraction may later accept configurable consumer requirements;
choosing, validating, and freezing those product defaults is outside this plan.

For this research, the candidate protocol must bind a concrete contrast metric and record these
pairwise measurements:

- foreground against background;
- foreground against a distinct surface;
- accent against background when the accent is distinct;
- accent against a distinct surface when both are distinct.

Research-stage hard minimums are disabled, equivalently zero. Contrast magnitude is continuous
diagnostic and ranking evidence, with modest weight, and must not dominate artwork identity or make an
otherwise source-supported complete treatment illegal. The separately bound emergency eligibility
criterion does not reject source-supported treatments; it only authorizes last-resort pure-black and
pure-white alternatives when all source-supported background/foreground pairings have exceptionally
low contrast. Authorization alone does not make an emergency alternative preferred.

Collapsed pairs are not evaluated as separate roles. Foreground and accent need not use the same
utility weighting.

For a gradient treatment, measure applicable role contrast across the Phase 0-bound samples of the
linear OKLab background-to-surface interpolation used by the review UI. This is practical treatment
evidence, not a hard research gate or a requirement to design production rendering infrastructure.

Measuring contrast should use the APCA algorithm, or a newer/better alternative. Do not use the old
WCAG 2 algorithms, they are known to produce poor results.

## Bounded Complete-Palette Generation

Generation begins from retained field-treatment hypotheses and constructs complete role assignments.
It does not select roles independently and combine them afterward.

For each retained field treatment:

1. select representative field-color variants;
2. construct feasible artwork-supported foreground candidates;
3. construct signature-supported accent candidates;
4. include the legal surface and accent collapse alternatives;
5. if and only if the predeclared exceptional-low-contrast condition is met, include disfavored
   pure-black and pure-white emergency alternatives in background and foreground positions;
6. measure all applicable contrast pairs;
7. score the complete treatment;
8. retain materially distinct alternatives.

Use bounded beam search, Pareto retention, or another explicitly capped search. Candidate caps and
beam widths must be declared and measured. Do not restore an exhaustive historical tuple domain merely
because code for it exists.

The generator should normally emit up to eight materially distinct complete alternatives. It may emit
fewer when the artwork does not support eight defensible treatments. Never synthesize weak variants
solely to fill a quota.

Material diversity should consider:

- one-field, separate-flat-field, and gradient treatments;
- background and surface family identities;
- signature family used as accent;
- surface and accent collapse states;
- light and dark field character;
- complete UI appearance, not only tuple distance.

Hard rules include:

- two to four distinct canonical output colors;
- required and distinct background and foreground;
- only the two declared role collapses;
- distinct surface for `gradient: true`;
- finite contrast diagnostics for every applicable pair, without a substantive research-stage
  magnitude floor;
- source support for every ordinary color;
- the tightly bounded emergency black-or-white exception;
- deterministic metadata-independent tie ordering;
- no filename, path, source ID, review case, comment, color name, or target-color branch.

Preferences rather than universal hard rules include:

- exact-source status;
- density and connected support;
- family and signature coverage;
- useful contrast, without allowing it to dominate artwork identity;
- complete-palette coherence;
- whether each distinct optional role earns its place.

## Deterministic Ranking

Start with an interpretable deterministic ranker over complete treatments. Expose its component scores
in diagnostics. It must use deterministic initialization, traversal, pruning, and total tie ordering;
worker scheduling must not affect its result.

Initial score families are:

- **field fidelity:** support for the one-field, layered, or gradient interpretation;
- **artwork identity:** coverage of distinctive and salient source regions;
- **representativeness:** density, connected support, provenance, and synthesis distance;
- **UI utility:** measured contrast evidence and field-role compatibility;
- **coherence:** relationships among all selected role colors;
- **economy:** whether each distinct optional color contributes enough value to avoid collapse;
- **generator confidence:** evidence margins available at production inference time.

Do not add a raw cardinality reward. A four-color treatment should outrank a two- or three-color
treatment only because the distinct surface or accent improves field fidelity, artwork identity, UI
utility, coherence, or another declared complete-treatment quality block enough to earn its place.

Avoid one opaque compensatory sum until score scales are understood. A small number of interpretable
quality blocks or Pareto stages is acceptable. Do not compare candidates to incumbent component scores
during inference.

During development, return both the selected winner and the diverse retained slate. This separates a
candidate-availability failure from a ranking failure.

## Human Presentation And Feedback

### Review UI

Create a small UI whenever human review is needed. It should show the artwork and apply background,
surface, foreground, accent, collapse state, and gradient decision together. Keep presentation
consistent within a comparison or review batch.

Every displayed role must show:

- role name;
- swatch or visible role application;
- `colornames-oklab` color name;
- collapse status when it equals its permitted partner;
- generated status for exceptional black or white.

Numeric coordinates or a display conversion may also be shown for diagnostics, but color names are
mandatory in all human-facing results.

Besides the preview mock UI, all other colors in a review UI should be black and white to avoid visual biases. The preview mock UI should be built only of the palette colors. In the preview mock UI the album artwork should be embeded in the background without borders to help with visual comparison.

### Quality labels

Useful absolute labels are:

- `strong`;
- `acceptable`;
- `weak-fallback`;
- `unacceptable`;
- `uncertain`.

Useful pairwise labels are:

- candidate stronger;
- baseline stronger;
- similarly valid;
- neither acceptable;
- uncertain.

The reviewer-facing issue tags are deliberately small and non-technical:

- `missing gradient`;
- `extraneous gradient`;
- `incomplete artwork identity`.

All tags are optional. The free-text comment box is the primary place for granular feedback. Do not
ask the reviewer to diagnose internal mechanisms such as candidate availability, representative
support, field topology, collapse policy, or ranking.

After review, the implementation agent must:

- preserve the original tags and comment verbatim;
- read the complete comment rather than relying only on fixed tags;
- infer and record the likely technical failure class or classes separately from the human response;
- connect that interpretation to general evidence, generation, or ranking mechanisms;
- mark an interpretation uncertain when the comment does not support a reliable diagnosis;
- preserve a trace from each inferred class back to the original response.

The agent's inferred classes are development diagnostics, not reviewer-provided labels. Free-text
comments and `colornames-oklab` names must never become target colors, model features, named-case
patches, or inference branches.

## Evaluation Design

### Album-artwork coverage

Development and evaluation samples should cover album-artwork structures rather than named failures:

- minimalist and near-uniform artwork;
- broad linear, radial, and irregular gradients;
- photography and portraits;
- monochrome and low-chroma work;
- highly chromatic and multi-hue work;
- typography-led covers;
- small but important signature colors;
- frames, borders, and strong corner fields;
- collage and high-detail artwork;
- compressed or noisy artwork;
- flat layered fields;
- artwork with no defensible distinct accent;
- artwork with no defensible distinct surface;
- artwork whose source-supported background/foreground alternatives all have exceptionally low
  contrast;
- genuinely one-color artwork requiring the emergency exception.

These categories guide sample balance and diagnostics. They must not become source-specific inference
branches.

### Development review versus fresh directional review

Development galleries are engineering tools. They may be reviewed repeatedly and used to improve the
algorithm. Their judgments are not independent evidence of generalization.

Before candidate outputs are known, preselect a small candidate-output-unseen review sample from
authorized artwork. Use an explicit human choice or deterministic source-only rule, not random
sampling. Freeze its membership before opening candidate results. This review is a directional product
gate, not a population-wide statistical claim and not a reason to access unauthorized artwork.

After development, freeze one deterministic candidate and run it on that sample without changing
code, policy, weights, output representation, or sample membership. Compare its top result with the
external `region-graph-0.19.0` result in a blinded complete-treatment review. Use `colornames-oklab`
labels on both sides while hiding algorithm identity. Assign sides with the predeclared deterministic
hash rule.

Collect absolute quality for the candidate in addition to relative preference. Report complete counts,
individual failure classes, review limitations, and any repeated-case consistency. Do not claim a zero
population regression rate from a small observed sample.

The baseline is run only after the new candidate has independently produced its output. It never
enters candidate generation, ranking, fallback, or feature computation.

## Execution Plan

The phase order deliberately postpones human product-quality judgment until Phase 3. A product result
is the coupled five-value assignment `(background, surface, foreground, accent, gradient)`, and the
meaning or quality of any earlier field, color, endpoint, or role candidate depends on values that do
not yet exist. Phase 1 and Phase 2 diagnostics may therefore look incomplete or misleadingly poor to a
human reviewer while still supplying useful evidence. Evaluate those phases only against their stated
evidence and mechanism gates; do not insert an earlier partial-palette quality gate.

### Phase 0: Bind the product experiment

Write a short candidate protocol that binds:

- this plan as the sole normative implementation direction;
- the canonical output color representation and display conversion;
- exact role equality and cardinality semantics;
- the emergency black-or-white eligibility criterion, generated-color preference penalty, and required
  diagnostics;
- linear OKLab gradient rendering, including direction, endpoint placement, gamut conversion, and
  contrast-sampling positions;
- which gradient direction, topology, endpoint-band, progression, and spatial-support evidence remains
  available internally to downstream field selection, generation, ranking, diagnostics, and
  persistence even though public output exposes only a boolean;
- contrast metric, pairwise measurement policy, and confirmation that research-stage hard floors are
  disabled;
- native-resolution discovery requirement;
- candidate and search bounds;
- development-panel selection policy;
- fresh directional-review selection and sealing policy;
- iteration-latency measurement and optimization policy;
- structured review schema and mandatory `colornames-oklab` labels;
- authorized local source roots, development/reserve assignments, and the requirement to ask only before
  accessing a dataset outside the shared workspace;
- confirmation that the remaining full run is unused.

Select a diverse development panel of approximately 20 to 30 exact-source groups from the authorized
sources, using each source collection according to its documented purpose. Also preselect and seal a
small fresh directional-review sample before candidate outputs are known. Selection must be explicit
or deterministic and must not depend on candidate output. Avoid overweighting exact duplicates, but do
not add a requirement that different source files of the same artwork produce matching palettes.

Gate:

- output and collapse semantics are unambiguous;
- the development panel covers the listed album-artwork structures;
- the fresh sample cannot be inspected through candidate outputs during development;
- human-facing results will use `colornames-oklab`;
- no unauthorized source is accessed;
- no implementation work depends on reading historical research plans.

### Phase 1: Native evidence and simple baseline domain

Implement the smallest native-resolution evidence path that can retain broad fields and coherent small
signatures. Keep it in memory and do not design the production cache yet.

Build a simple evidence baseline using tolerant color families, spatial support, and mode, medoid, or
nearest-prototype representatives. This phase validates candidate evidence; it is not expected to emit
good complete palettes and must not be judged as a product treatment.

Use synthetic album-like fixtures to exercise:

- a one-pixel noise color;
- a small coherent signature region;
- repeated small signature regions;
- compression-like variation around a flat color;
- two distinct modes with a misleading centroid;
- a broad smooth gradient;
- discrete stripes that must not be called a gradient;
- a photographic transition that must not become the background field;
- a genuinely uniform one-color artwork.

Gate:

- native signature regions survive long enough for role evidence to be measured;
- isolated noise does not outrank coherent support;
- lane-specific bounds retain both field and signature evidence;
- output evidence is deterministic for the supplied image;
- no pre-discovery resize occurs;
- single-source runtime and CPU use are measured, and the command remains practical enough for the
  current research loop; this is an iteration target, not a seconds-level phase gate.

### Phase 2: Field-treatment hypotheses

Implement one-field, separate-flat-field, and gradient hypotheses from native spatial evidence. Retain
useful internal support, direction, topology, endpoint-band, and progression evidence through the
downstream decisions that consume it even though the public output exposes only role colors and
`gradient`.

Produce a diagnostic gallery showing, for each development source:

- retained field hypotheses;
- supporting regions;
- gradient evidence and endpoint bands where applicable;
- representative options;
- reasons for pruning alternatives.

This is still an evidence diagnostic, not a product-quality review. Do not reject the approach because
isolated hypotheses or representatives look incomplete without foreground, accent, and collapse
decisions.

Gate:

- gradients arise from observed spatial transitions rather than arbitrary color pairs;
- broad gradient classes have plausible endpoint bands;
- flat layers, stripes, and photographs are not routinely mislabeled as gradients;
- one-field collapse remains available when no second field is justified;
- at least one defensible field hypothesis exists for the large majority of the development panel;
- failures are attributable to visible evidence or hypothesis construction rather than opaque scores.

### Phase 3: Representatives and complete joint alternatives

For the same retained families and field hypotheses, compare:

- dense exact source exemplars;
- source medoids or source exemplars nearest robust prototypes;
- density-constrained synthesized representatives.

Add foreground and accent candidates, both legal collapse choices, contrast diagnostics, the emergency
black-or-white alternatives, bounded complete-palette generation, and initial deterministic score
blocks.

This is intentionally the first product-quality phase because it is the first phase that produces the
complete coupled five-value product unit. Emit up to eight diverse complete alternatives per
development source and show them in a review UI with mandatory `colornames-oklab` labels. Include all
four cardinality structures when supported, without treating higher cardinality as inherently better:

- two colors with both optional roles collapsed;
- three colors with surface collapsed;
- three colors with accent collapsed;
- four distinct colors.

Human checkpoint:

- label complete alternatives for absolute quality;
- identify which representative strategy best preserves artwork identity;
- verify that surface and accent collapse occur when a distinct role is not earned;
- verify that exceptional black or white is considered only when all source-supported
  background/foreground alternatives meet the predeclared exceptional-low-contrast condition and that
  it remains disfavored rather than becoming a routine contrast improvement;
- collect only the three reviewer-facing issue tags and granular free-text feedback;
- have the implementation agent read each comment and separately infer the likely technical failure
  mechanism;
- do not compare only isolated swatches or intermediate evidence.

Gate:

- good complete treatments are commonly present in the retained slate;
- gradient-heavy artwork yields artwork-supported field colors;
- small signature colors are available when visually important;
- synthesized representatives do not routinely look invented;
- exact representatives do not routinely encode noise;
- optional roles collapse honestly rather than producing weak near-duplicates;
- four-color treatments win because their distinct roles improve the complete representation, not
  because greater cardinality receives a reward;
- all ordinary colors have source-support records;
- the feedback loop remains practical by using appropriately bounded development subsets and
  parallelism; optimize only measured repeated bottlenecks.

If acceptable treatments are rarely available, continue evidence and generation work. Do not train a
ranker or add incumbent fallback to hide a deficient domain.

### Phase 4: Deterministic candidate and fresh directional review

Use development evidence to freeze one deterministic selector and one representative-color policy.
Run it on the preselected fresh sample without changing code, policy, weights, output color space, or
source membership.

Review the new candidate against external `region-graph-0.19.0` in a blinded complete-treatment
comparison with deterministic hash-based side assignment. Show both sides using the same small UI and
label every role color with `colornames-oklab`. Also collect absolute candidate quality so that a
relative win over a weak baseline is not mistaken for a strong product result.

Report:

- candidate-stronger, baseline-stronger, similarly-valid, neither-acceptable, and uncertain counts;
- absolute candidate quality;
- counts for missing gradient, extraneous gradient, and incomplete artwork identity;
- agent-inferred technical failure classes with links to the original comments;
- repeat consistency if repeats are included;
- runtime and resource use;
- the limits of the small directional sample.

Do not iterate on the fresh sample after opening it. If the result is insufficient, return to
development and select a new future review sample before freezing another candidate.

Advancement requires visible complete-palette improvement, commonly acceptable or strong absolute
quality, and no repeated systemic failure class. It does not require pretending that a small sample
proves population-wide superiority.

### Phase 5: Persistence and performance

Only after a useful candidate exists, define a candidate-independent evidence schema and persistent
per-source shard format. Preserve the native evidence required by field inference, representative
selection, and complete generation without reopening the image.

Resolve the topology boundary explicitly. Persist either candidate-independent topology evidence,
enough compact spatial evidence to answer bounded topology questions, or a clearly declared
policy-bound derived stage. Do not call an incomplete intermediate object a reusable cache.

Add:

- strict schema parsing;
- payload and source hashes;
- wrong-source and wrong-policy rejection;
- truncation and corruption tests;
- atomic per-source writes;
- verified restart and skip behavior;
- image-free cache-consumer closure;
- parity between image-bound and cached candidate output.

Gate:

- cached and image-bound output agree on the frozen sample;
- cached single-source generation materially improves repeated iteration or has a measured explanation
  for why persistence is not the limiting cost;
- development-panel cold and cached runtimes are measured and practical for the intended research and
  review loops;
- persistence does not alter scientific output;
- completed valid per-source work survives interruption.

### Phase 6: Optional learned ranking

Skip this phase if deterministic ranking is adequate.

Consider learning only if complete-treatment reviews repeatedly show that strong alternatives are
available in the retained slate but the deterministic selector chooses the wrong one. Candidate
availability, field inference, representative quality, role collapse, and contrast-measurement
problems are not ranking-training problems.

Before fitting any model:

- recover exact complete treatments behind every usable label;
- group duplicate sources and related artwork appropriately;
- freeze production-available feature formulas and missingness behavior;
- exclude paths, filenames, source IDs, review IDs, comments, color names, and target colors;
- reserve evaluation groups that do not participate in fitting or feature design.

Training, partitioning, and evaluation must obey the no-randomness rule. If a learning library cannot
provide deterministic fitting at a practical measured runtime, do not use it.

Prefer a small regularized pair-difference or ordinal model. Evaluate the complete generator-to-top-one
pipeline with grouped validation. Do not introduce a learned hard veto unless rejection thresholds,
abstention, out-of-domain behavior, and the all-rejected outcome are defined and independently
supported.

Retain deterministic ranking unless learning clearly improves end-to-end top-one selection.

### Phase 7: Full-run preflight and explicit decision

Only after the candidate has visible fresh-review support:

- freeze code, policy, output representation, representative rules, research contrast measurement and
  ranking policy, evidence schema, explicit full-run source roster, diagnostics, runtime, and
  implementation closure;
- test resumability, corruption handling, and cached/image-bound parity on bounded samples;
- measure a ten-worker resource envelope on the bound host;
- define per-source atomic evidence, result, and receipt stages;
- prove that valid completed stages are skipped after restart;
- freeze the full-run namespace and predicted wall time;
- present improvements, regressions, unresolved failures, and validation limits.

The one remaining multi-hour run requires a separate literal `GO`. It must use exactly ten source
workers. A crash or source-local failure must not cause valid completed source stages to rerun.

The full run is frozen-roster evaluation and cache population, not an iteration loop.
Mechanical completion does not substitute for the human quality evidence collected before launch.

## Runtime And Iteration Policy

Runtime policy protects the feedback loop without turning early research into a performance project:

- record wall time, CPU use where practical, worker count, and relevant source dimensions for
  development runs;
- seconds-level single-source work and minutes-level development batches are desirable iteration
  targets, not hard scientific gates; early or unusually difficult work may take longer when it is
  producing useful evidence;
- profile before optimizing, and prioritize a bottleneck when its measured CPU cost materially slows
  feedback or will be multiplied across numerous reruns;
- use bounded source subsets for ordinary iteration rather than repeatedly processing a broad panel
  when the current question does not require it;
- repetitive independent work should be considered for a CPU-appropriate pool of up to ten workers,
  while avoiding oversubscription that reduces throughput;
- this plan imposes no fixed RSS budget or 1 GiB limit. Available memory may be used freely; intervene
  only when measured paging, instability, or contention harms runtime or correctness;
- no full-roster or multi-hour command may run before the separate explicit `GO`;
- performance work must not reintroduce pre-discovery downsampling;
- the implementation must not add cross-resolution comparison work or alternate-source processing;
- cached and product runtime targets are considered only after the evidence boundary and a useful
  candidate are known.

## Data And Custody

- `images/` is an authorized hand-picked collection of high-quality album artworks with especially
  difficult palettes. Use it as a development stress set, not as a representative population sample.
- `music-artworks/` is an authorized personal music-library collection. It contains both album artwork
  and non-artwork images. Use it for personally relevant qualitative reference; do not treat the whole
  folder as an album-artwork-only benchmark or training population.
- `00/` through `11/` are authorized development-facing test datasets. They contain only album artworks, with
  varied and sometimes low source quality, and may be used freely for development, bounded testing, galleries,
  and evaluation.
- `12/` through `14/` are authorized candidate-output-unseen reserves. Wave 0 must seal a replacement Phase 4
  sample from `12/` using source-only metadata before Wave 1. Do not run development candidates on that sample.
  Preserve `13/` and `14/` for later checkpoints by default.
- All local artwork datasets in the shared workspace are authorized for this effort without another permission
  request. Before extraction, assign any otherwise unlisted local root to development or reserve use and record
  the roots actually used. Accessing a dataset outside the shared workspace still requires user authorization.
  Continue treating all source files as read-only.
- All historical review manifests, feedback, analyses, private assignments, sealed records, and generated review
  artifacts are authorized for unsealing, normalization, querying, and development use.
- Existing V2 fresh/protected samples have already been consumed historically and are development evidence, not
  fresh generalization evidence. Opening an authorized reserve no longer requires another user authorization,
  but it requires a recorded checkpoint decision, exclusion of any still-frozen sample, and honest reclassification
  of the opened sources as development evidence.
- Do not search inside or outside the authorized roots for alternate versions of an artwork.
- Exact duplicates may be grouped to avoid overweighting evaluation, but output agreement across
  different files is not a product gate.
- Paths, filenames, source IDs, review IDs, comments, color names, and target values are forbidden
  inference features.
- Development comments may explain failure classes but may not become named-case branches.
- All executable code and tests for this effort remain under `research/`; source artwork roots are
  read-only data exceptions to that working boundary.
- Existing dirty and untracked research work must not be reset, cleaned, reformatted, or overwritten.

## Stop And Redesign Conditions

Stop the current approach before a full run if:

- native discovery still loses coherent signature colors before role evidence is measured;
- gradient hypotheses are effectively inferred from already-selected arbitrary color pairs;
- the candidate domain rarely contains an acceptable complete treatment;
- representative synthesis routinely produces colors that do not feel present in the artwork;
- exact exemplars routinely select noise or irrelevant pixels;
- gradients cannot supply robust artwork-supported field colors;
- optional roles routinely receive weak near-duplicate colors instead of collapsing;
- emergency black or white is admitted without every artwork-supported background/foreground
  alternative meeting the predeclared exceptional-low-contrast condition;
- emergency black or white becomes routinely preferred rather than remaining a penalized last resort;
- contrast handling begins acting as an undeclared hard veto, dominates artwork identity, or introduces
  unsupported black or white merely to improve nonexceptional contrast;
- the deterministic selector routinely under-ranks clearly good available alternatives and no
  defensible ranking method resolves it;
- candidate quality depends on filenames, comments, color names, named artworks, or target colors;
- a learned model only improves in leaky or ungrouped validation;
- scientific output depends on randomness, seeded initialization, worker count, or worker scheduling;
- implementation or test execution expands outside `research/` without explicit approval;
- the feedback loop becomes too slow for practical human-guided development;
- proceeding requires unauthorized data, reading historical plans for hidden policy, or weakening a
  failed scientific gate.

Do not stop merely because Phase 1 or Phase 2 intermediate evidence does not itself look like a good
palette. Such evidence can be misleadingly poor when viewed outside the five-value product unit.
Product quality is intentionally first judged in Phase 3 after complete coupled alternatives exist.

## Definition Of Progress

Progress means:

- the exact supplied album artwork is analyzed at native resolution;
- broad fields and small meaningful signature colors both survive candidate discovery;
- field treatments reflect the artwork's spatial structure;
- useful gradient direction, topology, endpoint-band, progression, and spatial-support evidence remains
  available internally until downstream decisions have consumed it;
- gradient colors come from supported portions of an observed artwork transition;
- representative colors feel present in the artwork without encoding isolated noise;
- all four roles and the gradient state are selected jointly;
- surface and accent collapse honestly when the artwork does not support distinct colors;
- two-, three-, and four-color treatments emerge when appropriate;
- four-color treatments succeed because all four roles improve artwork representation, not because
  color count is rewarded;
- pure black or white is introduced only for the predeclared exceptional-low-contrast case, including
  genuinely one-color artwork, remains disfavored relative to source-supported treatments, and may
  occupy background or foreground;
- complete UI treatments are commonly strong or acceptable;
- every human-facing color is named with `colornames-oklab`;
- the deterministic selector chooses good available alternatives consistently;
- applicable contrast is measured and contributes modest UI-utility evidence without acting as a
  substantive research-stage hard gate or dominating artwork identity;
- a fresh directional review shows visible improvement over the external baseline with honestly stated
  limits;
- ordinary iteration remains fast;
- the final full run remains unused until quality is already demonstrated.

The primary research deliverable is a gallery of convincing complete album-artwork UI treatments
backed by understandable native-resolution evidence. Caches, models, certificates, historical
compatibility, and full-roster execution are supporting engineering, not substitutes for that outcome.
