import { parseArgs } from "node:util"
import { resolve } from "node:path"
import {
	type CachedResult,
	invariant,
	loadResultSet,
	midpointHex,
	repoRoot,
	roles,
	selectImages,
	writeJsonAtomic,
} from "./src/shared.ts"

/**
 * Compare two cached result sets and report every image whose displayed winner differs.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/diff-report.ts \
 *     --a <label> --b <label> [--images <glob-or-list>] [--json <path>]
 *
 * The compared surface is exactly what a user sees: four role hexes, the gradient flag, and the
 * source-supported midpoint hex.
 */

const { values } = parseArgs({
	options: {
		a: { type: "string" },
		b: { type: "string" },
		images: { type: "string" },
		json: { type: "string" },
	},
	strict: true,
})

invariant(typeof values.a === "string" && typeof values.b === "string", "--a <label> and --b <label> are required")
invariant(values.a !== values.b, "--a and --b must be different labels")

const fields = [...roles, "gradient", "midpoint"] as const
type Field = typeof fields[number]

function displayed(result: CachedResult): Record<Field, string> {
	const winner = result.extraction.winner
	return {
		background: winner.background.hex,
		surface: winner.surface.hex,
		foreground: winner.foreground.hex,
		accent: winner.accent.hex,
		gradient: winner.gradient ? "gradient" : "flat",
		midpoint: midpointHex(result.extraction) ?? "none",
	}
}

const [left, right] = await Promise.all([loadResultSet(values.a), loadResultSet(values.b)])
const filter = values.images === undefined
	? null
	: new Set((await selectImages(values.images)).map((entry) => entry.image))

const names = [...new Set([...left.keys(), ...right.keys()])]
	.filter((image) => filter === null || filter.has(image))
	.sort()

type Difference = Readonly<{
	image: string
	sourceSha256: string
	changed: readonly Field[]
	a: Record<Field, string>
	b: Record<Field, string>
}>

const differences: Difference[] = []
const missing: { image: string; missingFrom: string }[] = []
const mismatchedSources: string[] = []
let compared = 0

for (const image of names) {
	const a = left.get(image)
	const b = right.get(image)
	if (a === undefined || b === undefined) {
		missing.push({ image, missingFrom: a === undefined ? values.a : values.b })
		continue
	}
	if (a.sourceSha256 !== b.sourceSha256) mismatchedSources.push(image)
	compared += 1
	const [aDisplay, bDisplay] = [displayed(a), displayed(b)]
	const changed = fields.filter((field) => aDisplay[field] !== bDisplay[field])
	if (changed.length > 0) {
		differences.push({ image, sourceSha256: a.sourceSha256, changed, a: aDisplay, b: bDisplay })
	}
}

function table(rows: readonly (readonly string[])[]): string {
	const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index].length)))
	return rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd()).join("\n")
}

const rows: string[][] = [["image", "field", values.a, values.b]]
for (const difference of differences) {
	for (const [index, field] of difference.changed.entries()) {
		rows.push([index === 0 ? difference.image : "", field, difference.a[field], difference.b[field]])
	}
}

process.stdout.write(`${values.a} vs ${values.b}\n`)
if (differences.length > 0) process.stdout.write(`${table(rows)}\n`)
process.stdout.write(`${compared} image(s) compared, ${differences.length} differ\n`)
for (const entry of missing) process.stdout.write(`missing: ${entry.image} has no result under "${entry.missingFrom}"\n`)
for (const image of mismatchedSources) {
	process.stdout.write(`warning: ${image} was extracted from different bytes in each set\n`)
}

if (values.json !== undefined) {
	const path = resolve(repoRoot, values.json)
	await writeJsonAtomic(path, {
		schemaVersion: 1,
		a: values.a,
		b: values.b,
		comparedCount: compared,
		differingCount: differences.length,
		differences,
		missing,
		mismatchedSources,
	})
	process.stdout.write(`wrote ${path}\n`)
}
