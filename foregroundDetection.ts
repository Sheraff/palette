import type { ColorSpace } from "./spaces/types.ts"

type Meta = {
	channels: number
	width: number
	height: number
}

export type ForegroundResult = {
	color: number
	score: number
	method: string
}

/**
 * A. Color Consistency Within Salient Regions
 * 
 * Text tends to be a uniform color within its region, while photo edges have varied colors.
 * We identify connected salient components and measure color variance within each.
 * Low-variance salient regions → likely text/logo
 */
export function colorConsistencyMethod(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	saliencyMap: Uint8ClampedArray,
	centroids: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	const { width, height, channels } = meta
	const totalPixels = width * height

	// Threshold saliency to find "salient" pixels
	const saliencyThreshold = 100 // pixels with saliency > this are considered salient

	// Find connected components of salient pixels
	const visited = new Uint8Array(totalPixels)
	const components: Array<{
		pixels: number[]
		colors: Map<number, number>
	}> = []

	const floodFillSalient = (startIdx: number): { pixels: number[], colors: Map<number, number> } => {
		const pixels: number[] = []
		const colors = new Map<number, number>()
		const stack = [startIdx]

		while (stack.length > 0) {
			const idx = stack.pop()!
			if (visited[idx]) continue
			if (saliencyMap[idx] < saliencyThreshold) continue

			visited[idx] = 1
			pixels.push(idx)

			// Get color at this pixel
			const hex = colorSpace.toHex(data, idx * channels)
			colors.set(hex, (colors.get(hex) || 0) + 1)

			const x = idx % width
			const y = Math.floor(idx / width)

			// 4-connected neighbors
			if (x > 0 && !visited[idx - 1] && saliencyMap[idx - 1] >= saliencyThreshold) stack.push(idx - 1)
			if (x < width - 1 && !visited[idx + 1] && saliencyMap[idx + 1] >= saliencyThreshold) stack.push(idx + 1)
			if (y > 0 && !visited[idx - width] && saliencyMap[idx - width] >= saliencyThreshold) stack.push(idx - width)
			if (y < height - 1 && !visited[idx + width] && saliencyMap[idx + width] >= saliencyThreshold) stack.push(idx + width)
		}

		return { pixels, colors }
	}

	// Find all connected components
	for (let i = 0; i < totalPixels; i++) {
		if (visited[i] || saliencyMap[i] < saliencyThreshold) continue
		const component = floodFillSalient(i)
		if (component.pixels.length >= 10) { // minimum component size
			components.push(component)
		}
	}

	// For each component, compute color variance
	const componentScores: Array<{ centroid: number, variance: number, size: number }> = []

	for (const component of components) {
		// Map component colors to centroids
		const centroidCounts = new Map<number, number>()
		for (const [color, count] of component.colors) {
			let minDistance = Infinity
			let closest = -1
			for (const c of centroids.keys()) {
				const d = colorSpace.distance(color, c)
				if (d < minDistance) {
					minDistance = d
					closest = c
				}
			}
			if (closest !== -1) {
				centroidCounts.set(closest, (centroidCounts.get(closest) || 0) + count)
			}
		}

		// Find dominant centroid for this component
		let maxCount = 0
		let dominantCentroid = -1
		for (const [c, count] of centroidCounts) {
			if (count > maxCount) {
				maxCount = count
				dominantCentroid = c
			}
		}

		if (dominantCentroid === -1) continue

		// Compute "variance" as percentage of pixels NOT belonging to dominant centroid
		const total = component.pixels.length
		const variance = 1 - (maxCount / total)

		componentScores.push({
			centroid: dominantCentroid,
			variance,
			size: total
		})
	}

	// Score centroids by how many low-variance (uniform) salient components they dominate
	const centroidScores = new Map<number, number>()
	for (const { centroid, variance, size } of componentScores) {
		if (centroid === background) continue
		if (colorSpace.contrast(background, centroid) < minContrast) continue

		// Low variance = good for text, weight by component size
		const uniformityScore = (1 - variance) * size
		centroidScores.set(centroid, (centroidScores.get(centroid) || 0) + uniformityScore)
	}

	// Find best
	let bestColor = -1
	let bestScore = 0
	for (const [color, score] of centroidScores) {
		if (score > bestScore) {
			bestScore = score
			bestColor = color
		}
	}

	return {
		color: bestColor,
		score: bestScore,
		method: 'colorConsistency'
	}
}


