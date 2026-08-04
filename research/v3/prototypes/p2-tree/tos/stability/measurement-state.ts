/**
 * **What code each stability measurement was taken against.**
 *
 * Cycle 2 runs several workers inside one worktree and `tos/pipeline.ts` and `tos/candidate.ts` are
 * being rewritten by siblings while this study runs. A number without the blob it came from is not a
 * measurement, so every report under `stability/` carries this block, and each script re-reads the
 * working tree at report time so a drift is visible in the artifact rather than in a memory.
 *
 * The **pinned** blobs are the state that produced `data/robustness/reports/p2-tos.json` and the
 * round-1 outcome — the artifacts these studies exist to explain. When a working blob differs from
 * its pinned blob the report says so and the reader knows the finding is about the pinned code.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const TOS_DIR = resolve(HERE, "..")

/**
 * The commit whose `tos/` state produced the robustness report and the round-1 review these studies
 * explain. `[INHERITED]` — recorded from `git rev-parse HEAD` at the start of this work.
 */
export const PINNED_COMMIT = "4d7c9d89e316c4ac006917a3aedf1d9f428444c9"

/**
 * `git rev-parse <PINNED_COMMIT>:research/v3/prototypes/p2-tree/tos/<file>` for the four files the
 * pipeline is, recorded at pin time. `[INHERITED]` — git object ids, not content hashes of the
 * working tree, so they cannot drift.
 */
export const PINNED_BLOBS: Readonly<Record<string, string>> = {
	"pipeline.ts": "99706e2b3e79",
	"tree.ts": "dc33d16c2d26",
	"constants.ts": "edb5268011e3",
	"candidate.ts": "52f80a911dfc",
}

/** Git's blob id for a file's current bytes: `sha1("blob <len>\0" + content)`. */
function gitBlobId(path: string): string {
	const content = readFileSync(path)
	return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex").slice(0, 12)
}

export type MeasurementState = Readonly<{
	pinnedCommit: string
	files: readonly Readonly<{ file: string; pinnedBlob: string; workingBlob: string | null; changedSincePin: boolean }>[]
	anyChanged: boolean
	note: string
}>

export function measurementState(): MeasurementState {
	const files = Object.entries(PINNED_BLOBS).map(([file, pinnedBlob]) => {
		const path = resolve(TOS_DIR, file)
		const workingBlob = existsSync(path) ? gitBlobId(path) : null
		return { file, pinnedBlob, workingBlob, changedSincePin: workingBlob !== pinnedBlob }
	})
	return {
		pinnedCommit: PINNED_COMMIT,
		files,
		anyChanged: files.some((entry) => entry.changedSincePin),
		note:
			"Measurements were taken against the pinned blobs. `q1-dither/trace.ts` asserts its re-derivation of the role stage against the pipeline's own published pools on every image, so a run against a rewritten role stage fails loudly instead of producing a plausible wrong number — the 100/100 clean traces are the proof that the pinned code is what ran.",
	}
}
