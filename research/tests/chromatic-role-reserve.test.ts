import assert from "node:assert/strict"
import test from "node:test"
import {
	CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION,
	chromaticRoleReserveProtocolId,
	parseChromaticRoleReserveProtocol,
	type ChromaticRoleReserveProtocol,
} from "../src/chromatic-role-reserve.ts"

function protocol(): ChromaticRoleReserveProtocol {
	const identity: Omit<ChromaticRoleReserveProtocol, "createdAt" | "protocolId"> = {
		schemaVersion: 1,
		experimentVersion: CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: "region-graph-0.17.0",
		candidateAlgorithmVersion: "region-chromatic-role-0.1.0-poc.10",
		reserveDirectory: "0f",
		implementation: { "research/example.ts": "a".repeat(64) },
		sourceRule: { supportedExtensions: [".jpg"], deduplicateArtworkIds: true,
			preferredSourceOrder: ["ab67616d0000b273", "ab67616d00001e02", "other"],
			includeAllDeduplicatedSources: true },
		comparison: { roleOKLabDistanceExclusive: 0.025, gradientBooleanChangeIsMaterial: true },
		review: { includeEveryMaterialChange: true, minimumCasesPerBatch: 4, maximumCasesPerBatch: 40,
			unchangedControlsOnlyToReachMinimum: true, deterministicBlindAssignment: true },
		gates: { hardGateViolationsMaximum: 0, baselinePreferredEligibleChangesMaximum: 0,
			neitherAcceptableEligibleChangesMaximum: 0, weakOrWorseCandidateEligibleChangesMaximum: 0,
			candidatePreferredEligibleChangesMinimum: 1, allMaterialChangesReviewed: true,
			implementationMustRemainFrozen: true },
	}
	return { ...identity, createdAt: "2026-07-20T00:00:00.000Z", protocolId: chromaticRoleReserveProtocolId(identity) }
}

test("reserve protocol binds the candidate, source rule, review, and stopping gates", () => {
	const value = protocol()
	assert.equal(parseChromaticRoleReserveProtocol(value).reserveDirectory, "0f")
	;(value.gates as unknown as Record<string, number>).candidatePreferredEligibleChangesMinimum = 2
	assert.throws(() => parseChromaticRoleReserveProtocol(value), /protocol is invalid/)
})

test("reserve protocol identity rejects post-freeze implementation changes", () => {
	const value = protocol()
	value.implementation["research/example.ts"] = "b".repeat(64)
	assert.throws(() => parseChromaticRoleReserveProtocol(value), /identity is stale/)
})
