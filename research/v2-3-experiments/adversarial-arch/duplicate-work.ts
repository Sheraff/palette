/**
 * Measures the recomputation the hygiene wave targeted, using only the public internal
 * exports of `research/v2-3/`.
 *
 * 1. **Eliminated.** `buildAlbumArtworkPaletteV2Phase3CommonBase` used to call
 *    `diagnoseGradientFits(seed.evidence)`, re-running `buildBackgroundFieldDomains`
 *    and `evaluateGradientFits` on the *same* evidence object `buildPaletteSeedDomain`
 *    had already run. `PaletteSeedDomain.gradientFitDiagnostics` now carries the
 *    result. The `seedMs` column below is what remains, and it now contains that work
 *    exactly once; before the change it was performed twice per extraction (plus a
 *    third time on all-ranked-lane evidence, also removed).
 *
 * 2. **Still present, deliberately.** `extractPaletteDetails` scores the full candidate
 *    domain, then `selectWinner` -> `selectSourceEligibleWinner` (winner-selection.ts)
 *    scores the source-eligible subset from scratch. The re-score is an invariant that
 *    has fired in the field, so it is left alone; the column measures its price.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/adversarial-arch/duplicate-work.ts [image...]
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "../../v2-3/src/internal/source-eligibility.ts"
import type { RawImage } from "../../v2-3/src/internal/types.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const DEFAULT_IMAGES = ["placebo.jpg", "birdsofprey.jpg", "loups.jpg", "knuckles.jpg", "black.jpg"]

function milliseconds(run: () => unknown): number {
	const started = process.hrtime.bigint()
	run()
	return Number(process.hrtime.bigint() - started) / 1e6
}

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_IMAGES
const rows: string[] = []

for (const name of names) {
	const bytes = await readFile(resolve(repositoryRoot, "images", name))
	const image: RawImage = await loadNativeImage(bytes)
	extractPaletteDetails(image) // warm

	const totalMs = milliseconds(() => extractPaletteDetails(image))
	let built: ReturnType<typeof buildPaletteSeedDomain> | null = null
	// (1) One discovery pass, carrying the fits the common base used to recompute.
	const rediscoveryMs = milliseconds(() => {
		built = buildPaletteSeedDomain(image)
	})
	const seed = built!

	// (2) The re-scoring of the source-eligible subset.
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		common.seedAvailability.logicalDescriptors.map((descriptor) => ({ ...descriptor })),
		common.seedAvailability.identityObligations,
	)
	const materialized = materialization.materialized.map((candidate) => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors,
	}))
	const eligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(materialized, {
		emergency: seed.emergency,
	})
	const fullMs = milliseconds(() => scorePaletteCandidates(
		materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: [] },
	))
	const eligibleMs = milliseconds(() => scorePaletteCandidates(
		eligibility.eligibleCandidates.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: [] },
	))

	const row = `| ${name} | ${totalMs.toFixed(0)} | ${rediscoveryMs.toFixed(0)} (${((rediscoveryMs / totalMs) * 100).toFixed(0)}%) | ` +
		`${materialized.length} / ${eligibility.eligibleCandidates.length} | ${fullMs.toFixed(0)} | ` +
		`${eligibleMs.toFixed(0)} (${((eligibleMs / totalMs) * 100).toFixed(0)}%) |`
	rows.push(row)
	console.log(row)
}

console.log("\n| image | total ms | seed discovery (once) | candidates all/eligible | full scoring ms | eligibility re-scoring |")
console.log("| --- | ---: | ---: | ---: | ---: | ---: |")
for (const row of rows) console.log(row)
