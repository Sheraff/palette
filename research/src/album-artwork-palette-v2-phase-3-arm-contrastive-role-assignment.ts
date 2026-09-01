import type {
	ColorFamilyEvidence,
	CompletePaletteTreatment,
	ComponentEvidence,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM_ID =
	"album-artwork-palette-v2-phase-3-contrastive-role-assignment-arm-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY = Object.freeze({
	maximumJointAssignments: 16,
	maximumRunsPerFamily: 8,
	minimumRunComponents: 4,
	minimumComponentPopulation: 4,
	maximumComponentBoundsFraction: 0.08,
	maximumSeedScaleRatio: 3,
	maximumSeedResidualInScales: 0.65,
	maximumAlongAxisGapInScales: 4.5,
	maximumAlignmentResidual: 0.35,
	minimumScaleConsistency: 0.55,
	minimumAlongAxisSpanInScales: 2,
	minimumSpacingConsistency: 0.20,
	minimumGlyphDiversity: 0.15,
	minimumSourceContrast: 0.04,
	minimumSourceSupport: 0.38,
	minimumPolarityConsistency: 0.84,
	minimumComponentPolarity: 0.45,
	minimumFieldContrast: 0.08,
	minimumFieldDirectionConsistency: 0.75,
	connectedWordmark: Object.freeze({
		minimumElongation: 3.2,
		minimumImageSpan: 0.10,
		maximumBoundsFraction: 0.06,
		minimumFill: 0.08,
		maximumFill: 0.70,
		minimumTypographyGeometry: 0.55,
		minimumSourceContrast: 0.04,
		minimumSourceSupport: 0.45,
		minimumPolarity: 0.70,
		maximumBorderContact: 0.20,
	}),
	decorativeMarks: Object.freeze({
		minimumComponents: 3,
		maximumBoundsFraction: 0.015,
		minimumScaleConsistency: 0.60,
		minimumRepetition: 0.70,
		minimumSignatureObservation: 0.45,
		minimumSignatureScore: 0.40,
		minimumSourceContrast: 0.04,
		minimumSourceSupport: 0.35,
	}),
	levels: Object.freeze({
		alignmentQuality: Object.freeze([0.50, 0.65, 0.78, 0.90]),
		scaleConsistency: Object.freeze([0.55, 0.65, 0.76, 0.88]),
		alongAxisSpan: Object.freeze([2, 3, 5, 8]),
		spacingConsistency: Object.freeze([0.20, 0.32, 0.50, 0.72]),
		glyphDiversity: Object.freeze([0.15, 0.25, 0.40, 0.58]),
		sourceContrast: Object.freeze([0.04, 0.055, 0.075, 0.11]),
		sourceSupport: Object.freeze([0.38, 0.50, 0.65, 0.80]),
		polarityConsistency: Object.freeze([0.84, 0.90, 0.95, 0.985]),
		componentCount: Object.freeze([1, 4, 6, 9]),
		signatureObservation: Object.freeze([0.45, 0.60, 0.72, 0.82]),
		signatureScore: Object.freeze([0.40, 0.54, 0.68, 0.80]),
		repetition: Object.freeze([0.70, 0.80, 0.90, 0.97]),
		accentStructure: Object.freeze([0.55, 0.65, 0.76, 0.88]),
	}),
	foregroundAuthorityOrder: Object.freeze([
		"polarityConsistency",
		"alignmentQuality",
		"scaleConsistency",
		"alongAxisSpan",
		"spacingConsistency",
		"sourceContrast",
		"sourceSupport",
		"glyphDiversity",
		"componentCount",
	] as const),
	accentAuthorityOrder: Object.freeze([
		"sourceContrast",
		"sourceSupport",
		"signatureObservation",
		"signatureScore",
		"repetition",
		"structure",
	] as const),
} as const)

export type AlbumArtworkPaletteV2Phase3GlyphRunKind =
	"disconnected-glyph-run" | "connected-wordmark"

export type AlbumArtworkPaletteV2Phase3GlyphRunOrientation =
	"horizontal" | "vertical" | "rotated"

export type AlbumArtworkPaletteV2Phase3ForegroundAuthorityLevels = Readonly<{
	polarityConsistency: number
	alignmentQuality: number
	scaleConsistency: number
	alongAxisSpan: number
	spacingConsistency: number
	sourceContrast: number
	sourceSupport: number
	glyphDiversity: number
	componentCount: number
}>

export type AlbumArtworkPaletteV2Phase3AccentAuthorityLevels = Readonly<{
	signatureObservation: number
	signatureScore: number
	sourceContrast: number
	sourceSupport: number
	repetition: number
	structure: number
}>

export type AlbumArtworkPaletteV2Phase3GlyphRunEvidence = Readonly<{
	familyId: string
	kind: AlbumArtworkPaletteV2Phase3GlyphRunKind
	orientation: AlbumArtworkPaletteV2Phase3GlyphRunOrientation
	angleDegrees: number
	componentIds: readonly string[]
	componentCount: number
	alignmentResidual: number
	scaleConsistency: number
	alongAxisSpanInScales: number
	spacingConsistency: number
	glyphDiversity: number
	sourceContrast: number
	sourceSupport: number
	polarity: number
	polarityConsistency: number
	fieldDirection: number
	fieldDirectionConsistency: number
	fieldContrast: number
	fieldPolarityAgrees: boolean
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3GlyphRunRejectionReason[]
	authorityLevels: AlbumArtworkPaletteV2Phase3ForegroundAuthorityLevels
	authority: readonly number[]
}>

