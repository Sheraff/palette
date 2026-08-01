import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import {
	buildPaletteSeedDomain,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { rgbToOKLab } from "../../v2-3/src/internal/color.ts"

import { buildRampSupport, nominateRampMidpoint, rampExcursion } from "./criterion.ts"

/**
 * Per-artwork instrumentation for the ramp-midpoint mechanism.
 *
 * Read-only outside `research/v2-3/`, same posture as `research/v2-3-eval/export-candidates.ts`: it
 * replays `buildPaletteSeedDomain` -> `buildAlbumArtworkPaletteV2Phase3CommonBase` to reach the
 * native family evidence, and calls the published `extractPaletteDetails` for the winner.
 *
 * `--bg` / `--surface` override the endpoints so a hypothetical pair (the reviewer's corrected
 * endpoints, say) can be measured against the same artwork's own evidence. `--top N` lists the N
 * best-scoring nominees rather than only the winner.
 */

function hexToRgb(hex: string): [number, number, number] {
	const value = Number.parseInt(hex.replace("#", ""), 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits))

async function main(): Promise<void> {
	const path = process.argv[2]
	if (!path) throw new Error("usage: probe.ts <image> [--bg #hex] [--surface #hex] [--top N] [--out file.json]")
	const arg = (name: string): string | null => {
		const index = process.argv.indexOf(`--${name}`)
		return index === -1 ? null : process.argv[index + 1] ?? null
	}
	const image = await loadNativeImage(path)
	const details = extractPaletteDetails(image)
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const evidence = common.evidence.native

	const bgHex = arg("bg") ?? details.winner.background.hex
	const surfaceHex = arg("surface") ?? details.winner.surface.hex
	const background = { rgb: hexToRgb(bgHex), oklab: rgbToOKLab(hexToRgb(bgHex)), hex: bgHex }
	const surface = { rgb: hexToRgb(surfaceHex), oklab: rgbToOKLab(hexToRgb(surfaceHex)), hex: surfaceHex }

	const support = buildRampSupport(evidence)
	const publishedMidpoint = details.midpoint.kind === "source-supported-three-stop"
		? details.midpoint.color
		: null
	const currentMidpoint = arg("bg") === null && arg("surface") === null && publishedMidpoint !== null
		? publishedMidpoint.oklab
		: null
	const before = rampExcursion(background.oklab, surface.oklab, currentMidpoint, support)
	const nomination = nominateRampMidpoint(background, surface, support, evidence.familyBinStep)

	const topCount = Number(arg("top") ?? "0")
	let top: unknown = undefined
	if (topCount > 0) {
		const scored = support.map((entry) => ({
			hex: entry.hex,
			populationFraction: round(entry.populationFraction, 5),
			excursionAfter: round(rampExcursion(background.oklab, surface.oklab, entry.oklab, support).worst),
		})).sort((first, second) => first.excursionAfter - second.excursionAfter)
		top = scored.slice(0, topCount)
	}

	const report = {
		image: path.split("/").pop(),
		width: image.width,
		height: image.height,
		published: {
			background: details.winner.background.hex,
			surface: details.winner.surface.hex,
			foreground: details.winner.foreground.hex,
			accent: details.winner.accent.hex,
			gradient: details.winner.gradient,
			midpoint: publishedMidpoint?.hex ?? null,
			midpointOrigin: details.midpoint.kind === "source-supported-three-stop"
				? details.midpoint.provenance.origin
				: null,
		},
		measuredEndpoints: { background: bgHex, surface: surfaceHex, currentMidpoint: currentMidpoint === null ? null : publishedMidpoint?.hex ?? null },
		familyBinStep: round(evidence.familyBinStep, 5),
		supportCount: support.length,
		excursionBefore: round(before.worst),
		worstPosition: before.worstPosition,
		samples: before.samples.map((sample) => ({ position: sample.position, hex: sample.hex, distance: round(sample.distance) })),
		nomination: nomination === null ? null : {
			hex: nomination.color.hex,
			populationFraction: round(nomination.color.populationFraction, 5),
			familyId: nomination.color.familyId,
			excursionAfter: round(nomination.excursionAfter),
			endpointDifference: round(nomination.endpointDifference),
			chordDeviation: round(nomination.chordDeviation, 4),
		},
		top,
	}
	const out = arg("out")
	if (out) {
		mkdirSync(dirname(resolve(out)), { recursive: true })
		writeFileSync(resolve(out), `${JSON.stringify(report, null, 1)}\n`)
		process.stderr.write(`wrote ${out}\n`)
	}
	process.stdout.write(`${JSON.stringify(report, null, 1)}\n`)
}

await main()
