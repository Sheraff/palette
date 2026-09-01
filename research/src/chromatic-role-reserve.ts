import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export const CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION = "chromatic-role-reserve-validation-0.8.0"

export type ChromaticRoleReserveProtocol = {
	schemaVersion: 1
	experimentVersion: typeof CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION
	createdAt: string
	protocolId: string
	baselineAlgorithmVersion: "region-graph-0.17.0"
	candidateAlgorithmVersion: "region-chromatic-role-0.1.0-poc.10"
	reserveDirectory: "0f"
	implementation: Record<string, string>
	sourceRule: {
		supportedExtensions: string[]
		deduplicateArtworkIds: true
		preferredSourceOrder: ["ab67616d0000b273", "ab67616d00001e02", "other"]
		includeAllDeduplicatedSources: true
	}
	comparison: {
		roleOKLabDistanceExclusive: 0.025
		gradientBooleanChangeIsMaterial: true
	}
	review: {
		includeEveryMaterialChange: true
		minimumCasesPerBatch: 4
		maximumCasesPerBatch: 40
		unchangedControlsOnlyToReachMinimum: true
		deterministicBlindAssignment: true
	}
	gates: {
		hardGateViolationsMaximum: 0
		baselinePreferredEligibleChangesMaximum: 0
		neitherAcceptableEligibleChangesMaximum: 0
		weakOrWorseCandidateEligibleChangesMaximum: 0
		candidatePreferredEligibleChangesMinimum: 1
		allMaterialChangesReviewed: true
		implementationMustRemainFrozen: true
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export function chromaticRoleReserveProtocolId(
	protocol: Omit<ChromaticRoleReserveProtocol, "createdAt" | "protocolId">,
): string {
	return createHash("sha256").update(JSON.stringify(protocol)).digest("hex")
}

export function parseChromaticRoleReserveProtocol(value: unknown): ChromaticRoleReserveProtocol {
	if (!isRecord(value) || value.schemaVersion !== 1 ||
		value.experimentVersion !== CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION ||
		typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
		!isSha256(value.protocolId) || value.baselineAlgorithmVersion !== "region-graph-0.17.0" ||
		value.candidateAlgorithmVersion !== "region-chromatic-role-0.1.0-poc.10" || value.reserveDirectory !== "0f" ||
		!isRecord(value.implementation) || Object.values(value.implementation).some((hash) => !isSha256(hash)) ||
		!isRecord(value.sourceRule) || !Array.isArray(value.sourceRule.supportedExtensions) ||
		value.sourceRule.supportedExtensions.some((extension) => typeof extension !== "string") ||
		value.sourceRule.deduplicateArtworkIds !== true || value.sourceRule.includeAllDeduplicatedSources !== true ||
		JSON.stringify(value.sourceRule.preferredSourceOrder) !== JSON.stringify(["ab67616d0000b273", "ab67616d00001e02", "other"]) ||
		!isRecord(value.comparison) || value.comparison.roleOKLabDistanceExclusive !== 0.025 ||
		value.comparison.gradientBooleanChangeIsMaterial !== true || !isRecord(value.review) ||
		value.review.includeEveryMaterialChange !== true || value.review.minimumCasesPerBatch !== 4 ||
		value.review.maximumCasesPerBatch !== 40 || value.review.unchangedControlsOnlyToReachMinimum !== true ||
		value.review.deterministicBlindAssignment !== true || !isRecord(value.gates) ||
		value.gates.hardGateViolationsMaximum !== 0 || value.gates.baselinePreferredEligibleChangesMaximum !== 0 ||
		value.gates.neitherAcceptableEligibleChangesMaximum !== 0 ||
		value.gates.weakOrWorseCandidateEligibleChangesMaximum !== 0 ||
		value.gates.candidatePreferredEligibleChangesMinimum !== 1 || value.gates.allMaterialChangesReviewed !== true ||
		value.gates.implementationMustRemainFrozen !== true) {
		throw new Error("Chromatic role reserve protocol is invalid")
	}
	const protocol = value as unknown as ChromaticRoleReserveProtocol
	const { createdAt: _createdAt, protocolId, ...identity } = protocol
	if (chromaticRoleReserveProtocolId(identity) !== protocolId) throw new Error("Chromatic role reserve protocol identity is stale")
	return protocol
}

export async function verifyChromaticRoleReserveImplementation(
	protocol: ChromaticRoleReserveProtocol,
	projectRoot: string,
): Promise<void> {
	for (const [file, expected] of Object.entries(protocol.implementation)) {
		const actual = createHash("sha256").update(await readFile(resolve(projectRoot, file))).digest("hex")
		if (actual !== expected) throw new Error(`Frozen reserve implementation changed: ${file}`)
	}
}
