# Native Scale-Space Evidence Handoff Plan

## Status And Non-Authorization

This is an append-only implementation handoff for a label-free diagnostic experiment. It does not authorize a canonical change, palette output, role allocation, role selection, field selection, a solver, human review, reserve access, or promotion.

No selector, solver, role-policy, review, feedback, gallery, or palette-output path may be imported, invoked, instantiated, or serialized by the successor implementation. The implementation closure and artifact verifier must reject such a dependency by exact path and import inspection.

The current canonical palette remains `region-graph-0.19.0`. Its exact max-edge `224` control runs only in the isolated Sharp `0.33.5` child lane. Modern native evidence uses Sharp `0.35.3`. Existing canonical outputs, certificates, resolution modules, and published artifacts are frozen.

Every numerical field scale, threshold, bound, and fixture target marked **PD-DIAG** is predeclared diagnostic, not outcome-selected. Changing one requires a new experiment identity.

## Objective

Determine whether field evidence has genuine semantic scale after separating it from accidental dependence on raster density, candidate discovery, family discovery, interpolation-created colors, topology dimensions, and role allocation.

The authoritative source is the once-decoded, oriented, alpha-flattened, three-channel uchar sRGB raster at native dimensions. Every candidate color is an exact RGB triplet at a decoded-native pixel. Derived low-frequency planes are evidence transforms of frozen binary masks, never alternate source truth and never candidate colors.

The experiment emits evidence only. Exact canonical `224` is a control, not an arm, not modern source truth, and not an availability input.

## Canonical And Published Basis

The published label-free predecessor is:

`research/data/experiments/multi-resolution-palette-evidence-audit-0.3.0-development/`

| Identity | Value |
| --- | --- |
| Experiment ID | `multi-resolution-palette-evidence-audit-0.3.0-development` |
| Protocol ID | `a47dbec1c74f598af2e3c0a9d1e3105ca451bfd8e85292142b95ef44aa5830a4` |
| Scientific identity SHA-256 | `596a1d15e6e6598431fe8a9db53c6a0479660c9d98d34d15e5985e152c1abaed` |
| Implementation identity SHA-256 | `1b4ec4e7b105335fd31ae2a27679262be318d12bd716e528b1899ad2a117cb7e` |
| Source roster SHA-256 | `8c3c42e6a173fc63e4764320ee1b8c6b10c36af828d0427e19d1e3a251296948` |
| Result Merkle root | `db4411f3efeac31becc3e839af8578307fb0f5cfa33bb9ec4d424dd9c8c51923` |
| Evidence policy SHA-256 | `62d374ddc98be661c69bd5aa41efcf8d13ab487b31e12bc7400cc2b5b61c813c` |
| Canonical runtime SHA-256 | `9adadc964bcb94964a1cb4ac4b6c6e7a833f8c76e07afd05028e128e786acfab` |
| Modern runtime SHA-256 | `387a9126c301a24aaf0406a87f8ff49fe88a6ea5fde47eb742bf98927a4ee9d3` |

| Artifact | Raw SHA-256 | Semantic SHA-256 |
| --- | --- | --- |
| `protocol.json` | `c42b919c10bd49560935eced6af30997f0a37dc52a91edc817ba5b049c9c36da` | `31ee3df2adcc0a02a9510bb641c6d96f9b2c7deb9dd4986663775937b29f9c2d` |
| `results.json` | `8ad09bb0eaf6733c1d0d4dca92f8f579a82badffbdef8bdb1b03a4c25c4b0833` | `8c20f54878f3138b55cf51c568baf50096bba8c63088f1b9f249686ab51752dd` |
| `certificates.json` | `996797edcc0e3266fdd488cc16b0014e5ad6d1351a53be02c45f2228f2021c9d` | `bdce6255516ad4e9e16f109e2cbb5f4e587e7d020639d2d47abffa786b99e8df` |
| `controls.json` | `d691cada96373adb67d2ecc99b8609217736f45a43d092b9f65284c9296fba35` | `254bf0de333fa26dd802e0517e95528a5e309920ce93b4bd6d1030cbb6ddb3cf` |
| `analysis.json` | `6730918f0d1d8fe0e9c3f1948aaac69660a629895386b297146e71a96db181ed` | `dc4a62beaf417ffa6f21ac5bf0aeb14d33c740beeac8783b3b5fb344e0812dd3` |

Canonical source controls are `research/data/results.json`, 37 entries, raw SHA-256 `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec`, and `research/data/holdout-results.json`, 355 entries, raw SHA-256 `5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984`.

Canonical control is raster-only. Bind these exact promotion-certificate inputs:

| Cohort | Exact path | Raw SHA-256 | Entry key |
| --- | --- | --- | --- |
| Development | `research/data/candidates/region-chromatic-role-0.1.0-poc.10/chromatic-role-certificates.json` | `6c9086c08ddb583ade810d8391b10ce04c38fbdb85b7f2344a2af0a84d16b2b3` | Exact development canonical `entry.file` basename |
| `00` | `research/data/candidates/region-chromatic-role-0.1.0-poc.10/holdout-chromatic-role-certificates.json` | `ce6bca08b738860ba014adf717889844e860a6fb99459ffd2297929808095163` | Exact canonical `entry.file`, including the `00/` prefix |

Both files must have top-level `schemaVersion: 1`, `algorithmVersion: "region-chromatic-role-0.1.0-poc.10"`, and an `entries` object whose key set exactly equals its cohort's frozen canonical roster. The control adapter may expose only each entry's `schemaVersion`, `algorithmVersion`, and lowercase 64-hex `normalizedImageSha256`; every other certificate field is ignored and forbidden as an inference input. Dimensions come only from the matching frozen canonical artifact entry. For each source, decode through the Sharp `0.33.5` child and compute `SHA256(UTF8(width+"x"+height+":") || RGBBytes)`. Require exact equality to the exposed `normalizedImageSha256` and exact dimensions to the frozen canonical artifact entry. There is no timing field or timing normalization in this control.

The successor must not import or execute `research/src/extract.ts`, recompute canonical extraction, inspect role output, or instantiate role allocation. Frozen canonical artifact hashes establish artifact identity; promotion-certificate normalized raster hashes establish per-source raster identity.

### Strongest Published Conclusions

| Observation | Result | Consequence |
| --- | --- | --- |
| Matrix | `392` sources by `11` profiles, complete | The authorized roster is 37 + 355 only |
| Canonical reproduction | `392/392` exact, `0` mismatches | Canonical control isolation is sound |
| Structural checks | `0` violations; all declared control gates passed | These are not visual-quality gates |
| Modern max-edge `224` Lanczos3 | `23/392` semantic changes and `153` changed role values | Nominally equivalent resizing is runtime-sensitive |
| Other `224` kernels | cubic, area, and nearest changed `389/392` sources | Kernel and scale were confounded |
| Native versus canonical evidence | identities/counts changed `392/392`; components/field/frame/population/typography changed `389/392`; relations changed `342/392`; graph counts changed `146/392` | Availability and observation changed together, so causation is unresolved |
| Candidate component mean | native `1858.4412`; max-edge `224` Lanczos3 `386.8576` | Raw component counts are pixel-density dependent |
| Field detail mean | native `0.4276874`; max-edge `224` Lanczos3 `0.5202342` | Detail was not monotone with nominal resolution |
| Typography mean | native `0.2237737`; max-edge `224` Lanczos3 `0.2847257` | Resampling could amplify evidence |
| Result size | `190,865,227` bytes total; largest shard `599,093` bytes | Streaming and hard shard bounds are required |

The predecessor remains `diagnostic-only-no-selection-no-review-no-promotion`. Its recorded review authorization is false. Its historical `40`-case cap grants no present or future review authority.

## Accidental Pixel Dependence

Accidental pixel dependence is a change caused only by native sample density, fixed pixel thresholds, four-neighbor lattice length, raw component pixel counts, border widths, sample aliasing, interpolation-created colors, or candidate identity drift.

Genuine semantic scale is a reproducible change caused by a declared low-frequency observation while source truth, candidates, families, filter policy, coordinates, and exact transformed controls remain reconciled. Corpus contradictions are evidence vectors, not permission to tune scale or average metrics.

## Successor Files And Identity

Add only these successor paths during implementation:

| Kind | Exact path |
| --- | --- |
| Raster and Q0.24 transforms | `research/src/native-scale-space-raster.ts` |
| Frozen-mask evidence and metrics | `research/src/native-scale-space-evidence.ts` |
| Minimal append-only output primitives | `research/src/native-scale-space-output.ts` |
| Runner and schemas | `research/audit-native-scale-space-evidence.ts` |
| Raster tests | `research/tests/native-scale-space-raster.test.ts` |
| Evidence tests | `research/tests/native-scale-space-evidence.test.ts` |
| Runner tests | `research/tests/native-scale-space-evidence-audit.test.ts` |
| Generic artifact verifier | `research/tests/native-scale-space-evidence-artifact.test.ts` |
| Final artifact namespace | `research/data/experiments/native-scale-space-evidence-audit-0.1.0-development/` |

