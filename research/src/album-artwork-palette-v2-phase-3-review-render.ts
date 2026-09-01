import type { CompletePaletteReviewResearchRender } from "./complete-palette-review-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY,
} from "./album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
} from "./album-artwork-palette-v2-phase-3-final-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY,
} from "./album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-adapter.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_FORMULAS,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY,
	compareCompleteRenderCandidates,
	pathSpatialCenterMatchesDiscoveryGeometry,
} from "./album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import { okDistance, rgbToOKLab } from "./color.ts"

type JsonObject = Record<string, unknown>

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_REVIEW_RENDER_VERSION =
	"phase-3-supported-gradient-three-stop-review-render-v1" as const

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function rgbHex(rgb: readonly number[]): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function sameValue(first: unknown, second: unknown): boolean {
	if (first === second) return true
	if (Array.isArray(first) || Array.isArray(second)) {
		return Array.isArray(first) && Array.isArray(second) && first.length === second.length &&
			first.every((value, index) => sameValue(value, second[index]))
	}
	if (!isObject(first) || !isObject(second)) return false
	const firstKeys = Object.keys(first).sort()
	const secondKeys = Object.keys(second).sort()
	return firstKeys.length === secondKeys.length &&
		firstKeys.every((key, index) => key === secondKeys[index] && sameValue(first[key], second[key]))
}

function sameNumbers(first: unknown, second: unknown): boolean {
	return Array.isArray(first) && Array.isArray(second) && first.length === second.length &&
		first.every((value, index) => value === second[index])
}

function validRoleColor(value: unknown): value is JsonObject {
	return isObject(value) && typeof value.hex === "string" && /^#[0-9a-f]{6}$/u.test(value.hex) &&
		Array.isArray(value.rgb) && value.rgb.length === 3 &&
		value.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) &&
		rgbHex(value.rgb as number[]) === value.hex && Array.isArray(value.oklab) &&
		value.oklab.length === 3 && value.oklab.every((channel) => typeof channel === "number" && Number.isFinite(channel))
}

function validateExactColor(
	value: unknown,
	familyId: string,
	regionId: string,
	width: number,
	height: number,
	label: string,
): JsonObject {
	invariant(validRoleColor(value) && isObject(value.provenance), `${label} exact color is invalid`)
	const rgb = value.rgb as number[]
	const oklab = value.oklab as number[]
	invariant(okDistance(rgbToOKLab(rgb as [number, number, number]), oklab as [number, number, number]) <= 0.000001,
		`${label} RGB, hex, and OKLab custody disagree`)
	const provenance = value.provenance
	invariant(provenance.exactSource === true && provenance.familyId === familyId &&
		provenance.regionId === regionId && Number.isSafeInteger(provenance.pixelIndex) &&
		Number.isSafeInteger(provenance.x) && Number.isSafeInteger(provenance.y) &&
		(provenance.x as number) >= 0 && (provenance.x as number) < width &&
		(provenance.y as number) >= 0 && (provenance.y as number) < height &&
		provenance.pixelIndex === (provenance.y as number) * width + (provenance.x as number),
		`${label} source coordinates are invalid`)
	return value
}

function validateExactStop(
	value: unknown,
	width: number,
	height: number,
	label: string,
): JsonObject {
	invariant(isObject(value) && typeof value.familyId === "string" && value.familyId.length > 0 &&
		typeof value.regionId === "string" && value.regionId.length > 0 &&
		Number.isSafeInteger(value.sourceStageIndex) && (value.sourceStageIndex as number) >= 0 &&
		typeof value.position === "number" && Number.isFinite(value.position) &&
		typeof value.sourceSpatialPosition === "number" && Number.isFinite(value.sourceSpatialPosition) &&
		typeof value.sourceColorPosition === "number" && Number.isFinite(value.sourceColorPosition),
		`${label} exact stop is invalid`)
	validateExactColor(value.exactColor, value.familyId, value.regionId, width, height, label)
	return value
}

const MIDPOINT_AWARE_ATTEMPT_ID = "phase-3-midpoint-aware-render-candidate"
const MIDPOINT_AWARE_PROJECTION_ID =
	"album-artwork-palette-v2-phase-3-midpoint-aware-render-projection-v1"
const MIDPOINT_AWARE_V3_DIAGNOSTICS_ID =
	"album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-diagnostics-v3"
const MIDPOINT_AWARE_V3_PROJECTION_ID =
	"album-artwork-palette-v2-phase-3-path-bound-render-projection-v3"
const FIELD_RENDER_CANDIDATE_ID =
	"album-artwork-palette-v2-phase-3-source-field-render-candidate-v2"
const ORDINARY_SOURCE_LINEAGE = "ordinary-complete-source-lineage"
const ROLES = ["background", "surface", "foreground", "accent"] as const

function treatmentKey(treatment: JsonObject): string {
	return [...ROLES.map((role) => (treatment[role] as JsonObject).hex),
		treatment.gradient === true ? "gradient" : "flat"].join(":")
}

function matchesControlTreatment(value: unknown, control: unknown): boolean {
	if (!isObject(value) || typeof value.key !== "string" || !isObject(value.treatment) ||
		!isObject(control) || typeof control.gradient !== "boolean" ||
		!ROLES.every((role) => isObject(control[role]) && typeof control[role].hex === "string")) return false
	return value.key === treatmentKey(control) && sameValue(value.treatment, control)
}

function validateMidpointAwareNoOp(output: JsonObject, root: JsonObject, label: string): void {
	const control = root.controlIntegratedResult
	const outputAlternatives = output.alternatives
	const controlAlternatives = isObject(control) ? control.alternatives : null
	invariant(typeof root.noOpReason === "string" && root.noOpReason.length > 0 &&
		root.renderProjection === null && root.selectedRender === null && isObject(control) &&
		matchesControlTreatment(output.winner, control.winner) && Array.isArray(outputAlternatives) &&
		Array.isArray(controlAlternatives) && outputAlternatives.length === controlAlternatives.length &&
		outputAlternatives.every((entry, index) =>
			matchesControlTreatment(entry, (controlAlternatives as unknown[])[index])),
		`${label} midpoint-aware no-op changed control public output or carries render authority`)
	const winner = output.winner as JsonObject
	const slateKeys = (outputAlternatives as unknown[]).map((entry) => (entry as JsonObject).key)
	invariant(root.outputWinnerKey === winner.key && Array.isArray(root.outputSlateKeys) &&
		sameNumbers(root.outputSlateKeys, slateKeys),
		`${label} midpoint-aware no-op output keys are stale`)
}

function sameOrderedValues(first: readonly unknown[], second: readonly unknown[]): boolean {
	return first.length === second.length && first.every((value, index) => sameValue(value, second[index]))
}

