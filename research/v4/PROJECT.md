# Palette Research v4: Project Context

**Status:** working draft, source-backed as of 2026-08-30. This document defines the problem,
evidence, custody, and inherited constraints with which v4 starts. It does not select a v4 mechanism,
prescribe an architecture, or inventory reusable implementation pieces. The v4 documents become
durable and revision-bound only when committed or otherwise frozen to an immutable content identity;
their current untracked working copies are not such a revision.

No algorithm in this repository is product-ready. No v3 winner has been selected. In particular,
v4 must not be described as an implementation of any v2-3 or v3 prototype.

Related v4 documents have narrower authority:

- `STRATEGY.md` defines how to investigate. It cannot override the inherited product context,
  constraints, evidence, or custody in this document.
- `MECHANISMS.md` is a revisable mechanism census and taxonomy. Its section order is not execution
  order, and an entry does not select a mechanism, license a composition, or prescribe architecture.

## 1. The product problem

The runtime input is one supplied album-artwork file. The call is cold: there is no prior corpus
pass, companion file, warm model, index, or precomputed artifact. Work performed offline on known
corpora is development tooling only. The normative v3 policy processes the supplied file at native
resolution without resampling and refuses genuinely transparent inputs rather than silently
flattening them. (`research/v3/PHASE_0_DECISIONS.md:14-47`,
`research/v3/PHASE_0_DECISIONS.md:571-597`)

The output is a complete UI treatment, not a bag of dominant colours. It always has four roles:

| role | product meaning |
| --- | --- |
| `background` | principal application field |
| `surface` | second field or separator, or exact collapse to `background` |
| `foreground` | main content or text over the field |
| `accent` | meaningful controls or identity elements, or exact collapse to `foreground` |

The treatment may also carry a rendered field gradient. The quality unit is the complete joint
tuple, including field state, rather than an isolated role or a target hex. This was the explicit
unit in the complete-palette reset and is also the reason a reconstruction-optimal colour set is not
automatically a usable treatment. (`research/PALETTE_EXTRACTION_QUALITY_RESET_HANDOFF.md:12-25`,
`research/RESEARCH.md:3-12`)

### 1.1 Visual and supplied-file domain

The target is heterogeneous album artwork as seen inside an application treatment, not generic
dominant-colour extraction and not a segmentation API. Relevant structures include flat and shaded
fields, typography, small identity marks, photographs, portraits, frames, and multi-region or
collage-like compositions. The current input boundary is opaque album artwork; transparent disc
scans and press-photo cutouts were measured as a different content class and excluded.
(`research/v3/PHASE_0_DECISIONS.md:35-47`, `research/RESEARCH.md:3-12`)

The palette attaches to the exact supplied file, not to an abstract artwork. Two renditions may
legitimately differ when one lacks information visible in the other. They should otherwise agree:
cross-rendition differences are acceptable when explained by genuine information loss, not by
pipeline chaos. The contract metadata records `algorithmVersion`, `preprocessingVersion` (intended
to identify the pinned decoder plus input preprocessing), the lowercase SHA-256 `inputContentHash`,
`sourceRendition` path, header width, header height and decoder-reported format, and `processedSize`
width and height. It does not record a renderer identity or retain the source bytes.
(`research/v3/PHASE_0_DECISIONS.md` section 1; `research/v3/src/contract/types.ts`, Metadata)

### 1.2 Output contract

The v3 contract is the most precise current statement of the output boundary:

- `background`, `surface`, `foreground`, and `accent` are always present.
- `surfaceCollapsed: true` means `surface` is exactly equal to `background`.
- `accentCollapsed: true` means `accent` is exactly equal to `foreground`.
- A gradient is optional. When present it has 2 to 4 ordered stops, starts exactly at
  `background`, and ends exactly at `surface`. Interior stops remain independent role-wise.
- A collapsed surface cannot publish a non-degenerate gradient.
- Ordinary role and stop colours are literal 8-bit source pixels, not centroids or generated
  approximations.
- One declared escape may introduce exactly one non-source colour: pure black or pure white, in
  `background` or `foreground` only, with the corresponding partner collapsed. The declaration
  also has to describe the colour actually published.