Use these exact versions:

| Contract | Version |
| --- | --- |
| Experiment | `native-scale-space-evidence-audit-0.1.0-development` |
| Raster transform | `native-scale-space-raster-v1` |
| Frozen availability | `native-scale-space-availability-v1` |
| Low-pass filter | `centered-clipped-box-q0.24-v1` |
| Output protocol | `native-scale-space-output-v1` |
| Metric registry | `native-scale-space-metric-definitions-v1` |
| Fixture manifest | `native-scale-space-fixtures-v1` |
| Expectations | `native-scale-space-expectations-v1` |
| Result shard | `native-scale-space-result-source-shard-v1` |
| Result columns | `native-scale-space-result-columns-v1` |
| Merkle tree | `native-scale-space-result-merkle-v1` |

This declares exactly eight new implementation/test files: four runtime/source files and four test files. The artifact namespace is a ninth deliverable path, not an implementation file.

## Frozen Reuse And Forbidden Changes

Reuse these modules unchanged:

| Path | Reused contract |
| --- | --- |
| `research/src/resolution-raster.ts` | Sharp `0.35.3` native decode, identities, target dimensions, occupancy, exact center coordinates |
| `research/src/resolution-evidence.ts` | Native-only availability bootstrap and predecessor comparison definitions |
| `research/resolution-canonical-raster-child.ts` | Sharp `0.33.5` canonical `224` control |
| `research/src/color.ts` | Existing RGB to OKLab conversion |
| `research/src/types.ts` | Raw image and RGB types only |

Do not reuse `research/src/pareto-experiment.ts` or `research/resolution-experiment-output-child.ts`; both have a mixed experiment surface broader than this audit. Implement only exclusive staging creation, atomic final publication, failed-attempt preservation, no-publish temporary cleanup, and path validation in `research/src/native-scale-space-output.ts`. Cover those primitives through `research/tests/native-scale-space-evidence-audit.test.ts`.

Do not modify the predecessor runner, its three tests, either canonical result artifact, promotion certificates, historical expected hashes, or any file under the published predecessor directory. If a helper cannot be reused without changing a frozen file, duplicate only the minimal logic in a new successor file and bind it into the new implementation closure.

## Native Availability And Witnesses

Decode each source once with `decodeNativeRaster`, validate its identity, and build exact native RGB occupancy. Run `analyzeResolutionEvidence(native, native, identity)` once before any arm exists. Freeze candidate masks and family membership from this native bootstrap.

The limits are `candidateCount <= 12`, `familyCount <= 12`, and ordered distinct edges `<= 132`. Label values use `Uint8Array`; `0xff` is the only unassigned sentinel and is forbidden in a completed native label plane.

Retain one native candidate label plane. Do not materialize all one-hot masks. Generate one candidate or family binary mask lazily into one reusable `Uint8Array`; generate at most one Q0.24 plane at a time into one reusable `Uint32Array`.

For candidate `k`, its witness is selected only from native indices whose label is `k`. Minimize squared OKLab distance to the frozen candidate mean; ties choose the lower native index. The recorded RGB is the exact three bytes at that index. Assert occupancy, index bytes, and mask membership. There is no generated or fallback color domain in this audit.

Candidate stable keys bind `(sourceSha256, decodedNativeIdentity, witnessRgb, witnessIndex, nativeMaskSha256)`. Equal RGB values with different masks or indices remain distinct. Family keys bind the ordered member keys, anchor key, and exact union-mask hash.

Source-scoped stable keys are not expected to survive transformed fixture sources. Transformation correspondence uses `(exactRgb, inverseMappedMaskSha256)` after mapping the transformed mask back into the parent fixture coordinates. Duplicate RGB correspondence ties use inverse-mapped mask hash, then native witness index.

Fail structurally if any mask is empty, labels do not partition native pixels, a witness is outside its mask, family unions do not reconcile, identities collide, or availability differs between arms.

## Targets And Arm Matrix

Use existing target dimension rules without enlargement:

| Attribution | Values | Status |
| --- | --- | --- |
| Max edge | `224`, `448` | **PD-DIAG** |
| Pixel budget | `50,176`, `200,704` | **PD-DIAG** |

Record requested attribution/value, actual target width/height/pixels, native-to-target ratios, and exact equality between any max-edge and pixel-budget dimensions. Never pool attribution policies.

There is exactly one Arm A row per source. Targets apply only to B and C.

| Arm | Representation | Dimensions | Cardinality per source |
| --- | --- | --- | --- |
| A | Frozen native binary mask as Q0.24 values `0` or `Q` | Native | Exactly one |
| B | Centered sliding box low-pass over that binary mask | Native | One per target policy |
| C | Exact samples from the corresponding B plane | Target | One per target policy |

The primary contrast is A/B low-pass observation. The B/C contrast is **topology-lattice representation/decimation**. B and C share a `lowPassFilterIdentity`; C values are a declared subset of B. Their arm view identities and hashes must differ because dimensions, coordinate domains, and serialization manifests differ.

The smallest initial factorial is one A row plus B/C at max-edge `224` **PD-DIAG**. After exact fixtures and a no-publish 37-source run pass structurally, add max-edge `448`, then the two pixel budgets in that fixed order. Additional scales, kernels, adaptive filters, learned scales, connectivity variants, and threshold variants are deferred to a new identity.

## Centered Sliding Box Low-Pass

Let native dimensions be `W,H`, target dimensions be `T_w,T_h`, native pixel center be `(x+1/2,y+1/2)`, and `Q = 2^24 = 16,777,216`.

The normalized window width and height are exactly one target-lattice cell: `1/T_w` and `1/T_h`. In native pixel-cell coordinates, define clipped bounds:

```text
q_x = 2*T_w
Lx_num = max(0, (2*x+1)*T_w - W)
Ux_num = min(W*q_x, (2*x+1)*T_w + W)

q_y = 2*T_h
Ly_num = max(0, (2*y+1)*T_h - H)
Uy_num = min(H*q_y, (2*y+1)*T_h + H)
```

These represent `[Lx_num/q_x,Ux_num/q_x)` and `[Ly_num/q_y,Uy_num/q_y)`. For source pixel column `i` and row `j`:

```text
ox(i) = max(0, min(Ux_num,(i+1)*q_x) - max(Lx_num,i*q_x))
oy(j) = max(0, min(Uy_num,(j+1)*q_y) - max(Ly_num,j*q_y))

N = sum(mask[j*W+i] * ox(i) * oy(j))
D = (Ux_num-Lx_num) * (Uy_num-Ly_num)
```

All endpoint, overlap, `N`, `D`, scaling, and rounding arithmetic uses `BigInt`. `D > 0` is required. The per-window numerator is bounded by its clipped denominator `D`; it is not bounded by `W*H`.

### Exact Summed-Area Evaluation

Do not rescan a window per output pixel. For each lazy candidate or family binary mask, build one `(W+1)*(H+1)` `Uint32Array` summed-area table, `SAT`, in row-major order:

```text
SAT[(y+1)*(W+1)+(x+1)] = mask[y*W+x]
  + SAT[(y+1)*(W+1)+x]
  + SAT[y*(W+1)+(x+1)]
  - SAT[y*(W+1)+x]
```

Every stored value is at most `W*H`, so it fits `Uint32` under the native-pixel bound. Number intermediates in SAT construction are exact safe integers; convert rectangle-query results to `BigInt` before weighting.

For one rational axis interval `[L_num/q,U_num/q)`, construct an ordered list of at most three disjoint segments: an optional left singleton pixel with its exact overlap numerator, one maximal full-pixel half-open range with weight `q`, and an optional right singleton pixel with its exact overlap numerator. If both fractional boundaries occupy the same pixel, merge them into one singleton with overlap `U_num-L_num`. Omit zero-width segments.

Take the Cartesian product of x and y segment lists, at most nine rectangles. Query each binary rectangle count with the four-corner SAT formula, multiply that count by the segment x/y overlap numerators using `BigInt`, and sum to `N`. This handles interior, boundary strips, and corners exactly in O(1) per output pixel. Building all candidate planes is O(`K*P`); candidates plus families are O(`(K+F)*P`) = O(`K*P`) because `K,F<=12`. Retain one SAT at a time and no window-area factor.

Quantize each exact rational independently to unsigned Q0.24 with half-up rounding:

```text
q24 = floor((N*Q + floor(D/2)) / D)
```