/**
 * B. Spatial Coherence Scoring
 * 
 * Text colors appear in spatially coherent patterns (letters form lines/blocks).
 * Score colors by how "clustered" their salient pixels are spatially.
 */
export function spatialCoherenceMethod(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	saliencyMap: Uint8ClampedArray,
	centroids: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	const { width, height, channels } = meta
	const totalPixels = width * height

	// For each centroid, collect positions of salient pixels
	const centroidPixels = new Map<number, Array<{ x: number, y: number, saliency: number }>>()

	for (let i = 0; i < totalPixels; i++) {
		const saliency = saliencyMap[i]
		if (saliency < 50) continue // only consider salient pixels

		const hex = colorSpace.toHex(data, i * channels)

		// Find closest centroid
		let minDistance = Infinity
		let closest = -1
		for (const c of centroids.keys()) {
			const d = colorSpace.distance(hex, c)
			if (d < minDistance) {
				minDistance = d
				closest = c
			}
		}

		if (closest === -1) continue

		if (!centroidPixels.has(closest)) {
			centroidPixels.set(closest, [])
		}
		centroidPixels.get(closest)!.push({
			x: i % width,
			y: Math.floor(i / width),
			saliency
		})
	}

	// Score each centroid by spatial coherence
	const centroidScores = new Map<number, number>()

	for (const [centroid, pixels] of centroidPixels) {
		if (centroid === background) continue
		if (colorSpace.contrast(background, centroid) < minContrast) continue
		if (pixels.length < 20) continue // need enough pixels

		// Sample pixels to compute average pairwise distance (too expensive to do all)
		const sampleSize = Math.min(100, pixels.length)
		const sampledIndices = new Set<number>()
		while (sampledIndices.size < sampleSize) {
			sampledIndices.add(Math.floor(Math.random() * pixels.length))
		}
		const sampled = [...sampledIndices].map(i => pixels[i])

		// Compute average nearest-neighbor distance (lower = more clustered)
		let totalNNDist = 0
		for (const p1 of sampled) {
			let minDist = Infinity
			for (const p2 of sampled) {
				if (p1 === p2) continue
				const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
				if (dist < minDist) minDist = dist
			}
			totalNNDist += minDist
		}
		const avgNNDist = totalNNDist / sampled.length

		// Lower distance = more clustered = higher score
		// Normalize by image diagonal
		const diagonal = Math.hypot(width, height)
		const clusteringScore = 1 - (avgNNDist / (diagonal * 0.1))

		// Weight by saliency and pixel count
		const totalSaliency = pixels.reduce((sum, p) => sum + p.saliency, 0)
		const score = Math.max(0, clusteringScore) * totalSaliency

		centroidScores.set(centroid, score)
	}

	// Find best
	let bestColor = -1
	let bestScore = 0
	for (const [color, score] of centroidScores) {
		if (score > bestScore) {
			bestScore = score
			bestColor = color
		}
	}

	return {
		color: bestColor,
		score: bestScore,
		method: 'spatialCoherence'
	}
}


/**
 * C. Chroma-Weighted Saliency
 * 
 * Text is often highly saturated to stand out.
 * Weight salient colors by their chroma.
 */
export function chromaWeightedMethod(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	saliencyMap: Uint8ClampedArray,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)

	const scores = new Map<number, number>()

	for (const [color, saliencyDelta] of salientColors) {
		if (color === background) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		const chroma = colorSpace.chroma(color)
		const prevalence = (centroids.get(color) || 0) / total

		// Chroma boost: more saturated colors score higher
		// saliencyDelta is already computed as (salient ratio - overall ratio)
		const chromaBoost = 1 + (chroma / 50) // chroma typically 0-100, so this gives 1-3x boost
		const score = saliencyDelta * chromaBoost * (1 + prevalence * 10)

		scores.set(color, score)
	}

	// Find best
	let bestColor = -1
	let bestScore = 0
	for (const [color, score] of scores) {
		if (score > bestScore) {
			bestScore = score
			bestColor = color
		}
	}

	return {
		color: bestColor,
		score: bestScore,
		method: 'chromaWeighted'
	}
}


