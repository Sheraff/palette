import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"

import sharp from "sharp"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import {
	buildPaletteSeedDomain,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"

import { buildRampSupport, rankRampMidpointCandidates, rampExcursion } from "./criterion.ts"

sharp.concurrency(1)

/**
 * One artwork's ramp measurement, written to a checkpoint file so the sweep is resumable.
 *
 * Everything reported here is measured with the mechanism's flag OFF: the published extraction is the
 * shipped one, and the criterion is evaluated against it from the outside. That is what makes the
 * before/after comparison honest — nothing in the "before" column was produced by the mechanism.
 */

export type Measurement = Readonly<{
	image: string
	width: number
	height: number
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	publishedMidpoint: string | null
	publishedMidpointOrigin: string | null
	familyBinStep: number
	supportCount: number
	/** Excursion of what actually renders today, third stop included. */
	excursionBefore: number
	worstPosition: number
	/** Excursion of the plain two-stop chord, ignoring any published third stop. */
	chordExcursion: number
	/**
	 * Every support colour that clears the three qualitative gates, best first. The excursion bar is
	 * deliberately NOT applied here, so `analyze.ts` can sweep it offline over one measured ranking.
	 */
	candidates: readonly Readonly<{
		hex: string
		populationFraction: number
		familyId: string
		excursionAfter: number
		endpointDifference: number
		chordDeviation: number
	}>[]
}>

const round = (value: number, digits = 4): number => Number(value.toFixed(digits))

export async function measure(image: string, path: string): Promise<Measurement> {
	const raw = await loadNativeImage(path)
	const details = extractPaletteDetails(raw)
	const seed = buildPaletteSeedDomain(raw, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const evidence = buildAlbumArtworkPaletteV2Phase3CommonBase(seed).evidence.native
	const support = buildRampSupport(evidence)
	const winner = details.winner
	const published = details.midpoint.kind === "source-supported-three-stop" ? details.midpoint : null
	const before = rampExcursion(
		winner.background.oklab, winner.surface.oklab, published?.color.oklab ?? null, support)
	const chord = rampExcursion(winner.background.oklab, winner.surface.oklab, null, support)
	const candidates = rankRampMidpointCandidates(
		winner.background, winner.surface, support, evidence.familyBinStep)
	return {
		image,
		width: raw.width,
		height: raw.height,
		background: winner.background.hex,
		surface: winner.surface.hex,
		foreground: winner.foreground.hex,
		accent: winner.accent.hex,
		gradient: winner.gradient,
		publishedMidpoint: published?.color.hex ?? null,
		publishedMidpointOrigin: published?.provenance.origin ?? null,
		familyBinStep: round(evidence.familyBinStep, 5),
		supportCount: support.length,
		excursionBefore: round(before.worst),
		worstPosition: before.worstPosition,
		chordExcursion: round(chord.worst),
		candidates: candidates.map((candidate) => ({
			hex: candidate.color.hex,
			populationFraction: round(candidate.color.populationFraction, 5),
			familyId: candidate.color.familyId,
			excursionAfter: round(candidate.excursionAfter),
			endpointDifference: round(candidate.endpointDifference),
			chordDeviation: round(candidate.chordDeviation),
		})),
	}
}

async function main(): Promise<void> {
	const [image, path, out] = process.argv.slice(2)
	if (!image || !path || !out) throw new Error("usage: measure.ts <image> <path> <out.json>")
	if (existsSync(out)) return
	const result = await measure(image, path)
	mkdirSync(dirname(resolve(out)), { recursive: true })
	writeFileSync(resolve(out), `${JSON.stringify(result)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
