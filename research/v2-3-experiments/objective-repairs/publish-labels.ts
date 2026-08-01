import { readFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"

import { sha256, writeJsonAtomic } from "../../v2-3-eval/src/shared.ts"
import type { CachedResult, PaletteExtraction } from "../../v2-3-eval/src/shared.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { algorithmIdentity } from "../../v2-3/index.ts"
import { buildCorpus, CONFIGURATIONS, SHARED_CHECKOUT } from "./corpus.ts"

/**
 * Publish two label sets as REAL extractions into the shared checkout's eval results, so
 * `make-batch.ts` and `serve-review.ts` can assemble and serve a human review batch from them
 * directly.
 *
 *   node --no-warnings --experimental-strip-types publish-labels.ts --cases <image,image,...>
 *
 * The extraction shape is built exactly as `research/v2-3/index.ts:extractPalette` builds it — the
 * public entry point takes no repair override, and adding one to it would put a research knob on the
 * library surface. This is the same posture `research/v2-3-eval/export-candidates.ts` already takes
 * toward the internals.
 */

sharp.concurrency(1)

const { values } = parseArgs({
	options: { cases: { type: "string" }, labels: { type: "string", default: "or-off,or-on" } },
	strict: true,
})

const labels = values.labels.split(",").map((label) => label.trim())
for (const label of labels) if (!(label in CONFIGURATIONS)) throw new Error(`unknown label ${label}`)

const corpus = await buildCorpus()
const wanted = values.cases === undefined ? null : new Set(values.cases.split(",").map((name) => name.trim()))
const selected = wanted === null ? corpus : corpus.filter(({ image }) => wanted.has(image))
if (wanted !== null) {
	const missing = [...wanted].filter((name) => !selected.some(({ image }) => image === name))
	if (missing.length > 0) throw new Error(`not in corpus: ${missing.join(", ")}`)
}

const roles = ["background", "surface", "foreground", "accent"] as const
/**
 * Written twice: into this worktree, so `make-batch.ts` can assemble the batch here and the batch
 * file lands on this branch, and into the shared checkout, which is where `serve-review.ts` will be
 * run from and where the artwork actually lives. `data/results/` is gitignored in both.
 */
const resultsRoots = [
	resolve(import.meta.dirname, "../../v2-3-eval/data/results"),
	resolve(SHARED_CHECKOUT, "research/v2-3-eval/data/results"),
]

for (const label of labels) {
	const overrides = CONFIGURATIONS[label]
	for (const entry of selected) {
		const bytes = await readFile(entry.path)
		const image = await loadNativeImage(bytes)
		const details = extractPaletteDetails(image, undefined, undefined, overrides)
		const colors = Object.fromEntries(roles.map((role) => {
			const { rgb, oklab, hex, generated } = details.winner[role]
			return [role, { rgb, oklab, hex, generated }]
		})) as Record<typeof roles[number], PaletteExtraction["winner"]["background"]>
		const extraction: PaletteExtraction = {
			algorithm: algorithmIdentity,
			width: details.width,
			height: details.height,
			winner: {
				...colors,
				gradient: details.winner.gradient,
				collapse: details.winner.collapse,
			},
			...(details.midpoint.kind === "source-supported-three-stop" ? {
				researchRender: {
					schemaVersion: 1 as const,
					field: {
						kind: "linear-gradient" as const,
						angleDegrees: 135 as const,
						interpolation: "oklab" as const,
						stops: [
							{ kind: "role", role: "background", position: 0 },
							{ kind: "source-supported-color", hex: details.midpoint.color.hex, position: 0.5 },
							{ kind: "role", role: "surface", position: 1 },
						],
					},
				},
			} : {}),
		}
		const result: CachedResult = {
			schemaVersion: 1,
			label,
			algorithm: "v2-3",
			algorithmIdentity,
			image: entry.image,
			imagePath: relative(SHARED_CHECKOUT, entry.path),
			sourceSha256: sha256(bytes),
			byteCount: bytes.byteLength,
			extraction,
		}
		for (const root of resultsRoots) await writeJsonAtomic(resolve(root, label, `${entry.image}.json`), result)
		process.stdout.write(`${label} ${entry.image} ${extraction.winner.background.hex} `
			+ `${extraction.winner.surface.hex} ${extraction.winner.foreground.hex} `
			+ `${extraction.winner.accent.hex}${extraction.winner.gradient ? " gradient" : ""}\n`)
	}
}
