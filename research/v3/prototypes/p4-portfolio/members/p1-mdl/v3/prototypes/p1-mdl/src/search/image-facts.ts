/**
 * # The image-side facts invariant 2 and invariant 5 need, without a second decode
 *
 * `feasibility()` runs three of the five invariants on the palette alone and **defers** the other
 * two unless it is handed facts about the file: invariant 2's existence clause needs a `PixelSource`,
 * invariant 5 needs the decoder's transparency report. `src/emit/feasibility.ts` is explicit that a
 * deferral is not a pass — so a search that never supplies these has been minimising over a
 * *superset* of the feasible set and its emitted palette has never been checked against the artwork.
 *
 * That check has to happen. It must not happen by decoding the image a second time: `src/measure/`
 * owns decoding (`DESIGN.md`'s module layout), and `CONVENTIONS.md` records 719 files in the corpus
 * whose own headers disagree with their filenames — two decodes are two chances to disagree about
 * what the image is.
 *
 * ## What `tripleTablePixelSource` is, exactly
 *
 * `validateSourceSupport` reads exactly two things off a `PixelSource`: the **multiset of RGB
 * triples** it yields, and **how many pixels** that is against the declared `width × height`. The
 * per-triple table already holds both, exactly — `counts` are exact integer pixel counts and their
 * sum is the pixel count — so a source that replays the table is bit-for-bit the same evidence about
 * existence and about population share as replaying the raster would be.
 *
 * What it is **not** is spatially faithful. `PixelSample.x/y` are synthesized in raster order and
 * carry no information about where a colour actually sits. Nothing consults them today: invariant
 * 2's spatial-spread clause is permanently `deferred` for want of thresholds (`SpatialSpreadValidator`
 * in `src/contract/invariants.ts`), and the deferral is reported rather than silently satisfied. The
 * moment that clause acquires thresholds, this source stops being adequate and must be replaced by
 * the real raster — which is why this docstring says so rather than leaving it to be discovered.
 *
 * ## And the transparency report
 *
 * `src/measure/decode.ts` **throws** `TransparentInputError` on the first pixel with alpha below
 * opaque. So a `Measurement` existing at all is proof that the file has no transparent pixel, and the
 * report below states that as a fact derived from the decode rather than as an assumption:
 * `hasAlphaChannel` comes from the decoded channel count, `hasTransparentPixels` is false because the
 * alternative did not return.
 */

import type {
	PixelIterable,
	PixelSample,
	Rgb8,
	TransparencyReport,
} from "../../../../src/contract/types.ts"
import { unpackKey } from "../measure/triples.ts"
import type { Measurement } from "../measure/types.ts"
import type { ImageFacts } from "../emit/feasibility.ts"

/**
 * A `PixelSource` that replays the measurement's per-triple table.
 *
 * Exact for the two questions invariant 2 asks of it; see the file header for the one question it
 * cannot answer and the deferral that covers it.
 */
export function tripleTablePixelSource(measurement: Measurement): PixelIterable {
	const { width, height } = measurement.source
	const { colorCount, counts, keys } = measurement.triples
	return {
		width,
		height,
		*pixels(): Iterable<PixelSample> {
			let index = 0
			for (let row = 0; row < colorCount; row += 1) {
				const rgb: Rgb8 = unpackKey(keys[row])
				const count = counts[row]
				for (let repeat = 0; repeat < count; repeat += 1) {
					// Normalized raster-order coordinates, per `PixelSample`. They are a *position*, not
					// *this triple's* position — see the file header.
					yield { x: (index % width) / width, y: Math.floor(index / width) / height, rgb }
					index += 1
				}
			}
		},
	}
}

/**
 * The decoder's transparency verdict, recovered from the fact that the decode returned.
 *
 * `hasAlphaChannel` is `channels === 4`: `src/measure/decode.ts` keeps a fourth channel only when a
 * uniformly opaque alpha rode along with the raster.
 */
export function transparencyReportOf(measurement: Measurement): TransparencyReport {
	return {
		hasAlphaChannel: measurement.source.channels === 4,
		hasTransparentPixels: false,
		transparentFraction: 0,
	}
}

/**
 * The full fact bag, for the calls that adjudicate a *file* rather than a lattice node.
 *
 * Building the source is free (it is a generator closure); *consuming* it is one pass over every
 * pixel, which is why `DESIGN.md`'s inner loop does not use this and the final verification does.
 */
export function imageFactsOf(measurement: Measurement): ImageFacts {
	return {
		source: tripleTablePixelSource(measurement),
		transparency: transparencyReportOf(measurement),
	}
}
