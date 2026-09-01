import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

const experimentUrl = new URL("../data/experiments/album-artwork-palette-v2-0.4.1-development/", import.meta.url)
const currentExperimentUrl = new URL("../data/experiments/album-artwork-palette-v2-0.4.2-development/", import.meta.url)
const latestExperimentUrl = new URL("../data/experiments/album-artwork-palette-v2-0.4.3-development/", import.meta.url)
const observabilityExperimentUrl = new URL("../data/experiments/album-artwork-palette-v2-0.4.4-development/", import.meta.url)

type RoleColor = Readonly<{
	hex: string
	generated: boolean
	support: Record<string, unknown>
}>

type Treatment = Readonly<{
	id: string
	background: RoleColor
	surface: RoleColor
	foreground: RoleColor
	accent: RoleColor
	gradient: boolean
	fieldTreatment: string
	familyRoles: Readonly<{ background: string; surface: string; foreground: string; accent: string }>
	cardinality: number
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	contrast: Readonly<{ pairs: ReadonlyArray<Readonly<{ signedLc: number; absoluteLc: number }>> }>
	gradientEvidence: null | Readonly<{
		progression: number
		fieldDomainId: string
		supportingFamilyIds: readonly [string, string]
		supportingEndpointHexes: readonly [string, string]
		backgroundTopologyEndpoint: "low" | "high"
		roleAssignment: Readonly<{
			backgroundFamilyId: string
			surfaceFamilyId: string
			decisiveCriterion: string
			backgroundProfile: Readonly<{ evidenceLevels: readonly number[] }>
			surfaceProfile: Readonly<{ evidenceLevels: readonly number[] }>
		}>
	}>
}>

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	sourcePath: string
	alternatives: readonly Treatment[]
	presentations: ReadonlyArray<Readonly<{
		treatmentId: string
		roles: Record<string, Readonly<{ nearestName: string; sourceHex: string }>>
	}>>
}>

