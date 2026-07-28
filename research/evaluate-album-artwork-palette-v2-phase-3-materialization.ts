import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails,
} from "./src/album-artwork-palette-v2-phase-3-materialization.ts"
import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./src/album-artwork-palette-v2.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_DIAGNOSTIC_MAXIMUM_SOURCES = 8

export function parseAlbumArtworkPaletteV2Phase3MaterializationDiagnosticArguments(
	args: readonly string[],
): readonly string[] {
	if (args.length === 0 || args.length >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_DIAGNOSTIC_MAXIMUM_SOURCES) {
		throw new Error("Usage: node --experimental-strip-types research/evaluate-album-artwork-palette-v2-phase-3-materialization.ts <source> [source ...] (maximum 8)")
	}
	return [...new Set(args)].sort()
}

export async function evaluateAlbumArtworkPaletteV2Phase3MaterializationSources(
	paths: readonly string[],
): Promise<Readonly<{
	schemaVersion: 1
	sourceCount: number
	sources: readonly unknown[]
}>> {
	if (paths.length === 0 || paths.length >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_DIAGNOSTIC_MAXIMUM_SOURCES) {
		throw new RangeError("The materialization diagnostic requires between one and eight sources")
	}
	const sources = []
	for (const path of paths) {
		const image = await loadNativeImage(await readFile(path))
		const details = extractAlbumArtworkPaletteV2074Details(image)
		const attempt = attemptAlbumArtworkPaletteV2Phase3MaterializationFromDetails(details)
		const materialization = attempt.materialization.diagnostics
		const slate = attempt.slate.diagnostics
		sources.push({
			source: path,
			dimensions: { width: image.width, height: image.height },
			closedDomain: {
				rawCandidateCount: details.audit.candidate.rawCandidateCount,
				materializedCandidateCount: details.audit.candidate.materializedCandidateCount,
				capacity: details.audit.candidate.capacity,
				capacityReached: details.audit.candidate.capacityReached,
			},
			attempt: {
				materializedTreatmentCount: materialization.materializedTreatmentCount,
				duplicateCanonicalTreatmentCount: materialization.duplicateCanonicalTreatmentCount,
				truncatedCanonicalTreatmentCount: materialization.truncatedCanonicalTreatmentCount,
				uncoveredStratumCount: materialization.uncoveredStratumKeys.length,
				materializationFailureSources: materialization.failureSources,
				slateCount: slate.selectedCanonicalTreatmentKeys.length,
				uncoveredObligationCount: slate.uncoveredObligationIds.length,
				uncoveredObligationRoleCount: slate.uncoveredObligationRoleStratumKeys.length,
				uncoveredSourceModeCount: slate.uncoveredSourceModeStratumKeys.length,
				slateFailureSources: slate.failureSources,
				winnerChanged: slate.winnerKey !== completeTreatmentKey(details.result.winner),
			},
			capacityInterpretation: details.audit.candidate.capacityReached
				? "closed-domain-already-capped; this adapter cannot recover descriptors omitted upstream"
				: "closed-domain-not-capped",
		})
	}
	return { schemaVersion: 1, sourceCount: sources.length, sources }
}

async function main(): Promise<void> {
	const paths = parseAlbumArtworkPaletteV2Phase3MaterializationDiagnosticArguments(
		process.argv.slice(2).map((path) => resolve(path)),
	)
	process.stdout.write(`${JSON.stringify(
		await evaluateAlbumArtworkPaletteV2Phase3MaterializationSources(paths),
		null,
		2,
	)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
