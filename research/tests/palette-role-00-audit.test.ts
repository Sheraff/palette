import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { nameRGB } from "../src/color-name.ts"
import { rgbToHex } from "../src/color.ts"
import { selectionTracks, type SelectionManifest } from "../src/corpus-selection.ts"
import {
	PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	PALETTE_ROLE_00_AUDIT_BATCH_COUNT,
	PALETTE_ROLE_00_AUDIT_BATCH_SIZE,
	PALETTE_ROLE_00_AUDIT_ENTRY_COUNT,
	PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION,
	PALETTE_ROLE_00_AUDIT_VERSION,
	paletteRole00AuditBackgroundSurface,
	paletteRole00AuditCaseId,
	paletteRole00AuditImplementationFiles,
	paletteRole00AuditManifestId,
	paletteRole00AuditOrderKey,
	paletteRole00AuditPresentationFiles,
	paletteRole00AuditRoles,
	paletteRole00AuditSample,
	parsePaletteRole00AuditFeedbackEntry,
	parsePaletteRole00AuditManifest,
	type PaletteRole00AuditManifest,
	type PaletteRole00AuditPresentedPalette,
} from "../src/palette-role-00-audit.ts"
import type { RGB, RoleName } from "../src/types.ts"

const selectionManifestId = "a".repeat(64)

function presentedPalette(): PaletteRole00AuditPresentedPalette {
	const values: Record<RoleName, RGB> = {
		background: [20, 20, 20],
		foreground: [240, 240, 240],
		surface: [48, 48, 48],
		accent: [180, 180, 180],
	}
	const roles = Object.fromEntries(paletteRole00AuditRoles.map((role) => {
		const descriptor = nameRGB(values[role])
		return [role, {
			rgb: values[role],
			hex: rgbToHex(values[role]),
			generated: false,
			sourceDistance: 0,
			colorName: {
				nearestName: descriptor.nearestName,
				referenceHex: descriptor.nearest.referenceHex,
				tier: descriptor.nearest.tier,
				distance: descriptor.nearest.distance,
			},
		}]
	})) as PaletteRole00AuditPresentedPalette["roles"]
	return {
		roles,
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 0.8,
		metrics: {
			foregroundContrast: 10,
			foregroundSurfaceContrast: 8,
			accentContrast: 4,
			accentSurfaceContrast: 3,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0.05,
		},
		backgroundSurface: paletteRole00AuditBackgroundSurface(roles.background.rgb, roles.surface.rgb),
	}
}

function fixtureManifest(): PaletteRole00AuditManifest {
	const sources = Array.from({ length: PALETTE_ROLE_00_AUDIT_ENTRY_COUNT }, (_, index) => {
		const file = `00/example-${String(index + 1).padStart(3, "0")}.jpg`
		const sourceSha256 = (index + 1).toString(16).padStart(64, "0")
		const sampleTrack = (["diversity", "risk", "random"] as const)[index % 3]
		return { file, sourceSha256, sampleTrack }
	}).sort((first, second) => {
		const firstKey = paletteRole00AuditOrderKey(selectionManifestId, first.file, first.sourceSha256)
		const secondKey = paletteRole00AuditOrderKey(selectionManifestId, second.file, second.sourceSha256)
		return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : first.file.localeCompare(second.file, "en")
	})
	const entries = sources.map((source, index) => ({
		caseId: paletteRole00AuditCaseId(selectionManifestId, source.file, source.sourceSha256),
		order: index + 1,
		batch: Math.floor(index / PALETTE_ROLE_00_AUDIT_BATCH_SIZE) + 1,
		sampleTrack: source.sampleTrack,
		source: {
			file: source.file,
			sha256: source.sourceSha256,
			bytes: 100,
			width: 300,
			height: 300,
		},
		normalized: { width: 224, height: 224 },
		palette: presentedPalette(),
	}))
	const identity: Omit<PaletteRole00AuditManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		auditVersion: PALETTE_ROLE_00_AUDIT_VERSION,
		presentationVersion: PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION,
		algorithmVersion: PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
		batchSize: PALETTE_ROLE_00_AUDIT_BATCH_SIZE,
		totalBatches: PALETTE_ROLE_00_AUDIT_BATCH_COUNT,
		provenance: {
			canonicalHoldout: { rawSha256: "b".repeat(64), semanticSha256: "c".repeat(64) },
			sourceSelection: { rawSha256: "d".repeat(64), manifestId: selectionManifestId },
			implementation: Object.fromEntries(paletteRole00AuditImplementationFiles.map((file) => [file, "e".repeat(64)])),
			presentation: Object.fromEntries(paletteRole00AuditPresentationFiles.map((file) => [file, "f".repeat(64)])),
		},
		entries,
	}
	return {
		...identity,
		generatedAt: "2026-07-21T00:00:00.000Z",
		manifestId: paletteRole00AuditManifestId(identity),
	}
}

