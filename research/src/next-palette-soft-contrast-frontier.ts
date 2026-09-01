import { apcaContrast } from "./color.ts"
import {
	perceivePaletteImageWithConnectedFamilies,
	type ConnectedFamilyCandidateConstruction,
} from "./connected-family-palette-perception.ts"
import {
	buildConnectedFamilyPaletteRelationGraph,
	type PaletteRelationGraph,
	type PaletteRelationNode,
} from "./palette-relation-graph.ts"
import type { Palette, RawImage, RGB } from "./types.ts"

export const NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION =
	"next-palette-soft-contrast-frontier-0.1.0-development"

export const NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY = Object.freeze({
	diagnosticOnly: true,
	canonicalOutputMutationAllowed: false,
	fixedApcaFloorEntersAdmission: false,
	fixedApcaFloorEntersFrontierMembership: false,
	foregroundContrastDimensions: Object.freeze(["background", "surface"] as const),
	accentPrimaryContrastDimension: "background" as const,
	accentSecondaryContrastDimension: "surface" as const,
	generatedAlternatives: Object.freeze(["#000000", "#ffffff"] as const),
	sourceAlternativesRequireExactPixelProvenance: true,
	commentTextEntersCandidateInference: false,
	targetFamilyInferredFromCommentText: false,
})

export type SoftContrastRole = "foreground" | "accent"
export type LegacyPolicyProfile = "next-palette-0.1/0.2" | "next-palette-0.3" | "next-palette-0.4"

export type SoftContrastRelation = {
	signedLc: number
	magnitude: number
}

export type LegacyRoleOccurrenceSummary = {
	enumerated: boolean
	enumeratedTupleCount: number
	nonApcaEligibleTupleCount: number
	feasibleTupleCount: number
	roleApcaRejectedTupleCount: number
	roleApcaOnlyRejectedTupleCount: number
	bothOverlayApcaRejectedTupleCount: number
	blockedOnlyByRoleApca: boolean
}

export type SoftContrastAlternative = {
	alternativeId: string
	stableKey: string
	rgb: RGB
	hex: string
	generated: boolean
	construction: ConnectedFamilyCandidateConstruction | "generated-black" | "generated-white"
	provenance: {
		kind: "source-exact" | "generated-authorized"
		representativePixelIndex: number | null
		evidenceMaskSha256: string | null
		binIds: readonly number[]
		familyId: number | null
	}
	membership: {
		foreground: boolean
		accent: boolean
		field: boolean
	}
	evidence: {
		population: number
		text: number
		saliency: number
		spatialDetail: number
		familyDetail: number
		chroma: number
		foreground: {
			text: number
			saliency: number
			detail: number
			population: number
			support: number
		}
		accent: {
			chroma: number
			saliency: number
			detail: number
			population: number
			support: number
		}
	}
	contrast: {
		onBackground: SoftContrastRelation
		onSurface: SoftContrastRelation
	}
	canonicalRoleMatch: {
		foreground: boolean
		accent: boolean
	}
	legacyPolicy: Record<LegacyPolicyProfile, {
		foreground: LegacyRoleOccurrenceSummary | null
		accent: LegacyRoleOccurrenceSummary | null
	}>
	frontier: Record<SoftContrastRole, {
		member: boolean
		dominatedBy: readonly string[]
	}>
}

export type NextPaletteSoftContrastFrontier = {
	schemaVersion: 1
	diagnosticVersion: typeof NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION
	policy: typeof NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY
	canonical: {
		roles: {
			background: Palette["background"]
			foreground: Palette["foreground"]
			surface: Palette["surface"]
			accent: Palette["accent"]
		}
		gradient: Palette["gradient"]
		contrast: {
			foregroundOnBackground: SoftContrastRelation
			foregroundOnSurface: SoftContrastRelation
			accentOnBackground: SoftContrastRelation
			accentOnSurface: SoftContrastRelation
		}
	}
	perception: {
		version: string
		relationGraphVersion: string
		candidateCount: number
		fieldCandidateCount: number
		connectedFamilyReserveCount: number
	}
	alternatives: readonly SoftContrastAlternative[]
	frontiers: Record<SoftContrastRole, readonly string[]>
}