- The validator can enforce the escape's structural shadow and verify that the declared colour is
  absent. It cannot prove the semantic condition that there was genuinely no other way to make a
  two-colour treatment.
- Text and accent contrast floors apply to flat fields and the rendered OKLab ramp, including
  between-stop minima. The implementation evaluates the ramp deterministically with dense samples
  per segment and a local refinement pass; this is not exact inspection of a mathematical continuum.
  Its documented 8-bit deep-basin residual is at most 0.05 raw APCA units where the true minimum is
  at least 1 raw unit. It also clips out-of-gamut OKLab interpolants while browsers gamut-map them,
  so excursion cases are an explicit rendering approximation. Technical contrast validity is
  necessary but does not establish visual quality.
- The result records both resolved contrast floors and the exact metadata fields listed in section
  1.1; no broader provenance is implied.

The schema and escape semantics are in `research/v3/src/contract/types.ts` under Roles, Gradient,
Collapse, The one sanctioned non-source colour, Metadata, and The palette. Exact collapse and
gradient endpoint enforcement are in `research/v3/src/contract/invariants.ts` under I1. Ramp search,
residual, and gamut limitations are documented in `research/v3/src/contract/ramp.ts`; whole-ramp
scope is specified in `research/v3/PHASE_0_DECISIONS.md` section 2.

Source existence is hard, but source population is not a validity gate. The population floor was
demoted after it failed to discriminate endorsed from rejected colours; exact-triple population is
still reported. Spatial spread remains explicitly deferred as `I2.spatial-spread`, not silently
passed. (`research/v3/src/contract/invariants.ts:1320-1328`, `:1386-1437`, `:1555-1606`;
`research/v3/src/contract/BELONGS_STUDY.md:14-27`)

### 1.3 Determinism and endpoint

For identical input bytes and fixed versions, the product expectation is byte-identical output.
Relabeling or iteration order must not change it; slight, visually irrelevant encoding changes
should not cause arbitrary treatment changes. These properties are gates or separate robustness
measurements, not substitutes for aesthetic review. Human preference on the rendered treatment is
the product endpoint. (`research/v3/PHASE_0_DECISIONS.md:197-208`,
`research/v3/src/robustness/README.md:99-105`, `research/v3/PHASE_2_HANDOFF.md:149-165`)

## 2. Evidence and authority

### 2.1 Human authority and multi-valid answers

Flo is the sole reviewer and decision authority. A rule, invariant, model, metric, or prior verdict
does not overrule a current human judgement. The warehouse and automated instruments support
iteration; they are not aesthetic judges. (`research/v3/PHASE_1_HANDOFF.md:8-21`,
`research/v3/PHASE_2_HANDOFF.md:149-159`)

One artwork can support several valid complete palettes. A reviewer-composed palette is one endorsed
sample, not a unique target. Empty corrections are not disagreement, and several samples for one
image are all retained. Role labels can also differ while the colour set remains acceptable.
(`research/v2-3-eval/README.md:129-147`, `:206-250`)

The approximately 88% repeat/regrade agreement is useful context for single-verdict noise, but it
is not a universal reviewer-accuracy estimate. It came from regrading identical palettes in a
particular v2-3 review context. Other instruments and question formats have different repeat
figures, so v4 must scope any reliability statement to its actual task and sample.
(`research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:244-248`,
`research/v3/PHASE_0_DECISIONS.md:473-481`)

Grades answer whether a treatment works. Comments explain why. Grade-only batches remain valid
quality evidence but provide little mechanism diagnosis. This limitation is concrete in Phase 3:
round 1 had no reviewer text across 16 verdicts; round 2 had one substantive comment across 16
final items. (`research/v3/phase-3/rounds/round-1/RESULTS.md:12-29`,
`research/v3/phase-3/rounds/round-2/RESULTS.md:21-63`)

### 2.2 Warehouse custody

The review warehouse is append-only and contains autosave snapshots. Judgment volume must be
computed by keeping the latest verdict for each `(batch id, item id)`, not by counting JSONL rows
and not by item id alone. For example, 206 Phase 2 verdict rows reduce to 61 distinct verdicts over
82 displayed palettes. (`research/v3/phase-2/GRAFT_INVENTORY.md:33-43`)

