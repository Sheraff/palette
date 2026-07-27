import { isDeepStrictEqual } from "node:util"
import {
	extractNextPaletteJointParetoWithContext,
	NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
	type NextPaletteJointParetoCertificate,
	type NextPaletteJointSelectionSummary,
} from "./next-palette-joint-pareto.ts"
import type { Palette, RawImage, RGB } from "./types.ts"

export const JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION =
	"joint-palette-ablation-stable-noncollapsed-field-0.1.0-development"

export const JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY = Object.freeze({
	version: "joint-palette-ablation-stable-noncollapsed-field-policy-0.1.0-development",
	incumbentAlgorithmVersion: "region-graph-0.19.0",
	jointParetoVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
	developmentDiagnosticOnly: true,
	requireUnconstrainedAndCanonicalOverlayAblationAgreement: true,
	requireChangedFieldBlock: true,
	requireCanonicalForeground: true,
	requireCanonicalAccent: true,
	collapsedCandidatesAllowed: false,
	fittedNumericThresholds: false,
	fixedApcaAdmissionFloor: null,
})

export type JointPaletteAblationStableNoncollapsedFieldCertificate = {
	schemaVersion: 1
	version: typeof JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION
	policy: typeof JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY
	route: "admitted-field" | "unconstrained-candidate-unavailable" | "ablation-disagrees" |
		"overlay-changed" | "field-unchanged" | "collapsed-candidate"
	selected: NextPaletteJointSelectionSummary | null
	canonicalOverlayAblation: NextPaletteJointSelectionSummary
	invariants: {
		diagnosticOnly: true
		strictCanonicalDominanceInherited: true
		exactAblationAgreementRequired: true
		foregroundAndAccentFrozen: true
		noncollapsedFieldRequired: true
		noPostselectionMutation: true
	}
}

export type JointPaletteAblationStableNoncollapsedFieldResult = {
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteAblationStableNoncollapsedFieldCertificate
	jointCertificate: NextPaletteJointParetoCertificate
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function fieldState(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function summary(value: NextPaletteJointSelectionSummary): NextPaletteJointSelectionSummary {
	return {
		changed: value.changed,
		admitted: value.admitted,
		stableKey: value.stableKey,
		fieldState: value.fieldState,
		changedSemanticBlocks: value.changedSemanticBlocks,
		changedSemanticAtoms: value.changedSemanticAtoms,
		objectives: value.objectives,
		objectiveDeltas: value.objectiveDeltas,
	}
}

function certificate(
	route: JointPaletteAblationStableNoncollapsedFieldCertificate["route"],
	selected: NextPaletteJointSelectionSummary | null,
	ablation: NextPaletteJointSelectionSummary,
): JointPaletteAblationStableNoncollapsedFieldCertificate {
	return {
		schemaVersion: 1,
		version: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
		policy: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY,
		route,
		selected,
		canonicalOverlayAblation: ablation,
		invariants: {
			diagnosticOnly: true,
			strictCanonicalDominanceInherited: true,
			exactAblationAgreementRequired: true,
			foregroundAndAccentFrozen: true,
			noncollapsedFieldRequired: true,
			noPostselectionMutation: true,
		},
	}
}

export function buildJointPaletteAblationStableNoncollapsedField(
	image: RawImage,
): JointPaletteAblationStableNoncollapsedFieldResult {
	const joint = extractNextPaletteJointParetoWithContext(image)
	const canonical = joint.canonicalExtraction.methods.spatial
	const selected = summary(joint.certificate.selected)
	const ablation = joint.certificate.ablations["canonical-overlay-block"]
	if (!selected.changed || !selected.admitted) {
		return { canonical, candidate: null, certificate: certificate("unconstrained-candidate-unavailable", null, ablation),
			jointCertificate: joint.certificate }
	}
	if (!isDeepStrictEqual(selected, ablation)) {
		return { canonical, candidate: null, certificate: certificate("ablation-disagrees", selected, ablation),
			jointCertificate: joint.certificate }
	}
	const candidate = joint.palette
	if (!sameRgb(candidate.foreground.rgb, canonical.foreground.rgb) ||
		candidate.foreground.generated !== canonical.foreground.generated ||
		!sameRgb(candidate.accent.rgb, canonical.accent.rgb) || candidate.accent.generated !== canonical.accent.generated) {
		return { canonical, candidate: null, certificate: certificate("overlay-changed", selected, ablation),
			jointCertificate: joint.certificate }
	}
	const fieldChanged = !sameRgb(candidate.background.rgb, canonical.background.rgb) ||
		candidate.background.generated !== canonical.background.generated ||
		!sameRgb(candidate.surface.rgb, canonical.surface.rgb) || candidate.surface.generated !== canonical.surface.generated ||
		fieldState(candidate) !== fieldState(canonical)
	if (!fieldChanged) return { canonical, candidate: null, certificate: certificate("field-unchanged", selected, ablation),
		jointCertificate: joint.certificate }
	if (fieldState(candidate) === "collapsed") {
		return { canonical, candidate: null, certificate: certificate("collapsed-candidate", selected, ablation),
			jointCertificate: joint.certificate }
	}
	return { canonical, candidate, certificate: certificate("admitted-field", selected, ablation),
		jointCertificate: joint.certificate }
}
