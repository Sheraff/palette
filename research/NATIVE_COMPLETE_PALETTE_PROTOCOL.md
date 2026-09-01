# Native Complete-Palette Protocol

Status: final pre-matrix Phase 5 execution freeze for `native-complete-palette-0.1.0-development`.
The sealed 391-group/392-path development matrix and mechanical inspection after its complete run
are authorized but have not been executed. Review artifacts, servers, reserve access, calibration,
promotion, and canonical code changes remain unauthorized.

## Bound Identity

| Item | Frozen value |
| --- | --- |
| Candidate | `native-complete-palette-0.1.0-development` |
| Protocol | `native-complete-palette-protocol-v1` |
| Policy | `native-complete-palette-policy-v1` |
| Policy SHA-256 | `553a91ff874dbcc395644ea02cb8a54ec1e64012d81cac500a6ccffcbd471c97` |
| Canonical incumbent | `region-graph-0.19.0` |
| Canonical comparator SHA-256 | `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec` |
| Native graph | `native-field-hypothesis-graph-0.1.0-development` |
| Native graph policy | `native-field-hypothesis-graph-policy-v1` |
| Native graph policy SHA-256 | `b922a927d4406188b3b0458583cc947fd33b8171c9315925bcb922cd3cad2b6c` |
| Native family query | `native-field-family-query-policy-v1` |
| Exact-pair scorer | `gradient-field-topology-model-3.0.0-dev` |
| Exact-pair evidence | `gradient-field-topology-evidence-3.0.0-dev` |
| Exact-pair parameter SHA-256 | `98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11` |
| Exact-pair threshold | `0.25629320384844717` |
| Exact-pair transfer development SHA-256 | `cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30` |
| Exact-pair transfer scientific identity | `8bb9a1597397ee1d63fc89e04bfa7ba45c23aaeb4ce4c30f6d96390e28524de9` |
| Execution plan | `research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md` |
| Execution plan SHA-256 | `079691998bcc510cea2abd912e23390d78b16ba369a3ee4bf13b64650bcd4e21` |
| Source roster | `research/data/experiments/next-palette-0.4.0-connected-family-development/manifest.json#sources` |
| Source roster artifact SHA-256 | `8cb313d9be72a6f3765f43d2cc4c1cb3021bd09d66cbdebd95d34f44eda0f03d` |
| ASCII-sorted source roster semantic SHA-256 | `ab017ea6e3cffc52a1a3af94d40ad703afcdd5654bab13ffb7e6a66a3232868c` |
| Runtime | Node.js `25.8.1`, ESM, `--experimental-strip-types` |

The implementation closure is exactly this protocol, the protocol artifact identity, the new
candidate module and test, and the transitive imported native graph, family-query, color,
topology-scorer, perception, and shared type modules. Exact current-worktree hashes are frozen in the
protocol artifact. They must be reverified without changing this policy immediately before an
eventual matrix run.

## Custody And Resources

The only eventual matrix source roots are `images` and `00`. Source roots `10`, `11`, `12`, `13`,
and `14` are forbidden: they may not be accessed, listed, read, hashed, decoded, inferred over, or
included in candidate evidence. No other root is authorized by this protocol.

The source roster is the bound `sources` array above: 392 unique paths, comprising 37 `images`
rows and 355 `00` rows, with 391 exact encoded-source SHA groups because one exact source is shared.
The source SHA is grouping and identity evidence only and never an inference feature.

- Per-source wall limit: `120000` milliseconds.
- Per-source child peak-RSS limit: `1342177280` bytes (1.25 GiB).
- Concurrency: exactly `2`, with an aggregate declared child ceiling of `2684354560` bytes (2.5 GiB).
- Parent live-RSS polling interval: `100` milliseconds; both live and reported RSS enforce the
  per-source ceiling.
- Maximum changed exact encoded-source groups: `40`.
- Maximum distinct emitted role colors: `4`.
- Numeric comparison epsilon: `1e-12`.
- Ordering: direct ASCII code-unit ordering, never locale ordering.
- Matrix scheduling order: encoded-source SHA-256, then authorized relative path, both ASCII.
- Candidate output inspection on real development sources is authorized only as mechanical analysis
  after the complete sealed Phase 5 run. Partial output inspection cannot authorize continuation.

## Inputs And Incumbent Boundary