/**
 * D. Multi-Pass Refinement
 * 
 * Combine multiple signals:
 * - Saliency delta (current approach) - HIGHEST weight, this is the key signal
 * - Chroma - saturated colors are often intentional foreground
 * - Prevalence - but don't over-weight, small text matters
 * - Contrast - required for readability
 * 
 * Use a balanced scoring formula.
 */
export function multiPassMethod(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)
	const maxSaliency = Math.max(...salientColors.values(), 0.001)

	const scores = new Map<number, { score: number, details: Record<string, number> }>()

	for (const color of centroids.keys()) {
		if (color === background) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		const chroma = colorSpace.chroma(color)
		const prevalence = (centroids.get(color) || 0) / total
		const saliencyDelta = salientColors.get(color) || 0
		const normalizedSaliency = saliencyDelta / maxSaliency

		// Normalize each factor to roughly 0-1 range
		const contrastScore = contrast / 100 // APCA is 0-100
		const chromaScore = Math.min(1, chroma / 25) // typical chroma is 0-25
		const prevalenceScore = Math.min(1, prevalence * 5) // cap prevalence influence
		const saliencyScore = Math.max(0, normalizedSaliency)

		// REVISED weights: saliency is king, prevalence is reduced
		// Rationale: small text creates high saliency but low prevalence
		const weights = {
			contrast: 0.20,
			chroma: 0.15,
			prevalence: 0.15, // reduced from 0.25
			saliency: 0.50   // increased from 0.30
		}

		const score =
			contrastScore * weights.contrast +
			chromaScore * weights.chroma +
			prevalenceScore * weights.prevalence +
			saliencyScore * weights.saliency

		scores.set(color, {
			score,
			details: {
				contrast: contrastScore * weights.contrast,
				chroma: chromaScore * weights.chroma,
				prevalence: prevalenceScore * weights.prevalence,
				saliency: saliencyScore * weights.saliency
			}
		})
	}

	// Find best
	let bestColor = -1
	let bestScore = 0
	for (const [color, { score }] of scores) {
		if (score > bestScore) {
			bestScore = score
			bestColor = color
		}
	}

	return {
		color: bestColor,
		score: bestScore,
		method: 'multiPass'
	}
}


/**
 * E. Saliency-First with Tiebreaker
 * 
 * Start with saliency delta (like original), but when multiple colors
 * have similar saliency, use chroma as tiebreaker.
 * This preserves original's strength while adding a fallback.
 */
export function saliencyFirstMethod(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	// Get all valid candidates with contrast
	const candidates: Array<{ color: number, saliency: number, chroma: number, contrast: number }> = []

	for (const [color, saliencyDelta] of salientColors) {
		if (color === background) continue
		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		candidates.push({
			color,
			saliency: saliencyDelta,
			chroma: colorSpace.chroma(color),
			contrast
		})
	}

	if (candidates.length === 0) {
		return { color: -1, score: 0, method: 'saliencyFirst' }
	}

	// Sort by saliency first
	candidates.sort((a, b) => b.saliency - a.saliency)

	const topSaliency = candidates[0].saliency

	// Find all candidates within 20% of top saliency (near-ties)
	const nearTies = candidates.filter(c => c.saliency >= topSaliency * 0.8)

	if (nearTies.length === 1) {
		// Clear winner
		return {
			color: nearTies[0].color,
			score: nearTies[0].saliency,
			method: 'saliencyFirst'
		}
	}

	// Tiebreaker: prefer higher chroma among near-ties
	nearTies.sort((a, b) => b.chroma - a.chroma)

	return {
		color: nearTies[0].color,
		score: nearTies[0].saliency,
		method: 'saliencyFirst'
	}
}


/**
 * F. Hybrid Method
 * 
 * Key insight from testing:
 * - White/black text is common on album covers
 * - But sometimes white/black is just background (like white corners in vvbrown)
 * - Use saliency to distinguish: text edges have high saliency, background corners don't
 * 
 * Strategy:
 * 1. Find the best white/black candidate with reasonable saliency
 * 2. If found and has good saliency (above threshold), prefer it
 * 3. Otherwise use multi-pass for chromatic foregrounds
 */
