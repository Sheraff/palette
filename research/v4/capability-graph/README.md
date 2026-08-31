# Typed Capability Compatibility Hypergraph

This directory defines the schema foundation for a machine-readable mapping of the v4 mechanism
census. The mapping is a typed capability compatibility hypergraph. It is not an architecture, a
proven dependency graph, a component model, a selected runtime pipeline, or a build order.

## Semantics

A mechanism is represented as a many-input, many-output hyperedge. Its ports refer to shared stable
artifact type IDs such as `artifact.raster.native-srgb8-opaque.v1`. Mechanism IDs remain exactly the
IDs in `research/v4/MECHANISMS.md`; the graph does not mint aliases for them. A mechanism can belong
to more than one capability. `primaryCapabilityId` selects one of those memberships only as the
default visualization placement; it grants no semantic priority and must also occur in
`capabilityIds`.

The same artifact type ID on an output and an input means only that the two ports claim candidate
semantic compatibility. It does not mean that the producer and consumer have been bound, tested
together, selected, ordered, or shown to preserve each other's assumptions. In particular, a type
match does not assert:

- a dependency or prerequisite;
- a component or service boundary;
- a runtime or development pipeline;
- a safe composition;
- a preferred producer when several exist; or
- a build or research priority order.

The representation permits multiple producers, multiple consumers, external roots, bypasses,
fan-out, convergence, diagnostics, and cycles. A cycle in candidate compatibility is not evidence for
a runtime cycle. Any tested binding or dependency belongs in separately scoped future evidence, not
inferred from this graph.

The horizontal axis in `data/capability-groups.json` records semantic commitment only. It moves from
source-bound observations toward the exact product contract for visualization. It is not a maturity
ladder, evidence ranking, dependency order, or authorization path. Orthogonal lanes classify the
kind of claim without imposing execution order. The fixed product anchors are:

- left: `artifact.raster.native-srgb8-opaque.v1`, the once-decoded native opaque 8-bit sRGB raster;
- right: `artifact.product.ui-palette.v3`, the exact published v3 UI Palette product contract.

Contract maturity describes the state of an artifact contract, not the quality, scientific support,
runtime admissibility, or authorization of a mechanism that uses it.

## Source Authority

The graph is derivative navigation and typing data. It cannot override its v4 sources:

- `research/v4/PROJECT.md` governs the inherited product problem, exact output boundary, evidence,
  custody, and constraints.
- `research/v4/STRATEGY.md` governs research terminology, authorization, artifact discipline, data
  firewalls, and the prohibition on premature architecture inference.
- `research/v4/MECHANISMS.md` is the current 149-entry mechanism census and is authoritative for
  census IDs, titles, compact status text, and source heading locations at the bound snapshot. Its
  section order remains taxonomy, not execution order.

All source paths in graph data are normalized repository-relative paths. A final graph binds the
census by repository commit, commit tree, commit timestamp, Git blob, SHA-256, byte count, line count,
and mechanism count. Each mechanism also records the exact heading text and one-based heading line.
Semantic validation checks the complete 149-ID set, title, heading, line, normalized status and
authorization text, and closed status tokens against the supplied `MECHANISMS.md` bytes. Generation
also verifies the declared commit tree, committed source blob, commit timestamp, and current worktree
source blob through Git.

## Data Planes

Artifact types have exactly one plane so unlike custody domains do not collapse into one apparent
runtime flow:

- `runtime`: artifacts that can describe cold per-file computation under the inherited product
  boundary. This classification does not select them for runtime use.
- `development`: diagnostics, controlled substitutions, perturbations, models, review projections,
  and other research-only values that must not leak into cold inference.
- `governance`: source custody, configuration authority, authorization, provenance, and decision
  records that govern work without becoming image-inference inputs.

Configuration, control, model, and review values are first-class artifact categories and typed ports,
not hidden annotations. A visualization may filter those categories or whole planes, but generation,
validation, compatibility analysis, and orphan analysis must retain them.

## Product Focus

Every mechanism has an explicit `focusClass`, and every artifact type has an explicit `productFocus`.
These values are presentation and research-priority metadata only. They assert no evidence,
authorization, compatibility, dependency, selected producer, adapter, execution order, architecture,
or build order. The builder reads these fields directly; it does not infer them from categories,
planes, capabilities, status, ports, or topology.

Mechanism focus classes are `product-transformation`, `product-admission`, `evaluation-probe`,
`review-custody`, `configuration-governance`, `historical-comparator`, and
`research-only-oracle`. Artifact focus values are `product-flow`, `inspector-metadata`,
`secondary-overlay`, and `full-analysis-only`. Both product anchors are `product-flow`.