Warehouse custody is specific rather than complete. An artwork record stores absolute `path`,
lowercase SHA-256 `sha256`, and rendition `width`, `height`, `format`, byte count, `collection`, and
nullable `artworkId`. Each verdict side stores `paletteHash`, `variantId`, and a code fingerprint of
`algorithmVersion`, `preprocessingVersion`, `gitCommit`, and `dirty`, and may carry an optional inline
loose palette snapshot. The warehouse hashes palettes but deliberately does not validate the palette
contract.
(`research/v3/src/warehouse/records.ts`, ArtworkIdentity, Rendition, CodeFingerprint, VerdictSide,
and PaletteSnapshot)

Two gaps remain. Verdict records carry no distinct renderer or review-UI version/hash. The current
gradient CSS and mock revision are documented and tested, but they are not independently identified
by each verdict row. The batch log and warehouse retain a source path, byte count, hash, and header
facts, not an immutable copy of the source bytes. The media route re-reads the path and refuses to
serve it if byte count or SHA-256 changed, which detects mutation but cannot recover a missing file.
(`research/v3/src/review-server/README.md`, Mock player layout and Pushing a batch;
`research/v3/src/review-server/server.ts`, `media()`)

Durable project status below uses tracked repository records. Excluded `.worktrees` files are local,
nonportable snapshots in this checkout; they may motivate archaeology but do not establish inherited
v4 evidence or status.

### 2.3 What `33/40` means

The v2-3 evaluation exported a bounded domain of at most 1,500 candidates per image. Each image was
compared with at least one retained target by minimum-cost role-blind matching of the colour sets,
using mean Euclidean OKLab cost and epsilon `0.04`. On 40 images, the published palette matched a
target under that definition on 33, while a target was reachable but outranked on 7; none was
unreachable in the bounded domain. (`research/v2-3-eval/README.md`, sections 5-6;
`research/v2-3-eval/data/eval-metrics.json`, `headline` and `split`)

The target provenance limits the interpretation. Of the 40 image aggregates, 36 are
`endorsed`-only, meaning they retain algorithm-produced palettes that the reviewer graded strong;
3 are `correction`-only, and 1 includes both sources. Only 4 images therefore include a palette the
reviewer composed as a correction. The result is primarily evidence about retaining and ranking
known strong outputs, with a much smaller hand-composed reachability sample, not a 40-image oracle
test. (`research/v2-3-eval/README.md`, section 6; `research/v2-3-eval/data/eval-metrics.json`,
`aggregates[].sources`)

That result is a candidate-reachability and ranking diagnostic. It is not product accuracy, role
correctness, prevalence, or evidence that the published palette was the only valid answer.

The historical `70.6% -> ~97%` narrative must not be used. The first endpoint was a hand-picked
34-cover stress corpus and the second was a different, partly repeated calibration set; the
trajectory is unsupported. The reviewer later withdrew the v2-3 headline entirely, leaving no
inherited numeric quality anchor. (`research/v2-3-eval/FIELD_GUIDE_FACTCHECK.md:39-54`,
`research/v3/V3_PLAN.md:22-47`)

## 3. Corpus and evaluation custody

| asset | size and custody | allowed interpretation |
| --- | --- | --- |
| Historical sharded corpus `00/` through `14/` | 7,550 files representing 6,906 artworks; many artworks have both 300 px and 640 px renditions | Development corpus. It has no sealed holdout. |
| Fresh shard `15/` | 378 files, 348 artworks, 30 two-rendition pairs; zero exact duplicates against the pinned 7,550 and one near-duplicate against the larger pinned pool | Kept separate. Fresh evaluation material after quarantining the collision and sampling by artwork, not file. |
| Coverage set | 200 corpus-covering artworks plus 20 human-confirmed enrichment artworks | Tuning and instrument bench only; not final accuracy evidence. Enrichment rows do not enter rates. |
| `music-artworks/` holdout v2 | 413 artworks and 1,073 files, but only 254 independent near-duplicate components | Protects algorithm and tuning custody. The duplicate census is a lower bound, so statistical power and optimism must be scoped accordingly. |
| Historical 100-cover absolute review | 83 shippable, 17 unshippable under the then-current treatment | Development-facing validation, not sealed generalization. |