Require `0 <= q24 <= Q` and store it in `Uint32Array`. The real-value quantization error is at most `1/(2Q) = 2^-25`; exact half cases round upward. Bind the maximum error, rounding rule, `Q`, window formulas, clipping rule, target dimensions, parent native identity, and binary-mask hash into `lowPassFilterIdentity`.

At each native location, exact unquantized candidate coverages sum to `1` because native candidate masks partition the source. Independently rounded Q0.24 candidate values may sum to `Q + e`, where integer residual `e` must satisfy `abs(e) <= floor(candidateCount/2)`. Record `e`; exceeding the bound is structural invalidity. This is the mass-conservation control. Do not assert that thresholded speck area is monotone under filtering.

Verify `e` in a separate O(`K*P`) validation pass by querying each candidate SAT sequentially and adding its Q0.24 value to one reusable `Int32Array(P)` residual plane initialized to `-Q`. Release that residual plane before any metric Q0.24 plane is built. It is a validation plane, never retained concurrently with a Q0.24 metric plane. This preserves one label, one lazy mask, one SAT, and one field plane at a time.

Arm B stores the full native-dimension Q0.24 plane for the current lazy mask only. Arm C samples B at target cell `(u,v)` using the existing exact nearest-center rule:

```text
x = floor((2*u+1)*W/(2*T_w))
y = floor((2*v+1)*H/(2*T_h))
C[v*T_w+u] = B[y*W+x]
```

Clamp only the mathematically unreachable upper overflow to the last coordinate, as `nearestCenterCoordinate` does. The C source-index plane is a `Uint32Array` and is hashed. Every C value must equal the indexed B value exactly. Require equal `lowPassFilterIdentity`, equal parent mask identity, exact sampled-value equality, different arm view identities, and different arm view hashes. Do not require equal B/C view hashes.

## Coordinates, Masks, And Reconciliation

Native normalized centers are `((2*x+1)/(2*W),(2*y+1)/(2*H))`. Target center mapping uses the formula above. Target-cell native footprints use half-open bounds `floor(u*W/T_w)` through `ceil((u+1)*W/T_w)` and the analogous y bounds.

Candidate labels partition native pixels. Family membership is a compressed offset/index table; a lazy family mask is `1` exactly where the candidate label belongs to that family. Any typography mask is derived from the fully defined thin-component rule in the metric registry and transformed through the same B/C path.

For every candidate and family, reconcile native mask count, witness membership, B quantization residual bound, C sampled values, target source indices, threshold active count, components, and graph endpoints. A zero active count does not remove availability.

Argmax reconstruction chooses the greatest Q0.24 value. Exact ties choose lexicographically smaller frozen candidate stable key. Record the winning key and tie count.

## Metric Definition Registry

Implement one immutable exported registry named `NATIVE_SCALE_SPACE_METRIC_DEFINITIONS`, version `native-scale-space-metric-definitions-v1`. Include its canonical JSON and SHA-256 in protocol, results, certificates, analysis, and manifest.

`metricDefinitionsSha256 = SHA256("native-scale-space-metric-definitions-v1\0" || canonicalJson(NATIVE_SCALE_SPACE_METRIC_DEFINITIONS))`.

Every entry must contain exactly:

`id`, `version`, `inputs`, `formula`, `units`, `normalization`, `tieRule`, `emptyCase`, `numericEncoding`, `status`, and `arms`.

`status` is one of `structural`, `diagnostic`, or `synthetic-directional`. Direction applies only to the named fixture predicate, never to corpus quality.

Use this notation: `n` is lattice cells; `f_k(i)=q24/Q`; thresholds are `t in {Q/4,Q/2,3Q/4}` **PD-DIAG**; active means `q24 >= t`; components use four-connectivity, ascending first unvisited index, and fixed left/right/up/down visit order.

Component construction is exact. Scan row-major indices `0..n-1`; the first active unvisited index starts the next component and is its `firstIndex`. Mark cells visited when pushed. To visit neighbors in left, right, up, down order with a LIFO stack, push valid unvisited same-active neighbors in reverse order: down, up, right, left. Component records are emitted in ascending `firstIndex` order.

Bounding boxes are inclusive `(minX,minY,maxX,maxY)` and widths are `maxX-minX+1`, `maxY-minY+1`. `borderCells` counts component cells on the outer lattice boundary `x==0 || y==0 || x==width-1 || y==height-1`; it is not the frame band.

Component signature is:

```text
SHA256(
  "native-scale-space-component-signature-v1\0" ||
  canonicalJson({version:"native-scale-space-component-signature-v1",
                 width,height,thresholdQ24,connectivity:4,
                 traversal:"row-major-first;mark-on-push;visit-left-right-up-down",
                 bbox:"inclusive",borderCells:"outer-lattice",
                 record:"firstIndex,area,minX,minY,maxX,maxY,borderCells:u32be"}) ||
  NUL || orderedRecordBytes
)
```

Each record has those seven fields as unsigned 32-bit big-endian values. The empty signature hashes the same domain/header and zero record bytes.

### Required Registry Entries

