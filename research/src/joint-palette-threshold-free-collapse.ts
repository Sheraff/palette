import { apcaContrast } from "./color.ts"
import {
	buildJointPaletteFieldDominanceFirst,
	JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
	type JointPaletteFieldDominanceCertificate,
} from "./joint-palette-field-dominance-first.ts"
import { extractNextPaletteJointParetoWithContext } from "./next-palette-joint-pareto.ts"
import type { FieldRelationEvidence } from "./field-relation.ts"
import type { Palette, RawImage, RGB } from "./types.ts"

export const JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION = "joint-palette-threshold-free-collapse-0.1.0-development"

export const JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY = Object.freeze({
	version: "joint-palette-threshold-free-collapse-policy-0.1.0-development",
	incumbentAlgorithmVersion: "region-graph-0.19.0",
	fieldDominanceVersion: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
	developmentDiagnosticOnly: true,
	exactCounterfactual: "(B,F,S,A,noncollapsed) -> (B,F,B,A,collapsed)",
	retainedBackgroundPresenceMustStrictlyDominate: true,
	retainedBackgroundFieldSupportMustStrictlyDominate: true,
	secondaryForegroundRelationMayNotRegress: true,
	secondaryAccentRelationMayNotRegress: true,
	fittedNumericThresholds: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
})

export type ThresholdFreeCollapseEvidence = {
	backgroundPresence: number
	surfacePresence: number
	backgroundFieldSupport: number
	surfaceFieldSupport: number
	foregroundOnBackgroundMagnitude: number
	foregroundOnSurfaceMagnitude: number
	accentOnBackgroundMagnitude: number
	accentOnSurfaceMagnitude: number
}

export type ThresholdFreeCollapseDecision = {
	clauses: {
		retainedBackgroundPresenceDominates: boolean
		retainedBackgroundFieldSupportDominates: boolean
		foregroundSurfaceRelationPreserved: boolean
		accentSurfaceRelationPreserved: boolean
	}
	evidence: ThresholdFreeCollapseEvidence
	pass: boolean
}

export type JointPaletteThresholdFreeCollapseCertificate = {
	schemaVersion: 1
	version: typeof JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION
	policy: typeof JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY
	route: "admitted-collapse" | "no-strict-field-collapse" | "not-exact-counterfactual" |
		"canonical-pair-relation-unavailable" | "audit-clauses-failed"
	fieldDominance: {
		stableKey: string
		fieldState: string
		changedSemanticBlocks: number
		changedSemanticAtoms: number
		objectiveDeltas: readonly number[]
	} | null
	audit: ThresholdFreeCollapseDecision | null
	invariants: {
		diagnosticOnly: true
		strictCanonicalDominanceRequired: true
		exactRetainedBackgroundCollapseRequired: true
		foregroundAndAccentFrozen: true
		thresholdFreeRelationalAudit: true
		fixedApcaFloorAbsent: true
	}
}

export type JointPaletteThresholdFreeCollapseResult = {
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteThresholdFreeCollapseCertificate
	fieldDominanceCertificate: JointPaletteFieldDominanceCertificate
}

const epsilon = JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY.comparisonEpsilon

