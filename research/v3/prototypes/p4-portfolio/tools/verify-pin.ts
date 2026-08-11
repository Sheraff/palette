/**
 * M1 tooling — re-verify a member snapshot against its home worktree, and pin it.
 *
 * **Why this is a separate, repeatable step.** The member worktrees are live: their own workers keep
 * committing while P4 integrates. Two of them (`p3-fields`, `p5-fieldfit`) moved HEAD between the
 * snapshot and the gate during M1. A commit hash alone therefore under-determines a snapshot — what
 * pins it is the **per-file sha-256 of the measured import closure**, and the commit is recorded
 * beside it as the checkout those bytes were found in.
 *
 * So this re-hashes every copied file against the home worktree now, re-checks that the shared
 * `research/v3/src` files are still byte-identical between the two checkouts, and records the home
 * worktree's HEAD at verification time. Any drift is *reported*, never re-copied silently: a member
 * whose closure moved has to be re-snapshotted and re-gated deliberately.
 *
 * Zero constants.
 *
 * Usage: node --experimental-strip-types tools/verify-pin.ts --slug <slug>
 */

import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

const P4_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const V3_ROOT = resolve(P4_ROOT, "..", "..")

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

async function sha256(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

const slug = flag(process.argv.slice(2), "--slug")
if (slug === undefined) {
	process.stdout.write("usage: --slug <slug>\n")
	process.exit(2)
}

const snapshot = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `snapshot-${slug}.json`), "utf8")) as {
	worktree: string
	shared: string[]
	copied: Array<{ path: string; sha256: string }>
}
const homeV3 = resolve(snapshot.worktree, "research", "v3")

const head = execFileSync("git", ["-C", snapshot.worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const branch = execFileSync("git", ["-C", snapshot.worktree, "rev-parse", "--abbrev-ref", "HEAD"], {
	encoding: "utf8",
}).trim()

const copiedDrift: Array<{ path: string; snapshot: string; homeNow: string }> = []
for (const file of snapshot.copied) {
	let homeNow: string
	try {
		homeNow = await sha256(resolve(homeV3, file.path))
	} catch {
		homeNow = "UNREADABLE"
	}
	if (homeNow !== file.sha256) copiedDrift.push({ path: file.path, snapshot: file.sha256, homeNow })
	// The snapshot's own copy is checked too: it is what actually runs.
	const inSnapshot = await sha256(join(P4_ROOT, "members", slug, "v3", file.path))
	if (inSnapshot !== file.sha256) {
		copiedDrift.push({ path: `${file.path} (snapshot copy)`, snapshot: file.sha256, homeNow: inSnapshot })
	}
}

/**
 * Is each copied file's byte content actually *in* the home worktree's HEAD commit?
 *
 * SPEC §4 says members are "pinned by worktree commit + fingerprint". Those two can disagree, and on
 * this campaign one of them does: `p2-tree`'s carried candidate is snapshotted from a working tree
 * with uncommitted edits and an entirely untracked directory, so no commit contains the code the
 * member actually runs. That is a fact about the member, not a defect in the snapshot — and it is the
 * reason the fingerprint, not the commit, is the pin. It is measured here instead of being asserted
 * in prose.
 */
const notInHead: string[] = []
const differsFromHead: string[] = []
for (const file of snapshot.copied) {
	const gitPath = `research/v3/${file.path}`
	try {
		const blob = execFileSync("git", ["-C", snapshot.worktree, "show", `HEAD:${gitPath}`], {
			maxBuffer: 1 << 28,
		})
		if (createHash("sha256").update(blob).digest("hex") !== file.sha256) differsFromHead.push(file.path)
	} catch {
		notInHead.push(file.path)
	}
}

const sharedDrift: string[] = []
for (const path of snapshot.shared) {
	const [home, p4] = await Promise.all([sha256(resolve(homeV3, path)), sha256(resolve(V3_ROOT, path))])
	if (home !== p4) sharedDrift.push(path)
}

const pin = {
	kind: "p4-portfolio-m1-pin",
	slug,
	worktree: snapshot.worktree,
	branch,
	headAtVerification: head,
	verifiedAt: new Date().toISOString(),
	copiedFileCount: snapshot.copied.length,
	sharedFileCount: snapshot.shared.length,
	copiedDrift,
	sharedDrift,
	/** Copied files whose bytes are not in HEAD at all (untracked in the home worktree). */
	notInHead,
	/** Copied files that exist in HEAD but with different bytes (uncommitted edits). */
	differsFromHead,
	committedAtHead: notInHead.length === 0 && differsFromHead.length === 0,
	verdict: copiedDrift.length === 0 && sharedDrift.length === 0 ? "PINNED" : "DRIFTED",
}
await writeFile(join(P4_ROOT, "data", "m1", `pin-${slug}.json`), `${JSON.stringify(pin, null, "\t")}\n`)
process.stdout.write(
	`${JSON.stringify({ slug, head, branch, verdict: pin.verdict, committedAtHead: pin.committedAtHead, notInHead: notInHead.length, differsFromHead: differsFromHead.length })}\n`,
)