| ID | Exact definition | Empty/tie rule | Units and status |
| --- | --- | --- | --- |
| `field.mass` | `sum(q24)/(Q*n)` | `n=0` invalid | fraction; diagnostic |
| `field.activeMass.t` | `activeCount/n` | no active cells gives `0` | fraction; diagnostic |
| `component.count.t` | number of four-connected active components | no active cells gives `0` | count; synthetic-directional only in declared fixtures |
| `component.countDensity.t` | `componentCount/n` | `n=0` invalid | components/cell; diagnostic |
| `component.largestMass.t` | largest component cells divided by `n` | no active cells gives `0` | fraction; synthetic-directional only in declared fixtures |
| `component.signature.t` | domain-separated signature above over ordered seven-u32be records | empty hashes domain/header plus zero records | digest; structural |
| `field.broad.t` | `p=activeMass`; `p=0 ? 0 : min(1,largestMass/sqrt(p))` | exact `p=0` branch | fraction Float64; synthetic-directional only in declared fixtures |
| `detail.boundaryDensity.t` | discordant horizontal/vertical active-neighbor edges divided by total horizontal/vertical neighbor edges | zero-edge lattice gives `0` | fraction; synthetic-directional only in declared fixtures |
| `detail.lowPassChange` | Arm B only: `sum(abs(Q*binary-q24))/(Q*n)` | unavailable for A/C, encoded `null` with reason | fraction; diagnostic |
| `frame.borderOwnership.t` | active border-band cells divided by border-band cells | empty border invalid | fraction; diagnostic |
| `frame.interiorOwnership.t` | active interior cells divided by interior cells | no interior gives `0` and `interiorEmpty=true` | fraction; diagnostic |
| `frame.excess.t` | `max(0,borderOwnership-interiorOwnership)` | follows ownership cases | fraction; synthetic-directional only in frame fixture |
| `frame.sideCoverage.t` | active cells on top/right/bottom/left divided by each side length | positive dimensions required | four fractions; diagnostic |
| `typography.thinMass.t` | let `a=boxWidth*height`, `b=boxHeight*width`, `d=width*height`, `minor=min(a,b)`, `major=max(a,b)`; qualify iff `50*minor<=d && major>=3*minor`; metric is qualifying active-cell count divided by `n` | no qualifying component gives `0`; all comparisons are exact safe integers | fraction of lattice; synthetic-directional only in thin fixture; `1/50` and `3` **PD-DIAG** |
| `graph.nodeCount` | frozen candidate count | none | count; structural |
| `graph.orderedEdgeCount` | `K*(K-1)` | `K<2` gives `0` | count; structural |
| `endpoint.distance` | Euclidean distance between exact native endpoint OKLab triples | equal RGB may yield `0`; lower stable-key endpoint wins ordering ties | OKLab distance Float64; diagnostic |
| `endpoint.fromPresence` | `field.mass` of from-node | none | fraction; diagnostic |
| `endpoint.toPresence` | `field.mass` of to-node | none | fraction; diagnostic |
| `endpoint.balance` | `s=from+to`; `s=0 ? 0 : 1-abs(from-to)/s` | exact zero branch | fraction Float64; diagnostic |
| `continuity.pairCoverage` | `sum(min(Q,qFrom+qTo))/(Q*n)` | `n=0` invalid | fraction; synthetic-directional only in split/ramp fixtures |
| `continuity.overlap` | `sum(min(qFrom,qTo))/sum(max(qFrom,qTo))` | zero denominator gives `0` | fraction Float64; diagnostic |
| `topology.pairConnectedShare.t` | activate where `qFrom+qTo >= t`; largest active four-connected component divided by pair-active cells | no pair-active cells gives `0` | fraction; synthetic-directional only in fixtures |
| `reconstruction.meanOklab` | mean distance from common-domain native sample to exact RGB of argmax candidate | no samples invalid | OKLab distance Float64; diagnostic |
| `reconstruction.p95Oklab` | ascending distances, index `ceil(0.95*n)-1` | no samples invalid; equal values retain sample order | OKLab distance Float64; diagnostic; `0.95` **PD-DIAG** |
| `reconstruction.maxOklab` | maximum sample distance | no samples invalid | OKLab distance Float64; diagnostic |
| `stability.bcSampleExact` | every C q24 equals its declared B source index | any mismatch false | boolean; structural |
| `stability.partitionResidualBound` | every native location satisfies `abs(sumCandidateQ24-Q) <= floor(K/2)` | none | boolean; structural |
| `stability.transformBDeltaQ24` | for each transformed native pixel `p'`, signed `B'(p')-B(inverseTransform(p'))` using the exact transform inverse table | empty transform invalid; no zero expectation | Int32 Q0.24-unit vector plus typed hash, min, max, BigInt decimal sum, Float64 mean absolute; diagnostic |
| `stability.transformCToParentBDeltaQ24` | for each transformed C cell, take its declared B' source index `p'`, inverse-transform `p'` to parent native pixel, and record signed `C'(cell)-B(parentPixel)` | empty target invalid; no zero expectation | Int32 Q0.24-unit vector plus typed hash, min, max, BigInt decimal sum, Float64 mean absolute; diagnostic |

The border band is `b=max(1,min(floor(min(width,height)*0.08),floor((min(width,height)-1)/2)))` for minimum dimension at least `3`; for dimensions `1` or `2`, every cell is border and interior is empty. `0.08` is **PD-DIAG**.

Holes, Euler characteristic, compactness, perimeter normalization, monotone progression, stroke-width distribution, treatment counts, flat/gradient semantics, and scalar field/detail/frame combinations are deferred because this protocol does not fully define them. Do not emit placeholder values.

Common-domain reconstruction uses `grid=pixelBudgetDimensions(W,H,16_384)` **PD-DIAG**, with `columns=grid.width`, `rows=grid.height`, and row-major sample index `s=r*columns+c`. The authoritative native reference coordinate is `xN=nearestCenterCoordinate(c,columns,W)`, `yN=nearestCenterCoordinate(r,rows,H)` and reference RGB is native pixel `(xN,yN)`.

Arm A reads the candidate label at `(xN,yN)`. Arm B reads each candidate Q0.24 plane at the same `(xN,yN)`. Arm C uses `u=nearestCenterCoordinate(c,columns,T_w)`, `v=nearestCenterCoordinate(r,rows,T_h)` and reads C at `(u,v)`. A/B/C argmax ties use stable key. Hash the native reference coordinate plane and each arm mapping plane independently. Reconstruct only with exact native witness RGB, compute OKLab distances in sample order, and report A once and B/C per target. Never average reconstruction metrics.

## Numeric And Typed Hash Encoding

Canonical typed-array hash input is:

`canonicalJson({version,type,shape,length,endianness:"big",negativeZero:"canonical-positive-zero",nonfinite:"reject"}) + NUL + encodedBytes`.

| Type | Encoding |
| --- | --- |
| `Uint8Array` | one unsigned byte per value |
| `Uint16Array` | unsigned 16-bit big-endian |
| `Uint32Array` | unsigned 32-bit big-endian |
| `Int32Array` | two's-complement signed 32-bit big-endian |
| `Float32Array` | IEEE-754 binary32 big-endian after `-0` becomes `+0` |
| `Float64Array` | IEEE-754 binary64 big-endian after `-0` becomes `+0` |

NaN, positive/negative infinity, nonfinite conversion results, and noncanonical typed-array types are structural invalidity. JSON numbers must also be finite; canonicalization maps `-0` to `0` before `JSON.stringify`.

Q0.24 planes are `Uint32Array` and hash as unsigned values, not platform memory bytes. BigInt intermediates are never serialized as JSON numbers; serialize required exact integers as canonical decimal strings.

## Exact Fixture Manifest

Define and export `NATIVE_SCALE_SPACE_FIXTURE_MANIFEST`. Embed the same object in `protocol.json`. Fixture RGB constants are:

`fixtureManifestSha256 = SHA256("native-scale-space-fixtures-v1\0" || canonicalJson(NATIVE_SCALE_SPACE_FIXTURE_MANIFEST))`, and the hash is bound beside the expectations hash.

| Key | RGB |
| --- | --- |
| `D` | `[16,24,40]` |
| `L` | `[232,184,72]` |
| `F` | `[220,48,64]` |
| `G` | `[36,180,112]` |
| `T` | `[244,240,224]` |
| `S0` | `[100,110,120]` |
| `S1` | `[108,116,124]` |

Every fixture uses row-major interleaved RGB bytes. Channel `c in {0,1,2}` for pixel `(x,y)` is stored at `((y*width+x)*3+c)`. Binary masks use row-major one byte per pixel at `y*width+x`.

Fixture targets are max-edge `8`, max-edge `16`, pixel-budget `64`, and pixel-budget `256`, all **PD-DIAG**. Corpus targets remain separate.

| Fixture ID | Dimensions | Exact pattern | Required asserted fields |
| --- | --- | --- | --- |
| `uniform-d` | `32x24` | every pixel `D` | availability, witness, partition, Q0.24 uniform value, active mass, one component, zero boundary density, B/C sample equality |
| `vertical-split` | `32x24` | `x<16 ? D : L` | endpoint identities, local partition mass, component count, pair coverage, side correspondence |
| `checker-1px` | `32x24` | `(x+y)%2===0 ? D : L` | same color availability/populations as split, A boundary density greater than split, low-pass attenuation predicate |
| `interior-specks` | `32x24` | `L` at `x in {4,12,20,28}` and `y in {3,11,19}`, otherwise `D` | exact availability, per-window partition conservation, Q residual bound, no threshold-area monotonic assertion |
| `frame-interior` | `32x32` | `F` when `x<2 || x>=30 || y<2 || y>=30`; otherwise `G` for `10<=x<22 && 10<=y<22`; otherwise `D` | frame excess and interior ownership predicates |
| `thin-line` | `32x24` | `y===11 ? T : D` | exact line witness, native thin mass, transformed retained mass vector |
| `broad-ramp` | `32x24` | channel `c=floor((D_c*(31-x)+L_c*x+15)/31)` | endpoint distance, pair coverage, overlap, connected share |
| `local-ramp` | `32x24` | for `8<=x<24`, channel `c=floor((D_c*(23-x)+L_c*(x-8)+7)/15)`; outside use `(x+y)%2===1 ? F : G` | broad-ramp pair coverage exceeds local-ramp pair coverage |
| `subtle-ramp` | `32x24` | channel `c=floor((S0_c*(31-x)+S1_c*x+15)/31)` | positive endpoint distance and finite continuity metrics |
| `seeded-noise` | `32x24` | start from split; xorshift32 seed `0x5eed1234`; per channel apply `(next%3)-1`, clamp `0..255` | byte hash determinism and rerun identity |

The xorshift step is exactly `s^=s<<13; s^=s>>>17; s^=s<<5`, each assignment reduced to unsigned 32-bit. Iterate row-major, then R/G/B.

Fixture identity is `SHA256("native-scale-space-fixture-v1\0" || canonicalJson(entryWithoutExpectedOutputs) || NUL || RGBBytes)`. Expected outputs are stored separately and cannot affect source identity.

Derived transform identity is `SHA256("native-scale-space-transform-v1\0" || parentFixtureIdentity || NUL || canonicalJson(transform))`. Apply each transform identically to RGB and binary masks:

| Transform ID | Output dimensions | Inverse source coordinate for output `(x',y')` |
| --- | --- | --- |
| `identity` | `W x H` | `(x',y')` |
| `nearest-2x` | `2W x 2H` | `(floor(x'/2),floor(y'/2))` |
| `reflect-horizontal` | `W x H` | `(W-1-x',y')` |
| `rotate-180` | `W x H` | `(W-1-x',H-1-y')` |
| `rotate-90-clockwise` | `H x W` | `(y',H-1-x')` |

Bounds are `0<=x'<outputWidth`, `0<=y'<outputHeight`. Transformation correspondence keys use exact RGB plus the SHA-256 of the transformed binary mask inverse-mapped into parent coordinates. For `nearest-2x`, inverse-map one value per parent cell only after asserting all four child mask values are equal. Never compare source-scoped stable keys across transformed sources.

## Versioned Expectations And Operand Resolution

Define and export `NATIVE_SCALE_SPACE_EXPECTATIONS`, version `native-scale-space-expectations-v1`. Include the complete object in `protocol.json` and bind:

`expectationsSha256 = SHA256("native-scale-space-expectations-v1\0" || canonicalJson(NATIVE_SCALE_SPACE_EXPECTATIONS))`.

Include `expectationsSha256` in every artifact header, source certificate, manifest scientific projection, and implementation test. The expectations object contains the transform definitions, target matrix, operand tuples, applicability rules, structural predicates, required scientific predicates, and disposition precedence.

An operand tuple has exactly:

`fixtureId`, `transformId`, `arm`, `target`, `thresholdQ24`, `candidateSelectors`, `resolvedCandidateKeys`, `orderedEndpoint`, `metricIds`, and `applicability`.

`target` is `null` only for A; otherwise it is exactly `{kind:"max-edge",value:8}`, `{kind:"max-edge",value:16}`, `{kind:"pixel-budget",value:64}`, or `{kind:"pixel-budget",value:256}`. Every scientific threshold is `Q/2 = 8,388,608`.

Resolve a declared fixture RGB to a candidate as follows. Convert the declared RGB and every exact-native candidate witness RGB with the frozen OKLab conversion. Choose minimum Euclidean OKLab distance; exact distance ties choose lexicographically smaller candidate stable key. Record declared RGB key/value, resolved exact RGB, stable key, witness index, and distance. A candidate-only operand is applicable when at least one candidate resolves. An ordered endpoint operand resolves `from` and `to` independently, preserves declared order, and is applicable only when both resolve to distinct candidate stable keys and the exact ordered graph edge exists. No alternate endpoint is substituted.

### Enumerated Fixture Matrix

Let `F` be exactly `uniform-d`, `vertical-split`, `checker-1px`, `interior-specks`, `frame-interior`, `thin-line`, `broad-ramp`, `local-ramp`, `subtle-ramp`, and `seeded-noise`. Let `X` be exactly `identity`, `nearest-2x`, `reflect-horizontal`, `rotate-180`, and `rotate-90-clockwise`. Let `X+` be `X` without `identity`. Let `Y` be the four target objects above.

| Matrix ID | Exact Cartesian rows | Required predicate |
| --- | --- | --- |
| `source-bytes` | `F x {identity}` | fixture bytes and fixture identity recompute exactly |
| `native-transform` | `F x X+ x {A}` | transformed RGB/mask bytes follow formulas; inverse-mapped native candidate masks correspond by RGB/mask key |
| `filter-recompute` | `F x X x Y x {B}` | B is recomputed from transformed native mask, transformed dimensions, and target dimensions using the SAT/BigInt/Q0.24 policy |
| `sample-recompute` | `F x X x Y x {C}` | `C'=sample(B',mapping')` at every target cell and C/B filter identities reconcile |
| `phase-diagnostics` | `F x X+ x Y x {B,C}` | emit `stability.transformBDeltaQ24` and `stability.transformCToParentBDeltaQ24`; no zero or invariance assertion |
| `deterministic-rerun` | `F x X x Y x {B,C}` plus `F x X x {A}` | repeated typed hashes and metrics are exact |