The production boundary receives a native RGB raster, its encoded-source SHA-256, and a canonical
`Palette`. It constructs the frozen native graph from that raster and SHA. It never invokes the
canonical extractor and never mutates the supplied palette.

The candidate is an incumbent-relative migration only. When no challenger is admitted, the returned
palette is the exact supplied canonical object. A certificate records reference preservation and
before/after canonical semantic hashes.

Canonical roles have one of these provenance statuses:

- `canonical-generated`: the supplied canonical role declares `generated: true`;
- `canonical-normalized`: the supplied role is not generated; this status is retained even when a
  frozen native query links its RGB to a native family;
- native linkage `exact-rgb`, `unique-nearest`, `ambiguous`, or `unmappable`, stored separately.

A native linkage never upgrades a canonical-normalized role to exact native provenance. Complete
canonical evidence requires an exact representative alias for each non-generated role, except that
a legal generated black/white foreground may be reconstructed through fallback necessity. Generated
canonical fields, a generated canonical accent, unsupported generated foreground RGB, missing exact
aliases, unavailable exact topology, or materially incomparable provenance interpretations make the
incumbent evidence incomplete and preserve canonical.

If several complete exact-alias interpretations exist, choose the ASCII-first interpretation only
when its flattened vector equals every other interpretation within epsilon or componentwise dominates
every other interpretation. Otherwise canonical evidence is materially ambiguous and canonical is
preserved.

## Domain

### Fields

Only `primary-field` families may supply fields. For every field-role-allowed bounded exact-source
representative:

1. enumerate its collapsed treatment;
2. enumerate every ordered pair of representatives from distinct primary families;
3. reject a non-positive-distance pair;
4. retain both `distinct-flat` and `gradient` for each positive-distance pair;
5. reject a distinct pair with OKLab distance below `0.025`;
6. deduplicate `(background RGB, surface RGB, state)` while retaining every provenance alias.

Connected families and light-typography-only representatives are never field endpoints. Collapse is
exact RGB equality and only `collapsed` is legal for equal fields. Gradient is legal only for distinct
fields.

### Foreground

For every retained field treatment and provenance alias, recompute every exact-source representative
from primary, typography, and connected-overlay families. A source foreground must pass signed APCA
over both fields. If at least one source foreground passes APCA, generated foregrounds are forbidden
for that treatment even if every source option later fails a semantic block. If none passes, test only
generated black `[0,0,0]` and white `[255,255,255]`, retaining each passing option and recording the
failed source count as its necessity witness.

### Accent

For every retained treatment and retained foreground, recompute every exact-source representative
from primary, typography, and connected-overlay families. Accent must pass signed APCA over both
fields. Generated accent and foreground/accent collapse are forbidden. Provenance aliases remain
separate evidence interpretations until selection.

## Hard Constraints

Every challenger must satisfy all of the following before semantic acceptability:

- every nonfallback role is an exact representative RGB at its recorded native pixel index;
- field roles are primary-only and overlay roles use only permitted representative domains;
- foreground APCA passes `Lc >= +60` or `Lc <= -60` over background and surface independently;
- accent APCA passes `Lc >= +10` or `Lc <= -10` over background and surface independently;
- distinct field distance is at least `0.025` OKLab;
- accent distance from background, surface, and foreground is at least `0.025` OKLab;
- foreground differs from both fields and accent differs from every other role;
- collapsed fields are exactly equal, distinct fields are unequal, and gradient fields are distinct;
- generated foreground is black or white, is necessary for that treatment, and itself passes APCA;
- generated accent is absent;
- no more than four distinct colors are emitted;
- all evidence, distances, APCA values, margins, vectors, and metrics are finite;
- the selected tuple is immutable after construction and receives no repair or role mutation.

Signed APCA pass and raw margin are:

```text
pass(lc, p, n) = (lc >= p) OR (lc <= -n)
margin(lc, p, n) = max(lc - p, -lc - n)
```

## Normalization

All ranking evidence is generic source evidence. Let:

```text
U(x) = min(1, max(0, x))
R(d) = U(d / 0.18)
P(r) = sqrt(U(r / max(maximum representative population, 1e-12)))
C(c) = U(c / max(maximum representative chroma, 1e-12))
A60(lc) = U(abs(lc) / 120)
A10(lc) = U(abs(lc) / 20)
familySupport(f) = min(native field-eligibility support, all profile field-eligibility supports)
familyStability(f) = 1 - U(max_profile(abs(profile population - native population)) /
                            max(native population, 1e-12))
topologyStability(pair) = 1 - U(max(profile scores) - min(profile scores))
```

All listed components are retained independently. No weighted or unweighted block mean is used.
For each component, `margin = value - threshold` and pass means `margin >= -1e-12`.

## Noncompensatory Blocks

The flattened comparison vector is the following 27 components in exactly this order.

### Field

| Component | Formula | Threshold |
| --- | --- | --- |
| `field.backgroundSupport` | `familySupport(background family)` | `0.05` |
| `field.surfaceSupport` | collapsed: background support; distinct: `familySupport(surface family)` | `0.03` |
| `field.multiplicityFit` | collapsed: hypothesis `oneFieldFit.minimum`; distinct: relation `twoFieldFit.minimum` | `0.03` |
| `field.relationStateSupport` | collapsed: hypothesis `stateSupport.minimum`; distinct: selected state-support minimum | `0.03` |
| `field.scaleAgreement` | collapsed: `1-U(oneFieldFit.range)`; distinct: `min(stateAgreement, 1-U(selected state-support range))` | `0.50` |
| `field.exactTopologyState` | collapsed: `1`; gradient: exact-pair 224 score; flat: `1 - exact-pair 224 score` | `0.05` |

Distinct exact topology must be `mapped` for the exact RGB pair and must be produced from the same
encoded-source SHA and native raster used by the graph. Topology is state evidence only; it cannot
change endpoints.

### Foreground

| Component | Source formula | Generated fallback formula | Threshold |
| --- | --- | --- | --- |
| `foreground.roleSupportOrNecessity` | `U(max(text, detail))` | `1` only with necessity witness | `0.05` |
| `foreground.populationOrNecessity` | `P(population)` | `1` only with necessity witness | `0.02` |
| `foreground.backgroundApca` | `A60(foreground-on-background Lc)` | same | `0.50` |
| `foreground.surfaceApca` | `A60(foreground-on-surface Lc)` | same | `0.50` |

`detail` is `max(representative detail, family native spatial detail)`; the representative already
binds the role-local value supplied by the native graph.

### Accent

| Component | Formula | Threshold |
| --- | --- | --- |
| `accent.identitySupport` | `U(max(C(chroma), saliency))` | `0.05` |
| `accent.localSupport` | `U(max(text, detail))` | `0.02` |
| `accent.population` | `P(population)` | `0.01` |
| `accent.backgroundApca` | `A10(accent-on-background Lc)` | `0.50` |
| `accent.surfaceApca` | `A10(accent-on-surface Lc)` | `0.50` |

### Composition

| Component | Formula | Threshold |
| --- | --- | --- |
| `composition.familyCoverage` | `U(sum(native family population for unique selected primary-field family identities))` | `0.10` |
| `composition.foregroundFieldSeparation` | `R(min(foreground-background, foreground-surface distance))` | `0.1388888888888889` |
| `composition.accentFieldSeparation` | `R(min(accent-background, accent-surface distance))` | `0.1388888888888889` |
| `composition.accentForegroundSeparation` | `R(accent-foreground distance)` | `0.1388888888888889` |
| `composition.sourceChromaCoverage` | `C(maximum selected exact-source role chroma)` | `0` |
| `composition.toneSpan` | `U((maximum selected OKLab L - minimum selected OKLab L) / 0.60)` | `0.10` |

Family coverage counts a selected primary-field family once. Generated foreground has no family and
contributes no chroma. Connected-overlay masks overlap the primary partition, so their populations
are never added to family coverage. A selected connected overlay remains represented by its exact
provenance and role-local foreground/accent evidence only.

### Robustness

| Component | Formula | Threshold |
| --- | --- | --- |
| `robustness.backgroundFamily` | `familyStability(background family)` | `0.25` |
| `robustness.surfaceFamily` | collapsed: background stability; distinct: surface stability | `0.25` |
| `robustness.foregroundFamily` | source: foreground family stability; necessary generated fallback: `1` | `0.25` |
| `robustness.accentFamily` | accent family stability | `0.25` |
| `robustness.topologyScale` | collapsed: `1`; distinct: `topologyStability(pair)` | `0.50` |
| `robustness.exactIdentity` | `1` only when every source role has an exact representative alias and any generated foreground is necessary | `1` |