function sameUniqueStrings(first: unknown, second: readonly string[]): boolean {
	if (!Array.isArray(first) || !first.every((value) => typeof value === "string") ||
		new Set(first).size !== first.length || first.length !== second.length) return false
	const left = [...first].sort()
	const right = [...second].sort()
	return left.every((value, index) => value === right[index])
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	const expected = [...keys].sort()
	return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

const BASELINE_DOMAIN_COUNT_KEYS = [
	"expectedFullEvaluationCount",
	"actualFullEvaluationCount",
	"explanationEvaluationCount",
	"selectorMaterializedTreatmentCount",
	"selectorUniqueTreatmentCount",
	"materializationDiagnosticTreatmentCount",
	"materializedArrayCount",
	"custodyArrayCount",
	"factorizedPolicyCapacity",
	"uniqueCanonicalTreatmentCount",
	"truncatedCanonicalTreatmentCount",
] as const

const BASELINE_DOMAIN_BOOLEAN_KEYS = [
	"allCountsFinite",
	"factorizedCapMetadataConsistent",
	"countMetadataConsistent",
	"evaluationCountMatchesExpected",
	"uniqueCanonicalEvaluationKeys",
	"uniqueMaterializationKeys",
	"uniqueCustodyKeys",
	"evaluationKeysMatchMaterialization",
	"custodyKeysMatchMaterialization",
	"evaluationTreatmentsMatchMaterialization",
	"custodyTreatmentsMatchMaterialization",
	"custodyDescriptorsMatchMaterialization",
	"explanationKeysMatchEvaluations",
	"explanationNumericsMatchEvaluations",
	"winnerMetadataMatches",
	"uniqueAuthoritativeWinner",
	"winnerTreatmentMatchesDomainCustody",
	"materializationReplayMatches",
	"recoveryReplayMatches",
	"verified",
] as const

function validateMidpointAwareV3BaselineAuthority(
	root: JsonObject,
	materializationDiagnostics: JsonObject,
	selected: unknown,
	label: string,
): void {
	const authority = root.authoritativeBaseline
	const selector = root.selector
	invariant(isObject(authority) && hasExactKeys(authority, [
		"selectionDiagnosticKey",
		"recoveryWinnerKey",
		"matchingFullEvaluationCount",
		"evaluation",
		"domainVerification",
	]) && typeof authority.selectionDiagnosticKey === "string" &&
		authority.selectionDiagnosticKey.length > 0 &&
		authority.recoveryWinnerKey === authority.selectionDiagnosticKey &&
		authority.matchingFullEvaluationCount === 1 && isObject(authority.evaluation) &&
		isObject(authority.evaluation.treatment) &&
		authority.evaluation.key === authority.selectionDiagnosticKey &&
		treatmentKey(authority.evaluation.treatment) === authority.selectionDiagnosticKey &&
		typeof authority.evaluation.qualityUtility === "number" &&
		Number.isFinite(authority.evaluation.qualityUtility) &&
		typeof authority.evaluation.relationUtility === "number" &&
		Number.isFinite(authority.evaluation.relationUtility) && isObject(authority.domainVerification),
		`${label} midpoint-aware v3 authoritative baseline is malformed`)
	const verification = authority.domainVerification
	const verificationKeys = [...BASELINE_DOMAIN_COUNT_KEYS, ...BASELINE_DOMAIN_BOOLEAN_KEYS]
	invariant(hasExactKeys(verification, verificationKeys) &&
		BASELINE_DOMAIN_COUNT_KEYS.every((key) =>
			Number.isSafeInteger(verification[key]) && (verification[key] as number) >= 0) &&
		BASELINE_DOMAIN_BOOLEAN_KEYS.every((key) => verification[key] === true) &&
		verification.verified === true && verification.materializationReplayMatches === true &&
		verification.recoveryReplayMatches === true,
		`${label} midpoint-aware v3 authoritative baseline replay verification is stale`)
	const evaluation = authority.evaluation
	const expectedQualityFloor = (evaluation.qualityUtility as number) -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumQualityLoss
	invariant(materializationDiagnostics.baselineUnrestrictedWinnerKey === evaluation.key &&
		materializationDiagnostics.baselineUnrestrictedWinnerQualityUtility === evaluation.qualityUtility &&
		materializationDiagnostics.baselineUnrestrictedWinnerRelationUtility === evaluation.relationUtility &&
		sameValue(materializationDiagnostics.baselineUnrestrictedWinnerEvaluation, evaluation) &&
		materializationDiagnostics.qualityFloor === expectedQualityFloor &&
		root.qualityFloor === expectedQualityFloor && isObject(selector) &&
		isObject(selector.baselineDomainContext) && isObject(selector.baselineDomainContext.winner) &&
		selector.baselineDomainContext.winner.key === evaluation.key &&
		selector.baselineDomainContext.winner.qualityUtility === evaluation.qualityUtility &&
		selector.baselineDomainContext.winner.relationUtility === evaluation.relationUtility &&
		Array.isArray(selector.baselineDomainContext.evaluations),
		`${label} midpoint-aware v3 baseline diagnostics or quality floor are stale`)
	const { treatment: _treatment, ...evaluationDiagnostic } = evaluation
	const baselineContextMatches = (selector.baselineDomainContext.evaluations as unknown[])
		.filter((candidate) => isObject(candidate) && candidate.key === evaluation.key)
	invariant(baselineContextMatches.length === 1 &&
		sameValue(baselineContextMatches[0], evaluationDiagnostic),
		`${label} midpoint-aware v3 selector baseline context is stale`)
	if (isObject(selected) && isObject(selected.recoveryEvaluation)) {
		const qualityLoss = Math.max(0,
			(evaluation.qualityUtility as number) - (selected.recoveryEvaluation.qualityUtility as number))
		const withinQualityBound = (selected.recoveryEvaluation.qualityUtility as number) +
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
				.qualityBoundaryTolerance >= expectedQualityFloor
		invariant(typeof selected.recoveryEvaluation.qualityUtility === "number" &&
			Number.isFinite(selected.recoveryEvaluation.qualityUtility) &&
			selected.qualityLossFromBaseline === qualityLoss &&
			selected.qualityFloor === expectedQualityFloor &&
			selected.withinQualityBound === withinQualityBound && selected.eligible === withinQualityBound &&
			root.qualityLossFromBaseline === qualityLoss,
			`${label} midpoint-aware v3 selected quality-loss math is stale`)
	} else {
		invariant(selected === null && root.qualityLossFromBaseline === null,
			`${label} midpoint-aware v3 no-op quality-loss authority is stale`)
	}
}

function validateMidpointAwareV3MaterializationDomain(root: JsonObject, label: string) {
	const core = root.coreEvaluation
	const materialization = root.pathBoundMaterialization
	invariant(sameValue(root.policy,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY) &&
		isObject(core) && isObject(core.identity) && core.identity.version === 2 &&
		core.identity.evaluatorId === FIELD_RENDER_CANDIDATE_ID &&
		sameValue(core.diagnostics,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_DIAGNOSTICS) &&
		typeof core.familyBinStep === "number" && Number.isFinite(core.familyBinStep) &&
		(core.familyBinStep as number) > 0 && Array.isArray(core.bundles) && isObject(core.summary),
		`${label} midpoint-aware v3 core/materialization policy identity is invalid`)
	const coreBundles = core.bundles as unknown[]
	const coreBundleIds = coreBundles.map((bundle) => isObject(bundle) ? bundle.id : null)
	const coreCandidateCount = coreBundles.reduce((count, bundle) =>
		count + (isObject(bundle) && Array.isArray(bundle.candidates) ? bundle.candidates.length : 0), 0)
	invariant(coreBundleIds.every((id) => typeof id === "string" && id.length > 0) &&
		new Set(coreBundleIds).size === coreBundleIds.length && coreBundles.every((bundle) =>
			isObject(bundle) && isObject(bundle.path) && Array.isArray(bundle.path.stages) &&
			pathSpatialCenterMatchesDiscoveryGeometry(bundle.path as never) &&
			bundle.path.stages.every((stage) => isObject(stage) &&
				typeof stage.colorPosition === "number" && Number.isFinite(stage.colorPosition)) &&
			Array.isArray(bundle.candidates) &&
			bundle.candidates.every((candidate) => isObject(candidate) &&
				typeof candidate.id === "string" && candidate.id.length > 0) &&
			new Set((bundle.candidates as JsonObject[]).map(({ id }) => id)).size === bundle.candidates.length) &&
		core.summary.inputPathCount === coreBundles.length &&
		core.summary.eligiblePathCount === coreBundles.filter((bundle) =>
			isObject(bundle) && bundle.eligible === true).length &&
		core.summary.candidateCount === coreCandidateCount,
		`${label} midpoint-aware v3 core render domain is invalid`)

	invariant(isObject(materialization) && Array.isArray(materialization.candidates) &&
		Array.isArray(materialization.eligibleCandidates) && isObject(materialization.diagnostics),
		`${label} midpoint-aware v3 materialization domain is missing`)
	const candidates = materialization.candidates as unknown[]
	const eligibleCandidates = materialization.eligibleCandidates as unknown[]
	const candidateKeys = candidates.map((candidate) => isObject(candidate) ? candidate.renderKey : null)
	const eligibleKeys = eligibleCandidates.map((candidate) => isObject(candidate) ? candidate.renderKey : null)
	invariant(candidateKeys.every((key) => typeof key === "string" && key.length > 0) &&
		new Set(candidateKeys).size === candidateKeys.length &&
		eligibleKeys.every((key) => typeof key === "string" && key.length > 0) &&
		new Set(eligibleKeys).size === eligibleKeys.length,
		`${label} midpoint-aware v3 materialization render keys are invalid or duplicated`)
	for (const candidateValue of candidates) {
		invariant(isObject(candidateValue) && typeof candidateValue.bundleId === "string" &&
			typeof candidateValue.publicTreatmentKey === "string" && isObject(candidateValue.treatment) &&
			treatmentKey(candidateValue.treatment) === candidateValue.publicTreatmentKey &&
			typeof candidateValue.roleBindingKey === "string" && candidateValue.roleBindingKey.length > 0 &&
			isObject(candidateValue.render) && typeof candidateValue.render.id === "string" &&
			candidateValue.renderKey === `${candidateValue.publicTreatmentKey}\0${candidateValue.render.id}` &&
			typeof candidateValue.eligible === "boolean" &&
			typeof candidateValue.withinQualityBound === "boolean" &&
			candidateValue.eligible === candidateValue.withinQualityBound &&
			candidateValue.withinMaterializationBounds === true,
			`${label} midpoint-aware v3 complete render candidate is malformed`)
		const matchingCoreBundles = coreBundles.filter((bundle) =>
			isObject(bundle) && bundle.id === candidateValue.bundleId)
		invariant(matchingCoreBundles.length === 1 && isObject(matchingCoreBundles[0]) &&
			Array.isArray(matchingCoreBundles[0].candidates) &&
			matchingCoreBundles[0].candidates.some((render) => sameValue(render, candidateValue.render)),
			`${label} midpoint-aware v3 complete render candidate escaped the v2 core domain`)
	}
	const expectedCandidates = [...candidates].sort((first, second) =>
		compareCompleteRenderCandidates(first as never, second as never))
	invariant(sameOrderedValues(candidates, expectedCandidates),
		`${label} midpoint-aware v3 candidates are not in generation order`)
	const expectedEligible = candidates.filter((candidate) => isObject(candidate) &&
		candidate.eligible === true && candidate.withinMaterializationBounds === true)
	invariant(sameOrderedValues(eligibleCandidates, expectedEligible),
		`${label} midpoint-aware v3 eligible candidate domain is stale`)
	const expectedSelected = eligibleCandidates[0] ?? null
	invariant(sameValue(materialization.selected, expectedSelected) &&
		root.applicable === (expectedSelected !== null),
		`${label} midpoint-aware v3 materializer selection is stale`)

	const diagnostics = materialization.diagnostics
	const bundleDiagnostics = diagnostics.bundles
	const bounds = {
		bundleCountWithinBound:
			coreBundles.length <= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY.maximumBundles,
		renderCandidatesPerBundleWithinBound: coreBundles.every((bundle) => isObject(bundle) &&
			Array.isArray(bundle.candidates) && bundle.candidates.length <=
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
					.maximumRenderCandidatesPerBundle),
		completeRenderCandidateCountWithinBound: candidates.length <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY
				.maximumCompleteRenderCandidates,
	}
	invariant(diagnostics.version ===
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_ID &&
		sameValue(diagnostics.policy,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY) &&
		sameValue(diagnostics.formulas,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_FORMULAS) &&
		diagnostics.inputBundleCount === coreBundles.length &&
		diagnostics.inputRenderCandidateCount === coreCandidateCount &&
		diagnostics.completeRenderCandidateCount === candidates.length &&
		diagnostics.qualityEligibleCompleteRenderCandidateCount === eligibleCandidates.length &&
		diagnostics.completeCrossProductCount === candidates.length &&
		diagnostics.publicTreatmentStateDerivedHere === false &&
		Object.values(bounds).every((value) => value) && sameValue(diagnostics.bounds, bounds) &&
		isObject(root.checks) &&
		sameValue(root.checks.materializationBounds, bounds) && Array.isArray(bundleDiagnostics) &&
		bundleDiagnostics.length === coreBundles.length,
		`${label} midpoint-aware v3 materialization diagnostics are stale`)
	const diagnosticBundleIds = (bundleDiagnostics as unknown[]).map((bundle) =>
		isObject(bundle) ? bundle.bundleId : null)
	invariant(diagnosticBundleIds.every((id) => typeof id === "string" && id.length > 0) &&
		new Set(diagnosticBundleIds).size === diagnosticBundleIds.length &&
		sameUniqueStrings(diagnosticBundleIds, coreBundleIds as string[]),
		`${label} midpoint-aware v3 materialization bundle domain is stale`)

	let materializedBundleCount = 0
	let rejectedBundleCount = 0
	let sharedRoleBindingCount = 0
	let completeCrossProductCount = 0
	for (const bundleValue of bundleDiagnostics as unknown[]) {
		invariant(isObject(bundleValue), `${label} midpoint-aware v3 materialization bundle is invalid`)
		const coreBundle = coreBundles.find((bundle) =>
			isObject(bundle) && bundle.id === bundleValue.bundleId) as JsonObject
		const bundleCandidates = candidates.filter((candidate) =>
			isObject(candidate) && candidate.bundleId === bundleValue.bundleId) as JsonObject[]
		const completeRenderKeys = bundleCandidates.map(({ renderKey }) => renderKey as string)
		const coreRenderIds = (coreBundle.candidates as JsonObject[]).map(({ id }) => id as string).sort()
		const materialized = bundleValue.status === "materialized"
		const rejected = bundleValue.status === "rejected"
		invariant((materialized || rejected) && bundleValue.eligible === materialized &&
			Array.isArray(bundleValue.sharedRoleBindings) &&
			bundleValue.sharedRoleBindings.every((binding) =>
				isObject(binding) && typeof binding.key === "string" && binding.key.length > 0) &&
			bundleValue.sharedRoleBindingCount === bundleValue.sharedRoleBindings.length &&
			new Set((bundleValue.sharedRoleBindings as JsonObject[]).map(({ key }) => key)).size ===
				bundleValue.sharedRoleBindings.length &&
			bundleValue.completeCrossProductCount === bundleCandidates.length &&
			bundleValue.completeCrossProductCount === bundleValue.sharedRoleBindingCount *
				(coreBundle.candidates as unknown[]).length &&
			(materialized
				? bundleValue.sharedRoleBindingCount > 0 && Array.isArray(bundleValue.rejectionReasons) &&
					bundleValue.rejectionReasons.length === 0
				: bundleValue.sharedRoleBindingCount === 0 && bundleCandidates.length === 0 &&
					Array.isArray(bundleValue.rejectionReasons) && bundleValue.rejectionReasons.length > 0) &&
			sameUniqueStrings(bundleValue.completeRenderKeys, completeRenderKeys) &&
			sameUniqueStrings(bundleValue.preselectionRenderIds, coreRenderIds),
			`${label} midpoint-aware v3 per-bundle materialization domain is stale`)
		if (materialized) materializedBundleCount++
		if (rejected) rejectedBundleCount++
		sharedRoleBindingCount += bundleValue.sharedRoleBindingCount as number
		completeCrossProductCount += bundleValue.completeCrossProductCount as number
		const selected = expectedSelected !== null && isObject(expectedSelected) &&
			expectedSelected.bundleId === bundleValue.bundleId ? expectedSelected : null
		const selectedBindings = (bundleValue.sharedRoleBindings as unknown[]).filter((binding) =>
			isObject(binding) && binding.selected === true)
		invariant(selected === null
			? bundleValue.selectedRoleBindingKey === null &&
				Array.isArray(bundleValue.selectedRoleCustody) && bundleValue.selectedRoleCustody.length === 0 &&
				selectedBindings.length === 0
			: bundleValue.selectedRoleBindingKey === selected.roleBindingKey &&
				sameValue(bundleValue.selectedRoleCustody, selected.roleCustody) &&
				selectedBindings.length === 1 && isObject(selectedBindings[0]) &&
				selectedBindings[0].key === selected.roleBindingKey,
			`${label} midpoint-aware v3 per-bundle selected binding is stale`)
	}
	invariant(diagnostics.materializedBundleCount === materializedBundleCount &&
		diagnostics.rejectedBundleCount === rejectedBundleCount &&
		diagnostics.sharedRoleBindingCount === sharedRoleBindingCount &&
		diagnostics.completeCrossProductCount === completeCrossProductCount &&
		diagnostics.selectedRenderKey === (isObject(expectedSelected) ? expectedSelected.renderKey : null) &&
		diagnostics.selectedPublicTreatmentKey ===
			(isObject(expectedSelected) ? expectedSelected.publicTreatmentKey : null) &&
		diagnostics.selectedRenderId ===
			(isObject(expectedSelected) && isObject(expectedSelected.render) ? expectedSelected.render.id : null) &&
		root.qualityFloor === diagnostics.qualityFloor,
		`${label} midpoint-aware v3 materialization totals or selection are stale`)
	validateMidpointAwareV3BaselineAuthority(root, diagnostics, expectedSelected, label)

	const expectedNoOpReason = coreBundles.length === 0
		? "no-core-field-render-bundles"
		: candidates.length === 0
			? "no-path-bound-complete-render-candidates"
			: eligibleCandidates.length === 0
				? "no-quality-eligible-path-bound-render-candidate"
				: null
	return { core, materialization, diagnostics, candidates, eligibleCandidates,
		selected: expectedSelected, expectedNoOpReason }
}

function validateMidpointAwareV3NoOp(
	output: JsonObject,
	root: JsonObject,
	expectedNoOpReason: string | null,
	label: string,
): void {
	const control = root.controlIntegratedResult
	const outputAlternatives = output.alternatives
	const controlAlternatives = isObject(control) ? control.alternatives : null
	const materialization = root.pathBoundMaterialization
	const selector = root.selector
	const dimensions = output.dimensions
	invariant(expectedNoOpReason !== null && root.noOpReason === expectedNoOpReason &&
		root.renderProjection === null && root.selectedRenderKey === null &&
		root.selectedPublicTreatmentKey === null && root.selectedRenderKind === null &&
		root.selectedRenderFidelity === null && root.selectedAuthority === null &&
		root.sourceToOutputCustody === null && root.qualityLossFromBaseline === null &&
		isObject(materialization) && materialization.selected === null && isObject(materialization.diagnostics) &&
		materialization.diagnostics.selectedRenderKey === null &&
		materialization.diagnostics.selectedPublicTreatmentKey === null &&
		materialization.diagnostics.selectedRenderId === null && isObject(selector) &&
		selector.selectedRecoveryEvaluation === null && isObject(control) &&
		isObject(dimensions) && dimensions.width === control.width && dimensions.height === control.height &&
		matchesControlTreatment(output.winner, control.winner) && Array.isArray(outputAlternatives) &&
		Array.isArray(controlAlternatives) && outputAlternatives.length === controlAlternatives.length &&
		outputAlternatives.every((entry, index) =>
			matchesControlTreatment(entry, (controlAlternatives as unknown[])[index])),
		`${label} midpoint-aware v3 no-op changed control public output or carries render authority`)
	const winner = output.winner as JsonObject
	const slateKeys = (outputAlternatives as unknown[]).map((entry) => (entry as JsonObject).key)
	const controlWinnerKey = treatmentKey(control.winner as JsonObject)
	const controlSlateKeys = (controlAlternatives as JsonObject[]).map(treatmentKey)
	invariant(root.outputPublicTreatmentKey === winner.key &&
		root.currentIntegratedWinnerKey === controlWinnerKey &&
		Array.isArray(root.currentIntegratedSlateKeys) &&
		sameNumbers(root.currentIntegratedSlateKeys, controlSlateKeys) &&
		Array.isArray(root.outputSlateKeys) && sameNumbers(root.outputSlateKeys, slateKeys) &&
		isObject(root.checks) && Object.entries(root.checks).every(([key, value]) =>
			key === "materializationBounds"
				? isObject(value) && Object.values(value).every((entry) => entry === true)
				: value === true),
		`${label} midpoint-aware v3 no-op output keys are stale`)
}

function validateV3ExactStop(
	value: unknown,
	width: number,
	height: number,
	label: string,
): JsonObject {
	const stop = validateExactStop(value, width, height, label)
	invariant((stop.position as number) >= 0 && (stop.position as number) <= 1 &&
		(stop.sourceSpatialPosition as number) >= 0 && (stop.sourceSpatialPosition as number) <= 1 &&
		(stop.sourceColorPosition as number) >= 0 && (stop.sourceColorPosition as number) <= 1,
		`${label} stop coordinates are out of bounds`)
	return stop
}

function validateV3RoleCustody(
	value: unknown,
	winner: JsonObject,
	winnerFamilyRoles: JsonObject,
	endpointStops: readonly JsonObject[],
	endpointRoles: readonly (typeof ROLES[number])[],
	width: number,
	height: number,
	label: string,
): void {
	invariant(Array.isArray(value) && value.length === ROLES.length,
		`${label} selected role custody is invalid`)
	for (const [index, role] of ROLES.entries()) {
		const custody = value[index]
		const color = winner[role]
		invariant(isObject(custody) && custody.role === role && validRoleColor(color) &&
			okDistance(rgbToOKLab(color.rgb as [number, number, number]),
				color.oklab as [number, number, number]) <= 0.000001 &&
			custody.endpoint === (role === "background" || role === "surface") &&
			typeof winnerFamilyRoles[role] === "string" && custody.familyId === winnerFamilyRoles[role] &&
			typeof custody.componentId === "string" && custody.componentId.length > 0 &&
			Number.isSafeInteger(custody.componentStartPixelIndex) &&
			(custody.componentStartPixelIndex as number) >= 0 &&
			(custody.componentStartPixelIndex as number) < width * height &&
			Number.isSafeInteger(custody.componentPopulation) &&
			(custody.componentPopulation as number) > 0 &&
			typeof custody.componentQuadrantCoverage === "number" &&
			Number.isFinite(custody.componentQuadrantCoverage) &&
			(custody.componentQuadrantCoverage as number) >= 0 &&
			(custody.componentQuadrantCoverage as number) <= 1 && isObject(custody.exemplar) &&
			Number.isSafeInteger(custody.exemplar.x) && Number.isSafeInteger(custody.exemplar.y) &&
			(custody.exemplar.x as number) >= 0 && (custody.exemplar.x as number) < width &&
			(custody.exemplar.y as number) >= 0 && (custody.exemplar.y as number) < height &&
			Array.isArray(custody.supportRegionIds) && custody.supportRegionIds.length > 0 &&
			custody.supportRegionIds.every((regionId) => typeof regionId === "string" && regionId.length > 0) &&
			isObject(color.support) && color.support.exactSource === true &&
			color.support.anchorFamilyId === winnerFamilyRoles[role] &&
			isObject(color.support.exemplar) && color.support.exemplar.x === custody.exemplar.x &&
			color.support.exemplar.y === custody.exemplar.y &&
			sameNumbers(color.support.regionIds, custody.supportRegionIds),
			`${label} selected ${role} role custody is stale`)
		const endpointIndex = endpointRoles.indexOf(role)
		if (endpointIndex >= 0) {
			const stop = endpointStops[endpointIndex]
			const exactColor = stop.exactColor as JsonObject
			const provenance = exactColor.provenance as JsonObject
			invariant(custody.familyId === stop.familyId && color.hex === exactColor.hex &&
				sameNumbers(color.rgb, exactColor.rgb) && sameNumbers(color.oklab, exactColor.oklab) &&
				custody.exemplar.x === provenance.x && custody.exemplar.y === provenance.y &&
				sameNumbers(custody.supportRegionIds, [stop.regionId]),
				`${label} selected endpoint role binding is stale`)
		}
	}
}

function projectMidpointAwareV3ResearchRender(
	output: JsonObject,
	root: JsonObject,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	const domain = validateMidpointAwareV3MaterializationDomain(root, label)
	if (root.applicable === false) {
		validateMidpointAwareV3NoOp(output, root, domain.expectedNoOpReason, label)
		return undefined
	}
	invariant(root.applicable === true && root.noOpReason === null,
		`${label} midpoint-aware v3 projection is not applicable`)
	const winnerEntry = output.winner
	const alternatives = output.alternatives
	const projection = root.renderProjection
	const materialization = domain.materialization
	const authority = root.selectedAuthority
	const sourceToOutput = root.sourceToOutputCustody
	invariant(isObject(winnerEntry) && typeof winnerEntry.key === "string" &&
		isObject(winnerEntry.treatment) && Array.isArray(alternatives) && alternatives.length > 0 &&
		isObject(projection) && projection.version === MIDPOINT_AWARE_V3_PROJECTION_ID &&
		isObject(materialization) && isObject(authority) && isObject(sourceToOutput),
		`${label} is missing midpoint-aware v3 selected render authority`)
	const winnerKey = winnerEntry.key
	const winner = winnerEntry.treatment
	invariant(ROLES.every((role) => validRoleColor(winner[role])) &&
		typeof winner.gradient === "boolean" && isObject(winner.familyRoles) &&
		treatmentKey(winner) === winnerKey &&
		alternatives.every((entry) => isObject(entry) && typeof entry.key === "string" &&
			isObject(entry.treatment) && treatmentKey(entry.treatment) === entry.key) &&
		(alternatives[0] as JsonObject).key === winnerKey &&
		sameValue((alternatives[0] as JsonObject).treatment, winner) &&
		new Set((alternatives as JsonObject[]).map(({ key }) => key)).size === alternatives.length &&
		root.outputPublicTreatmentKey === winnerKey && Array.isArray(root.outputSlateKeys) &&
		sameNumbers(root.outputSlateKeys, (alternatives as JsonObject[]).map(({ key }) => key)),
		`${label} midpoint-aware v3 public treatment projection is stale`)
	const winnerFamilyRoles = winner.familyRoles as JsonObject

	const width = (output.dimensions as JsonObject).width
	const height = (output.dimensions as JsonObject).height
	invariant(Number.isSafeInteger(width) && (width as number) > 0 && Number.isSafeInteger(height) &&
		(height as number) > 0 && Number.isSafeInteger((width as number) * (height as number)),
		`${label} midpoint-aware v3 output dimensions are invalid`)
	const imageWidth = width as number
	const imageHeight = height as number

	const selected = domain.selected
	invariant(isObject(selected) && selected.eligible === true && selected.withinQualityBound === true,
		`${label} midpoint-aware v3 selected candidate is missing or ineligible`)
	const selectedRender = selected.render
	const pathLineage = selected.pathLineage
	const core = domain.core
	invariant(isObject(selectedRender) && isObject(pathLineage) && isObject(core) &&
		isObject(core.identity) && core.identity.version === 2 &&
		core.identity.evaluatorId === FIELD_RENDER_CANDIDATE_ID && isObject(core.diagnostics) &&
		isObject(core.diagnostics.identity) && core.diagnostics.identity.version === 2 &&
		core.diagnostics.identity.evaluatorId === FIELD_RENDER_CANDIDATE_ID &&
		typeof core.familyBinStep === "number" && Number.isFinite(core.familyBinStep) &&
		(core.familyBinStep as number) > 0 && Array.isArray(core.bundles) && isObject(core.summary) &&
		core.summary.inputPathCount === core.bundles.length &&
		core.summary.eligiblePathCount === core.bundles.filter((bundle) => isObject(bundle) && bundle.eligible === true).length &&
		core.summary.candidateCount === core.bundles.reduce((count, bundle) =>
			count + (isObject(bundle) && Array.isArray(bundle.candidates) ? bundle.candidates.length : 0), 0),
		`${label} midpoint-aware v3 core render evaluation is invalid`)
	const coreBundles = (core.bundles as unknown[]).filter((bundle) =>
		isObject(bundle) && bundle.id === selected.bundleId)
	invariant(coreBundles.length === 1 && isObject(coreBundles[0]) && Array.isArray(coreBundles[0].candidates) &&
		coreBundles[0].candidates.filter((candidate) => sameValue(candidate, selectedRender)).length === 1,
		`${label} midpoint-aware v3 selected render is not in the v2 core candidate domain`)
	const coreBundle = coreBundles[0]
	invariant(isObject(coreBundle.path) && Array.isArray(selectedRender.endpoints) &&
		selectedRender.endpoints.length === 2, `${label} midpoint-aware v3 selected render endpoints are missing`)
	const recomputedBundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		coreBundle.path as never,
		(selectedRender.endpoints as unknown[]).map((stop) => isObject(stop) ? {
			familyId: stop.familyId,
			regionId: stop.regionId,
			exactColor: stop.exactColor,
		} : null) as never,
		core.familyBinStep as number,
	)
	invariant(sameValue(recomputedBundle, coreBundle),
		`${label} midpoint-aware v3 selected v2 core candidate is stale`)

	const kind = selectedRender.kind
	invariant(kind === "flat" || kind === "supported-two-stop" || kind === "supported-three-stop",
		`${label} midpoint-aware v3 render kind is invalid`)
	const gradient = kind !== "flat"
	invariant(typeof selectedRender.id === "string" && selectedRender.id.length > 0 &&
		isObject(selectedRender.fidelity) &&
		["massRMSE", "stageRMSE", "weightedP90", "sigma", "value", "level", "quantizedValue"]
			.every((key) => typeof selectedRender.fidelity[key] === "number" &&
				Number.isFinite(selectedRender.fidelity[key])) &&
		(selectedRender.fidelity.sigma as number) > 0 && Array.isArray(selectedRender.fidelity.stageErrors) &&
		selectedRender.fidelity.stageErrors.every((entry) => isObject(entry) &&
			Number.isSafeInteger(entry.stageIndex) && typeof entry.spatialPosition === "number" &&
			Number.isFinite(entry.spatialPosition) && (entry.spatialPosition as number) >= 0 &&
			(entry.spatialPosition as number) <= 1 && typeof entry.populationFraction === "number" &&
			Number.isFinite(entry.populationFraction) && (entry.populationFraction as number) > 0 &&
			(entry.populationFraction as number) <= 1 && typeof entry.distance === "number" &&
			Number.isFinite(entry.distance) && (entry.distance as number) >= 0),
		`${label} midpoint-aware v3 render fidelity is invalid`)

	const sourcePath = coreBundle.path
	invariant(pathLineage.bundleId === selected.bundleId &&
		pathLineage.fieldDomainId === sourcePath.fieldDomainId && pathLineage.topology === sourcePath.topology &&
		pathLineage.direction === sourcePath.direction && Array.isArray(pathLineage.stages) &&
		pathLineage.stages.length >= 2 && Array.isArray(sourcePath.stages) &&
		pathLineage.stages.length === sourcePath.stages.length,
		`${label} midpoint-aware v3 path lineage is stale`)
	const stages = pathLineage.stages as unknown[]
	for (const [index, stageValue] of stages.entries()) {
		const sourceStage = sourcePath.stages[index]
		invariant(isObject(stageValue) && isObject(sourceStage) && stageValue.stageIndex === index &&
			stageValue.stageIndex === sourceStage.stageIndex && stageValue.familyId === sourceStage.familyId &&
			stageValue.regionId === sourceStage.regionId && stageValue.spatialPosition === sourceStage.spatialPosition &&
			stageValue.colorPosition === sourceStage.colorPosition && sameValue(stageValue.exactColor, sourceStage.exactColor) &&
			Number.isSafeInteger(stageValue.componentStartPixelIndex) &&
			(stageValue.componentStartPixelIndex as number) >= 0 &&
			(stageValue.componentStartPixelIndex as number) < imageWidth * imageHeight &&
			Number.isSafeInteger(stageValue.population) && (stageValue.population as number) > 0 &&
			["spatialPosition", "colorPosition", "populationFraction", "imagePopulationFraction", "quadrantCoverage"]
				.every((key) => typeof stageValue[key] === "number" && Number.isFinite(stageValue[key])) &&
			(stageValue.spatialPosition as number) >= 0 && (stageValue.spatialPosition as number) <= 1 &&
			(stageValue.populationFraction as number) > 0 && (stageValue.populationFraction as number) <= 1 &&
			(stageValue.imagePopulationFraction as number) > 0 &&
			(stageValue.imagePopulationFraction as number) <= 1 &&
			(stageValue.quadrantCoverage as number) >= 0 && (stageValue.quadrantCoverage as number) <= 1,
			`${label} midpoint-aware v3 path stage ${index} is invalid`)
		validateExactColor(stageValue.exactColor, stageValue.familyId as string,
			stageValue.regionId as string, imageWidth, imageHeight,
			`${label} midpoint-aware v3 path stage ${index}`)
	}
	const endpointStops = (selectedRender.endpoints as unknown[]).map((stop, index) => {
		const exact = validateV3ExactStop(stop, imageWidth, imageHeight,
			`${label} midpoint-aware v3 endpoint ${index}`)
		const stage = stages[index === 0 ? 0 : stages.length - 1] as JsonObject
		invariant(exact.position === index && exact.sourceColorPosition === index &&
			exact.sourceStageIndex === stage.stageIndex && exact.sourceSpatialPosition === stage.spatialPosition &&
			exact.familyId === stage.familyId && exact.regionId === stage.regionId &&
			sameValue(exact.exactColor, stage.exactColor),
			`${label} midpoint-aware v3 endpoint ${index} is not bound to its source path stage`)
		return exact
	})
	const exactMidpoint = selectedRender.midpoint
	let midpoint: JsonObject | null = null
	if (kind === "supported-three-stop") {
		midpoint = validateV3ExactStop(exactMidpoint, imageWidth, imageHeight,
			`${label} midpoint-aware v3 midpoint`)
		const stageIndex = midpoint.sourceStageIndex as number
		const sourceStage = stages[stageIndex]
		invariant(midpoint.position === 0.5 && stageIndex > 0 && stageIndex < stages.length - 1 &&
			isObject(sourceStage) && midpoint.sourceSpatialPosition === sourceStage.spatialPosition &&
			midpoint.familyId === sourceStage.familyId &&
			midpoint.regionId === sourceStage.regionId && sameValue(midpoint.exactColor, sourceStage.exactColor) &&
			selectedRender.stopCount === 3 && Array.isArray(selectedRender.stops) &&
			sameValue(selectedRender.stops, [endpointStops[0], midpoint, endpointStops[1]]),
			`${label} midpoint-aware v3 three-stop render is inconsistent`)
	} else {
		invariant(exactMidpoint === null && selectedRender.stopCount === (gradient ? 2 : 0) &&
			Array.isArray(selectedRender.stops) &&
			sameValue(selectedRender.stops, gradient ? endpointStops : []),
			`${label} midpoint-aware v3 ${kind} render is inconsistent`)
	}
	invariant(sameValue(pathLineage.endpoints, endpointStops) &&
		sameValue(pathLineage.midpoint, exactMidpoint),
		`${label} midpoint-aware v3 path stop lineage is stale`)

	const sourceGradient = isObject(sourcePath.hypothesis) ? sourcePath.hypothesis.gradientEvidence : null
	const orientation = isObject(sourceGradient) ? sourceGradient.backgroundTopologyEndpoint : null
	invariant(orientation === "low" || orientation === "high",
		`${label} midpoint-aware v3 endpoint orientation is missing`)
	const endpointRoles = orientation === "low"
		? ["background", "surface"] as const
		: ["surface", "background"] as const
	for (const [index, role] of endpointRoles.entries()) {
		const stop = endpointStops[index]
		const exactColor = stop.exactColor as JsonObject
		const roleColor = winner[role] as JsonObject
		invariant(winnerFamilyRoles[role] === stop.familyId && roleColor.hex === exactColor.hex &&
			sameNumbers(roleColor.rgb, exactColor.rgb) && sameNumbers(roleColor.oklab, exactColor.oklab),
			`${label} midpoint-aware v3 selected public endpoint roles are stale`)
	}
	invariant(typeof selected.roleBindingKey === "string" && selected.roleBindingKey.length > 0 &&
		Array.isArray(selected.roleCustody), `${label} midpoint-aware v3 selected role binding is missing`)
	validateV3RoleCustody(selected.roleCustody, winner, winnerFamilyRoles, endpointStops,
		endpointRoles, imageWidth, imageHeight, label)

	invariant(selected.publicTreatmentKey === winnerKey &&
		selected.renderKey === `${selected.publicTreatmentKey}\0${selectedRender.id}` &&
		sameValue(selected.treatment, winner) && isObject(selected.recoveryEvaluation) &&
		selected.recoveryEvaluation.key === winnerKey &&
		sameValue(selected.recoveryEvaluation.treatment, selected.treatment) &&
		root.selectedRenderKey === selected.renderKey && root.selectedPublicTreatmentKey === winnerKey &&
		root.selectedRenderKind === kind && sameValue(root.selectedRenderFidelity, selectedRender.fidelity) &&
		projection.renderKey === selected.renderKey && projection.sourcePublicTreatmentKey === winnerKey &&
		projection.outputPublicTreatmentKey === winnerKey && projection.renderKind === kind &&
		sameValue(projection.exactEndpoints, endpointStops) && sameValue(projection.exactMidpoint, exactMidpoint) &&
		sameValue(projection.pathLineage, pathLineage) &&
		sameValue(projection.ordinaryCompleteLineage, selected.ordinaryCompleteLineage) &&
		sameValue(projection.numericsCustody, selected.numericsCustody),
		`${label} midpoint-aware v3 selected render and projection disagree`)

	invariant(authority.renderKey === selected.renderKey && authority.publicTreatmentKey === winnerKey &&
		authority.renderKind === kind && authority.renderId === selectedRender.id &&
		sameValue(authority.fidelity, selectedRender.fidelity) && sameValue(authority.pathLineage, pathLineage) &&
		sameValue(authority.ordinaryCompleteLineage, selected.ordinaryCompleteLineage) &&
		sameValue(authority.numericsCustody, selected.numericsCustody) &&
		sameValue(authority.recoveryEvaluation, selected.recoveryEvaluation) &&
		authority.qualityLossFromBaseline === selected.qualityLossFromBaseline &&
		authority.qualityFloor === selected.qualityFloor && authority.withinQualityBound === true &&
		authority.roleBindingKey === selected.roleBindingKey &&
		sameValue(authority.roleCustody, selected.roleCustody) &&
		sourceToOutput.renderKey === selected.renderKey &&
		sourceToOutput.sourcePublicTreatmentKey === winnerKey &&
		sourceToOutput.outputPublicTreatmentKey === winnerKey &&
		sourceToOutput.roleBindingKey === selected.roleBindingKey &&
		sameValue(sourceToOutput.roleCustody, selected.roleCustody) &&
		sameValue(sourceToOutput.pathLineage, pathLineage),
		`${label} midpoint-aware v3 selected complete-render authority is stale`)

	const numerics = selected.numericsCustody
	const expectedNumericsSource = kind === "flat"
		? "independently-generated-flat-endpoint-treatment"
		: kind === "supported-two-stop"
			? "independently-generated-endpoint-gradient-treatment"
			: "reused-endpoint-gradient-treatment-for-three-stop-render"
	const selector = root.selector
	invariant(isObject(numerics) && numerics.completeTreatmentSource === expectedNumericsSource &&
		numerics.contrastAndQualityIndependentlyGeneratedForThisRender === (kind !== "supported-three-stop") &&
		numerics.threeStopAPCARecomputed === false && numerics.renderFidelitySeparatelyScored === true &&
		root.numericsModeMatchesSelectedBase === true && isObject(winner.contrast) && isObject(winner.scores) &&
		isObject(projection.qualityCustody) &&
		projection.qualityCustody.source === "selected-path-bound-recovery-evaluation" &&
		sameValue(projection.qualityCustody.evaluation, selected.recoveryEvaluation) &&
		projection.qualityCustody.recomputedAfterRenderSelection === false &&
		isObject(projection.contrastCustody) &&
		projection.contrastCustody.source === expectedNumericsSource &&
		sameValue(projection.contrastCustody.contrast, winner.contrast) &&
		projection.contrastCustody.recomputedAfterRenderSelection === false &&
		projection.contrastCustody.threeStopAPCARecomputed === false && isObject(selector) &&
		sameValue(selector.selectedRecoveryEvaluation, selected.recoveryEvaluation),
		`${label} midpoint-aware v3 selected numerics custody is stale`)

	const ordinary = selected.ordinaryCompleteLineage
	invariant(isObject(ordinary) && isObject(ordinary.descriptor) &&
		sameValue(ordinary.descriptor.treatment, selected.treatment) &&
		isObject(ordinary.descriptor.fieldHypothesis) &&
		ordinary.descriptor.fieldHypothesis.id === winner.sourceFieldHypothesisId &&
		isObject(ordinary.descriptor.lineage) && ordinary.descriptor.lineage.sourceConnected === true &&
		ordinary.descriptor.lineage.fieldHypothesisId === winner.sourceFieldHypothesisId &&
		isObject(ordinary.evaluation) && ordinary.evaluation.ordinaryEligible === true &&
		isObject(ordinary.candidateEligibility) && ordinary.candidateEligibility.eligible === true &&
		ordinary.candidateEligibility.basis === ORDINARY_SOURCE_LINEAGE,
		`${label} midpoint-aware v3 ordinary complete lineage is stale`)

	const materializationDiagnostics = materialization.diagnostics
	const materializedBundleDiagnostics = isObject(materializationDiagnostics) &&
		Array.isArray(materializationDiagnostics.bundles)
		? materializationDiagnostics.bundles.filter((bundle) =>
			isObject(bundle) && bundle.bundleId === selected.bundleId)
		: []
	invariant(isObject(materializationDiagnostics) &&
		materializationDiagnostics.selectedRenderKey === selected.renderKey &&
		materializationDiagnostics.selectedPublicTreatmentKey === winnerKey &&
		materializationDiagnostics.selectedRenderId === selectedRender.id &&
		materializationDiagnostics.publicTreatmentStateDerivedHere === false &&
		isObject(materializationDiagnostics.bounds) &&
		Object.values(materializationDiagnostics.bounds).every((value) => value === true) &&
		materializedBundleDiagnostics.length === 1 && isObject(materializedBundleDiagnostics[0]) &&
		materializedBundleDiagnostics[0].selectedRoleBindingKey === selected.roleBindingKey &&
		sameValue(materializedBundleDiagnostics[0].selectedRoleCustody, selected.roleCustody) &&
		Array.isArray(materializedBundleDiagnostics[0].completeRenderKeys) &&
		materializedBundleDiagnostics[0].completeRenderKeys.includes(selected.renderKey) &&
		isObject(root.checks) && Object.entries(root.checks).every(([key, value]) =>
			key === "materializationBounds"
				? isObject(value) && Object.values(value).every((entry) => entry === true)
				: value === true),
		`${label} midpoint-aware v3 materialization selection is stale`)

	invariant(winner.gradient === gradient &&
		winner.fieldTreatment === (gradient ? "gradient-field" : "separate-flat-fields") &&
		(gradient ? isObject(winner.gradientEvidence) : winner.gradientEvidence === null),
		`${label} midpoint-aware v3 render kind and final gradient disagree`)
	if (gradient) {
		const evidence = winner.gradientEvidence as JsonObject
		invariant(evidence.backgroundTopologyEndpoint === orientation &&
			evidence.fieldDomainId === pathLineage.fieldDomainId && evidence.topology === pathLineage.topology &&
			evidence.direction === pathLineage.direction && Array.isArray(evidence.supportingFamilyIds) &&
			sameNumbers(evidence.supportingFamilyIds, endpointStops.map(({ familyId }) => familyId)) &&
			Array.isArray(evidence.supportingEndpointHexes) &&
			sameNumbers(evidence.supportingEndpointHexes,
				endpointStops.map(({ exactColor }) => (exactColor as JsonObject).hex)),
			`${label} midpoint-aware v3 final gradient evidence is stale`)
	}
	if (kind !== "supported-three-stop") return undefined
	const color = midpoint!.exactColor as JsonObject
	invariant(color.hex !== (winner.background as JsonObject).hex &&
		color.hex !== (winner.surface as JsonObject).hex,
		`${label} midpoint-aware v3 midpoint aliases a selected public role`)
	return {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: color.hex as string, position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	}
}

