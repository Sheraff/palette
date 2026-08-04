/**
 * A brute-force tree of shapes, and the synthetic images to check it against.
 *
 * **This file shares no code with `tree.ts` on purpose.** It computes shapes the way the definition
 * reads — for every level, take the connected components of the upper and lower level sets, fill
 * their holes, and keep the distinct results — which is O(levels x pixels) and would be useless on a
 * real cover, but is transparently correct on a 6 x 6 one. `tests/brute-force.test.ts` compares the
 * two implementations. An agreement between a quasi-linear union-find and a naive definition is the
 * only evidence available that the fast one is right, because a wrong tree fails *silently*: every
 * node still has an area and a colour and every palette still validates.
 *
 * ## Why the synthetic images are all well-composed
 *
 * On a raw pixel grid, a 2 x 2 window whose two "on" pixels sit on a diagonal is genuinely ambiguous:
 * one region under 8-connectivity, two under 4-connectivity, and the two readings disagree about the
 * tree. `tree.ts` resolves this the way the literature does, by immersing the image in the Khalimsky
 * grid, where the question does not arise. The naive reference has no such device and would have to
 * pick a convention. So the comparison is run on **well-composed** images — those with no such window
 * at any level — where every convention agrees and the comparison is therefore about the algorithm
 * rather than about the tie-break. `isWellComposed` is checked, not assumed, for every fixture.
 */

/**
 * Is every binary level set of this image well-composed?
 *
 * Latecki's criterion, applied per 2 x 2 window: the window is critical exactly when one diagonal's
 * minimum strictly exceeds the other diagonal's maximum, because then some threshold separates the
 * two diagonals and leaves the ambiguous configuration.
 */
export function isWellComposed(levels: ArrayLike<number>, width: number, height: number): boolean {
	for (let y = 0; y + 1 < height; y += 1) {
		for (let x = 0; x + 1 < width; x += 1) {
			const a = levels[y * width + x]
			const b = levels[y * width + x + 1]
			const c = levels[(y + 1) * width + x]
			const d = levels[(y + 1) * width + x + 1]
			if (Math.min(a, d) > Math.max(b, c)) return false
			if (Math.min(b, c) > Math.max(a, d)) return false
		}
	}
	return true
}

/** 4-connected components of a binary mask, as lists of pixel indices. */
function components(mask: Uint8Array, width: number, height: number): number[][] {
	const label = new Int32Array(mask.length).fill(-1)
	const found: number[][] = []
	for (let seed = 0; seed < mask.length; seed += 1) {
		if (mask[seed] === 0 || label[seed] !== -1) continue
		const component: number[] = []
		const stack = [seed]
		label[seed] = found.length
		while (stack.length > 0) {
			const pixel = stack.pop() as number
			component.push(pixel)
			const y = (pixel / width) | 0
			const x = pixel - y * width
			const neighbours = [
				y > 0 ? pixel - width : -1,
				x > 0 ? pixel - 1 : -1,
				x + 1 < width ? pixel + 1 : -1,
				y + 1 < height ? pixel + width : -1,
			]
			for (const neighbour of neighbours) {
				if (neighbour === -1 || mask[neighbour] === 0 || label[neighbour] !== -1) continue
				label[neighbour] = label[seed]
				stack.push(neighbour)
			}
		}
		found.push(component.sort((first, second) => first - second))
	}
	return found
}

/**
 * Fill the holes of a set: everything except the 8-connected components of the complement that reach
 * the image border. 8 for the complement against 4 for the set is the standard dual pairing; on a
 * well-composed image the two agree anyway.
 */
