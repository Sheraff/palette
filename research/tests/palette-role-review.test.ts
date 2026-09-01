import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	PALETTE_ROLE_PRESENTATION_VERSION,
	PALETTE_ROLE_REVIEW_VERSION,
	paletteRoleManifestId,
	parsePaletteRoleFeedbackEntry,
	parsePaletteRoleManifest,
	type PaletteRoleReviewManifest,
	type PresentedPalette,
} from "../src/palette-role-review.ts"

function presentedPalette(offset = 0): PresentedPalette {
	return {
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role, index) => {
			const channel = index * 40 + offset
			return [role, {
				rgb: [channel, channel, channel],
				hex: `#${channel.toString(16).padStart(2, "0").repeat(3)}`,
				nearestName: `Gray ${channel}`,
				generated: false,
				sourceDistance: 0,
			}]
		})) as unknown as PresentedPalette["roles"],
		gradient: { isGradient: false, confidence: 1 },
		metrics: {
			foregroundContrast: 5,
			foregroundSurfaceContrast: 5,
			accentContrast: 2,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0.1,
		},
		backgroundSurface: { oklabDistance: 0.1, contrast: 2, collapsed: false },
	}
}

function fixtureManifest(): PaletteRoleReviewManifest {
	const entries = Array.from({ length: 4 }, (_, index) => ({
		caseId: `pr-${index.toString(16).padStart(20, "0")}`,
		source: {
			file: `00/example-${index}.jpg`,
			sha256: index.toString(16).repeat(64),
			bytes: 100,
			width: 300,
			height: 300,
		},
		developmentContext: { priorEvidence: "fixture", targetRoles: ["surface" as const] },
		normalized: { width: 224, height: 224 },
		current: presentedPalette(),
		alternatives: [
			{ id: "A01", kind: "candidate-substitution" as const, changedRoles: ["surface" as const], palette: presentedPalette(1) },
			{ id: "A02", kind: "solver-direction" as const, changedRoles: ["surface" as const, "accent" as const], palette: presentedPalette(2) },
		],
	}))
	const identity: Omit<PaletteRoleReviewManifest, "manifestId" | "generatedAt"> = {
		schemaVersion: 2,
		reviewVersion: PALETTE_ROLE_REVIEW_VERSION,
		presentationVersion: PALETTE_ROLE_PRESENTATION_VERSION,
		algorithmVersion: "region-graph-0.17.0",
		provenance: {
			sourceSelectionSha256: "a".repeat(64),
			absoluteFeedbackSha256: "b".repeat(64),
			implementation: { "extract.ts": "c".repeat(64) },
			presentation: { "index.html": "d".repeat(64) },
		},
		entries,
	}
	return { ...identity, generatedAt: "2026-07-20T00:00:00.000Z", manifestId: paletteRoleManifestId(identity) }
}

test("counterexample manifest binds complete current and alternative palettes", () => {
	const manifest = fixtureManifest()
	assert.equal(parsePaletteRoleManifest(manifest).entries.length, 4)
	manifest.entries[0].alternatives[0].palette.roles.surface.hex = "#ffffff"
	assert.throws(() => parsePaletteRoleManifest(manifest), /identity is stale/)
})

test("feedback supports acceptable-but-not-ideal without claiming uniqueness", () => {
	const manifest = fixtureManifest()
	const entry = manifest.entries[0]
	const parsed = parsePaletteRoleFeedbackEntry({
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: "eligible-artwork",
		currentQuality: "acceptable-not-ideal",
		alternativeConclusion: "many-valid-no-ranking",
		improvedAlternativeIds: [],
		failureTags: [],
		note: "Several palettes work.",
	}, manifest, false)
	assert.equal(parsed.currentQuality, "acceptable-not-ideal")
	assert.equal(parsed.alternativeConclusion, "many-valid-no-ranking")
})

test("one or more marked alternatives are non-exclusive improvement counterexamples", () => {
	const manifest = fixtureManifest()
	const entry = manifest.entries[0]
	const base = {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: "eligible-artwork",
		currentQuality: "weak-fallback",
		alternativeConclusion: "shown-improvement",
		failureTags: ["surface-not-coherent"],
		note: "",
	}
	const parsed = parsePaletteRoleFeedbackEntry({ ...base, improvedAlternativeIds: ["A01", "A02"] }, manifest, false)
	assert.deepEqual(parsed.improvedAlternativeIds, ["A01", "A02"])
	assert.throws(() => parsePaletteRoleFeedbackEntry({ ...base, improvedAlternativeIds: [] }, manifest, false),
		/Mark at least one shown improvement/)
	assert.throws(() => parsePaletteRoleFeedbackEntry({ ...base, improvedAlternativeIds: ["A99"] }, manifest, false),
		/Unknown improved alternative/)
})

test("ineligible sources skip palette judgments", () => {
	const manifest = fixtureManifest()
	const entry = manifest.entries[0]
	const parsed = parsePaletteRoleFeedbackEntry({
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: "not-album-artwork",
		currentQuality: null,
		alternativeConclusion: null,
		improvedAlternativeIds: [],
		failureTags: [],
		note: "Band photograph.",
	}, manifest, false)
	assert.equal(parsed.currentQuality, null)
	assert.equal(parsed.alternativeConclusion, null)
})

test("review chrome uses only achromatic literal colors", async () => {
	const root = fileURLToPath(new URL("../palette-role-review/", import.meta.url))
	const css = await readFile(new URL("styles.css", `file://${root}/`), "utf8")
	for (const match of css.matchAll(/#([a-f0-9]{3}|[a-f0-9]{6})\b/gi)) {
		const channels = match[1].length === 3 ? match[1].split("").map((value) => value + value) : match[1].match(/../g)!
		assert.equal(channels[0].toLowerCase(), channels[1].toLowerCase(), `non-grayscale CSS color #${match[1]}`)
		assert.equal(channels[1].toLowerCase(), channels[2].toLowerCase(), `non-grayscale CSS color #${match[1]}`)
	}
})
