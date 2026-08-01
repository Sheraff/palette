/**
 * Background-fidelity probe.
 *
 * Wraps the gradient arm's round-8 "groundcase" detector (imported verbatim as `qualifies`) and
 * adds the measurements this arm needs:
 *
 *   - the FAILURE PROXY: the published background family's field-mass share against the largest
 *     chromatic family's. The reviewer's complaint on `000390c0` is exactly "a near-white is the
 *     background while a chromatic family holds clearly more of the field", so the proxy is the
 *     mass ratio `largestChromaticPopulation / backgroundPopulation`.
 *   - the DIAGNOSIS: which criterion of `fieldRoleOwnershipProfile` decided background-vs-surface,
 *     and whether the background family is one the `mount` policy already recognises as a frame.
 *
 * `fieldRoleOwnershipProfile` and `mountFamilyIds` are not exported from the runtime, so they are
 * replicated here verbatim from `palette-core.ts`. `assignFieldRoles` IS exported and is called
 * directly, so the decisive criterion is the runtime's own, not a re-derivation.
 *
 *   node --experimental-strip-types probe-bgfidelity.ts <image-path>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import {
	assignFieldRoles,
	buildNativePaletteEvidence,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import type { ColorFamilyEvidence } from "../../v2-3/src/internal/palette-core.ts"

/** `identityDirectionChroma` / `identity.neutralObligationChroma`, the runtime's neutral bar. */
const RAMP_IDENTITY_CHROMA = 0.06
const chromaOf = (lab: readonly number[]): number => Math.hypot(lab[1], lab[2])
const clamp = (value: number): number => Math.max(0, Math.min(1, value))

/** `fieldRoleOwnershipProfile`'s first criterion, verbatim (`palette-core.ts:1423`). */
const frameCoverage = (family: ColorFamilyEvidence): number =>
	(family.borderCoverage + family.cornerCoverage) / 2
/** ... second criterion, verbatim (`palette-core.ts:1424`). */
const peripheralCoverage = (family: ColorFamilyEvidence): number =>
	(family.borderCoverage + family.cornerCoverage + (1 - family.centerCoverage)) / 3
/** ... third criterion, verbatim (`palette-core.ts:1425`). */
const connectedCoverage = (family: ColorFamilyEvidence): number =>
	Math.sqrt(clamp(family.largestComponentFraction / 0.24) * family.familyConcentration)
/** ... fifth criterion, verbatim (`palette-core.ts:1426`). */
const populationCoverage = (family: ColorFamilyEvidence): number =>
	clamp(family.populationFraction / 0.24)

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

/** `mountFamilyIds`, verbatim (`palette-core.ts:1726`). */
function mountFamilyIds(families: readonly ColorFamilyEvidence[]): Set<string> {
	const policy = ALBUM_ARTWORK_PALETTE_V2_POLICY.mount
	const mounts = new Set<string>()
	if (policy.borderCreditRetained >= 1) return mounts
	const enclosed = families.filter(({ borderCoverage }) => borderCoverage <= policy.maximumEnclosedBorderCoverage)
	if (enclosed.length === 0) return mounts
	const largestEnclosed = enclosed.reduce((best, family) =>
		family.populationFraction > best.populationFraction ||
		(family.populationFraction === best.populationFraction && compareAscii(family.id, best.id) < 0)
			? family
			: best)
	for (const family of families) {
		if (family.borderCoverage < policy.minimumBorderCoverage) continue
		if (family.id === largestEnclosed.id) continue
		if (largestEnclosed.populationFraction < family.populationFraction * policy.minimumEnclosedPopulationRatio) continue
		mounts.add(family.id)
	}
	return mounts
}

function familyRow(family: ColorFamilyEvidence | undefined): Record<string, unknown> | null {
	if (!family) return null
	return {
		id: family.id,
		chroma: family.chroma,
		populationFraction: family.populationFraction,
		borderCoverage: family.borderCoverage,
		cornerCoverage: family.cornerCoverage,
		centerCoverage: family.centerCoverage,
		frameCoverage: frameCoverage(family),
		peripheralCoverage: peripheralCoverage(family),
		connectedCoverage: connectedCoverage(family),
		fieldScore: family.fieldScore,
		populationCoverage: populationCoverage(family),
		largestComponentFraction: family.largestComponentFraction,
		familyConcentration: family.familyConcentration,
	}
}

