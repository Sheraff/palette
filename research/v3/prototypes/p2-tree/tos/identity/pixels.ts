/**
 * **Pixel-level attribution of a published colour.**
 *
 * Given an image and one triple the palette published, this answers *what the colour physically is* in
 * the artwork, from the pixels and nothing else:
 *
 *  - the **exact-triple mask** and the **bar mask** (every pixel the contract's own regional ruler calls
 *    the same colour as the subject — the honest unit, because a JPEG never repeats one triple across a
 *    whole glyph);
 *  - the bar mask's **8-connected components**, each with its area, bounding box and **inradius**, taken
 *    from the same exact Euclidean distance transform `pipeline.ts` uses for stroke width. An inradius
 *    is a thickness in pixels: 1 is a filament, 2–6 is a stroke, 30 is a slab;
 *  - the **boundary fraction** — the share of mask pixels that touch a non-mask pixel in 4-connectivity.
 *    A one-pixel antialiasing fringe scores 1.0 by construction; a filled region scores its perimeter
 *    over its area;
 *  - the **outer ring spectrum** — the colours immediately outside the mask, with their OKLab lightness.
 *    An antialiasing fringe is a *mixture*, so its neighbours straddle it in lightness on both sides;
 *    a printed mark's neighbours sit on one side of it.
 *
 * ### The classification rule, stated so it can be disagreed with
 *
 * Diagnosis needs a verdict, and a verdict needs a cut. These cuts are **not pipeline constants and
 * nothing in `tos/` reads them** — they exist in this file, are reported alongside the raw measurements
 * that produced them, and every report carries the numbers so a reader can re-cut them:
 *
 * | verdict | rule |
 * |---|---|
 * | `antialias-or-halo` | bar-mask max inradius < 2 px, i.e. nowhere in the image is this colour more than one pixel from something that is not it |
 * | `scrim-or-overlay` | one component holds ≥ 50% of the bar mass **and** covers ≥ 5% of the image **and** its inradius ≥ 8 px |
 * | `glyph-or-mark-ink` | max inradius ≥ 2 px and the mass is carried by marks: ≥ 4 components of ≥ 2 px inradius, or one component under 5% of the image |
 * | `other` | anything else, reported with its numbers |
 *
 * Provenance tag: `p2-tos-identity/pixels@1`.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { distanceFieldOf, unpack, type DecodedImage } from "../pipeline.ts"

export const PIXELS_PROVENANCE = "p2-tos-identity/pixels@1"

/** The diagnosis-only cuts. Not constants of the pipeline; reported with every verdict. */
export const CUTS = {
	filamentInradiusPx: 2,
	scrimMassShare: 0.5,
	scrimImageShare: 0.05,
	scrimInradiusPx: 8,
	markComponentInradiusPx: 2,
	markComponentCount: 4,
} as const

export type ComponentStat = Readonly<{
	area: number
	areaFraction: number
	minX: number
	minY: number
	maxX: number
	maxY: number
	inradius: number
	/** Share of the component's pixels that touch a non-mask pixel in 4-connectivity. */
	boundaryFraction: number
}>

export type Attribution = Readonly<{
	hex: string
	rgb: Rgb8
	exactPixels: number
	exactShare: number
	barPixels: number
	barShare: number
	componentCount: number
	maxInradius: number
	largestComponentShareOfMass: number
	largestComponentImageShare: number
	boundaryFraction: number
	componentsAtOrAboveMarkInradius: number
	/** How many components got a distance transform, and whether the budget bound. */
	inradiusMeasuredComponents: number
	inradiusBudgetBound: boolean
	/** The five largest components. */
	topComponents: readonly ComponentStat[]
	/** Colours immediately outside the bar mask, most common first, with OKLab lightness. */
	outerRing: readonly { hex: string; count: number; lightness: number }[]
	subjectLightness: number
	/** Share of outer-ring mass that is darker than the subject, and lighter. */
	outerRingDarkerShare: number
	outerRingLighterShare: number
	verdict: "antialias-or-halo" | "scrim-or-overlay" | "glyph-or-mark-ink" | "other"
	cuts: typeof CUTS
	provenance: string
}>