type MutableRoleSummary = Omit<LegacyRoleOccurrenceSummary, "blockedOnlyByRoleApca">
type LegacySummaryPair = { foreground: MutableRoleSummary; accent: MutableRoleSummary }

type LegacyProfileDefinition = {
	name: LegacyPolicyProfile
	nodes: readonly PaletteRelationNode[]
	fieldNodes: readonly PaletteRelationNode[]
	requiredFields: readonly ("background" | "surface")[]
	foregroundMinimumLc: number
	accentMinimumLc: number
	stateModel: "flat-gradient" | "relation-state"
}

const epsilon = 1e-12

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + clamp01(value), 0) / values.length
}

function relation(foreground: RGB, background: RGB): SoftContrastRelation {
	const signedLc = apcaContrast(foreground, background)
	if (!Number.isFinite(signedLc)) throw new Error("Soft contrast diagnostic produced non-finite APCA")
	return { signedLc, magnitude: Math.abs(signedLc) }
}

function passesSignedApca(lc: number, minimumMagnitude: number): boolean {
	return lc >= minimumMagnitude || lc <= -minimumMagnitude
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function emptySummary(enumerated: boolean): MutableRoleSummary {
	return {
		enumerated,
		enumeratedTupleCount: 0,
		nonApcaEligibleTupleCount: 0,
		feasibleTupleCount: 0,
		roleApcaRejectedTupleCount: 0,
		roleApcaOnlyRejectedTupleCount: 0,
		bothOverlayApcaRejectedTupleCount: 0,
	}
}

function finalizeSummary(summary: MutableRoleSummary): LegacyRoleOccurrenceSummary {
	return {
		...summary,
		blockedOnlyByRoleApca: summary.enumerated && summary.feasibleTupleCount === 0 &&
			summary.roleApcaOnlyRejectedTupleCount > 0,
	}
}

function legacyProfileDefinitions(graph: PaletteRelationGraph): LegacyProfileDefinition[] {
	const nonReserveNodes = graph.nodes.filter((node) => node.construction !== "connected-family-reserve")
	const relationFieldIds = new Set(graph.fieldNodeIds)
	return [
		{
			name: "next-palette-0.1/0.2",
			nodes: nonReserveNodes,
			fieldNodes: nonReserveNodes.filter((node) => !node.typographyOnly),
			requiredFields: ["background", "surface"],
			foregroundMinimumLc: 60,
			accentMinimumLc: 10,
			stateModel: "flat-gradient",
		},
		{
			name: "next-palette-0.3",
			nodes: nonReserveNodes,
			fieldNodes: nonReserveNodes.filter((node) => relationFieldIds.has(node.id)),
			requiredFields: ["background"],
			foregroundMinimumLc: 60,
			accentMinimumLc: 10,
			stateModel: "relation-state",
		},
		{
			name: "next-palette-0.4",
			nodes: graph.nodes,
			fieldNodes: graph.nodes.filter((node) => relationFieldIds.has(node.id)),
			requiredFields: ["background"],
			foregroundMinimumLc: 60,
			accentMinimumLc: 10,
			stateModel: "relation-state",
		},
	]
}

function analyzeLegacyProfile(
	profile: LegacyProfileDefinition,
	allNodes: readonly PaletteRelationNode[],
): Map<number, LegacySummaryPair> {
	const profileNodeIds = new Set(profile.nodes.map((node) => node.id))
	const summaries = new Map(allNodes.map((node) => [node.id, {
		foreground: emptySummary(profileNodeIds.has(node.id)),
		accent: emptySummary(profileNodeIds.has(node.id)),
	}]))
	const contrastPass = (
		role: SoftContrastRole,
		overlay: PaletteRelationNode,
		background: PaletteRelationNode,
		surface: PaletteRelationNode,
	): boolean => {
		const fields = { background, surface }
		const minimum = role === "foreground" ? profile.foregroundMinimumLc : profile.accentMinimumLc
		return profile.requiredFields.every((field) => passesSignedApca(
			apcaContrast(overlay.rgb, fields[field].rgb),
			minimum,
		))
	}

	for (const background of profile.fieldNodes) {
		for (const surface of profile.fieldNodes) {
			const collapsed = background.id === surface.id
			const states = collapsed ? ["collapsed"] : ["distinct-flat", "gradient"]
			const fieldDistance = Math.hypot(
				background.lab[0] - surface.lab[0],
				background.lab[1] - surface.lab[1],
				background.lab[2] - surface.lab[2],
			)
			for (const foreground of profile.nodes) {
				const foregroundPass = contrastPass("foreground", foreground, background, surface)
				for (const accent of profile.nodes) {
					const accentPass = contrastPass("accent", accent, background, surface)
					const accentBackgroundDistance = Math.hypot(
						accent.lab[0] - background.lab[0],
						accent.lab[1] - background.lab[1],
						accent.lab[2] - background.lab[2],
					)
					const accentSurfaceDistance = Math.hypot(
						accent.lab[0] - surface.lab[0],
						accent.lab[1] - surface.lab[1],
						accent.lab[2] - surface.lab[2],
					)
					for (const state of states) {
						const foregroundSummary = summaries.get(foreground.id)!.foreground
						const accentSummary = summaries.get(accent.id)!.accent
						foregroundSummary.enumeratedTupleCount++
						accentSummary.enumeratedTupleCount++
						const fieldPass = collapsed || state === "gradient"
							? collapsed || fieldDistance > epsilon
							: fieldDistance >= 0.025
						const profileFieldPass = profile.stateModel === "flat-gradient"
							? collapsed || fieldDistance >= 0.025
							: fieldPass
						const nonApcaPass = profileFieldPass && accentBackgroundDistance >= 0.025 &&
							accentSurfaceDistance >= 0.025 && new Set([
								rgbKey(background.rgb), rgbKey(foreground.rgb), rgbKey(surface.rgb), rgbKey(accent.rgb),
							]).size <= 4
						if (!nonApcaPass) continue
						foregroundSummary.nonApcaEligibleTupleCount++
						accentSummary.nonApcaEligibleTupleCount++
						if (foregroundPass && accentPass) {
							foregroundSummary.feasibleTupleCount++
							accentSummary.feasibleTupleCount++
							continue
						}
						if (!foregroundPass) foregroundSummary.roleApcaRejectedTupleCount++
						if (!accentPass) accentSummary.roleApcaRejectedTupleCount++
						if (!foregroundPass && accentPass) foregroundSummary.roleApcaOnlyRejectedTupleCount++
						if (foregroundPass && !accentPass) accentSummary.roleApcaOnlyRejectedTupleCount++
						if (!foregroundPass && !accentPass) {
							foregroundSummary.bothOverlayApcaRejectedTupleCount++
							accentSummary.bothOverlayApcaRejectedTupleCount++
						}
					}
				}
			}
		}
	}
	return summaries
}

function dominates(first: readonly number[], second: readonly number[]): boolean {
	let stronger = false
	for (let index = 0; index < first.length; index++) {
		if (first[index] < second[index] - epsilon) return false
		if (first[index] > second[index] + epsilon) stronger = true
	}
	return stronger
}

function frontierDimensions(alternative: SoftContrastAlternative, role: SoftContrastRole): readonly number[] {
	const sourceExact = alternative.generated ? 0 : 1
	if (role === "foreground") {
		return [
			alternative.contrast.onBackground.magnitude,
			alternative.contrast.onSurface.magnitude,
			alternative.evidence.foreground.text,
			alternative.evidence.foreground.saliency,
			alternative.evidence.foreground.detail,
			alternative.evidence.foreground.population,
			sourceExact,
		]
	}
	return [
		alternative.contrast.onBackground.magnitude,
		alternative.evidence.accent.chroma,
		alternative.evidence.accent.saliency,
		alternative.evidence.accent.detail,
		alternative.evidence.accent.population,
		sourceExact,
	]
}

function applyFrontiers(alternatives: SoftContrastAlternative[]): Record<SoftContrastRole, readonly string[]> {
	const output = {} as Record<SoftContrastRole, readonly string[]>
	for (const role of ["foreground", "accent"] as const) {
		for (const alternative of alternatives) {
			const dimensions = frontierDimensions(alternative, role)
			const dominatedBy = alternatives.filter((other) => other.alternativeId !== alternative.alternativeId &&
				dominates(frontierDimensions(other, role), dimensions)).map((other) => other.alternativeId).sort(compareAscii)
			alternative.frontier[role] = { member: dominatedBy.length === 0, dominatedBy }
		}
		output[role] = alternatives.filter((alternative) => alternative.frontier[role].member)
			.sort((first, second) => role === "accent"
				? second.contrast.onSurface.magnitude - first.contrast.onSurface.magnitude ||
					compareAscii(first.stableKey, second.stableKey)
				: compareAscii(first.stableKey, second.stableKey))
			.map((alternative) => alternative.alternativeId)
	}
	return output
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function buildNextPaletteSoftContrastFrontier(
	image: RawImage,
	canonicalPalette: Palette,
): NextPaletteSoftContrastFrontier {
	const perception = perceivePaletteImageWithConnectedFamilies(image)
	const graph = buildConnectedFamilyPaletteRelationGraph(perception)
	const records = new Map(perception.candidateRecords.map((record) => [record.candidateId, record]))
	const fieldIds = new Set(graph.fieldNodeIds)
	const maximumPopulation = Math.max(...graph.nodes.map((node) => node.population))
	const maximumChroma = Math.max(...graph.nodes.map((node) => node.chroma), epsilon)
	const legacy = Object.fromEntries(legacyProfileDefinitions(graph).map((profile) => [
		profile.name,
		analyzeLegacyProfile(profile, graph.nodes),
	])) as Record<LegacyPolicyProfile, Map<number, LegacySummaryPair>>

	const alternatives: SoftContrastAlternative[] = graph.nodes.map((node) => {
		const record = records.get(node.id)
		if (!record || node.candidate.generated) throw new Error(`Soft contrast source candidate ${node.id} lacks provenance`)
		const population = clamp01(Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)))
		const spatialDetail = clamp01(node.spatial.detail)
		const familyDetail = clamp01(node.familySpatial.detail)
		const detail = Math.max(spatialDetail, familyDetail)
		const foregroundEvidence = {
			text: clamp01(node.text),
			saliency: clamp01(node.saliency),
			detail,
			population,
			support: mean([node.text, node.saliency, node.spatial.detail, node.familySpatial.detail, population]),
		}
		const accentEvidence = {
			chroma: clamp01(node.chroma / maximumChroma),
			saliency: clamp01(node.saliency),
			detail,
			population,
			support: mean([node.chroma / maximumChroma, node.saliency, detail, population]),
		}
		return {
			alternativeId: `source-${node.id}`,
			stableKey: node.stableKey,
			rgb: node.rgb,
			hex: node.hex,
			generated: false,
			construction: node.construction ?? (node.typographyOnly ? "light-typography" : "lloyd-cluster"),
			provenance: {
				kind: "source-exact",
				representativePixelIndex: record.representativePixelIndex,
				evidenceMaskSha256: node.evidenceMaskSha256 ?? null,
				binIds: [...record.binIds],
				familyId: node.familyId,
			},
			membership: { foreground: true, accent: true, field: fieldIds.has(node.id) },
			evidence: {
				population: node.population,
				text: node.text,
				saliency: node.saliency,
				spatialDetail,
				familyDetail,
				chroma: node.chroma,
				foreground: foregroundEvidence,
				accent: accentEvidence,
			},
			contrast: {
				onBackground: relation(node.rgb, canonicalPalette.background.rgb),
				onSurface: relation(node.rgb, canonicalPalette.surface.rgb),
			},
			canonicalRoleMatch: {
				foreground: rgbKey(node.rgb) === rgbKey(canonicalPalette.foreground.rgb) &&
					node.candidate.generated === canonicalPalette.foreground.generated,
				accent: rgbKey(node.rgb) === rgbKey(canonicalPalette.accent.rgb) &&
					node.candidate.generated === canonicalPalette.accent.generated,
			},
			legacyPolicy: Object.fromEntries((Object.keys(legacy) as LegacyPolicyProfile[]).map((profile) => {
				const summary = legacy[profile].get(node.id)!
				return [profile, {
					foreground: finalizeSummary(summary.foreground),
					accent: finalizeSummary(summary.accent),
				}]
			})) as SoftContrastAlternative["legacyPolicy"],
			frontier: {
				foreground: { member: false, dominatedBy: [] },
				accent: { member: false, dominatedBy: [] },
			},
		}
	})

	for (const [id, rgb] of [["generated-black", [0, 0, 0]], ["generated-white", [255, 255, 255]]] as const) {
		alternatives.push({
			alternativeId: id,
			stableKey: `${id}:${rgbKey(rgb)}`,
			rgb,
			hex: id === "generated-black" ? "#000000" : "#ffffff",
			generated: true,
			construction: id,
			provenance: {
				kind: "generated-authorized",
				representativePixelIndex: null,
				evidenceMaskSha256: null,
				binIds: [],
				familyId: null,
			},
			membership: { foreground: true, accent: true, field: false },
			evidence: {
				population: 0,
				text: 0,
				saliency: 0,
				spatialDetail: 0,
				familyDetail: 0,
				chroma: 0,
				foreground: { text: 0, saliency: 0, detail: 0, population: 0, support: 0 },
				accent: { chroma: 0, saliency: 0, detail: 0, population: 0, support: 0 },
			},
			contrast: {
				onBackground: relation(rgb, canonicalPalette.background.rgb),
				onSurface: relation(rgb, canonicalPalette.surface.rgb),
			},
			canonicalRoleMatch: {
				foreground: rgbKey(rgb) === rgbKey(canonicalPalette.foreground.rgb) && canonicalPalette.foreground.generated,
				accent: rgbKey(rgb) === rgbKey(canonicalPalette.accent.rgb) && canonicalPalette.accent.generated,
			},
			legacyPolicy: Object.fromEntries((Object.keys(legacy) as LegacyPolicyProfile[]).map((profile) => [
				profile,
				{ foreground: null, accent: null },
			])) as SoftContrastAlternative["legacyPolicy"],
			frontier: {
				foreground: { member: false, dominatedBy: [] },
				accent: { member: false, dominatedBy: [] },
			},
		})
	}
	alternatives.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const frontiers = applyFrontiers(alternatives)
	return deepFreeze({
		schemaVersion: 1,
		diagnosticVersion: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
		policy: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY,
		canonical: {
			roles: {
				background: canonicalPalette.background,
				foreground: canonicalPalette.foreground,
				surface: canonicalPalette.surface,
				accent: canonicalPalette.accent,
			},
			gradient: canonicalPalette.gradient,
			contrast: {
				foregroundOnBackground: relation(canonicalPalette.foreground.rgb, canonicalPalette.background.rgb),
				foregroundOnSurface: relation(canonicalPalette.foreground.rgb, canonicalPalette.surface.rgb),
				accentOnBackground: relation(canonicalPalette.accent.rgb, canonicalPalette.background.rgb),
				accentOnSurface: relation(canonicalPalette.accent.rgb, canonicalPalette.surface.rgb),
			},
		},
		perception: {
			version: perception.version,
			relationGraphVersion: graph.version,
			candidateCount: graph.nodes.length,
			fieldCandidateCount: graph.fieldNodeIds.length,
			connectedFamilyReserveCount: graph.nodes.filter((node) => node.construction === "connected-family-reserve").length,
		},
		alternatives,
		frontiers,
	})
}