export async function probe(imagePath: string): Promise<Record<string, unknown>> {
	const image = await loadNativeImage(imagePath)
	const evidence = buildNativePaletteEvidence(image)
	const details = extractPaletteDetails(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const winner = details.winner
	const byId = new Map(evidence.families.map((family) => [family.id, family]))

	const backgroundChroma = chromaOf(winner.background.oklab)
	const surfaceChroma = chromaOf(winner.surface.oklab)
	const backgroundFamily = byId.get(winner.familyRoles.background)
	const surfaceFamily = byId.get(winner.familyRoles.surface)

	// --- the imported round-8 detector, unchanged ---
	const qualifies = !winner.gradient
		&& winner.background.hex !== winner.surface.hex
		&& backgroundChroma < RAMP_IDENTITY_CHROMA
		&& surfaceChroma >= RAMP_IDENTITY_CHROMA
		&& backgroundFamily !== undefined && surfaceFamily !== undefined
		&& frameCoverage(backgroundFamily) > frameCoverage(surfaceFamily)

	// --- the near-neutral-GROUND configuration, gradient-agnostic ---
	// The round-8 filter requires `!winner.gradient` because it was selecting flat/gradient A-B
	// pairs. The failure class does not care about the gradient flag (`00079f9a` and `000e2291`
	// are published gradient-true), so the configuration is measured without it.
	const configuration = winner.background.hex !== winner.surface.hex
		&& backgroundChroma < RAMP_IDENTITY_CHROMA
		&& surfaceChroma >= RAMP_IDENTITY_CHROMA
		&& backgroundFamily !== undefined && surfaceFamily !== undefined
		&& frameCoverage(backgroundFamily) > frameCoverage(surfaceFamily)

	// --- the failure proxy: does a chromatic family hold clearly more field mass? ---
	const chromatic = evidence.families.filter((family) => family.chroma >= RAMP_IDENTITY_CHROMA)
	const largestChromatic = chromatic.length === 0 ? undefined : chromatic.reduce((best, family) =>
		family.populationFraction > best.populationFraction ||
		(family.populationFraction === best.populationFraction && compareAscii(family.id, best.id) < 0)
			? family
			: best)
	const backgroundPopulation = backgroundFamily?.populationFraction ?? 0
	const massRatio = largestChromatic && backgroundPopulation > 0
		? largestChromatic.populationFraction / backgroundPopulation
		: null

	// --- the diagnosis ---
	const mounts = mountFamilyIds(evidence.families)
	const roleAssignment = backgroundFamily && surfaceFamily
		? assignFieldRoles(backgroundFamily, surfaceFamily)
		: null

	return {
		image: imagePath,
		width: image.width,
		height: image.height,
		qualifies,
		configuration,
		published: {
			gradient: winner.gradient,
			treatment: winner.fieldTreatment,
			background: winner.background.hex,
			surface: winner.surface.hex,
			foreground: winner.foreground.hex,
			accent: winner.accent.hex,
			midpoint: details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.hex : null,
			familyRoles: winner.familyRoles,
		},
		backgroundChroma,
		surfaceChroma,
		groundFrame: backgroundFamily ? frameCoverage(backgroundFamily) : null,
		subjectFrame: surfaceFamily ? frameCoverage(surfaceFamily) : null,
		// The failure proxy.
		massRatio,
		backgroundPopulationFraction: backgroundPopulation,
		largestChromaticPopulationFraction: largestChromatic?.populationFraction ?? null,
		largestChromaticIsSurface: largestChromatic?.id === surfaceFamily?.id,
		// The diagnosis.
		backgroundIsMount: backgroundFamily ? mounts.has(backgroundFamily.id) : false,
		mountCount: mounts.size,
		decisiveCriterion: roleAssignment?.decisiveCriterion ?? null,
		decisiveConfidence: roleAssignment?.confidence ?? null,
		backgroundFamily: familyRow(backgroundFamily),
		surfaceFamily: familyRow(surfaceFamily),
		largestChromaticFamily: familyRow(largestChromatic),
		familyCount: evidence.families.length,
	}
}

if (process.argv[1]?.endsWith("probe-bgfidelity.ts")) {
	for (const path of process.argv.slice(2)) {
		try {
			console.log(JSON.stringify(await probe(path)))
		} catch (error) {
			console.log(JSON.stringify({ image: path, error: String(error) }))
		}
	}
}