Generated `analysis.productFocus` retains full-registry counts while exposing a smaller projection:
product transformations and admissions are primary; evaluation, review/custody, and configuration
governance mechanisms form the overlay; historical comparators and research-only oracles remain
full-analysis-only. Inspector/context inputs stay visible without becoming product obligations.

Only `materializerGaps` are confirmed structural gaps; the current snapshot contains the exact v3
product materializer only. `openInputContracts`, `openAlternativeContracts`, and
`openOutputContracts` preserve candidate connectivity observations. Their missing-provider,
non-primary-provider, and unconsumed-output classifications describe current exact-type topology only.
They do not prescribe work, sequence, mechanism inventory, or trial decisions. An observation becomes
a confirmed gap only if a future selected composition requires that exact contract.
Expected-external product-flow inputs remain visible as boundary context and are excluded from open
input and alternative collections. Exploration may implement a narrow mechanism with local typed I/O
without closing or registering these contracts. The generated `PRODUCT_CONNECTIVITY.md` presents this
analysis, while `ORPHANS.md` remains the exhaustive type- and port-level topology report.

### Web Product Canvas

The web instrument opens as the **Palette Product Capability Map**. Its sole primary/default Product
map shows every generated primary mechanism, shared producer-to-consumer product contracts,
expected-external boundary anchors, and the exact v3 goal. Leaf and open product contracts remain in
mechanism inspectors and the closed **Open contracts** disclosure. That disclosure presents compact
generated counts and exact candidate-connectivity observations without prescribing work or sequence.

Product map nodes are packed into four viewing lanes over the generated semantic-commitment axis.
Configuration, control, model, review, and custody context remains available in the exact mechanism
inspector even when it is not drawn as a product incidence. The closed **Research details** disclosure
contains **Show all product contracts**, **Full registry**, the evaluation/governance/research-custody
overlay, Candidate closure, exhaustive orphan views, runtime-status views, filters, search, and the
full visible-node navigator. These controls change only the viewing projection; none establishes a
selected pipeline, integration, product readiness, source validation, compatibility, or build order.

## Not A Trial Gate

The Product map is the default research view. The Full registry and its custody, diagnostic,
configuration, governance, and contract detail remain available as secondary inspection context;
they support research but are not the mechanism research itself and must not dominate the map.

Focus classifications are display and research-priority metadata, not authority. They do not grant
or deny implementation, evidence, integration, release, product, or scientific interpretation.

The graph is not a gate for the exploratory trials defined by `research/v4/STRATEGY.md`. Such trials
need not satisfy graph-wide orphan obligations, Candidate closure, complete port materialization, or
contract maturity. Experiment-local typed semantics are sufficient for that boundary, and no graph
registration is required.

A narrower formulation must be labeled as such and cannot claim evidence for the full census
mechanism.

## Ports And Terminals

Input ports declare all of the following:

- `requirement`: `required`, `optional`, `alternative`, or `configuration`;
- an alternative group when and only when `requirement` is `alternative`;
- cardinality: `exactly-one`, `exactly-two`, `zero-or-one`, `zero-to-two`, `zero-to-six`,
  `one-to-two`, `one-or-more`, or `zero-or-more`;
- input class, including natural, known-good, privileged upper-bound, configuration, control, model,
  review, and external-observation classes; and
- notes that preserve assumptions, null behavior, and provenance limits.

Alternative groups contain at least two ports and state whether exactly one or one-or-more alternatives
must be supplied. Individual alternative ports use a zero-allowing cardinality because their presence
is conditional on group selection.

Input and output ports may declare machine-readable `valueConstraints` over JSON-pointer value paths.
A mechanism may also declare `conditionalConstraints` relating input and output states. These retain
source-stated bounds and preconditions; they do not assert that any producer-consumer binding has been
tested. `outputGroups` identify exactly-one mutually exclusive result variants such as success versus
typed refusal.

Every non-root constrained value path and exact comparator/value pair must be permitted by that
artifact type's `valueInspection` contract. The contract exposes only the source-backed fields needed
for graph-level checks; it is not a complete runtime payload schema. Root-path `present` and `absent`
predicates inspect whether a port is bound, so they do not require payload inspection declarations.

Output ports declare cardinality and value-state notes, including null, abstention, invalid, ambiguous,
or out-of-domain behavior where relevant. There is no generic terminal boolean. Intentional terminal
meaning can be declared only by `ArtifactType.intentionalTerminalPurpose` or an output port's explicit
`terminalPurpose`. Product-goal boundary classification is also terminal metadata.

## Orphans

