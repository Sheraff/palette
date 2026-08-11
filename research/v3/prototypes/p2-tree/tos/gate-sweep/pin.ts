/**
 * **What code this study's numbers were taken against.**
 *
 * Cycle 4 runs several workers inside one worktree and a sibling may edit `tos/pipeline.ts` and
 * `tos/roles/` while this sweep runs. A number without the blob it came from is not a measurement,
 * so `collect.ts` and `sweep.ts` are run through `pin.sh` — a `git archive` of `PIN_COMMIT` — and
 * this module **re-derives the git blob id of every file the measurement depends on from the bytes
 * that are actually being executed**, comparing them to the ids recorded at pin time.
 *
 * That is the difference between claiming a pin and having one: if `pin.sh` were skipped, or the
 * export were stale, or a sibling's edit leaked into the export, `PIN.clean` is `false` and the
 * report says which file drifted. Nothing here reads git, so it works inside the export.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const TOS_DIR = resolve(HERE, "..")
const V3_DIR = resolve(HERE, "../../../..")

/**
 * The worktree's HEAD when this study started. `[INHERITED]` — recorded from `git rev-parse HEAD`.
 *
 * At pin time `git status --porcelain` reported no modifications to any tracked file, so this commit
 * is also the working tree: the pin costs nothing in fidelity and buys immunity to sibling edits.
 */
export const PIN_COMMIT = "9aab5f28065b80592112d0edc3fe89da3e170ca8"

/**
 * `git rev-parse <PIN_COMMIT>:<path>` for every file whose bytes can move a number in this report,
 * recorded at pin time. `[INHERITED]` — git object ids, not content hashes of a working tree, so
 * they cannot drift.
 *
 * The list is the pipeline (verdict, geometry, coverage), the constants it reads, the role module
 * `collect.ts` calls to reproduce the laminar field pair, the labels loader borrowed from worker G's
 * Q2, and the corpus loader that loader stands on.
 */
export const PINNED_BLOBS: Readonly<Record<string, string>> = {
	"tos/pipeline.ts": "a64d7b7bd4900746cb1e39da9b43620d86632be1",
	"tos/tree.ts": "dc33d16c2d26e3fb18ea67d0e02a040a30936b58",
	"tos/constants.ts": "edb5268011e3e2ebdd9ad13cc8fe73495491a4eb",
	"tos/candidate.ts": "e2a029a12f15e48d98ee1a9c38a01c54b380046b",
	"tos/roles/indifference.ts": "87778ab3d426244b7b6b27364b9ef2760895820e",
	"tos/roles/rank.ts": "13de6d699a6047ea2afef7bff257fc59e6ad3e30",
	"tos/stability/q2-laminarity/labels.ts": "5402a4461a39c78d0aeecb3519aec15e39d64b80",
	"src/adjudication/evidence.ts": "4a4320138de0e48900d91354ccbe4682bf997067",
}

/** Git's blob id for a file's current bytes: `sha1("blob <len>\0" + content)`. */
function gitBlobId(path: string): string {
	const content = readFileSync(path)
	return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex")
}

export type PinState = Readonly<{
	commit: string
	files: readonly Readonly<{ path: string; pinnedBlob: string; executedBlob: string | null; matchesPin: boolean }>[]
	clean: boolean
	note: string
}>

function pinState(): PinState {
	const files = Object.entries(PINNED_BLOBS).map(([relative, pinnedBlob]) => {
		const path = relative.startsWith("tos/") ? resolve(TOS_DIR, relative.slice("tos/".length)) : resolve(V3_DIR, relative)
		const executedBlob = existsSync(path) ? gitBlobId(path) : null
		return { path: relative, pinnedBlob, executedBlob, matchesPin: executedBlob === pinnedBlob }
	})
	return {
		commit: PIN_COMMIT,
		files,
		clean: files.every((entry) => entry.matchesPin),
		note:
			"Blob ids are re-derived from the bytes that ran, inside the export, and compared to the ids recorded at pin time. `clean: false` means the study did not run against the pin and its numbers are about some other code.",
	}
}

/** The pin, evaluated once at import so every artefact in one run carries the same block. */
export const PIN: PinState = pinState()
