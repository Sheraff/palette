/**
 * Byte-identity acceptance harness. Adopted unchanged in substance from
 * `research/v2-3-experiments/adversarial-arch/sweep.ts` (branch
 * `worktree-agent-aea17683dcda2e5f4`) so track-I's before/after manifests are directly
 * comparable with the ones F8 was measured against; the only additions are the
 * `offpanel-wide` set and this note.
 *
 * Extracts a palette for every image in a corpus set and records the sha256 of the
 * **complete** `PaletteExtraction` JSON — every role's rgb/oklab/hex/generated, the
 * gradient and collapse flags, the dimensions, and the whole `researchRender` midpoint
 * block — not just the four role hexes. Any behaviour change anywhere in the pipeline
 * that reaches the public API moves a hash.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/sweep.ts --out <manifest.json> [--set base|scrambled|offpanel|offpanel-wide|quick|full]
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/sweep.ts --compare <before.json> <after.json>
 *
 * The corpus root honours `PALETTE_IMAGES_ROOT` (the single documented override; see
 * research/v2-3-eval/README.md). Off-panel sources are a deterministic stride sample of the
 * numbered sample directories beside the images root, so the same machine always sweeps the
 * same set.
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT
	? resolve(process.env.PALETTE_IMAGES_ROOT)
	: resolve(repositoryRoot, "images")
const corpusRoot = dirname(imagesRoot)

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])
const OFF_PANEL_SAMPLE = 30
/**
 * The charter's deletion bar wants >=60 off-panel artworks. `offpanel` keeps the 30-image
 * stride the adversarial-arch sweep used, so its manifests stay comparable; `offpanel-wide`
 * is the 60-image stride used for the dead-member measurement.
 */
const OFF_PANEL_WIDE_SAMPLE = 60
/** Off-panel sources named in the track experiment reports; always swept. */
const OFF_PANEL_PINNED = [
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
]

type Entry = Readonly<{ id: string; path: string }>

function extensionOf(name: string): string {
	return name.slice(name.lastIndexOf(".")).toLowerCase()
}

function baseEntries(scrambled: boolean): Entry[] {
	return readdirSync(imagesRoot)
		.filter((name) => IMAGE_EXTENSIONS.has(extensionOf(name)))
		.filter((name) => name.includes("-scrambled.") === scrambled)
		.sort()
		.map((name) => ({ id: `images/${name}`, path: resolve(imagesRoot, name) }))
}

function offPanelEntries(sample: number): Entry[] {
	const directories = readdirSync(corpusRoot)
		.filter((name) => /^[0-9a-f]{2}$/u.test(name))
		.filter((name) => {
			try {
				return statSync(resolve(corpusRoot, name)).isDirectory()
			} catch {
				return false
			}
		})
		.sort()
	const all: string[] = []
	for (const directory of directories) {
		for (const name of readdirSync(resolve(corpusRoot, directory)).sort()) {
			all.push(`${directory}/${name}`)
		}
	}
	if (all.length === 0) return []
	const selected = new Map<string, Entry>()
	for (const pinned of OFF_PANEL_PINNED) {
		if (all.includes(pinned)) selected.set(pinned, { id: pinned, path: resolve(corpusRoot, pinned) })
	}
	const stride = Math.max(1, Math.floor(all.length / sample))
	for (let index = 0; selected.size < sample && index < all.length; index += stride) {
		const id = all[index]
		selected.set(id, { id, path: resolve(corpusRoot, id) })
	}
	return [...selected.values()].sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
}

/** A fast cross-section for per-edit verification: every stratum, small files only. */
const QUICK = [
	"orelsan.jpg", "knuckles.jpg", "black.jpg", "slipknot.jpg", "disney.avif", "pureblack.jpg",
	"purered.jpg", "snarky.jpg", "ybbb.jpg", "horsley.jpg", "loups.jpg", "greenday.jpg",
	"elephunk.jpg", "johns.jpg", "muse.jpg", "franz.jpg", "once.jpg", "skap.jpg",
]

