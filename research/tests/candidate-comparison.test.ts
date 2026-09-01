import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	buildCandidateComparisonReport,
	compareSpatialPalettes,
	roleDistanceThreshold,
} from "../src/candidate-comparison.ts"
import type { Palette, RGB, RoleColor, RoleName } from "../src/types.ts"

const dataRoot = fileURLToPath(new URL("../data/", import.meta.url))

async function canonicalComparisonInput() {
	const holdoutPath = join(dataRoot, "holdout-results.json")
	const [baselineResultsSource, baselineHoldoutSource, selectionSource, curationSource, feedbackSource] = await Promise.all([
		readFile(join(dataRoot, "results.json"), "utf8"),
		readFile(holdoutPath),
		readFile(join(dataRoot, "selection.json"), "utf8"),
		readFile(join(dataRoot, "curation.json"), "utf8"),
		readFile(join(dataRoot, "absolute-feedback.json"), "utf8"),
	])
	const baselineResults: unknown = JSON.parse(baselineResultsSource)
	const baselineHoldoutResults: unknown = JSON.parse(baselineHoldoutSource.toString("utf8"))
	return {
		baselineResults,
		baselineHoldoutResults,
		baselineHoldoutSource,
		candidateResults: baselineResults,
		candidateHoldoutResults: baselineHoldoutResults,
		selection: JSON.parse(selectionSource) as unknown,
		curation: JSON.parse(curationSource) as unknown,
		absoluteFeedback: JSON.parse(feedbackSource) as unknown,
	}
}

function role(rgb: RGB): RoleColor {
	return {
		rgb,
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		generated: false,
		sourceDistance: 0,
	}
}

function palette(rgb: RGB, gradient = false): Palette {
	const roles = Object.fromEntries((["background", "foreground", "surface", "accent"] as RoleName[])
		.map((name) => [name, role(rgb)])) as Pick<Palette, RoleName>
	return {
		...roles,
		gradient: { isGradient: gradient, confidence: 1, coverage: 1, continuity: 1, coherence: 1 },
		score: 1,
		metrics: {
			foregroundContrast: 1,
			foregroundSurfaceContrast: 1,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("spatial comparison applies the exclusive OKLab threshold to every role", () => {
	const baseline = palette([128, 128, 128])
	const candidate = palette([129, 129, 129])
	candidate.accent = role([255, 0, 0])
	const comparison = compareSpatialPalettes(baseline, candidate)

	assert.equal(comparison.changed, true)
	assert.equal(comparison.roles.background.changed, false)
	assert.ok(comparison.roles.background.distance > 0)
	assert.ok(comparison.roles.background.distance <= roleDistanceThreshold)
	assert.equal(comparison.roles.accent.changed, true)
	assert.equal(comparison.roles.accent.old.hex, "#808080")
	assert.equal(comparison.roles.accent.new.hex, "#ff0000")
})

test("a gradient boolean change marks an otherwise identical spatial palette", () => {
	const comparison = compareSpatialPalettes(palette([40, 50, 60]), palette([40, 50, 60], true))
	assert.equal(comparison.changed, true)
	assert.deepEqual(comparison.gradient, { changed: true, old: false, new: true })
	assert.ok(Object.values(comparison.roles).every((roleComparison) => roleComparison.distance === 0))
})

test("standalone comparison classifies the current provenance-bound review", async () => {
	const input = await canonicalComparisonInput()
	const report = buildCandidateComparisonReport(input)

	assert.equal(report.accepted.total, 95)
	assert.equal(report.rejected.total, 5)
	assert.equal(report.unselectedHoldout.total, 255)
	assert.equal(report.accepted.changedCount, 0)
	assert.equal(report.rejected.changedCount, 0)
})

test("standalone comparison binds selection to the exact raw baseline holdout artifact", async () => {
	const input = await canonicalComparisonInput()
	const staleBaseline = structuredClone(input.baselineHoldoutResults) as Record<string, unknown>
	staleBaseline.generatedAt = "2026-01-01T00:00:00.000Z"
	assert.throws(
		() => buildCandidateComparisonReport({ ...input, baselineHoldoutResults: staleBaseline }),
		/do not exactly match the supplied raw artifact/,
	)

	const staleSource = Buffer.concat([input.baselineHoldoutSource, Buffer.from("\n")])
	assert.throws(
		() => buildCandidateComparisonReport({ ...input, baselineHoldoutSource: staleSource }),
		/Selection source-results SHA-256 does not match/,
	)
})

test("standalone comparison rejects curation that is stale or not frozen for the validated manifest", async () => {
	const input = await canonicalComparisonInput()
	const staleCuration = structuredClone(input.curation) as Record<string, unknown>
	staleCuration.manifestId = "f".repeat(64)
	assert.throws(
		() => buildCandidateComparisonReport({ ...input, curation: staleCuration }),
		/Curation store does not match the current selection manifest/,
	)

	const unfrozenCuration = structuredClone(input.curation) as Record<string, unknown>
	unfrozenCuration.frozenAt = null
	assert.throws(
		() => buildCandidateComparisonReport({ ...input, curation: unfrozenCuration }),
		/must be frozen before classifying absolute feedback/,
	)
})

test("standalone comparison verifies absolute feedback provenance before applying review labels", async () => {
	const input = await canonicalComparisonInput()
	const staleFeedback = structuredClone(input.absoluteFeedback) as Record<string, unknown>
	staleFeedback.algorithmVersion = "region-graph-stale"
	assert.throws(
		() => buildCandidateComparisonReport({ ...input, absoluteFeedback: staleFeedback }),
		/does not match the frozen selection provenance/,
	)
})
