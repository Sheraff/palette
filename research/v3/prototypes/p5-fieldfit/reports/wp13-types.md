# W-P13 — proposed `src/types.ts` additions (decision 17)

Not applied: `src/types.ts` is the orchestrator's. Carried on `candidate.ts`'s `Analysis` meanwhile,
so `diagnose.ts` prints the numbers the ruling turns on without a worker editing a frozen file.

## 1. `Diagnostics.pathExcursion: PathExcursionReport | null`

Decision 17's deciding quantity is not in the sidecar, so a round analysis cannot correlate a stop
(or its absence) with the measurement that produced it — the same gap cross-arm note 6 raised about
margins. `null` when no gradient was published.

```ts
/** SPEC decision 17, measured on the published polyline. Reporting only. */
export type PathExcursionReport = Readonly<{
	/** Path → the straight chord between the published ends: the quantity that asks for a stop. */
	chord: number
	/** Path → the polyline published. Equal to `chord` when no interior stop survived. */
	published: number
	/** The measurement's noise floor: the worst band mean's own standard error. What accepts a stop. */
	precision: number
	/** Half the widest gap between consecutive path samples. Reported only. */
	largestGap: number
	/** Worst path deviation *outside* the ramp's span — an endpoint signal, never a stop one. */
	beyondEnds: number
	/** Equal-inlier-mass bands of the ramp that carried weight (≤ `PATH_BANDS` = 64). */
	samples: number
}>
```

`beyondEnds` earns its place on measurement: on 8 of 16 gradient covers it is the *larger* number
(1.0–3.9 bars against in-span 0.03–0.8), and on `4130886c02` it is 1.64 bars while the in-span
excursion sits 0.02% under the trigger. That pattern is decision 18's (the ends do not reach the
field's colours), and today nothing records it.

## 2. Nothing else

`RampReading`'s existing `excursionMax` / `residualExcursion` keep their meaning — the
occupied-colour "stays on-artwork" half — and are unchanged. `RampPathReading` (the path samples
themselves) stays in `ramp.ts`: it carries a 64-entry array that no sidecar should serialize.
