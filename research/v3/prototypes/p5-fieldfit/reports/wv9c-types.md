# W-V9c — types proposals

`src/types.ts` needs **no change for this pass**. Everything v0.9.1 added lives on `MarkRegion`
(`src/marks.ts`, this worker's file), and the standing wv9a/wv9b proposals are unaffected and still
stand (`RoleCandidate.chroma`, `source: "mark"`, `MarkScaleChoice.slopeIndex`, `criterion: "default"`).

Two proposals, both deferred rather than made, so the orchestrator rules with them written down:

## 1. `Diagnostics.identityCoherence` — only if the gate is ever ruled in

Three fields were added to `MarkRegion`: `selfCoherence`, `selfCoherenceMedian`, `identityCoherent`.
They are on the mark reading rather than on the sidecar because `Analysis.marks` already carries the
whole `MarkReading` (wv9a's shape, ratified in practice by v0.9.0), and `diagnose.ts` prints it.

If the coherence gate is ever wired, the sidecar should carry a **summary** — how many entries
contributed a family and how many were withheld — because that is the number a delta table is read
against and it should not require re-deriving the per-entry table. Proposed shape:

```ts
/** v0.9.x: the self-coherence gate's effect on this cover. `null` when the gate is off. */
readonly identityCoherence: Readonly<{ offered: number; withheld: number; multiple: number }> | null
```

**Not proposed now.** The gate is not wired (`reports/wv9c.md`), so a sidecar field for it would
describe behaviour that does not exist, and `null` on every cover is a field that has never been read.

## 2. Nothing for `src/snap.ts`

The one-pass rewrite is entirely private (`Pool`, `poolAround`, `massWithinPool`, `withinRadius`).
`SnapResult` is unchanged and `barNeighbourhoodMass` keeps its exported signature — deliberately, as
the oracle `tests/core.test.ts` checks the fast path against. No contract or `types.ts` surface moves.
