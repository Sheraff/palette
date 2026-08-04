/**
 * # What one falsifier row is
 *
 * `DESIGN.md` M1: *"Falsifier runs on legacy verdicts. Pre-registered reading (arm A′ §7, before any
 * result is seen): if endorsed palettes are NOT systematically lower in energy than known-bad for the
 * same artwork — no rank signal, no single term culpable, at any λ in the sweep — the currency is
 * wrong, and that is reportable evidence, not a tuning prompt."*
 *
 * Everything in this file is a **record**, not a decision. The energies decide nothing here either;
 * they are evaluated once per (entry, energy) and the λ sweep is then read off algebraically, because
 * both energies are exactly affine in λ (see `score.ts`, "Why the sweep is free").
 */

import type { LegacyCompleteness, LegacyTier } from "../emit/legacy.ts"

/** The two priors, by the candidateId `DESIGN.md` gives them. */
export const ENERGY_ARMS = ["p1a", "p1ap"] as const

export type EnergyArm = (typeof ENERGY_ARMS)[number]

/**
 * The λ grid.
 *
 * `[INHERITED]` — `DESIGN.md` decision 2: *"λ v0 = 1.0, `[UNCALIBRATED]`, with a mandatory
 * sensitivity sweep λ ∈ {¼, ½, 1, 2, 4} in the falsifier stage."* Not a constant this module chose
 * and not one it may widen: the sweep's width is part of the pre-registration.
 */
export const LAMBDA_GRID = [0.25, 0.5, 1, 2, 4] as const

/** λ as a JSON object key. `0.25` → `"0.25"`. */
export function lambdaKey(lambda: number): string {
	return String(lambda)
}

/**
 * One energy's reading of one entry, with the λ sweep already resolved.
 *
 * `dataPart` and `structuralPart` are the two halves of the affine decomposition:
 * `total(λ) = dataPart + λ·structuralPart`. For arm A that is `(field + ink + escape) + λ·Ω`, in
 * nats; for arm A′ it is `L(pixels|P) + λ·L(P)`, in bits. `totals` is that formula evaluated on
 * `LAMBDA_GRID` and stored so no reader has to trust the algebra unseen.
 */
export type ArmScore = Readonly<{
	arm: EnergyArm
	/** The unit `total` is in. Nats for `p1a`, bits for `p1ap`. Never compared across arms. */
	unit: "nats" | "bits"
	dataPart: number
	structuralPart: number
	/** Keyed by `lambdaKey`. */
	totals: Readonly<Record<string, number>>
	/** The energy's own `terms`, verbatim, evaluated at λ = 1. */
	terms: Readonly<Record<string, number>>
	/** The energy's own `nuisance`, verbatim, evaluated at λ = 1. */
	nuisance: Readonly<Record<string, number | string>>
}>

/** One convertible legacy entry, scored by both energies. */
export type EntryScore = Readonly<{
	entryId: string
	tier: LegacyTier
	kind: string | null
	completeness: LegacyCompleteness
	artworkSha: string
	imagePath: string
	/** Notes from `toConfiguration` — e.g. `gradient-reconstructed-from-v2-3-convention`. */
	conversionNotes: readonly string[]
	/** The configuration's own shape, so a row can be read without re-loading the fixture. */
	shape: Readonly<{
		gradient: boolean
		stopCount: number
		surfaceCollapsed: boolean
		accentCollapsed: boolean
	}>
	/**
	 * **The structure diagnostic.** The fraction of image mass the *named roles* explain — arm A′'s
	 * field mass plus its ink mass, equivalently `1 − genericMassFraction`. Arm A has no such number:
	 * its `fieldMassFraction` and `inkMassFraction` are the two halves of a soft membership and sum to
	 * 1 for every configuration, so they say nothing about how much the palette explains. One
	 * diagnostic, from one arm, applied to both tables, stated rather than duplicated.
	 */
	explainedMassFraction: number
	p1a: ArmScore
	p1ap: ArmScore
}>

/**
 * The per-artwork stratifier.
 *
 * `[INHERITED]` from the M1 brief (*"stratify (a) by the structure diagnostic (degenerate <1% vs
 * not)"*, itself from arm A′'s finding that 13 of 20 demo covers explain under 1% of their image
 * mass). Nothing in either energy reads this number; it splits a report table and nothing else, and
 * `m1-results.json` carries the full per-artwork distribution so a reader can re-cut it anywhere.
 */
export const DEGENERATE_EXPLAINED_MASS_BELOW = 0.01

export type Stratum = "degenerate" | "structured"

/** One artwork, as the falsifier holds it: the entries on it and its stratum. */
export type ArtworkRecord = Readonly<{
	artworkSha: string
	imagePath: string
	entryIds: readonly string[]
	tiers: readonly LegacyTier[]
	/** Max over the artwork's convertible entries of `explainedMassFraction`. */
	explainedMassFraction: number
	stratum: Stratum
}>
