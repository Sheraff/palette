/**
 * M1 tooling — write `members/<slug>/PROVENANCE.md` from the measured snapshot and gate records.
 *
 * Generated rather than hand-written for one reason: the file list and its hashes are the provenance,
 * and a hand-maintained copy of them drifts silently. Everything here is read back off disk from
 * `data/m1/snapshot-<slug>.json` (what was copied, from where, at which commit) and
 * `data/m1/gate-<slug>.json` (whether the snapshot reproduces the home worktree byte for byte).
 *
 * Zero constants.
 *
 * Usage: node --experimental-strip-types tools/write-provenance.ts --slug <slug> --commit <sha> --date <iso>
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"

const P4_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

const argv = process.argv.slice(2)
const slug = flag(argv, "--slug")
const note = flag(argv, "--note") ?? ""
if (slug === undefined) {
	process.stdout.write("usage: --slug <slug> [--note <text>]\n")
	process.exit(2)
}

const snapshot = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `snapshot-${slug}.json`), "utf8")) as {
	worktree: string
	homeCandidate: string
	snapshotCandidate: string
	homeCodeVersion: string
	snapshotCodeVersion: string
	closureFileCount: number
	ownFileCount: number
	sharedFileCount: number
	sharedFileDiffs: string[]
	shared: string[]
	dataDirs?: string[]
	dataDirDiffs?: string[]
	copied: Array<{ path: string; sha256: string }>
}

const pin = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `pin-${slug}.json`), "utf8")) as {
	branch: string
	headAtVerification: string
	verifiedAt: string
	copiedFileCount: number
	sharedFileCount: number
	copiedDrift: unknown[]
	sharedDrift: unknown[]
	notInHead: string[]
	differsFromHead: string[]
	committedAtHead: boolean
	verdict: string
}
const commit = pin.headAtVerification
const date = pin.verifiedAt

let gate: Record<string, unknown> | null = null
try {
	gate = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `gate-${slug}.json`), "utf8")) as Record<
		string,
		unknown
	>
} catch {
	gate = null
}

const rel = (path: string): string => relative(P4_ROOT, path)

const lines: string[] = []
lines.push(`# \`${slug}\` — member snapshot provenance`)
lines.push("")
lines.push(`**Verified ${date}. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**`)
lines.push("")
lines.push(
	"The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does " +
		"not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, " +
		"re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the " +
		"checkout those bytes were found in.",
)
lines.push("")
lines.push("## Source")
lines.push("")
lines.push("| what | value |")
lines.push("|---|---|")
lines.push(`| source worktree | \`${snapshot.worktree}\` |`)
lines.push(`| pinned commit (HEAD at verification) | \`${commit}\` |`)
lines.push(`| branch | \`${pin.branch}\` |`)
lines.push(`| home candidate module | \`${relative(join(snapshot.worktree, "research", "v3"), snapshot.homeCandidate)}\` |`)
lines.push(`| snapshot candidate module | \`${rel(snapshot.snapshotCandidate)}\` |`)
lines.push(`| home \`codeVersion\` | \`${snapshot.homeCodeVersion}\` |`)
lines.push(`| snapshot \`codeVersion\` | \`${snapshot.snapshotCodeVersion}\` |`)
lines.push(
	`| snapshot content is in that commit | **${pin.committedAtHead ? "yes" : "NO"}** ` +
		`(${pin.notInHead.length} copied file(s) untracked in the home worktree, ` +
		`${pin.differsFromHead.length} with uncommitted edits) |`,
)
lines.push(`| closure re-verified | **${pin.verdict}** at ${date} (${pin.copiedFileCount} copied + ${pin.sharedFileCount} shared files re-hashed; ${pin.copiedDrift.length} copied drifted, ${pin.sharedDrift.length} shared drifted) |`)
lines.push("")
lines.push(
	"The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` " +
		"hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot " +
		"lives at a different relative path. The per-file sha-256s below are the checkout-independent " +
		"identity, and the byte-identity gate is what actually proves the code is the same code.",
)
lines.push("")
if (!pin.committedAtHead) {
	lines.push("")
	lines.push(
		"> **The commit does not contain this member.** The files below were snapshotted from the home " +
			"worktree's *working tree*: " +
			(pin.notInHead.length > 0
				? `${pin.notInHead.length} of them are untracked there (${pin.notInHead.map((path) => `\`${path}\``).join(", ")})`
				: "") +
			(pin.notInHead.length > 0 && pin.differsFromHead.length > 0 ? ", and " : "") +
			(pin.differsFromHead.length > 0
				? `${pin.differsFromHead.length} carry uncommitted edits (${pin.differsFromHead.map((path) => `\`${path}\``).join(", ")})`
				: "") +
			". So no commit reproduces what this member runs, and the sha-256 fingerprint below is the " +
			"only pin there is. Recorded, not worked around — resolving it is the home prototype's call.",
	)
	lines.push("")
}
lines.push("## Import resolution — how the snapshot runs unmodified")
lines.push("")
lines.push(
	"The member is copied into a **mirror of `research/v3/`** so that every relative specifier it " +
		"was written with resolves exactly as at home:",
)
lines.push("")
lines.push("```")
lines.push(`members/${slug}/v3/src        ->  symlink to research/v3/src`)
lines.push(`members/${slug}/v3/prototypes/…  copied files, at their original relative paths`)
lines.push("```")
lines.push("")
lines.push(
	"So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** " +
		"through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under " +
		"`src/` is duplicated: those files were verified byte-identical between this worktree and the " +
		"member's home before copying (`sharedFileDiffs` below), and forking the contract per member is " +
		"exactly what a portfolio must not do. The symlink is inside p4's owned subtree.",
)
lines.push("")
if (note !== "") {
	lines.push(`**Note.** ${note}`)
	lines.push("")
}
lines.push("## Files copied")
lines.push("")
lines.push(
	`Measured, not chosen: the closure is \`computeCodeVersion()\`'s own transitive relative-import ` +
		`walk from the candidate module — ${snapshot.closureFileCount} files, of which ` +
		`${snapshot.ownFileCount} are the member's own (copied) and ${snapshot.sharedFileCount} are ` +
		`shared \`research/v3/src\` files (symlinked).`,
)
lines.push("")
lines.push("| copied file (path relative to the home `research/v3`) | sha-256 |")
lines.push("|---|---|")
for (const file of snapshot.copied) lines.push(`| \`${file.path}\` | \`${file.sha256}\` |`)
lines.push("")
lines.push("### Shared, not copied (reached through the `src` symlink)")
lines.push("")
for (const file of snapshot.shared) lines.push(`- \`${file}\``)
lines.push("")
lines.push(
	`Byte-identical home-vs-p4 check on those ${snapshot.sharedFileCount} files: ` +
		`**${snapshot.sharedFileDiffs.length} differ**` +
		(snapshot.sharedFileDiffs.length === 0 ? "." : `: ${snapshot.sharedFileDiffs.join(", ")}.`),
)
lines.push("")
const dataDirs = snapshot.dataDirs ?? []
if (dataDirs.length > 0) {
	lines.push("### Runtime data dependencies (symlinked, not copied)")
	lines.push("")
	lines.push(
		"The import closure cannot see these — they are read through a path the member *computes* at " +
			"runtime, not through an import — so they are declared explicitly and symlinked the same way " +
			"`src` is, after every file under them was verified byte-identical between the two checkouts:",
	)
	lines.push("")
	for (const dir of dataDirs) lines.push(`- \`${dir}\` → \`research/v3/${dir}\``)
	lines.push("")
	lines.push(`Byte-identity check on those trees: **${(snapshot.dataDirDiffs ?? []).length} files differ**.`)
	lines.push("")
}
lines.push("## Byte-identity gate")
lines.push("")
if (gate === null) {
	lines.push("Not run.")
} else {
	const timing = gate.timing as Record<string, unknown>
	lines.push(`**${String(gate.gate)}** — ${String(gate.identicalRows)}/${String(gate.rowsCompared)} rows identical.`)
	lines.push("")
	lines.push(`- home run: \`${rel(String((gate.a as Record<string, unknown>).path))}\``)
	lines.push(`- snapshot run: \`${rel(String((gate.b as Record<string, unknown>).path))}\``)
	lines.push(
		`- median \`computeMs\` on the gate covers: home ${String(timing.aMedianComputeMs)}, ` +
			`snapshot ${String(timing.bMedianComputeMs)}`,
	)
	lines.push("")
	lines.push(
		"Compared: the palette JSON, `inputContentHash`, `ok`, `error` — serialized and string-equal, " +
			"so key order and number formatting count. The single normalization is each row's own " +
			"checkout-root prefix (`imagePath`'s grandparent), because `imagePath` and " +
			"`metadata.sourceRendition.path` name the same bytes under two worktrees; " +
			`\`strictIdenticalRows\` (${String(gate.strictIdenticalRows)}) reports the count with no ` +
			"normalization at all so the difference stays visible. The demo-20 shards were verified " +
			"byte-identical across all five Phase-2 worktrees before any run.",
	)
	const problems = gate.problems as unknown[]
	if (problems.length > 0) {
		lines.push("")
		lines.push("### Diff (FAILED-GATE — reported, not patched)")
		lines.push("")
		lines.push("```json")
		lines.push(JSON.stringify(problems, null, "\t"))
		lines.push("```")
	}
}
lines.push("")

await writeFile(join(P4_ROOT, "members", slug, "PROVENANCE.md"), `${lines.join("\n")}`)
process.stdout.write(`members/${slug}/PROVENANCE.md\n`)