export function hybridMethod(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	const ACHROMATIC_THRESHOLD = 5
	const SALIENCY_THRESHOLD = 0.02 // Minimum saliency for white/black to be considered "text"

	// Find best white/black candidate
	let bestWB: { color: number, contrast: number, saliency: number, lightness: number } | null = null
	for (const [color] of centroids) {
		if (color === background) continue

		const chroma = colorSpace.chroma(color)
		if (chroma > ACHROMATIC_THRESHOLD) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		const saliency = salientColors.get(color) || 0
		const lightness = colorSpace.lightness(color)

		// Prefer higher saliency, then higher contrast
		if (!bestWB || saliency > bestWB.saliency ||
			(saliency === bestWB.saliency && contrast > bestWB.contrast)) {
			bestWB = { color, contrast, saliency, lightness }
		}
	}

	// If we have a white/black with good saliency, use it
	// This catches actual text (high edge saliency) vs background corners (low saliency)
	if (bestWB && bestWB.saliency >= SALIENCY_THRESHOLD) {
		return {
			color: bestWB.color,
			score: bestWB.contrast,
			method: 'hybrid (salient white/black)'
		}
	}

	// If white/black has reasonable contrast but low saliency, it might still be text
	// that didn't get high saliency due to anti-aliasing or small size
	// Just require it passes the minimum contrast threshold
	if (bestWB && bestWB.contrast >= minContrast) {
		return {
			color: bestWB.color,
			score: bestWB.contrast,
			method: 'hybrid (contrasted white/black)'
		}
	}

	// Fall back to multi-pass for chromatic foregrounds
	const multiResult = multiPassMethod(centroids, salientColors, background, colorSpace, minContrast)
	return { ...multiResult, method: 'hybrid (chromatic fallback)' }
}


/**
 * Original method (current implementation) - saliency delta only
 */
export function originalMethod(
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number,
	centroids?: Map<number, number>
): ForegroundResult {
	const sorted = Array.from(salientColors.entries())
		.sort((a, b) => b[1] - a[1])

	const contrasted = sorted.find(([color]) =>
		colorSpace.contrast(background, color) >= minContrast
	)

	if (contrasted) {
		return {
			color: contrasted[0],
			score: contrasted[1],
			method: 'original'
		}
	}

	// Fallback: check centroids directly (catches forced white/black that aren't in salientColors)
	if (centroids) {
		const centroidsSorted = Array.from(centroids.entries())
			.filter(([c]) => c !== background && colorSpace.contrast(background, c) >= minContrast)
			.sort((a, b) => b[1] - a[1])

		if (centroidsSorted.length > 0) {
			const [color, count] = centroidsSorted[0]
			return {
				color,
				score: count,
				method: 'original (centroid fallback)'
			}
		}
	}

	return {
		color: -1,
		score: 0,
		method: 'original'
	}
}


/**
 * Run all foreground detection methods and return results for comparison
 */
export function detectForegroundAllMethods(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	saliencyMap: Uint8ClampedArray,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): Record<string, ForegroundResult> {
	// Run all methods
	const results: Record<string, ForegroundResult> = {
		original: originalMethod(salientColors, background, colorSpace, minContrast, centroids),
		hybrid: hybridMethod(centroids, salientColors, background, colorSpace, minContrast),
		multiPass: multiPassMethod(centroids, salientColors, background, colorSpace, minContrast),
		chromaWeighted: chromaWeightedMethod(data, meta, saliencyMap, centroids, salientColors, background, colorSpace, minContrast),
	}

	// For any method that returned -1 (no color found), use fallback
	const fallback = fallbackToBlackOrWhite(background, colorSpace)
	const fallbackContrast = colorSpace.contrast(background, fallback)

	for (const [method, result] of Object.entries(results)) {
		if (result.color === -1) {
			results[method] = {
				color: fallback,
				score: fallbackContrast,
				method: result.method + ' (fallback to ' + (colorSpace.lightness(fallback) > 50 ? 'white' : 'black') + ')'
			}
		}
	}

	return results
}


/**
 * Fallback to black or white when no suitable foreground color is found
 */
export function fallbackToBlackOrWhite(
	background: number,
	colorSpace: ColorSpace
): number {
	const white = colorSpace.toHex([255, 255, 255], 0)
	const black = colorSpace.toHex([0, 0, 0], 0)
	const cw = colorSpace.contrast(background, white)
	const cb = colorSpace.contrast(background, black)
	return cw > cb ? white : black
}


