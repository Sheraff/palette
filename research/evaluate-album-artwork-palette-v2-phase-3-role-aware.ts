import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	extractAlbumArtworkPaletteV2Phase3Closed074,
} from "./src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY,
	buildRoleSpecificIdentityObligations,
	classifyFieldConditionalFamilyRole,
	orderRoleAwareIdentityCandidates,
	roleSpecificObligationCoverage,
} from "./src/album-artwork-palette-v2-phase-3-role-aware.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type DevelopmentSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
}>

type DevelopmentPanel = Readonly<{
	schemaVersion: number
	sourceCount: number
	sources: readonly DevelopmentSource[]
}>

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const panelPath = fileURLToPath(new URL("./data/album-artwork-palette-v2-development-panel.json", import.meta.url))
const maximumCases = 8
const maximumReportedFields = 12
const maximumReportedFamiliesPerField = 8

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function parseCaseIds(args: readonly string[]): string[] {
	invariant(args.length > 0 && args.length <= maximumCases,
		`Supply between one and ${maximumCases} development case IDs`)
	for (const caseId of args) {
		invariant(/^development-[0-9]{2}$/u.test(caseId), `Invalid development case ID ${caseId}`)
	}
	const unique = [...new Set(args)]
	invariant(unique.length === args.length, "Development case IDs must be unique")
	return unique.sort()
}

function score(value: number): number {
	return Number(value.toFixed(6))
}

async function evaluate(source: DevelopmentSource) {
	const bytes = await readFile(resolve(projectRoot, source.path))
	invariant(bytes.byteLength === source.byteCount, `Byte count mismatch for ${source.caseId}`)
	invariant(createHash("sha256").update(bytes).digest("hex") === source.sha256,
		`Source identity mismatch for ${source.caseId}`)
	const image = await loadNativeImage(bytes)
	const result = extractAlbumArtworkPaletteV2Phase3Closed074(image)
	const evidenceByField = [...result.diagnostics.fieldHypotheses]
		.sort((first, second) => second.fieldFidelity - first.fieldFidelity || first.id.localeCompare(second.id))
		.slice(0, maximumReportedFields)
		.map((field) => {
			const evidence = result.diagnostics.families
				.map((family) => classifyFieldConditionalFamilyRole(family, field))
				.filter((candidate) => !candidate.fieldOwned && candidate.observedRegionCount > 0)
				.sort((first, second) =>
					Math.max(second.foreground.score, second.accent.score) -
						Math.max(first.foreground.score, first.accent.score) ||
					first.familyId.localeCompare(second.familyId))
			return {
				fieldHypothesisId: field.id,
				kind: field.kind,
				families: evidence.slice(0, maximumReportedFamiliesPerField),
			}
		})
	const allEvidence = evidenceByField.flatMap(({ families }) => families)
	const obligations = buildRoleSpecificIdentityObligations(allEvidence)
	const ranked = orderRoleAwareIdentityCandidates(result.alternatives, obligations)
	const inputRankByTreatmentId = new Map(result.alternatives.map(({ id }, index) => [id, index + 1]))
	return {
		caseId: source.caseId,
		dimensions: { width: image.width, height: image.height },
		evidence: evidenceByField.map(({ fieldHypothesisId, kind, families }) => ({
			fieldHypothesisId,
			kind,
			families: families.map((family) => ({
				familyId: family.familyId,
				preference: family.preference,
				reason: family.reason,
				confidence: score(family.confidence),
				coherentSupport: score(family.coherentSupport),
				foregroundScore: score(family.foreground.score),
				accentScore: score(family.accent.score),
				typographyLikeGeometry: score(family.foreground.typographyLikeGeometry),
				repetition: score(family.foreground.repetition),
				polarityAgreement: score(family.foreground.polarityAgreement),
				compactness: score(family.accent.compactness),
				chroma: score(family.accent.chroma),
			})),
		})),
		obligations: obligations.map((obligation) => ({
			id: obligation.id,
			fieldHypothesisId: obligation.fieldHypothesisId,
			familyId: obligation.familyId,
			requiredRole: obligation.requiredRole,
			priority: obligation.priority,
		})),
		ranking: ranked.map((treatment, index) => {
			const coverage = roleSpecificObligationCoverage(treatment, obligations)
			return {
				rank: index + 1,
				inputRank: inputRankByTreatmentId.get(treatment.id),
				treatmentId: treatment.id,
				fieldHypothesisId: treatment.sourceFieldHypothesisId,
				foregroundFamilyId: treatment.familyRoles.foreground,
				accentFamilyId: treatment.familyRoles.accent,
				accentCollapsed: treatment.collapse.accent,
				coveredObligationIds: coverage.coveredObligationIds,
				coveredCount: coverage.coveredCount,
				roleEvidence: score(coverage.roleEvidence),
				treatmentFoundation: score(treatment.scores.treatmentFoundation),
				rankingScore: score(treatment.scores.rankingScore),
			}
		}),
	}
}

async function main(): Promise<void> {
	const caseIds = parseCaseIds(process.argv.slice(2))
	const panel = JSON.parse(await readFile(panelPath, "utf8")) as DevelopmentPanel
	invariant(panel.schemaVersion === 1 && panel.sourceCount === panel.sources.length,
		"Development panel is invalid")
	const sourceByCaseId = new Map(panel.sources.map((source) => [source.caseId, source]))
	const sources = caseIds.map((caseId) => {
		const source = sourceByCaseId.get(caseId)
		invariant(source !== undefined, `Development case is not in the panel: ${caseId}`)
		return source
	})
	const cases = []
	for (const source of sources) cases.push(await evaluate(source))
	process.stdout.write(`${JSON.stringify({
		schemaVersion: 1,
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_ID,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY,
		caseCount: cases.length,
		cases,
	}, null, 2)}\n`)
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
