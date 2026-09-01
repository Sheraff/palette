import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	extractAlbumArtworkPaletteV2,
	extractAlbumArtworkPaletteV2074,
	extractAlbumArtworkPaletteV2Phase3Closed074,
	extractAlbumArtworkPaletteV2Phase3Live072,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT,
	extractAlbumArtworkPaletteV2Phase3FinalCandidate,
	materialDeltaFromAlbumArtworkPaletteV2Phase3Anchor,
	normalizeAlbumArtworkPaletteV2Phase3Result,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import type {
	AlbumArtworkPaletteV2Phase3NormalizedResult,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION,
	executeAlbumArtworkPaletteV2Phase3Case,
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
	selectAlbumArtworkPaletteV2Phase3DevelopmentSources,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"
import type {
	AlbumArtworkPaletteV2Phase3DevelopmentSource,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"

type Frozen072Source = Readonly<{
	source: AlbumArtworkPaletteV2Phase3DevelopmentSource
	extraction: ReturnType<typeof extractAlbumArtworkPaletteV2>
}>

type Frozen074Source = Readonly<{
	scientific: Readonly<{
		candidate: Readonly<{
			winner: Readonly<{ treatment: unknown }>
			slate: ReadonlyArray<Readonly<{ treatment: unknown }>>
		}>
	}>
}>

function assertNormalizedParity(
	normalized: AlbumArtworkPaletteV2Phase3NormalizedResult,
	direct: ReturnType<typeof extractAlbumArtworkPaletteV2>,
): void {
	assert.equal(normalized.version, direct.version)
	assert.equal(normalized.protocol, direct.protocol)
	assert.deepEqual(normalized.dimensions, { width: direct.width, height: direct.height })
	assert.equal(JSON.stringify(normalized.winner.treatment), JSON.stringify(direct.winner))
	assert.equal(JSON.stringify(normalized.alternatives.map(({ treatment }) => treatment)),
		JSON.stringify(direct.alternatives))
	assert.equal(JSON.stringify(normalized.diagnostics), JSON.stringify(direct.diagnostics))
}

test("Phase 3 wrappers and normalization preserve live 0.7.2 and closed 0.7.4 bytes and semantics", async () => {
	const [frozen072Raw, frozen074Raw] = await Promise.all([
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.2-development/sources/development-01.json", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-01.json", import.meta.url), "utf8"),
	])
	const frozen072 = JSON.parse(frozen072Raw) as Frozen072Source
	const frozen074 = JSON.parse(frozen074Raw) as Frozen074Source
	const image = await loadNativeImage(await readFile(new URL(`../../${frozen072.source.path}`, import.meta.url)))

	const live072 = extractAlbumArtworkPaletteV2Phase3Live072(image)
	const direct072 = extractAlbumArtworkPaletteV2(image)
	assert.equal(JSON.stringify(live072), JSON.stringify(direct072))
	assert.equal(JSON.stringify(live072), JSON.stringify(frozen072.extraction))

	const closed074 = extractAlbumArtworkPaletteV2Phase3Closed074(image)
	const direct074 = extractAlbumArtworkPaletteV2074(image)
	assert.equal(JSON.stringify(closed074), JSON.stringify(direct074))
	assert.equal(JSON.stringify(closed074.winner), JSON.stringify(frozen074.scientific.candidate.winner.treatment))
	assert.equal(JSON.stringify(closed074.alternatives),
		JSON.stringify(frozen074.scientific.candidate.slate.map(({ treatment }) => treatment)))

	assertNormalizedParity(normalizeAlbumArtworkPaletteV2Phase3Result(live072), direct072)
	assertNormalizedParity(normalizeAlbumArtworkPaletteV2Phase3Result(closed074), direct074)
})