The historical sharded and coverage counts are documented in
`research/v3/data/coverage-set/COVERAGE_SET.md:5-19` and `:21-31`. Fresh shard counts and duplicate
checks are in `research/v3/src/coverage-set/FRESH_SHARD_DRILL.md:11-23` and `:50-96`. Holdout
construction and effective size are in `research/v3/data/holdout/HOLDOUT.md:43-72` and `:102-121`.
The historical absolute-review scope is in `research/data/corpus-review-summary.md:16-29`.

The holdout's purpose is algorithm/tuning leakage prevention, not reviewer-naive eyes. It is Flo's
personal library and is assumed familiar; 117 of its 413 artworks were also exposed in an embedding
gallery. Reviewer-naive evidence, when required, has to come from genuinely fresh shards.
(`research/v3/data/holdout/HOLDOUT.md:149-190`)

The near-duplicate graph is conservative but incomplete: at cosine 0.95 it undercounts known
duplicates by 46.3%. Whole-component separation removes detected leakage, not all possible leakage.
(`research/v3/data/holdout/HOLDOUT.md:74-100`)

## 4. Concise project history

### 4.1 Legacy and `region-graph-0.19.0`

The repository root is the legacy extractor: k-means colour clustering, a masked-centre background
heuristic, local-contrast saliency for foreground, and downstream role heuristics. The live saliency
worker takes the maximum colour-space distance within a fixed radius of 3, applies a separable
3-tap `[0.25, 0.5, 0.25]` blur, dilates by a radius derived from 0.1% of the shorter image side, and
max-normalizes to an 8-bit map. Its comments call the intermediate `variance`, but it computes a
maximum, not variance or standard deviation. The root README's `Itti-Koch filtering` description is
therefore stronger than the implementation and does not govern it. The extractor is historical
context rather than the v4 base. (`saliency/saliency.worker.ts`, `saliency()`; `README.md`, How does
it work)

The independent research restart produced `region-graph-0.19.0`, a classical region-based research
implementation. It is a frozen comparator and evidence source, explicitly not a production API.
Its carried `95/5` labels were migration evidence rather than a complete re-review of 0.19.
(`research/README.md:1-5`, `:49-68`)

### 4.2 Clean and native complete-palette work

A clean-successor line separated perception, evidence, policy, and joint complete-palette inference,
but its own status did not authorize review, reserve access, or canonical promotion.
(`research/NEXT_PALETTE_ARCHITECTURE.md:3-21`)

The later `native-complete-palette-0.2.x` line established useful native evidence, complete-tuple
legality, provenance, certificates, and deterministic replay. It was not the desired extractor: it
accepted the incumbent as input and required componentwise domination, changing 6 of 391 source
groups, only 2 materially, with one human-preferred improvement. It was retired as a product
direction and retained as an oracle/legality artifact. (`research/PALETTE_EXTRACTION_QUALITY_RESET_HANDOFF.md:41-59`,
`:108-130`, `:150-183`)

### 4.3 v2 and v2-3

The v2 campaign made complete rendered treatments the review unit and built extensive native,
candidate, gradient, role, and custody machinery. Its final 34-cover showcase produced 20 strong,
4 acceptable, 9 weak, and 1 unacceptable treatment. That was a hand-picked stress corpus, and the
candidate failed the broad product-readiness checkpoint. (`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:16-49`)

`research/v2-3/` was the most mature reviewed development implementation and exposes a standalone
image-to-palette API. It retains four roles, field state, optional midpoint rendering, and a
caller-controlled contrast floor. Maturity did not make it product-ready: the rewrite was opened
because broad robustness, structural completeness, and claim quality remained inadequate.
(`research/v2-3/README.md:1-35`, `research/v3/V3_PLAN.md:22-47`)

Its sharpest mechanical robustness warnings were 72.8% palette agreement after a JPEG re-encode and
movement on all 114 palettes under a +/-1-LSB dither. These are not aesthetic scores, but they show
that tiny input changes could alter outputs broadly. (`research/v3/src/robustness/README.md:1-16`)

Do not copy v2-3 code into v4. Its evidence, counterexamples, and tests are historical inputs; its
architecture is not the answer. This was already the v3 red-alert rule.
(`research/v3/PHASE_1_HANDOFF.md:40-58`)

