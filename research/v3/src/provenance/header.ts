/**
 * The standard result-file header: what produced this file, from what, and when (build item 17).
 *
 * ## The problem this solves
 *
 * A result file in `data/` is read months after it was written, usually by someone deciding whether
 * to trust it. Every question they will ask is about provenance — which commit of the producer wrote
 * this, which version of `sharp` decoded the images, was this before or after the ruler changed,
 * were these the same inputs the neighbouring file used? Today those answers are reconstructed from
 * file mtimes and memory, which is to say they are guessed.
 *
 * A fingerprint header answers them in the file itself. It is deliberately cheap: one call, no
 * configuration, and it never fails a run — an unavailable git binary yields `null`, not an
 * exception, because a producer refusing to write its results because it could not read a commit
 * hash would be a worse outcome than an incomplete header.
 *
 * ## What is in it, and why each field
 *
 * - **`gitCommit` / `gitDirty`** — which code. `gitDirty` matters more than the hash: a result
 *   produced from an uncommitted tree cannot be reproduced from the hash alone, and a header that
 *   reported only the commit would claim a reproducibility it does not have.
 * - **`packages`** — which decoders and rulers. `sharp`'s version is the load-bearing one
 *   (`CONVENTIONS.md` records that the repo carries two sharps because of an AVIF decode
 *   difference); the colour libraries matter for anything that quotes a distance.
 * - **`node`** — the runtime, for the same reason.
 * - **`inputs`** — content hashes of the files the run actually read. This is the field that lets a
 *   reader tell "regenerated, same answer" from "regenerated, different inputs", which is a
 *   distinction no timestamp can carry.
 * - **`generatedAt` / `generatedBy`** — the timestamp `CONVENTIONS.md` requires on a quoted count,
 *   and the producer's own path so the reader can re-run it.
 *
 * ## Determinism
 *
 * Everything here except `inputs` and `packages` is environmental, and `generatedAt` moves every
 * run. Producers that publish a content hash of their own body (the honesty census does) must keep
 * this header **outside** that hash, exactly as they already keep their timestamp outside it.
 * Otherwise every commit would change the body hash and the hash would stop meaning anything.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** `research/v3`, derived from this file's location so the helper works from any cwd. */
const V3_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

/** The repository root, one level above `research/`. */
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "")

/**
 * Hashes are recorded **untruncated**, and there is deliberately no length knob here.
 *
 * `[REVIEWED]` — a content hash in this header is identity, and a truncation is a collision surface
 * nobody would ever check. The full 40-character commit id is recorded for the same reason; a
 * *reader* may abbreviate, a writer may not.
 */

/** Packages whose version changes the numbers, so a header that omitted them would mislead. */
const TRACKED_PACKAGES = [
	"sharp",
	"sharp-modern",
	"apca-w3",
	"colorjs.io",
	"colornames-oklab",
] as const

export interface InputFingerprint {
	/** Path as the producer names it — repo-relative is the convention. */
	path: string
	/** sha256 of the file's bytes, or `null` when it could not be read. */
	sha256: string | null
	bytes: number | null
}

export interface ResultHeader {
	what: string
	generatedAt: string
	generatedBy: string
	code: {
		gitCommit: string | null
		gitBranch: string | null
		/** True when the working tree had uncommitted changes — the reproducibility caveat. */
		gitDirty: boolean | null
		node: string
	}
	packages: Record<string, string | null>
	inputs: InputFingerprint[]
	note: string
}

function git(args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim()
	} catch {
		// No git, no repo, or a git that refuses — a header field goes null and the run continues.
		return null
	}
}

/** Installed versions of the packages whose behaviour shows up in results. */
export function packageVersions(): Record<string, string | null> {
	const versions: Record<string, string | null> = {}
	for (const name of TRACKED_PACKAGES) {
		try {
			const manifest = JSON.parse(
				readFileSync(join(REPO_ROOT, "node_modules", name, "package.json"), "utf8"),
			) as { version?: string }
			versions[name] = manifest.version ?? null
		} catch {
			versions[name] = null
		}
	}
	return versions
}

/** sha256 of a file's bytes, with its size. Unreadable files are recorded as such, never skipped. */
export function fingerprintFile(absolutePath: string, displayPath?: string): InputFingerprint {
	try {
		const bytes = readFileSync(absolutePath)
		const digest = createHash("sha256").update(bytes).digest("hex")
		return { path: displayPath ?? absolutePath, sha256: digest, bytes: bytes.byteLength }
	} catch {
		return { path: displayPath ?? absolutePath, sha256: null, bytes: null }
	}
}

export interface HeaderRequest {
	/** One sentence: what this file is. Goes straight into the header. */
	what: string
	/** The producer, as a repo-relative path — `research/v3/src/honesty/cli.ts`. */
	generatedBy: string
	/**
	 * Files the run read. Absolute paths, or `{ absolute, display }` when the header should name them
	 * differently from where they live on this machine.
	 */
	inputs?: readonly (string | { absolute: string; display: string })[]
	/** Overrides the wall clock. Tests pass a fixed value; producers normally omit it. */
	generatedAt?: string
}

/**
 * Build the standard header.
 *
 * Named `writeHeader` because that is what callers do with it — it returns the object to embed, and
 * writes nothing itself. Deliberate: a helper that wrote files would need to know each producer's
 * output format, and every producer here already has one.
 */
export function writeHeader(request: HeaderRequest): ResultHeader {
	const status = git(["status", "--porcelain"])
	return {
		what: request.what,
		generatedAt: request.generatedAt ?? new Date().toISOString(),
		generatedBy: request.generatedBy,
		code: {
			gitCommit: git(["rev-parse", "HEAD"]),
			gitBranch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
			gitDirty: status === null ? null : status.length > 0,
			node: process.version,
		},
		packages: packageVersions(),
		inputs: (request.inputs ?? []).map((input) =>
			typeof input === "string"
				? fingerprintFile(input, input.startsWith(V3_ROOT) ? relativeToRepo(input) : input)
				: fingerprintFile(input.absolute, input.display),
		),
		note: "Provenance fingerprint (src/provenance/header.ts, build item 17). gitDirty true means this result cannot be reproduced from gitCommit alone. Producers that publish a body hash keep this header outside it, so a commit never changes the hash.",
	}
}

function relativeToRepo(absolute: string): string {
	return absolute.startsWith(`${REPO_ROOT}/`) ? absolute.slice(REPO_ROOT.length + 1) : absolute
}
