import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_FUTURE_03_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	parsePhase4ReviewSubmission,
	phase4ReviewManifestId,
} from "../src/album-artwork-palette-v2-phase-4-review.ts"

const sideDomain = "album-artwork-palette-v2-phase-4-side-assignment-v1"

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function palette(background: string, surface: string, foreground: string, accent: string, gradient = false) {
	const color = (role: string, hex: string) => ({ hex, nearestName: `${role} name`, generated: false })
	return {
		roles: {
			background: color("background", background),
			surface: color("surface", surface),
			foreground: color("foreground", foreground),
			accent: color("accent", accent),
		},
		gradient,
		collapse: { surface: background === surface, accent: foreground === accent },
	}
}

function manifestFixture() {
	const identity = {
		schemaVersion: 1 as const,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION,
		presentationVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
		cases: Array.from({ length: 12 }, (_, index) => ({
			caseId: `phase4-${String(index + 1).padStart(2, "0")}`,
			order: index,
			source: { file: `0f/source-${index}.jpg`, sha256: String(index).padStart(64, "0"), bytes: 100 + index },
			options: {
				A: palette("#000000", "#111111", "#ffffff", "#eeeeee", true),
				B: palette("#ffffff", "#eeeeee", "#000000", "#111111"),
			},
			assignment: index < 6
				? { A: "candidate" as const, B: "baseline" as const }
				: { A: "baseline" as const, B: "candidate" as const },
		})),
	}
	return { ...identity, manifestId: phase4ReviewManifestId(identity) }
}

test("Phase 4 private manifest is strict, complete, balanced, and identity-bound", () => {
	const fixture = manifestFixture()
	const parsed = parsePhase4PrivateReviewManifest(fixture)
	assert.equal(parsed.cases.length, 12)
	assert.equal(parsed.cases.filter(({ assignment }) => assignment.A === "candidate").length, 6)
	assert.throws(() => parsePhase4PrivateReviewManifest({ ...fixture, extra: true }))
	assert.throws(() => parsePhase4PrivateReviewManifest({ ...fixture, manifestId: "0".repeat(64) }))
	assert.throws(() => parsePhase4PrivateReviewManifest({
		...fixture,
		cases: fixture.cases.map((entry, index) => index === 0 ? { ...entry, order: 1 } : entry),
	}))
})

test("the reusable blinded shell accepts a bounded ranking-delta manifest", () => {
	const base = manifestFixture()
	const { manifestId: _manifestId, ...baseIdentity } = base
	const identity = {
		...baseIdentity,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
		cases: Array.from({ length: 19 }, (_, index) => ({
			...base.cases[index % base.cases.length],
			caseId: `ranking-${String(index + 1).padStart(2, "0")}`,
			order: index,
			source: { file: `images/source-${index}.jpg`, sha256: index.toString(16).padStart(64, "0"), bytes: 100 + index },
		})),
	}
	const parsed = parsePhase4PrivateReviewManifest({ ...identity, manifestId: phase4ReviewManifestId(identity) })
	assert.equal(parsed.cases.length, 19)
})

test("the future-sample review remains a strict 12-case blinded manifest", () => {
	const base = manifestFixture()
	const { manifestId: _manifestId, ...baseIdentity } = base
	const identity = { ...baseIdentity, reviewVersion: ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION }
	const parsed = parsePhase4PrivateReviewManifest({ ...identity, manifestId: phase4ReviewManifestId(identity) })
	assert.equal(parsed.cases.length, 12)
	const future03Identity = { ...baseIdentity, reviewVersion: ALBUM_ARTWORK_PALETTE_V2_FUTURE_03_REVIEW_VERSION }
	assert.equal(parsePhase4PrivateReviewManifest({ ...future03Identity,
		manifestId: phase4ReviewManifestId(future03Identity) }).cases.length, 12)
})

