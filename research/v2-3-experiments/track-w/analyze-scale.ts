/**
 * Attribution of a Track W sweep BY ARTWORK RESOLUTION.
 *
 * The relative `resolved` has an exact structural prediction: at
 * `resolvedReferencePixelCount` (640²) the reference population is unchanged, so every
 * artwork at that size must be byte-identical no matter what the exponent is. Cases can
 * only move at the small end (where the reference falls, admitting smaller elements) and
 * the large end (where it rises, demoting them). If that is not what the sweep shows, the
 * reformulation is not doing what it claims.
 *
 *   node ... analyze-scale.ts <baseline> <candidate>
 */
import { readFileSync, existsSync } from "node:fs"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { CASES, keyOf, type Row } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const REFERENCE = 409_600

const baseLabel = process.argv[2]
const candidateLabel = process.argv[3]
if (!baseLabel || !candidateLabel) throw new Error("usage: analyze-scale.ts <baseline> <candidate>")

const load = (label: string, caseFile: string): Row | null => {
	const path = `${import.meta.dirname}/data/${label}/${keyOf(caseFile)}.json`
	return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Row : null
}

type Bucket = { total: number; changed: number; cases: string[] }
const buckets = new Map<string, Bucket>()
const bucketOf = (pixels: number): string =>
	pixels < REFERENCE ? "below 640² (reference FALLS)"
		: pixels === REFERENCE ? "exactly 640² (reference UNCHANGED)"
			: "above 640² (reference RISES)"

for (const caseFile of CASES) {
	const before = load(baseLabel, caseFile)
	const after = load(candidateLabel, caseFile)
	if (!before || !after) continue
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const key = bucketOf(image.width * image.height)
	const bucket = buckets.get(key) ?? { total: 0, changed: 0, cases: [] }
	bucket.total += 1
	if (JSON.stringify(before) !== JSON.stringify(after)) {
		bucket.changed += 1
		bucket.cases.push(`${caseFile} (${image.width}x${image.height})`)
	}
	buckets.set(key, bucket)
}

console.log(`# ${baseLabel} -> ${candidateLabel}, by artwork resolution\n`)
for (const key of ["below 640² (reference FALLS)", "exactly 640² (reference UNCHANGED)", "above 640² (reference RISES)"]) {
	const bucket = buckets.get(key)
	if (!bucket) continue
	console.log(`${key}: ${bucket.changed}/${bucket.total} changed (${(100 * bucket.changed / bucket.total).toFixed(1)} %)`)
	for (const entry of bucket.cases) console.log(`    ${entry}`)
	console.log()
}