C nearest-center subset behavior is the only C transform contract. Do not require C invariance under `nearest-2x`, reflection, `180`, or clockwise `90` rotation. Do not require transformed normalized B equality either. Center phase, clipping, target-dimension rounding, and nearest-center phase can legitimately change B/C values. Compute phase deltas only after candidate correspondence by exact RGB/inverse-mapped native-mask key; unmatched candidates produce an explicit inapplicable diagnostic row, not a substituted match. Publish the two registered B/C transform-delta vectors and reductions as diagnostics.

### Scientific Operand Tuples

Every row below is `required:true`, `transformId:"identity"`, and `thresholdQ24:8388608`. Candidate keys are runtime-resolved by the exact rule above and stored back into the evaluated operand tuple.

| Predicate ID | Exact operands | Applicability | Exact boolean |
| --- | --- | --- | --- |
| `uniformInvariantSubset` | `uniform-d`: A target null and B/C max-edge `8`; candidate `D`; no edge; metrics `field.mass`, `field.activeMass.Q/2`, `component.count.Q/2`, `detail.boundaryDensity.Q/2`, `stability.bcSampleExact` | `D` resolves in all rows | every mass/active mass is `1`, component count `1`, boundary density `0`, and C samples B exactly |
| `checkerAttenuated` | `checker-1px`: A target null and B max-edge `8`; candidate `D`; no edge; metric `detail.boundaryDensity.Q/2` | `D` resolves in both rows | B value is strictly less than A value |
| `splitRetained` | `vertical-split`: A target null and B max-edge `8`; candidates `D`,`L`; ordered edge `D->L`; metric `continuity.pairCoverage` | distinct ordered edge applies in both rows | B value is at least `0.95 * A` using Float64 operands; `0.95` **PD-DIAG** |
| `geometryDistinguished` | `vertical-split` A and `checker-1px` A, target null; candidate `D`; no edge; metrics `field.mass`, `component.count.Q/2`, `component.signature.Q/2` | `D` resolves in both rows | masses have equal Float64 encoding, signatures differ, and split component count is lower |
| `broadBeatsLocal` | `broad-ramp` B max-edge `8` and `local-ramp` B max-edge `8`; candidates `D`,`L`; ordered edge `D->L`; metric `continuity.pairCoverage` | distinct ordered edge applies in both rows | broad value is strictly greater than local value |
| `frameDistinguished` | `frame-interior` B max-edge `16`; candidates `F`,`G`; ordered edge `F->G`; metrics `frame.excess.Q/2`, `frame.interiorOwnership.Q/2` | `F` and `G` resolve to distinct candidates and edge exists | F frame excess is greater than G, and G interior ownership is greater than F |
| `thinIdentityRetained` | `thin-line`: A target null and B/C max-edge `16`; candidate `T`; no edge; metric `typography.thinMass.Q/2` plus witness RGB | `T` resolves in all rows | resolved witness RGB is exactly `T` in every row and every thin-mass value is finite |

`interior-specks` contributes only structural mass reconciliation; `subtle-ramp` contributes finite endpoint/continuity diagnostics; `seeded-noise` contributes deterministic structural checks. They are not additional required scientific predicates.

## Synthetic Predicates And Transform Expectations

Structural fixture predicates are exact: source/transform bytes, identities, native witness membership, native partition, Q residual, B recomputation, `C'=sample(B',mapping')`, finite registry metrics, transform coordinate inversion, generic typed hashes, and deterministic reruns. Structural failure makes the run invalid.

For transformed controls, require only exact transformed native-mask inverse correspondence and exact recomputation in each transformed coordinate system. Record parent/transformed B and C deltas by correspondence key, target, and transform. Never classify a nonzero phase delta as structural failure.

Passing all applicable required scientific operand rows supports only the declared fixture behavior. It does not select an arm, target, attribution, or corpus policy.

## Per-Source Predicates And Scientific Disposition

Each source certificate contains these exact booleans:

| Predicate | Definition |
| --- | --- |
| `canonicalControlExact` | frozen canonical artifact hashes match; Sharp `0.33.5` normalized raster SHA-256 equals the source promotion-certificate hash; dimensions equal the frozen canonical entry; no extraction or timing comparison occurs |
| `nativeIdentityValid` | decoded-native identity recomputes exactly |
| `availabilityFrozen` | candidate/family keys, RGBs, masks, membership, and witnesses are arm-invariant |
| `candidatePartitionExact` | labels contain no sentinel and counts sum to native pixels |
| `familyUnionExact` | each family lazy mask equals union of member labels |
| `witnessMembershipExact` | every witness index belongs to its candidate mask and bytes equal RGB |
| `q24BoundsValid` | every field value lies in `[0,Q]` and partition residual is bounded |
| `bcSampleExact` | every C value equals its indexed B value |
| `coordinatesExact` | every mapping and footprint is in range and recomputes |
| `graphComplete` | nodes and all ordered distinct edges reconcile within limits |
| `metricsFinite` | all non-null registry outputs are finite and `-0` normalized |
| `artifactRowComplete` | one A row and every declared B/C target row exist exactly once |

Invalid-run conditions are failed structural fixture predicates, failed per-source structural predicates, canonical mismatch, nondeterminism, unsafe source/path, overflow, resource-bound violation, schema/hash/Merkle failure, forbidden import, or incomplete matrix. An invalid run cannot publish the final namespace.

A structurally valid run receives one scientific disposition:

| Disposition | Exact rule |
| --- | --- |
| `invalid-structural` | any structural fixture, per-source, resource, provenance, schema, hash, import, completeness, or deterministic predicate is false; stop and do not publish final |
| `valid-fixture-falsified` | structural validity passed and any applicable required predicate among `uniformInvariantSubset`, `checkerAttenuated`, `splitRetained`, `geometryDistinguished`, `broadBeatsLocal`, `frameDistinguished`, or `thinIdentityRetained` is false |
| `valid-fixture-supported-diagnostic` | structural validity passed; every required predicate in that complete seven-predicate set is applicable; every one is true |
| `valid-fixture-unsupported` | structural validity passed; no applicable required predicate is false; at least one required predicate is inapplicable |