test("the exact-overlay gradient review is restricted to two blinded cases", () => {
	const base = manifestFixture()
	const { manifestId: _manifestId, ...baseIdentity } = base
	const identity = {
		...baseIdentity,
		reviewVersion: ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
		cases: base.cases.slice(0, 2),
	}
	const parsed = parsePhase4PrivateReviewManifest({ ...identity, manifestId: phase4ReviewManifestId(identity) })
	assert.equal(parsed.cases.length, 2)
	assert.throws(() => parsePhase4PrivateReviewManifest({
		...identity,
		cases: base.cases.slice(0, 3),
		manifestId: phase4ReviewManifestId({ ...identity, cases: base.cases.slice(0, 3) }),
	}))
})

test("Phase 4 feedback preserves comments verbatim and rejects extra or stale data", () => {
	const fixture = manifestFixture()
	const reviewCase = fixture.cases[0]
	const comment = "  exact whitespace\nremains  "
	const submission = {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		qualityA: "strong",
		qualityB: "acceptable",
		comparison: "a-stronger",
		tagsA: ["missing gradient"],
		tagsB: [],
		comment,
	}
	assert.equal(parsePhase4ReviewSubmission(submission, {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
	}).comment, comment)
	assert.throws(() => parsePhase4ReviewSubmission({ ...submission, extra: true }, {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
	}))
	assert.throws(() => parsePhase4ReviewSubmission({ ...submission, sourceSha256: "f".repeat(64) }, {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
	}))
	assert.throws(() => parsePhase4ReviewSubmission({ ...submission, tagsA: ["missing gradient", "missing gradient"] }, {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
	}))
	const store = parsePhase4ReviewFeedbackStore({
		schemaVersion: 1,
		reviewVersion: fixture.reviewVersion,
		manifestId: fixture.manifestId,
		entries: [{ ...submission, submittedAt: "2026-07-27T00:00:00.000Z" }],
	}, parsePhase4PrivateReviewManifest(fixture))
	assert.equal(store.entries[0].comment, comment)
})

test("Phase 4 assignment is deterministic, output-independent, and exactly balanced", async () => {
	const fresh = JSON.parse(await readFile(new URL("../data/album-artwork-palette-v2-fresh-sample.sealed.json", import.meta.url), "utf8"))
	const assignments = fresh.sources.map((source: { sha256: string }) => ({
		sha256: source.sha256,
		key: sha256(`${sideDomain}\0${fresh.sealCommitment}\0${source.sha256}`),
	})).sort((first: { key: string }, second: { key: string }) => first.key.localeCompare(second.key))
		.map((entry: { sha256: string; key: string }, index: number) => ({ ...entry, candidateSide: index < 6 ? "A" : "B" }))
	assert.equal(assignments.length, 12)
	assert.equal(assignments.filter(({ candidateSide }: { candidateSide: string }) => candidateSide === "A").length, 6)
	assert.equal(assignments.filter(({ candidateSide }: { candidateSide: string }) => candidateSide === "B").length, 6)
	assert.ok(assignments.every(({ key }: { key: string }) => /^[a-f0-9]{64}$/.test(key)))
})