### 4.4 v3 instruments and prototype campaign

V3 Phase 0 formalized the contract, provenance, review warehouse, holdout, coverage set, calibration,
robustness harness, honesty scans, and development-only oracle. Phase 1 then produced 14 independent
proposals that collapsed into six mechanism families. (`research/v3/PHASE_1_HANDOFF.md:67-89`,
`research/v3/PHASE_2_HANDOFF.md:1-25`)

Phase 2 built and reviewed six prototypes. Some produced useful measurements and local capabilities,
but the phase closed without choosing any prototype wholesale as the next base. The explicit premise
of the closeout was that the pieces, not one prototype, were the result.
(`research/v3/phase-2/PROTOTYPE_RANKING.md:1-18`,
`research/v3/phase-2/GRAFT_INVENTORY.md:1-8`)

The portable tracked Phase 3 record in this checkout covers two absolute rounds for Arms A and B.
Round 1 had no strong grades for either arm. Round 2 had one strong for Arm B and none for Arm A;
most outputs in both rounds were weak or unacceptable. All six grades on the three covers repeated
between rounds were unchanged. With no comments in round 1 and one substantive item comment in round
2, most failures remain undiagnosed rather than understood. These records do not select either arm
as a winner. (`research/v3/phase-3/rounds/round-1/RESULTS.md`, Evidence gap and Grade tallies;
`research/v3/phase-3/rounds/round-2/RESULTS.md`, Evidence state, Grade tallies, and Trajectory)

## 5. What the evidence currently supports

### 5.1 Reviewer-supported findings

- Complete treatments must be judged jointly. A colour or field can be valid in isolation and still
  occupy the wrong role or form an unfaithful treatment.
- Exact source support is necessary but not semantic correctness. Source-observed colours have been
  rejected as the wrong field, foreground, or accent.
- Role assignment is a separately judged competence from colour discovery. Several campaigns found
  useful colours available while the winner put them in the wrong seats or omitted them.
- Legibility is a floor, not the whole ranking objective. Among floor-clearing candidates, artwork
  identity and the actual ink/type colour still matter.
- Small, coherent marks can carry identity and beat raw population, but small label logos and
  incidental shadows can be refused. Rarity alone cannot decide whether a colour belongs.
- Both false and missed gradients are live errors. Extra stops have a visible misuse cost; their
  accepted purpose is to reduce off-artwork interpolation excursion, not to expand coverage or fit a
  metric.
- Legal near-boundary pairs are often judged by margin, not by mere threshold passage. This is one
  reason contract validity cannot stand in for quality.

These findings are summarized with their Phase 2 review provenance in
`research/v3/phase-2/GRAFT_INVENTORY.md:84-118` and `:120-165`. The earlier broad-showcase audit
independently separates source support, role assignment, candidate availability, and top-one ranking.
(`research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md:94-115`)

### 5.2 Mechanically measured findings

- Exact-pixel existence catches a real, rare failure. Population share did not separate endorsed
  from known-bad colours at any tested threshold and therefore remains report-only.
- v2-3 was sensitive to re-encoding and minimal dither: 72.8% re-encode agreement and 114/114
  dither movers under the recorded test.
- In the bounded v2-3 domain, endorsed samples were reachable on all 40 measured images, while the
  published treatment missed epsilon on 7 because of ranking under a role-blind set metric. Only
  four image aggregates include human-composed corrections; most targets are retained strong
  algorithm outputs.
- Holdout nominal counts materially overstate independent sample size because near-duplicate
  components are common and incompletely detected.

### 5.3 Repeated negative evidence

- The scalar currencies actually tested in this campaign were falsified as aesthetic judges. This
  scopes the conclusion to those tested currencies; it is not a proof that every possible scalar
  formulation is impossible. (`research/v3/phase-2/GRAFT_INVENTORY.md:84-96`)
- Whole-palette selectors have repeatedly selected answers the reviewer did not prefer, including
  the strongest Phase 2 test. This is repository evidence against the selector forms tested, not a
  theorem that every selector must fail. (`research/v3/phase-2/GRAFT_INVENTORY.md:97-101`)
