import { histogramAnalysis } from "./gradientDetection.ts"
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

// ============================================================================
// BACKGROUND CANDIDATE RANKING
// ============================================================================

/**
 * Rank background candidates by flood filling from the image edges.
 * 
 * Algorithm:
 * 1. Start from all pixels on the image border (edges)
 * 2. Flood fill inward, counting how many edge-connected pixels belong to each centroid
 * 3. Score = number of edge-connected pixels for each centroid
 * 4. Return candidates sorted by score
 * 
 * This ensures we pick colors that actually appear in the background (connected to edges),
 * not colors that only appear in the center (like text).
 */
export type BackgroundCandidate = {
	color: number
	score: number  // Number of edge-connected pixels
	population: number  // Total population in image
}

export function rankBackgroundCandidates(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	centroids: Map<number, number>,
	colorSpace: ColorSpace
): BackgroundCandidate[] {
	const { width, height, channels } = meta
	const totalPixels = width * height

	// Create label map: assign each pixel to its nearest centroid
	const labels = new Uint32Array(totalPixels)
	for (let i = 0; i < totalPixels; i++) {
		const color = colorSpace.toHex(data, i * channels)
		let minDistance = Infinity
		let closest = -1
		for (const centroid of centroids.keys()) {
			const distance = colorSpace.distance(color, centroid)
			if (distance < minDistance) {
				minDistance = distance
				closest = centroid
			}
		}
		labels[i] = closest
	}

	// Count edge pixels for each centroid
	// We use a simpler approach: count border pixels directly, then flood fill inward
	// to find connected background regions
	const edgeConnectedCount = new Map<number, number>()
	const visited = new Uint8Array(totalPixels)

	// First pass: count how many BORDER pixels belong to each centroid
	// This gives us the "edge presence" score
	const borderPixelCount = new Map<number, number>()

	// Count top and bottom rows
	for (let x = 0; x < width; x++) {
		const topLabel = labels[x]
		borderPixelCount.set(topLabel, (borderPixelCount.get(topLabel) || 0) + 1)

		const bottomLabel = labels[(height - 1) * width + x]
		borderPixelCount.set(bottomLabel, (borderPixelCount.get(bottomLabel) || 0) + 1)
	}

	// Count left and right columns (excluding corners already counted)
	for (let y = 1; y < height - 1; y++) {
		const leftLabel = labels[y * width]
		borderPixelCount.set(leftLabel, (borderPixelCount.get(leftLabel) || 0) + 1)

		const rightLabel = labels[y * width + (width - 1)]
		borderPixelCount.set(rightLabel, (borderPixelCount.get(rightLabel) || 0) + 1)
	}

	// Second pass: for each centroid with border presence, flood fill from ALL border pixels
	// to find total connected area. This handles cases where a color appears in multiple
	// disconnected regions on the border.
	for (const [centroid, borderCount] of borderPixelCount) {
		if (borderCount === 0) continue

		// Collect ALL border pixels of this centroid
		const borderPixels: number[] = []

		// Top and bottom rows
		for (let x = 0; x < width; x++) {
			if (labels[x] === centroid) borderPixels.push(x)
			if (labels[(height - 1) * width + x] === centroid) borderPixels.push((height - 1) * width + x)
		}
		// Left and right columns (excluding corners)
		for (let y = 1; y < height - 1; y++) {
			if (labels[y * width] === centroid) borderPixels.push(y * width)
			if (labels[y * width + (width - 1)] === centroid) borderPixels.push(y * width + (width - 1))
		}

		if (borderPixels.length === 0) continue

		// Flood fill from ALL border pixels, summing total area
		let totalCount = 0

		for (const startIdx of borderPixels) {
			if (visited[startIdx]) continue // Already counted in a previous fill

			const stack = [startIdx]

			while (stack.length > 0) {
				const idx = stack.pop()!
				if (visited[idx]) continue
				if (labels[idx] !== centroid) continue

				visited[idx] = 1
				totalCount++

				const x = idx % width
				const y = Math.floor(idx / width)

				if (x > 0) stack.push(idx - 1)
				if (x < width - 1) stack.push(idx + 1)
				if (y > 0) stack.push(idx - width)
				if (y < height - 1) stack.push(idx + width)
			}
		}

		// Score combines border presence and connected region size
		// This favors colors that are both on the border AND form large regions
		edgeConnectedCount.set(centroid, borderCount * 10 + totalCount)
	}

	// Build candidate list with scores
	const candidates: BackgroundCandidate[] = []
	for (const [color, count] of centroids) {
		const edgeScore = edgeConnectedCount.get(color) || 0
		candidates.push({
			color,
			score: edgeScore,
			population: count
		})
	}

	// Sort by edge-connected score (descending)
	candidates.sort((a, b) => b.score - a.score)

	return candidates
}

/**
 * Get the top background candidates.
 * Returns the best candidate plus any others with score >= threshold% of the best.
 * 
 * @param candidates - Sorted candidates from rankBackgroundCandidates
 * @param threshold - Minimum score as percentage of best (0.5 = 50%)
 */