test("Phase 4 candidate is isolated, candidate-first, and the review shell is fair", async () => {
	const [runner, candidateChild, app, css, phase3] = await Promise.all([
		readFile(new URL("../run-album-artwork-palette-v2-phase-4.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-4-candidate-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-4-review/app.js", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-4-review/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.4.4-development/absolute-quality-delta-analysis.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.doesNotMatch(candidateChild, /from ["']\.\/src\/(?:extract|image)\.ts["']/)
	assert.ok(runner.indexOf("await runCandidateChildren") < runner.indexOf("candidate-complete.json"))
	assert.ok(runner.indexOf("candidate-complete.json") < runner.indexOf("await runChild(baselineChildPath"))
	assert.match(runner, /5d0cfdaf80575046ecf8273bde4bc19a8ccd8ecccd95f74991230b397e4ed6f8/)
	assert.match(app, /linear-gradient\(135deg in oklab/)
	assert.match(app, /qualityA/)
	assert.match(app, /qualityB/)
	assert.doesNotMatch(app, /Option [AB][^\n]*(?:candidate|baseline)/i)
	const staticColors = css.match(/#[0-9a-fA-F]{3,6}/g) ?? []
	assert.ok(staticColors.every((value) => value === "#000" || value === "#fff"))
	assert.equal(phase3.phase3Gate.pass, true)
	assert.equal(phase3.phase3Gate.freezeCandidateForPhase4, true)
	assert.equal(phase3.freshSampleOpened, false)
	await access(new URL("../data/experiments", import.meta.url))
})

test("future sample 02 execution is frozen, candidate-first, and baseline-independent", async () => {
	const [runner, candidateChild, baselineChild, protocol, freeze] = await Promise.all([
		readFile(new URL("../run-album-artwork-palette-v2-0.5.2-phase-4.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-0.5.2-phase-4-candidate-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-0.5.2-phase-4-baseline-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_PHASE_4_FUTURE_02_PROTOCOL.md", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.5.2-development/candidate-freeze.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.doesNotMatch(candidateChild, /from ["']\.\/src\/(?:extract|image)\.ts["']/)
	assert.match(baselineChild, /from "\.\/src\/extract\.ts"/)
	assert.match(baselineChild, /from "\.\/src\/image\.ts"/)
	assert.doesNotMatch(baselineChild, /promotedPoc10/i)
	assert.ok(runner.indexOf("await runCandidateChildren") < runner.indexOf("candidate-complete.json"))
	assert.ok(runner.indexOf("candidate-complete.json") < runner.indexOf("await runChild(baselineChildPath"))
	assert.match(runner, /verifyAlbumArtworkPaletteV2FutureSample/)
	assert.doesNotMatch(runner, /readdir\([^)]*(?:\"10\"|'10')/)
	assert.match(protocol, /candidate-stronger count is greater than baseline-stronger count/)
	assert.equal(freeze.freezeId, "8a401a451b1c824c70ad1f0394870719b6786f092e27a19eda8a4b626fa7b01b")
	assert.equal(freeze.futureSample.opened, false)
	assert.equal(freeze.authorization.fullRoster, false)
})

test("future sample 03 execution is frozen, candidate-first, and root-11 bound", async () => {
	const [runner, candidateChild, baselineChild, protocol, freeze] = await Promise.all([
		readFile(new URL("../run-album-artwork-palette-v2-0.6.0-phase-4.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-0.6.0-phase-4-candidate-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-0.6.0-phase-4-baseline-child.ts", import.meta.url), "utf8"),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_PHASE_4_FUTURE_03_PROTOCOL.md", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.6.0-development/candidate-freeze.json", import.meta.url), "utf8").then(JSON.parse),
	])
	assert.doesNotMatch(candidateChild, /from ["']\.\/src\/(?:extract|image)\.ts["']/)
	assert.match(baselineChild, /from "\.\/src\/extract\.ts"/)
	assert.match(baselineChild, /from "\.\/src\/image\.ts"/)
	assert.ok(runner.indexOf("await runCandidateChildren") < runner.indexOf("candidate-complete.json"))
	assert.ok(runner.indexOf("candidate-complete.json") < runner.indexOf("await runChild(baselineChildPath"))
	assert.match(runner, /verifyAlbumArtworkPaletteV2FutureSample03/)
	assert.doesNotMatch(runner, /readdir\([^)]*(?:"11"|'11')/)
	assert.match(protocol, /candidate-stronger count is greater than baseline-stronger count/)
	assert.equal(freeze.freezeId, "d2a06b035931ffe70186c27f8436c0f8f68e14f8245638f741146b8d78a0d843")
	assert.equal(freeze.futureSample.opened, false)
	assert.equal(freeze.authorization.futureSample03OneWayExecutionEligible, true)
	assert.equal(freeze.authorization.fullRoster, false)
})