/**
 * G. Vibrant-style Target Selection
 * 
 * Inspired by Android's Palette API / node-vibrant.
 * Instead of detecting "salient" regions, we select colors based on predefined targets.
 * 
 * For each color, compute how well it matches a "role":
 * - Foreground: High contrast with background + (prefer high chroma OR achromatic)
 * - Accent: Different hue from foreground + high chroma + good contrast
 * - Third (secondary bg): Similar lightness to background + different from background
 * 
 * This approach works well because it's goal-oriented rather than detection-based.
 */
export type VibrantPalette = {
	foreground: number
	accent: number
	third: number
	method: string
}

export function vibrantMethod(
	centroids: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): VibrantPalette {
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)
	const bgLightness = colorSpace.lightness(background)
	const bgChroma = colorSpace.chroma(background)
	const bgHue = colorSpace.hue(background)

	// Prepare candidate list with computed properties
	const candidates: Array<{
		color: number
		contrast: number
		chroma: number
		lightness: number
		hue: number
		population: number
		isAchromatic: boolean
	}> = []

	for (const [color, count] of centroids) {
		if (color === background) continue

		const contrast = colorSpace.contrast(background, color)
		const chroma = colorSpace.chroma(color)
		const lightness = colorSpace.lightness(color)
		const hue = colorSpace.hue(color)

		candidates.push({
			color,
			contrast,
			chroma,
			lightness,
			hue,
			population: count / total,
			isAchromatic: chroma <= 5
		})
	}

	if (candidates.length === 0) {
		const fallback = fallbackToBlackOrWhite(background, colorSpace)
		return {
			foreground: fallback,
			accent: fallback,
			third: background,
			method: 'vibrant (no candidates)'
		}
	}

	// === FOREGROUND SELECTION ===
	// Target: Maximum contrast, prefer achromatic (white/black text) or high chroma
	let foreground = -1
	let bestFgScore = -Infinity

	for (const c of candidates) {
		if (c.contrast < minContrast) continue

		// Score components:
		// - Contrast is king (0-100 → 0-1)
		// - Achromatic bonus (text is often white/black)
		// - High chroma bonus (or vibrant colored text)
		const contrastScore = c.contrast / 100
		const achromaticBonus = c.isAchromatic ? 0.3 : 0
		const chromaBonus = c.isAchromatic ? 0 : Math.min(0.2, c.chroma / 100)

		// Slight population boost (text needs some presence but not dominant)
		const populationBonus = Math.min(0.1, c.population)

		const score = contrastScore + achromaticBonus + chromaBonus + populationBonus

		if (score > bestFgScore) {
			bestFgScore = score
			foreground = c.color
		}
	}

	if (foreground === -1) {
		foreground = fallbackToBlackOrWhite(background, colorSpace)
	}

	const fgHue = colorSpace.hue(foreground)
	const fgChroma = colorSpace.chroma(foreground)

	// === ACCENT SELECTION ===
	// Target: High chroma, different hue from foreground, good contrast with background
	let accent = -1
	let bestAccentScore = -Infinity

	for (const c of candidates) {
		if (c.color === foreground) continue
		if (c.contrast < minContrast * 0.7) continue // slightly lower threshold for accent

		// Hue difference from foreground (prefer different)
		const hueDiff = Math.abs(c.hue - fgHue)
		const normalizedHueDiff = Math.min(hueDiff, 360 - hueDiff) / 180 // 0-1

		// Score components:
		// - High chroma is good for accent
		// - Different hue from foreground
		// - Reasonable contrast
		const chromaScore = Math.min(1, c.chroma / 30)
		const hueDiffScore = fgChroma < 5 ? 0.5 : normalizedHueDiff // if fg is achromatic, any hue is fine
		const contrastScore = Math.min(1, c.contrast / 50)

		const score = chromaScore * 0.4 + hueDiffScore * 0.3 + contrastScore * 0.3

		if (score > bestAccentScore) {
			bestAccentScore = score
			accent = c.color
		}
	}

	if (accent === -1) {
		accent = foreground // fallback to same as foreground
	}

	// === THIRD (SECONDARY BACKGROUND) SELECTION ===
	// Target: Similar to background but distinguishable, for gradient or secondary sections
	let third = -1
	let bestThirdScore = -Infinity

	for (const c of candidates) {
		if (c.color === foreground || c.color === accent) continue

		// Lightness similarity to background (secondary bg should be similar lightness)
		const lightnessDiff = Math.abs(c.lightness - bgLightness)
		const lightnessSimilarity = 1 - Math.min(1, lightnessDiff / 30)

		// But must be distinguishable
		const colorDistance = colorSpace.distance(background, c.color)
		const distinguishable = colorDistance > 5 ? 1 : colorDistance / 5

		// Low contrast with background is actually good for secondary bg
		const lowContrastBonus = c.contrast < 30 ? 0.3 : 0

		const score = lightnessSimilarity * 0.4 + distinguishable * 0.4 + lowContrastBonus * 0.2

		if (score > bestThirdScore) {
			bestThirdScore = score
			third = c.color
		}
	}

	if (third === -1) {
		third = background // fallback to same as background
	}

	return {
		foreground,
		accent,
		third,
		method: 'vibrant'
	}
}


