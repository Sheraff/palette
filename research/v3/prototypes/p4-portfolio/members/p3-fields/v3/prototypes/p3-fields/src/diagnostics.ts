/**
 * **Dev-only diagnostics side channel. Not part of the algorithm.**
 *
 * The 0.2.0 tie bands were added at three *suspected* cliff sites and the all-four-role flip count did
 * not move (19 → 19 on the 150-trial smoke). That is the point at which guessing has to stop: this
 * module exists so the decision chain of a single run can be written down, two runs of a perturbation
 * pair compared position by position, and the **first** stage at which they diverge named rather than
 * inferred.
 *
 * ## The discipline line, and why this file does not touch it
 *
 * README's line bans *creating colour* in the selection path. Everything here is either a **scalar**
 * (a count, a quantile, an OKLab L, a Spearman ρ) or the **identity of a pixel already published** (its
 * index, and the hex of that exact pixel). Nothing computed here is read back by any selector: the
 * record is built from values the pipeline has already decided, written to a file, and never consulted
 * again. The published palette is therefore a function of the image alone, with or without `P3_DIAG`
 * set — which is checked rather than asserted (`measurements/attribution/ATTRIBUTION.md`
 * §"Diagnostics no-op proof" records the byte-identity runs over demo-20 with diagnostics off and
 * on, at both k = 3 and k = 5).
 *
 * ## Contract
 *
 * - Enabled only by the `P3_DIAG` environment variable, whose value is a **directory**.
 * - One JSON file per *image path*, named by a hash of the path, so a baseline and its perturbed twin
 *   never collide and a joiner that knows the path knows the filename.
 * - Writing is best-effort in the sense that it happens after every selection is final; a diagnostics
 *   failure throws rather than being swallowed, because a silently missing record would be read as an
 *   agreeing stage.
 */

import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

/** Read once, at module load: a run either is a diagnostic run or is not, and cannot become one. */
const DIAG_DIR: string | null = process.env.P3_DIAG !== undefined && process.env.P3_DIAG.length > 0
	? process.env.P3_DIAG
	: null

/** Is this a diagnostic run? Every diagnostic-only computation in the pipeline is behind this. */
export function diagnosticsEnabled(): boolean {
	return DIAG_DIR !== null
}

/**
 * The record's filename stem: a hash of the **path**, not of the bytes, so twins never collide.
 *
 * [UNCALIBRATED] — 24 hex characters (96 bits) is a filename length, chosen here. It is a collision
 * budget for a few hundred paths per sweep, where 96 bits is many orders of magnitude of headroom, and
 * nothing downstream reads meaning out of the stem. **Anchor plan:** none — a collision is detectable
 * (two images, one file) and the fix is more characters.
 */
export function diagnosticsKey(imagePath: string): string {
	// [UNCALIBRATED] — 24 hex characters, i.e. 96 bits of the digest. See the docstring above.
	return createHash("sha1").update(imagePath).digest("hex").slice(0, 24)
}

let directoryReady: Promise<unknown> | null = null

/** Write one image's decision chain. No-op when `P3_DIAG` is unset. */
export async function writeDiagnostics(imagePath: string, record: Record<string, unknown>): Promise<void> {
	if (DIAG_DIR === null) return
	if (directoryReady === null) directoryReady = mkdir(DIAG_DIR, { recursive: true })
	await directoryReady
	const body = JSON.stringify({ imagePath, ...record })
	await writeFile(path.join(DIAG_DIR, `${diagnosticsKey(imagePath)}.json`), `${body}\n`)
}

/**
 * The eleven nearest-rank deciles (q = 0, 0.1, … 1) of a run of scalars.
 *
 * Nearest-rank, matching `quantileIndex` in `primitives.ts`, so a decile reported here and a rank the
 * pipeline redeems are read off the same definition. Used for the top-τ window's L-distribution, which
 * is where the bimodal-cascade hypothesis is tested.
 */
export function deciles(values: readonly number[] | Float64Array): number[] {
	const sorted = Float64Array.from(values).sort()
	const n = sorted.length
	if (n === 0) return []
	const out: number[] = []
	// [INHERITED] — ten is what "decile" means; the eleven cut points are q = 0, 0.1, … 1. It is the
	// same resolution `LUMP_DECILES` names for the selection path, and it is a definition, not a choice.
	for (let decile = 0; decile <= 10; decile += 1) {
		// [INHERITED] — ten, again: the divisor turns a decile index into a quantile.
		const at = Math.min(n - 1, Math.max(0, Math.round((decile / 10) * (n - 1))))
		out.push(sorted[at])
	}
	return out
}
