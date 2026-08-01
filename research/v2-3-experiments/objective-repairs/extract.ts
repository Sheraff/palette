import { mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"

import { readJsonIfPresent, sha256, writeJsonAtomic } from "../../v2-3-eval/src/shared.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { buildCorpus, CONFIGURATIONS, describeCorpus } from "./corpus.ts"

/**
 * Extract one shard of the corpus under one repair configuration.
 *
 *   node --no-warnings --experimental-strip-types extract.ts --config or-off [--shard 0 --shards 4]
 *
 * One result file per image, so the run is resumable and the orchestrator can kill it at any point
 * (TRACK_CHARTER.md, "Machine budget"). Cache key is (image bytes sha256, configuration), and
 * nothing time-dependent is written, so a rerun over unchanged inputs is a no-op.
 */

sharp.concurrency(1)

const { values } = parseArgs({
	options: {
		config: { type: "string" },
		shard: { type: "string" },
		shards: { type: "string" },
		force: { type: "boolean", default: false },
		quiet: { type: "boolean", default: false },
	},
	strict: true,
})

const config = values.config ?? ""
if (!(config in CONFIGURATIONS)) {
	throw new Error(`--config must be one of ${Object.keys(CONFIGURATIONS).join(", ")}`)
}
const overrides = CONFIGURATIONS[config]

const outputRoot = resolve(import.meta.dirname, "data", config)
await mkdir(outputRoot, { recursive: true })

let corpus = await buildCorpus()
if (!values.quiet) process.stdout.write(`${describeCorpus(corpus)}\n`)
if (values.shard !== undefined && values.shards !== undefined) {
	const shard = Number(values.shard)
	const shards = Number(values.shards)
	corpus = corpus.filter((_, index) => index % shards === shard)
}

const roles = ["background", "surface", "foreground", "accent"] as const

for (const [index, entry] of corpus.entries()) {
	const position = `[${index + 1}/${corpus.length}]`
	const path = resolve(outputRoot, `${entry.image}.json`)
	const bytes = await readFile(entry.path)
	const sourceSha256 = sha256(bytes)
	const existing = await readJsonIfPresent<{ sourceSha256?: string; config?: string }>(path)
	if (!values.force && existing !== null && existing.sourceSha256 === sourceSha256 && existing.config === config) {
		if (!values.quiet) process.stdout.write(`${position} ${config} ${entry.image} cached\n`)
		continue
	}
	const image = await loadNativeImage(bytes)
	const details = extractPaletteDetails(image, undefined, undefined, overrides)
	const winner = {
		...Object.fromEntries(roles.map((role) => [role, details.winner[role].hex])) as Record<typeof roles[number], string>,
		gradient: details.winner.gradient,
		collapseSurface: details.winner.collapse.surface,
		collapseAccent: details.winner.collapse.accent,
		midpoint: details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.hex : null,
		generated: roles.filter((role) => details.winner[role].generated),
	}
	await writeJsonAtomic(path, {
		schemaVersion: 1,
		config,
		image: entry.image,
		imagePath: entry.path,
		strata: entry.strata,
		verdict: entry.verdict,
		sourceSha256,
		width: details.width,
		height: details.height,
		winner,
	})
	if (!values.quiet) {
		process.stdout.write(`${position} ${config} ${entry.image} ${winner.background} ${winner.surface} `
			+ `${winner.foreground} ${winner.accent}${winner.gradient ? " gradient" : ""}\n`)
	}
}

process.stdout.write(`${config} shard done: ${corpus.length} image(s)\n`)
