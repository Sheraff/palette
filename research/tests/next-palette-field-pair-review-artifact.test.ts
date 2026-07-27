import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { nextPaletteReviewRoles, parseNextPaletteReviewManifest } from "../src/next-palette-review.ts"
import type { CorpusResult, Palette, RoleName } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.2.0-field-pair-development")
const previousRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v1")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function presentedKey(palette: {
	roles: Record<RoleName, { rgb: readonly number[]; generated: boolean }>
	gradient: { isGradient: boolean }
}): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette.roles[role].rgb, palette.roles[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function changedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return nextPaletteReviewRoles.filter((role) => baseline[role].generated !== candidate[role].generated ||
		baseline[role].rgb.some((channel, index) => channel !== candidate[role].rgb[index]))
}

test("field-pair review exactly covers novel prior-reviewed outputs", async () => {
	const plan = JSON.parse(await readFile(resolve(reviewRoot, "plan.json"), "utf8")) as {
		experimentId: string
		comparisonAlgorithmVersion: string
		candidateAlgorithmVersion: string
		priorSubmittedCases: number
		priorEligibleCases: number
		exactPreviousCandidateTransfers: number
		exactCanonicalBaselineTransfers: number
		ineligibleCases: number
		freshSourceOccurrences: number
		reviewCases: number
		totalBatches: number
		batchSize: number
		duplicateCarryEdges: Array<{ representativeFile: string; duplicateFile: string; sourceSha256: string }>
		transfers: Array<{ classification: string; quality: string | null }>
		manifestIds: string[]
	}
	const authorization = JSON.parse(await readFile(resolve(experimentRoot, "review-authorization.json"), "utf8")) as {
		experimentId: string
		review: { authorized: boolean; freshVisualCases: number; representedSourceOccurrences: number }
		prohibitions: { canonicalPromotionAuthorized: boolean; reserveAccessAuthorized: boolean; outputUnseenRootsOpened: string[] }
	}
	const successor = JSON.parse(await readFile(resolve(experimentRoot, "results.json"), "utf8")) as {
		experimentId: string
		algorithmVersion: string
		entries: Array<{ file: string; palette: Palette }>
	}
	const previousDevelopment = JSON.parse(await readFile(resolve(previousRoot, "candidate-results.json"), "utf8")) as CorpusResult
	const previous00 = JSON.parse(await readFile(resolve(previousRoot, "candidate-00-results.json"), "utf8")) as CorpusResult
	const canonicalDevelopment = JSON.parse(await readFile(resolve(previousRoot, "baseline-results.json"), "utf8")) as CorpusResult
	const canonical00 = JSON.parse(await readFile(resolve(previousRoot, "baseline-00-results.json"), "utf8")) as CorpusResult
	const manifests = await Promise.all(Array.from({ length: plan.totalBatches }, async (_, index) =>
		parseNextPaletteReviewManifest(JSON.parse(await readFile(
			resolve(reviewRoot, `batch-${String(index + 1).padStart(2, "0")}-manifest.json`), "utf8",
		)) as unknown)))

	assert.equal(plan.experimentId, successor.experimentId)
	assert.equal(plan.experimentId, authorization.experimentId)
	assert.equal(plan.comparisonAlgorithmVersion, "region-graph-next-0.1.0-dev")
	assert.equal(plan.candidateAlgorithmVersion, "region-graph-next-0.2.0-dev")
	assert.equal(successor.algorithmVersion, plan.candidateAlgorithmVersion)
	assert.equal(authorization.review.authorized, true)
	assert.equal(authorization.prohibitions.canonicalPromotionAuthorized, false)
	assert.equal(authorization.prohibitions.reserveAccessAuthorized, false)
	assert.deepEqual(authorization.prohibitions.outputUnseenRootsOpened, [])
	assert.equal(plan.priorSubmittedCases, 80)
	assert.equal(plan.priorEligibleCases, 79)
	assert.equal(plan.exactPreviousCandidateTransfers, 24)
	assert.equal(plan.exactCanonicalBaselineTransfers, 2)
	assert.equal(plan.ineligibleCases, 1)
	assert.equal(plan.freshSourceOccurrences, 54)
	assert.equal(plan.reviewCases, 53)
	assert.equal(authorization.review.freshVisualCases, 53)
	assert.equal(authorization.review.representedSourceOccurrences, 54)
	assert.equal(plan.totalBatches, 2)
	assert.equal(plan.batchSize, 27)
	assert.deepEqual(manifests.map((manifest) => manifest.entries.length), [27, 26])
	assert.deepEqual(manifests.map((manifest) => manifest.manifestId), plan.manifestIds)
	assert.equal(plan.transfers.filter((entry) => entry.classification === "previous-candidate").length, 24)
	assert.equal(plan.transfers.filter((entry) => entry.classification === "canonical-baseline").length, 2)
	assert.equal(plan.transfers.filter((entry) => entry.classification === "ineligible").length, 1)

	const entries = manifests.flatMap((manifest) => manifest.entries)
	assert.equal(entries.length, 53)
	assert.equal(new Set(entries.map((entry) => entry.caseId)).size, 53)
	assert.equal(new Set(entries.map((entry) => entry.source.sha256)).size, 53)
	assert.deepEqual(entries.map((entry) => entry.order).sort((first, second) => first - second),
		Array.from({ length: 53 }, (_, index) => index))
	assert.equal(entries.filter((entry) => entry.cohort === "curated-00").length, 39)
	assert.equal(entries.filter((entry) => entry.cohort === "reviewable-development").length, 14)
	assert.equal(entries.filter((entry) => entry.assignment.A === "candidate").length, 25)
	assert.equal(entries.filter((entry) => entry.assignment.B === "candidate").length, 28)
	assert.ok(entries.some((entry) => entry.source.file === "00/ab67616d00001e0200004a7c432cc405b024d111.jpg"))
	assert.ok(entries.every((entry) => /^(?:images|00)\/[^/\\]+$/.test(entry.source.file)))

	const previousByFile = new Map([
		...previousDevelopment.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...previous00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])
	const canonicalByFile = new Map([
		...canonicalDevelopment.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])
	const successorByFile = new Map(successor.entries.map((entry) => [entry.file, entry.palette]))
	for (const entry of entries) {
		const previous = previousByFile.get(entry.source.file)
		const canonical = canonicalByFile.get(entry.source.file)
		const candidate = successorByFile.get(entry.source.file)
		assert.ok(previous)
		assert.ok(canonical)
		assert.ok(candidate)
		assert.notEqual(semanticKey(candidate), semanticKey(previous))
		assert.notEqual(semanticKey(candidate), semanticKey(canonical))
		assert.deepEqual(entry.changedRoles, changedRoles(previous, candidate))
		assert.equal(entry.gradientChanged, previous.gradient.isGradient !== candidate.gradient.isGradient)
		for (const option of ["A", "B"] as const) {
			const expectedPalette: Palette = entry.assignment[option] === "baseline" ? previous : candidate
			assert.equal(presentedKey(entry.options[option]), semanticKey(expectedPalette))
		}
		assert.equal(sha256(await readFile(resolve(projectRoot, entry.source.file))), entry.source.sha256)
	}

	assert.equal(plan.duplicateCarryEdges.length, 1)
	const carry = plan.duplicateCarryEdges[0]
	assert.equal(carry.representativeFile, "images/maroon5-original.jpg")
	assert.equal(carry.duplicateFile, "images/maroon5.jpg")
	assert.equal(carry.sourceSha256, "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef")
	assert.ok(entries.some((entry) => entry.source.file === carry.representativeFile))
	assert.ok(!entries.some((entry) => entry.source.file === carry.duplicateFile))
	assert.equal(semanticKey(previousByFile.get(carry.representativeFile)!), semanticKey(previousByFile.get(carry.duplicateFile)!))
	assert.equal(semanticKey(successorByFile.get(carry.representativeFile)!), semanticKey(successorByFile.get(carry.duplicateFile)!))

	for (const manifest of manifests) {
		for (const [file, expected] of Object.entries(manifest.provenance.experiment)) {
			assert.equal(sha256(await readFile(resolve(experimentRoot, file))), expected, file)
		}
		for (const [file, expected] of Object.entries({
			...manifest.provenance.implementation,
			...manifest.provenance.presentation,
		})) assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
})