/**
 * Complete palette result for comparison
 */
export type FullPaletteResult = {
	outer: number      // background
	inner: number      // foreground  
	third: number      // secondary background
	accent: number     // accent color
	bgGradient: boolean
	method: string
}

/**
 * Compute full palette using a specific foreground method
 */
export function computeFullPalette(
	foregroundResult: ForegroundResult,
	centroids: Map<number, number>,
	background: number,
	third: number,
	bgGradient: boolean,
	colorSpace: ColorSpace,
	minContrast: number
): FullPaletteResult {
	const foreground = foregroundResult.color
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)

	// Find accent: high chroma, different from fg, good contrast with bg
	const fgHue = colorSpace.hue(foreground)
	const fgChroma = colorSpace.chroma(foreground)

	let accent = foreground
	let bestAccentScore = -Infinity

	for (const [color] of centroids) {
		if (color === background || color === foreground) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast * 0.7) continue

		const chroma = colorSpace.chroma(color)
		const hue = colorSpace.hue(color)

		// Hue difference from foreground
		const hueDiff = Math.abs(hue - fgHue)
		const normalizedHueDiff = Math.min(hueDiff, 360 - hueDiff) / 180

		const chromaScore = Math.min(1, chroma / 30)
		const hueDiffScore = fgChroma < 5 ? 0.5 : normalizedHueDiff
		const contrastScore = Math.min(1, contrast / 50)

		const score = chromaScore * 0.4 + hueDiffScore * 0.3 + contrastScore * 0.3

		if (score > bestAccentScore) {
			bestAccentScore = score
			accent = color
		}
	}

	return {
		outer: background,
		inner: foreground,
		third,
		accent,
		bgGradient,
		method: foregroundResult.method
	}
}


/**
 * H. Unified Method - Best of All Approaches
 * 
 * Combines the strengths of:
 * - hybrid: achromatic text detection (white/black text)
 * - current: accent selection with saliency weighting
 * - vibrant: "third = outer" when no suitable secondary background
 * 
 * Key improvements:
 * - When outer is high-chroma, deprioritize achromatic foregrounds (fixes birdsofprey)
 * - Third defaults to outer when no suitable secondary bg exists (fixes black.jpg)
 * - Accent prefers high-chroma colors (fixes skap, greenday)
 */
export type UnifiedPaletteResult = {
	outer: number
	inner: number
	third: number
	accent: number
	method: string
}

export function unifiedMethod(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	outerColors: number[],
	innerColors: number[],
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): UnifiedPaletteResult {
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)
	const bgChroma = colorSpace.chroma(background)
	const bgLightness = colorSpace.lightness(background)

	// =========================================================================
	// FOREGROUND SELECTION
	// Combines hybrid's achromatic detection with chromatic awareness
	// =========================================================================
	const foreground = selectUnifiedForeground(
		centroids,
		salientColors,
		background,
		bgChroma,
		colorSpace,
		minContrast
	)

	// =========================================================================
	// THIRD (SECONDARY BACKGROUND) SELECTION
	// Uses "same as outer" fallback when no suitable secondary bg
	// =========================================================================
	const third = selectUnifiedThird(
		centroids,
		outerColors,
		background,
		foreground,
		colorSpace,
		minContrast,
		total
	)

	// =========================================================================
	// ACCENT SELECTION
	// Prefers high-chroma colors, uses saliency and distance from foreground
	// =========================================================================
	const accent = selectUnifiedAccent(
		centroids,
		innerColors,
		salientColors,
		background,
		foreground,
		colorSpace,
		minContrast,
		total,
		bgLightness
	)

	return {
		outer: background,
		inner: foreground,
		third,
		accent,
		method: 'unified'
	}
}