function saturate(component: readonly number[], width: number, height: number): number[] {
	const inside = new Uint8Array(width * height)
	for (const pixel of component) inside[pixel] = 1
	const outside = new Uint8Array(width * height)
	const stack: number[] = []
	const push = (pixel: number): void => {
		if (inside[pixel] === 1 || outside[pixel] === 1) return
		outside[pixel] = 1
		stack.push(pixel)
	}
	for (let x = 0; x < width; x += 1) {
		push(x)
		push((height - 1) * width + x)
	}
	for (let y = 0; y < height; y += 1) {
		push(y * width)
		push(y * width + width - 1)
	}
	while (stack.length > 0) {
		const pixel = stack.pop() as number
		const y = (pixel / width) | 0
		const x = pixel - y * width
		for (let dy = -1; dy <= 1; dy += 1) {
			for (let dx = -1; dx <= 1; dx += 1) {
				const ny = y + dy
				const nx = x + dx
				if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
				push(ny * width + nx)
			}
		}
	}
	const filled: number[] = []
	for (let pixel = 0; pixel < inside.length; pixel += 1) if (outside[pixel] === 0) filled.push(pixel)
	return filled
}

/**
 * The level the exterior sits at: the lower median of the image's own border pixels.
 *
 * **The exterior needs a value, and this is the one convention the reference shares with `tree.ts`.**
 * Without it "tree of shapes" is not a tree at all: on a left-to-right ramp, the component of
 * `{u ≥ 1}` is columns 1–5 and the component of `{u ≤ 2}` is columns 0–2, which overlap with neither
 * containing the other. What makes the collection a tree is that the image is embedded in a larger
 * plane whose value is fixed, so that a component reaching the exterior is not a shape — only the
 * whole domain is. Monasse and Guichard's FLST does exactly this, and the median of the border is the
 * usual choice because it makes the exterior agree with what the picture does at its edge.
 *
 * Sharing a *definition* with the implementation under test is not sharing an implementation: the
 * comparison is still between a union-find over an immersed grid and a literal reading of the words
 * "connected component of a level set, holes filled".
 */
export function exteriorLevel(levels: ArrayLike<number>, width: number, height: number): number {
	const border: number[] = []
	for (let x = 0; x < width; x += 1) {
		border.push(levels[x])
		border.push(levels[(height - 1) * width + x])
	}
	for (let y = 0; y < height; y += 1) {
		border.push(levels[y * width])
		border.push(levels[y * width + width - 1])
	}
	border.sort((first, second) => first - second)
	return border[Math.floor((border.length - 1) / 2)]
}

/**
 * Every distinct shape of the image, as a sorted list of **original** pixel indices, keyed by its own
 * contents.
 *
 * Computed on the image framed by one ring of `exteriorLevel`. A component that swallows the frame is
 * the exterior, not a shape, and is dropped — except the whole framed domain, which is the root and
 * restricts to the whole image.
 */
export function bruteForceShapes(levels: ArrayLike<number>, width: number, height: number): Map<string, number[]> {
	const frameLevel = exteriorLevel(levels, width, height)
	const framedWidth = width + 2
	const framedHeight = height + 2
	const framed = new Int32Array(framedWidth * framedHeight).fill(frameLevel)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) framed[(y + 1) * framedWidth + (x + 1)] = levels[y * width + x]
	}

	let lowest = Number.POSITIVE_INFINITY
	let highest = Number.NEGATIVE_INFINITY
	for (let pixel = 0; pixel < framed.length; pixel += 1) {
		if (framed[pixel] < lowest) lowest = framed[pixel]
		if (framed[pixel] > highest) highest = framed[pixel]
	}

	const shapes = new Map<string, number[]>()
	const wholeImage = Array.from({ length: width * height }, (_unused, index) => index)
	shapes.set(wholeImage.join(","), wholeImage)

	const mask = new Uint8Array(framed.length)
	const isFrame = (pixel: number): boolean => {
		const y = (pixel / framedWidth) | 0
		const x = pixel - y * framedWidth
		return y === 0 || x === 0 || y === framedHeight - 1 || x === framedWidth - 1
	}
	for (let level = lowest; level <= highest; level += 1) {
		for (const direction of ["upper", "lower"] as const) {
			for (let pixel = 0; pixel < mask.length; pixel += 1) {
				mask[pixel] = (direction === "upper" ? framed[pixel] >= level : framed[pixel] <= level) ? 1 : 0
			}
			for (const component of components(mask, framedWidth, framedHeight)) {
				const filled = saturate(component, framedWidth, framedHeight)
				if (filled.some(isFrame)) continue
				const original = filled.map((pixel) => {
					const y = (pixel / framedWidth) | 0
					const x = pixel - y * framedWidth
					return (y - 1) * width + (x - 1)
				})
				original.sort((first, second) => first - second)
				shapes.set(original.join(","), original)
			}
		}
	}
	return shapes
}