/** Every pixel the contract's regional bar calls the same colour as `subject`. */
export function barMaskOf(image: DecodedImage, subject: Rgb8): Uint8Array {
	const subjectLab = rgbToOkLab(subject)
	const subjectColor = colorFromRgb(subject)
	const decided = new Map<number, boolean>()
	const mask = new Uint8Array(image.packed.length)
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		const packed = image.packed[pixel]
		let inside = decided.get(packed)
		if (inside === undefined) {
			const other = unpack(packed)
			inside = okLabDistance(subjectLab, rgbToOkLab(other)) < sameColorBar(subjectColor, colorFromRgb(other))
			decided.set(packed, inside)
		}
		if (inside) mask[pixel] = 1
	}
	return mask
}

/** 8-connected component labels of a mask; label 0 means "not in the mask". */
function labelComponents(mask: Uint8Array, width: number, height: number): { labels: Int32Array; count: number } {
	const labels = new Int32Array(mask.length)
	const stack: number[] = []
	let count = 0
	for (let start = 0; start < mask.length; start += 1) {
		if (mask[start] === 0 || labels[start] !== 0) continue
		count += 1
		labels[start] = count
		stack.push(start)
		while (stack.length > 0) {
			const current = stack.pop() as number
			const x = current % width
			const y = (current - x) / width
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue
					const nx = x + dx
					const ny = y + dy
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
					const neighbour = ny * width + nx
					if (mask[neighbour] === 0 || labels[neighbour] !== 0) continue
					labels[neighbour] = count
					stack.push(neighbour)
				}
			}
		}
	}
	return { labels, count }
}

/**
 * Attribute one colour to what physically carries it.
 *
 * `inradiusBudget` caps how many components get a distance transform, largest first — a cost guard for
 * the corpus-scale Q3 sweep, where a near-background colour can decompose into tens of thousands of
 * speckles. `maxInradius` is then the maximum over the largest `inradiusBudget` components, which is
 * what every rule in this file reads; it can only *under*-report thickness, never over-report it, so a
 * `antialias-or-halo` verdict under a budget is a lower bound on thinness and never a false alarm in
 * the other direction. `inradiusBudgetBound` records whether the cap bound.
 */