/**
 * Unified foreground selection
 * 
 * Priority:
 * 1. If background is low-chroma: prefer achromatic with high saliency (hybrid's strength)
 * 2. If background is high-chroma: prefer chromatic foreground (birdsofprey fix)
 * 3. Fallback to highest contrast achromatic
 * 4. Ultimate fallback to black/white
 */
function selectUnifiedForeground(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	bgChroma: number,
	colorSpace: ColorSpace,
	minContrast: number
): number {
	const ACHROMATIC_THRESHOLD = 5
	const HIGH_CHROMA_BG_THRESHOLD = 20
	const SALIENCY_THRESHOLD = 0.02

	// Collect all valid candidates
	const achromaticCandidates: Array<{
		color: number
		contrast: number
		saliency: number
		lightness: number
	}> = []

	const chromaticCandidates: Array<{
		color: number
		contrast: number
		saliency: number
		chroma: number
	}> = []

	for (const [color] of centroids) {
		if (color === background) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		const chroma = colorSpace.chroma(color)
		const saliency = salientColors.get(color) || 0

		if (chroma <= ACHROMATIC_THRESHOLD) {
			achromaticCandidates.push({
				color,
				contrast,
				saliency,
				lightness: colorSpace.lightness(color)
			})
		} else {
			chromaticCandidates.push({
				color,
				contrast,
				saliency,
				chroma
			})
		}
	}

	// Strategy depends on background chroma
	if (bgChroma > HIGH_CHROMA_BG_THRESHOLD) {
		// High-chroma background: prefer chromatic foreground (like birdsofprey)
		// This is because colorful backgrounds often have colored text/graphics

		// First try chromatic candidates with good saliency
		chromaticCandidates.sort((a, b) => {
			// Score by saliency first, then contrast
			const scoreA = a.saliency * 1000 + a.contrast
			const scoreB = b.saliency * 1000 + b.contrast
			return scoreB - scoreA
		})

		if (chromaticCandidates.length > 0 && chromaticCandidates[0].saliency >= SALIENCY_THRESHOLD) {
			return chromaticCandidates[0].color
		}

		// Fall back to achromatic if no good chromatic candidate
		achromaticCandidates.sort((a, b) => b.contrast - a.contrast)
		if (achromaticCandidates.length > 0) {
			return achromaticCandidates[0].color
		}
	} else {
		// Low-chroma background: prefer achromatic (white/black text) - hybrid's strength

		// Find best achromatic by saliency, then contrast
		achromaticCandidates.sort((a, b) => {
			if (a.saliency !== b.saliency) return b.saliency - a.saliency
			return b.contrast - a.contrast
		})

		// If we have a salient achromatic, use it
		if (achromaticCandidates.length > 0 &&
			(achromaticCandidates[0].saliency >= SALIENCY_THRESHOLD || achromaticCandidates[0].contrast >= minContrast)) {
			return achromaticCandidates[0].color
		}

		// Otherwise, try chromatic candidates
		chromaticCandidates.sort((a, b) => {
			const scoreA = a.saliency * 1000 + a.contrast
			const scoreB = b.saliency * 1000 + b.contrast
			return scoreB - scoreA
		})

		if (chromaticCandidates.length > 0) {
			return chromaticCandidates[0].color
		}

		// Fall back to any achromatic
		if (achromaticCandidates.length > 0) {
			return achromaticCandidates[0].color
		}
	}

	// Ultimate fallback
	return fallbackToBlackOrWhite(background, colorSpace)
}


/**
 * Unified third (secondary background) selection
 * 
 * Key improvement: If no suitable secondary background exists, return outer (background)
 * This fixes black.jpg where current method picks purple instead of black
 */
