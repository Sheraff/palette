# W-P14 — proposed moves into `src/types.ts` (orchestrator's file; ratify-then-move)

Nothing below is implemented in `src/types.ts`. Each shape lives in a module I own and is
structurally compatible with the corresponding shape there, so ratification is a cut-and-paste plus
an import change, with no behaviour attached.

## 1. `OverlayReading.assignment`

`readOverlay` now returns `OverlayReadingWithAssignment = OverlayReading & { assignment:
AssignmentTrace | null }`, declared in `src/overlay.ts`. Proposed: add the field to `OverlayReading`
itself and delete the intersection.

```ts
/** SPEC decision 18's joint solve. Null when none was solved: no overlay, or the escape path. */
assignment: AssignmentTrace | null
```

Precedent: `RampContinuity` moved the same way in v0.6.1 (`wp10-types.md`, ratified).

## 2. `Diagnostics.assignment`

Carried on `candidate.ts`'s `Analysis` today, exactly as `PathExcursionReport` was in v0.7.1 and for
the same reason. Proposed: `Diagnostics` gains

```ts
/** Decision 18's identity set, shortlists, coverage and whether coverage decided the palette. */
assignment: AssignmentTrace | null
```

The three fields a round analysis actually needs are `identity.families` (what the artwork is made
of, by mass), `chosen.coverage` / `chosen.covered`, and **`coverageDecided`** — the last is the one
that separates a coverage decision from a shortlist-truncation artefact on any delta, and there is no
way to recover it after the fact from a palette.

## 3. The decision-18 shapes themselves

`IdentityFamily`, `IdentitySet`, `RoleCandidate`, `AssignmentOption`, `AssignmentTrace`, `MassPoint`,
`BarNeighbourhood` all live in `src/assignment.ts`. **I do not propose moving these.** `MassPoint` and
`BarNeighbourhood` are decision 6's internal machinery; the rest are only meaningful beside the solve
that produces them, and `AssignmentTrace` in particular carries function-free data whose only consumer
is `diagnose.ts`. If `Diagnostics.assignment` is ratified, `src/types.ts` would import
`AssignmentTrace` from `assignment.ts` rather than redeclare it — the same direction `Diagnostics`
already takes with `RampContinuity`, which it declares locally; either convention works, and the
orchestrator's is the one that should win.

## 4. Not a type move, but it needs a ruling

`IDENTITY_FAMILY_BAR_MULTIPLE` (default **1**, the spec's word) has an `P5_IDENTITY_BAR_MULTIPLE`
override that exists only so the measurement in `wp14.md` §3 can be re-run. If the orchestrator rules
the wider radius in, the env override should be deleted and the number stated as a constant with its
evidence, not left as a knob.