A block passes only when every component in that block passes. A challenger is semantically
inadmissible when any one component fails. Strength in another component or block cannot compensate.

## Safe Staging

Field staging is exhaustive and has no heuristic top-k:

1. enumerate raw field-provenance treatments;
2. reject only hard distance/state violations;
3. semantic-deduplicate while retaining aliases;
4. compute all non-topology Field components;
5. reject an alias only when a fixed Field component fails its absolute threshold;
6. query exact topology only for remaining distinct semantic RGB pairs;
7. reject unavailable topology or a failed topology-dependent Field component;
8. enumerate all overlay alternatives for every retained field alias.

A nonacceptability witness records the failed component, value, threshold, margin, treatment, and the
proof statement that later topology or overlays cannot change that field component. If an optional
incumbent-relative field prune is used, it is legal only for a fixed declared Field component below
the reconstructed canonical value and records a componentwise dominance witness. Candidate-to-
candidate field-only pruning is forbidden because later Composition and Robustness components may
differ.

The certificate reconciles:

```text
raw = hard-field-rejected + hard-field-eligible
hard-field-eligible = semantic-alias-duplicates + deduplicated
deduplicated aliases = non-topology-rejected + topology-rejected + retained aliases
attempted complete tuples = hard-rejected + hard-feasible
hard-feasible = block-rejected + block-passing
block-passing = incumbent-nondominating + incumbent-dominating
```

Every rejection is assigned exactly one first-failure reason in frozen check order. Foreground source
pass/fallback counts and per-treatment accent attempts are stored separately.

### Complete-Tuple Memory

Complete tuples are processed in deterministic field, foreground, then accent order. A hard-rejected,
block-rejected, or incumbent-nondominating tuple is never retained after its counters and streaming
hashes are updated. No complete rejected-tuple domain is serialized.

Each incumbent non-dominance witness is the full stable record
`(semantic key, provenance identity, reason, component, challenger value, incumbent value, margin)`.
The certificate stores only:

- exact total witness count;
- exact counts by reason and by failed incumbent component;
- `SHA-256("native-complete-palette-dominance-witness-v1" + NUL + each stable-JSON witness + LF)`
  over every witness in enumeration order;
- at most the first 16 full witnesses in that same deterministic enumeration order.

The representative rule is fixed as `first-16-in-deterministic-tuple-enumeration-order`; it is not a
ranking, sample, top-k, or input to selection. Reason counts sum to the exact nondominating count, and
component counts sum to the `weaker-component` reason count.

Every admitted tuple updates
`SHA-256("native-complete-palette-admitted-tuple-v1" + NUL + each stable-JSON tuple comparison identity + LF)`
and an exact admitted count. Admitted complete tuple objects are not accumulated. The solver maintains
only the exact streaming candidate Pareto frontier and the exact streaming Pareto frontier for the
current minimum changed-block class. A newly lower changed-block class resets only the latter frontier
and its exact class count. No heuristic frontier limit is permitted.

Canonical provenance interpretations use the same streaming discipline with domain
`native-complete-palette-canonical-interpretation-v1`. Equal vectors retain only the ASCII-first
provenance interpretation; strictly dominated interpretations are removed; incomparable frontier
members preserve canonical as materially ambiguous. The certificate stores interpretation count,
streaming hash, and retained frontier count.

## Canonical Comparison And Selection

Canonical is evaluated with the same formulas wherever complete evidence is reconstructable. Its
five block decisions and flattened vector are stored even when an absolute component fails. If the
complete canonical vector cannot be reconstructed, no challenger is admitted.

A challenger is admitted only when it:

1. passes every hard constraint;
2. passes every component of every block;
3. weakly exceeds canonical on all 27 components within epsilon; and
4. strictly exceeds canonical on at least one component by more than epsilon.

Incomparability, exact vector equality, or a weaker component preserves canonical.

Selection among admitted challengers is:

1. fewest changed semantic blocks, where fields plus state are one block and foreground and accent
   are one block each;
2. candidate-to-candidate componentwise Pareto frontier within that minimum-block class;
3. fewest changed atoms in order-independent count over background, surface, field state,
   foreground, and accent;