Apply rows in the table as precedence, not as independent labels: structural invalid first, then falsified, then supported, otherwise unsupported. This is total and produces exactly one disposition.

Valid falsified and unsupported runs may publish with that disposition. They are scientific outcomes, not protocol errors. Corpus ties, contradictions, and incomparable vectors also publish. They do not trigger threshold changes or protocol revision under the same identity.

No aggregate arm winner, scale winner, quality score, or corpus support verdict is produced. The only support/falsification statement is the exact synthetic disposition above. Corpus summaries are counts and distributions of per-source vectors, ties, and contradictions.

## Metrics, Contradictions, And Reconstruction

Publish candidate and family identities, native/Q0.24 mass, threshold component metrics, broad/boundary/frame/thin metrics, complete graph endpoints, pair coverage/overlap/connected share, reconstruction, stability predicates, and exact hashes defined in the registry. Do not add unregistered metrics.

Endpoint RGB/Lab/distance and node identity are arm-invariant. Presence, coverage, overlap, and topology may vary. Analysis witnesses are diagnostic only and cannot replace native witnesses.

Store signed A/B and B/C metric deltas where both values exist. A tie requires equal typed encodings. A contradiction record names source, target, metrics, directions, and arm values. Do not average, vote, normalize into a score, compute regret, or rank arms.

If evidence is ever consumed elsewhere, ties and incomparable vectors preserve canonical bytes. No consuming selector is authorized or implemented here.

## Data Layout And Resource Bounds

Use structure-of-arrays and typed arrays. No per-pixel objects, RGB tuples, per-pixel maps, all-mask matrices, all-target planes, or whole-result matrices.

| Resource | Hard bound |
| --- | --- |
| Encoded metadata input pixels | `2,100,000` **PD-DIAG** |
| Decoded native pixels | `2,100,000` **PD-DIAG**; authorized corpus maximum is `1,960,000`, existing smoke coverage is `2,097,152` |
| Native RGB bytes | `6,300,000` **PD-DIAG** |
| Candidate count | `12` |
| Family count | `12` |
| Ordered candidate edges | `132` |
| Native label planes retained | exactly `1` |
| Lazy binary masks retained | at most `1` |
| Lazy Q0.24 planes retained | at most `1` |
| Lazy summed-area planes retained | at most one `Uint32Array((W+1)*(H+1))` |
| Validation residual planes retained | at most one `Int32Array(P)`, released before metric Q0.24 allocation |
| Common-domain samples | `16,384` **PD-DIAG** |
| Concurrent sources | `1` |
| Peak process RSS | `536,870,912` bytes **PD-DIAG** |
| Source result shards | exactly `1` per source |
| Maximum source shard | `2,097,152` bytes **PD-DIAG** |

Before native decode, call exactly `sharpModern(input, { limitInputPixels: 2_100_000 }).metadata()` in the modern lane. Define `pageCount = metadata.pages ?? 1` and require `pageCount === 1`, positive safe-integer encoded width/height, encoded `width*height <= 2_100_000`, and orientation in the absent-or-`1..8` domain. Record raw metadata, resolved `pageCount`, and their semantic hash. Reject before `decodeNativeRaster` on any failure.

After native decode and auto-orientation, require positive dimensions, `W*H <= 2_100_000`, exactly `W*H*3` bytes, and the expected uchar sRGB three-channel contract. The metadata preflight does not replace this postdecode bound.

At process start, before metadata, after metadata, after decode, after availability, after each arm/target, before shard write, and after source release, compute peak bytes as `process.resourceUsage().maxRSS * 1024`. Record every checkpoint and the maximum. Exceeding `536,870,912` bytes is invalid. The multiplier and units are part of the runtime policy.

The SAT byte length is exactly `(W+1)*(H+1)*4`; validate its safe-integer product before allocation and record it. Check every other dimensions/byte product before allocation.

Process sources, masks, and targets sequentially. Compact and release each plane before the next. There are exactly 392 source shards. An oversized source shard is a hard stop; do not split it or raise the bound under this identity. A different shard design requires a new experiment identity.

Pair metrics do not allocate two Q0.24 planes. Retain the from-candidate Q0.24 plane, release its mask/SAT, build the to-candidate mask/SAT, query each to value on demand, and reduce the pair metrics. After the to mask has built its SAT, reuse the released binary-mask buffer for the pair-active component plane. Reconstruction does not allocate a raster winner plane: update winner value/key only at the at-most-`16,384` common-domain samples while candidates are processed sequentially. Transform diagnostics retain one parent Q0.24 plane and query transformed values on demand from the transformed SAT. These algorithms are part of the plane-count invariant.

## Scientific Identity And Provenance

Bind experiment/version IDs, protocol ID, metric-registry hash, fixture-manifest hash, expectations hash, import-policy hash, disposition rules, target registry, source roster, source bytes, native identity, availability identity, witness/mask identities, filter identity, B/C view identities, coordinate hashes, Q0.24 hashes, runtime identities, implementation closure, package hashes, shard hashes, and Merkle root.

Canonical Sharp `0.33.5` stays in the existing child process. Modern Sharp `0.35.3` decodes native once in the runner. A modern raster cannot satisfy canonical exactness by matching dimensions or bytes without the canonical runtime certificate.

Implementation identity uses recursive local static import closure plus declared extras. Unresolved imports, symlinks, dynamic local imports, or forbidden paths are invalid. Bind raw SHA-256 for every closure file, `package.json`, `pnpm-lock.yaml`, and all four successor test files.

## Exact Import Policy

Define and export `NATIVE_SCALE_SPACE_IMPORT_POLICY`, version `native-scale-space-import-policy-v1`, and bind:

`importPolicySha256 = SHA256("native-scale-space-import-policy-v1\0" || canonicalJson(NATIVE_SCALE_SPACE_IMPORT_POLICY))`.

The complete local-file allowlist is:

| Class | Exact local paths |
| --- | --- |
| Successor runtime | `research/audit-native-scale-space-evidence.ts`, `research/src/native-scale-space-raster.ts`, `research/src/native-scale-space-evidence.ts`, `research/src/native-scale-space-output.ts` |
| Successor tests | `research/tests/native-scale-space-raster.test.ts`, `research/tests/native-scale-space-evidence.test.ts`, `research/tests/native-scale-space-evidence-audit.test.ts`, `research/tests/native-scale-space-evidence-artifact.test.ts` |
| Frozen direct dependencies | `research/src/resolution-raster.ts`, `research/src/resolution-evidence.ts`, `research/src/color.ts`, `research/src/types.ts` |
| Canonical child executable | `research/resolution-canonical-raster-child.ts` |
| Canonical child transitive only | `research/src/image.ts`; the only permitted incoming local edge is from `research/resolution-canonical-raster-child.ts` |

Node built-ins and external packages resolved by the bound lockfile are allowed. Sharp `0.35.3` is allowed only in the modern runner/raster lane. Bare Sharp `0.33.5` is allowed only in the canonical child closure. Every local static import edge must resolve to the allowlist. The canonical child is spawned as an executable and is not imported into the modern process.

The exact forbidden registry is:

| Rule | Forbidden scope |
| --- | --- |
| Exact files | `research/src/extract.ts`, `research/src/palette.ts`, `research/src/candidates.ts`, `research/src/candidate-output.ts`, `research/src/candidate-validation.ts`, `research/src/guarded-palette.ts`, `research/src/pareto-experiment.ts`, `research/resolution-experiment-output-child.ts` |
| Basename tokens | any local path whose basename contains `next`, `joint`, `review`, `gallery`, or `feedback`, case-insensitive |
| Role/candidate selectors | any local path whose basename contains `role`, `selector`, `solver`, `candidate-availability`, or `candidate-generation`, case-insensitive |
| Palette modules | any local path under `research/src/` whose basename contains `palette`, except the three exact successor `native-scale-space-*` modules, which do not contain `palette` |
| Dynamic loading | all dynamic local `import()`, `require`, eval-generated import, worker path, child path, and plugin path except the exact canonical child executable |

Scan source text and the resolved closure. A forbidden token in comments or string data is not alone an import violation; a resolved module edge, executable edge, worker edge, or serialized implementation path is. Artifact schemas must also reject forbidden module paths in provenance. No selector, solver, review, feedback, gallery, role output, or palette output may be invoked, instantiated, or serialized.

## Canonical JSON And IDs