function eligibleFeedback(manifest: PaletteRole00AuditManifest) {
	const entry = manifest.entries[0]
	return {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		skipReason: null,
		overallQuality: "acceptable",
		comment: "Works because the accent balances the background.",
	}
}

test("00 audit sample spans each complete frozen selection queue", () => {
	const tracks = Object.fromEntries(selectionTracks.map((track, trackIndex) => [
		track,
		Array.from({ length: 20 }, (_, rank) => ({
			file: `00/${track}-${rank}.jpg`,
			sha256: (trackIndex * 20 + rank + 1).toString(16).padStart(64, "0"),
			width: 224,
			height: 224,
			track,
			rank,
		})),
	])) as SelectionManifest["tracks"]
	const selection = { tracks } as SelectionManifest
	const sample = paletteRole00AuditSample(selection)
	for (const track of selectionTracks) {
		assert.deepEqual(sample.filter((entry) => entry.track === track).map((entry) => entry.rank),
			[1, 3, 5, 7, 9, 11, 13, 15, 17, 19])
	}
})

test("00 audit manifest parsing enforces deterministic identity, coverage, order, and batches", () => {
	const manifest = fixtureManifest()
	const parsed = parsePaletteRole00AuditManifest(manifest)
	assert.equal(parsed.entries.length, 30)
	assert.equal(parsed.entries[0].batch, 1)
	assert.equal(parsed.entries[10].batch, 2)
	assert.equal(parsed.entries.at(-1)?.batch, 3)

	const stale = structuredClone(manifest)
	stale.provenance.canonicalHoldout.rawSha256 = "0".repeat(64)
	assert.throws(() => parsePaletteRole00AuditManifest(stale), /manifest identity is stale/)

	const extra = structuredClone(manifest) as PaletteRole00AuditManifest & { comparator?: string }
	extra.comparator = "forbidden"
	assert.throws(() => parsePaletteRole00AuditManifest(extra), /unexpected fields/)
})

test("feedback accepts one holistic quality and a relational comment", () => {
	const manifest = fixtureManifest()
	const feedback = eligibleFeedback(manifest)
	const parsed = parsePaletteRole00AuditFeedbackEntry(feedback, manifest, false)
	assert.equal(parsed.overallQuality, "acceptable")
	assert.equal(parsed.skipReason, null)
	assert.match(parsed.comment, /accent balances the background/)
})

test("feedback requires exactly one quality or skip reason", () => {
	const manifest = fixtureManifest()
	const entry = manifest.entries[0]
	const skipped = {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		skipReason: "dud",
		overallQuality: null,
		comment: "Broken source.",
	}
	assert.equal(parsePaletteRole00AuditFeedbackEntry(skipped, manifest, false).skipReason, "dud")
	assert.throws(
		() => parsePaletteRole00AuditFeedbackEntry({ ...skipped, overallQuality: "weak" }, manifest, false),
		/exactly one whole-palette quality or skip reason/,
	)
	assert.throws(
		() => parsePaletteRole00AuditFeedbackEntry({ ...skipped, skipReason: null }, manifest, false),
		/exactly one whole-palette quality or skip reason/,
	)
})

test("00 audit presentation is grayscale and exposes only holistic triage controls", async () => {
	const [html, app, css] = await Promise.all([
		readFile(new URL("../palette-role-00-audit/index.html", import.meta.url), "utf8"),
		readFile(new URL("../palette-role-00-audit/app.js", import.meta.url), "utf8"),
		readFile(new URL("../palette-role-00-audit/styles.css", import.meta.url), "utf8"),
	])
	for (const source of [html, app, css]) {
		for (const match of source.matchAll(/#([a-f0-9]{3}|[a-f0-9]{6})(?![a-f0-9])/gi)) {
			const channels = match[1].length === 3
				? match[1].split("").map((value) => value + value)
				: match[1].match(/../g)!
			assert.equal(channels[0].toLowerCase(), channels[1].toLowerCase(), `non-grayscale literal #${match[1]}`)
			assert.equal(channels[1].toLowerCase(), channels[2].toLowerCase(), `non-grayscale literal #${match[1]}`)
		}
	}
	assert.match(html, /Thirty palettes/i)
	assert.match(html, /coordinated whole/i)
	assert.match(html, /not prevalence or promotion evidence/i)
	assert.match(app, /Palette quality/)
	assert.match(app, /Skip artwork instead/)
	assert.match(app, /dependencies between roles/)
	assert.doesNotMatch(app, /roleVerdicts|collapseAssessment|accessibilityAssessment|failureTags/)
})