function magnitude(value: number): number {
	return Math.abs(value)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function fieldState(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

export function evaluateThresholdFreeCollapse(
	canonical: Pick<Palette, "background" | "foreground" | "surface" | "accent">,
	relation: Pick<FieldRelationEvidence, "endpoint" | "field">,
): ThresholdFreeCollapseDecision {
	const evidence: ThresholdFreeCollapseEvidence = {
		backgroundPresence: relation.endpoint.backgroundPresence,
		surfacePresence: relation.endpoint.surfacePresence,
		backgroundFieldSupport: relation.field.backgroundSupport,
		surfaceFieldSupport: relation.field.surfaceSupport,
		foregroundOnBackgroundMagnitude: magnitude(apcaContrast(canonical.foreground.rgb, canonical.background.rgb)),
		foregroundOnSurfaceMagnitude: magnitude(apcaContrast(canonical.foreground.rgb, canonical.surface.rgb)),
		accentOnBackgroundMagnitude: magnitude(apcaContrast(canonical.accent.rgb, canonical.background.rgb)),
		accentOnSurfaceMagnitude: magnitude(apcaContrast(canonical.accent.rgb, canonical.surface.rgb)),
	}
	const clauses = {
		retainedBackgroundPresenceDominates: evidence.backgroundPresence > evidence.surfacePresence,
		retainedBackgroundFieldSupportDominates: evidence.backgroundFieldSupport > evidence.surfaceFieldSupport,
		foregroundSurfaceRelationPreserved:
			evidence.foregroundOnBackgroundMagnitude + epsilon >= evidence.foregroundOnSurfaceMagnitude,
		accentSurfaceRelationPreserved:
			evidence.accentOnBackgroundMagnitude + epsilon >= evidence.accentOnSurfaceMagnitude,
	}
	return { clauses, evidence, pass: Object.values(clauses).every(Boolean) }
}

function certificate(
	route: JointPaletteThresholdFreeCollapseCertificate["route"],
	field: ReturnType<typeof buildJointPaletteFieldDominanceFirst>,
	audit: ThresholdFreeCollapseDecision | null,
): JointPaletteThresholdFreeCollapseCertificate {
	const selected = field.certificate.selected
	return {
		schemaVersion: 1,
		version: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
		policy: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY,
		route,
		fieldDominance: selected.admitted ? {
			stableKey: selected.stableKey,
			fieldState: selected.fieldState,
			changedSemanticBlocks: selected.changedSemanticBlocks,
			changedSemanticAtoms: selected.changedSemanticAtoms,
			objectiveDeltas: selected.objectiveDeltas,
		} : null,
		audit,
		invariants: {
			diagnosticOnly: true,
			strictCanonicalDominanceRequired: true,
			exactRetainedBackgroundCollapseRequired: true,
			foregroundAndAccentFrozen: true,
			thresholdFreeRelationalAudit: true,
			fixedApcaFloorAbsent: true,
		},
	}
}

export function buildJointPaletteThresholdFreeCollapse(image: RawImage): JointPaletteThresholdFreeCollapseResult {
	const field = buildJointPaletteFieldDominanceFirst(image)
	const canonical = field.canonical
	if (!field.candidate) {
		return { canonical, candidate: null, certificate: certificate("no-strict-field-collapse", field, null),
			fieldDominanceCertificate: field.certificate }
	}
	const candidate = field.candidate
	const exactCounterfactual = fieldState(canonical) !== "collapsed" && fieldState(candidate) === "collapsed" &&
		sameRgb(candidate.background.rgb, canonical.background.rgb) &&
		sameRgb(candidate.surface.rgb, canonical.background.rgb) &&
		sameRgb(candidate.foreground.rgb, canonical.foreground.rgb) &&
		sameRgb(candidate.accent.rgb, canonical.accent.rgb) &&
		field.certificate.selected.changedSemanticBlocks === 1 && field.certificate.selected.changedSemanticAtoms === 2
	if (!exactCounterfactual) {
		return { canonical, candidate: null, certificate: certificate("not-exact-counterfactual", field, null),
			fieldDominanceCertificate: field.certificate }
	}
	const broad = extractNextPaletteJointParetoWithContext(image)
	const treatment = broad.certificate.selected.fieldTreatment
	const canonicalPairAvailable = treatment?.fieldRelation &&
		sameRgb(broad.palette.background.rgb, canonical.background.rgb) &&
		sameRgb(broad.palette.surface.rgb, canonical.surface.rgb) &&
		broad.palette.gradient.isGradient === canonical.gradient.isGradient &&
		broad.certificate.selected.fieldState === fieldState(canonical)
	if (!canonicalPairAvailable) {
		return { canonical, candidate: null, certificate: certificate("canonical-pair-relation-unavailable", field, null),
			fieldDominanceCertificate: field.certificate }
	}
	const audit = evaluateThresholdFreeCollapse(canonical, treatment.fieldRelation!)
	return {
		canonical,
		candidate: audit.pass ? candidate : null,
		certificate: certificate(audit.pass ? "admitted-collapse" : "audit-clauses-failed", field, audit),
		fieldDominanceCertificate: field.certificate,
	}
}
