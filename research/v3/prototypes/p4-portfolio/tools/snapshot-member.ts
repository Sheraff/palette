/**
 * M1 tooling — snapshot a member's devloop candidate into `members/<slug>/`.
 *
 * **What it does, and the one trick it uses.** The dev loop's `computeCodeVersion` already walks a
 * candidate's *relative* import closure (`src/devloop/code-version.ts`), so the set of files a
 * candidate actually needs is measured, not guessed — this tool reuses that walk verbatim rather
 * than re-deriving it, then copies exactly those files that live inside the member's own prototype
 * subtree.
 *
 * Everything a member imports from `research/v3/src/**` is NOT copied. Those files are byte-identical
 * across every Phase-2 worktree (verified at snapshot time by this tool, `sharedFileDiffs`), and
 * copying them would fork the contract. Instead each member snapshot is laid out as a **mirror of
 * `research/v3/`**:
 *
 *     members/<slug>/v3/src            -> symlink to research/v3/src
 *     members/<slug>/v3/<--data dir>   -> symlink to research/v3/<dir>  (runtime fixtures)
 *     members/<slug>/v3/prototypes/<home prototype dir>/...   (copied files, original relative paths)
 *
 * so a candidate's own `../../../src/contract/types.ts` resolves through the symlink to this
 * worktree's one contract, and every intra-prototype relative import resolves exactly as at home.
 * The symlink lives inside p4's owned subtree; no member file is edited, ever.
 *
 * `computeCodeVersion` resolves specifiers lexically (`path.resolve`, not `realpath`), so the walk
 * traverses the symlink happily; Node's loader realpaths, so the contract is loaded once. Neither
 * reads different bytes than the home worktree does.
 *
 * Zero constants: this tool publishes no palette and consults no threshold.
 *
 * Usage:
 *   node --experimental-strip-types tools/snapshot-member.ts \
 *     --slug p3-fields --worktree <abs path to worktree> \
 *     --candidate prototypes/p3-fields/src/candidate.ts
 */

import { createHash } from "node:crypto"
import { mkdir, copyFile, readdir, readFile, rm, symlink, stat } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { computeCodeVersion } from "../../../src/devloop/code-version.ts"

const P4_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const V3_ROOT = resolve(P4_ROOT, "..", "..")

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

async function sha256(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

const argv = process.argv.slice(2)
const slug = flag(argv, "--slug")
const worktree = flag(argv, "--worktree")
const candidateRel = flag(argv, "--candidate")
if (slug === undefined || worktree === undefined || candidateRel === undefined) {
	process.stdout.write("usage: --slug <s> --worktree <abs> --candidate <path relative to research/v3>\n")
	process.exit(2)
}

const homeV3 = resolve(worktree, "research", "v3")
const homeCandidate = resolve(homeV3, candidateRel)
const { files } = await computeCodeVersion(homeCandidate)

/**
 * `computeCodeVersion` reports each file's path relative to **the `research/v3` of the checkout its
 * own module was loaded from** and hashes those relative paths into the digest. Run from p4 against
 * p3's files, it therefore produces a digest nobody else will ever reproduce. This re-derives the
 * digest exactly as `code-version.ts` does but with the paths relative to the *home* `research/v3`,
 * so `homeCodeVersion` below is the same string the home worktree's own `run.ts` writes into a run
 * header — and it was checked against one.
 */
function digestRelativeTo(root: string): string {
	const digest = createHash("sha256")
	const rebased = files
		.map((file) => ({ path: relative(root, resolve(V3_ROOT, file.path)), sha256: file.sha256 }))
		.sort((l, r) => (l.path < r.path ? -1 : 1))
	for (const file of rebased) digest.update(`${file.path}\u0000${file.sha256}\u0000`)
	return digest.digest("hex")
}
const codeVersion = digestRelativeTo(homeV3)

// Split the measured closure into "the member's own files" and "shared research/v3/src files".
const own: string[] = []
const shared: string[] = []
for (const file of files) {
	// `file.path` came back relative to *p4's* research/v3 (that is where `code-version.ts` was
	// loaded from), so it is resolved against that root and only then re-expressed against the home
	// one, which is the form the member itself is written in.
	const p = relative(homeV3, resolve(V3_ROOT, file.path))
	if (p.startsWith("prototypes/")) own.push(p)
	else shared.push(p)
}

// Shared files must be byte-identical between the home worktree and p4's, or the snapshot is not a
// snapshot of the same code. Report, never patch.
const sharedFileDiffs: string[] = []
for (const p of shared) {
	const [a, b] = await Promise.all([sha256(resolve(homeV3, p)), sha256(resolve(V3_ROOT, p))])
	if (a !== b) sharedFileDiffs.push(p)
}

const memberRoot = join(P4_ROOT, "members", slug)
const mirror = join(memberRoot, "v3")
await rm(mirror, { recursive: true, force: true })
await mkdir(mirror, { recursive: true })
await symlink(relative(mirror, join(V3_ROOT, "src")), join(mirror, "src"))

/**
 * Declared **runtime** data dependencies, symlinked the same way `src` is.
 *
 * The import walk cannot see these: `p1-mdl` reads `research/v3/data/legacy/*.json` through a path
 * it *computes* from `import.meta.url` (`src/emit/paths.ts`), not through an import, so the closure
 * is silent about it and the first snapshot run failed on all three gate covers with ENOENT. The fix
 * is the same trick, declared on the command line rather than guessed, and every file under the
 * directory is verified byte-identical between the two checkouts first — a member reading *different*
 * fixture bytes than at home would pass no honest gate.
 */
const dataDirs = argv.flatMap((token, at) => (argv[at - 1] === "--data" ? [token] : []))
const dataDirDiffs: string[] = []
for (const dir of dataDirs) {
	const homeDir = resolve(homeV3, dir)
	const p4Dir = resolve(V3_ROOT, dir)
	for (const name of await readdir(homeDir, { recursive: true, withFileTypes: true })) {
		if (!name.isFile()) continue
		const rel = relative(homeDir, join(name.parentPath, name.name))
		let matches = false
		try {
			matches = (await sha256(join(homeDir, rel))) === (await sha256(join(p4Dir, rel)))
		} catch {
			matches = false
		}
		if (!matches) dataDirDiffs.push(`${dir}/${rel}`)
	}
	await mkdir(dirname(join(mirror, dir)), { recursive: true })
	await symlink(relative(dirname(join(mirror, dir)), p4Dir), join(mirror, dir))
}

const copied: Array<{ path: string; sha256: string }> = []
for (const p of own) {
	const dest = join(mirror, p)
	await mkdir(dirname(dest), { recursive: true })
	await copyFile(resolve(homeV3, p), dest)
	copied.push({ path: p, sha256: await sha256(dest) })
}
copied.sort((l, r) => (l.path < r.path ? -1 : 1))

const snapshotCandidate = join(mirror, relative(homeV3, homeCandidate))
await stat(snapshotCandidate)
const { codeVersion: snapshotCodeVersion } = await computeCodeVersion(snapshotCandidate)

process.stdout.write(
	`${JSON.stringify(
		{
			slug,
			worktree,
			homeCandidate,
			snapshotCandidate,
			homeCodeVersion: codeVersion,
			snapshotCodeVersion,
			closureFileCount: files.length,
			ownFileCount: own.length,
			sharedFileCount: shared.length,
			sharedFileDiffs,
			shared,
			dataDirs,
			dataDirDiffs,
			copied,
		},
		null,
		"\t",
	)}\n`,
)
