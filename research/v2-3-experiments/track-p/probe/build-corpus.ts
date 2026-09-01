/**
 * Track P probe: assemble the deterministic sweep corpora.
 *
 * Every artwork path resolves into the SHARED CHECKOUT, never this worktree: a git worktree checks
 * out only the `-scrambled` decoys, and scrambling destroys the spatial structure that the field,
 * transition and enclosure machinery reads. A sweep run on decoys reports load-bearing mechanisms as
 * dead (charter, "corpus trap").
 *
 * Emits:
 *   data/corpus-triage.txt  — mixed 150-ish set: canonical off-panel manifest + review fixtures +
 *                             a fresh stride sample of the 7550-image hex corpus.
 *   data/corpus-full.txt    — every hex-corpus artwork, for firing-conditioned sampling later.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
/** The shared checkout, which holds the real artwork. Overridable, but never defaults to the worktree. */
const sharedRoot = process.env.PALETTE_SHARED_ROOT ?? "/Users/Flo/GitHub/palette"
const imagesRoot = resolve(sharedRoot, "images")

const hexRoots = readdirSync(sharedRoot)
	.filter((name) => /^[0-1][0-9a-f]$/u.test(name))
	.sort()

const hexCorpus: string[] = []
for (const root of hexRoots) {
	for (const name of readdirSync(resolve(sharedRoot, root)).sort()) {
		hexCorpus.push(resolve(sharedRoot, root, name))
	}
}

/** The canonical off-panel manifest: the set other tracks verify against. */
const manifestPath = resolve(trackRoot, "../../v2-3-eval/data/offpanel-manifest.txt")
const manifest = existsSync(manifestPath)
	? readFileSync(manifestPath, "utf8").split("\n")
		.map((line) => line.trim()).filter((line) => line.length > 0)
		.map((relative) => resolve(sharedRoot, relative))
		.filter((path) => existsSync(path))
	: []

/** The reviewed fixtures. `-scrambled` variants are decoys and are excluded by name. */
const fixtures = existsSync(imagesRoot)
	? readdirSync(imagesRoot).sort()
		.filter((name) => /\.(jpg|jpeg|png|webp|avif)$/iu.test(name) && !name.includes("-scrambled."))
		.map((name) => resolve(imagesRoot, name))
	: []

/**
 * A fresh stride sample, so the triage set is not confined to artworks earlier tracks already chose.
 * A fixed stride and offset keep it deterministic and reproducible.
 */
const already = new Set([...manifest, ...fixtures])
const remaining = hexCorpus.filter((path) => !already.has(path))
const wanted = 80
const stride = Math.max(1, Math.floor(remaining.length / wanted))
const fresh: string[] = []
for (let index = 0; index < remaining.length && fresh.length < wanted; index += stride) {
	fresh.push(remaining[index]!)
}

const triage = [...new Set([...manifest, ...fixtures, ...fresh])]

writeFileSync(resolve(trackRoot, "data/corpus-triage.txt"), `${triage.join("\n")}\n`)
writeFileSync(resolve(trackRoot, "data/corpus-full.txt"), `${hexCorpus.join("\n")}\n`)

process.stdout.write(`hex corpus: ${hexCorpus.length} artworks in ${hexRoots.length} roots\n`)
process.stdout.write(`manifest: ${manifest.length}, fixtures: ${fixtures.length}, fresh stride: ${fresh.length} (stride ${stride})\n`)
process.stdout.write(`triage corpus: ${triage.length}\n`)