function projectMidpointAwareResearchRender(
	output: unknown,
	identity: Readonly<{ configurationId: string }>,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	invariant(isObject(output) && isObject(output.winner) && isObject(output.winner.treatment) &&
		isObject(output.diagnostics) && isObject(output.dimensions),
		`${label} is missing midpoint-aware output custody`)
	const root = output.diagnostics.phase3MidpointAwareRenderCandidate
	invariant(isObject(root) && root.configurationId === identity.configurationId,
		`${label} midpoint-aware diagnostics do not match the attempt identity`)
	if (root.version === MIDPOINT_AWARE_V3_DIAGNOSTICS_ID) {
		invariant(root.configurationId ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
			`${label} midpoint-aware v3 diagnostics do not use the current fixed configuration`)
		return projectMidpointAwareV3ResearchRender(output, root, label)
	}
	invariant(root.version ===
		"album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-diagnostics-v2",
		`${label} midpoint-aware diagnostics do not match the attempt identity`)
	if (root.applicable === false) {
		validateMidpointAwareNoOp(output, root, label)
		return undefined
	}
	invariant(root.applicable === true && root.noOpReason === null,
		`${label} midpoint-aware projection is not applicable`)

	const winnerKey = output.winner.key
	const winner = output.winner.treatment
	const projection = root.renderProjection
	const selectedRender = root.selectedRender
	invariant(typeof winnerKey === "string" && isObject(projection) && isObject(selectedRender) &&
		projection.version === MIDPOINT_AWARE_PROJECTION_ID && root.outputWinnerKey === winnerKey &&
		projection.outputKey === winnerKey && root.baselineWinnerKey === projection.sourceKey,
		`${label} midpoint-aware output winner authority is stale`)
	invariant(ROLES.every((role) => validRoleColor(winner[role])) &&
		typeof winner.gradient === "boolean" && isObject(winner.familyRoles),
		`${label} midpoint-aware winner roles are invalid`)
	const winnerFamilyRoles = winner.familyRoles as JsonObject
	invariant(treatmentKey(winner) === winnerKey,
		`${label} midpoint-aware output winner key is stale`)

	const width = output.dimensions.width
	const height = output.dimensions.height
	invariant(Number.isSafeInteger(width) && (width as number) > 0 && Number.isSafeInteger(height) &&
		(height as number) > 0, `${label} midpoint-aware output dimensions are invalid`)
	const imageWidth = width as number
	const imageHeight = height as number
	const kind = selectedRender.kind
	invariant(kind === "flat" || kind === "supported-two-stop" || kind === "supported-three-stop",
		`${label} midpoint-aware render kind is invalid`)
	invariant(projection.renderKind === kind && projection.qualityAndContrastReevaluated === false &&
		projection.qualityCustody === "pre-render-selector-diagnostics" &&
		projection.contrastCustody === "provisional-treatment-diagnostics",
		`${label} midpoint-aware render projection is stale`)

	const selectedPath = root.selectedPath
	const selectedBundle = root.selectedBundle
	const reEvaluatedBundle = root.reEvaluatedBundle
	const provisional = root.provisionalTreatment
	invariant(isObject(selectedPath) && selectedPath.eligible === true && selectedPath.connected === true &&
		Array.isArray(selectedPath.stages) && selectedPath.stages.length >= 2 &&
		isObject(selectedPath.hypothesis) && isObject(selectedPath.hypothesis.gradientEvidence) &&
		isObject(selectedBundle) && isObject(reEvaluatedBundle) && isObject(provisional) &&
		provisional.gradient === true && isObject(provisional.gradientEvidence) &&
		isObject(provisional.familyRoles), `${label} is missing exact midpoint-aware path custody`)
	const stages = selectedPath.stages as unknown[]
	const provisionalFamilyRoles = provisional.familyRoles as JsonObject
	invariant(ROLES.every((role) => {
		const sourceColor = provisional[role]
		const outputColor = winner[role]
		return validRoleColor(sourceColor) && validRoleColor(outputColor) &&
			sameNumbers(sourceColor.rgb, outputColor.rgb) &&
			sameNumbers(sourceColor.oklab, outputColor.oklab) && sourceColor.hex === outputColor.hex &&
			provisionalFamilyRoles[role] === winnerFamilyRoles[role]
	}),
		`${label} midpoint-aware provisional role custody is stale`)
	invariant(treatmentKey(provisional) === projection.sourceKey &&
		typeof winner.sourceFieldHypothesisId === "string" &&
		winner.sourceFieldHypothesisId === provisional.sourceFieldHypothesisId &&
		selectedPath.hypothesis.id === winner.sourceFieldHypothesisId,
		`${label} midpoint-aware source treatment custody is stale`)

	const provisionalGradient = provisional.gradientEvidence
	const pathGradient = selectedPath.hypothesis.gradientEvidence
	const orientation = provisionalGradient.backgroundTopologyEndpoint
	invariant((orientation === "low" || orientation === "high") &&
		pathGradient.backgroundTopologyEndpoint === orientation &&
		selectedPath.fieldDomainId === provisionalGradient.fieldDomainId &&
		pathGradient.fieldDomainId === provisionalGradient.fieldDomainId &&
		selectedPath.topology === provisionalGradient.topology &&
		pathGradient.topology === provisionalGradient.topology &&
		selectedPath.direction === provisionalGradient.direction &&
		pathGradient.direction === provisionalGradient.direction,
		`${label} midpoint-aware path binding is stale`)
	const endpointRoles = orientation === "low"
		? ["background", "surface"] as const
		: ["surface", "background"] as const
	const endpointFamilies = endpointRoles.map((role) => winnerFamilyRoles[role])
	invariant(Array.isArray(selectedPath.endpointFamilyIds) &&
		sameNumbers(selectedPath.endpointFamilyIds, endpointFamilies) &&
		Array.isArray(provisionalGradient.supportingFamilyIds) &&
		sameNumbers(provisionalGradient.supportingFamilyIds, endpointFamilies) &&
		Array.isArray(pathGradient.supportingFamilyIds) &&
		sameNumbers(pathGradient.supportingFamilyIds, endpointFamilies) &&
		Array.isArray(provisionalGradient.supportingEndpointHexes) &&
		Array.isArray(pathGradient.supportingEndpointHexes) &&
		sameNumbers(provisionalGradient.supportingEndpointHexes, pathGradient.supportingEndpointHexes),
		`${label} midpoint-aware endpoint path binding is stale`)

	invariant(Array.isArray(selectedRender.endpoints) && selectedRender.endpoints.length === 2,
		`${label} midpoint-aware exact endpoints are missing`)
	const endpointStops = selectedRender.endpoints.map((stop, index) => {
		const exact = validateExactStop(stop, imageWidth, imageHeight,
			`${label} midpoint-aware endpoint ${index}`)
		const pathStage = index === 0 ? stages[0] : stages.at(-1)
		const roleColor = winner[endpointRoles[index]] as JsonObject
		invariant(isObject(pathStage) && exact.position === index && exact.sourceColorPosition === index &&
			exact.sourceStageIndex === pathStage.stageIndex &&
			exact.sourceSpatialPosition === pathStage.spatialPosition &&
			exact.familyId === pathStage.familyId && exact.regionId === pathStage.regionId &&
			exact.familyId === endpointFamilies[index] && isObject(exact.exactColor) &&
			exact.exactColor.hex === roleColor.hex && sameNumbers(exact.exactColor.rgb, roleColor.rgb) &&
			sameNumbers(exact.exactColor.oklab, roleColor.oklab),
			`${label} midpoint-aware endpoint ${index} is not the exact oriented winner role`)
		return exact
	})
	invariant(Array.isArray(root.exactEndpointCustody) && root.exactEndpointCustody.length === 2 &&
		root.exactEndpointCustody.every((entry, index) => isObject(entry) && isObject(entry.custody) &&
			entry.role === endpointRoles[index] && entry.familyId === endpointFamilies[index] &&
			entry.pathRegionId === endpointStops[index].regionId &&
			entry.derivedTransitionRegionId === endpointStops[index].regionId &&
			Number.isSafeInteger(entry.componentStartPixelIndex) &&
			(entry.componentStartPixelIndex as number) >= 0 && isObject(entry.exemplar) &&
			isObject(endpointStops[index].exactColor) && isObject(endpointStops[index].exactColor.provenance) &&
			entry.exemplar.x === endpointStops[index].exactColor.provenance.x &&
			entry.exemplar.y === endpointStops[index].exactColor.provenance.y &&
			entry.custody.familyId === endpointStops[index].familyId &&
			entry.custody.regionId === endpointStops[index].regionId &&
			sameValue(entry.custody.exactColor, endpointStops[index].exactColor)),
		`${label} midpoint-aware exact endpoint custody is stale`)

	const exactMidpoint = selectedRender.midpoint
	if (kind === "supported-three-stop") {
		const midpoint = validateExactStop(exactMidpoint, imageWidth, imageHeight,
			`${label} midpoint-aware midpoint`)
		const sourceStageIndex = midpoint.sourceStageIndex as number
		const sourceStage = stages[sourceStageIndex]
		const midpointColor = midpoint.exactColor as JsonObject
		invariant(midpoint.position === 0.5 && sourceStageIndex > 0 &&
			sourceStageIndex < stages.length - 1 && isObject(sourceStage) &&
			midpoint.sourceSpatialPosition === sourceStage.spatialPosition &&
			midpoint.familyId === sourceStage.familyId && midpoint.regionId === sourceStage.regionId &&
			sameValue(midpointColor, sourceStage.exactColor) &&
			ROLES.every((role) => midpointColor.hex !== (winner[role] as JsonObject).hex),
			`${label} midpoint-aware midpoint is stale or aliases a winner role`)
		invariant(selectedRender.stopCount === 3 && Array.isArray(selectedRender.stops) &&
			selectedRender.stops.length === 3 && sameValue(selectedRender.stops,
				[endpointStops[0], midpoint, endpointStops[1]]),
			`${label} midpoint-aware three-stop render is inconsistent`)
	} else {
		invariant(exactMidpoint === null && selectedRender.stopCount === (kind === "flat" ? 0 : 2) &&
			Array.isArray(selectedRender.stops) && sameValue(selectedRender.stops,
				kind === "flat" ? [] : endpointStops),
			`${label} midpoint-aware ${kind} render is inconsistent`)
	}

	invariant(Array.isArray(root.selectedEndpointStops) && sameValue(root.selectedEndpointStops, endpointStops) &&
		Array.isArray(projection.exactEndpoints) && sameValue(projection.exactEndpoints, endpointStops) &&
		sameValue(projection.exactMidpoint, exactMidpoint) &&
		sameValue(selectedBundle.path, selectedPath) &&
		sameValue(selectedBundle.selectedRender, selectedRender) &&
		sameValue(reEvaluatedBundle, selectedBundle),
		`${label} midpoint-aware selected render and projection disagree`)
	const candidateEvaluation = root.candidateEvaluation
	invariant(isObject(candidateEvaluation) && typeof candidateEvaluation.familyBinStep === "number" &&
		Number.isFinite(candidateEvaluation.familyBinStep) && candidateEvaluation.familyBinStep > 0,
		`${label} midpoint-aware candidate evaluation is invalid`)
	const recomputedBundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		selectedPath as never,
		endpointStops.map((stop) => ({
			familyId: stop.familyId,
			regionId: stop.regionId,
			exactColor: stop.exactColor,
		})) as never,
		candidateEvaluation.familyBinStep,
	)
	invariant(recomputedBundle.eligible && sameValue(recomputedBundle, selectedBundle),
		`${label} midpoint-aware exact path or render selection is stale`)

	const lineage = root.lineage
	invariant(root.lineageBasis === ORDINARY_SOURCE_LINEAGE &&
		projection.sourceLineageBasis === ORDINARY_SOURCE_LINEAGE && isObject(lineage) &&
		lineage.sourceConnected === true && isObject(lineage.eligibility) &&
		lineage.eligibility.key === projection.sourceKey && lineage.eligibility.eligible === true &&
		lineage.eligibility.basis === ORDINARY_SOURCE_LINEAGE &&
		Array.isArray(lineage.eligibility.descriptors) &&
		lineage.eligibility.descriptors.some((descriptor) => isObject(descriptor) &&
			descriptor.ordinaryEligible === true && descriptor.lineageSourceConnected === true) &&
		isObject(lineage.completeLineageCustody) &&
		lineage.completeLineageCustody.key === projection.sourceKey &&
		lineage.completeLineageCustody.winnerEligible === true,
		`${label} midpoint-aware source lineage is stale`)
	const provisionalCandidate = lineage.provisionalCandidate
	const descriptor = lineage.boundNativeTransitionDescriptor
	invariant(isObject(provisionalCandidate) && provisionalCandidate.key === projection.sourceKey &&
		sameValue(provisionalCandidate.treatment, provisional) && Array.isArray(provisionalCandidate.descriptors) &&
		isObject(descriptor) && descriptor.sourceType === "native-field-transition" &&
		Array.isArray(lineage.nativeTransitionDescriptors) && lineage.nativeTransitionDescriptors.length === 1 &&
		sameValue(lineage.nativeTransitionDescriptors[0], descriptor) &&
		provisionalCandidate.descriptors.some((candidate) => sameValue(candidate, descriptor)) &&
		sameValue(descriptor.treatment, provisional) &&
		sameValue(descriptor.fieldHypothesis, selectedPath.hypothesis) && isObject(descriptor.lineage) &&
		descriptor.lineage.sourceConnected === true &&
		descriptor.lineage.fieldHypothesisId === winner.sourceFieldHypothesisId,
		`${label} midpoint-aware native transition lineage is stale`)

	const expectedEndpointHexes = endpointStops.map((stop) => (stop.exactColor as JsonObject).hex)
	if (kind === "flat") {
		invariant(winner.gradient === false && winner.gradientEvidence === null,
			`${label} flat midpoint-aware render authority is stale`)
		return undefined
	}
	invariant(winner.gradient === true && isObject(winner.gradientEvidence) &&
		winner.gradientEvidence.backgroundTopologyEndpoint === orientation &&
		winner.gradientEvidence.fieldDomainId === provisionalGradient.fieldDomainId &&
		winner.gradientEvidence.topology === provisionalGradient.topology &&
		winner.gradientEvidence.direction === provisionalGradient.direction &&
		Array.isArray(winner.gradientEvidence.supportingFamilyIds) &&
		sameNumbers(winner.gradientEvidence.supportingFamilyIds, endpointFamilies) &&
		Array.isArray(winner.gradientEvidence.supportingEndpointHexes) &&
		sameNumbers(winner.gradientEvidence.supportingEndpointHexes, expectedEndpointHexes),
		`${label} gradient midpoint-aware render authority is stale`)
	if (kind === "supported-two-stop") return undefined
	const midpoint = selectedRender.midpoint as JsonObject
	const color = midpoint.exactColor as JsonObject
	return {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: color.hex as string, position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	}
}

