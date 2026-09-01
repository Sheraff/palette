/**
 * Track P probe worker: extract winners for a list of artworks from one tree.
 *
 * Usage:
 *   node --no-warnings --experimental-strip-types probe/extract.ts \
 *     --tree baseline|variant --images <newline-list-file> [--site N --factor F | --absolute A] [--census]
 *
 * Emits one JSON line per image on stdout, and (with --census) a final `{"kind":"census"}` line
 * carrying the instrumentation counters. Reads artwork from the shared checkout, never from the
 * worktree's `images/` — that directory contains only the scrambled decoys (charter, corpus trap).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repoRoot = resolve(trackRoot, "../../..")

const { values } = parseArgs({
	options: {
		tree: { type: "string", default: "variant" },
		images: { type: "string" },
		site: { type: "string" },
		factor: { type: "string" },
		absolute: { type: "string" },
		census: { type: "boolean", default: false },
		/**
		 * Emit, per artwork, which sites fired on *that* artwork. This is what firing-conditioned
		 * corpora are built from: only an artwork on which a constant's mechanism is live can flip
		 * when that constant moves, so sizing a deep pass by "300 live cases" needs per-artwork
		 * attribution, which the aggregate census cannot give.
		 */
		"per-image": { type: "boolean", default: false },
	},
	strict: true,
})
if (values["per-image"]) process.env.TRACK_P_CENSUS = "1"

if (values.site !== undefined) process.env.TRACK_P_SITE = values.site
if (values.factor !== undefined) process.env.TRACK_P_FACTOR = values.factor
if (values.absolute !== undefined) process.env.TRACK_P_ABSOLUTE = values.absolute
if (values.census) process.env.TRACK_P_CENSUS = "1"

const treePath = values.tree === "baseline"
	? resolve(repoRoot, "research/v2-3/index.ts")
	: resolve(trackRoot, ".variant/index.ts")

const module = await import(treePath) as {
	extractPaletteFromBytes: (bytes: Uint8Array) => Promise<{
		winner: Record<string, { hex: string }> & { gradient: boolean }
		researchRender?: { field: { stops: { hex?: string }[] } }
	}>
}

const images = readFileSync(resolve(values.images ?? ""), "utf8")
	.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)

const probe = (values.census || values["per-image"])
	? await import(resolve(trackRoot, ".variant/src/internal/__track-p.ts")) as {
		evaluations: Float64Array; reads: Float64Array; comparisons: Float64Array
		flips: Float64Array; nearest: Float64Array
	}
	: null

for (const image of images) {
	try {
		const before = values["per-image"] && probe
			? {
				evaluations: probe.evaluations.slice(),
				reads: probe.reads.slice(),
				comparisons: probe.comparisons.slice(),
			}
			: null
		const bytes = readFileSync(image)
		const result = await module.extractPaletteFromBytes(bytes)
		const winner = result.winner
		/** Site indices that fired on this artwork, and those that fired *as a comparison*. */
		let fired: number[] | undefined
		let compared: number[] | undefined
		if (before && probe) {
			fired = []
			compared = []
			for (let index = 0; index < probe.evaluations.length; index += 1) {
				// Both counters must be diffed against the snapshot: `reads` is cumulative across the
				// whole worker, so testing it against zero marks every previously-read site as live on
				// every subsequent artwork.
				if (probe.evaluations[index]! > before.evaluations[index]!
					|| probe.reads[index]! > before.reads[index]!) fired.push(index)
				if (probe.comparisons[index]! > before.comparisons[index]!) compared.push(index)
			}
		}
		process.stdout.write(`${JSON.stringify({
			image,
			b: winner.background.hex,
			s: winner.surface.hex,
			f: winner.foreground.hex,
			a: winner.accent.hex,
			g: winner.gradient,
			m: result.researchRender?.field.stops[1]?.hex ?? null,
			...(compared ? { compared } : {}),
			...(fired ? { fired } : {}),
		})}\n`)
	} catch (error) {
		process.stdout.write(`${JSON.stringify({
			image, error: error instanceof Error ? error.message : String(error),
		})}\n`)
	}
}

if (values.census && probe) {
	process.stdout.write(`${JSON.stringify({
		kind: "census",
		evaluations: [...probe.evaluations],
		reads: [...probe.reads],
		comparisons: [...probe.comparisons],
		flips: [...probe.flips],
		nearest: [...probe.nearest].map((value) => Number.isFinite(value) ? value : null),
	})}\n`)
}
