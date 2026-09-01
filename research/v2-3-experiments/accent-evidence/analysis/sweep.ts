/**
 * Blast-radius sweep. Writes results in the harness's own `CachedResult` format so `make-batch.ts`
 * and `diff-report.ts` can read them, but reads artwork from ABSOLUTE shared-checkout paths
 * (the worktree's `images/` is decoys only) and is resumable one file per job.
 *
 *   node --experimental-strip-types .../sweep.ts <label>
 *
 * The harness's own cache is keyed on (bytes, label, algorithmIdentity) with NO code fingerprint,
 * so a label is only trustworthy if nothing else ever wrote it. Each arm here uses a fresh label.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve, relative } from "node:path"
import sharp from "sharp"
import { extractPalette, algorithmIdentity } from "../../../v2-3/index.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"

sharp.concurrency(1)

const label = process.argv[2]
if (!label || !/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error("usage: sweep.ts <label> [shardIndex shardCount]")

// Optional static sharding so the corpus can be split over at most 4 worker processes (charter's
// machine budget). Sharding is by position in the fixed corpus order, so it changes nothing about
// which artworks are swept or what is written — only who writes them.
const shardIndex = process.argv[3] === undefined ? 0 : Number(process.argv[3])
const shardCount = process.argv[4] === undefined ? 1 : Number(process.argv[4])
if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount) || shardCount < 1 ||
	shardIndex < 0 || shardIndex >= shardCount) throw new Error("shard must be `i n` with 0 <= i < n")

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const outDir = resolve(worktreeRoot, "research/v2-3-eval/data/results", label)
mkdirSync(outDir, { recursive: true })

const corpus = JSON.parse(readFileSync(resolve(here, "corpus.json"), "utf8")) as { image: string; abs: string; group: string }[]
let done = 0, skipped = 0
for (const [i, entry] of corpus.entries()) {
	if (i % shardCount !== shardIndex) continue
	const path = resolve(outDir, `${entry.image}.json`)
	if (existsSync(path)) { skipped++; continue }
	const bytes = readFileSync(entry.abs)
	const sourceSha256 = createHash("sha256").update(bytes).digest("hex")
	const image = await loadNativeImage(bytes)
	const extraction = extractPalette(image)
	const record = {
		schemaVersion: 1 as const,
		label,
		algorithm: "v2-3" as const,
		algorithmIdentity,
		image: entry.image,
		imagePath: relative("/Users/Flo/GitHub/palette", entry.abs),
		sourceSha256,
		byteCount: bytes.byteLength,
		extraction,
	}
	const tmp = `${path}.tmp`
	writeFileSync(tmp, JSON.stringify(record, null, "\t") + "\n")
	renameSync(tmp, path)
	done++
	if ((i + 1) % 25 === 0) process.stderr.write(`[${i + 1}/${corpus.length}] ${done} written, ${skipped} present\n`)
}
process.stderr.write(`${label}: ${done} written, ${skipped} already present, ${corpus.length} total\n`)