Orphans are computed by artifact type ID, not by unique producer/consumer node IDs:

- A never-provided input type is consumed by at least one mechanism and produced by none.
- A never-used output type is produced by at least one mechanism and consumed by none.

Expected external roots remain in `neverProvidedInputTypes` with
`expected-external-root`; unresolved roots, internal gaps, and product-goal gaps receive
their own classifications. Intentional terminals and product goals remain in
`neverUsedOutputTypes`; expected external handoffs, unresolved terminals, and internal unused outputs
also remain visible. Generation must never suppress a row merely because its classification explains
it. Every never-provided consumer port is classified as a direct obligation, collective
alternative-group obligation, optional absence, or unused alternative. Alternative-group obligations
are counted once per mechanism/group while complete per-port rows remain visible. Every never-used
producer port likewise receives a generated terminal or handoff disposition.

The current `artifact.product.ui-palette.v3` anchor is intentionally a never-provided product-goal
input to structural validation because no census mechanism materializes the published v3 Palette.

## File Layout

- `README.md`: semantics, authority, authoring rules, and command contract.
- `schema/capability-graph.schema.json`: JSON Schema Draft 2020-12 contract for the generated final
  graph document.
- `schema/fragment.schema.json`: JSON Schema Draft 2020-12 contract for independently authored mapping
  fragments.
- `data/capability-groups.json`: the semantic-commitment axis, orthogonal lanes, capability cells,
  fixed product anchors, and topology policy.
- `src/types.ts`: corresponding TypeScript records and closed vocabularies.
- `src/generation.ts`: shared fatal UTF-8 decoding, duplicate-key rejection, canonical serialization,
  hashing, and generation-digest logic.
- `src/validate.ts`: semantic parsing, derivation, validation helpers, input-manifest verification, and
  a guarded Ajv-backed CLI.
- `src/build.ts`: deterministic fragment reconciliation, validation, analysis, and documentation
  generator.
- `src/serve.ts`: loopback-only, read-only server for the generated graph instrument.
- `web/`: dependency-free Canvas 2D visualization, controls, and inspector.
- `data/fragments/`: independently authored artifact definitions and complete mechanism typings for
  all 149 census entries.
- `data/capability-graph.json`: generated canonical graph.
- `data/orphan-analysis.json`: generated compatibility and port-level orphan analysis.
- `ORPHANS.md`: generated readable orphan report with one row per orphaned port.
- `PRODUCT_CONNECTIVITY.md`: generated product projection, confirmed materializer gap, and
  non-prescriptive open-contract observations.

A fragment contains artifact type definitions and complete typing records for its census mechanisms.
It does not contain generated compatibility hyperedges, orphan lists, or architecture edges. The build
tool reconciles fragments, permits only structurally identical repeated definitions, rejects
conflicts, requires exact census coverage, derives analysis metadata, and emits the final graph. The
generator does not discover the authoritative fragment set from directory contents:
`src/generation.ts` declares the canonical nine-entry fragment ID/path manifest and the 13 exact
generation inputs comprising groups, both schemas, the census, and every fragment. Missing or extra
files and missing, extra, renamed, duplicated, or reordered declarations are rejected.

## Validation

Pure exported semantic and derivation functions accept in-memory values and source text. The separate
asynchronous generation-file validator and guarded CLI perform file I/O. Both the builder and CLI use
the workspace's pinned Ajv 2020 implementation; they do not download schemas or packages.

Run the focused native Node test suite from the repository root. It uses `node:test`,
`node:assert/strict`, and the workspace's local Ajv; it does not download packages:

```sh
pnpm exec node --experimental-strip-types --test \
  research/v4/capability-graph/tests/*.test.{ts,mjs}
```

Build all generated artifacts from the repository root. The builder uses the workspace's pinned Ajv
2020 implementation for fragment and generated-document JSON Schema validation, then runs semantic
validation before writing outputs:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/build.ts
```

The build command is also the authoritative local-Ajv structural validation command: it validates all
nine fragments, the generated graph, and the standalone generated analysis against
`schema/capability-graph.schema.json` before writing any output. JSON input uses fatal UTF-8 decoding,
rejects duplicate object keys, and rejects unsafe or non-normalized repository-relative paths.

Verify all inputs and generated bytes without writing anything:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/build.ts --check
```

`--check` performs the full in-memory build and reports every stale or missing generated output.

Validate the generated graph semantically without rebuilding it:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/validate.ts \
  research/v4/capability-graph/data/capability-graph.json \
  research/v4/MECHANISMS.md