function selectUnifiedThird(
	centroids: Map<number, number>,
	outerColors: number[],
	background: number,
	foreground: number,
	colorSpace: ColorSpace,
	minContrast: number,
	total: number
): number {
	const MIN_PREVALENCE = 0.05 // Must be at least 5% of outer colors
	const MIN_DISTANCE = 8 // Must be distinguishable from background

	const outerTotal = outerColors.reduce((sum, c) => sum + (centroids.get(c) || 0), 0)

	let bestThird = -1
	let bestScore = -Infinity

	for (const color of outerColors) {
		if (color === background || color === foreground) continue

		const count = centroids.get(color) || 0
		const prevalence = count / outerTotal
		if (prevalence < MIN_PREVALENCE) continue

		// Must have enough contrast with foreground
		const contrastFg = colorSpace.contrast(color, foreground)
		if (contrastFg < minContrast) continue

		// Must be distinguishable from background
		const distanceBg = colorSpace.distance(color, background)
		if (distanceBg < MIN_DISTANCE) continue

		// Score: prefer similar lightness to background + higher prevalence
		const bgLightness = colorSpace.lightness(background)
		const colorLightness = colorSpace.lightness(color)
		const lightnessSimilarity = 1 - Math.abs(colorLightness - bgLightness) / 100

		const score = lightnessSimilarity * 0.5 + prevalence * 0.5

		if (score > bestScore) {
			bestScore = score
			bestThird = color
		}
	}

	// KEY FIX: If no suitable third found, return background itself
	// This is vibrant's approach - better than picking a random color
	if (bestThird === -1) {
		return background
	}

	return bestThird
}


/**
 * Unified accent selection
 * 
 * Key improvement: Strong preference for high-chroma colors
 * This fixes skap (brown→red) and greenday (pink→red)
 */
function selectUnifiedAccent(
	centroids: Map<number, number>,
	innerColors: number[],
	salientColors: Map<number, number>,
	background: number,
	foreground: number,
	colorSpace: ColorSpace,
	minContrast: number,
	total: number,
	bgLightness: number
): number {
	const MIN_PREVALENCE = 0.01 // Must be at least 1% of image
	const CHROMA_BOOST_THRESHOLD = 25 // Colors above this get significant boost

	const fgLightness = colorSpace.lightness(foreground)

	let bestAccent = foreground // fallback
	let bestScore = -Infinity

	// Also track the best high-chroma option separately
	let bestHighChroma = -1
	let bestHighChromaScore = -Infinity

	for (const color of innerColors) {
		if (color === background || color === foreground) continue

		const count = centroids.get(color) || 0
		const prevalence = count / total
		if (prevalence < MIN_PREVALENCE) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast / 2) continue

		const chroma = colorSpace.chroma(color)
		const distance = colorSpace.distance(color, foreground)
		const saliency = (salientColors.get(color) || 0) / 255 + 1

		// Lightness score: prefer colors that contrast well with background
		const colorLightness = colorSpace.lightness(color)
		const lightnessScore = bgLightness > fgLightness
			? (100 - colorLightness) / 100
			: colorLightness / 100

		// Base score (similar to current method)
		const score = chroma * distance * prevalence * (lightnessScore ** 4) * (saliency ** 3)

		if (score > bestScore) {
			bestScore = score
			bestAccent = color
		}

		// Track high-chroma option with boosted scoring
		if (chroma >= CHROMA_BOOST_THRESHOLD) {
			// For high-chroma colors, we value chroma more heavily
			const chromaBoostedScore = score * (1 + chroma / 50)
			if (chromaBoostedScore > bestHighChromaScore) {
				bestHighChromaScore = chromaBoostedScore
				bestHighChroma = color
			}
		}
	}

	// KEY FIX: Prefer high-chroma accent if available and reasonably scored
	// This prefers saturated red over muted brown
	if (bestHighChroma !== -1) {
		const bestAccentChroma = colorSpace.chroma(bestAccent)

		// If best accent is low-chroma but we have a high-chroma alternative,
		// prefer the high-chroma one even if score is slightly lower
		if (bestAccentChroma < CHROMA_BOOST_THRESHOLD) {
			return bestHighChroma
		}

		// If both are high-chroma, pick the one with better score
		if (bestHighChromaScore >= bestScore * 0.7) {
			return bestHighChroma
		}
	}

	return bestAccent
}
