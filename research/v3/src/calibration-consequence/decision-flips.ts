/**
 * Run the contract's distinctness invariant over the decision corpus once per bar variant and count
 * the verdicts that change.
 *
 * The whole file rests on one property of `validateDistinctness()`: the violations it returns are
 * exactly the pairs it judged "the same colour", among the pairs the matrix actually checks. So
 *
 * - calling it with a bar of `+Infinity` **enumerates** the matrix — every non-exempt pair comes
 *   back as a violation, carrying its OKLab distance and both regions;
 * - calling it with a variant's bar returns the set of pairs that variant calls "the same".
 *
 * Both the exemptions (sanctioned collapses, field-role-versus-stop) and the straddle rule are
 * therefore the contract's own, not a copy. Nothing in this folder reimplements the matrix.
 */

import { validateDistinctness, publishedColors } from "../contract/invariants.ts"
import { colorDistance, colorRegion } from "../contract/color.ts"
import type { ColorRegion, Palette, PaletteColor, Violation } from "../contract/types.ts"
import { makeBarFor, VARIANT_NAMES, type VariantName } from "./bars.ts"
import type { CorpusPalette } from "./decision-corpus.ts"

/**
 * The bar used to enumerate the matrix rather than to judge it.
 *
 * `[HELD]` — not a threshold. `+Infinity` makes `distance >= bar` false for every pair, so every
 * checked cell is reported and none is judged. It is the enumeration, expressed in the validator's
 * own vocabulary so the exemption logic cannot drift from the judging path.
 */
const ENUMERATION_BAR = Number.POSITIVE_INFINITY

/** Stable identity for a cell of the matrix: its two dotted paths, ordered. */
function pairKey(violation: Violation): string {
	return [...violation.subjects].sort().join("|")
}

export type MatrixPair = Readonly<{
	key: string
	distance: number
	regions: readonly [ColorRegion, ColorRegion]
	/** The two hexes, in the same order as `key` and `regions`. */
	hexes: readonly [string, string]
	/** Whether this cell is one of the two sanctioned-collapse cells that failed to be sanctioned. */
	code: string
	barByVariant: Record<VariantName, number>
	sameByVariant: Record<VariantName, boolean>
}>

export type PaletteResult = Readonly<{
	fixture: string
	entryId: string
	matrix: "roles" | "roles+gradient"
	pairs: readonly MatrixPair[]
	/** Whether the palette carries at least one distinctness violation, per variant. */
	violatesByVariant: Record<VariantName, boolean>
}>

/** Evaluate one palette object under every variant. */
function evaluatePalette(palette: Palette): { pairs: MatrixPair[]; violates: Record<VariantName, boolean> } {
	const colorsByPath = new Map<string, PaletteColor>()
	for (const entry of publishedColors(palette)) {
		if (entry.color !== undefined) colorsByPath.set(entry.path, entry.color)
	}

	const enumerated = validateDistinctness(palette, () => ENUMERATION_BAR)
	const pairs: MatrixPair[] = []
	const sameSets = new Map<VariantName, Set<string>>()
	const violates = {} as Record<VariantName, boolean>

	for (const variant of VARIANT_NAMES) {
		const violations = validateDistinctness(palette, makeBarFor(variant))
		sameSets.set(variant, new Set(violations.map(pairKey)))
		violates[variant] = violations.length > 0
	}

	for (const violation of enumerated) {
		const key = pairKey(violation)
		const [firstPath, secondPath] = [...violation.subjects].sort()
		const first = colorsByPath.get(firstPath)!
		const second = colorsByPath.get(secondPath)!
		const barByVariant = {} as Record<VariantName, number>
		const sameByVariant = {} as Record<VariantName, boolean>
		for (const variant of VARIANT_NAMES) {
			barByVariant[variant] = makeBarFor(variant)(first, second)
			sameByVariant[variant] = sameSets.get(variant)!.has(key)
		}
		pairs.push({
			key,
			distance: colorDistance(first, second),
			regions: [colorRegion(first), colorRegion(second)],
			hexes: [first.hex, second.hex],
			code: violation.code,
			barByVariant,
			sameByVariant,
		})
	}

	return { pairs, violates }
}

export function evaluateCorpus(corpus: readonly CorpusPalette[]): PaletteResult[] {
	const results: PaletteResult[] = []
	for (const palette of corpus) {
		const rolesOnly = evaluatePalette(palette.rolesOnly)
		results.push({
			fixture: palette.fixture,
			entryId: palette.entryId,
			matrix: "roles",
			pairs: rolesOnly.pairs,
			violatesByVariant: rolesOnly.violates,
		})
		if (palette.withGradient !== null) {
			const withGradient = evaluatePalette(palette.withGradient)
			results.push({
				fixture: palette.fixture,
				entryId: palette.entryId,
				matrix: "roles+gradient",
				pairs: withGradient.pairs,
				violatesByVariant: withGradient.violates,
			})
		}
	}
	return results
}

// ---------------------------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------------------------

export type FlippedPair = Readonly<{
	fixture: string
	entryId: string
	pair: string
	distance: number
	regions: readonly [ColorRegion, ColorRegion]
	hexes: readonly [string, string]
	baselineBar: number
	variantBar: number
	/** `"to-same"` when the variant newly calls the pair one colour; `"to-distinct"` the other way. */
	direction: "to-same" | "to-distinct"
	/** Whether this flip alone changes whether the palette has any distinctness violation. */
	changesPaletteValidity: boolean
}>

