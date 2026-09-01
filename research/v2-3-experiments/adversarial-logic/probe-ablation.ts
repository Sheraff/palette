/**
 * Ablation probe. `endpoint-refinement` hypotheses never win, but an accepted
 * refinement also injects band-local families into `augmentedNative`, which feeds
 * supplemental treatment construction and the role classifier. So "never wins" is
 * not the same as "no effect". Replay the selection twice — once as shipped, once
 * with every band-local-endpoint contribution removed — and diff the winner.
 *
 * Same harness ablates the diffuse-composite domains indirectly by reporting which
 * winners are sourced from a `diffuse-field-domain` or `paired-field-domain`.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"

const IMAGES = process.env.IMAGES_DIR ?? join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const SUFFIX = process.env.OUT_SUFFIX ?? ""

type Arm = "shipped" | "no-band-local"

function selectFor(seed: any, common: any, arm: Arm) {
	// The shipped arm uses every supplemental field and the endpoint-augmented
	// evidence. The ablated arm drops band-local-endpoint fields and falls back to
	// the un-augmented native evidence, which is what the pipeline would see if
	// `buildBandLocalEndpointRefinements` had accepted nothing.
	const supplementalFields = common.fieldHypotheses
		.filter(({ sourceType }: any) => sourceType !== "native-seed")
		.filter(({ sourceType }: any) => arm === "shipped" || sourceType !== "band-local-endpoint")
	const evidence = arm === "shipped" ? common.evidence.augmentedNative : common.evidence.native
	const bySource = new Map(supplementalFields.map(({ sourceType, hypothesis }: any) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		evidence, supplementalFields.map(({ hypothesis }: any) => hypothesis))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors,
			...supplemental.treatments.map((d: any) => ({ sourceType: bySource.get(d.fieldHypothesis.id)!, ...d }))] as any,
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(evidence,
		[...common.seedAvailability.fieldHypotheses.map((f: any) => f.hypothesis), ...supplemental.hypotheses],
		common.seedAvailability.identityObligations.map(({ familyId }: any) => familyId))
	const identity = { obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements }
	const materialized = materialization.materialized.map((c: any) => ({ key: c.key, treatment: c.treatment, descriptors: c.descriptors }))
	const scored = scorePaletteCandidates(materialized.map(({ treatment }: any) => treatment), identity)
	const eligible = selectSourceEligibleWinner({
		materialized, identityObligations: identity.obligations,
		identityRoleRequirements: identity.roleRequirements,
		emergency: seed.emergency, fullDomainSelection: scored,
	})
	const t = eligible.winner.treatment
	return {
		key: completeTreatmentKey(t),
		hypothesis: t.sourceFieldHypothesisId,
		gradient: t.gradient,
		supplementalCount: supplemental.treatments.length,
		materialized: materialization.materialized.length,
	}
}

function collect(dir: string) {
	return readdirSync(dir).sort()
		.filter((f) => !statSync(join(dir, f)).isDirectory())
		.filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f))
		.filter((f) => !/-(scrambled|masked|saliency|original)\./u.test(f))
		.map((f) => ({ path: join(dir, f), name: f }))
}

const files = IMAGES.includes(",") ? IMAGES.split(",").flatMap((d) => collect(d.trim())) : collect(IMAGES)
const results: any[] = []
for (const { path, name } of files) {
	try {
		const image = await loadNativeImage(path)
		const seed = buildPaletteSeedDomain(image)
		const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
		const bandLocal = common.fieldHypotheses.filter(({ sourceType }: any) => sourceType === "band-local-endpoint").length
		const shipped = selectFor(seed, common, "shipped")
		const ablated = bandLocal === 0 ? shipped : selectFor(seed, common, "no-band-local")
		const row = {
			image: name,
			bandLocalHypotheses: bandLocal,
			shipped, ablated,
			winnerChanged: shipped.key !== ablated.key,
			winnerFromDiffuse: /diffuse-field-domain/u.test(shipped.hypothesis),
			winnerFromPaired: /paired-field-domain/u.test(shipped.hypothesis),
			winnerFromTransition: /^field-transition:/u.test(shipped.hypothesis),
			winnerFromEndpointRefinement: /^endpoint-refinement:/u.test(shipped.hypothesis),
		}
		results.push(row)
		console.error(`${name}: bandLocal=${bandLocal} winnerChanged=${row.winnerChanged} shipped=${shipped.key} ablated=${ablated.key} src=${row.winnerFromDiffuse ? "diffuse" : row.winnerFromPaired ? "paired" : row.winnerFromTransition ? "transition" : "lane"}`)
	} catch (error) {
		results.push({ image: name, error: String(error) })
		console.error(`${name}: ERROR ${error}`)
	}
}
writeFileSync(join(OUT, `probe-ablation${SUFFIX}.json`), JSON.stringify(results, null, "\t"))
