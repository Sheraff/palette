/**
 * # P2 α-tree — the dev-loop candidate (cycle-1 walking skeleton)
 *
 * Arm-b's paradigm in one line: **the palette is a reading of the image's nesting structure.** Build
 * a quasi-flat-zone hierarchy over the pixels at the contract's own same-colour bar, carve off what
 * reaches the frame as the *field*, type that field by which model represents it within one bar, and
 * read the four roles off nodes with lexicographic orders that carry no weights.
 *
 * ## What is here and what is not — read this before drawing a conclusion
 *
 * This is arm-b §6's **walking skeleton**, deliberately. Present: decode, OKLab at native
 * resolution, the α-hierarchy with grain folding, the field carve, flat and linear field typing, the
 * SPEC's representative rule, roles, collapses, and the 2-stop ramp. **Absent, and each absence is a
 * recorded cycle-1 cut, not an oversight:**
 *
 *  - **no text detector** — the stroke-width/mark-grouping pipeline of arm-b §2.4 is cycle 2, so
 *    "foreground" is the largest mark *group* the hierarchy already found, which is a much blunter
 *    instrument than "the colour a designer validated against this field",
 *  - **no radial or conic field models** — a radial field reaches `none` and takes the degenerate
 *    branch,
 *  - **no enclosure re-entry and no giant-type re-carve** (arm-b §2.3's two structural cases),
 *  - **no third gradient stop and no excursion measurement** — two stops or null.
 *
 * So: **quality is not the claim.** Validity and measurability are. The SPEC says so in as many
 * words, and a verdict about arm-b's paradigm read off this file's palettes would be a verdict about
 * a skeleton.
 *
 * ## What it inherits from the toy candidate, and what it refuses
 *
 * The **shape** is copied from `src/devloop/candidates/toy-median-offsets.ts`: own decode, header
 * dimensions, transparency refused loudly, exact source triples, the whole metadata block. The
 * **arithmetic** is not — in particular the toy's naive pixel-snapping, which its own docstring warns
 * against, appears nowhere. Every colour here comes out of `accumulator.ts`'s bar-density-mode rule,
 * which the SPEC fixes for both P2 pipelines precisely so the two prototypes differ in their trees
 * and not in their colour-picking.
 */

import { CONTRACT_VERSION } from "../../../src/contract/constants.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import type { Palette } from "../../../src/contract/types.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"
import { ALGORITHM_VERSION, CANDIDATE_ID, PREPROCESSING_VERSION } from "./constants.ts"
import { parseImage } from "./parse.ts"

export { ALGORITHM_VERSION, PREPROCESSING_VERSION }

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = CANDIDATE_ID

export const paletteOf: CandidatePalette = async (imagePath) => {
	const parse = await parseImage(imagePath)
	const { roles } = parse

	return {
		contractVersion: CONTRACT_VERSION,
		roles: {
			background: roles.background,
			surface: roles.surface,
			foreground: roles.foreground,
			accent: roles.accent,
		},
		gradient: roles.gradient,
		collapse: {
			// Stated, not inferred — but the statement has to be true, so it is measured against the
			// colours actually published rather than against what the assignment intended.
			surfaceCollapsed: roles.surface.hex === roles.background.hex,
			accentCollapsed: roles.accent.hex === roles.foreground.hex,
		},
		escape: roles.escape,
		contrast: parse.contrast,
		metadata: {
			algorithmVersion: ALGORITHM_VERSION,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: await hashFileBytes(imagePath),
			sourceRendition: {
				path: imagePath,
				width: parse.image.width,
				height: parse.image.height,
				format: parse.image.format,
			},
			// Equal to the rendition's size, because §1 forbids resampling.
			processedSize: { width: parse.image.width, height: parse.image.height },
		},
	} satisfies Palette
}
