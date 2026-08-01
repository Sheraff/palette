import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import sharp from "sharp"

import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../../v2-3/src/internal/palette.ts"

import { gateCorpus, imagesRoot } from "./corpus.ts"

sharp.concurrency(1)

/**
 * Canonical serialisation for the byte-identity gate.
 *
 * `JSON.stringify` is not sufficient on its own: it maps `NaN`/`±Infinity` to `null`, which would
 * hide exactly the kind of numeric drift this gate exists to catch, and it preserves insertion
 * order, so a refactor that merely reorders object literal keys would read as a false failure.
 * Keys are therefore sorted and every non-finite number (plus `-0`) is encoded explicitly.
 */
function canonical(value: unknown): string {
	if (value === null) return "null"
	if (typeof value === "number") {
		if (Number.isNaN(value)) return '"@NaN"'
		if (value === Infinity) return '"@+Inf"'
		if (value === -Infinity) return '"@-Inf"'
		if (Object.is(value, -0)) return '"@-0"'
		return JSON.stringify(value)
	}
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
	if (value === undefined) return '"@undefined"'
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
	if (typeof value === "object") {
		const entries = Object.keys(value as Record<string, unknown>).sort()
		return `{${entries.map((key) =>
			`${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
	}
	return JSON.stringify(String(value))
}

export async function extractCanonical(path: string): Promise<string> {
	const image = await loadNativeImage(path)
	const details = extractPaletteDetails(image)
	return canonical(details)
}

async function main(): Promise<void> {
	const outDir = resolve(process.argv[2] ?? "")
	if (!process.argv[2]) throw new Error("usage: dump.ts <output-dir> [--limit N]")
	const limitFlag = process.argv.indexOf("--limit")
	const limit = limitFlag === -1 ? Infinity : Number(process.argv[limitFlag + 1])
	mkdirSync(outDir, { recursive: true })
	const corpus = gateCorpus().slice(0, limit)
	process.stderr.write(`imagesRoot=${imagesRoot}\ncorpus=${corpus.length}\n`)
	const lines: string[] = []
	for (const { label, path } of corpus) {
		try {
			lines.push(`${label}\t${await extractCanonical(path)}`)
		} catch (error) {
			lines.push(`${label}\t@ERROR\t${(error as Error).message}`)
		}
	}
	writeFileSync(resolve(outDir, "extractions.tsv"), `${lines.join("\n")}\n`)
	process.stderr.write(`wrote ${lines.length} extractions to ${outDir}/extractions.tsv\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
