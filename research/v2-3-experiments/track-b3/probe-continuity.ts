/**
 * `edgeContinuity` is already computed for every gradient fit and consumed by nothing.
 *
 * It measures the share of the fit's progression that accumulates through *smooth* neighbour
 * steps rather than across abrupt colour jumps:
 *
 *     edgeContinuity = 1 - (progressive edge change carried by jumps > one family bin step)
 *                        / (total progressive edge change)
 *
 * That is exactly Flo's distinction. Continuous shading within one surface accumulates its
 * progression in many small steps, so continuity is high. Two distinct areas meeting at a seam
 * accumulate it across the seam, so continuity is low.
 *
 * This prints it for the winning gradient of each case, against the recorded verdicts.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const imagesRoot = resolve(process.env.PALETTE_IMAGES_ROOT ?? "images")
const corpusRoot = resolve(imagesRoot, "..")

const cases: ReadonlyArray<readonly [string, string]> = [
	["07/ab67616d0000b2730007cc8b341c11227aa7b461", "SEAM sky/grass — weak-fallback, must NOT be gradient"],
	["04/ab67616d00001e020004ccf0ae91364130886c02", "SHADE leaf — strong, flat, Flo wonders if gradient"],
	["05/ab67616d00001e02000564718f605c1f326b2ca2", "flat now; 'could imagine a gradient'"],
	["08/ab67616d0000b27300081dec93652e6af2582192", "gradient correct, endpoints wrong"],
	["images/loups.jpg", "gradient, reviewed strong"],
	["images/doja.jpg", "gradient, reviewed strong"],
	["images/birdsofprey.jpg", "gradient, reviewed strong"],
	["images/once.jpg", "gradient, reviewed strong"],
	["images/placebo.jpg", "gradient, reviewed strong"],
	["images/havana.jpg", "gradient, reviewed strong"],
	["images/muse.jpg", "gradient, reviewed strong"],
	["images/slim.jpg", "gradient, reviewed strong"],
	["images/artofficial.jpg", "reviewed strong"],
	["images/franz.jpg", "reviewed strong"],
	["images/meteora.jpg", "reviewed strong"],
	["images/nada.jpg", "reviewed strong"],
]

const f = (v: number | undefined, d = 3): string => (v === undefined ? "   —" : v.toFixed(d)).padStart(8)

console.log(
	"case".padEnd(14), "grad", "edgeCont", "progres", "modeProg", "bandDisp", "SEAMCONC", " monoton",
	"residual", "  texture", " note",
)
for (const [relative, note] of cases) {
	const image = await loadNativeImage(await readFile(resolve(corpusRoot, relative)))
	const details = extractPaletteDetails(image)
	const g = details.winner.gradientEvidence as undefined | Readonly<{
		edgeContinuity: number; progression: number; modeProgression: number
		bandDispersion: number; seamConcentration: number
		monotonicity: number; residual: number; texture: number
	}>
	console.log(
		(relative.split("/").pop() ?? "").slice(-13).padEnd(14),
		String(details.winner.gradient).padEnd(5),
		f(g?.edgeContinuity), f(g?.progression), f(g?.modeProgression), f(g?.bandDispersion), f(g?.seamConcentration), f(g?.monotonicity), f(g?.residual, 4), f(g?.texture, 4), " " + note,
	)
}
