# W-P15 — proposed changes to `src/types.ts` (orchestrator's file)

Nothing here is implemented in `src/types.ts`. Each item names where the interim lives.

## 1. `OverlayCluster.overlayMass` → `salientMass` (rename), or a `source` discriminant

Decision 18(a) puts two kinds of candidate in one pool, and they carry two different masses:
`Σ(1 − w)` for an agglomerated overlay cluster, `Σ w` (field mass) for a field-like component. The
solve reads one field. v0.8.1 stores the component's field mass in `overlayMass`, which is a true
number under a false name, stated at both sites (`overlay.ts`'s `componentPoolEntry`, `assignment.ts`'s
`RoleCandidate.mass`).

Two shapes would fix it, and the choice is the orchestrator's because it is a statement about what the
pool is:

- **(a) rename** `overlayMass` → `salientMass` and document the two definitions on the field. Smallest
  diff; loses the ability to say which one a given entry holds.
- **(b) add `source: "overlay" | "component"`** to `OverlayCluster` and keep the mass field's name
  honest per branch. `RoleCandidate.source` (in `assignment.ts`, mine) already carries exactly this
  and is what `diagnose.ts` prints; promoting it would remove the parallel `componentSourced` set
  `overlay.ts` keeps.

`localField` has the same shape of problem on a component entry — there is no field beneath a region —
and v0.8.1 fills it with the **published background**, so the `deltaL/C/H` triple describes departure
from the field the colour will be seen against. Stated at the site; worth a doc line if (b) lands.

## 2. `OverlayReading` should carry the pool's provenance

`readOverlay` now returns `componentCandidates: readonly ComponentCandidateReport[]` as an
intersection declared in `overlay.ts` (`OverlayReadingWithAssignment`), beside `assignment` which
wp14 proposed the same way. Both are sidecar. If `assignment` is ratified onto `OverlayReading` /
`Diagnostics`, this belongs in the same edit.

## 3. Still open from wp14

`Diagnostics` does not carry `AssignmentTrace` or `PathExcursionReport`; `candidate.ts` carries both
on `Analysis`. Unchanged by this pass.