export function attribute(image: DecodedImage, subject: Rgb8, inradiusBudget = Number.POSITIVE_INFINITY): Attribution {
	const width = image.width
	const height = image.height
	const totalPixels = width * height
	const subjectPacked = (subject[0] << 16) | (subject[1] << 8) | subject[2]

	let exactPixels = 0
	for (let pixel = 0; pixel < totalPixels; pixel += 1) if (image.packed[pixel] === subjectPacked) exactPixels += 1

	const mask = barMaskOf(image, subject)
	let barPixels = 0
	for (let pixel = 0; pixel < totalPixels; pixel += 1) barPixels += mask[pixel]

	const { labels, count } = labelComponents(mask, width, height)
	const areas = new Int32Array(count + 1)
	const minX = new Int32Array(count + 1).fill(width)
	const minY = new Int32Array(count + 1).fill(height)
	const maxX = new Int32Array(count + 1).fill(-1)
	const maxY = new Int32Array(count + 1).fill(-1)
	const boundary = new Int32Array(count + 1)
	for (let pixel = 0; pixel < totalPixels; pixel += 1) {
		const label = labels[pixel]
		if (label === 0) continue
		const x = pixel % width
		const y = (pixel - x) / width
		areas[label] += 1
		if (x < minX[label]) minX[label] = x
		if (x > maxX[label]) maxX[label] = x
		if (y < minY[label]) minY[label] = y
		if (y > maxY[label]) maxY[label] = y
		const onBoundary =
			x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
			mask[pixel - 1] === 0 || mask[pixel + 1] === 0 || mask[pixel - width] === 0 || mask[pixel + width] === 0
		if (onBoundary) boundary[label] += 1
	}

	// One distance transform per component, over its own bounding box — the same exact Euclidean
	// transform the text detector reads for stroke width, so an inradius here and a stroke width there
	// are the same measurement.
	const order = Array.from({ length: count }, (_unused, index) => index + 1).sort(
		(first, second) => areas[second] - areas[first] || first - second,
	)
	const measured = order.slice(0, Number.isFinite(inradiusBudget) ? inradiusBudget : order.length)
	const inradius = new Float64Array(count + 1)
	for (const label of measured) {
		const boxWidth = maxX[label] - minX[label] + 1
		const boxHeight = maxY[label] - minY[label] + 1
		if (boxWidth <= 0 || boxHeight <= 0) continue
		const box = new Uint8Array(boxWidth * boxHeight)
		for (let y = 0; y < boxHeight; y += 1) {
			for (let x = 0; x < boxWidth; x += 1) {
				if (labels[(minY[label] + y) * width + (minX[label] + x)] === label) box[y * boxWidth + x] = 1
			}
		}
		const field = distanceFieldOf(box, boxWidth, boxHeight)
		let best = 0
		for (let index = 0; index < field.squared.length; index += 1) if (field.squared[index] > best) best = field.squared[index]
		inradius[label] = Math.sqrt(best)
	}

	const stat = (label: number): ComponentStat => ({
		area: areas[label],
		areaFraction: areas[label] / totalPixels,
		minX: minX[label],
		minY: minY[label],
		maxX: maxX[label],
		maxY: maxY[label],
		inradius: inradius[label],
		boundaryFraction: areas[label] > 0 ? boundary[label] / areas[label] : 1,
	})

	let maxInradius = 0
	let markComponents = 0
	let totalBoundary = 0
	for (const label of measured) {
		if (inradius[label] > maxInradius) maxInradius = inradius[label]
		if (inradius[label] >= CUTS.markComponentInradiusPx) markComponents += 1
	}
	for (let label = 1; label <= count; label += 1) totalBoundary += boundary[label]

	// The outer ring: colours immediately outside the mask, 4-connected.
	const ring = new Map<number, number>()
	for (let pixel = 0; pixel < totalPixels; pixel += 1) {
		if (mask[pixel] === 1) continue
		const x = pixel % width
		const y = (pixel - x) / width
		const touches =
			(x > 0 && mask[pixel - 1] === 1) ||
			(x < width - 1 && mask[pixel + 1] === 1) ||
			(y > 0 && mask[pixel - width] === 1) ||
			(y < height - 1 && mask[pixel + width] === 1)
		if (touches) ring.set(image.packed[pixel], (ring.get(image.packed[pixel]) ?? 0) + 1)
	}
	const subjectLightness = rgbToOkLab(subject)[0]
	let ringTotal = 0
	let darker = 0
	let lighter = 0
	for (const [packed, ringCount] of ring) {
		ringTotal += ringCount
		if (rgbToOkLab(unpack(packed))[0] < subjectLightness) darker += ringCount
		else lighter += ringCount
	}
	const outerRing = Array.from(ring.entries())
		.sort((first, second) => second[1] - first[1] || first[0] - second[0])
		.slice(0, 8)
		.map(([packed, ringCount]) => ({
			hex: colorFromRgb(unpack(packed)).hex,
			count: ringCount,
			lightness: rgbToOkLab(unpack(packed))[0],
		}))

	const largestMass = order.length > 0 ? areas[order[0]] / Math.max(1, barPixels) : 0
	const largestImage = order.length > 0 ? areas[order[0]] / totalPixels : 0
	const largestInradius = order.length > 0 ? inradius[order[0]] : 0

	let verdict: Attribution["verdict"]
	if (maxInradius < CUTS.filamentInradiusPx) verdict = "antialias-or-halo"
	else if (largestMass >= CUTS.scrimMassShare && largestImage >= CUTS.scrimImageShare && largestInradius >= CUTS.scrimInradiusPx)
		verdict = "scrim-or-overlay"
	else if (markComponents >= CUTS.markComponentCount || largestImage < CUTS.scrimImageShare) verdict = "glyph-or-mark-ink"
	else verdict = "other"

	return {
		hex: colorFromRgb(subject).hex,
		rgb: subject,
		exactPixels,
		exactShare: exactPixels / totalPixels,
		barPixels,
		barShare: barPixels / totalPixels,
		componentCount: count,
		maxInradius,
		largestComponentShareOfMass: largestMass,
		largestComponentImageShare: largestImage,
		boundaryFraction: barPixels > 0 ? totalBoundary / barPixels : 1,
		componentsAtOrAboveMarkInradius: markComponents,
		inradiusMeasuredComponents: measured.length,
		inradiusBudgetBound: measured.length < count,
		topComponents: order.slice(0, 5).map(stat),
		outerRing,
		subjectLightness,
		outerRingDarkerShare: ringTotal > 0 ? darker / ringTotal : 0,
		outerRingLighterShare: ringTotal > 0 ? lighter / ringTotal : 0,
		verdict,
		cuts: CUTS,
		provenance: PIXELS_PROVENANCE,
	}
}
