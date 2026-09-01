import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
	CHROMATIC_ROLE_REVIEW_VERSION,
	chromaticRoleReviewManifestId,
	parseChromaticRoleReviewFeedbackEntry,
	parseChromaticRoleReviewManifest,
	type ChromaticRolePresentedPalette,
	type ChromaticRoleReviewManifest,
} from "../src/chromatic-role-review.ts"

function palette(offset: number): ChromaticRolePresentedPalette {
	return {
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role, index) => {
			const channel = index * 40 + offset
			return [role, { rgb: [channel, channel, channel], hex: `#${channel.toString(16).padStart(2, "0").repeat(3)}`,
				nearestName: `Gray ${channel}`, generated: false, sourceDistance: 0 }]
		})) as unknown as ChromaticRolePresentedPalette["roles"],
		gradient: { isGradient: false, confidence: 1 },
		metrics: { foregroundContrast: 5, foregroundSurfaceContrast: 5, accentContrast: 2,
			accentSurfaceContrast: 2, minimumRoleDistance: .1, meanSourceDistance: 0, meanReconstructionError: .1 },
	}
}

function manifest(): ChromaticRoleReviewManifest {
	const entries = Array.from({ length: 4 }, (_, index) => ({
		caseId: `cr-${index.toString(16).padStart(20, "0")}`,
		cohort: index === 3 ? "rejected-target" as const : "accepted" as const,
		source: { file: `00/example-${index}.jpg`, sha256: index.toString(16).repeat(64), bytes: 100,
			width: 300, height: 300 },
		normalized: { width: 224, height: 224 },
		changedRoles: ["accent" as const],
		options: { A: palette(0), B: palette(1) },
		assignment: index % 2 === 0
			? { A: "baseline" as const, B: "candidate" as const }
			: { A: "candidate" as const, B: "baseline" as const },
	}))
	const identity: Omit<ChromaticRoleReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: CHROMATIC_ROLE_REVIEW_VERSION,
		presentationVersion: CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
		baselineAlgorithmVersion: "region-graph-0.17.0",
		candidateAlgorithmVersion: "region-chromatic-role-0.1.0-poc.9",
		provenance: { sourceSelectionSha256: "a".repeat(64), baselineHoldoutSha256: "b".repeat(64),
			candidateHoldoutSha256: "c".repeat(64), implementation: { "a.ts": "d".repeat(64) },
			presentation: { "index.html": "e".repeat(64) } },
		entries,
	}
	return { ...identity, generatedAt: "2026-07-20T00:00:00.000Z", manifestId: chromaticRoleReviewManifestId(identity) }
}

test("blinded review manifests bind both options and their hidden assignment", () => {
	const value = manifest()
	assert.equal(parseChromaticRoleReviewManifest(value).entries.length, 4)
	value.entries[0].assignment.A = "candidate"
	assert.throws(() => parseChromaticRoleReviewManifest(value), /assignment is invalid/)
})

test("eligible feedback records independent quality and a non-exclusive comparison", () => {
	const value = manifest()
	const entry = value.entries[0]
	const parsed = parseChromaticRoleReviewFeedbackEntry({
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: "eligible-artwork",
		qualityA: "acceptable-not-ideal",
		qualityB: "strong",
		preference: "b-stronger",
		failureTagsA: ["wrong-accent"],
		failureTagsB: [],
		note: "B better represents the artwork.",
	}, value, false)
	assert.equal(parsed.qualityA, "acceptable-not-ideal")
	assert.equal(parsed.preference, "b-stronger")
})

test("chromatic review chrome uses only achromatic literal colors", async () => {
	const css = await readFile(new URL("../chromatic-role-review/styles.css", import.meta.url), "utf8")
	for (const match of css.matchAll(/#([a-f0-9]{3}|[a-f0-9]{6})\b/gi)) {
		const channels = match[1].length === 3 ? match[1].split("").map((value) => value + value) : match[1].match(/../g)!
		assert.equal(channels[0].toLowerCase(), channels[1].toLowerCase(), `non-grayscale CSS color #${match[1]}`)
		assert.equal(channels[1].toLowerCase(), channels[2].toLowerCase(), `non-grayscale CSS color #${match[1]}`)
	}
})