export type AlbumArtworkPaletteV2Phase3GlyphRunRejectionReason =
	"too-few-components" |
	"weak-alignment" |
	"inconsistent-scale" |
	"short-along-axis-span" |
	"irregular-spacing" |
	"insufficient-glyph-diversity" |
	"weak-source-contrast" |
	"weak-source-support" |
	"inconsistent-polarity" |
	"weak-component-polarity" |
	"weak-field-contrast" |
	"inconsistent-field-direction" |
	"field-polarity-disagreement" |
	"unsupported-connected-wordmark"

export type AlbumArtworkPaletteV2Phase3AccentEvidenceKind =
	"decorative-marks" | "secondary-glyph-run"

export type AlbumArtworkPaletteV2Phase3AccentEvidence = Readonly<{
	familyId: string
	kind: AlbumArtworkPaletteV2Phase3AccentEvidenceKind
	componentIds: readonly string[]
	componentCount: number
	achromatic: boolean
	signatureObservation: number
	signatureScore: number
	sourceContrast: number
	sourceSupport: number
	repetition: number
	structure: number
	authorityLevels: AlbumArtworkPaletteV2Phase3AccentAuthorityLevels
	authority: readonly number[]
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveFamilyRoleEvidence = Readonly<{
	familyId: string
	fieldOwned: boolean
	glyphRuns: readonly AlbumArtworkPaletteV2Phase3GlyphRunEvidence[]
	foreground: AlbumArtworkPaletteV2Phase3GlyphRunEvidence | null
	accent: AlbumArtworkPaletteV2Phase3AccentEvidence | null
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveMaterializedCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveJointAssignment<
	TCandidate extends AlbumArtworkPaletteV2Phase3ContrastiveMaterializedCandidate,
> = Readonly<{
	key: string
	foregroundFamilyId: string
	accentFamilyId: string
	foregroundEvidence: AlbumArtworkPaletteV2Phase3GlyphRunEvidence
	accentEvidence: AlbumArtworkPaletteV2Phase3AccentEvidence
	authority: readonly number[]
	candidates: readonly TCandidate[]
	treatmentKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDecision = Readonly<{
	status: "authoritative" | "incumbent-authoritative" | "abstained"
	reason:
		"unique-joint-assignment-authority" |
		"incumbent-already-authoritative" |
		"no-complete-contrastive-candidates" |
		"weak-foreground-evidence" |
		"weak-accent-evidence" |
		"tied-joint-assignment-authority"
	authoritativeAssignmentKey: string | null
	foregroundFamilyId: string | null
	accentFamilyId: string | null
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM_ID
	evidenceAuthority: "named-levels-lexicographic"
	coreEvidence: Readonly<{
		componentBounds: "axis-aligned"
		componentRetention: "bounded-role-observation-subset"
		orientationBasis: "retained-component-centers"
		glyphContoursAvailable: false
	}>
	domain: Readonly<{
		inputMaterializedCandidateCount: number
		contrastiveCandidateCount: number
		completeDistinctRoleCandidateCount: number
		availableJointAssignmentCount: number
		boundedJointAssignmentCount: number
		maximumJointAssignments: number
		candidateCountChanged: false
		materializedArrayPreserved: true
	}>
	incumbent: Readonly<{
		key: string
		fieldHypothesisId: string
		foregroundFamilyId: string
		accentFamilyId: string
	}>
	decision: AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDecision
}>

export type AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArmResult<
	TCandidate extends AlbumArtworkPaletteV2Phase3ContrastiveMaterializedCandidate,
> = Readonly<{
	incumbent: TCandidate
	materialized: readonly TCandidate[]
	contrastiveCandidates: readonly TCandidate[]
	roleEvidence: readonly AlbumArtworkPaletteV2Phase3ContrastiveFamilyRoleEvidence[]
	assignments: readonly AlbumArtworkPaletteV2Phase3ContrastiveJointAssignment<TCandidate>[]
	authoritativeCandidates: readonly TCandidate[]
	decision: AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDecision
	diagnostics: AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDiagnostics
}>

type PositionedComponent = Readonly<{
	component: ComponentEvidence
	x: number
	y: number
	width: number
	height: number
	scale: number
}>

type Axis = Readonly<{ x: number; y: number }>

type FieldPolarity = Readonly<{
	direction: number
	consistency: number
	contrast: number
}>

const EPSILON = 1e-12

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function levelAtLeast(value: number, thresholds: readonly number[]): number {
	return thresholds.reduce((level, threshold) => level + Number(value + EPSILON >= threshold), 0)
}

function compareAuthority(first: readonly number[], second: readonly number[]): number {
	for (let index = 0; index < Math.max(first.length, second.length); index++) {
		const comparison = compareDescending(first[index] ?? 0, second[index] ?? 0)
		if (comparison !== 0) return comparison
	}
	return 0
}

function lowerQuartile(values: readonly number[]): number {
	if (values.length === 0) return 0
	const sorted = values.map((value) => Number.isFinite(value) ? value : 0).sort((a, b) => a - b)
	return sorted[Math.floor((sorted.length - 1) * 0.25)]
}

function median(values: readonly number[]): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function positioned(component: ComponentEvidence): PositionedComponent {
	const width = component.maxX - component.minX + 1
	const height = component.maxY - component.minY + 1
	return {
		component,
		x: (component.minX + component.maxX) / 2,
		y: (component.minY + component.maxY) / 2,
		width,
		height,
		scale: Math.sqrt(Math.max(1, width * height)),
	}
}

function roleComponents(family: ColorFamilyEvidence): PositionedComponent[] {
	return family.components
		.filter(({ population, retainedFor, observation }) =>
			population >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.minimumComponentPopulation &&
			retainedFor.includes("role-observation") &&
			observation.boundsFraction <=
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.maximumComponentBoundsFraction)
		.map(positioned)
		.sort((first, second) => compareAscii(first.component.id, second.component.id))
}

function canonicalAxis(x: number, y: number): Axis | null {
	const magnitude = Math.hypot(x, y)
	if (magnitude <= EPSILON) return null
	let normalizedX = x / magnitude
	let normalizedY = y / magnitude
	if (normalizedX < -EPSILON || (Math.abs(normalizedX) <= EPSILON && normalizedY < 0)) {
		normalizedX *= -1
		normalizedY *= -1
	}
	return { x: normalizedX, y: normalizedY }
}

function fittedAxis(components: readonly PositionedComponent[]): Axis {
	const meanX = components.reduce((sum, component) => sum + component.x, 0) / components.length
	const meanY = components.reduce((sum, component) => sum + component.y, 0) / components.length
	let xx = 0
	let xy = 0
	let yy = 0
	for (const component of components) {
		const x = component.x - meanX
		const y = component.y - meanY
		xx += x * x
		xy += x * y
		yy += y * y
	}
	const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
	return canonicalAxis(Math.cos(angle), Math.sin(angle)) ?? { x: 1, y: 0 }
}

function axisAngleDegrees(axis: Axis): number {
	return Math.atan2(axis.y, axis.x) * 180 / Math.PI
}

function orientation(angleDegrees: number): AlbumArtworkPaletteV2Phase3GlyphRunOrientation {
	const absolute = Math.abs(angleDegrees)
	return absolute <= 12 ? "horizontal" : absolute >= 78 ? "vertical" : "rotated"
}

function projectedSize(component: PositionedComponent, axis: Axis): number {
	return Math.abs(axis.x) * component.width + Math.abs(axis.y) * component.height
}

function fieldPolarity(family: ColorFamilyEvidence, fieldLightnesses: readonly number[]): FieldPolarity {
	const deltas = fieldLightnesses
		.filter(Number.isFinite)
		.map((lightness) => lightness - family.prototype[0])
	if (deltas.length === 0) return { direction: 0, consistency: 0, contrast: 0 }
	const signed = deltas.reduce((sum, value) => sum + value, 0)
	const magnitude = deltas.reduce((sum, value) => sum + Math.abs(value), 0)
	return {
		direction: magnitude <= EPSILON ? 0 : signed / magnitude,
		consistency: magnitude <= EPSILON ? 0 : Math.abs(signed) / magnitude,
		contrast: Math.min(...deltas.map(Math.abs)),
	}
}

function foregroundAuthorityLevels(values: Readonly<{
	alignmentResidual: number
	scaleConsistency: number
	alongAxisSpanInScales: number
	spacingConsistency: number
	glyphDiversity: number
	sourceContrast: number
	sourceSupport: number
	polarityConsistency: number
	componentCount: number
}>): AlbumArtworkPaletteV2Phase3ForegroundAuthorityLevels {
	const levels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.levels
	return {
		polarityConsistency: levelAtLeast(values.polarityConsistency, levels.polarityConsistency),
		alignmentQuality: levelAtLeast(1 - values.alignmentResidual, levels.alignmentQuality),
		scaleConsistency: levelAtLeast(values.scaleConsistency, levels.scaleConsistency),
		alongAxisSpan: levelAtLeast(values.alongAxisSpanInScales, levels.alongAxisSpan),
		spacingConsistency: levelAtLeast(values.spacingConsistency, levels.spacingConsistency),
		sourceContrast: levelAtLeast(values.sourceContrast, levels.sourceContrast),
		sourceSupport: levelAtLeast(values.sourceSupport, levels.sourceSupport),
		glyphDiversity: levelAtLeast(values.glyphDiversity, levels.glyphDiversity),
		componentCount: levelAtLeast(values.componentCount, levels.componentCount),
	}
}

function foregroundAuthority(
	levels: AlbumArtworkPaletteV2Phase3ForegroundAuthorityLevels,
): readonly number[] {
	return ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.foregroundAuthorityOrder
		.map((axis) => levels[axis])
}

function evaluateDisconnectedRun(
	family: ColorFamilyEvidence,
	components: readonly PositionedComponent[],
	fieldLightnesses: readonly number[],
): AlbumArtworkPaletteV2Phase3GlyphRunEvidence {
	const axis = fittedAxis(components)
	const normal = { x: -axis.y, y: axis.x }
	const meanNormal = components.reduce((sum, component) =>
		sum + component.x * normal.x + component.y * normal.y, 0) / components.length
	const crossSizes = components.map((component) => projectedSize(component, normal))
	const medianCrossSize = Math.max(1, median(crossSizes))
	const residual = Math.sqrt(components.reduce((sum, component) => {
		const value = component.x * normal.x + component.y * normal.y - meanNormal
		return sum + value * value
	}, 0) / components.length) / medianCrossSize
	const scaleConsistency = Math.min(...crossSizes) / Math.max(...crossSizes)
	const along = components.map((component) => ({
		component,
		center: component.x * axis.x + component.y * axis.y,
		size: projectedSize(component, axis),
	})).sort((first, second) => first.center - second.center ||
		compareAscii(first.component.component.id, second.component.component.id))
	const extentStart = Math.min(...along.map(({ center, size }) => center - size / 2))
	const extentEnd = Math.max(...along.map(({ center, size }) => center + size / 2))
	const span = (extentEnd - extentStart) / medianCrossSize
	const gaps = along.slice(1).map((item, index) => item.center - along[index].center)
	const spacingConsistency = gaps.length === 0 || Math.max(...gaps) <= EPSILON
		? 0
		: Math.min(...gaps) / Math.max(...gaps)
	const alongSizes = along.map(({ size }) => size)
	const fills = components.map(({ component }) => component.observation.fill)
	const populations = components.map(({ component }) => component.population)
	const glyphDiversity = Math.max(
		1 - Math.min(...alongSizes) / Math.max(...alongSizes),
		Math.max(...fills) - Math.min(...fills),
		1 - Math.min(...populations) / Math.max(...populations),
	)
	const sourceContrast = lowerQuartile(components.map(({ component }) =>
		component.observation.boundaryLightnessContrast))
	const sourceSupport = lowerQuartile(components.map(({ component }) =>
		component.observation.foregroundTypography.sourceSupport))
	const componentPolarities = components.map(({ component }) =>
		component.observation.boundaryLightnessPolarity)
	const polarityMagnitude = componentPolarities.reduce((sum, value) => sum + Math.abs(value), 0)
	const polaritySigned = componentPolarities.reduce((sum, value) => sum + value, 0)
	const polarity = polarityMagnitude <= EPSILON ? 0 : polaritySigned / polarityMagnitude
	const polarityConsistency = Math.abs(polarity)
	const minimumComponentPolarity = lowerQuartile(componentPolarities.map(Math.abs))
	const field = fieldPolarity(family, fieldLightnesses)
	const fieldPolarityAgrees = polarity * field.direction > 0
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY
	const rejectionReasons: AlbumArtworkPaletteV2Phase3GlyphRunRejectionReason[] = []
	if (components.length < policy.minimumRunComponents) rejectionReasons.push("too-few-components")
	if (residual > policy.maximumAlignmentResidual) rejectionReasons.push("weak-alignment")
	if (scaleConsistency < policy.minimumScaleConsistency) rejectionReasons.push("inconsistent-scale")
	if (span < policy.minimumAlongAxisSpanInScales) rejectionReasons.push("short-along-axis-span")
	if (spacingConsistency < policy.minimumSpacingConsistency) rejectionReasons.push("irregular-spacing")
	if (glyphDiversity < policy.minimumGlyphDiversity) rejectionReasons.push("insufficient-glyph-diversity")
	if (sourceContrast < policy.minimumSourceContrast) rejectionReasons.push("weak-source-contrast")
	if (sourceSupport < policy.minimumSourceSupport) rejectionReasons.push("weak-source-support")
	if (polarityConsistency < policy.minimumPolarityConsistency) rejectionReasons.push("inconsistent-polarity")
	if (minimumComponentPolarity < policy.minimumComponentPolarity) rejectionReasons.push("weak-component-polarity")
	if (field.contrast < policy.minimumFieldContrast) rejectionReasons.push("weak-field-contrast")
	if (field.consistency < policy.minimumFieldDirectionConsistency) {
		rejectionReasons.push("inconsistent-field-direction")
	}
	if (!fieldPolarityAgrees) rejectionReasons.push("field-polarity-disagreement")
	const authorityLevels = foregroundAuthorityLevels({
		alignmentResidual: residual,
		scaleConsistency,
		alongAxisSpanInScales: span,
		spacingConsistency,
		glyphDiversity,
		sourceContrast,
		sourceSupport,
		polarityConsistency,
		componentCount: components.length,
	})
	const angleDegrees = axisAngleDegrees(axis)
	return {
		familyId: family.id,
		kind: "disconnected-glyph-run",
		orientation: orientation(angleDegrees),
		angleDegrees,
		componentIds: components.map(({ component }) => component.id).sort(compareAscii),
		componentCount: components.length,
		alignmentResidual: residual,
		scaleConsistency,
		alongAxisSpanInScales: span,
		spacingConsistency,
		glyphDiversity,
		sourceContrast,
		sourceSupport,
		polarity,
		polarityConsistency,
		fieldDirection: field.direction,
		fieldDirectionConsistency: field.consistency,
		fieldContrast: field.contrast,
		fieldPolarityAgrees,
		eligible: rejectionReasons.length === 0,
		rejectionReasons,
		authorityLevels,
		authority: foregroundAuthority(authorityLevels),
	}
}

function evaluateConnectedWordmark(
	family: ColorFamilyEvidence,
	position: PositionedComponent,
	fieldLightnesses: readonly number[],
	width: number,
	height: number,
): AlbumArtworkPaletteV2Phase3GlyphRunEvidence {
	const { component } = position
	const observation = component.observation
	const horizontal = position.width >= position.height
	const axis: Axis = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }
	const angleDegrees = axisAngleDegrees(axis)
	const imageSpan = Math.max(position.width / Math.max(1, width), position.height / Math.max(1, height))
	const sourceContrast = observation.boundaryLightnessContrast
	const sourceSupport = observation.foregroundTypography.sourceSupport
	const polarity = observation.boundaryLightnessPolarity
	const polarityConsistency = Math.abs(polarity)
	const field = fieldPolarity(family, fieldLightnesses)
	const fieldPolarityAgrees = polarity * field.direction > 0
	const shapeEvidence = clamp((observation.elongation - 1) / 6)
	const wordmark = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.connectedWordmark
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY
	const supported = observation.elongation >= wordmark.minimumElongation &&
		imageSpan >= wordmark.minimumImageSpan &&
		observation.boundsFraction <= wordmark.maximumBoundsFraction &&
		observation.fill >= wordmark.minimumFill && observation.fill <= wordmark.maximumFill &&
		observation.foregroundTypography.geometry >= wordmark.minimumTypographyGeometry &&
		sourceContrast >= wordmark.minimumSourceContrast &&
		sourceSupport >= wordmark.minimumSourceSupport &&
		Math.abs(polarity) >= wordmark.minimumPolarity &&
		observation.borderContact <= wordmark.maximumBorderContact
	const rejectionReasons: AlbumArtworkPaletteV2Phase3GlyphRunRejectionReason[] = []
	if (!supported) rejectionReasons.push("unsupported-connected-wordmark")
	if (field.contrast < policy.minimumFieldContrast) rejectionReasons.push("weak-field-contrast")
	if (field.consistency < policy.minimumFieldDirectionConsistency) {
		rejectionReasons.push("inconsistent-field-direction")
	}
	if (!fieldPolarityAgrees) rejectionReasons.push("field-polarity-disagreement")
	const authorityLevels = foregroundAuthorityLevels({
		alignmentResidual: 0,
		scaleConsistency: 1,
		alongAxisSpanInScales: observation.elongation,
		spacingConsistency: 1,
		glyphDiversity: shapeEvidence,
		sourceContrast,
		sourceSupport,
		polarityConsistency,
		componentCount: 1,
	})
	return {
		familyId: family.id,
		kind: "connected-wordmark",
		orientation: orientation(angleDegrees),
		angleDegrees,
		componentIds: [component.id],
		componentCount: 1,
		alignmentResidual: 0,
		scaleConsistency: 1,
		alongAxisSpanInScales: observation.elongation,
		spacingConsistency: 1,
		glyphDiversity: shapeEvidence,
		sourceContrast,
		sourceSupport,
		polarity,
		polarityConsistency,
		fieldDirection: field.direction,
		fieldDirectionConsistency: field.consistency,
		fieldContrast: field.contrast,
		fieldPolarityAgrees,
		eligible: rejectionReasons.length === 0,
		rejectionReasons,
		authorityLevels,
		authority: foregroundAuthority(authorityLevels),
	}
}

function glyphRunOrder(
	first: AlbumArtworkPaletteV2Phase3GlyphRunEvidence,
	second: AlbumArtworkPaletteV2Phase3GlyphRunEvidence,
): number {
	return Number(second.eligible) - Number(first.eligible) ||
		compareAuthority(first.authority, second.authority) ||
		compareAscii(first.kind, second.kind) ||
		compareAscii(first.componentIds.join("\0"), second.componentIds.join("\0"))
}

export function identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(
	family: ColorFamilyEvidence,
	context: Readonly<{
		width: number
		height: number
		fieldLightnesses: readonly number[]
	}>,
): AlbumArtworkPaletteV2Phase3GlyphRunEvidence[] {
	const components = roleComponents(family)
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3GlyphRunEvidence>()
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY
	for (let firstIndex = 0; firstIndex < components.length; firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex++) {
			const first = components[firstIndex]
			const second = components[secondIndex]
			const axis = canonicalAxis(second.x - first.x, second.y - first.y)
			if (!axis) continue
			const normal = { x: -axis.y, y: axis.x }
			const seedScale = Math.sqrt(first.scale * second.scale)
			const inliers = components.filter((candidate) => {
				const scaleRatio = candidate.scale / Math.max(EPSILON, seedScale)
				if (scaleRatio < 1 / policy.maximumSeedScaleRatio ||
					scaleRatio > policy.maximumSeedScaleRatio) return false
				const residual = Math.abs(
					(candidate.x - first.x) * normal.x + (candidate.y - first.y) * normal.y,
				)
				return residual <= policy.maximumSeedResidualInScales * Math.max(seedScale, candidate.scale)
			}).sort((a, b) =>
				(a.x * axis.x + a.y * axis.y) - (b.x * axis.x + b.y * axis.y) ||
				compareAscii(a.component.id, b.component.id))
			let cluster: PositionedComponent[] = []
			const retainCluster = (): void => {
				if (cluster.length < policy.minimumRunComponents) return
				const run = evaluateDisconnectedRun(family, cluster, context.fieldLightnesses)
				const key = run.componentIds.join("\0")
				const incumbent = unique.get(key)
				if (!incumbent || glyphRunOrder(run, incumbent) < 0) unique.set(key, run)
			}
			for (const candidate of inliers) {
				const previous = cluster[cluster.length - 1]
				if (previous) {
					const gap = (candidate.x - previous.x) * axis.x + (candidate.y - previous.y) * axis.y
					if (gap > policy.maximumAlongAxisGapInScales * Math.max(candidate.scale, previous.scale)) {
						retainCluster()
						cluster = []
					}
				}
				cluster.push(candidate)
			}
			retainCluster()
		}
	}
	for (const component of components) {
		const run = evaluateConnectedWordmark(
			family,
			component,
			context.fieldLightnesses,
			context.width,
			context.height,
		)
		if (run.eligible) unique.set(`wordmark\0${component.component.id}`, run)
	}
	return [...unique.values()]
		.filter(({ eligible }) => eligible)
		.sort(glyphRunOrder)
		.slice(0, policy.maximumRunsPerFamily)
}

function accentAuthorityLevels(values: Readonly<{
	signatureObservation: number
	signatureScore: number
	sourceContrast: number
	sourceSupport: number
	repetition: number
	structure: number
}>): AlbumArtworkPaletteV2Phase3AccentAuthorityLevels {
	const levels = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.levels
	return {
		signatureObservation: levelAtLeast(values.signatureObservation, levels.signatureObservation),
		signatureScore: levelAtLeast(values.signatureScore, levels.signatureScore),
		sourceContrast: levelAtLeast(values.sourceContrast, levels.sourceContrast),
		sourceSupport: levelAtLeast(values.sourceSupport, levels.sourceSupport),
		repetition: levelAtLeast(values.repetition, levels.repetition),
		structure: levelAtLeast(values.structure, levels.accentStructure),
	}
}

function accentAuthority(levels: AlbumArtworkPaletteV2Phase3AccentAuthorityLevels): readonly number[] {
	return ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.accentAuthorityOrder
		.map((axis) => levels[axis])
}

function decorativeAccentEvidence(
	family: ColorFamilyEvidence,
): AlbumArtworkPaletteV2Phase3AccentEvidence | null {
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.decorativeMarks
	const components = roleComponents(family).filter(({ component }) =>
		component.observation.boundsFraction <= policy.maximumBoundsFraction)
		.sort((first, second) => first.scale - second.scale || compareAscii(first.component.id, second.component.id))
	let best: AlbumArtworkPaletteV2Phase3AccentEvidence | null = null
	for (let start = 0; start < components.length; start++) {
		const cluster = components.slice(start).filter((candidate) =>
			components[start].scale / candidate.scale >= policy.minimumScaleConsistency)
		if (cluster.length < policy.minimumComponents) continue
		const observations = cluster.map(({ component }) => component.observation)
		const scaleConsistency = Math.min(...cluster.map(({ scale }) => scale)) /
			Math.max(...cluster.map(({ scale }) => scale))
		const repetition = lowerQuartile(observations.map(({ signatureAccent }) =>
			signatureAccent.repetition))
		const sourceContrast = lowerQuartile(observations.map(({ boundaryLightnessContrast }) =>
			boundaryLightnessContrast))
		const sourceSupport = lowerQuartile(observations.map(({ signatureAccent }) =>
			signatureAccent.sourceSupport))
		const signatureComponent = lowerQuartile(observations.map(({ signatureAccent }) =>
			signatureAccent.score))
		if (family.repeatedComponentCount < policy.minimumComponents ||
			scaleConsistency < policy.minimumScaleConsistency ||
			repetition < policy.minimumRepetition ||
			family.signatureAccentObservation < policy.minimumSignatureObservation ||
			family.signatureScore < policy.minimumSignatureScore ||
			sourceContrast < policy.minimumSourceContrast ||
			sourceSupport < policy.minimumSourceSupport || signatureComponent <= 0) continue
		const levels = accentAuthorityLevels({
			signatureObservation: family.signatureAccentObservation,
			signatureScore: family.signatureScore,
			sourceContrast,
			sourceSupport,
			repetition,
			structure: scaleConsistency,
		})
		const evidence: AlbumArtworkPaletteV2Phase3AccentEvidence = {
			familyId: family.id,
			kind: "decorative-marks",
			componentIds: cluster.map(({ component }) => component.id).sort(compareAscii),
			componentCount: cluster.length,
			achromatic: family.chroma < 0.04,
			signatureObservation: family.signatureAccentObservation,
			signatureScore: family.signatureScore,
			sourceContrast,
			sourceSupport,
			repetition,
			structure: scaleConsistency,
			authorityLevels: levels,
			authority: accentAuthority(levels),
		}
		if (!best || compareAuthority(evidence.authority, best.authority) < 0 ||
			(compareAuthority(evidence.authority, best.authority) === 0 &&
				compareAscii(evidence.componentIds.join("\0"), best.componentIds.join("\0")) < 0)) best = evidence
	}
	return best
}

function secondaryGlyphAccentEvidence(
	family: ColorFamilyEvidence,
	run: AlbumArtworkPaletteV2Phase3GlyphRunEvidence | null,
): AlbumArtworkPaletteV2Phase3AccentEvidence | null {
	if (!run || family.signatureAccentObservation <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.decorativeMarks
			.minimumSignatureObservation) return null
	const repetition = lowerQuartile(run.componentIds.map((id) => family.components
		.find((component) => component.id === id)?.observation.signatureAccent.repetition ?? 0))
	const structure = Math.min(1 - run.alignmentResidual, run.scaleConsistency)
	const levels = accentAuthorityLevels({
		signatureObservation: family.signatureAccentObservation,
		signatureScore: family.signatureScore,
		sourceContrast: run.sourceContrast,
		sourceSupport: run.sourceSupport,
		repetition,
		structure,
	})
	return {
		familyId: family.id,
		kind: "secondary-glyph-run",
		componentIds: run.componentIds,
		componentCount: run.componentCount,
		achromatic: family.chroma < 0.04,
		signatureObservation: family.signatureAccentObservation,
		signatureScore: family.signatureScore,
		sourceContrast: run.sourceContrast,
		sourceSupport: run.sourceSupport,
		repetition,
		structure,
		authorityLevels: levels,
		authority: accentAuthority(levels),
	}
}

function bestAccentEvidence(
	family: ColorFamilyEvidence,
	run: AlbumArtworkPaletteV2Phase3GlyphRunEvidence | null,
): AlbumArtworkPaletteV2Phase3AccentEvidence | null {
	const candidates = [decorativeAccentEvidence(family), secondaryGlyphAccentEvidence(family, run)]
		.filter((candidate): candidate is AlbumArtworkPaletteV2Phase3AccentEvidence => candidate !== null)
		.sort((first, second) => compareAuthority(first.authority, second.authority) ||
			compareAscii(first.kind, second.kind) || compareAscii(first.componentIds.join("\0"),
				second.componentIds.join("\0")))
	return candidates[0] ?? null
}

function sameRgb(
	first: CompletePaletteTreatment["background"],
	second: CompletePaletteTreatment["background"],
): boolean {
	return first.rgb.every((channel, index) => channel === second.rgb[index])
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	const gradient = treatment.gradientEvidence
	return gradient === null ? "flat" : [
		gradient.topology,
		gradient.direction,
		gradient.backgroundTopologyEndpoint,
		...gradient.supportingFamilyIds,
	].join("\0")
}

function isExactNonRoleContrast(
	incumbent: CompletePaletteTreatment,
	candidate: CompletePaletteTreatment,
): boolean {
	return candidate.sourceFieldHypothesisId === incumbent.sourceFieldHypothesisId &&
		candidate.fieldTreatment === incumbent.fieldTreatment &&
		candidate.gradient === incumbent.gradient &&
		gradientRenderingKey(candidate) === gradientRenderingKey(incumbent) &&
		candidate.familyRoles.background === incumbent.familyRoles.background &&
		candidate.familyRoles.surface === incumbent.familyRoles.surface &&
		sameRgb(candidate.background, incumbent.background) &&
		sameRgb(candidate.surface, incumbent.surface) &&
		candidate.collapse.surface === incumbent.collapse.surface &&
		candidate.collapse.accent === incumbent.collapse.accent &&
		candidate.cardinality === incumbent.cardinality
}

function sourceConnectedRole(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): boolean {
	const familyId = treatment.familyRoles[role]
	const color = treatment[role]
	return familyId !== "generated" && !color.generated && !("generated" in color.support) &&
		color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
}

function assignmentOrder<TCandidate extends AlbumArtworkPaletteV2Phase3ContrastiveMaterializedCandidate>(
	first: AlbumArtworkPaletteV2Phase3ContrastiveJointAssignment<TCandidate>,
	second: AlbumArtworkPaletteV2Phase3ContrastiveJointAssignment<TCandidate>,
): number {
	return compareAuthority(first.authority, second.authority) || compareAscii(first.key, second.key)
}

export function runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm<
	TCandidate extends AlbumArtworkPaletteV2Phase3ContrastiveMaterializedCandidate,
>(input: Readonly<{
	evidence: NativePaletteEvidence
	incumbent: TCandidate
	materialized: readonly TCandidate[]
	maximumJointAssignments?: number
}>): AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArmResult<TCandidate> {
	const maximumJointAssignments = input.maximumJointAssignments ??
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_POLICY.maximumJointAssignments
	if (!Number.isSafeInteger(maximumJointAssignments) || maximumJointAssignments < 1) {
		throw new RangeError("Contrastive role assignment maximum must be a positive integer")
	}
	if (!input.materialized.includes(input.incumbent)) {
		throw new RangeError("Contrastive role assignment incumbent must belong to the materialized domain")
	}
	const incumbentTreatment = input.incumbent.treatment
	const fieldLightnesses = [incumbentTreatment.background.oklab[0], incumbentTreatment.surface.oklab[0]]
		.filter((value, index, values) => Number.isFinite(value) && values.indexOf(value) === index)
	const fieldFamilyIds = new Set([
		incumbentTreatment.familyRoles.background,
		incumbentTreatment.familyRoles.surface,
	])
	const roleEvidence = [...input.evidence.families]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((family): AlbumArtworkPaletteV2Phase3ContrastiveFamilyRoleEvidence => {
			const fieldOwned = fieldFamilyIds.has(family.id)
			const glyphRuns = fieldOwned ? [] : identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns(family, {
				width: input.evidence.width,
				height: input.evidence.height,
				fieldLightnesses,
			})
			const foreground = glyphRuns[0] ?? null
			return {
				familyId: family.id,
				fieldOwned,
				glyphRuns,
				foreground,
				accent: fieldOwned ? null : bestAccentEvidence(family, foreground),
			}
		})
	const evidenceByFamily = new Map(roleEvidence.map((evidence) => [evidence.familyId, evidence]))
	const contrastiveCandidates = input.materialized.filter(({ treatment }) =>
		isExactNonRoleContrast(incumbentTreatment, treatment))
	const completeDistinctRoleCandidates = contrastiveCandidates.filter(({ treatment }) =>
		!treatment.collapse.accent &&
		treatment.familyRoles.foreground !== treatment.familyRoles.accent &&
		sourceConnectedRole(treatment, "foreground") && sourceConnectedRole(treatment, "accent"))
	const grouped = new Map<string, {
		foregroundFamilyId: string
		accentFamilyId: string
		foregroundEvidence: AlbumArtworkPaletteV2Phase3GlyphRunEvidence
		accentEvidence: AlbumArtworkPaletteV2Phase3AccentEvidence
		candidates: TCandidate[]
	}>()
	for (const candidate of completeDistinctRoleCandidates) {
		const foregroundFamilyId = candidate.treatment.familyRoles.foreground
		const accentFamilyId = candidate.treatment.familyRoles.accent
		if (foregroundFamilyId === "generated" || accentFamilyId === "generated") continue
		const foregroundEvidence = evidenceByFamily.get(foregroundFamilyId)?.foreground
		const accentEvidence = evidenceByFamily.get(accentFamilyId)?.accent
		if (!foregroundEvidence || !accentEvidence) continue
		const key = `${foregroundFamilyId}\0${accentFamilyId}`
		const group = grouped.get(key) ?? {
			foregroundFamilyId,
			accentFamilyId,
			foregroundEvidence,
			accentEvidence,
			candidates: [],
		}
		group.candidates.push(candidate)
		grouped.set(key, group)
	}
	const allAssignments = [...grouped.entries()].map(([key, group]):
		AlbumArtworkPaletteV2Phase3ContrastiveJointAssignment<TCandidate> => {
		const candidates = group.candidates.sort((first, second) => compareAscii(first.key, second.key))
		return {
			key,
			foregroundFamilyId: group.foregroundFamilyId,
			accentFamilyId: group.accentFamilyId,
			foregroundEvidence: group.foregroundEvidence,
			accentEvidence: group.accentEvidence,
			authority: [...group.foregroundEvidence.authority, ...group.accentEvidence.authority],
			candidates,
			treatmentKeys: candidates.map(({ key: treatmentKey }) => treatmentKey),
		}
	}).sort(assignmentOrder)
	const assignments = allAssignments.slice(0, maximumJointAssignments)
	const top = assignments[0] ?? null
	const tied = top !== null && allAssignments[1] !== undefined &&
		compareAuthority(top.authority, allAssignments[1].authority) === 0
	const cohortForegroundEvidence = completeDistinctRoleCandidates.some(({ treatment }) => {
		const familyId = treatment.familyRoles.foreground
		return familyId !== "generated" && (evidenceByFamily.get(familyId)?.foreground ?? null) !== null
	})
	const cohortAccentEvidence = completeDistinctRoleCandidates.some(({ treatment }) => {
		const familyId = treatment.familyRoles.accent
		return familyId !== "generated" && (evidenceByFamily.get(familyId)?.accent ?? null) !== null
	})
	let decision: AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDecision
	if (completeDistinctRoleCandidates.length === 0) {
		decision = {
			status: "abstained",
			reason: "no-complete-contrastive-candidates",
			authoritativeAssignmentKey: null,
			foregroundFamilyId: null,
			accentFamilyId: null,
		}
	} else if (!cohortForegroundEvidence) {
		decision = {
			status: "abstained",
			reason: "weak-foreground-evidence",
			authoritativeAssignmentKey: null,
			foregroundFamilyId: null,
			accentFamilyId: null,
		}
	} else if (!cohortAccentEvidence || !top) {
		decision = {
			status: "abstained",
			reason: "weak-accent-evidence",
			authoritativeAssignmentKey: null,
			foregroundFamilyId: null,
			accentFamilyId: null,
		}
	} else if (tied) {
		decision = {
			status: "abstained",
			reason: "tied-joint-assignment-authority",
			authoritativeAssignmentKey: null,
			foregroundFamilyId: null,
			accentFamilyId: null,
		}
	} else {
		const incumbentIsTop = incumbentTreatment.familyRoles.foreground === top.foregroundFamilyId &&
			incumbentTreatment.familyRoles.accent === top.accentFamilyId
		decision = {
			status: incumbentIsTop ? "incumbent-authoritative" : "authoritative",
			reason: incumbentIsTop ? "incumbent-already-authoritative" : "unique-joint-assignment-authority",
			authoritativeAssignmentKey: top.key,
			foregroundFamilyId: top.foregroundFamilyId,
			accentFamilyId: top.accentFamilyId,
		}
	}
	const authoritativeCandidates = decision.authoritativeAssignmentKey === null
		? []
		: assignments.find(({ key }) => key === decision.authoritativeAssignmentKey)?.candidates ?? []
	const diagnostics: AlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentDiagnostics = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM_ID,
		evidenceAuthority: "named-levels-lexicographic",
		coreEvidence: {
			componentBounds: "axis-aligned",
			componentRetention: "bounded-role-observation-subset",
			orientationBasis: "retained-component-centers",
			glyphContoursAvailable: false,
		},
		domain: {
			inputMaterializedCandidateCount: input.materialized.length,
			contrastiveCandidateCount: contrastiveCandidates.length,
			completeDistinctRoleCandidateCount: completeDistinctRoleCandidates.length,
			availableJointAssignmentCount: allAssignments.length,
			boundedJointAssignmentCount: assignments.length,
			maximumJointAssignments,
			candidateCountChanged: false,
			materializedArrayPreserved: true,
		},
		incumbent: {
			key: input.incumbent.key,
			fieldHypothesisId: incumbentTreatment.sourceFieldHypothesisId,
			foregroundFamilyId: incumbentTreatment.familyRoles.foreground,
			accentFamilyId: incumbentTreatment.familyRoles.accent,
		},
		decision,
	}
	return {
		incumbent: input.incumbent,
		materialized: input.materialized,
		contrastiveCandidates,
		roleEvidence,
		assignments,
		authoritativeCandidates,
		decision,
		diagnostics,
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ARM = Object.freeze({
	identifyGlyphRuns: identifyAlbumArtworkPaletteV2Phase3ContrastiveGlyphRuns,
	run: runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm,
})