- Population or exact-mass floors repeatedly block legitimate, rare colours and cannot automate
  the human notion of "belongs". (`research/v3/src/contract/BELONGS_STUDY.md:300-329`)
- Exact legality, determinism, certificates, and incumbent non-regression did not produce broad
  visual improvement in the native complete-palette line.
- Candidate availability alone did not solve top-one quality in v2; many failed showcase treatments
  had relevant alternatives already available.
- Grade-only rounds can say that an output is bad without saying what mechanism failed. They should
  not be mined for unstated failure classes.

### 5.4 Unresolved problems

- Broad complete-treatment quality remains below product readiness, and there is no selected v3
  base.
- Background and surface ownership remain unreliable on faces, frames, photographs, and no-field
  compositions.
- Foreground and accent must be legible, role-appropriate, and identity-bearing without treating
  contrast as the selector.
- Whole-palette identity coverage remains difficult: technically valid two- or three-colour outputs
  can omit major artwork families.
- Gradient form, endpoint identity, and optional guide-stop use remain coupled to field quality.
- Robustness has not been demonstrated at product quality across encodings, renditions, resolutions,
  and small perturbations.
- `ACCENT_FUNCTIONAL_DISTANCE` remains uncalibrated, and `I2.spatial-spread` remains deferred.
- Human-naive generalization has not been established. The music holdout is tuning-clean but
  reviewer-familiar; fresh-shard evaluation has not produced a final product claim.
- The semantic notion that every published colour "belongs" remains a human judgment. Current pixel
  statistics can establish provenance and report support, but not replace that judgment.

### 5.5 Current hypotheses, not durable facts

- Structural field/figure composition may be a more useful decomposition than four independent role
  optimizations. Phase 3 proposals converged on versions of this idea, but the resulting arms have
  not established product quality. (`research/v3/phase-3/PROPOSAL_COMPARISON.md:7-30`)
- The palette's family relationships may need to mirror the artwork's family relationships rather
  than satisfy one universal family pattern. The available examples support the reframing but do not
  establish a general rule. (`research/v3/phase-2/GRAFT_INVENTORY.md:103-118`)

## 6. Starting boundary for v4

V4 inherits the product problem, output contract, evidence, custody, and negative results above. It
does not inherit a solution architecture.

The first obligation is to produce complete treatments from a cold supplied file and make claims
that stay scoped to exact bytes, versions, review presentation, and corpus custody. Mechanical gates
must remain separate from human quality. Fresh review must preserve multiple valid answers and must
collect enough text to diagnose failures when diagnosis is the purpose.

Do not copy v2-3 code, choose a v3 prototype by document reputation, turn the 33/40 diagnostic into
accuracy, or revive the withdrawn `70.6% -> ~97%` story. No architecture is prescribed here.

## 7. Document precedence and known conflicts

Later reviewed rulings, current contract code, and released round records govern over older plans or
historical APIs. The following conflicts must remain visible:

- `research/v3/V3_PLAN.md:3-9` still says Phases 1-3 remain proposals. Later handoffs and result
  records show Phase 1 complete, Phase 2 closed, and Phase 3 active. The plan header is historically
  stale.
- `research/v3/PHASE_0_DECISIONS.md:240-245` still describes a population floor and spatial-spread
  test as part of source support. The later reviewer ruling and current validator enforce exact
  existence, report population only, and defer spatial spread. The later code and ruling govern.
- Native-resolution/no-resampling is normative input policy. A local prototype snapshot cannot
  change that policy or establish a durable exception.
- Older root, region-graph, clean-successor, native-complete, and v2-3 contracts use different
  contrast, fallback, gradient, and transparency rules. They are historical evidence, not the v3
  contract inherited here.
- The v2-3 headline quality number and its implied improvement trajectory are withdrawn. Historical
  files that still quote them do not restore them.
- Phase 2 robustness documents historically mixed agreement, disagreement, and move-rate
  conventions. Only direction-checked figures should be compared.
  (`research/v3/phase-2/GRAFT_INVENTORY.md:10-31`)
- Excluded `.worktrees` snapshots may be newer than tracked round records, but they are not portable
  repository evidence and do not establish the inherited Phase 3 status in this document.
