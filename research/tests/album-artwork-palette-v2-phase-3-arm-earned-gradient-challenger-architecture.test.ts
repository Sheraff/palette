import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CHALLENGER_URL = new URL(
	"../src/album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger.ts",
	import.meta.url,
)
const ATTEMPT_URL = new URL(
	"../src/album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger-attempt.ts",
	import.meta.url,
)

test("the challenger is an isolated post-selection composition over existing complete treatments", async () => {
	const challenger = await readFile(CHALLENGER_URL, "utf8")
	const attempt = await readFile(ATTEMPT_URL, "utf8")

	assert.match(challenger, /AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection/u)
	assert.match(challenger, /AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection/u)
	assert.match(challenger, /AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate/u)
	assert.doesNotMatch(challenger,
		/(?:constructAlbumArtwork|materializeAlbumArtwork|buildAlbumArtworkPalette|assignFieldRoles|new\s+CompletePalette)/u)
	assert.match(attempt, /selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2/u)
	assert.match(attempt, /selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody/u)
	assert.match(attempt, /selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger/u)
	for (const source of [challenger, attempt]) {
		assert.doesNotMatch(source, /from\s+["']node:/u)
		assert.doesNotMatch(source,
			/(?:\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical|closedDetails\.result\.(?:winner|alternatives))/iu)
		assert.doesNotMatch(source,
			/album-artwork-palette-v2-phase-3-(?:contract|recovery-v2|recovery-v3)\.ts|run-album-artwork-palette/u)
	}
})

test("the standalone arm is explicitly exported and registered for grouped comparison", async () => {
	const [contract, runner] = await Promise.all([
		readFile(new URL("../src/album-artwork-palette-v2-phase-3-contract.ts", import.meta.url), "utf8"),
		readFile(new URL("../run-album-artwork-palette-v2-phase-3-iteration.ts", import.meta.url), "utf8"),
	])
	for (const source of [contract, runner]) {
		assert.match(source, /ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT/u)
	}
})