export function getTopBackgroundCandidates(
	candidates: BackgroundCandidate[],
	threshold: number = 0.5
): BackgroundCandidate[] {
	if (candidates.length === 0) return []

	const best = candidates[0]
	if (best.score === 0) {
		// No edge-connected colors found, return top by population
		return candidates.slice(0, 3)
	}

	const minScore = best.score * threshold
	return candidates.filter(c => c.score >= minScore)
}


// ============================================================================
// IMAGE CONTEXT ANALYSIS
// ============================================================================

/**
 * Represents the "context" of an image, used to inform foreground/accent decisions.
 * 
 * Instead of blindly applying the same rules to all images, we first analyze:
 * - Is this a text-heavy image with white/black text?
 * - Is the background colorful or neutral?
 * - Are the salient regions mostly achromatic or chromatic?
 */
export type ImageContext = {
	/** Is the background high-chroma (colorful)? */
	isColorfulBackground: boolean
	/** Ratio of achromatic salient pixels to total salient pixels (0-1) */
	achromaticSaliencyRatio: number
	/** Ratio of chromatic salient pixels to total salient pixels (0-1) */
	chromaticSaliencyRatio: number
	/** The most salient achromatic color (if any) */
	topAchromaticSalient: { color: number, saliency: number } | null
	/** The most salient chromatic color (if any) */
	topChromaticSalient: { color: number, saliency: number } | null
	/** Is achromatic foreground strongly indicated? (text-heavy images) */
	prefersAchromaticForeground: boolean
	/** Is chromatic foreground strongly indicated? (vibrant images) */
	prefersChromaticForeground: boolean
	/** Background chroma value */
	bgChroma: number
	/** Background lightness value */
	bgLightness: number
}

/**
 * Analyze the image to determine its context.
 * This helps make better foreground/accent selection decisions.
 */