4. ASCII semantic key;
5. ASCII provenance identity.

No scalar score, regret, weighted sum, postselection veto, repair, or role mutation participates.

## Ablations

Each ablation is a fresh invocation of the same immutable selection path over the same frozen domain:

1. `canonical-background`;
2. `canonical-surface`;
3. `canonical-field-state`;
4. `canonical-field-block`;
5. `canonical-foreground`;
6. `canonical-accent`;
7. `canonical-overlay-block`;
8. `without-connected-family-local`.

Fixing means exact RGB equality, plus exact state equality where applicable. Removing connected local
candidates removes every connected-overlay provenance alias from foreground and accent domains. An
ablation never mutates or postprocesses the broad winner.

## Certificate

The compatibility output is a `Palette`. The separate certificate is deeply immutable and binds:

- candidate, protocol, policy, canonical, comparator, graph, query, scorer, and runtime identities;
- encoded-source SHA, native dimensions, native raster SHA, and graph/profile identities;
- canonical semantic identity, provenance statuses, native linkage, reconstruction decision, blocks,
  and vector;
- every selected role RGB, family, representative stable key, pixel index, construction, and alias;
- generated fallback necessity, all source failures, signed APCA values, polarity, thresholds, and
  margins;
- all five selected block decisions and the flattened named vector;
- raw, deduplicated, rejected, retained, attempted, feasible, block-passing, incumbent-dominating,
  Pareto, and selected counts with reconciliation assertions;
- every structurally bounded field pruning/nonacceptability witness and exact topology result;
- compact reconciled incumbent-witness totals, reason/component counts, streaming hash, and at most
  16 predeclared representative examples;
- exact admitted count/hash and retained Pareto counts, without rejected or full admitted domains;
- field-domain, feasible-domain, admitted-domain, canonical, selected-palette, and selected-tuple
  semantic hashes;
- selection route, unchanged canonical reference/hash assertion, and all eight fresh ablations.

Output metrics are recomputed from the final immutable tuple. No role or gradient value is changed
after metrics, hashes, and certificate evidence are constructed.

## Forbidden Inference

Inference may use only normalized graph, representative, APCA, distance, topology, scale, family, and
canonical semantic evidence declared above. It must not use filenames, paths, source identifiers as
features, review identifiers, batch identifiers, comments, color names, target hexes, labels, known
cases, root membership, or reserve membership. Encoded-source SHA is identity binding only and never
affects a value, branch, ordering tie, or selection.

## Mechanical Controls

Before any matrix run, synthetic tests must establish exact provenance, domain separation, state
completeness, semantic deduplication, signed polarity, fallback necessity, hard constraints,
noncompensation, strict Pareto behavior, exact canonical preservation, ASCII determinism, deep
certificate immutability, safe pruning, count reconciliation, and all eight fresh ablations.

An eventual mechanical development run must additionally establish deterministic repeated scientific
outputs, zero structural/accessibility/provenance/cardinality/certificate violations, exact canonical
equality for unchanged sources, resource compliance, at least one material change, no more than 40
changed exact-source groups, no known technical regression class, and no forbidden-root access.

## Final Phase 5 Execution Freeze

The predeclared execution amendment is now closed. Candidate identity, scientific policy SHA
`553a91ff874dbcc395644ea02cb8a54ec1e64012d81cac500a6ccffcbd471c97`, formulas,
normalization, thresholds, margins, component order, dominance, roster, Gate A, and stop rules are
unchanged. The final implementation closure and all execution-only values are bound in the protocol
artifact before the first candidate output.

Execution is one exact command and has no limit, resume, overwrite, or output-preview mode. The
parent validates the roster raw and semantic identities, both canonical artifact identities, all 392
canonical rows, the 391 encoded-SHA groups, authorized roots, and implementation closure before any
image byte is read. Scheduling is encoded SHA-256 then relative path under direct ASCII comparison.
The one exact alias group is one run with two reported paths, never two independent runs.

Every successful base or diagnostic extraction runs twice in separate children. Exact scientific
comparison includes the candidate certificate and excludes only elapsed time, live/reported RSS,
process polling, and stream byte-count fields. A mismatch stops the sealed matrix.