Canonical JSON recursively sorts object keys by Unicode code-unit order and preserves array order. It rejects `undefined`, functions, symbols, BigInt values, sparse arrays, nonfinite numbers, and unsupported objects. It maps `-0` to `0` and then uses compact `JSON.stringify` with no trailing spaces. Artifact files end with exactly one LF; semantic hashes use canonical JSON without that LF, while raw hashes include exact file bytes.

`protocolId = SHA256("native-scale-space-protocol-v1\0" || canonicalJson(protocolWithoutProtocolId))`.

The manifest excludes `manifest.json` from both `artifactHashes` and `artifactSemanticHashes`. It hashes every other final artifact and shard. The manifest's non-self-referential projection is the full manifest with only `scientificIdentitySha256` removed. Compute:

`scientificIdentitySha256 = SHA256("native-scale-space-scientific-identity-v1\0" || canonicalJson(manifestWithoutScientificIdentitySha256))`.

The verifier recomputes that projection. No field hashes bytes that contain its own expected digest.

## Merkle Definition

Sort shard records by numeric `shardIndex`. Require indices `0..391`, contiguous source ranges, one source per shard, and roster keys equal the same ordered 392-source roster.

Leaf digest is:

```text
SHA256(
  "native-scale-space-result-leaf-v1\0" ||
  canonicalJson({path,shardIndex,sourceStartIndex,sourceEndIndexExclusive,
                 sourceCount,sourceEntryKeys,bytes,rawSha256,semanticSha256})
)
```

Parent digest is `SHA256("native-scale-space-result-node-v1\0" || left32 || right32)`, where child digests are raw 32-byte values. Pair in order at each level. If a level has an odd count, duplicate its final digest. Empty trees are invalid. The final digest is lowercase hex in `results.json` and `manifest.json`.

## Generic Artifact Verifier

Write `research/tests/native-scale-space-evidence-artifact.test.ts` before protocol freeze and before publication. It must be generic and contain no published artifact hashes, protocol ID, scientific identity, shard hashes, or Merkle root literals.

The test reads final `manifest.json`, validates its exact schema, verifies the non-self-referential projection, reads paths declared by the manifest, rejects traversal/symlinks/missing/extra files, recomputes raw and semantic hashes, validates protocol ID from `protocol.json`, validates metric, fixture, expectations, and import-policy hashes, validates the resolved allowlisted closure and forbidden registry, validates all certificates and per-source predicates, validates exact shard coverage and the Merkle algorithm, and validates runtime/package identities.

Before publication, run the same verifier library against a staging directory whose manifest is complete. After atomic publication, the unchanged test reads the final manifest. Manifest verification never relies on hashes embedded in test source.

## Artifact Namespaces And Publication

| Namespace | Exact rule |
| --- | --- |
| Final | `research/data/experiments/native-scale-space-evidence-audit-0.1.0-development/` created only by one atomic rename; preexistence is a hard stop |
| Staging | `research/data/experiments/.native-scale-space-evidence-audit-0.1.0-development.staging-<uuid>/` opened with exclusive creation |
| Failed | `research/data/experiments/native-scale-space-evidence-audit-0.1.0-development.failed-<UTC-YYYYMMDDTHHMMSSmmmZ>-<uuid>/` append-only preserved rename from staging |
| No-publish | `mkdtemp(join(tmpdir(),"native-scale-space-evidence-audit-0.1.0-development-"))`; never creates or renames a path under `research/data/experiments/` |

On successful no-publish runs, verify then recursively remove the temporary directory. On failed no-publish runs, print the temporary path and preserve it for diagnosis; it remains nonpublishable. Failed publishable attempts move staging to a unique failed namespace. A failed namespace can never be promoted or renamed to final.

The final namespace contains exactly six top-level JSON files: `protocol.json`, `results.json`, `certificates.json`, `controls.json`, `analysis.json`, and `manifest.json`; and exactly one `results/` directory containing `source-0000.json` through `source-0391.json`. This is exactly 398 JSON files. No other file or directory is allowed. The manifest hash tables cover the other 397 JSON files and exclude `manifest.json` itself.

## Required Ablations

| Ablation | Exact comparison |
| --- | --- |
| Raw native | One Arm A row per source |
| Same-native-dimension low-pass | A versus B at each target |
| Topology-lattice representation/decimation | B versus C with exact sampled-value equality |
| `224` versus `448` | Same B or C attribution, signed vectors only |
| Max-edge versus pixel-budget | Same nominal scale, non-square attribution retained |
| Candidate availability freeze | Frozen matrix versus separately labeled published predecessor identity drift; never an A/B/C arm |
| Native versus analysis witness | Exact native witness versus diagnostic analysis witness |
| Canonical `224` | Isolated control only |

Role, joint-role, selector, solver, and review ablations are not required, deferred, or authorized by this plan; they are outside its implementation domain.

## Implementation Stages And Delegation

1. Contract agent: encode exact schemas, canonical JSON, protocol ID, metric/fixture/expectations/import-policy hashes, total dispositions, limits, and forbidden-import rules.
2. Raster agent: implement BigInt clipped sliding windows, Q0.24 half-up quantization, C center sampling, typed hashes, and exact bounds.
3. Availability agent: implement one-label/lazy-mask architecture, deterministic witnesses, stable keys, families, and transform correspondence.
4. Metric agent: implement only registry entries and their tests; reject unregistered output fields.
5. Fixture agent: generate exact fixture bytes, identities, transforms, structural predicates, and scientific predicates without corpus access.
6. Output agent: implement only the minimal namespace/path/exclusive-create/rename/remove primitives in `native-scale-space-output.ts` and runner integration tests.
7. Artifact agent: implement canonical serializers, one-source shards, Merkle tree, manifest projection, generic verifier, and exact file counts before publication.
8. Runner agent: implement raster-only canonical control, modern metadata preflight/native lane, one A row, sequential B/C targets, RSS sampling, and total dispositions without importing extraction.
9. Verification agent: run focused tests, typecheck, no-publish limits, deterministic repeats, exact historical-failure-set comparison, closure-policy verification, and staging verification.
10. Orchestrator: ensure only eight declared implementation/test files and the final artifact namespace are introduced, no forbidden path enters closure, and only a complete valid 392-source run is atomically published.

Subagents may work on disjoint new files. Source processing, shared-file edits, staging verification, and publication are serialized by the orchestrator.

## Verification Commands

Run from repository root.

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/resolution-raster.test.ts research/tests/resolution-evidence.test.ts research/tests/multi-resolution-palette-evidence-audit.test.ts
```

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/native-scale-space-raster.test.ts research/tests/native-scale-space-evidence.test.ts research/tests/native-scale-space-evidence-audit.test.ts
```

```sh
pnpm exec tsc -p research/tsconfig.json
```

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/audit-native-scale-space-evidence.ts --limit 3 --no-publish
```

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/audit-native-scale-space-evidence.ts --limit 37 --no-publish
```

```sh
pnpm research:test
```

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/audit-native-scale-space-evidence.ts
```

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/native-scale-space-evidence-artifact.test.ts
```

`--limit` changes execution coverage only, requires `--no-publish`, retains the full protocol identity, and can never produce the final namespace.

## Full 392-Source Conditions

The publishable run uses the predecessor's exact ordered roster: 37 direct `images/` children and 355 direct `00/` children. Bind the exact canonical artifacts and roster hash before source decode. Output-unseen roots remain sealed and are not inputs.

Require all 392 canonical controls exact, all per-source structural predicates true, exactly one A row per source, all declared B/C targets complete, all C values exact B samples, exact fixture structural predicates, complete registry outputs, deterministic repeated semantic roots, resource bounds, implementation closure, exactly 392 bounded shards, generic staging verification, and no forbidden imports.

A partial run is temporary debugging coverage only. Partial outputs cannot be combined. Any invalid publishable run is preserved only in a failed namespace. A structurally valid fixture-falsified or fixture-unsupported full run may publish with that exact disposition.

## Dated Test And Environment Record

Snapshot date: `2026-07-23`. This is provenance, not a permanent expected denominator.

| Field | Verified value |
| --- | --- |
| Node | `25.8.1` |
| Platform | `darwin` |
| Architecture | `arm64` |
| Canonical Sharp | `0.33.5` |
| Modern Sharp | `0.35.3` |
| Canonical runtime SHA-256 | `9adadc964bcb94964a1cb4ac4b6c6e7a833f8c76e07afd05028e128e786acfab` |
| Modern runtime SHA-256 | `387a9126c301a24aaf0406a87f8ff49fe88a6ea5fde47eb742bf98927a4ee9d3` |
| `package.json` raw SHA-256 | `6d01b7ca68aae4015b98c3cc560c0dfaf774d0020348271d302b62322ce27ff3` |
| `pnpm-lock.yaml` raw SHA-256 | `a858afe1d3946e113b58fc0c7bea25ed6a418d8190ce57951b6a4d0fe3af6058` |
| Focused resolution suite | `41/41` passed |
| Full research snapshot | `364` passed, `16` failed, `380` total |

