import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import { parseArgs } from "node:util"
import {
	algorithms,
	type AlgorithmName,
	type CachedResult,
	invariant,
	isAlgorithmName,
	loadAlgorithm,
	readJsonIfPresent,
	repoRoot,
	resultPath,
	selectImages,
	sha256,
	writeJsonAtomic,
} from "./src/shared.ts"

/**
 * Run one or both palette algorithms over a set of images and cache the full extraction.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/run-corpus.ts \
 *     [--algo v2-2|v2-3|both] [--images <glob-or-list>] [--label <string>] [--force]
 *
 * Cache key is (image bytes sha256, algorithm identity, label). Nothing time-dependent is written,
 * so a rerun over unchanged inputs is a no-op and every output file is byte-stable.
 */

const { values } = parseArgs({
	options: {
		algo: { type: "string", default: "both" },
		images: { type: "string" },
		label: { type: "string" },
		force: { type: "boolean", default: false },
	},
	strict: true,
})

const requested = values.algo ?? "both"
invariant(requested === "both" || isAlgorithmName(requested),
	`--algo must be one of ${Object.keys(algorithms).join(", ")}, both`)
const selectedAlgorithms: AlgorithmName[] = requested === "both"
	? (Object.keys(algorithms) as AlgorithmName[])
	: [requested]
invariant(values.label === undefined || selectedAlgorithms.length === 1,
	"--label requires a single --algo (a label names one algorithm variant)")
invariant(values.label === undefined || /^[a-z0-9][a-z0-9._-]*$/iu.test(values.label),
	"--label must be a filesystem-safe token")

const images = await selectImages(values.images)
invariant(images.length > 0, "No images selected")

let executed = 0
let cached = 0
for (const algorithm of selectedAlgorithms) {
	const module = await loadAlgorithm(algorithm)
	const label = values.label ?? module.algorithmIdentity
	process.stdout.write(`${algorithm} (identity ${module.algorithmIdentity}) -> label "${label}", ${images.length} image(s)\n`)
	for (const [index, entry] of images.entries()) {
		const bytes = await readFile(entry.path)
		const sourceSha256 = sha256(bytes)
		const position = `[${String(index + 1).padStart(String(images.length).length, " ")}/${images.length}]`
		const path = resultPath(label, entry.image)
		const existing = await readJsonIfPresent<CachedResult>(path)
		if (!values.force && existing !== null && existing.sourceSha256 === sourceSha256
			&& existing.label === label && existing.algorithmIdentity === module.algorithmIdentity) {
			cached += 1
			process.stdout.write(`${position} ${label} ${entry.image} cached\n`)
			continue
		}
		const started = process.hrtime.bigint()
		const extraction = await module.extractPaletteFromBytes(bytes)
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6
		const result: CachedResult = {
			schemaVersion: 1,
			label,
			algorithm,
			algorithmIdentity: module.algorithmIdentity,
			image: entry.image,
			imagePath: relative(repoRoot, entry.path),
			sourceSha256,
			byteCount: bytes.byteLength,
			extraction,
		}
		await writeJsonAtomic(path, result)
		executed += 1
		process.stdout.write(`${position} ${label} ${entry.image} extracted in ${elapsed.toFixed(0)}ms `
			+ `(${extraction.winner.background.hex} ${extraction.winner.surface.hex} `
			+ `${extraction.winner.foreground.hex} ${extraction.winner.accent.hex}`
			+ `${extraction.winner.gradient ? " gradient" : ""})\n`)
	}
}

process.stdout.write(`done: ${executed} extracted, ${cached} reused\n`)
