import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { ALGORITHM_VERSION } from "../src/extract.ts"
import {
	NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_INCUMBENT_ACCENT_POLICY,
} from "../src/next-palette-incumbent-accent.ts"
import type { CorpusResult, Palette } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/next-palette-incumbent-accent-0.1.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		background: [palette.background.rgb, palette.background.generated],
		foreground: [palette.foreground.rgb, palette.foreground.generated],
		surface: [palette.surface.rgb, palette.surface.generated],
		accent: [palette.accent.rgb, palette.accent.generated],
		gradient: palette.gradient.isGradient,
	})
}

test("checked-in incumbent accent candidate is complete, canonical-relative, and review-gated", async () => {
	const readJson = async <T>(file: string): Promise<T> =>
		JSON.parse(await readFile(resolve(experimentRoot, file), "utf8")) as T
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		candidateIdentity: { algorithmVersion: string; fidelityExperimentId: string }
		policy: typeof NEXT_PALETTE_INCUMBENT_ACCENT_POLICY
		protocol: {
			baselineAlgorithmVersion: string
			authorization: {
				allowedSourceRoots: string[]
				outputUnseenRootsOpened: string[]
				completeChangedSetReviewAuthorized: boolean
				canonicalPromotionAuthorized: boolean
			}
		}
		inputs: Record<string, { path: string; sha256: string }>
		implementation: Record<string, string>
		sources: Array<{ path: string; sha256: string; bytes: number }>
	}>("manifest.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		matrix: {
			total: number
			exactChanged: number
			materialChanged: number
			submaterialChanged: number
			unchangedExactCanonical: number
			developmentChanged: number
			cohort00Changed: number
			curated00Changed: number
			authorizedExtended00Changed: number
			withIncumbentEvidence: number
			withEligibleOption: number
			selectedForegroundCollapse: number
		}
		review: { required: boolean; authorized: boolean; completeChangedSetSize: number }
	}>("analysis.json")
	const results = await readJson<{
		experimentId: string
		algorithmVersion: string
		entries: Array<{
			file: string
			palette: Palette
			exactChanged: boolean
			structural: { violations: string[] }
		}>
	}>("results.json")
	const certificates = await readJson<{
		experimentId: string
		entries: Record<string, {
			incumbent: { hex: string }
			selected: {
				optionId: string | null
				changed: boolean
				material: boolean
				identitySupportDelta: number
				backgroundContrastMagnitudeDelta: number
			}
			options: Array<{
				optionId: string
				eligible: boolean
				failedGuards: string[]
				provenance: { representativePixelIndices: number[] }
			}>
		}>
	}>("certificates.json")
	const frontier = await readJson<{
		experimentId: string
		entries: Array<{ file: string; changedRoles: string[]; gradientChanged: boolean; baseline: Palette; candidate: Palette }>
	}>("frontier.json")
	const development = JSON.parse(await readFile(resolve(projectRoot, "research/data/results.json"), "utf8")) as CorpusResult
	const canonical00 = JSON.parse(await readFile(resolve(projectRoot, "research/data/holdout-results.json"), "utf8")) as CorpusResult
	const canonicalByFile = new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])

	assert.equal(manifest.candidateIdentity.algorithmVersion, NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION)
	assert.equal(manifest.candidateIdentity.fidelityExperimentId,
		"b5681a99e635dfa94bac6d6bc33f35a96264f341d2743f3d9e92341c949ddd17")
	assert.equal(manifest.protocol.baselineAlgorithmVersion, ALGORITHM_VERSION)
	assert.equal(manifest.policy.fixedApcaAdmissionFloor, null)
	assert.deepEqual(manifest.protocol.authorization.allowedSourceRoots, ["images", "00"])
	assert.deepEqual(manifest.protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(manifest.protocol.authorization.completeChangedSetReviewAuthorized, true)
	assert.equal(manifest.protocol.authorization.canonicalPromotionAuthorized, false)
	assert.equal(manifest.sources.length, 392)
	assert.equal(analysis.experimentId, manifest.experimentId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.matrix, {
		total: 392,
		exactChanged: 55,
		materialChanged: 55,
		submaterialChanged: 0,
		unchangedExactCanonical: 337,
		developmentChanged: 4,
		cohort00Changed: 51,
		curated00Changed: 18,
		authorizedExtended00Changed: 33,
		withIncumbentEvidence: 385,
		withEligibleOption: 55,
		selectedForegroundCollapse: 8,
	})
	assert.equal(analysis.review.required, true)
	assert.equal(analysis.review.authorized, true)
	assert.equal(analysis.review.completeChangedSetSize, 55)
	assert.equal(results.experimentId, manifest.experimentId)
	assert.equal(results.algorithmVersion, NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION)
	assert.equal(results.entries.length, 392)
	assert.equal(certificates.experimentId, manifest.experimentId)
	assert.equal(Object.keys(certificates.entries).length, 392)
	assert.equal(frontier.experimentId, manifest.experimentId)
	assert.equal(frontier.entries.length, 55)
	assert.ok(frontier.entries.every((entry) => entry.changedRoles.join(",") === "accent" && !entry.gradientChanged))

	for (const entry of results.entries) {
		const canonical = canonicalByFile.get(entry.file)
		assert.ok(canonical)
		assert.deepEqual(entry.structural.violations, [])
		assert.equal(entry.exactChanged, semanticKey(entry.palette) !== semanticKey(canonical))
		assert.deepEqual(entry.palette.background, canonical.background)
		assert.deepEqual(entry.palette.foreground, canonical.foreground)
		assert.deepEqual(entry.palette.surface, canonical.surface)
		assert.deepEqual(entry.palette.gradient, canonical.gradient)
		const certificate = certificates.entries[entry.file]
		assert.ok(certificate)
		assert.equal(certificate.selected.changed, entry.exactChanged)
		if (!entry.exactChanged) {
			assert.deepEqual(entry.palette, canonical)
			assert.equal(certificate.selected.optionId, null)
			continue
		}
		assert.equal(certificate.selected.material, true)
		assert.ok(certificate.selected.identitySupportDelta > 0)
		assert.ok(certificate.selected.backgroundContrastMagnitudeDelta >= -1e-12)
		const selected = certificate.options.find((option) => option.optionId === certificate.selected.optionId)
		assert.ok(selected?.eligible)
		assert.deepEqual(selected.failedGuards, [])
	}
	const target = results.entries.find((entry) =>
		entry.file === "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg")
	assert.equal(target?.palette.accent.hex, "#d8d418")
	assert.equal(certificates.entries[target!.file].incumbent.hex, "#99a4e4")

	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, expected] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), manifest.experimentId)
})
