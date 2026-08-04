/**
 * Check 6 — the falsifier's join, spot-checked independently.
 *
 * Three endorsed artworks are picked deterministically from `data/legacy/endorsements.json`, their
 * files resolved by this file's own root walk (never `falsifier/corpus.ts`), and sha-256'd here.
 * The claim under test is that `artwork.contentSha256` is plain sha-256 of the file's bytes — the
 * thing the whole reachability join is keyed on.
 */

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { sha256File } from "./lib.ts"

const V3 = new URL("../../../", import.meta.url).pathname

/**
 * Roots an `imagePath` is tried against, in order.
 *
 * [INHERITED] — the corpus shards are gitignored, so a worktree may or may not carry them; the main
 * checkout always does. Written out here rather than imported so the check does not lean on the
 * code that produced the claim.
 */
export const ROOTS = [resolve(V3, "..", ".."), "/Users/Flo/GitHub/palette"]

/** How many endorsed artworks to spot-check. [UNCALIBRATED] — three, as the task asks. */
export const SPOT_CHECK_N = 3

const doc = JSON.parse(await readFile(`${V3}data/legacy/endorsements.json`, "utf8"))
const shards = (await readFile(
	new URL("../falsifier/out/endorsed-173.txt", import.meta.url).pathname,
	"utf8",
))
	.split("\n")
	.filter((l) => l.trim().length > 0)

// Deterministic pick: sorted distinct endorsed shas, evenly spaced.
const bySha = new Map<string, any>()
for (const e of doc.entries) if (!bySha.has(e.artwork.contentSha256)) bySha.set(e.artwork.contentSha256, e.artwork)
const shas = [...bySha.keys()].sort()
const picks = [0, Math.floor(shas.length / 2), shas.length - 1].slice(0, SPOT_CHECK_N).map((i) => shas[i]!)

const results = []
for (const sha of picks) {
	const art = bySha.get(sha)!
	let absolute: string | null = null
	for (const root of ROOTS) {
		const c = resolve(root, art.imagePath)
		if (existsSync(c)) {
			absolute = c
			break
		}
	}
	const computed = absolute ? await sha256File(absolute) : null
	const bytes = absolute ? (await readFile(absolute)).byteLength : null
	results.push({
		imagePath: art.imagePath,
		resolved: absolute !== null,
		claimedSha: sha,
		computedSha: computed,
		shaMatches: computed === sha,
		claimedBytes: art.byteCount,
		actualBytes: bytes,
		byteCountMatches: bytes === art.byteCount,
	})
}

console.log(
	JSON.stringify({
		check: "falsifier-join-spotcheck",
		distinctEndorsedArtworks: shas.length,
		endorsedListLines: shards.length,
		listMatchesDistinctCount: shards.length === shas.length,
		listIsSubsetOfEndorsements: shards.every((p) => [...bySha.values()].some((a) => a.imagePath === p)),
		spotChecks: results,
	}, null, 1),
)
