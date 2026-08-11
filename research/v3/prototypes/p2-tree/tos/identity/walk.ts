/**
 * **A traced assembly walk.**
 *
 * `roles/assemble.ts` returns the palette it settled on and a note when it exhausted, but not *why*
 * each candidate ahead of the winner was refused. Q1 and Q2 both turn on that: "the ranking chose a
 * weak colour", "the twin filter removed the artwork's own text colour" and "the contract's contrast
 * floor removed it" are three different defects with three different fixes, and only the per-candidate
 * refusal reason tells them apart.
 *
 * So the walk is mirrored here, from `candidate.ts` and `roles/assemble.ts`, with one addition: every
 * candidate's `validatePalette` violations are kept. The mirror is validated the only way a read-only
 * diagnosis can validate one — `agrees` is true when the traced walk settles on the same foreground,
 * the same accent and the same collapse flags as `paletteWithDiagnostics` did on the same image, and no
 * report quotes a trace whose `agrees` is false.
 *
 * Provenance tag: `p2-tos-identity/walk@1`.
 */

import { CONTRACT_VERSION } from "../../../../src/contract/constants.ts"
import { colorFromRgb } from "../../../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters, validatePalette } from "../../../../src/contract/invariants.ts"
import type { GradientStop, Palette, Rgb8 } from "../../../../src/contract/types.ts"
import { MAX_ASSEMBLY_ATTEMPTS, PREPROCESSING_VERSION } from "../constants.ts"
import type { DecodedImage, Parse } from "../pipeline.ts"
import { sameColorRgb, separatedFromForeground } from "../roles/assemble.ts"

export const WALK_PROVENANCE = "p2-tos-identity/walk@1"

export type WalkStep = Readonly<{
	rank: number
	hex: string
	/** `twin-of-background` / `twin-of-surface` are the pre-filter; `violations` is the contract's answer. */
	refusal: "twin-of-background" | "twin-of-surface" | "contract-violation" | "budget-exhausted" | null
	violations: readonly string[]
	accepted: boolean
}>

export type WalkTrace = Readonly<{
	provenance: string
	foregroundSteps: readonly WalkStep[]
	settledForeground: string | null
	settledForegroundRank: number | null
	exhausted: boolean
	twinUnavoidable: boolean
	attempts: number
	agrees: boolean
	disagreement: string | null
}>

/** Rebuild `candidate.ts`'s palette constructor for one parse. */
export function assemblerFor(image: DecodedImage, imagePath: string, parse: Parse, inputContentHash: string) {
	const background = colorFromRgb(parse.roles.background)
	const surface = colorFromRgb(parse.roles.surface)
	const collapsedField = surface.hex === background.hex
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		{ color: surface, position: 1 },
	]
	return (foregroundRgb: Rgb8, accentRgb: Rgb8): Palette => {
		const foreground = colorFromRgb(foregroundRgb)
		const accent = colorFromRgb(accentRgb)
		return {
			contractVersion: CONTRACT_VERSION,
			roles: { background, surface, foreground, accent },
			gradient: parse.gradient && !collapsedField ? { stops: stops as unknown as [GradientStop, GradientStop] } : null,
			collapse: { surfaceCollapsed: collapsedField, accentCollapsed: accent.hex === foreground.hex },
			contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
			metadata: {
				algorithmVersion: "p2-tos-0.3.0-cycle-2-merged",
				preprocessingVersion: PREPROCESSING_VERSION,
				inputContentHash,
				sourceRendition: { path: imagePath, width: image.width, height: image.height, format: image.format },
				processedSize: { width: image.width, height: image.height },
			},
		} satisfies Palette
	}
}

/**
 * Walk the foreground ranking exactly as `resolveRoles` does, recording every refusal.
 *
 * `expectedForeground` is the hex `paletteWithDiagnostics` published for this image; the trace reports
 * `agrees: false` rather than being quoted if the mirror and the pipeline part company.
 */
export function traceForegroundWalk(params: {
	assemble: (foreground: Rgb8, accent: Rgb8) => Palette
	background: Rgb8
	surface: Rgb8
	foregroundPool: readonly Rgb8[]
	expectedForeground: string
}): WalkTrace {
	const { assemble, background, surface, foregroundPool, expectedForeground } = params
	const steps: WalkStep[] = []
	let attempts = 0
	let settled: string | null = null
	let settledRank: number | null = null

	const eligible: { rank: number; color: Rgb8 }[] = []
	foregroundPool.forEach((color, rank) => {
		if (sameColorRgb(color, background)) {
			steps.push({ rank, hex: colorFromRgb(color).hex, refusal: "twin-of-background", violations: [], accepted: false })
			return
		}
		if (sameColorRgb(color, surface)) {
			steps.push({ rank, hex: colorFromRgb(color).hex, refusal: "twin-of-surface", violations: [], accepted: false })
			return
		}
		eligible.push({ rank, color })
	})

	for (const candidate of eligible) {
		if (attempts >= MAX_ASSEMBLY_ATTEMPTS) {
			steps.push({ rank: candidate.rank, hex: colorFromRgb(candidate.color).hex, refusal: "budget-exhausted", violations: [], accepted: false })
			continue
		}
		attempts += 1
		const palette = assemble(candidate.color, candidate.color)
		const violations = validatePalette(palette).violations.map(
			(violation) => `${violation.code} | ${violation.message}${violation.measured === undefined ? "" : ` | ${JSON.stringify(violation.measured)}`}`,
		)
		const accepted = violations.length === 0
		steps.push({
			rank: candidate.rank,
			hex: colorFromRgb(candidate.color).hex,
			refusal: accepted ? null : "contract-violation",
			violations,
			accepted,
		})
		if (accepted) {
			settled = colorFromRgb(candidate.color).hex
			settledRank = candidate.rank
			break
		}
	}

	steps.sort((first, second) => first.rank - second.rank)
	const agrees = settled === expectedForeground
	return {
		provenance: WALK_PROVENANCE,
		foregroundSteps: steps,
		settledForeground: settled,
		settledForegroundRank: settledRank,
		exhausted: settled === null,
		twinUnavoidable: eligible.length === 0,
		attempts,
		agrees,
		disagreement: agrees ? null : `traced walk settled on ${settled ?? "nothing"}, pipeline published ${expectedForeground}`,
	}
}
