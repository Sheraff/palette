/**
 * Per-item side blinding, kept verbatim from v2-3 (REVIEW_UI.md §2): sides are shuffled per item
 * by content hash, and the unblinding key is never served.
 *
 * **The shuffle is salted, and the salt is the key.** An earlier version of this file derived the
 * shuffle from content alone — artwork hash plus both palette hashes — and claimed that was safe
 * because computing it needs the palettes. That was false: the server *serves* both palettes, in
 * full, because the reviewer has to look at them. An adversarial verifier reconstructed all 120
 * palette hashes from browser-received JSON and uniquely determined the side order on 28 of 60
 * items (73.3% marginal accuracy) — the true pushed order always reproduces itself, so it is
 * always self-consistent, and the wrong one only coincides half the time.
 *
 * The fix is a cryptographically random 32-byte salt per batch, generated at push time and kept in
 * the batch log (server-side, never served). Without it the digest cannot be evaluated at all, and
 * both pushed orders stay exactly equally plausible from served data. Restart stability now comes
 * from persistence — the salt and the resulting blinding are both stored — rather than from pure
 * content-determinism.
 *
 * Deliberately NOT done: sorting the two palette hashes before hashing. That would make the digest
 * independent of pushed order, which removes the ambiguity entirely and hands an attacker a
 * 100%-certain unblinding instead of a 50/50.
 *
 * Palette hashing is the warehouse's `hashPalette` (canonical JSON, sha256), so the hash recorded
 * on a verdict and the hash the shuffle is derived from are the same number.
 */
import { createHash, randomBytes } from "node:crypto"

/**
 * Salt length. 32 bytes = 256 bits, matching the digest it feeds; guessing it is the only attack
 * left once it is unguessable, so there is no reason to be cheaper.
 * [UNCALIBRATED] — chosen here; any cryptographically random value of this size works.
 */
export const BLINDING_SALT_BYTES = 32

export function sha256(value: string | Buffer | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

/** A fresh per-batch blinding salt. Generated once at push time, then persisted. */
export function newBlindingSalt(): string {
	return randomBytes(BLINDING_SALT_BYTES).toString("hex")
}

/**
 * An opaque handle for one bracketing item. Same idea, smaller stakes: the browser needs *a* name
 * to answer with, and the fixture's own item ids are readable ("dark-neutral-04", "control-0").
 * 8 random bytes is far more than 72 items need and cannot be guessed from the committed fixture.
 */
export function newAnswerToken(): string {
	return randomBytes(8).toString("hex")
}

export type Blinding = Readonly<{ A: 0 | 1; B: 0 | 1 }>

/**
 * Decide which pushed side index each blinded side shows.
 *
 * Deterministic given the salt, so a restart or a later audit reproduces the same shuffle;
 * unguessable without it, so the served payload determines nothing.
 */
export function blindItem(
	blindingSalt: string,
	imageSha256: string,
	paletteHashes: readonly [string, string],
): Blinding {
	if (typeof blindingSalt !== "string" || blindingSalt.length === 0) {
		throw new Error("Blinding needs a per-batch salt; an unsalted shuffle is reconstructible from served data")
	}
	const digest = sha256([blindingSalt, imageSha256, ...paletteHashes].join(" "))
	// One bit is all a two-way shuffle needs; the low bit of the first byte is as good as any.
	const swap = Number.parseInt(digest.slice(0, 2), 16) % 2 === 1
	return swap ? { A: 1, B: 0 } : { A: 0, B: 1 }
}