test("bounded runner emits normalized source-bound attempts, runtime, and anchor material delta", async () => {
	const frozen = JSON.parse(await readFile(new URL(
		"../data/experiments/album-artwork-palette-v2-0.7.2-development/sources/development-01.json",
		import.meta.url,
	), "utf8")) as Frozen072Source
	const image = await loadNativeImage(await readFile(new URL(`../../${frozen.source.path}`, import.meta.url)))
	const artifact = executeAlbumArtworkPaletteV2Phase3Case(
		frozen.source,
		image,
		[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT],
	)

	assert.deepEqual(artifact.source, {
		caseId: frozen.source.caseId,
		sha256: frozen.source.sha256,
		byteCount: frozen.source.byteCount,
		artworkId: frozen.source.artworkId,
		width: image.width,
		height: image.height,
	})
	assert.equal(artifact.anchor.identity.anchorId, "closed-0.7.4")
	assert.equal(artifact.attempts[0].identity.attemptId, "live-0.7.2")
	assert.equal(JSON.stringify(artifact.attempts[0].output.winner.treatment),
		JSON.stringify(frozen.extraction.winner))
	assert.deepEqual(artifact.attempts[0].materialDelta,
		materialDeltaFromAlbumArtworkPaletteV2Phase3Anchor(
			artifact.attempts[0].output,
			artifact.anchor.output,
		))
	for (const runtime of [artifact.anchor.runtime, artifact.attempts[0].runtime]) {
		assert.ok(Number.isFinite(runtime.wallMs) && runtime.wallMs >= 0)
		assert.ok(Number.isFinite(runtime.cpuUserMs) && runtime.cpuUserMs >= 0)
		assert.ok(Number.isFinite(runtime.cpuSystemMs) && runtime.cpuSystemMs >= 0)
	}
})

test("contract exports and bounded runner execute the exact final candidate", async () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
		"phase-3-final-candidate")
	assert.deepEqual(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	})
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.configurationId,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID)
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "final-candidate-contract-test",
		"--case", "development-01",
		"--attempt", ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	]), {
		iterationId: "final-candidate-contract-test",
		caseIds: ["development-01"],
		attemptIds: [ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID],
	})

	const frozen = JSON.parse(await readFile(new URL(
		"../data/experiments/album-artwork-palette-v2-0.7.2-development/sources/development-01.json",
		import.meta.url,
	), "utf8")) as Frozen072Source
	const image = await loadNativeImage(await readFile(new URL(`../../${frozen.source.path}`, import.meta.url)))
	const artifact = executeAlbumArtworkPaletteV2Phase3Case(
		frozen.source,
		image,
		[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT],
	)
	const direct = extractAlbumArtworkPaletteV2Phase3FinalCandidate(image)

	assert.deepEqual(artifact.attempts[0].identity,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity)
	assert.equal(artifact.attempts[0].output.version,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID)
	assert.equal(artifact.attempts[0].output.protocol,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID)
	assert.equal(JSON.stringify(artifact.attempts[0].output),
		JSON.stringify(normalizeAlbumArtworkPaletteV2Phase3Result(direct)))
})

test("runner requires explicit allowlisted development cases and rejects protected or reserve identities", () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MAXIMUM_ATTEMPTS_PER_ITERATION, 5)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "custody-test", "--case", "development-01",
		"--attempt", "phase-3-unknown",
	]), /Unknown Phase 3 attempt phase-3-unknown/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "custody-test", "--case", "development-01",
		"--attempt", "live-0.7.2",
		"--attempt", "phase-3-working",
		"--attempt", "phase-3-candidate-v2",
		"--attempt", "phase-3-recovery",
		"--attempt", "phase-3-recovery-v2",
		"--attempt", ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	]), /limited to 5 attempts/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "custody-test", "--case", "fresh-12",
	]), /forbidden/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "custody-test", "--case", "future-03-12",
	]), /forbidden/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "custody-test",
	]), /explicit development case ID/u)

	const reserveSource: AlbumArtworkPaletteV2Phase3DevelopmentSource = {
		caseId: "development-99",
		path: "12/reserve.jpg",
		sha256: "0".repeat(64),
		byteCount: 1,
		artworkId: "reserve",
		cohort: "dataset",
		structureTags: [],
	}
	assert.throws(() => selectAlbumArtworkPaletteV2Phase3DevelopmentSources({
		schemaVersion: 1,
		sourceCount: 1,
		sources: [reserveSource],
	}, [reserveSource.caseId]), /reserve/u)
	assert.throws(() => executeAlbumArtworkPaletteV2Phase3Case(
		reserveSource,
		{ width: 1, height: 1, data: new Uint8Array(3) },
		[ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT],
	), /reserve/u)
})

test("inference contract has no filesystem, artifact, manifest, warehouse, or review dependency", async () => {
	const source = await readFile(new URL("../src/album-artwork-palette-v2-phase-3-contract.ts", import.meta.url), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source, /(?:artifact|manifest|warehouse|feedback|review)/iu)
})