The causal attribution of the 16 failures solely to the addition of `sharp-modern` changing historical package/lock implementation hashes was previously verified. Do not modify historical expected hashes to hide it.

The exact previously verified failing filename set is:

1. `research/tests/connected-family-representative-fidelity-artifact.test.ts`
2. `research/tests/joint-palette-ablation-stable-noncollapsed-field-artifact.test.ts`
3. `research/tests/joint-palette-compact-relation-dominance-artifact.test.ts`
4. `research/tests/joint-palette-evidence-frontier-artifact.test.ts`
5. `research/tests/joint-palette-field-dominance-first-artifact.test.ts`
6. `research/tests/joint-palette-field-identity-overlay-availability-audit-artifact.test.ts`
7. `research/tests/joint-palette-field-tradeoff-artifact.test.ts`
8. `research/tests/joint-palette-threshold-free-collapse-artifact.test.ts`
9. `research/tests/next-palette-development-artifact.test.ts`
10. `research/tests/next-palette-field-pair-development-artifact.test.ts`
11. `research/tests/next-palette-incumbent-accent-artifact.test.ts`
12. `research/tests/next-palette-joint-field-relation-factorial-audit-artifact.test.ts`
13. `research/tests/next-palette-joint-pareto-artifact.test.ts`
14. `research/tests/next-palette-narrowed-accent-artifact.test.ts`
15. `research/tests/next-palette-soft-contrast-frontier-artifact.test.ts`
16. `research/tests/typography-chromatic-apca-artifact.test.ts`

Future full-suite verification compares the exact failing filename set and failure cause, not `364/380`. Any added, removed, or causally different failure requires explicit diagnosis. A historical failure disappearing because an expected hash was edited is invalid.

## Hard Stops

- Canonical mismatch, stale identity, nondeterminism, unsafe path, source mutation, symlink, overflow, nonfinite value, or hash/schema/Merkle failure.
- Candidate/family drift, invalid witness membership, sentinel in completed labels, partition failure, family-union failure, or identity collision.
- Candidate count over 12, family count over 12, edge count over 132, native byte/pixel bound, peak RSS bound, or shard bound violation.
- More than one native label, lazy binary mask, lazy SAT, validation residual, or lazy Q0.24 plane retained contrary to their declared nonoverlap lifetimes.
- B/C filter identity mismatch, C sampled-value mismatch, equal B/C view identity/hash, or coordinate mismatch.
- Missing/duplicate A row, target row, source row, shard, or extra final file.
- Any unregistered metric, hidden scalarization, averaging, voting, ranking, outcome-selected scale, or protocol tuning.
- Any selector, solver, role, review, feedback, gallery, or palette-output import/invocation/instance/serialization.
- Any unexpected historical test failure-set change without diagnosis.

Scientific fixture falsification, unsupported predicates, corpus contradictions, ties, and incomparable vectors are not hard stops when all structural predicates pass.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Outcome fitting | Frozen registry, fixtures, targets, predicates, and new identity for changes |
| Scale overfitting | Fixed `224`/`448` and budgets; no aggregate winner |
| Hidden scalarization | Registry statuses and schema rejection of score/rank fields |
| Filter error | BigInt rational integration, Q error bound, exact fixture windows |
| Coordinate error | Exact center map, source-index hash, B/C sampled equality, inverse transforms |
| Candidate drift | One native bootstrap and arm-invariant availability certificates |
| Texture domination | A/B fixture predicates and separate raw versus normalized metrics |
| Low-pass erasure | Split/ramp retention predicates and explicit zero-active observations |
| Artifact size | One label, one lazy mask, one Q plane, sequential sources, one bounded shard/source |
| Provenance failure | Isolated Sharp lanes, implementation closure, generic manifest verifier |

## Next-Agent Checklist

- [ ] Add exactly eight declared implementation/test files and only the one final artifact namespace; leave canonical and predecessor files untouched.
- [ ] Encode and hash the metric registry, fixture manifest, expectations matrix, and import policy before corpus execution.
- [ ] Implement one label plane, one lazy binary mask, and one lazy Q0.24 plane.
- [ ] Implement one bounded lazy Uint32 SAT and release validation residuals before metric Q0.24 allocation.
- [ ] Implement BigInt clipped centered windows and Q0.24 half-up rounding exactly.
- [ ] Make C an exact center-sampled subset of B with shared filter identity and distinct view hashes.
- [ ] Require transformed native-mask inverse correspondence and `C'=sample(B',mapping')`; treat transformed B/C phase deltas only as diagnostics.
- [ ] Enforce deterministic in-mask witnesses and stable-key argmax ties.
- [ ] Implement typed hashes, canonical JSON, protocol ID, manifest projection, and Merkle domains exactly.
- [ ] Enforce the hashed exact import allowlist/forbidden registry and never import or run extraction.
- [ ] Implement minimal append-only output primitives only in `native-scale-space-output.ts`.
- [ ] Write the generic manifest-driven artifact verifier before publication with no embedded result hashes.
- [ ] Separate invalid structural runs from valid supported, falsified, and unsupported fixture dispositions.
- [ ] Publish corpus contradictions as vectors; produce no aggregate arm or scale winner.
- [ ] Enforce native bytes/pixels, RSS, candidate/family/edge, plane, and one-shard/source bounds.
- [ ] Use only final, staging, failed, and no-publish namespaces as defined.
- [ ] Compare future full-suite failures by the exact 16-file set and cause.
- [ ] Import, invoke, instantiate, and serialize no selector, solver, role, review, or palette path.
- [ ] Run the full 392-source publication only after exact fixtures, limited runs, and staging verification.

## Execution Addendum

This section is an append-only record of the completed execution. It does not alter the frozen inputs or retroactively broaden the experiment's authorization.

The full audit was published at:

`research/data/experiments/native-scale-space-evidence-audit-0.1.0-development/`

| Identity | Published value |
| --- | --- |
| Protocol ID | `4396a1deeaeaa65bdba6ca9e86af1c691d35304a51e5a5f7feb8580deb23ac16` |
| Scientific identity SHA-256 | `382ae1560911fc062f477c4bd8e299af0addabe12e7634fdcfb805e55a833e0b` |
| Implementation identity SHA-256 | `8f5cea99d6e072a31813a4c0a8e38000a2527375d272a01c8075e3da0242ef78` |
| Result Merkle root | `9fb1c63bde21a646f37c7514c06ba0b180e4ebb812f47dab914a122dd2006199` |
| Disposition | `valid-fixture-supported-diagnostic` |

The artifact contains exactly `398` JSON files, including `392` one-source shards. All `1,220` structural fixture rows and all seven declared scientific fixture predicates passed. The largest shard is `1,913,627` bytes. Peak process RSS is `517,898,240` bytes, leaving `18,972,672` bytes below the hard limit.

### Approved Arithmetic Amendment

During implementation, literal per-cell BigInt scaling caused cumulative V8 heap growth that could not satisfy the RSS gate. Before publication, the arithmetic contract was explicitly revised to `centered-clipped-box-q0.24-v2`.

Version 2 retains BigInt endpoints, overlaps, and the public exact oracle. The hot evaluator uses exact safe-integer arithmetic after proving:

```text
D <= 4*W*H <= 4*2,100,000
N <= D
N*Q + floor(D/2) < 2^53
```

Randomized geometries and the complete raster oracle suite require bit-exact equality with the BigInt reference. The published protocol, implementation closure, identities, fixtures, results, and verifier bind version 2. The earlier version-1 declarations in this handoff remain above as historical pre-execution requirements and are superseded only by this explicit amendment.

### Result And Limitation

The audit confirms that the max-edge `224` observation removes native spatial evidence: candidate boundary density and component density decrease under A/B low-pass filtering, while B/C decimation independently changes topology on the smaller lattice. The corresponding effects are materially smaller at `448`.

This result answers the mechanism question but not the original product question. Native candidate and family availability were deliberately frozen before the A/B/C arms, while palette output, role allocation, selection, and review were forbidden. Therefore this audit does not determine which candidates `region-graph-0.19.0` missed at `224`, whether native-only candidates reach a final palette, or whether resulting palettes are visually better.

The authorized follow-up requires a new experiment identity and plan. It should compare exact frozen `region-graph-0.19.0` with a native-resolution variant that changes only the analysis resolution, permits candidate discovery to differ, preserves downstream scoring and selection policies, records candidate and palette differences, and reviews only changed outputs under a separately frozen protocol.