```

Validate one fragment semantically; the CLI loads `data/capability-groups.json` by default:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/validate.ts \
  research/v4/capability-graph/data/fragments/02-raster-color-publication.json \
  research/v4/MECHANISMS.md
```

The CLI applies fatal UTF-8 decoding and duplicate-key rejection, then validates the graph or fragment
and capability groups with Ajv before semantic checks. It checks ID uniqueness, references,
vocabularies, ports, artifact-inspection anchoring, alternatives, cardinalities, type-based
compatibility, generated analysis, exact census coverage, and source synchronization. For a generated
graph it also verifies available generation-input and source-fragment bytes, lengths, hashes, fragment
IDs, manifest agreement, and the shared generation digest. Graph validation accepts exactly two paths;
fragment validation accepts those two paths plus an optional capability-groups path. Run a strict
TypeScript check scoped to this prototype separately:

```sh
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 \
  --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions \
  --types node research/v4/capability-graph/src/*.ts \
  research/v4/capability-graph/tests/*.ts
```

## Visualization

Launch the local instrument from the repository root with the workspace's local Node runtime. The
server binds only to `127.0.0.1`, serves fixed read-only routes, and defaults to port `4200`:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/serve.ts
```

Open <http://127.0.0.1:4200/>. To choose another port, pass it directly or use `--port <port>`:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/serve.ts --port 4300
```

The Canvas projection draws one incidence for every typed input and output port. It does not create
producer-by-consumer edges. Mechanisms use `primaryCapabilityId` only for their visualization cell;
all other taxonomy memberships remain inspectable without inventing an averaged position or semantic
priority. The Candidate closure projection starts with the native raster plus generated
`expected-external-root` artifacts in runtime and governance planes. A mechanism belongs to the
fixpoint when it has a permitted runtime variant, every direct `required` or `configuration` input is
candidate-available, and each declared alternative group has a candidate-available member. Optional
inputs do not affect fixpoint membership. Reached mechanisms retain complete declared port bundles;
unreached frontier mechanisms show an available natural input and the declared inputs or alternative
groups that are not candidate-available, without showing outputs. Mixed permitted/prohibited variants
remain conditional. The producerless UI goal stays pinned and candidate-unreachable.

Candidate closure is declaration-level only. It does not evaluate conditional value constraints or
branches and does not establish executable, source-validated, or safe reachability. The semantic
validator checks declaration consistency; shared artifact IDs do not establish source-backed
compatibility, a route, dependency, selected handoff, or safe composition.

Missing-link controls use the generated per-port obligation and terminal dispositions, including
collective unavailable alternative groups and unused alternatives. The Has permitted variant
projection retains every typed port of each included mechanism and marks non-runtime context rather
than silently drawing partial hyperedges. Visible zoom controls, one-finger pan, pinch zoom, keyboard
map controls, and a visible-node listbox provide pointer and non-canvas exploration. Exact mechanism
source links open the server's escaped, line-numbered source view. No npm, npx, global module, or
external frontend dependency is required. At phone widths, Full and Candidate closure remain directly
available while additional projections, filters, and the node navigator move into a native accessible
disclosure so the initial viewport retains a useful map region.

## Generation

Generation remains data-only; the web instrument reads its checked-in outputs and does not alter or
override them. Object keys, artifact types, mechanism records, fragment references, compatibility
hyperedges, and port references use locale-independent canonical code-unit ordering. `generatedAt` is
the pinned census commit timestamp rather than wall clock time, so unchanged inputs produce
byte-identical outputs. The graph and standalone analysis share one generation digest over the
generator identity, pinned source snapshot, and exact sorted input manifest. Manifest entries and
source-fragment records hash raw bytes and include byte lengths.

The canonical manifest belongs to the generator and schema contract. Adding, removing, or renaming a
fragment requires an explicit manifest edit, generator-version increment, schema-version update, and
regeneration; directory discovery never silently migrates the graph to a different input set.

Generation stages all four outputs before replacing their destinations. Each replacement is an atomic
file rename on the local filesystem, but the sequence is not an atomic directory transaction: an
interruption can expose files from two generations. The shared digest and `--check` make that partial
publication detectable; consumers that read multiple generated files must compare their generation
digests before treating them as one snapshot.

After generated files are checked in, the no-write check must pass:

```sh
pnpm exec node --experimental-strip-types research/v4/capability-graph/src/build.ts --check
```

## Deliberately Unresolved

This graph and its visualization do not decide a tested-binding representation or any future
dependency evidence model. They also do not decide component boundaries, architecture, a capability
ladder, a selected producer, a runtime topology, or build order. Those decisions require separately
scoped evidence under `research/v4/STRATEGY.md`.