function entriesFor(set: string): Entry[] {
	if (set === "base") return baseEntries(false)
	if (set === "scrambled") return baseEntries(true)
	if (set === "offpanel") return offPanelEntries(OFF_PANEL_SAMPLE)
	if (set === "offpanel-wide") return offPanelEntries(OFF_PANEL_WIDE_SAMPLE)
	if (set === "quick") {
		return QUICK.map((name) => ({ id: `images/${name}`, path: resolve(imagesRoot, name) }))
			.filter((entry) => {
				try {
					statSync(entry.path)
					return true
				} catch {
					return false
				}
			})
	}
	if (set === "full") return [...baseEntries(false), ...baseEntries(true), ...offPanelEntries(OFF_PANEL_SAMPLE)]
	throw new Error(`unknown --set ${set}`)
}

/** Key-sorted stringify, so the hash depends on values only and never on property order. */
function canonical(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
}

type Manifest = Readonly<{
	set: string
	entries: Record<string, string>
	corpusHash: string
	totalMs: number
	perImageMs: Record<string, number>
}>

const { values, positionals } = parseArgs({
	options: {
		out: { type: "string" },
		set: { type: "string", default: "full" },
		compare: { type: "boolean", default: false },
	},
	allowPositionals: true,
	strict: true,
})

if (values.compare) {
	const [beforePath, afterPath] = positionals
	if (!beforePath || !afterPath) throw new Error("usage: --compare <before.json> <after.json>")
	const before: Manifest = JSON.parse(readFileSync(beforePath, "utf8"))
	const after: Manifest = JSON.parse(readFileSync(afterPath, "utf8"))
	const ids = [...new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])].sort()
	let differing = 0
	for (const id of ids) {
		const first = before.entries[id]
		const second = after.entries[id]
		if (first === second) continue
		differing += 1
		console.log(`DIFF ${id}\n  before ${first ?? "(absent)"}\n  after  ${second ?? "(absent)"}`)
	}
	const speedup = before.totalMs / Math.max(1, after.totalMs)
	console.log(`\n${ids.length} image(s) compared, ${differing} differ`)
	console.log(`corpus hash  before ${before.corpusHash}\n             after  ${after.corpusHash}`)
	console.log(`runtime      before ${(before.totalMs / 1000).toFixed(1)}s  after ${(after.totalMs / 1000).toFixed(1)}s`
		+ `  (${speedup.toFixed(2)}x, ${(((before.totalMs - after.totalMs) / before.totalMs) * 100).toFixed(1)}% faster)`)
	process.exit(differing === 0 ? 0 : 1)
}

const set = values.set ?? "full"
const entries = entriesFor(set)
if (entries.length === 0) throw new Error(`no images for --set ${set} under ${imagesRoot}`)

const hashes: Record<string, string> = {}
const perImageMs: Record<string, number> = {}
let totalMs = 0
for (const [index, entry] of entries.entries()) {
	const bytes = readFileSync(entry.path)
	const started = process.hrtime.bigint()
	const extraction = await extractPaletteFromBytes(bytes)
	const elapsed = Number(process.hrtime.bigint() - started) / 1e6
	totalMs += elapsed
	perImageMs[entry.id] = Math.round(elapsed)
	hashes[entry.id] = createHash("sha256").update(canonical(extraction)).digest("hex")
	process.stdout.write(`[${index + 1}/${entries.length}] ${entry.id} ${hashes[entry.id].slice(0, 12)} ${elapsed.toFixed(0)}ms\n`)
}

const manifest: Manifest = {
	set,
	entries: hashes,
	corpusHash: createHash("sha256").update(canonical(hashes)).digest("hex"),
	totalMs: Math.round(totalMs),
	perImageMs,
}
const out = values.out ?? resolve(dirname(fileURLToPath(import.meta.url)), `sweep-${set}.json`)
writeFileSync(out, `${JSON.stringify(manifest, null, "\t")}\n`)
console.log(`\n${entries.length} image(s), corpus hash ${manifest.corpusHash}, ${(totalMs / 1000).toFixed(1)}s -> ${out}`)
