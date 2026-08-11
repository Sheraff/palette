/**
 * # What the emitter returns, and what a reader is entitled to know about how it got there
 *
 * `emit()` hands back a `Palette` and a `Diagnostics`. The palette is the product; the diagnostics
 * are the **evidence about the search itself**, and `DESIGN.md` makes several of them obligations
 * rather than conveniences:
 *
 * - the reviewer-evidence section, item 1: *"every emitted palette carries min-|APCA|-over-the-
 *   rendered-ramp for fg and accent as a REPORTED diagnostic"* — with the pre-registered consequence
 *   that unreadable foregrounds falsify the ink-recovery story rather than prompting a tuning pass;
 * - addendum item 6: *"M2 emits the F/A-swapped runner-up's energy delta as a per-palette
 *   diagnostic ... so near-tied assignments are visible before a reviewer has to ask"*;
 * - arm A §7's separation of *objective-wrong* from *under-searched*, which is what
 *   {@link KnownBetterFeasible} is for.
 *
 * Everything in here is **report-only**. Not one field is read back by the search, by an energy, or
 * by `feasibility()`. A diagnostic that fed back into the thing it measures would stop being one.
 */

import type { Palette, Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../emit/types.ts"
import type { P1Arm } from "../emit/palette.ts"
import type { Measurement } from "../measure/types.ts"
import type { SEARCH_CERTIFICATE } from "./constants.ts"

/** Which energy this run minimised. `"a"` is `p1a` (nats + λ·Ω); `"aprime"` is `p1ap` (bits). */
export type ArmName = "a" | "aprime"

/** The arm's candidate id, for rows that have to say which prior they came from. */
export const ARM_CANDIDATE_ID: Readonly<Record<ArmName, P1Arm>> = { a: "p1a", aprime: "p1ap" }

/** The unit the arm's energy is denominated in. Carried so two arms' numbers are never subtracted. */
export const ARM_ENERGY_UNIT: Readonly<Record<ArmName, "nats" | "bits">> = {
	a: "nats",
	aprime: "bits",
}

export type EmitOptions = Readonly<{
	arm: ArmName
	/** `DESIGN.md` decision 2's exchange rate. Defaults to each energy's own `DEFAULT_LAMBDA` = 1.0. */
	lambda?: number
	/**
	 * Force the coarse lattice rung instead of letting the budget choose it. **Tests and sensitivity
	 * sweeps only** — a run that pinned this is not the algorithm and its diagnostics say so
	 * (`searchScale.chosenBy` reads `"forced"`).
	 */
	coarseCellBarMultiple?: number
	/** Force the configuration grammar level. Tests only; same caveat as above. */
	grammarLevel?: GrammarLevel
	/** Override the per-image allowance the cost model sizes the search against. Tests only. */
	budgetMs?: number
	/**
	 * A measurement already taken for this file, to avoid decoding it twice. The caller asserts it is
	 * the measurement of `imagePath`; nothing here re-checks that, because re-checking would mean
	 * decoding, which is the cost this option exists to avoid.
	 */
	measurement?: Measurement
	/** Skip the legacy self-falsifier pass (it loads ~2 MB of fixtures). Tests only. */
	skipKnownBetterFeasible?: boolean
}>

// ---------------------------------------------------------------------------------------------
// The configuration grammar
// ---------------------------------------------------------------------------------------------

/**
 * How much of the configuration grammar the coarse stage enumerates.
 *
 * Ordered from poorest to richest, which is also ascending cost. The level is **chosen by the
 * budget, not by a preference for flat palettes** — see `chooseCoarseLattice()`. A run that landed
 * on `"flat-only"` searched no gradient configuration at all and its certificate says so, which is
 * the difference between "this artwork does not want a ramp" and "nobody looked".
 */
export const GRAMMAR_LEVELS = ["flat-only", "ramp-2", "ramp-3", "ramp-4"] as const

export type GrammarLevel = (typeof GRAMMAR_LEVELS)[number]

/** The field's model order, as the published configuration will render it. */
export type FieldOrder = "collapsed" | "two-flat" | "ramp"

// ---------------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------------

/** A configuration, flattened to hex, for a JSONL row a human will read. */
export type ConfigurationSummary = Readonly<{
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	stops: readonly Readonly<{ hex: string; position: number }>[]
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	escape: Readonly<{ role: string; color: string }> | null
	fieldOrder: FieldOrder
}>

/** One near-miss: what it was, what it cost, and how far behind the incumbent it finished. */
export type RunnerUp = Readonly<{
	energy: number
	/** `energy − incumbent.energy`, always ≥ 0. */
	gap: number
	configuration: ConfigurationSummary
	/** `canonicalKey()` — the identity the tie-break compares on. */
	canonicalKey: string
}>

/**
 * The scale and grammar the search actually ran at, and why.
 *
 * `budgetForcedCoarsening` is the honest flag the M2 brief asks for: *"if the budget forces coarser
 * search, say so in the certificate field, never silently"*. It is true whenever the allowance put the
 * search's **starting** rung above the finest rung on the ladder — which, on real album artwork, is
 * essentially always. Read it together with `deepening`: the flag says the cost model could not afford
 * the finest alphabet, and the deepening record says how much finer the leftover allowance then got.
 */
export type SearchScale = Readonly<{
	chosenBy: "budget" | "forced"
	/** The finest lattice rung the coarse stage actually enumerated at. */
	coarseCellBarMultiple: number
	coarseCellSide: number
	coarseRepresentatives: number
	grammarLevel: GrammarLevel
	/** Predicted milliseconds for the coarse stage, from the cost model. */
	predictedCoarseMs: number
	/** The allowance the coarse stage was sized against. */
	coarseBudgetMs: number
	budgetForcedCoarsening: boolean
	/** True when even the coarsest rung overran the allowance, and it ran anyway. */
	overBudget: boolean
	/** Occupied-cell counts at every rung of the ladder, so a reader can see what was on offer. */
	ladder: readonly Readonly<{ barMultiple: number; occupiedCells: number; predictedMs: number }>[]
	/**
	 * The iterative-deepening record: one entry per lattice rung the coarse stage ran, coarsest first.
	 *
	 * The **first** entry is the rung the cost model predicted was affordable; the rest are the finer
	 * alphabets the leftover budget paid for. `completed: false` on the last entry means that rung's
	 * product was cut off partway through the canonical order and only a prefix of it was searched — a
	 * real, directional under-search that a reader has to be able to see.
	 */
	deepening: readonly Readonly<{
		barMultiple: number
		representatives: number
		completed: boolean
		/** Feasible configurations reached in total after this rung finished. */
		feasibleAfter: number
	}>[]
	/** The rung the cost model started at, before any deepening. */
	startingBarMultiple: number
	startingRepresentatives: number
}>

/** How much work happened, in counts the search actually kept rather than estimates. */
export type EffortReport = Readonly<{
	/** Configurations the enumerator constructed, feasible or not. */
	configurationsEnumerated: number
	/** `feasibility()` calls made. */
	feasibilityCalls: number
	/** Configurations found feasible — the size of the searched slice of the feasible set. */
	feasibleConfigurations: number
	/** Energy evaluations. Equals `feasibleConfigurations` plus the diagnostic re-evaluations. */
	energyEvaluations: number
	/** Distinct configurations evaluated in the coarse stage. */
	coarseEvaluations: number
	/** Distinct configurations evaluated during refinement. */
	refinementEvaluations: number
	refinementLevels: number
	refinementSweeps: number
	/** Runner-up seeds the beam restart descended from once the first local search converged. */
	refinementBeamSeeds: number
	/** Improving moves refinement accepted. Zero means the coarse incumbent survived untouched. */
	refinementImprovements: number
	/** Predicted-cost budget units consumed, and how many there were. */
	predictedMsSpent: number
	predictedMsBudget: number
	budgetExhausted: boolean
}>

/**
 * The minimum |raw APCA| between one ink and the field it is rendered on.
 *
 * **Reported, never enforced by this module** — `feasibility()` already enforced the contract's own
 * floors over the same ramp, and `DESIGN.md`'s position is that contrast is *bounded, never
 * rewarded*. This number exists so that the pre-registered falsification in the reviewer-evidence
 * section is checkable: if reviewers call these foregrounds unreadable, the ink-recovery story is
 * wrong, and that verdict has to be readable against a number rather than against an impression.
 */
export type InkContrastReport = Readonly<{
	/** `min |raw APCA|` over the rendered field. */
	minAbsRaw: number
	/**
	 * Where the minimum sits. `"ramp@t"` for a gradient field (t to six decimals, the contract's own
	 * `rampPath` convention), or the role name of the flat field colour that was worst.
	 */
	at: string
	/** OKLab distance at the same point — judged for the accent, reported for the foreground. */
	distance: number
	/** Which field the minimum was taken over. */
	field: "rendered-ramp" | "flat-field"
}>

/**
 * The F/A-swap probe (`DESIGN.md` reviewer-evidence addendum item 6).
 *
 * `delta` is `swapped.energy − incumbent.energy`. It is ≥ 0 whenever the swap was legal and the
 * search's ordering agreed with the energy, and **negative when `DESIGN.md` decision 3's ordering
 * rule overrode a cheaper assignment** — which is precisely the case the addendum wants visible,
 * because it is the case where the deferral of arm A's anisotropic accent kernel is costing
 * something.
 */
export type SwapProbe = Readonly<{
	feasible: boolean
	energy: number | null
	delta: number | null
	/** Present when the swap could not be scored: the swapped assignment was illegal, or collapsed. */
	reason: string | null
}>

/**
 * The per-image self-falsifier (arm A §7).
 *
 * If a legacy **endorsed** configuration exists for this artwork, is feasible under the v3 contract,
 * and scores *lower* under the very energy we just minimised, then the search under-searched: the
 * objective was never given the chance to prefer it. That separates a wrong currency from a weak
 * search, per image, without any appeal to the reviewer.
 *
 * A `null` `legacyEnergy` with `entriesForArtwork: 0` is the ordinary case — most artworks have no
 * endorsed legacy palette — and must not be read as a pass. `underSearched` is `false` in both the
 * "nothing to compare" and the "we won" cases, so it is only ever read together with the counts.
 */
export type KnownBetterFeasible = Readonly<{
	/** Endorsed legacy entries whose artwork content hash matches this image. */
	entriesForArtwork: number
	/** Of those, how many converted to a complete `Configuration`. */
	convertible: number
	/** Of those, how many were feasible under the v3 contract (hard mode). */
	feasible: number
	/** The lowest energy among the feasible legacy configurations, at the same λ. */
	legacyEnergy: number | null
	/** Which entry produced it. */
	legacyEntryId: string | null
	incumbentEnergy: number
	/** `legacyEnergy < incumbentEnergy`. False whenever there was nothing to compare. */
	underSearched: boolean
	/** `incumbentEnergy − legacyEnergy` when both exist: how much the search left on the table. */
	shortfall: number | null
}>

/** The escape branch's verdict (`DESIGN.md` decision 6). */
export type EscapeReport = Readonly<{
	used: boolean
	/**
	 * Feasible in-artwork configurations the search **reached**. Zero is what licenses the escape.
	 *
	 * The wording is deliberate and the honesty is load-bearing: this is emptiness of the *searched*
	 * slice, not a proof that the in-artwork feasible set is empty. v0 has no such proof to offer and
	 * does not pretend to.
	 */
	inArtworkFeasibleReached: number
	/** Escape configurations evaluated. Zero unless the branch fired. */
	escapeConfigurationsEvaluated: number
}>

export type Diagnostics = Readonly<{
	searchCertificate: typeof SEARCH_CERTIFICATE
	arm: ArmName
	candidateId: P1Arm
	energyUnit: "nats" | "bits"
	lambda: number
	imagePath: string
	inputContentHash: string
	/** Distinct 8-bit triples in the artwork. The single number the cost model is a function of. */
	colorCount: number
	pixelCount: number
	searchScale: SearchScale
	effort: EffortReport
	incumbent: Readonly<{
		energy: number
		terms: Readonly<Record<string, number>>
		nuisance: Readonly<Record<string, number | string>>
		configuration: ConfigurationSummary
		/**
		 * `canonicalKey()` — the identity the tie-break compares on, published so a differential test
		 * (and a later comparison between two runs) can compare configurations as one string.
		 */
		canonicalKey: string
		/** Ω for arm A, L(P) in bits for arm A′ — whichever structural count λ multiplied. */
		structuralCount: number
	}>
	runnerUps: readonly RunnerUp[]
	swap: SwapProbe
	apca: Readonly<{ foreground: InkContrastReport; accent: InkContrastReport }>
	escape: EscapeReport
	knownBetterFeasible: KnownBetterFeasible
	wallMs: Readonly<{ measure: number; search: number; diagnostics: number; total: number }>
}>

export type EmitResult = Readonly<{ palette: Palette; diagnostics: Diagnostics }>

// ---------------------------------------------------------------------------------------------
// Internals shared across the search's modules
// ---------------------------------------------------------------------------------------------

/** One coarse or refined colour: an exact image triple, with the cell it represents. */
export type Representative = Readonly<{
	/** Row in the measurement's triple table. */
	row: number
	rgb: Rgb8
	hex: string
	/** Packed lattice cell key, ascending = the canonical iteration order. */
	cellKey: number
	cell: Readonly<{ l: number; a: number; b: number }>
	/** `m(c)`, the smoothed mass. The tie-break's first key (descending). */
	smoothedMass: number
}>

/** A scored configuration, as the incumbent bookkeeping holds it. */
export type Scored = Readonly<{
	configuration: Configuration
	energy: number
	terms: Readonly<Record<string, number>>
	nuisance: Readonly<Record<string, number | string>>
	/** The canonical key, precomputed: the tie-break compares on it and it is used for dedup. */
	key: string
}>