test("bounded development artifacts satisfy complete-treatment and presentation invariants", async () => {
	const [summary, review, targeted, developmentAnalysis, targetedAnalysis, targetedFeedback, lightweightAnalysis, lightweightFeedback, fresh] = await Promise.all([
		readFile(new URL("summary.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("review-manifest.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-manifest.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("development-analysis.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-analysis.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.1-targeted-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("lightweight-review-analysis.json", experimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.1-lightweight-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.equal(summary.workerCount, 6)
	assert.equal(summary.sourceCount, 28)
	assert.equal(summary.fieldHypothesisCoverage.oneField, 28)
	assert.ok(summary.fieldHypothesisCoverage.separateFlatFields >= 20)
	assert.ok(summary.fieldHypothesisCoverage.gradientField > 0)
	assert.ok(summary.connectedFieldDomainCoverage > 0)
	assert.ok(summary.paretoFrontierCandidateCount > 0)
	assert.ok(summary.dominatedCandidateCount > summary.paretoFrontierCandidateCount)
	assert.equal(summary.emergencyEligibleCount, 2)
	assert.match(summary.scientificSha256, /^[a-f0-9]{64}$/)
	assert.equal(review.cases.length, 12)
	assert.equal(review.cases.filter(({ cohort }: { cohort: string }) => cohort === "stress").length, 8)
	assert.equal(review.cases.filter(({ cohort }: { cohort: string }) => cohort === "dataset").length, 4)
	assert.equal(targeted.implementationHash, summary.implementationHash)
	assert.equal(targeted.scientificSha256, summary.scientificSha256)
	assert.equal(targeted.reviewVersion, "album-artwork-palette-v2-gate-confirmation-review-v6")
	assert.deepEqual(targeted.cases.map(({ caseId }: { caseId: string }) => caseId), [
		"development-07",
		"development-24",
		"development-27",
		"development-23",
	])
	assert.ok(targeted.cases.every(({ options }: { options: unknown[] }) => options.length >= 2 && options.length <= 4))
	assert.equal(developmentAnalysis.reviewPreparation.freshSampleOpened, false)
	assert.equal(developmentAnalysis.mechanical.candidateRoleLaneClosure, true)
	assert.equal(developmentAnalysis.mechanical.evidenceLevelDominance, true)
	assert.equal(targetedAnalysis.manifestId, targeted.manifestId)
	assert.equal(targetedFeedback.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.storeIntegrity.preferencesReferenceOnlyPositiveOptions, true)
	assert.equal(targetedAnalysis.counts.completedResponseCount, 4)
	assert.equal(targetedAnalysis.counts.currentCandidatePositiveCaseCount, 4)
	assert.equal(targetedAnalysis.counts.paretoTopPositiveCount, 4)
	assert.equal(targetedAnalysis.counts.preferredResponseCount, 2)
	assert.equal(targetedAnalysis.counts.preferredParetoTopCount, 1)
	assert.equal(targetedAnalysis.mechanismSubGates.currentCandidateCoverage.pass, true)
	assert.equal(targetedAnalysis.mechanismSubGates.deterministicTopOne.pass, true)
	assert.equal(targetedAnalysis.mechanismSubGates.preferenceAlignment.pass, false)
	assert.equal(targetedAnalysis.mechanismGate.pass, true)
	assert.equal(targetedAnalysis.phaseDisposition, "targeted-mechanism-gate-passed-absolute-quality-review-authorized")
	assert.equal(targetedAnalysis.freshSampleOpened, false)
	assert.equal(lightweightFeedback.manifestId, review.manifestId)
	assert.equal(lightweightAnalysis.manifestId, review.manifestId)
	assert.equal(lightweightAnalysis.validation.valid, true)
	assert.equal(lightweightAnalysis.validation.reviewedCaseCount, 12)
	assert.equal(lightweightAnalysis.validation.uniqueCaseCount, 12)
	assert.equal(lightweightAnalysis.validation.nonEmptyCommentCount, 9)
	assert.deepEqual(lightweightAnalysis.distribution.qualityCounts, {
		strong: 5,
		acceptable: 2,
		"weak-fallback": 4,
		unacceptable: 1,
		uncertain: 0,
	})
	assert.equal(lightweightAnalysis.distribution.positiveCount, 7)
	assert.equal(lightweightAnalysis.distribution.weakOrWorseCount, 5)
	assert.equal(lightweightAnalysis.prerequisiteTargetedGate.pass, true)
	assert.equal(lightweightAnalysis.decision.phase3EvidenceCollectionComplete, true)
	assert.equal(lightweightAnalysis.decision.completeTopTreatmentsCommonlyStrongOrAcceptable, true)
	assert.equal(lightweightAnalysis.decision.freezeForPhase4, false)
	assert.equal(lightweightAnalysis.decision.openFreshSample, false)
	assert.equal(lightweightAnalysis.decision.disposition, "continue-bounded-development-do-not-open-fresh")
	assert.deepEqual(
		lightweightAnalysis.caseResults.map(({ comment }: { comment: string }) => comment),
		lightweightFeedback.entries.map(({ comment }: { comment: string }) => comment),
	)

	const freshHashes = new Set(fresh.sources.map(({ sha256 }: { sha256: string }) => sha256))
	for (const reviewCase of review.cases as ReviewCase[]) {
		assert.equal(freshHashes.has(reviewCase.sourceSha256), false)
		assert.equal(reviewCase.sourcePath.startsWith("0f/"), false)
		assert.equal(reviewCase.alternatives.length, 1)
		assert.equal(reviewCase.presentations.length, reviewCase.alternatives.length)
		const sourceArtifact = JSON.parse(await readFile(new URL(`sources/${reviewCase.caseId}.json`, experimentUrl), "utf8"))
		assert.equal(sourceArtifact.extraction.winner.id, reviewCase.alternatives[0].id)
		assert.equal(sourceArtifact.extraction.diagnostics.paretoRanking.selectedTreatmentId, sourceArtifact.extraction.winner.id)
		assert.equal(sourceArtifact.extraction.diagnostics.paretoRanking.dominanceUsesEvidenceLevels, true)
		assert.deepEqual(sourceArtifact.extraction.diagnostics.paretoRanking.rankingPriorityBlocks, [
			"treatmentFoundation",
			"fieldIdentity",
			"fieldFidelity",
			"fieldStructure",
			"accentFidelity",
			"accentUtility",
			"artworkIdentity",
			"foregroundUtility",
			"representativeness",
			"coherence",
			"economy",
		])
		assert.ok(sourceArtifact.extraction.diagnostics.fieldDomains.length <= 48)
		for (const treatment of reviewCase.alternatives) {
			const roles = [treatment.background, treatment.surface, treatment.foreground, treatment.accent]
			assert.equal(new Set(roles.map(({ hex }) => hex)).size, treatment.cardinality)
			assert.ok(treatment.cardinality >= 2 && treatment.cardinality <= 4)
			assert.notEqual(treatment.background.hex, treatment.foreground.hex)
			assert.equal(treatment.collapse.surface, treatment.surface.hex === treatment.background.hex)
			assert.equal(treatment.collapse.accent, treatment.accent.hex === treatment.foreground.hex)
			assert.equal(treatment.gradient && treatment.collapse.surface, false)
			assert.ok(treatment.collapse.accent || ![
				treatment.familyRoles.background,
				treatment.familyRoles.surface,
				treatment.familyRoles.foreground,
			].includes(treatment.familyRoles.accent))
			assert.ok(treatment.contrast.pairs.length > 0)
			assert.ok(treatment.contrast.pairs.every(({ signedLc, absoluteLc }) =>
				Number.isFinite(signedLc) && Number.isFinite(absoluteLc)))
			if (treatment.gradient) {
				assert.ok(treatment.gradientEvidence)
				assert.ok(treatment.gradientEvidence.progression >= 0.27)
				assert.equal(typeof treatment.gradientEvidence.fieldDomainId, "string")
				assert.notEqual(treatment.gradientEvidence.supportingEndpointHexes[0], treatment.gradientEvidence.supportingEndpointHexes[1])
				assert.equal(treatment.gradientEvidence.roleAssignment.backgroundFamilyId, treatment.familyRoles.background)
				assert.equal(treatment.gradientEvidence.roleAssignment.surfaceFamilyId, treatment.familyRoles.surface)
				assert.equal(treatment.gradientEvidence.roleAssignment.backgroundProfile.evidenceLevels.length, 5)
				assert.equal(treatment.gradientEvidence.roleAssignment.surfaceProfile.evidenceLevels.length, 5)
			}
			for (const role of roles) {
				if (role.generated) {
					assert.ok(role.hex === "#000000" || role.hex === "#ffffff")
					assert.equal(role.support.generated, true)
					assert.equal(role.support.thresholdExclusive, 5)
				} else {
					assert.equal(typeof role.support.anchorFamilyId, "string")
					assert.ok((role.support.exactSource === true) || role.support.synthesis !== null)
					if (role.support.synthesis !== null) {
						const synthesis = role.support.synthesis as { occupiedDistance: number }
						assert.ok(synthesis.occupiedDistance <= 0.025)
					}
				}
			}
			const presentation = reviewCase.presentations.find(({ treatmentId }) => treatmentId === treatment.id)
			assert.ok(presentation)
			for (const role of ["background", "surface", "foreground", "accent"]) {
				assert.ok(presentation.roles[role].nearestName.length > 0)
				assert.equal(presentation.roles[role].sourceHex, treatment[role as keyof Pick<Treatment, "background" | "surface" | "foreground" | "accent">].hex)
			}
		}
	}
	const signatureStress = JSON.parse(await readFile(new URL("sources/development-24.json", experimentUrl), "utf8"))
	const topSignatureFamilyId = signatureStress.extraction.diagnostics.lanes
		.find(({ name }: { name: string }) => name === "signature").familyIds[0]
	assert.ok(signatureStress.extraction.diagnostics.candidateAvailability.completeCandidateAccentFamilyIds.includes(topSignatureFamilyId))
	assert.equal(signatureStress.extraction.winner.gradient, true)
	const orientationStress = JSON.parse(await readFile(new URL("sources/development-07.json", experimentUrl), "utf8"))
	assert.equal(orientationStress.extraction.winner.gradient, true)
	assert.equal(orientationStress.extraction.winner.background.hex, "#000000")
	assert.equal(orientationStress.extraction.winner.gradientEvidence.backgroundTopologyEndpoint, "high")
	const illustratedFields = JSON.parse(await readFile(new URL("sources/development-23.json", experimentUrl), "utf8"))
	assert.equal(illustratedFields.extraction.diagnostics.fieldHypotheses.some(({ kind }: { kind: string }) => kind === "gradient-field"), false)
	assert.equal(illustratedFields.extraction.winner.fieldTreatment, "separate-flat-fields")
	assert.notEqual(illustratedFields.extraction.winner.background.hex, illustratedFields.extraction.winner.surface.hex)
	assert.equal(illustratedFields.extraction.winner.foreground.hex, "#ebe3b4")
	assert.equal(illustratedFields.extraction.winner.accent.hex, "#b4a35e")
})

test("0.4.2 bounded architecture artifacts remain sealed and prepare only the targeted mechanism review", async () => {
	const [summary, aggregate, analysis, targeted, targetedAnalysis, targetedFeedback, fresh] = await Promise.all([
		readFile(new URL("summary.json", currentExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("aggregate.json", currentExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("development-analysis.json", currentExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-manifest.json", currentExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-analysis.json", currentExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.2-targeted-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.equal(summary.candidateVersion, "album-artwork-first-principles-0.4.2")
	assert.equal(summary.sourceCount, 28)
	assert.equal(summary.workerCount, 6)
	assert.equal(summary.implementationHash, aggregate.implementationHash)
	assert.equal(summary.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.implementationHash, aggregate.implementationHash)
	assert.equal(analysis.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.mechanical.eligibleFieldDomainCoverage, 23)
	assert.equal(analysis.mechanical.gradientHypothesisCoverage, 12)
	assert.equal(analysis.mechanical.winnerGradients, 9)
	assert.deepEqual(analysis.mechanical.winnerStructures, {
		"four-colors": 21,
		"three-colors-surface-collapsed": 5,
		"two-colors": 2,
	})
	assert.equal(analysis.mechanical.maximumCompleteCandidateCount, 810)
	assert.equal(analysis.mechanical.candidateRoleLaneClosure, true)
	assert.equal(analysis.mechanical.evidenceLevelDominance, true)
	assert.equal(analysis.predecessorComparison.exactWinnerMatches, 17)
	assert.equal(analysis.reviewPreparation.freshSampleOpened, false)
	assert.deepEqual(analysis.reviewPreparation.targetedArchitectureCaseIds, [
		"development-16",
		"development-21",
		"development-24",
		"development-27",
	])
	assert.equal(targeted.reviewVersion, "album-artwork-palette-v2-bounded-architecture-review-v7")
	assert.equal(targeted.implementationHash, aggregate.implementationHash)
	assert.equal(targeted.scientificSha256, aggregate.scientificSha256)
	assert.equal(targeted.cases.length, 4)
	assert.ok(targeted.cases.every(({ options }: { options: unknown[] }) => options.length >= 2 && options.length <= 4))
	assert.equal(targetedFeedback.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.counts.currentTopPositiveCount, 4)
	assert.equal(targetedAnalysis.counts.predecessorTopPositiveCount, 3)
	assert.equal(targetedAnalysis.counts.totalPositiveMarks, 11)
	assert.equal(targetedAnalysis.mechanismSubGates.roleLocalSurfaceRepair.pass, true)
	assert.equal(targetedAnalysis.mechanismSubGates.priorPositiveSurfaceControl.pass, true)
	assert.equal(targetedAnalysis.mechanismSubGates.boundedEndpointEnumeration.pass, true)
	assert.equal(targetedAnalysis.mechanismGate.pass, true)
	assert.equal(targetedAnalysis.phaseDisposition, "bounded-architecture-gate-passed-additional-development-required-before-phase4")
	assert.equal(targetedAnalysis.freshSampleOpened, false)
	assert.ok(analysis.reviewPreparation.optionRoles.every(({ options }: { options: Array<Record<string, boolean>> }) =>
		options.filter(({ currentParetoTop }) => currentParetoTop).length === 1 &&
		options.filter(({ predecessorParetoTop }) => predecessorParetoTop).length === 1))
	const freshHashes = new Set(fresh.sources.map(({ sha256 }: { sha256: string }) => sha256))
	for (const entry of aggregate.cases) {
		assert.equal(freshHashes.has(entry.source.sha256), false)
		assert.equal(entry.extraction.version, "album-artwork-first-principles-0.4.2")
		assert.ok(entry.extraction.diagnostics.completeCandidateCount <= 1_500)
		assert.equal(entry.extraction.diagnostics.bounds.gradientEndpointFamiliesPerBand, 2)
		assert.equal(entry.extraction.diagnostics.bounds.typographyPolarityRegions, 4)
		for (const family of entry.extraction.diagnostics.families) {
			assert.ok(family.foregroundPolarityObservation.polarity >= -1 && family.foregroundPolarityObservation.polarity <= 1)
			assert.ok(family.foregroundPolarityObservation.confidence >= 0 && family.foregroundPolarityObservation.confidence <= 1)
			assert.ok(family.foregroundPolarityObservation.componentIds.length <= 4)
		}
	}
})

test("0.4.3 adaptive foreground artifacts are integrity-bound and prepare only changed-top review", async () => {
	const [summary, aggregate, analysis, targeted, targetedAnalysis, targetedFeedback, fresh] = await Promise.all([
		readFile(new URL("summary.json", latestExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("aggregate.json", latestExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("development-analysis.json", latestExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-manifest.json", latestExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-analysis.json", latestExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.3-targeted-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.equal(summary.candidateVersion, "album-artwork-first-principles-0.4.3")
	assert.equal(summary.sourceCount, 28)
	assert.equal(summary.workerCount, 6)
	assert.equal(summary.implementationHash, "311a4ea81a641880be60e78773e6fd887e27258ef245fae63ed6615582d50dba")
	assert.equal(summary.implementationHash, aggregate.implementationHash)
	assert.equal(summary.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.implementationHash, aggregate.implementationHash)
	assert.equal(analysis.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.mechanical.maximumCompleteCandidateCount, 1_500)
	assert.equal(analysis.mechanical.candidateBoundSatisfied, true)
	assert.equal(analysis.mechanical.candidateRoleLaneClosure, true)
	assert.equal(analysis.mechanical.evidenceLevelDominance, true)
	assert.deepEqual(analysis.predecessorComparison.changedWinnerCaseIds, [
		"development-04",
		"development-19",
		"development-24",
	])
	assert.equal(analysis.reviewPreparation.freshSampleOpened, false)
	assert.deepEqual(analysis.reviewPreparation.targetedForegroundCaseIds, [
		"development-04",
		"development-19",
		"development-24",
	])
	assert.equal(targeted.reviewVersion, "album-artwork-palette-v2-foreground-availability-review-v8")
	assert.equal(targeted.implementationHash, aggregate.implementationHash)
	assert.equal(targeted.scientificSha256, aggregate.scientificSha256)
	assert.equal(targeted.cases.length, 3)
	assert.ok(targeted.cases.every(({ options }: { options: unknown[] }) => options.length >= 2 && options.length <= 4))
	assert.equal(targetedFeedback.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.counts.currentTopPositiveCount, 2)
	assert.equal(targetedAnalysis.counts.predecessorTopPositiveCount, 3)
	assert.equal(targetedAnalysis.mechanismSubGates.foregroundAvailabilityRepair.pass, true)
	assert.equal(targetedAnalysis.mechanismSubGates.priorStrongTopOrdering.pass, false)
	assert.equal(targetedAnalysis.mechanismSubGates.priorPositiveTopProtection.pass, false)
	assert.equal(targetedAnalysis.mechanismGate.pass, false)
	assert.equal(targetedAnalysis.phaseDisposition, "foreground-availability-repair-valid-complete-treatment-ordering-gate-failed")
	assert.equal(targetedAnalysis.freshSampleOpened, false)
	assert.ok(analysis.reviewPreparation.optionRoles.every(({ options }: { options: Array<Record<string, boolean>> }) =>
		options.filter(({ currentParetoTop }) => currentParetoTop).length === 1 &&
		options.filter(({ predecessorParetoTop }) => predecessorParetoTop).length === 1))
	const freshHashes = new Set(fresh.sources.map(({ sha256 }: { sha256: string }) => sha256))
	for (const entry of aggregate.cases) {
		assert.equal(freshHashes.has(entry.source.sha256), false)
		assert.equal(entry.extraction.version, "album-artwork-first-principles-0.4.3")
		assert.ok(entry.extraction.diagnostics.completeCandidateCount <= 1_500)
		assert.ok(entry.extraction.diagnostics.candidateAvailability.foregroundsPerFieldVariantQuota >= 1)
		assert.equal(
			entry.scientificSha256,
			createHash("sha256").update(JSON.stringify({
				extraction: entry.extraction,
				presentations: entry.presentations,
			})).digest("hex"),
		)
	}
})

test("0.4.4 distinct accents remain outside APCA zero and only one new top needs review", async () => {
	const [summary, aggregate, analysis, targeted, targetedAnalysis, targetedFeedback, deltaPreparation, deltaManifest, deltaAnalysis, deltaFeedback, fresh] = await Promise.all([
		readFile(new URL("summary.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("aggregate.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("development-analysis.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-manifest.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("targeted-review-analysis.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.4-targeted-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("absolute-quality-delta-preparation.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("absolute-quality-delta-review-manifest.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("absolute-quality-delta-analysis.json", observabilityExperimentUrl), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.4.4-lightweight-delta-feedback.json", import.meta.url), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.equal(summary.candidateVersion, "album-artwork-first-principles-0.4.4")
	assert.equal(summary.sourceCount, 28)
	assert.equal(summary.workerCount, 6)
	assert.equal(summary.implementationHash, "d41bd338a39fbd89bcdc1f200cbbb36c30ead374e5b53ce8e6fb9e3bcc624754")
	assert.equal(summary.implementationHash, aggregate.implementationHash)
	assert.equal(summary.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.implementationHash, aggregate.implementationHash)
	assert.equal(analysis.scientificSha256, aggregate.scientificSha256)
	assert.equal(analysis.mechanical.completeCandidateCount, 32_404)
	assert.equal(analysis.mechanical.distinctAccentDeadZoneRejectedTreatmentCount, 1_752)
	assert.equal(analysis.mechanical.maximumCompleteCandidateCount, 1_500)
	assert.equal(analysis.mechanical.candidateBoundSatisfied, true)
	assert.deepEqual(analysis.mechanical.changedWinnerCaseIds, ["development-14", "development-24"])
	assert.equal(analysis.predecessorReviewTransfer.transferredPositiveTopCount, 3)
	assert.equal(analysis.reviewPreparation.freshSampleOpened, false)
	assert.deepEqual(analysis.reviewPreparation.targetedObservabilityCaseIds, ["development-14"])
	assert.equal(targeted.reviewVersion, "album-artwork-palette-v2-distinct-accent-observability-review-v9")
	assert.equal(targeted.implementationHash, aggregate.implementationHash)
	assert.equal(targeted.scientificSha256, aggregate.scientificSha256)
	assert.equal(targeted.cases.length, 1)
	assert.ok(targeted.cases[0].options.length >= 2 && targeted.cases[0].options.length <= 4)
	assert.equal(targetedFeedback.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.manifestId, targeted.manifestId)
	assert.equal(targetedAnalysis.counts.currentTopPositiveCount, 1)
	assert.equal(targetedAnalysis.counts.predecessorTopPositiveCount, 0)
	assert.equal(targetedAnalysis.mechanismGate.pass, true)
	assert.equal(targetedAnalysis.responseInterpretation.interpretationUncertain, true)
	assert.equal(targetedAnalysis.phaseDisposition, "distinct-accent-observability-gate-passed-absolute-quality-delta-review-authorized")
	assert.equal(targetedAnalysis.freshSampleOpened, false)
	assert.equal(deltaPreparation.transferredExactTopCount, 4)
	assert.equal(deltaPreparation.changedTopCount, 8)
	assert.deepEqual(deltaPreparation.changedTopCaseIds, [
		"development-04",
		"development-06",
		"development-15",
		"development-16",
		"development-18",
		"development-19",
		"development-21",
		"development-26",
	])
	assert.equal(deltaPreparation.freshSampleOpened, false)
	assert.equal(deltaManifest.reviewVersion, "album-artwork-palette-v2-absolute-quality-delta-review-v10")
	assert.equal(deltaManifest.implementationHash, aggregate.implementationHash)
	assert.equal(deltaManifest.scientificSha256, aggregate.scientificSha256)
	assert.equal(deltaManifest.cases.length, 8)
	assert.equal(deltaFeedback.manifestId, deltaManifest.manifestId)
	assert.equal(deltaAnalysis.manifestId, deltaManifest.manifestId)
	assert.deepEqual(deltaAnalysis.combinedDistribution, {
		strong: 5,
		acceptable: 6,
		"weak-fallback": 0,
		unacceptable: 1,
		uncertain: 0,
	})
	assert.equal(deltaAnalysis.phase3Gate.pass, true)
	assert.equal(deltaAnalysis.phase3Gate.positiveCount, 11)
	assert.equal(deltaAnalysis.phase3Gate.freezeCandidateForPhase4, true)
	assert.equal(deltaAnalysis.phaseDisposition, "phase3-passed-freeze-0.4.4-for-one-time-fresh-directional-review")
	assert.equal(deltaAnalysis.freshSampleOpened, false)
	const freshHashes = new Set(fresh.sources.map(({ sha256 }: { sha256: string }) => sha256))
	for (const entry of aggregate.cases) {
		assert.equal(freshHashes.has(entry.source.sha256), false)
		assert.equal(entry.extraction.version, "album-artwork-first-principles-0.4.4")
		assert.ok(entry.extraction.diagnostics.completeCandidateCount <= 1_500)
		assert.ok(entry.extraction.diagnostics.candidateAvailability.distinctAccentDeadZoneRejectedTreatmentCount >= 0)
		for (const treatment of entry.extraction.alternatives) {
			if (!treatment.collapse.accent) {
				assert.ok(treatment.contrast.pairs
					.filter(({ role }: { role: string }) => role === "accent")
					.every(({ absoluteLc }: { absoluteLc: number }) => absoluteLc !== 0))
			}
		}
		assert.equal(
			entry.scientificSha256,
			createHash("sha256").update(JSON.stringify({
				extraction: entry.extraction,
				presentations: entry.presentations,
			})).digest("hex"),
		)
	}
})
