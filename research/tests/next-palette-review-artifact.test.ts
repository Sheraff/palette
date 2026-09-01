import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewManifest } from "../src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v2")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function visiblePalette(palette: Record<string, unknown>): unknown {
	const value = palette as Record<string, { rgb: readonly number[]; generated: boolean }> & { gradient: { isGradient: boolean } }
	return {
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) => [role, {
			rgb: value[role].rgb,
			generated: value[role].generated,
		}])),
		gradient: value.gradient.isGradient,
	}
}

function presentedPalette(palette: { roles: Record<string, { rgb: readonly number[]; generated: boolean }>; gradient: { isGradient: boolean } }): unknown {
	return {
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) => [role, {
			rgb: palette.roles[role].rgb,
			generated: palette.roles[role].generated,
		}])),
		gradient: palette.gradient.isGradient,
	}
}

test("next palette review batches exactly cover the stratified changed frontier", async () => {
	const plan = JSON.parse(await readFile(resolve(reviewRoot, "plan.json"), "utf8")) as {
		experimentId: string
		frontierCases: number
		reviewCases: number
		totalBatches: number
		duplicateCarryEdges: Array<{ representativeFile: string; duplicateFile: string; sourceSha256: string }>
		manifestIds: string[]
	}
	const frontier = JSON.parse(await readFile(resolve(experimentRoot, "frontier.json"), "utf8")) as {
		experimentId: string
		entries: Array<{
			source: { path: string; sha256: string; bytes: number }
			baseline: Record<string, unknown>
			candidate: Record<string, unknown>
		}>
	}
	const frontierByPath = new Map(frontier.entries.map((entry) => [entry.source.path, entry]))
	const manifests = await Promise.all(Array.from({ length: plan.totalBatches }, async (_, index) =>
		parseNextPaletteReviewManifest(JSON.parse(await readFile(
			resolve(reviewRoot, `batch-${String(index + 1).padStart(2, "0")}-manifest.json`), "utf8",
		)) as unknown)))

	assert.equal(plan.experimentId, frontier.experimentId)
	assert.equal(plan.frontierCases, 125)
	assert.equal(plan.reviewCases, 124)
	assert.equal(plan.totalBatches, 4)
	assert.equal(plan.duplicateCarryEdges.length, 1)
	assert.deepEqual(manifests.map((manifest) => manifest.manifestId), plan.manifestIds)
	assert.deepEqual(manifests.map((manifest) => manifest.entries.length), [40, 40, 40, 4])
	const entries = manifests.flatMap((manifest) => manifest.entries)
	assert.equal(entries.length, plan.reviewCases)
	assert.equal(new Set(entries.map((entry) => entry.caseId)).size, entries.length)
	assert.deepEqual(entries.map((entry) => entry.order).sort((first, second) => first - second),
		Array.from({ length: entries.length }, (_, index) => index))
	assert.equal(new Set(entries.map((entry) => entry.source.sha256)).size, entries.length)
	const coveredPaths = new Set(entries.map((entry) => entry.source.file))
	for (const carry of plan.duplicateCarryEdges) {
		assert.ok(coveredPaths.has(carry.representativeFile))
		assert.ok(!coveredPaths.has(carry.duplicateFile))
		assert.equal(frontierByPath.get(carry.representativeFile)?.source.sha256, carry.sourceSha256)
		assert.equal(frontierByPath.get(carry.duplicateFile)?.source.sha256, carry.sourceSha256)
		coveredPaths.add(carry.duplicateFile)
	}
	assert.equal(coveredPaths.size, frontier.entries.length)

	for (const entry of entries) {
		const source = frontierByPath.get(entry.source.file)
		assert.ok(source)
		assert.equal(entry.source.file, source.source.path)
		assert.equal(entry.source.bytes, source.source.bytes)
		assert.equal(sha256(await readFile(resolve(projectRoot, entry.source.file))), entry.source.sha256)
		for (const option of ["A", "B"] as const) {
			const expectedPalette: Record<string, unknown> = entry.assignment[option] === "baseline"
				? source.baseline
				: source.candidate
			assert.deepEqual(presentedPalette(entry.options[option]), visiblePalette(expectedPalette))
		}
	}
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
