# P2 — hierarchical region decomposition: prototype spec (cycle 1)

**Authored 2026-08-04 by the P2 orchestrator.** Mechanism: build a tree over the image, read the
four roles off nodes (`PHASE_2_HANDOFF.md` §2 P2; arms b, b′, e, f′). The hierarchy is the new
half — flat regions with roles is the incumbent everywhere. A prototype that degenerates to one
flat partition tests nothing.

## Cycle-1 goal

Two tree families end-to-end as devloop candidates, however crude, so that (a) the robustness
harness can measure the mechanism's suspected weakness (region boundaries under re-encode) THIS
cycle, and (b) the reachability falsifier can start answering "do endorsed colours live in tree
nodes at all". Quality is explicitly not the cycle-1 goal; validity + measurability are.

## Directory ownership (inside this worktree only)

| dir (under `research/v3/prototypes/p2-tree/`) | owner | content |
|---|---|---|
| `alpha/` | worker A | quasi-flat-zone (α-tree) pipeline, arm-b lineage |
| `tos/` | worker B | tree-of-shapes pipeline, arm-b′/f′ lineage |
| `falsifier/` | worker C | reachability falsifier harness |
| `verify/` | worker D | independent artifact verification |
| `SPEC.md`, `README.md`, `review-rounds/` | orchestrator | — |

Workers never write outside their dir. Workers never commit. Shared instruments
(`research/v3/src/`) are read-only imports.

## Shared interface

1. **Candidate modules** at `alpha/candidate.ts` and `tos/candidate.ts`, devloop shape:
   `export const candidateId` (`"p2-alpha"` / `"p2-tos"`), `export const paletteOf:
   CandidatePalette` (see `src/devloop/types.ts`; copy the *shape* of
   `src/devloop/candidates/toy-median-offsets.ts` — decode via sharp, header dimensions,
   transparency refused loudly, every published colour an exact triple, full metadata).
2. **Node dump**: each pipeline also exports `nodesOf(imagePath): Promise<NodeDump>` and a small
   CLI (`alpha/dump.ts <image…> --out <file.jsonl>`) writing one JSON line per image:
   `{imagePath, pipeline, width, height, nodes: [{id, parent, areaFraction, depth,
   repr: "#rrggbb", …pipeline-specific attrs}]}` — retained (post-filter) nodes only, sorted by
   id, deterministic. This is the falsifier's and verifier's input.

## Binding rules (from the constraint sheet + conventions — violations are cycle failures)

- Native resolution, **no resampling** (arm-f′'s working-grid downsample is NOT adopted).
- OKLab is the only distance space; the same-colour ruler comes from `src/contract` — no second
  radius, no local epsilon anywhere.
- Every tunable constant is a named export with a provenance tag
  (`[REVIEWED]|[MEASURED]|[FITTED]|[n=1]|[INHERITED]|[UNCALIBRATED]|[HELD]`) and a doc comment.
  `[UNCALIBRATED]` is the honest default for cycle-1 guesses — say so loudly.
- Determinism: every tie broken on quantities computed from pixel values / raster coordinates
  (lexicographic RGB, then raster index). No hash order, no map iteration order, no RNG, nothing
  derived from filename or content hash.
- No imports from repo root or `research/src/` (v2/v2-3 code — red-alert ban). Only
  `research/v3/src/**` and your own dir.
- Gradient endpooint ruling: stops[0] IS background, stops[last] IS surface, exact; collapsed
  surface ⇒ `gradient: null`. Collapses declared by exact hex equality.

## Representative-colour rule (both pipelines, one rule)

Bar-density mode: within the node, find the OKLab location maximising node mass within one
same-colour bar (bar-scaled accumulator), take the mean of node pixels within one bar of it,
publish the exact triple in the node nearest that mean (ties: lexicographic RGB). This is arm-b
§2.5 = arm-e §2.6 in substance; one shared implementation per pipeline is fine, but the RULE is
fixed here so the two pipelines differ in their trees, not their colour-picking.

## Pre-registered falsifiers (adopted from arm-b′ §7 before any data is seen)

1. **Reachability**: if >25% of endorsed legacy role colours are unreachable (within the
   same-colour bar) from the retained-node representative set, while remaining reachable from the
   control set (all exact triples whose pixel count clears the same area floor), the paradigm is
   wrong, not under-tuned. Report per-pipeline.
2. **Dither**: if >10% of palettes change (beyond the bar) under `dither-lsb1`, the structural
   robustness argument fails for that pipeline. Measured by the robustness harness, not a custom
   metric.

Both are report-lines, not gates — the reviewer judges. But the numbers are pre-registered here
and may not be reinterpreted after the fact.

## Cycle-1 scope cuts (deliberate, recorded)

No text detector yet (cycle 2, grafted from arm-b §2.4 regardless of winning tree). No chromatic
lanes / a,b channels for the ToS pipeline (L first; blindness to isoluminant accents is a known,
recorded cycle-1 gap). No 3rd gradient stop (2 stops or null). Foreground/accent via each arm's
simplest structural rule; mediocre is acceptable, invalid is not.