export function analyzeImageContext(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace
): ImageContext {
	const ACHROMATIC_THRESHOLD = 8 // Slightly higher for context analysis
	const HIGH_CHROMA_BG_THRESHOLD = 15

	const bgChroma = colorSpace.chroma(background)
	const bgLightness = colorSpace.lightness(background)
	const isColorfulBackground = bgChroma > HIGH_CHROMA_BG_THRESHOLD

	// Analyze salient colors
	let achromaticSaliencySum = 0
	let chromaticSaliencySum = 0
	let totalSaliency = 0

	let topAchromaticSalient: { color: number, saliency: number } | null = null
	let topChromaticSalient: { color: number, saliency: number } | null = null

	for (const [color, saliency] of salientColors) {
		if (color === background) continue
		if (saliency <= 0) continue

		const chroma = colorSpace.chroma(color)
		totalSaliency += saliency

		if (chroma <= ACHROMATIC_THRESHOLD) {
			achromaticSaliencySum += saliency
			if (!topAchromaticSalient || saliency > topAchromaticSalient.saliency) {
				topAchromaticSalient = { color, saliency }
			}
		} else {
			chromaticSaliencySum += saliency
			if (!topChromaticSalient || saliency > topChromaticSalient.saliency) {
				topChromaticSalient = { color, saliency }
			}
		}
	}

	const achromaticSaliencyRatio = totalSaliency > 0 ? achromaticSaliencySum / totalSaliency : 0
	const chromaticSaliencyRatio = totalSaliency > 0 ? chromaticSaliencySum / totalSaliency : 0

	// Determine preferences based on context
	// - Prefer achromatic if: neutral background + high achromatic saliency
	// - Prefer chromatic if: colorful background OR low achromatic saliency

	const prefersAchromaticForeground =
		!isColorfulBackground &&
		achromaticSaliencyRatio > 0.3 &&
		topAchromaticSalient !== null &&
		topAchromaticSalient.saliency > 0.01

	const prefersChromaticForeground =
		isColorfulBackground ||
		(chromaticSaliencyRatio > 0.6 && achromaticSaliencyRatio < 0.2)

	return {
		isColorfulBackground,
		achromaticSaliencyRatio,
		chromaticSaliencyRatio,
		topAchromaticSalient,
		topChromaticSalient,
		prefersAchromaticForeground,
		prefersChromaticForeground,
		bgChroma,
		bgLightness,
	}
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
 * F. Hybrid Method (Context-Aware)
 * 
 * Key insight from testing:
 * - White/black text is common on album covers
 * - But sometimes white/black is just background (like white corners in vvbrown)
 * - Use saliency to distinguish: text edges have high saliency, background corners don't
 * - CRITICAL: On colorful backgrounds, prefer chromatic foregrounds unless achromatic is VERY salient
 * 
 * Strategy:
 * 1. Analyze image context (background type, salient color distribution)
 * 2. If background is colorful AND chromatic colors are salient: prefer chromatic
 * 3. If background is neutral AND achromatic colors are salient: prefer achromatic
 * 4. Otherwise fall back to multi-pass scoring
 */
export function hybridMethod(
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	background: number,
	colorSpace: ColorSpace,
	minContrast: number
): ForegroundResult {
	// Analyze image context first
	const context = analyzeImageContext(centroids, salientColors, background, colorSpace)

	const ACHROMATIC_THRESHOLD = 5
	const SALIENCY_THRESHOLD = 0.015
	const HIGH_SALIENCY_THRESHOLD = 0.04 // Very high saliency = definitely text

	// Collect all candidates with their properties
	const candidates: Array<{
		color: number
		contrast: number
		saliency: number
		chroma: number
		lightness: number
		isAchromatic: boolean
	}> = []

	for (const [color] of centroids) {
		if (color === background) continue

		const contrast = colorSpace.contrast(background, color)
		if (contrast < minContrast) continue

		const chroma = colorSpace.chroma(color)
		const saliency = salientColors.get(color) || 0
		const lightness = colorSpace.lightness(color)

		candidates.push({
			color,
			contrast,
			saliency,
			chroma,
			lightness,
			isAchromatic: chroma <= ACHROMATIC_THRESHOLD
		})
	}

	if (candidates.length === 0) {
		const fallback = fallbackToBlackOrWhite(background, colorSpace)
		return { color: fallback, score: 0, method: 'hybrid (no candidates)' }
	}

	// Find best achromatic and chromatic candidates
	const achromaticCandidates = candidates.filter(c => c.isAchromatic)
		.sort((a, b) => {
			// Sort by saliency first, then contrast
			if (Math.abs(a.saliency - b.saliency) > 0.001) return b.saliency - a.saliency
			return b.contrast - a.contrast
		})

	const chromaticCandidates = candidates.filter(c => !c.isAchromatic)
		.sort((a, b) => {
			// Sort by combined saliency and chroma score
			const scoreA = a.saliency * 100 + a.chroma / 50
			const scoreB = b.saliency * 100 + b.chroma / 50
			return scoreB - scoreA
		})

	const bestAchromatic = achromaticCandidates[0] || null
	const bestChromatic = chromaticCandidates[0] || null

	// Decision logic based on context

	// CASE 1: Colorful background - prefer chromatic unless achromatic is VERY salient
	if (context.isColorfulBackground) {
		// Compare achromatic vs chromatic saliency
		const achromaticSaliency = bestAchromatic?.saliency || 0
		const chromaticSaliency = bestChromatic?.saliency || 0

		// On colorful backgrounds, only prefer achromatic if it's significantly more salient
		// than chromatic options (like actual white text vs colored elements)
		if (bestAchromatic && achromaticSaliency >= HIGH_SALIENCY_THRESHOLD &&
			achromaticSaliency > chromaticSaliency * 2) {
			return {
				color: bestAchromatic.color,
				score: bestAchromatic.contrast,
				method: 'hybrid (high-salient achromatic on colorful bg)'
			}
		}

		// Otherwise prefer chromatic if available and reasonably salient
		if (bestChromatic && chromaticSaliency >= SALIENCY_THRESHOLD * 0.5) {
			return {
				color: bestChromatic.color,
				score: bestChromatic.contrast,
				method: 'hybrid (chromatic on colorful bg)'
			}
		}

		// If chromatic exists but low saliency, check if it's still better than achromatic
		if (bestChromatic && bestAchromatic) {
			// On colorful background, lean toward chromatic unless achromatic has much better contrast
			if (bestChromatic.contrast >= minContrast &&
				(achromaticSaliency < SALIENCY_THRESHOLD || chromaticSaliency >= achromaticSaliency * 0.5)) {
				return {
					color: bestChromatic.color,
					score: bestChromatic.contrast,
					method: 'hybrid (chromatic default on colorful bg)'
				}
			}
		}

		// Last resort: any achromatic
		if (bestAchromatic) {
			return {
				color: bestAchromatic.color,
				score: bestAchromatic.contrast,
				method: 'hybrid (achromatic fallback on colorful bg)'
			}
		}

		// Or any chromatic
		if (bestChromatic) {
			return {
				color: bestChromatic.color,
				score: bestChromatic.contrast,
				method: 'hybrid (chromatic last resort on colorful bg)'
			}
		}
	}

	// CASE 2: Neutral background - prefer achromatic if salient enough
	if (!context.isColorfulBackground) {
		// If we have salient achromatic, use it
		if (bestAchromatic && bestAchromatic.saliency >= SALIENCY_THRESHOLD) {
			return {
				color: bestAchromatic.color,
				score: bestAchromatic.contrast,
				method: 'hybrid (salient achromatic on neutral bg)'
			}
		}

		// If achromatic has good contrast but low saliency, check if chromatic is much better
		if (bestAchromatic && bestChromatic) {
			const chromaticAdvantage = bestChromatic.saliency / (bestAchromatic.saliency + 0.001)

			// Only prefer chromatic if it's significantly more salient
			if (chromaticAdvantage > 3) {
				return {
					color: bestChromatic.color,
					score: bestChromatic.contrast,
					method: 'hybrid (highly salient chromatic on neutral bg)'
				}
			}
		}

		// Default to achromatic with good contrast on neutral backgrounds
		if (bestAchromatic) {
			return {
				color: bestAchromatic.color,
				score: bestAchromatic.contrast,
				method: 'hybrid (achromatic on neutral bg)'
			}
		}

		// Chromatic fallback
		if (bestChromatic) {
			return {
				color: bestChromatic.color,
				score: bestChromatic.contrast,
				method: 'hybrid (chromatic fallback on neutral bg)'
			}
		}
	}

	// Ultimate fallback
	const fallback = fallbackToBlackOrWhite(background, colorSpace)
	return { color: fallback, score: 0, method: 'hybrid (ultimate fallback)' }
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
 * 
 * CONTRAST CONSTRAINTS (matching extractColors.ts):
 * - inner on outer: >= minContrast (enforced in foreground selection)
 * - accent on outer: >= minContrast / 2
 * - inner on third: >= minContrast
 * - accent on third: >= minContrast / 3
 * 
 * Order: accent first (needs only outer contrast), then third (needs accent contrast)
 */
export function computeFullPalette(
	foregroundResult: ForegroundResult,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	outerColors: number[],
	innerColors: number[],
	background: number,
	bgGradient: boolean,
	colorSpace: ColorSpace,
	minContrast: number
): FullPaletteResult {
	const foreground = foregroundResult.color
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)

	const bgLightness = colorSpace.lightness(background)
	const fgLightness = colorSpace.lightness(foreground)

	// =========================================================================
	// STEP 1: Find accent (uses innerColors first, then outerColors as fallback)
	// Constraint: accent on outer >= minContrast / 2
	// =========================================================================
	let maxAccentScore = 0
	let accent = foreground // Default fallback

	// First pass: try innerColors (preferred)
	for (const color of innerColors) {
		if (color === background || color === foreground) continue

		const count = centroids.get(color) || 0
		const prevalence = count / total
		if (prevalence < 0.01) continue // At least 1% of image

		// CONTRAST CONSTRAINT: accent on outer
		const contrastWithOuter = colorSpace.contrast(background, color)
		if (contrastWithOuter < minContrast / 2) continue

		const chroma = colorSpace.chroma(color)
		const distance = colorSpace.distance(color, foreground)
		const saliency = (salientColors.get(color) || 0) / 255 + 1

		const colorLightness = colorSpace.lightness(color)
		const lum = bgLightness > fgLightness
			? 100 - colorLightness
			: colorLightness

		// Same formula as current method
		const score = chroma * distance * (prevalence * 100) * (lum ** 4) * (saliency ** 3)

		if (score > maxAccentScore) {
			maxAccentScore = score
			accent = color
		}
	}

	// Second pass: if no good innerColor accent, try outerColors
	if (accent === foreground) {
		for (const color of outerColors) {
			if (color === background || color === foreground) continue

			const count = centroids.get(color) || 0
			const prevalence = count / total
			if (prevalence < 0.01) continue

			// CONTRAST CONSTRAINT: accent on outer
			const contrastWithOuter = colorSpace.contrast(background, color)
			if (contrastWithOuter < minContrast / 2) continue

			const chroma = colorSpace.chroma(color)
			const distance = colorSpace.distance(color, foreground)
			const saliency = (salientColors.get(color) || 0) / 255 + 1

			const colorLightness = colorSpace.lightness(color)
			const lum = bgLightness > fgLightness
				? 100 - colorLightness
				: colorLightness

			const score = chroma * distance * (prevalence * 100) * (lum ** 4) * (saliency ** 3)

			if (score > maxAccentScore) {
				maxAccentScore = score
				accent = color
			}
		}
	}

	// =========================================================================
	// STEP 2: Find third (uses outerColors, same as current method)
	// Constraints: inner on third >= minContrast, accent on third >= minContrast / 3
	// =========================================================================
	let third = background // Default to same as outer
	let maxThirdScore = 0

	const outerTotal = outerColors.reduce((sum, c) => sum + (centroids.get(c) || 0), 0)

	for (const color of outerColors) {
		if (color === background || color === foreground) continue

		const count = centroids.get(color) || 0
		const prevalence = count / outerTotal
		if (prevalence < 0.111) continue // At least ~11% of outer colors (matches current)

		// CONTRAST CONSTRAINTS
		const contrastWithInner = colorSpace.contrast(color, foreground)
		if (contrastWithInner < minContrast) continue // inner on third

		const contrastWithAccent = colorSpace.contrast(color, accent)
		if (contrastWithAccent < minContrast / 3) continue // accent on third

		// Score: geometric mean of contrasts * prevalence (matches current method)
		const contrastScore = Math.sqrt(contrastWithInner * contrastWithAccent)
		const score = contrastScore * (prevalence * 100)

		if (score > maxThirdScore) {
			maxThirdScore = score
			third = color
		}
	}

	// =========================================================================
	// STEP 3: Verify accent also works on third, re-select if needed
	// =========================================================================
	if (third !== background) {
		const accentOnThirdContrast = colorSpace.contrast(third, accent)
		if (accentOnThirdContrast < minContrast / 3) {
			// Re-select accent with third constraint (check all centroids)
			let newMaxScore = 0
			let newAccent = foreground

			for (const [color, count] of centroids) {
				if (color === background || color === foreground || color === third) continue

				const prevalence = count / total
				if (prevalence < 0.01) continue

				const contrastWithOuter = colorSpace.contrast(background, color)
				if (contrastWithOuter < minContrast / 2) continue

				const contrastWithThird = colorSpace.contrast(third, color)
				if (contrastWithThird < minContrast / 3) continue

				const chroma = colorSpace.chroma(color)
				const distance = colorSpace.distance(color, foreground)
				const saliency = (salientColors.get(color) || 0) / 255 + 1

				const colorLightness = colorSpace.lightness(color)
				const lum = bgLightness > fgLightness
					? 100 - colorLightness
					: colorLightness

				const score = chroma * distance * (prevalence * 100) * (lum ** 4) * (saliency ** 3)

				if (score > newMaxScore) {
					newMaxScore = score
					newAccent = color
				}
			}

			accent = newAccent
		}
	}

	return {
		outer: background,
		inner: foreground,
		third,
		accent,
		bgGradient: false, // Will be computed by caller using histogramAnalysis
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

/**
 * Find the closest centroid to a given color
 */
function findClosestCentroid(color: number, centroids: Map<number, number>, colorSpace: ColorSpace): number {
	let minDistance = Infinity
	let closest = -1
	for (const centroid of centroids.keys()) {
		const distance = colorSpace.distance(color, centroid)
		if (distance < minDistance) {
			minDistance = distance
			closest = centroid
		}
	}
	return closest
}

/**
 * Triplet Method - Selects outer, third, and inner colors together
 * 
 * 1. Builds a spatial adjacency graph of color regions
 * 2. Identifies outer candidates (background colors touching the border)
 * 3. Finds third candidates (gradient neighbors of outer)
 * 4. Scores (outer, third, inner) triplets by population and saliency
 */
export function tripletMethod(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	colorCount: Map<number, number>,
	colorSpace: ColorSpace,
	minContrast: number,
	candidateThreshold: number = 0.5,
): FullPaletteResult {
	const totalPixels = [...centroids.values()].reduce((a, b) => a + b, 0)

	const graph = new Map<number, {
		isEdge: boolean
		neighbors: Set<number>
	}>()

	for (const [color] of centroids) {
		graph.set(color, {
			isEdge: false,
			neighbors: new Set()
		})
	}

	// Flood entire image - assign each pixel to its closest centroid
	const flooded = new Uint32Array(meta.width * meta.height)
	for (let y = 0; y < meta.height; y++) {
		for (let x = 0; x < meta.width; x++) {
			const idx = y * meta.width + x
			const color = colorSpace.toHex(data, idx * meta.channels)
			const nearest = findClosestCentroid(color, centroids, colorSpace)
			flooded[idx] = nearest
		}
	}

	// Determine the largest edge area for each color
	const largestEdgeArea = new Map<number, number>()
	const visited = new Uint8Array(meta.width * meta.height)
	function floodFillEdgeArea(x: number, y: number) {
		const idx = y * meta.width + x
		if (visited[idx]) return
		const stack = [idx]
		let area = 0
		while (stack.length > 0) {
			const idx = stack.pop()!
			if (visited[idx]) continue
			visited[idx] = 1
			area++
			const x = idx % meta.width
			if (x > 0) stack.push(idx - 1)
			if (x < meta.width - 1) stack.push(idx + 1)
			const y = Math.floor(idx / meta.width)
			if (y > 0) stack.push(idx - meta.width)
			if (y < meta.height - 1) stack.push(idx + meta.width)
		}
		const color = flooded[idx]
		largestEdgeArea.set(color, Math.max(largestEdgeArea.get(color) || 0, area))
	}
	for (let y = 0; y < meta.height; y++) {
		floodFillEdgeArea(0, y)
		floodFillEdgeArea(meta.width - 1, y)
	}
	for (let x = 1; x < meta.width - 1; x++) {
		floodFillEdgeArea(x, 0)
		floodFillEdgeArea(x, meta.height - 1)
	}
	{
		const max = Math.max(...largestEdgeArea.values())
		for (const [color, area] of largestEdgeArea) {
			if (area > max * 0.5) {
				graph.get(color)!.isEdge = true
			}
		}
	}

	// build graph
	for (let y = 1; y < meta.height; y++) {
		for (let x = 1; x < meta.width; x++) {
			const idx = y * meta.width + x
			const color = flooded[idx]
			const top = (y - 1) * meta.width + x
			const topNeighbor = flooded[top]
			if (topNeighbor !== color) {
				graph.get(color)!.neighbors.add(topNeighbor)
			}
			const left = y * meta.width + (x - 1)
			const leftNeighbor = flooded[left]
			if (leftNeighbor !== color) {
				graph.get(color)!.neighbors.add(leftNeighbor)
			}
		}
	}

	// Find largest outer candidate (must touch edge = is background)
	let largestOuter = -1
	let largestOuterScore = -Infinity
	for (const [color, node] of graph) {
		if (!node.isEdge) continue // Only consider edge colors as background
		const score = centroids.get(color)!
		if (score > largestOuterScore) {
			largestOuterScore = score
			largestOuter = color
		}
	}

	// Find outer candidates (edge colors with > 50% of largest population)
	const outerCandidates: number[] = []
	for (const [color, node] of graph) {
		if (!node.isEdge) continue // Only consider edge colors
		const score = centroids.get(color)!
		if (score > largestOuterScore * candidateThreshold) {
			outerCandidates.push(color)
		}
	}


	// find third candidates (gradient neighbors of outer candidates)
	const outerThirdPairs = new Map<number, number>()
	const cache = new Map<string, boolean>()
	for (const outer of outerCandidates) {
		const node = graph.get(outer)!
		for (const neighbor of node.neighbors) {
			const isGradient = cache.get(`${neighbor}-${outer}`) ?? histogramAnalysis(outer, neighbor, colorCount, colorSpace)
			cache.set(`${outer}-${neighbor}`, isGradient)
			if (isGradient) {
				outerThirdPairs.set(outer, neighbor)
			}
		}
	}

	let bestTriplet: {
		outer: number
		third?: number
		inner: number
		score: number
	} | null = null

	// find best outer/inner/third triplet
	for (const candidate of outerCandidates) {
		const outerEdgeScore = centroids.get(candidate)! / totalPixels
		const outerLum = colorSpace.lightness(candidate)

		// try with each third candidate
		for (const [outer, third] of outerThirdPairs) {
			if (outer !== candidate) continue
			const thirdLum = colorSpace.lightness(third)
			const thirdScore = centroids.get(third)! / totalPixels
			const outerScore = outerEdgeScore + thirdScore / 2
			for (const [inner] of centroids) {
				if (inner === outer || inner === third) continue
				const outerContrast = colorSpace.contrast(outer, inner)
				if (outerContrast < minContrast) continue
				const thirdContrast = colorSpace.contrast(third, inner)
				if (thirdContrast < minContrast) continue

				// check groupings
				const innerLum = colorSpace.lightness(inner)
				const favorGroupingLighterColors = innerLum > outerLum ? 0.8 : 1.2
				const thirdIsOuter = Math.abs(thirdLum - innerLum) * favorGroupingLighterColors > Math.abs(thirdLum - outerLum)
				if (!thirdIsOuter) continue

				const innerScore = (salientColors.get(inner) || 0) / 255 + 1

				const tripletScore = outerScore * innerScore
				if (!bestTriplet || tripletScore > bestTriplet.score) {
					bestTriplet = {
						outer,
						third,
						inner,
						score: tripletScore
					}
				}
			}
		}

		// try without third candidate
		{
			const outerScore = outerEdgeScore
			for (const [inner] of centroids) {
				if (inner === candidate) continue
				const outerContrast = colorSpace.contrast(candidate, inner)
				if (outerContrast < minContrast) continue

				const innerScore = (salientColors.get(inner) || 0) / 255 + 1

				const pairScore = outerScore * innerScore
				if (!bestTriplet || pairScore > bestTriplet.score) {
					bestTriplet = {
						outer: candidate,
						third: undefined,
						inner,
						score: pairScore
					}
				}
			}
		}
	}

	// Fallback if no triplet found
	if (!bestTriplet) {
		const fallbackOuter = outerCandidates[0] ?? [...centroids.keys()][0]
		const fallbackInner = fallbackToBlackOrWhite(fallbackOuter, colorSpace)
		return {
			outer: fallbackOuter,
			inner: fallbackInner,
			third: fallbackOuter,
			accent: fallbackInner,
			bgGradient: false,
			method: 'triplet (fallback)'
		}
	}


	const { outer, inner } = bestTriplet
	const outerLum = colorSpace.lightness(outer)
	const innerLum = colorSpace.lightness(inner)
	const outerColors: number[] = []
	const innerColors: number[] = []
	{
		const favorGroupingLighterColors = innerLum > outerLum ? 0.8 : 1.2
		for (const color of centroids.keys()) {
			const lum = colorSpace.lightness(color)
			const isOuter = Math.abs(lum - innerLum) * favorGroupingLighterColors > Math.abs(lum - outerLum)
			if (isOuter) {
				outerColors.push(color)
			} else {
				innerColors.push(color)
			}
		}
	}

	// =========================================================================
	// ACCENT SELECTION
	// Score by: chroma * distance * prevalence * lum^4 * saliency^3
	// Require contrast >= minContrast/2 with outer
	// =========================================================================
	let accent = inner // fallback
	let maxAccentScore = 0

	for (const color of innerColors) {
		if (color === outer || color === inner) continue
		const count = centroids.get(color)!
		if (count / totalPixels < 0.01) continue
		if (colorSpace.contrast(outer, color) < minContrast / 2) continue

		const chroma = colorSpace.chroma(color)
		const distance = colorSpace.distance(color, inner)
		const prevalence = (count / totalPixels) * 100
		const saliency = (salientColors.get(color) || 0) / 255 + 1
		const lum = outerLum > innerLum
			? 100 - colorSpace.lightness(color)
			: colorSpace.lightness(color)

		const score = chroma * distance * prevalence * (lum ** 4) * (saliency ** 3)
		if (score > maxAccentScore) {
			maxAccentScore = score
			accent = color
		}
	}

	// =========================================================================
	// THIRD SELECTION (fallback if no gradient-based third)
	// Score by: sqrt(contrastInner * contrastAccent) * prevalence
	// Require contrast >= minContrast with inner, >= minContrast/3 with accent
	// =========================================================================
	let third = bestTriplet.third ?? outer // default to outer if no gradient neighbor

	if (bestTriplet.third === undefined) {
		// Use fallback logic to find a suitable third
		let maxThirdScore = 0
		const outerTotal = outerColors.reduce((sum, c) => sum + (centroids.get(c) || 0), 0)

		for (const color of outerColors) {
			if (color === outer || color === inner) continue
			const count = centroids.get(color) || 0
			if (count / outerTotal < 0.111) continue // Must be >= 11.1% of outer colors

			const contrastInner = colorSpace.contrast(color, inner)
			if (contrastInner < minContrast) continue

			const contrastAccent = colorSpace.contrast(color, accent)
			if (contrastAccent < minContrast / 3) continue

			const contrast = Math.sqrt(contrastInner * contrastAccent)
			const prevalence = (count / outerTotal) * 100
			const score = contrast * prevalence

			if (score > maxThirdScore) {
				maxThirdScore = score
				third = color
			}
		}
	}

	// Compute bgGradient
	const bgGradient = outer === third
		? false
		: bestTriplet.third === undefined
			? histogramAnalysis(outer, third, colorCount, colorSpace)
			: true

	return {
		outer,
		inner,
		third,
		accent,
		bgGradient,
		method: 'triplet'
	}
}


// ============================================================================
// PAIRED METHOD - Joint Outer+Inner Selection
// ============================================================================

/**
 * H. Paired Method - Joint Outer+Inner Selection
 * 
 * Key insight: Sequential selection (outer first, then inner) can lead to "traps"
 * where the chosen outer leaves no good inner options.
 * 
 * Example: birdsofprey
 * - Blue outer + white inner: white has tiny population (face noise) -> bad pair
 * - Pink outer + black inner: both have high population (actual colors) -> good pair
 * 
 * Algorithm:
 * 1. Rank background candidates by flood filling from image edges
 * 2. Take top candidates (best + any with score >= 50% of best)
 * 3. For each candidate outer, find best inner by population + saliency
 * 4. Pick the best (outer, inner) pair
 * 
 * This does NOT rely on pre-computed outerColors/innerColors - it determines
 * background candidates independently using edge flood fill.
 */
export type PairedResult = {
	outer: number
	inner: number
	score: number
	method: string
}

export function pairedMethod(
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	colorSpace: ColorSpace,
	minContrast: number,
	candidateThreshold: number = 0.5 // Take candidates with score >= 50% of best
): PairedResult {
	const totalPixels = [...centroids.values()].reduce((a, b) => a + b, 0)

	// Step 1: Rank background candidates by flood filling from edges
	const allCandidates = rankBackgroundCandidates(data, meta, centroids, colorSpace)

	// Step 2: Get top candidates (best + any with score >= threshold of best)
	const topCandidates = getTopBackgroundCandidates(allCandidates, candidateThreshold)

	// Debug: log candidate info (can be removed later)
	// console.log(`[paired] ${topCandidates.length} outer candidates`)

	if (topCandidates.length === 0) {
		// No candidates found, use first centroid as fallback
		const firstCentroid = centroids.keys().next().value || 0
		return {
			outer: firstCentroid,
			inner: fallbackToBlackOrWhite(firstCentroid, colorSpace),
			score: 0,
			method: 'paired (no candidates)'
		}
	}

	let bestPair: PairedResult = {
		outer: topCandidates[0].color,
		inner: 0,
		score: -Infinity,
		method: 'paired (no valid pair)'
	}

	// Step 3: For each top background candidate, find best foreground
	for (const candidate of topCandidates) {
		const outer = candidate.color
		const outerEdgeScore = candidate.score / totalPixels // Normalize

		// Find all valid inner candidates for this outer
		for (const [inner] of centroids) {
			if (inner === outer) continue

			const contrast = colorSpace.contrast(outer, inner)
			if (contrast < minContrast) continue

			// Get saliency for inner (text detection)
			const innerSaliency = salientColors.get(inner) || 0

			// Unified scoring: outerEdgeScore * innerPopulation * saliencyScore
			// No special cases for achromatic vs chromatic
			const saliencyScore = (innerSaliency / 255) + 0.1
			const pairScore = outerEdgeScore * saliencyScore ** 2

			if (pairScore > bestPair.score) {
				bestPair = {
					outer,
					inner,
					score: pairScore,
					method: 'paired'
				}
			}
		}
	}

	// If no valid pair found, use fallback
	if (bestPair.score === -Infinity) {
		const outer = topCandidates[0].color
		const inner = fallbackToBlackOrWhite(outer, colorSpace)
		return {
			outer,
			inner,
			score: 0,
			method: 'paired (fallback)'
		}
	}

	return bestPair
}


/**
 * Compute full palette for the paired method.
 * 
 * Key difference from computeFullPalette:
 * - Tracks achromatic accents separately so white/black CAN be selected as accent
 * - If foreground is achromatic and no good chromatic accent exists, use foreground
 * 
 * This fixes knuckles where accent should be white (same as foreground).
 */
export function computePairedPalette(
	pairedResult: PairedResult,
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	centroids: Map<number, number>,
	salientColors: Map<number, number>,
	colorSpace: ColorSpace,
	minContrast: number
): FullPaletteResult {
	const { outer, inner } = pairedResult
	const total = [...centroids.values()].reduce((a, b) => a + b, 0)

	// Get background-like colors using edge flood fill ranking
	// (does not rely on pre-computed outerColors)
	const bgCandidates = rankBackgroundCandidates(data, meta, centroids, colorSpace)
	const outerColors = bgCandidates.map(c => c.color)

	const bgLightness = colorSpace.lightness(outer)
	const fgLightness = colorSpace.lightness(inner)
	const fgChroma = colorSpace.chroma(inner)

	const ACHROMATIC_THRESHOLD = 8
	const MIN_CHROMATIC_SCORE = 1000 // Minimum score for chromatic to beat achromatic

	// =========================================================================
	// STEP 1: Find accent - Track chromatic and achromatic separately
	// =========================================================================
	let bestChromaticAccent = { color: inner, score: 0 }
	let bestAchromaticAccent = { color: inner, score: 0 }

	for (const [color, count] of centroids) {
		if (color === outer || color === inner) continue

		const prevalence = count / total
		if (prevalence < 0.01) continue

		// CONTRAST CONSTRAINT: accent on outer >= minContrast / 2
		const contrastWithOuter = colorSpace.contrast(outer, color)
		if (contrastWithOuter < minContrast / 2) continue

		const chroma = colorSpace.chroma(color)
		const distance = colorSpace.distance(color, inner)
		const saliency = (salientColors.get(color) || 0) / 255 + 1
		const colorLightness = colorSpace.lightness(color)

		if (chroma <= ACHROMATIC_THRESHOLD) {
			// ACHROMATIC ACCENT: Score WITHOUT chroma term
			// Use contrast * distance * prevalence * saliency
			const score = contrastWithOuter * distance * (prevalence * 100) * saliency

			if (score > bestAchromaticAccent.score) {
				bestAchromaticAccent = { color, score }
			}
		} else {
			// CHROMATIC ACCENT: Original formula with lum^4
			const lum = bgLightness > fgLightness
				? 100 - colorLightness
				: colorLightness

			const score = chroma * distance * (prevalence * 100) * (lum ** 4) * (saliency ** 3)

			if (score > bestChromaticAccent.score) {
				bestChromaticAccent = { color, score }
			}
		}
	}

	// DECISION: Choose accent
	// - If foreground is achromatic AND chromatic accent is weak: use foreground
	// - Otherwise prefer chromatic if strong enough
	let accent: number

	if (fgChroma <= ACHROMATIC_THRESHOLD) {
		// Achromatic foreground (white/black text)
		if (bestChromaticAccent.score >= MIN_CHROMATIC_SCORE) {
			// Good chromatic accent exists -> use it for visual variety
			accent = bestChromaticAccent.color
		} else {
			// No strong chromatic -> accent = foreground (white stays white)
			accent = inner
		}
	} else {
		// Chromatic foreground -> prefer chromatic accent, fallback to achromatic
		if (bestChromaticAccent.score > 0) {
			accent = bestChromaticAccent.color
		} else if (bestAchromaticAccent.score > 0) {
			accent = bestAchromaticAccent.color
		} else {
			accent = inner
		}
	}

	// =========================================================================
	// STEP 2: Find third (secondary background)
	// Constraints: inner on third >= minContrast, accent on third >= minContrast / 3
	// =========================================================================
	let third = outer // Default to same as outer
	let maxThirdScore = 0

	const outerTotal = outerColors.reduce((sum, c) => sum + (centroids.get(c) || 0), 0)

	for (const color of outerColors) {
		if (color === outer || color === inner) continue

		const count = centroids.get(color) || 0
		const prevalence = count / outerTotal
		if (prevalence < 0.111) continue // At least ~11% of outer colors

		// CONTRAST CONSTRAINTS
		const contrastWithInner = colorSpace.contrast(color, inner)
		if (contrastWithInner < minContrast) continue

		const contrastWithAccent = colorSpace.contrast(color, accent)
		if (contrastWithAccent < minContrast / 3) continue

		// Score: geometric mean of contrasts * prevalence
		const contrastScore = Math.sqrt(contrastWithInner * contrastWithAccent)
		const score = contrastScore * (prevalence * 100)

		if (score > maxThirdScore) {
			maxThirdScore = score
			third = color
		}
	}

	return {
		outer,
		inner,
		third,
		accent,
		bgGradient: false, // Will be computed by caller
		method: pairedResult.method
	}
}