Child transport is stable-key JSON compressed with gzip level 9 and base64 encoded in the one JSON
stdout result. Frozen ceilings are 2 MiB stdin, 12 MiB stdout, 256 KiB stderr, 32 MiB uncompressed
certificate JSON, and 8 MiB compressed certificate. Exceeding a ceiling is an explicit failure;
silent truncation is forbidden. Parent artifact ceilings are 64 MiB for `results.json`, 8 MiB each
for `analysis.json` and `certificate-index.json`, 1 MiB for `manifest.json`, and 4 MiB for
`failure.json`.

Publication is exclusively staged at
`research/data/experiments/native-complete-palette-0.1.0-development/.phase-5.staging`, atomically
published to `phase-5`, or preserved on process/technical failure as `phase-5-failed`. A complete
base matrix with zero material changes is a reproducible Gate A rejection, not an opaque process
failure: transformation diagnostics are skipped, the complete base results and certificates are
published to `phase-5` with terminal `gate-a-reject` status, and no review is authorized. Any
existing staging, final, or
failure namespace stops execution before image access. Files and shards are written no-overwrite;
the final namespace contains `results.json`, `analysis.json`, `certificate-index.json`,
`manifest.json`, base certificate shards under `certificates/base/<encoded-sha256>.json.gz`, and
diagnostic shards under `certificates/diagnostics/<transform>/<encoded-sha256>.json.gz`. The index
binds every shard hash, count, and ordered aggregate hash.

Resize, crop, re-encode, deterministic-noise, and graph scale-disagreement diagnostics are frozen.
Full transforms run only on the union of the final materially changed frontier, all predeclared
matrix controls, and the first 16 groups under
`SHA-256("native-complete-palette-phase-5-diagnostic-sample-v1" + NUL + encoded SHA-256)`.
This intentionally does not estimate transform behavior for every unchanged non-control group.
Diagnostics are reporting-only and cannot alter selection or Gate A except for structural
nondeterminism, resource failure, or invalid output. Sharp 0.33.5/libvips 8.15.3, oriented flattened
sRGB input, deterministic PNG settings, max-edge-192 Lanczos3 resize, one-pixel crop, native-raster
PNG re-encode, and channel-index deterministic magnitude-one noise are frozen in `protocol.json`.

Birds of Prey, Krafty, `once`, Knuckles, and the exact Maroon 5 aliases are direct matrix controls.
Wrong-background, invisible-accent, unidentifiable-endpoint, inappropriate-collapse, and multi-hue
bindings are evaluation-only classes. Existing structured sources outside this roster are reported as
outside-roster and are not opened. Control outcomes are diagnostics, never inference branches,
comment-derived targets, or quality labels.

Any timeout, RSS, stream/output, child process, source, canonical reproduction, determinism,
structural, certificate, or changed-frontier failure kills active children, preserves the fixed
failure artifact, and forbids continuation to candidate inspection. Zero material changes stops
after the complete base matrix and publishes the terminal Gate A rejection described above. Human
Pause 1 remains the next boundary only after a complete Gate A pass; no review manifest, UI, or
server is generated by Phase 5.

## Stop Rules

Stop this candidate before review when any condition holds:

- a bound predecessor identity or policy differs;
- source SHA, native raster, graph, query, scorer, provenance, or semantic hashes do not reconcile;
- any exact representative cannot be reconstructed at its native pixel index;
- a connected family enters a field role or a generated accent is attempted;
- APCA polarity, distance, collapse, gradient, role-duplicate, cardinality, finite-evidence, or
  immutability constraints fail;
- staged counts, compact dominance summaries, admitted hashes, or frontier counts do not reconcile exactly;
- a staged witness could remove a possible admissible winner under the 27-component vector;
- canonical is changed when evidence is incomplete, incomparable, or weak;
- execution is nondeterministic or exceeds 120 seconds or 1.25 GiB child RSS;
- an eventual development matrix changes more than 40 exact-source groups or changes none;
- a fix would require a filename, path, source, review, batch, comment, color-name, target-hex,
  known-case, or reserve branch;
- any source root other than `images` or `00` is proposed for this matrix;
- any forbidden reserve root is accessed;
- review manifests or servers would be required to continue Phases 2 through 4.

At any stop, preserve canonical `region-graph-0.19.0`. Do not weaken a component, threshold, margin,
dominance rule, source boundary, or stop condition under this candidate identity.
