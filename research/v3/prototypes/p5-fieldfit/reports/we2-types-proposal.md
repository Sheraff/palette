# W-E2 — the exact `FieldComponent` / `FieldReading` for `types.ts`

**Not a block.** `E2_BRIEF.md`'s sketch fits: every field it names is present, with the name and the
meaning it gave. What follows is the sketch **plus** the fields the reading and the diagnostics
cannot be written without, each with the reason it exists. Nothing was implemented against a
different shape, `src/types.ts` was not touched, and the definitions live in `src/components.ts`
(which W-E2 owns) exactly as the brief's escape hatch directs. The orchestrator can mirror the block
below into `types.ts` verbatim and delete it from `components.ts`; the only import `types.ts` would
gain is the one it already has (`OkLab`).

## The additions, and why each one is load-bearing

| field | why it cannot be dropped |
|---|---|
| `order`, `marginBars` | `ramp.ts` refuses to read a ramp off an order-0 fit. A component chooses between constant and affine exactly as the global fit does; without `order` every flat component would be read as a gradient. |
| `claim`, `weights` | The support as a per-pixel object. `componentFieldFit` hands `weights` to `ramp.ts` and `claim` is what the recursion removes from the domain — `supportMass` alone cannot be restricted to. |
| `supportPixels`, `supportFraction` | The *extensive* test, and the number the report quotes. |
| `coreFraction` | The *smooth* test. See the deviation note in `we2-pass1.md`: the brief's literal wording (`explainedFractionOwn ≥ 0.5`) is an identity under a claim-defined support, so it cannot fail. |
| `extensive`, `smooth` | So a rejected attempt says which gate it failed. `attempts` is the diagnostic that explains a retreat. |
| `depth`, `seed`, `residualScale` | Provenance of the recursion. `depth` is also the pool sort's last tie-break, and it is unique, so no tie survives to be decided by iteration order. |

## The block

```ts
export type FieldComponent = Readonly<{
	depth: number
	order: 0 | 1
	coefficients: Float64Array
	fieldAt(x: number, y: number): OkLab
	claim: Uint8Array
	weights: Float32Array
	supportMass: number
	supportPixels: number
	supportFraction: number
	explainedFractionOwn: number
	coreFraction: number
	meanX: number
	meanY: number
	residualScale: number
	marginBars: number
	seed: OkLab
	extensive: boolean
	smooth: boolean
}>

export type FieldReading = Readonly<{
	components: readonly FieldComponent[]
	attempts: readonly FieldComponent[]
	depthCapReached: boolean
	retreat: boolean
	labels: Uint8Array
}>
```

`Diagnostics` was **not** extended — it is frozen and the pass did not need it to be: `Analysis`
(owned by `candidate.ts`) carries `fieldComponents: FieldReading | null`, and `null` is also the
proof that a fully-explained cover never entered the recursion. The one thing the frozen sidecar
cannot say is stated in `candidate.ts`'s header: `noField` with neither `gradient` nor
`twoBlockFallback` is a single flat component *or* the retreat, and the two publish the same shape.
