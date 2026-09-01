/**
 * Normalized interface length between the two families that support a gradient.
 *
 * `separate-flat-fields` hypotheses already use this idiom (palette-core, `adjacency`):
 *
 *     boundaryEdges / (2 * sqrt(min(population of the two families)))
 *
 * which is the shared interface measured in units of the perimeter a *compact* blob of the
 * smaller family would have. Near 1 means the two populations meet along something like a single
 * clean edge; much greater than 1 means the interface is long relative to the areas — the two
 * colours interpenetrate, which is what shading on one surface looks like.
 *
 * Unlike the per-pixel jump statistics, this is computed on family populations, so grass texture
 * inside one family does not inflate it. Gradient hypotheses never consult it today.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const imagesRoot = resolve(process.env.PALETTE_IMAGES_ROOT ?? "images")
const corpusRoot = resolve(imagesRoot, "..")

const cases: ReadonlyArray<readonly [string, string]> = [
	["07/ab67616d0000b2730007cc8b341c11227aa7b461", "SEAM sky/grass — must NOT be gradient"],
	["04/ab67616d00001e020004ccf0ae91364130886c02", "SHADE leaf — flat now, should be gradient?"],
	["08/ab67616d0000b27300081dec93652e6af2582192", "gradient correct"],
	["images/loups.jpg", "gradient, reviewed strong"],
	["images/doja.jpg", "gradient, reviewed strong"],
	["images/birdsofprey.jpg", "gradient, reviewed strong"],
	["images/once.jpg", "gradient, reviewed strong"],
	["images/placebo.jpg", "gradient, reviewed strong"],
	["images/havana.jpg", "gradient, reviewed strong"],
	["images/muse.jpg", "gradient, reviewed strong"],
	["images/slim.jpg", "gradient, reviewed strong"],
]

console.log("case".padEnd(15), "grad", "  bdryEdges", "  minPop", "INTERFACE", " note")
for (const [relative, note] of cases) {
	const image = await loadNativeImage(await readFile(resolve(corpusRoot, relative)))
	const details = extractPaletteDetails(image)
	const evidence = buildAlbumArtworkPaletteV2Phase3CommonBase(buildPaletteSeedDomain(image)).evidence.native as
		unknown as Readonly<{
			families: ReadonlyArray<Readonly<{ id: string; population: number }>>
			adjacencies: ReadonlyArray<Readonly<{ firstFamilyId: string; secondFamilyId: string; boundaryEdges: number }>>
		}>
	const g = details.winner.gradientEvidence as undefined | Readonly<{ supportingFamilyIds: readonly [string, string] }>
	const label = (relative.split("/").pop() ?? "").slice(-14).padEnd(15)
	if (!g) { console.log(label, "false", "        —        —        —", " " + note); continue }
	const [first, second] = g.supportingFamilyIds
	const adjacency = evidence.adjacencies.find(({ firstFamilyId, secondFamilyId }) =>
		(firstFamilyId === first && secondFamilyId === second) || (firstFamilyId === second && secondFamilyId === first))
	const population = (id: string): number => evidence.families.find((f) => f.id === id)?.population ?? 0
	const minimum = Math.max(1, Math.min(population(first), population(second)))
	const edges = adjacency?.boundaryEdges ?? 0
	console.log(label, "true ", String(edges).padStart(11), String(minimum).padStart(9),
		(edges / (2 * Math.sqrt(minimum))).toFixed(3).padStart(9), " " + note)
}