/** A tiny deterministic generator. Not used by any algorithm — only to draw test images. */
export function makeRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x100000000
	}
}

export type Fixture = Readonly<{ name: string; width: number; height: number; levels: Int32Array }>

function fromRows(name: string, rows: readonly (readonly number[])[]): Fixture {
	const height = rows.length
	const width = rows[0].length
	const levels = new Int32Array(width * height)
	for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) levels[y * width + x] = rows[y][x]
	return { name, width, height, levels }
}

/** Hand-built cases, each one a structure the parse is supposed to be able to see. */
export function handBuiltFixtures(): Fixture[] {
	return [
		fromRows("single-pixel", [[3]]),
		fromRows("constant", [
			[5, 5, 5],
			[5, 5, 5],
			[5, 5, 5],
		]),
		fromRows("nested-squares", [
			[0, 0, 0, 0, 0, 0],
			[0, 4, 4, 4, 4, 0],
			[0, 4, 9, 9, 4, 0],
			[0, 4, 9, 9, 4, 0],
			[0, 4, 4, 4, 4, 0],
			[0, 0, 0, 0, 0, 0],
		]),
		fromRows("annulus", [
			[1, 1, 1, 1, 1],
			[1, 7, 7, 7, 1],
			[1, 7, 1, 7, 1],
			[1, 7, 7, 7, 1],
			[1, 1, 1, 1, 1],
		]),
		fromRows("horizontal-ramp", [
			[0, 1, 2, 3, 4, 5],
			[0, 1, 2, 3, 4, 5],
			[0, 1, 2, 3, 4, 5],
			[0, 1, 2, 3, 4, 5],
		]),
		fromRows("two-blobs", [
			[2, 2, 2, 2, 2, 2],
			[2, 8, 8, 2, 2, 2],
			[2, 8, 8, 2, 2, 2],
			[2, 2, 2, 2, 0, 0],
			[2, 2, 2, 2, 0, 0],
			[2, 2, 2, 2, 2, 2],
		]),
		fromRows("saddle", [
			[4, 4, 4, 4, 4, 4],
			[4, 9, 9, 4, 4, 4],
			[4, 9, 9, 4, 4, 4],
			[4, 4, 4, 4, 0, 0],
			[4, 4, 4, 4, 0, 0],
			[4, 4, 4, 4, 4, 4],
		]),
		fromRows("bands-and-stripes", [
			[0, 0, 3, 3, 0, 0],
			[0, 0, 3, 3, 0, 0],
			[0, 0, 3, 3, 0, 0],
			[6, 6, 6, 6, 6, 6],
			[6, 6, 6, 6, 6, 6],
			[0, 0, 3, 3, 0, 0],
		]),
		fromRows("border-median-differs", [
			[9, 9, 9, 9],
			[9, 0, 0, 9],
			[9, 0, 0, 9],
			[9, 9, 9, 9],
		]),
	]
}

/**
 * Randomised well-composed images at a handful of levels.
 *
 * The generator is seeded and the ill-composed draws are discarded rather than repaired, so the set
 * of fixtures is a fixed function of the seed — a failing case can be reproduced from the seed and
 * the index alone.
 */
export function randomWellComposedFixtures(seed: number, wanted: number, size: number, levelCount: number): Fixture[] {
	const random = makeRandom(seed)
	const fixtures: Fixture[] = []
	for (let attempt = 0; attempt < 20000 && fixtures.length < wanted; attempt += 1) {
		const levels = new Int32Array(size * size)
		for (let pixel = 0; pixel < levels.length; pixel += 1) levels[pixel] = Math.floor(random() * levelCount)
		if (!isWellComposed(levels, size, size)) continue
		fixtures.push({ name: `random-${seed}-${fixtures.length}`, width: size, height: size, levels })
	}
	return fixtures
}