function sameMidpoint(first: JsonObject, second: JsonObject): boolean {
	const firstColor = first.color
	const secondColor = second.color
	if (first.kind !== second.kind || first.position !== second.position ||
		!isObject(firstColor) || !isObject(secondColor) || firstColor.hex !== secondColor.hex ||
		!Array.isArray(firstColor.rgb) || !Array.isArray(secondColor.rgb) ||
		firstColor.rgb.length !== secondColor.rgb.length ||
		firstColor.rgb.some((channel, index) => channel !== (secondColor.rgb as unknown[])[index]) ||
		!isObject(first.provenance) || !isObject(second.provenance)) return false
	for (const key of ["exactSource", "familyId", "regionId", "pixelIndex", "x", "y", "fieldDomainId",
		"stageIndex", "spatialPosition", "colorPosition", "populationFraction"] as const) {
		if (first.provenance[key] !== second.provenance[key]) return false
	}
	return true
}

function projectSupportedGradientAuthorityResearchRender(
	output: JsonObject,
	authority: JsonObject,
	supported: JsonObject,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	invariant(isObject(authority) && isObject(supported) && Array.isArray(supported.paths),
		`${label} is missing supported-gradient render authority`)
	invariant(isObject(output.winner) && isObject(output.winner.treatment) && isObject(output.dimensions),
		`${label} is missing supported-gradient output custody`)
	const winnerKey = output.winner.key
	const winner = output.winner.treatment
	invariant(typeof winnerKey === "string" && authority.winnerKey === winnerKey,
		`${label} supported-gradient render authority is stale`)
	const midpoint = authority.midpoint
	if (isObject(midpoint) && midpoint.kind === "none") return undefined
	if (isObject(midpoint) && midpoint.kind === "ordinary-two-stop") {
		invariant(winner.gradient === true, `${label} ordinary two-stop authority is stale`)
		return undefined
	}
	invariant(winner.gradient === true, `${label} source-supported render authority is stale`)
	invariant(isObject(midpoint) && midpoint.kind === "source-supported-three-stop" && midpoint.position === 0.5 &&
		isObject(midpoint.color) && isObject(midpoint.provenance), `${label} has an invalid supported-gradient midpoint`)
	const color = midpoint.color
	const provenance = midpoint.provenance
	invariant(typeof color.hex === "string" && /^#[0-9a-f]{6}$/u.test(color.hex) && Array.isArray(color.rgb) &&
		color.rgb.length === 3 && color.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) &&
		rgbHex(color.rgb as number[]) === color.hex, `${label} midpoint RGB and hex custody disagree`)
	invariant(provenance.exactSource === true && Number.isSafeInteger(provenance.pixelIndex) &&
		Number.isSafeInteger(provenance.x) && Number.isSafeInteger(provenance.y),
		`${label} midpoint lacks exact source custody`)
	const width = output.dimensions.width
	const height = output.dimensions.height
	invariant(Number.isSafeInteger(width) && (width as number) > 0 && Number.isSafeInteger(height) &&
		(height as number) > 0 && (provenance.x as number) >= 0 && (provenance.x as number) < (width as number) &&
		(provenance.y as number) >= 0 && (provenance.y as number) < (height as number) &&
		provenance.pixelIndex === (provenance.y as number) * (width as number) + (provenance.x as number),
		`${label} midpoint source coordinates are invalid`)
	const pathIndex = authority.correspondingPathIndex
	invariant(Number.isSafeInteger(pathIndex) && (pathIndex as number) >= 0 &&
		(pathIndex as number) < supported.paths.length, `${label} midpoint path index is invalid`)
	const path = supported.paths[pathIndex as number]
	invariant(isObject(path) && path.eligible === true && path.hypothesisId === winner.sourceFieldHypothesisId &&
		isObject(path.midpointCustody) && sameMidpoint(midpoint, path.midpointCustody),
		`${label} midpoint is not bound to the rendered winner path`)
	return {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: color.hex, position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	}
}

