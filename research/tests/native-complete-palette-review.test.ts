import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE,
	NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE,
	NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	nativeCompletePaletteReviewFailureClasses,
	nativeCompletePaletteReviewManifestId,
	parseNativeCompletePaletteReviewFeedbackEntry,
	parseNativeCompletePaletteReviewManifest,
	type NativeCompletePalettePresentedPalette,
	type NativeCompletePaletteReviewEntry,
	type NativeCompletePaletteReviewManifest,
} from "../src/native-complete-palette-review.ts"

const hash = "a".repeat(64)

function palette(accent: number): NativeCompletePalettePresentedPalette {
	const values = { background: 10, foreground: 240, surface: 30, accent }
	return {
		roles: Object.fromEntries(Object.entries(values).map(([role, value]) => [role, {
			rgb: [value, value, value], hex: `#${value.toString(16).padStart(2, "0").repeat(3)}`,
			nearestName: role, generated: false, sourceDistance: 0,
		}])) as NativeCompletePalettePresentedPalette["roles"],
		gradient: { isGradient: false, confidence: 1 },
		metrics: { foregroundContrast: 10, foregroundSurfaceContrast: 8, accentContrast: 3,
			accentSurfaceContrast: 2, minimumRoleDistance: 0.1, meanSourceDistance: 0, meanReconstructionError: 0.1 },
	}
}

function entry(index: number, kind: NativeCompletePaletteReviewEntry["kind"], sourceIndex: number,
	materialChanged = false): NativeCompletePaletteReviewEntry {
	const changed = kind === "changed" || kind === "hidden-repeat"
	const baseline = palette(100)
	const candidate = changed ? palette(150 + sourceIndex) : baseline
	return {
		caseId: `ncpr-${index.toString(16).padStart(20, "0")}`,
		order: index,
		kind,
		cohort: "00",
		materialChanged,
		source: { file: `00/example-${sourceIndex}.jpg`, sha256: sourceIndex.toString(16).padStart(64, "0"),
			bytes: 100 + sourceIndex, width: 100, height: 100 },
		changedRoles: changed ? ["accent"] : [],
		gradientChanged: false,
		options: index % 2 === 0 ? { A: candidate, B: baseline } : { A: baseline, B: candidate },
		assignment: index % 2 === 0 ? { A: "candidate", B: "baseline" } : { A: "baseline", B: "candidate" },
	}
}

function manifest(): NativeCompletePaletteReviewManifest {
	const entries = [
		...Array.from({ length: 6 }, (_, index) => entry(index, "changed", index, index < 2)),
		entry(6, "hidden-repeat", 0, true),
		entry(7, "hidden-repeat", 1, true),
		entry(8, "accepted-control", 8),
		entry(9, "rejected-control", 9),
		...Array.from({ length: 5 }, (_, index) => entry(10 + index, "known-control", 10 + index)),
	]
	const identity: Omit<NativeCompletePaletteReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
		presentationVersion: NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
		experimentId: hash,
		candidate: NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE,
		baseline: NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE,
		reviewAuthorizationSha256: hash,
		batch: { index: 1, size: 15, totalBatches: 1, totalCases: 15 },
		provenance: { experiment: { phase5: hash }, implementation: { parser: hash }, presentation: { app: hash } },
		entries,
	}
	return { ...identity, generatedAt: "2026-07-26T00:00:00.000Z",
		manifestId: nativeCompletePaletteReviewManifestId(identity) }
}

test("native complete-palette review manifest strictly binds six changes, two repeats, and seven controls", () => {
	const value = manifest()
	assert.deepEqual(parseNativeCompletePaletteReviewManifest(value), value)
	assert.throws(() => parseNativeCompletePaletteReviewManifest({ ...value, experimentId: "b".repeat(64) }), /stale/)
	const reserve = structuredClone(value)
	reserve.entries[0].source.file = "10/secret.jpg"
	assert.throws(() => parseNativeCompletePaletteReviewManifest(reserve), /entry 0 is invalid/)
	const missingControl = structuredClone(value)
	missingControl.entries[10].kind = "changed"
	assert.throws(() => parseNativeCompletePaletteReviewManifest(missingControl), /classification|composition/)
})

test("native complete-palette feedback preserves complete quality, comparison, and failure-class outcomes", () => {
	const value = manifest()
	const parsed = parseNativeCompletePaletteReviewFeedbackEntry({
		caseId: value.entries[0].caseId,
		sourceSha256: value.entries[0].source.sha256,
		sourceEligibility: "eligible-artwork",
		qualityA: "strong",
		qualityB: "acceptable-not-ideal",
		preference: "both-similarly-valid",
		failureClassesA: [],
		failureClassesB: [...nativeCompletePaletteReviewFailureClasses],
		note: "  qualitative context  ",
	}, value, false)
	assert.equal(parsed.note, "qualitative context")
	assert.deepEqual(parsed.failureClassesB, [...nativeCompletePaletteReviewFailureClasses])
	assert.throws(() => parseNativeCompletePaletteReviewFeedbackEntry({
		caseId: parsed.caseId,
		sourceSha256: parsed.sourceSha256,
		sourceEligibility: "not-reviewable",
		qualityA: parsed.qualityA,
		qualityB: parsed.qualityB,
		preference: parsed.preference,
		failureClassesA: parsed.failureClassesA,
		failureClassesB: parsed.failureClassesB,
		note: parsed.note,
	}, value, false), /Ineligible sources cannot have palette judgments/)
})

test("authorized presentation exposes all mandatory classes with achromatic chrome", async () => {
	const [app, css] = await Promise.all([
		readFile(new URL("../native-complete-palette-review/app.js", import.meta.url), "utf8"),
		readFile(new URL("../native-complete-palette-review/styles.css", import.meta.url), "utf8"),
	])
	for (const failureClass of nativeCompletePaletteReviewFailureClasses) assert.match(app, new RegExp(`"${failureClass}"`))
	const colors = [...css.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((match) => match[0])
	assert.ok(colors.length > 0)
	for (const color of colors) {
		const expanded = color.length === 4
			? color.slice(1).split("").map((channel) => channel.repeat(2))
			: [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]
		assert.equal(new Set(expanded.map((channel) => channel.toLowerCase())).size, 1, color)
	}
})
