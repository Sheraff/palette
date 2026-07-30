import { parseArgs } from "node:util"
import { resolve } from "node:path"
import {
	type Batch,
	type BatchItem,
	type BatchKey,
	type CachedResult,
	batchesRoot,
	blindPalette,
	invariant,
	loadResultSet,
	readJson,
	repoRoot,
	writeJsonAtomic,
} from "./src/shared.ts"

/**
 * Assemble a blinded 4-10 item human review batch.
 *
 * One label pair for the whole batch:
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/make-batch.ts \
 *     --name <batch> --a <label> --b <label> --cases <basename,basename,...>
 *
 * Or a per-item label pair, so one batch can mix comparisons:
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/make-batch.ts \
 *     --name <batch> --spec <path-to-json>
 *
 * where the spec file is `[{ "image": "loups.jpg", "a": "track-b-h3", "b": "track-b-h1h3" }, ...]`
 * (an object with an `items` array is also accepted).
 *
 * Blinding is deterministic and content-derived, per item: the parity of the first byte of that image's
 * sha256 decides whether its own `a` label or its own `b` label is shown as option A. The label -> side
 * mapping is written to a sibling `<name>.key.json` that the review server reads but never serves.
 */

const { values } = parseArgs({
	options: {
		name: { type: "string" },
		a: { type: "string" },
		b: { type: "string" },
		cases: { type: "string" },
		spec: { type: "string" },
	},
	strict: true,
})

invariant(typeof values.name === "string" && /^[a-z0-9][a-z0-9._-]*$/iu.test(values.name),
	"--name <batch> is required and must be a filesystem-safe token")

type SpecItem = Readonly<{ image: string; a: string; b: string }>

function parseSpec(value: unknown, path: string): SpecItem[] {
	const raw = Array.isArray(value)
		? value
		: typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items)
			? (value as { items: unknown[] }).items
			: null
	invariant(raw !== null, `${path} must be a JSON array of items, or an object with an "items" array`)
	return raw.map((entry, index) => {
		invariant(typeof entry === "object" && entry !== null, `${path} item ${index} must be an object`)
		const item = entry as Record<string, unknown>
		invariant(typeof item.image === "string" && item.image.length > 0,
			`${path} item ${index} needs an "image" basename`)
		invariant(typeof item.a === "string" && typeof item.b === "string",
			`${path} item ${index} needs "a" and "b" result labels`)
		invariant(item.a !== item.b, `${path} item ${index} (${item.image}) compares a label with itself`)
		return { image: item.image, a: item.a, b: item.b }
	})
}

const usesSpec = typeof values.spec === "string"
const usesPair = typeof values.a === "string" || typeof values.b === "string" || typeof values.cases === "string"
invariant(usesSpec !== usesPair,
	"provide either --a/--b/--cases (one pair for the whole batch) or --spec <path> (a pair per item), not both")

let specItems: SpecItem[]
if (usesSpec) {
	const path = resolve(repoRoot, values.spec!)
	specItems = parseSpec(await readJson<unknown>(path), path)
} else {
	invariant(typeof values.a === "string" && typeof values.b === "string", "--a <label> and --b <label> are required")
	invariant(values.a !== values.b, "--a and --b must be different labels")
	invariant(typeof values.cases === "string", "--cases <basename,basename,...> is required")
	const cases = [...new Set(values.cases.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
	specItems = cases.map((image) => ({ image, a: values.a!, b: values.b! }))
}

invariant(specItems.length >= 4 && specItems.length <= 10,
	`a review batch must hold 4-10 items, got ${specItems.length} (the human reviewer must never get more)`)

const resultSets = new Map<string, Map<string, CachedResult>>()
async function cachedResult(label: string, image: string): Promise<CachedResult> {
	let set = resultSets.get(label)
	if (set === undefined) {
		set = await loadResultSet(label)
		resultSets.set(label, set)
	}
	const result = set.get(image)
	invariant(result !== undefined, `No cached result for ${image} under "${label}" (run run-corpus.ts first)`)
	return result
}

/** Written keys always carry the per-item pair, even when the whole batch shares one. */
type WrittenSide = BatchKey["sides"][number] & Readonly<{ labels: readonly [string, string] }>

const items: BatchItem[] = []
const sides: WrittenSide[] = []
for (const specItem of specItems) {
	const a = await cachedResult(specItem.a, specItem.image)
	const b = await cachedResult(specItem.b, specItem.image)
	invariant(a.sourceSha256 === b.sourceSha256,
		`${specItem.image} was extracted from different bytes in each result set`)
	// Content-derived coin flip: the same image and the same label pair always produce the same blinding.
	const firstLabelIsA = Number.parseInt(a.sourceSha256.slice(0, 2), 16) % 2 === 0
	const [sideA, sideB] = firstLabelIsA ? [a, b] : [b, a]
	items.push({
		image: specItem.image,
		imagePath: a.imagePath,
		sourceSha256: a.sourceSha256,
		byteCount: a.byteCount,
		A: blindPalette(sideA.extraction),
		B: blindPalette(sideB.extraction),
	})
	sides.push({
		image: specItem.image,
		sourceSha256: a.sourceSha256,
		labels: [specItem.a, specItem.b],
		A: sideA.label,
		B: sideB.label,
	})
}

/**
 * Batch-level `labels` stays for readers of the older key format: it is the `--a`/`--b` pair when the
 * whole batch shares one, and the sorted distinct labels otherwise. The authoritative per-item pair is
 * `sides[i].labels`.
 */
const distinct = [...new Set(sides.flatMap((side) => side.labels))].sort()
const singlePair = specItems.every((item) => item.a === specItems[0].a && item.b === specItems[0].b)
const batchLabels: readonly string[] = singlePair ? [specItems[0].a, specItems[0].b] : distinct

const batch: Batch = { schemaVersion: 1, name: values.name, items }
const key: BatchKey = { schemaVersion: 1, name: values.name, labels: batchLabels, sides }
const batchPath = resolve(batchesRoot, `${values.name}.json`)
const keyPath = resolve(batchesRoot, `${values.name}.key.json`)
await writeJsonAtomic(batchPath, batch)
await writeJsonAtomic(keyPath, key)

process.stdout.write(`wrote ${batchPath} (${items.length} items)\n`)
process.stdout.write(`wrote ${keyPath} (unblinding key, never served)\n`)
for (const side of sides) {
	process.stdout.write(`  ${side.image}: ${side.labels[0]} vs ${side.labels[1]} -> A=${side.A} B=${side.B}\n`)
}