function validateIntegratedWinnerTreatment(
	winner: JsonObject,
	winnerKey: string,
	label: string,
): void {
	invariant(ROLES.every((role) => validRoleColor(winner[role])) && isObject(winner.familyRoles) &&
		isObject(winner.collapse) && typeof winner.collapse.surface === "boolean" &&
		typeof winner.gradient === "boolean" && treatmentKey(winner) === winnerKey,
		`${label} integrated supported-gradient winner roles or key are stale`)
	if (winner.gradient === false) {
		const separate = winner.fieldTreatment === "separate-flat-fields" &&
			winner.collapse.surface === false &&
			(winner.background as JsonObject).hex !== (winner.surface as JsonObject).hex
		const oneField = winner.fieldTreatment === "one-field" && winner.collapse.surface === true &&
			winner.familyRoles.background === winner.familyRoles.surface &&
			sameValue(winner.background, winner.surface)
		invariant(winner.gradientEvidence === null && (separate || oneField),
			`${label} integrated flat winner authority is stale`)
		return
	}
	invariant(winner.fieldTreatment === "gradient-field" && isObject(winner.gradientEvidence),
		`${label} integrated gradient winner authority is stale`)
	const evidence = winner.gradientEvidence
	const orientation = evidence.backgroundTopologyEndpoint
	invariant(orientation === "low" || orientation === "high",
		`${label} integrated gradient endpoint orientation is invalid`)
	const endpointRoles = orientation === "low"
		? ["background", "surface"] as const
		: ["surface", "background"] as const
	invariant(Array.isArray(evidence.supportingFamilyIds) &&
		sameNumbers(evidence.supportingFamilyIds,
			endpointRoles.map((role) => (winner.familyRoles as JsonObject)[role])) &&
		Array.isArray(evidence.supportingEndpointHexes) &&
		evidence.supportingEndpointHexes.length === 2 &&
		evidence.supportingEndpointHexes.every((hex) =>
			typeof hex === "string" && /^#[0-9a-f]{6}$/u.test(hex)) &&
		new Set(evidence.supportingEndpointHexes).size === 2 && isObject(evidence.roleAssignment) &&
		evidence.roleAssignment.backgroundFamilyId === (winner.familyRoles as JsonObject).background &&
		evidence.roleAssignment.surfaceFamilyId === (winner.familyRoles as JsonObject).surface,
		`${label} integrated gradient output endpoints are stale`)
}

function validateIntegratedSupportedPathDomain(supported: JsonObject, label: string): JsonObject[] {
	invariant(sameValue(supported.policy,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY) &&
		sameValue(supported.formulas,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS) &&
		Array.isArray(supported.paths), `${label} integrated supported-gradient path policy is stale`)
	const paths = supported.paths as unknown[]
	invariant(paths.every((path, index) => isObject(path) && path.pathIndex === index &&
		(path.hypothesisId === null || typeof path.hypothesisId === "string") &&
		typeof path.fieldDomainId === "string" && path.fieldDomainId.length > 0 &&
		typeof path.connected === "boolean" && typeof path.legacyEligible === "boolean" &&
		typeof path.strictTransitionEligible === "boolean" && typeof path.eligible === "boolean" &&
		Array.isArray(path.rejectionReasons) && Array.isArray(path.acceptedIntermediateSupport) &&
		isObject(path.midpointCustody) && path.eligible === (path.rejectionReasons.length === 0) &&
		(path.eligible
			? path.connected === true && path.legacyEligible === true &&
				path.strictTransitionEligible === true && typeof path.hypothesisId === "string" &&
				path.midpointCustody.kind !== "none"
			: path.midpointCustody.kind === "none")) &&
		supported.discoveredPathCount === paths.length &&
		supported.strictTransitionEligiblePathCount === paths.filter((path) =>
			(path as JsonObject).strictTransitionEligible === true).length &&
		supported.eligiblePathCount === paths.filter((path) => (path as JsonObject).eligible === true).length,
		`${label} integrated supported-gradient path domain is stale`)
	const firstEligible = paths.find((path) => (path as JsonObject).eligible === true) as JsonObject | undefined
	invariant(supported.selectedPathIndex === (firstEligible?.pathIndex ?? null),
		`${label} integrated supported-gradient selected path is stale`)
	return paths as JsonObject[]
}

function validateIntegratedThreeStopPath(
	winner: JsonObject,
	authority: JsonObject,
	path: JsonObject,
	label: string,
): void {
	const midpoint = authority.midpoint
	invariant(path.eligible === true && path.connected === true && path.legacyEligible === true &&
		path.strictTransitionEligible === true && Array.isArray(path.rejectionReasons) &&
		path.rejectionReasons.length === 0 && path.hypothesisId === winner.sourceFieldHypothesisId &&
		isObject(winner.gradientEvidence) && path.fieldDomainId === winner.gradientEvidence.fieldDomainId &&
		path.topology === winner.gradientEvidence.topology && path.direction === winner.gradientEvidence.direction,
		`${label} integrated strict authority is not bound to the winner path`)
	if (!isObject(midpoint) || midpoint.kind !== "source-supported-three-stop") return
	invariant(isObject(midpoint.color) && isObject(midpoint.provenance) &&
		midpoint.provenance.fieldDomainId === path.fieldDomainId &&
		typeof midpoint.provenance.familyId === "string" && midpoint.provenance.familyId.length > 0 &&
		typeof midpoint.provenance.regionId === "string" && midpoint.provenance.regionId.length > 0 &&
		Number.isSafeInteger(midpoint.provenance.stageIndex) &&
		typeof midpoint.provenance.spatialPosition === "number" &&
		Number.isFinite(midpoint.provenance.spatialPosition) &&
		typeof midpoint.provenance.colorPosition === "number" &&
		Number.isFinite(midpoint.provenance.colorPosition) &&
		typeof midpoint.provenance.populationFraction === "number" &&
		Number.isFinite(midpoint.provenance.populationFraction) &&
		(midpoint.provenance.populationFraction as number) > 0 &&
		(midpoint.provenance.populationFraction as number) <= 1 &&
		Array.isArray(path.acceptedIntermediateSupport),
		`${label} integrated midpoint provenance is invalid`)
	const matches = (path.acceptedIntermediateSupport as unknown[]).filter((entry) =>
		isObject(entry) && entry.acceptedForMidpoint === true &&
		entry.stageIndex === midpoint.provenance.stageIndex &&
		entry.familyId === midpoint.provenance.familyId && entry.regionId === midpoint.provenance.regionId &&
		entry.spatialPosition === midpoint.provenance.spatialPosition &&
		entry.colorPosition === midpoint.provenance.colorPosition &&
		entry.populationFraction === midpoint.provenance.populationFraction &&
		isObject(entry.exactColor) && entry.exactColor.hex === midpoint.color.hex &&
		sameNumbers(entry.exactColor.rgb, midpoint.color.rgb) &&
		sameNumbers(entry.exactColor.oklab, midpoint.color.oklab) &&
		isObject(entry.exactColor.provenance) &&
		entry.exactColor.provenance.familyId === midpoint.provenance.familyId &&
		entry.exactColor.provenance.regionId === midpoint.provenance.regionId &&
		entry.exactColor.provenance.pixelIndex === midpoint.provenance.pixelIndex &&
		entry.exactColor.provenance.x === midpoint.provenance.x &&
		entry.exactColor.provenance.y === midpoint.provenance.y)
	invariant(matches.length === 1 && midpoint.color.hex !== (winner.background as JsonObject).hex &&
		midpoint.color.hex !== (winner.surface as JsonObject).hex,
		`${label} integrated midpoint is not exact accepted path support`)
}

function projectIntegratedResearchRender(
	output: unknown,
	identity: Readonly<{ configurationId: string }>,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	invariant(isObject(output) && isObject(output.winner) && isObject(output.winner.treatment) &&
		isObject(output.diagnostics) && isObject(output.dimensions),
		`${label} is missing integrated supported-gradient output custody`)
	const root = output.diagnostics.phase3IntegratedCandidate
	invariant(isObject(root) && root.version ===
		"album-artwork-palette-v2-phase-3-integrated-candidate-diagnostics-v2" &&
		root.configurationId === identity.configurationId && root.configurationId ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID &&
		root.supportedGradientAuthority ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
		`${label} integrated diagnostics do not match the current attempt identity`)
	const authority = root.gradientAuthority
	const supported = root.supportedGradientPath
	const selection = root.selection
	invariant(isObject(authority) && authority.version ===
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID &&
		authority.authority === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID &&
		typeof authority.selectedTransitionGradient === "boolean" &&
		typeof authority.strictVetoApplied === "boolean" &&
		typeof authority.projectedFlatSibling === "boolean" &&
		typeof authority.baselineWinnerKey === "string" &&
		isObject(supported) && isObject(selection) && typeof output.winner.key === "string" &&
		typeof selection.transitionPromoted === "boolean" &&
		authority.winnerKey === output.winner.key && selection.winnerKey === output.winner.key &&
		Array.isArray(selection.slateKeys) && selection.slateKeys[0] === output.winner.key,
		`${label} integrated supported-gradient winner authority is stale`)
	const winner = output.winner.treatment
	const winnerKey = output.winner.key
	validateIntegratedWinnerTreatment(winner, winnerKey, label)
	const paths = validateIntegratedSupportedPathDomain(supported, label)
	const selectedTransition = authority.selectedTransitionGradient === true
	if (!selectedTransition) {
		invariant(authority.strictVetoApplied === false && authority.projectedFlatSibling === false &&
			authority.baselineWinnerKey === winnerKey && authority.correspondingPathIndex === null &&
			isObject(authority.midpoint) && authority.midpoint.kind === "none" && authority.flatCustody === null,
			`${label} integrated no-midpoint authority is stale`)
		return undefined
	}
	const pathIndex = authority.correspondingPathIndex
	invariant(selection.transitionPromoted === true && Number.isSafeInteger(pathIndex) &&
		(pathIndex as number) >= 0 && (pathIndex as number) < paths.length,
		`${label} integrated supported-gradient path index is invalid`)
	const path = paths[pathIndex as number]
	invariant(path.pathIndex === pathIndex && typeof path.hypothesisId === "string" &&
		isObject(authority.midpoint) && sameValue(authority.midpoint, path.midpointCustody),
		`${label} integrated authority is not bound to its corresponding path`)
	const strictVeto = path.eligible !== true
	invariant(authority.strictVetoApplied === strictVeto,
		`${label} integrated strict supported-gradient veto is stale`)
	if (strictVeto) {
		const gradientSiblingKey = [...ROLES.map((role) => (winner[role] as JsonObject).hex), "gradient"].join(":")
		const custody = authority.flatCustody
		invariant(winner.gradient === false && authority.baselineWinnerKey === gradientSiblingKey &&
			authority.midpoint.kind === "none" && isObject(custody) && custody.sourceConnected === true &&
			Array.isArray(path.rejectionReasons) && path.rejectionReasons.length > 0 &&
			custody.sourceFieldHypothesisId === winner.sourceFieldHypothesisId &&
			custody.roleBinding === "same-four-roles" && Array.isArray(custody.sourceTypes) &&
			custody.sourceTypes.length > 0 && custody.sourceTypes.every((source) =>
				typeof source === "string" && source.length > 0) &&
			authority.projectedFlatSibling === (custody.kind === "source-connected-flat-projection") &&
			(custody.kind === "source-connected-flat-projection" ||
				custody.kind === "existing-exact-role-sibling") &&
			(custody.kind === "source-connected-flat-projection"
				? custody.hypothesisBinding === "same-source-field-hypothesis" &&
					path.hypothesisId === winner.sourceFieldHypothesisId
				: custody.hypothesisBinding === "existing-flat-field-hypothesis"),
			`${label} integrated flat strict-veto custody is stale`)
		return undefined
	}
	invariant(authority.strictVetoApplied === false && authority.projectedFlatSibling === false &&
		authority.flatCustody === null && authority.baselineWinnerKey === winnerKey && winner.gradient === true,
		`${label} integrated retained gradient authority is stale`)
	validateIntegratedThreeStopPath(winner, authority, path, label)
	return projectSupportedGradientAuthorityResearchRender(output, authority, supported, label)
}

function validateFinalRoleFamilySupport(
	treatment: JsonObject,
	publishedFamilies: ReadonlyMap<string, JsonObject>,
	width: number,
	height: number,
	label: string,
): Readonly<{ familyRolesPublished: boolean; familySupport: boolean }> {
	if (!isObject(treatment.familyRoles)) return { familyRolesPublished: false, familySupport: false }
	let familyRolesPublished = true
	let familySupport = true
	for (const role of ROLES) {
		const familyId = treatment.familyRoles[role]
		const color = treatment[role]
		if (familyId !== "generated" &&
			(typeof familyId !== "string" || !publishedFamilies.has(familyId))) familyRolesPublished = false
		if (!validRoleColor(color) || !isObject(color.support)) {
			familySupport = false
			continue
		}
		if (familyId === "generated") {
			const generatedRole = role === "background" || role === "surface" ? "background" : "foreground"
			if (color.generated !== true || color.strategy !== "generated-emergency" ||
				color.support.generated !== true || color.support.role !== generatedRole ||
				(color.support.reason !== "degenerate-supported-domain" &&
					color.support.reason !== "all-supported-pairs-effectively-contrastless") ||
				!Number.isSafeInteger(color.support.supportedPairCount) ||
				(color.support.supportedPairCount as number) < 0 ||
				!["maximumSupportedAbsoluteLc", "thresholdExclusive", "preferencePenalty"].every((key) =>
					typeof color.support[key] === "number" && Number.isFinite(color.support[key]))) {
				familySupport = false
			}
			continue
		}
		const support = color.support
		const exemplar = support.exemplar
		if (color.generated !== false || color.strategy === "generated-emergency" ||
			"generated" in support || support.anchorFamilyId !== familyId ||
			typeof support.exactSource !== "boolean" || !Array.isArray(support.regionIds) ||
			support.regionIds.length === 0 || !support.regionIds.every((regionId) =>
				typeof regionId === "string" && regionId.length > 0) ||
			new Set(support.regionIds).size !== support.regionIds.length ||
			!["perceptualDensity", "totalSupport", "connectedSupport", "spatialCoverage", "concentration",
				"prototypeDistance", "outlierScore"].every((key) =>
				typeof support[key] === "number" && Number.isFinite(support[key])) ||
			(exemplar !== null && (!isObject(exemplar) || !Number.isSafeInteger(exemplar.x) ||
				!Number.isSafeInteger(exemplar.y) || (exemplar.x as number) < 0 ||
				(exemplar.x as number) >= width || (exemplar.y as number) < 0 ||
				(exemplar.y as number) >= height)) ||
			(support.exactSource === true && exemplar === null) ||
			(support.synthesis !== null && (!isObject(support.synthesis) ||
				support.synthesis.operation !== "dense-neighborhood-mean" ||
				typeof support.synthesis.occupiedDistance !== "number" ||
				!Number.isFinite(support.synthesis.occupiedDistance)))) {
			familySupport = false
		}
	}
	invariant(familyRolesPublished && familySupport,
		`${label} final-candidate treatment family roles or source support are stale`)
	return { familyRolesPublished, familySupport }
}

function validateFinalFamilyCustody(
	output: JsonObject,
	root: JsonObject,
	finalKeys: readonly string[],
	label: string,
): void {
	const diagnostics = output.diagnostics
	const evidence = root.evidenceCustody
	invariant(isObject(diagnostics) && Array.isArray(diagnostics.families) &&
		Number.isSafeInteger(diagnostics.familyCount) && (diagnostics.familyCount as number) >= 0 &&
		Number.isSafeInteger(diagnostics.retainedFamilyCount) &&
		(diagnostics.retainedFamilyCount as number) >= 0 && isObject(evidence) &&
		Number.isSafeInteger(evidence.baseFamilyCount) && (evidence.baseFamilyCount as number) >= 0 &&
		Array.isArray(evidence.endpointAdditiveFamilyIds) && Array.isArray(evidence.retainedFamilyIds) &&
		Array.isArray(evidence.publishedFamilyIds),
		`${label} final-candidate published family diagnostics are missing`)
	const publishedFamilyIds = (diagnostics.families as unknown[]).map((family) =>
		isObject(family) ? family.id : null)
	invariant(publishedFamilyIds.every((id) => typeof id === "string" && id.length > 0) &&
		new Set(publishedFamilyIds).size === publishedFamilyIds.length &&
		diagnostics.retainedFamilyCount === publishedFamilyIds.length &&
		(diagnostics.familyCount as number) >= publishedFamilyIds.length &&
		sameUniqueStrings(evidence.publishedFamilyIds, publishedFamilyIds as string[]) &&
		sameUniqueStrings(evidence.retainedFamilyIds, publishedFamilyIds as string[]) &&
		new Set(evidence.endpointAdditiveFamilyIds).size === evidence.endpointAdditiveFamilyIds.length &&
		evidence.endpointAdditiveFamilyIds.every((id) =>
			typeof id === "string" && publishedFamilyIds.includes(id)) &&
		diagnostics.familyCount === (evidence.baseFamilyCount as number) +
			evidence.endpointAdditiveFamilyIds.length,
		`${label} final-candidate published family registry or counts are stale`)
	const publishedFamilies = new Map((diagnostics.families as JsonObject[]).map((family) =>
		[family.id as string, family]))
	const published = new Set(publishedFamilyIds as string[])
	const width = (output.dimensions as JsonObject).width
	const height = (output.dimensions as JsonObject).height
	invariant(Number.isSafeInteger(width) && (width as number) > 0 && Number.isSafeInteger(height) &&
		(height as number) > 0, `${label} final-candidate family support dimensions are invalid`)
	const treatments = (output.alternatives as JsonObject[]).map(({ treatment }) => treatment as JsonObject)
	const roleCustody = treatments.map((treatment, index) =>
		validateFinalRoleFamilySupport(treatment, publishedFamilies, width as number, height as number,
			`${label} final slate treatment ${index}`))

	const availability = diagnostics.candidateAvailability
	const fieldHypotheses = diagnostics.fieldHypotheses
	invariant(isObject(availability) && Array.isArray(fieldHypotheses),
		`${label} final-candidate availability or field diagnostics are missing`)
	const availabilityKeys = [
		"foregroundLaneFamilyIds",
		"signatureLaneFamilyIds",
		"fieldHypothesisFamilyIds",
		"completeCandidateForegroundFamilyIds",
		"completeCandidateAccentFamilyIds",
		"slateForegroundFamilyIds",
		"slateAccentFamilyIds",
	] as const
	for (const key of availabilityKeys) {
		invariant(Array.isArray(availability[key]) && availability[key].every((id) =>
			typeof id === "string" && published.has(id)) &&
			new Set(availability[key]).size === availability[key].length,
			`${label} final-candidate ${key} availability is stale`)
	}
	const fieldFamilyIds = [...new Set((fieldHypotheses as unknown[]).flatMap((hypothesis) =>
		isObject(hypothesis) ? [hypothesis.backgroundFamilyId,
			...(hypothesis.surfaceFamilyId === null ? [] : [hypothesis.surfaceFamilyId])] : []))]
		.filter((id): id is string => typeof id === "string" && id !== "generated")
	const slateForegroundFamilyIds = [...new Set(treatments.map((treatment) =>
		(treatment.familyRoles as JsonObject).foreground).filter((id): id is string =>
		typeof id === "string" && id !== "generated"))]
	const slateAccentFamilyIds = [...new Set(treatments.filter((treatment) =>
		!isObject(treatment.collapse) || treatment.collapse.accent !== true).map((treatment) =>
		(treatment.familyRoles as JsonObject).accent).filter((id): id is string =>
		typeof id === "string" && id !== "generated"))]
	invariant(sameUniqueStrings(availability.fieldHypothesisFamilyIds, fieldFamilyIds) &&
		sameUniqueStrings(availability.slateForegroundFamilyIds, slateForegroundFamilyIds) &&
		sameUniqueStrings(availability.slateAccentFamilyIds, slateAccentFamilyIds) &&
		Number.isSafeInteger(diagnostics.completeCandidateCount) &&
		evidence.completeCandidateCount === diagnostics.completeCandidateCount &&
		Array.isArray(evidence.fieldHypothesisIds) && sameUniqueStrings(evidence.fieldHypothesisIds,
			(fieldHypotheses as JsonObject[]).map(({ id }) => id as string)),
		`${label} final-candidate field, slate, or complete availability does not reconcile`)

	invariant(isObject(root.selector) && Array.isArray(root.selector.evaluations) &&
		isObject(root.lineageEligibility) && Array.isArray(root.lineageEligibility.candidates) &&
		isObject(root.componentLocalEndpointProposal) &&
		Array.isArray(root.componentLocalEndpointProposal.proposals) &&
		Array.isArray(root.finalSlateCustody) && root.finalSlateCustody.length === finalKeys.length,
		`${label} final-candidate independent slate custody sources are missing`)
	const selectorKeys = new Set((root.selector.evaluations as JsonObject[]).map(({ key }) => key))
	const lineageKeys = new Set((root.lineageEligibility.candidates as JsonObject[]).map(({ key }) => key))
	const endpointAdmittedKey = (root.composition as JsonObject).mechanisms instanceof Array
		? ((root.composition as JsonObject).mechanisms as JsonObject[])[0]?.admittedKey
		: null
	const expectedCustody = finalKeys.map((key, index) => {
		const selectorMatches = (root.selector as JsonObject).evaluations as unknown[]
		const matchingSelectorEvaluations = selectorMatches.filter((evaluation) =>
			isObject(evaluation) && evaluation.key === key)
		const treatment = treatments[index]
		const structural = matchingSelectorEvaluations.length === 1 &&
			isObject(matchingSelectorEvaluations[0]) && typeof matchingSelectorEvaluations[0].structuralKey === "string"
			? (matchingSelectorEvaluations[0].structuralKey as string).split("\0")
			: []
		invariant(structural.length >= 6 && isObject(treatment.familyRoles) &&
			ROLES.every((role, roleIndex) => structural[roleIndex + 2] === treatment.familyRoles[role]),
			`${label} final-candidate selector family-role custody is stale`)
		const selectorEvaluation = selectorKeys.has(key)
		const lineageCandidate = lineageKeys.has(key)
		const integratedAuthority = (root.integrated as JsonObject).gradientAuthority
		const integratedGradientProjection = isObject(integratedAuthority) &&
			key === integratedAuthority.winnerKey && integratedAuthority.flatCustody !== null
		const endpointProposalCustody = endpointAdmittedKey === key &&
			(root.componentLocalEndpointProposal as JsonObject).proposals.some((proposal) =>
				isObject(proposal) && proposal.key === key && isObject(proposal.custody) &&
				isObject(proposal.custody.mechanism) && isObject(proposal.custody.expandedDomain) &&
				proposal.custody.mechanism.key === key && proposal.custody.expandedDomain.key === key)
		const familyRolesPublished = roleCustody[index].familyRolesPublished
		const familySupport = roleCustody[index].familySupport
		return {
			key,
			selectorEvaluation,
			lineageCandidate,
			integratedGradientProjection,
			endpointProposalCustody,
			familyRolesPublished,
			familySupport,
			represented: selectorEvaluation &&
				(lineageCandidate || integratedGradientProjection || endpointProposalCustody) &&
				familyRolesPublished && familySupport,
		}
	})
	invariant(sameOrderedValues(root.finalSlateCustody as unknown[], expectedCustody) &&
		expectedCustody.every(({ represented }) => represented),
		`${label} final-candidate final slate custody booleans are stale`)
}

function projectFinalResearchRender(
	output: unknown,
	identity: Readonly<{ configurationId: string }>,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	invariant(isObject(output) && isObject(output.winner) && isObject(output.winner.treatment) &&
		Array.isArray(output.alternatives) && output.alternatives.length > 0 &&
		isObject(output.diagnostics) && isObject(output.dimensions),
		`${label} is missing final-candidate output custody`)
	const root = output.diagnostics.phase3FinalCandidate
	invariant(isObject(root) && root.version ===
		"album-artwork-palette-v2-phase-3-final-candidate-diagnostics-v1" &&
		root.configurationId === identity.configurationId && root.configurationId ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID &&
		sameValue(root.configuration, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION) &&
		root.winnerAuthority === "immutable-integrated-after-strict-supported-gradient-midpoint-authority" &&
		sameValue(root.excludedWinnerAuthorities,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities) &&
		!("pathBoundWinnerAuthority" in root) && !("combinedV3WinnerAuthority" in root) &&
		isObject(root.integrated) && isObject(root.composition) && isObject(root.selection) &&
		isObject(root.gradientAuthority) && isObject(root.supportedGradientPath),
		`${label} final-candidate identity or winner authority is stale`)
	invariant(sameValue(root.gradientAuthority, root.integrated.gradientAuthority) &&
		sameValue(root.supportedGradientPath, root.integrated.supportedGradientPath) &&
		isObject(root.integrated.selection) &&
		root.integrated.configurationId ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID &&
		root.integrated.supportedGradientAuthority ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
		`${label} final-candidate retained integrated authority is stale`)
	const winnerKey = output.winner.key
	const winner = output.winner.treatment
	invariant(typeof winnerKey === "string" && treatmentKey(winner) === winnerKey &&
		output.alternatives.length <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.maximumSlateTreatments &&
		output.alternatives.every((entry) => isObject(entry) && typeof entry.key === "string" &&
			isObject(entry.treatment) && treatmentKey(entry.treatment) === entry.key) &&
		(output.alternatives[0] as JsonObject).key === winnerKey &&
		sameValue((output.alternatives[0] as JsonObject).treatment, winner) &&
		new Set((output.alternatives as JsonObject[]).map(({ key }) => key)).size === output.alternatives.length,
		`${label} final-candidate output is not winner-first or canonically unique`)
	const finalKeys = (output.alternatives as JsonObject[]).map(({ key }) => key as string)
	const composition = root.composition
	invariant(composition.version === "album-artwork-palette-v2-phase-3-final-candidate-composition-v1" &&
		sameValue(composition.configuration, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION) &&
		composition.baselineWinnerKey === winnerKey && composition.finalWinnerKey === winnerKey &&
		Array.isArray(composition.baselineKeys) && composition.baselineKeys[0] === winnerKey &&
		Array.isArray(composition.finalKeys) && sameNumbers(composition.finalKeys, finalKeys) &&
		Array.isArray(composition.retainedIntegratedKeys) &&
		composition.retainedIntegratedKeys[0] === winnerKey &&
		Array.isArray(composition.displacedIntegratedKeys) &&
		!composition.displacedIntegratedKeys.includes(winnerKey) &&
		sameNumbers(composition.baselineKeys, root.integrated.selection.slateKeys) &&
		root.integrated.selection.winnerKey === winnerKey && root.selection.winnerKey === winnerKey &&
		Array.isArray(root.selection.slateKeys) && sameNumbers(root.selection.slateKeys, finalKeys) &&
		isObject(composition.checks) && Object.values(composition.checks).every((check) => check === true) &&
		isObject(root.checks) && Object.values(root.checks).every((check) => check === true),
		`${label} final-candidate composition or integrated winner agreement is stale`)
	invariant(Array.isArray(composition.mechanisms) && composition.mechanisms.length === 2,
		`${label} final-candidate admission composition is invalid`)
	const expectedMechanisms = ["component-local-endpoint", "raw-relation-slate-complement"]
	for (const [index, mechanism] of composition.mechanisms.entries()) {
		invariant(isObject(mechanism) && mechanism.mechanism === expectedMechanisms[index] &&
			mechanism.mechanismIndex === index &&
			(mechanism.admittedKey === null || typeof mechanism.admittedKey === "string") &&
			(mechanism.displacedIntegratedKey === null ||
				typeof mechanism.displacedIntegratedKey === "string") &&
			mechanism.displacedIntegratedKey !== winnerKey &&
			(mechanism.admittedKey === null
				? mechanism.noAdmission === true && mechanism.outputIndex === null
				: mechanism.noAdmission === false && mechanism.admittedKey !== winnerKey &&
					Number.isSafeInteger(mechanism.outputIndex) && (mechanism.outputIndex as number) > 0 &&
					(mechanism.outputIndex as number) < finalKeys.length &&
					finalKeys[mechanism.outputIndex as number] === mechanism.admittedKey),
			`${label} final-candidate ${expectedMechanisms[index]} admission altered winner authority`)
	}
	validateFinalFamilyCustody(output, root, finalKeys, label)
	return projectIntegratedResearchRender({
		...output,
		diagnostics: { phase3IntegratedCandidate: root.integrated },
	}, { configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID }, label)
}

export function projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
	output: unknown,
	identity: Readonly<{ attemptId: string; configurationId: string }>,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	if (identity.attemptId === MIDPOINT_AWARE_ATTEMPT_ID) {
		return projectMidpointAwareResearchRender(output, identity, label)
	}
	if (identity.attemptId === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID) {
		return projectIntegratedResearchRender(output, identity, label)
	}
	if (identity.attemptId === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID) {
		return projectFinalResearchRender(output, identity, label)
	}
	if (identity.attemptId !== "phase-3-supported-gradient-path") return undefined
	invariant(isObject(output) && isObject(output.winner) && isObject(output.winner.treatment) &&
		isObject(output.diagnostics) && isObject(output.dimensions), `${label} is missing supported-gradient output custody`)
	const root = output.diagnostics.phase3SupportedGradientPath
	invariant(isObject(root) && root.configurationId === identity.configurationId,
		`${label} supported-gradient diagnostics do not match the attempt identity`)
	invariant(isObject(root.gradientAuthority) && isObject(root.supportedGradientPath),
		`${label} is missing supported-gradient render authority`)
	return projectSupportedGradientAuthorityResearchRender(
		output, root.gradientAuthority, root.supportedGradientPath, label)
}