export type VariantFlipReport = Readonly<{
	variant: VariantName
	pairsEvaluated: number
	flips: number
	flipRate: number
	toSame: number
	toDistinct: number
	palettesWithAnyFlip: number
	palettesWithAnyFlipRate: number
	validityChanges: number
	validityChangeRate: number
	validityToInvalid: number
	validityToValid: number
	flipsByRegionPair: Record<string, number>
	flippedPairs: readonly FlippedPair[]
	validityChangedPalettes: readonly Readonly<{
		fixture: string
		entryId: string
		from: "violating" | "clean"
		to: "violating" | "clean"
	}>[]
}>

export type MatrixReport = Readonly<{
	matrix: "roles" | "roles+gradient"
	palettes: number
	pairsEvaluated: number
	baselineViolatingPalettes: number
	baselineViolatingPairs: number
	/** Pairs whose distance sits anywhere inside the region's 95% window — the uncertainty zone. */
	pairsInsideCiWindow: number
	pairsInsideCiWindowRate: number
	/** Every pair today's constants already call one colour — the baseline the flips are measured off. */
	baselineViolatingPairDetails: readonly Readonly<{
		fixture: string
		entryId: string
		pair: string
		distance: number
		bar: number
		hexes: readonly [string, string]
		regions: readonly [ColorRegion, ColorRegion]
		code: string
	}>[]
	variants: readonly VariantFlipReport[]
}>

export function summarizeMatrix(
	results: readonly PaletteResult[],
	matrix: "roles" | "roles+gradient",
): MatrixReport {
	const rows = results.filter((result) => result.matrix === matrix)
	const pairsEvaluated = rows.reduce((total, row) => total + row.pairs.length, 0)

	let pairsInsideCiWindow = 0
	const baselineViolatingPairDetails: MatrixReport["baselineViolatingPairDetails"][number][] = []
	for (const row of rows) {
		for (const pair of row.pairs) {
			const low = pair.barByVariant["ci-low"]
			const high = pair.barByVariant["ci-high"]
			if (pair.distance >= low && pair.distance < high) pairsInsideCiWindow++
			if (pair.sameByVariant.point) {
				baselineViolatingPairDetails.push({
					fixture: row.fixture,
					entryId: row.entryId,
					pair: pair.key,
					distance: pair.distance,
					bar: pair.barByVariant.point,
					hexes: pair.hexes,
					regions: pair.regions,
					code: pair.code,
				})
			}
		}
	}

	const variants: VariantFlipReport[] = []
	for (const variant of VARIANT_NAMES) {
		if (variant === "point") continue
		let flips = 0
		let toSame = 0
		let toDistinct = 0
		let validityToInvalid = 0
		let validityToValid = 0
		const flippedPairs: FlippedPair[] = []
		const validityChangedPalettes: MatrixReport["variants"][number]["validityChangedPalettes"][number][] = []
		const palettesWithAnyFlip = new Set<string>()
		const flipsByRegionPair: Record<string, number> = {}

		for (const row of rows) {
			const validityChanged = row.violatesByVariant.point !== row.violatesByVariant[variant]
			if (validityChanged) {
				if (row.violatesByVariant[variant]) validityToInvalid++
				else validityToValid++
				validityChangedPalettes.push({
					fixture: row.fixture,
					entryId: row.entryId,
					from: row.violatesByVariant.point ? "violating" : "clean",
					to: row.violatesByVariant[variant] ? "violating" : "clean",
				})
			}
			for (const pair of row.pairs) {
				if (pair.sameByVariant.point === pair.sameByVariant[variant]) continue
				flips++
				palettesWithAnyFlip.add(`${row.fixture}/${row.entryId}`)
				const direction = pair.sameByVariant[variant] ? "to-same" : "to-distinct"
				if (direction === "to-same") toSame++
				else toDistinct++
				const regionKey = [...pair.regions].sort().join(" × ")
				flipsByRegionPair[regionKey] = (flipsByRegionPair[regionKey] ?? 0) + 1
				flippedPairs.push({
					fixture: row.fixture,
					entryId: row.entryId,
					pair: pair.key,
					distance: pair.distance,
					regions: pair.regions,
					hexes: pair.hexes,
					baselineBar: pair.barByVariant.point,
					variantBar: pair.barByVariant[variant],
					direction,
					changesPaletteValidity: validityChanged,
				})
			}
		}

		variants.push({
			variant,
			pairsEvaluated,
			flips,
			flipRate: pairsEvaluated === 0 ? 0 : flips / pairsEvaluated,
			toSame,
			toDistinct,
			palettesWithAnyFlip: palettesWithAnyFlip.size,
			palettesWithAnyFlipRate: rows.length === 0 ? 0 : palettesWithAnyFlip.size / rows.length,
			validityChanges: validityToInvalid + validityToValid,
			validityChangeRate: rows.length === 0 ? 0 : (validityToInvalid + validityToValid) / rows.length,
			validityToInvalid,
			validityToValid,
			flipsByRegionPair,
			flippedPairs,
			validityChangedPalettes,
		})
	}

	return {
		matrix,
		palettes: rows.length,
		pairsEvaluated,
		baselineViolatingPalettes: rows.filter((row) => row.violatesByVariant.point).length,
		baselineViolatingPairs: rows.reduce(
			(total, row) => total + row.pairs.filter((pair) => pair.sameByVariant.point).length,
			0,
		),
		pairsInsideCiWindow,
		pairsInsideCiWindowRate: pairsEvaluated === 0 ? 0 : pairsInsideCiWindow / pairsEvaluated,
		baselineViolatingPairDetails,
		variants,
	}
}
