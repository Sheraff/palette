import {
	chroma,
	contrastRatio,
	labAt,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import type { Candidate } from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, OKLab, Palette, PaletteMetrics, RGB, RoleColor } from "./types.ts"

type Mode = "spatial" | "expressive"

type Selection = {
	background: Candidate
	foreground: Candidate
	surface: Candidate
	accent: Candidate
	score: number
	gradientHint?: boolean
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const minimumAccentRoleDistance = 0.025
export const minimumForegroundBackgroundContrast = 3
export const minimumForegroundSurfaceContrast = 2.5

function hasStrongTypographyEvidence(candidate: Candidate): boolean {
	return !candidate.generated && candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

function foregroundBackgroundContrast(candidate: Candidate): number {
	if (candidate.generated) return 4.5
	return hasStrongTypographyEvidence(candidate) ? minimumForegroundBackgroundContrast : 4
}

function foregroundSurfaceContrast(candidate: Candidate, background: Candidate, allowRepresentativeSurface = false): number {
	if (candidate.generated) return 4.5
	const backgroundContrast = contrastRatio(candidate.rgb, background.rgb)
	if (hasStrongTypographyEvidence(candidate) && backgroundContrast < 4.5) return minimumForegroundSurfaceContrast
	return backgroundContrast < 4.5 || allowRepresentativeSurface ? 3 : 4.5
}

function sourceForegroundPool(candidates: Candidate[], background: Candidate): Candidate[] {
	const standard = candidates.filter((candidate) =>
		candidate.id !== background.id && contrastRatio(background.rgb, candidate.rgb) >= 4.5)
	const eligible = candidates.filter((candidate) =>
		candidate.id !== background.id &&
		contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundContrast(candidate))
	return standard.length > 0
		? eligible.filter((candidate) => contrastRatio(background.rgb, candidate.rgb) >= 4.5 || hasStrongTypographyEvidence(candidate))
		: eligible
}

function hasMultipleBackgroundFields(candidates: Candidate[], background: Candidate): boolean {
	const alternatives = candidates.filter((candidate) =>
		candidate.id !== background.id && candidate.population >= 0.15 && candidate.background >= 0.4 &&
		okDistance(candidate.lab, background.lab) >= 0.08)
	return alternatives.length >= 2
}

function stableColorKey(candidate: Candidate): string {
	return candidate.rgb.map((channel) => Math.floor(channel / 16).toString(16)).join("")
}

function stableSelectionKey(selection: Selection): string {
	return [selection.background, selection.foreground, selection.surface, selection.accent]
		.map(stableColorKey)
		.join(":")
}

function isBetterSelection(candidate: Selection, current: Selection | undefined): boolean {
	if (!current) return true
	const scoreResolution = 0.05
	const candidateBucket = Math.floor(candidate.score / scoreResolution)
	const currentBucket = Math.floor(current.score / scoreResolution)
	if (candidateBucket !== currentBucket) return candidateBucket > currentBucket
	return stableSelectionKey(candidate) < stableSelectionKey(current)
}

function generatedCandidate(rgb: RGB, id: number): Candidate {
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: 0,
		background: 0,
		saliency: 0,
		text: 0,
		chroma: chroma(lab),
		generated: true,
		regionIds: [],
	}
}

function backgroundScore(candidate: Candidate, maxPopulation: number): number {
	const population = Math.sqrt(candidate.population / Math.max(maxPopulation, 1e-9))
	const generatedPenalty = candidate.generated ? 0.02 : 0
	const lightChromaPenalty = candidate.lab[0] > 0.9 ? clamp01(candidate.chroma / 0.08) * 0.12 : 0
	return candidate.background * 0.5 + population * 0.3 + (1 - candidate.saliency) * 0.15 +
		(1 - candidate.text) * 0.05 - generatedPenalty - lightChromaPenalty
}

function foregroundScore(
	candidate: Candidate,
	background: Candidate,
	maxPopulation: number,
	mode: Mode,
): number {
	const ratio = contrastRatio(background.rgb, candidate.rgb)
	const minimumContrast = ratio >= 4.5 ? 4.5 : foregroundBackgroundContrast(candidate)
	const contrast = clamp01((ratio - minimumContrast) / (10 - minimumContrast))
	const population = Math.sqrt(candidate.population / Math.max(maxPopulation, 1e-9))
	const source = candidate.generated ? 0 : 1
	const achromatic = clamp01(1 - candidate.chroma / 0.045)
	const extreme = Math.abs(candidate.lab[0] - 0.5) * 2
	const sourceTextExtreme = source * achromatic * extreme
	const prominentExtreme = sourceTextExtreme * population
	const explicitExtreme = source > 0 && contrastRatio(background.rgb, candidate.rgb) >= 4.5 &&
		achromatic > 0.8 && extreme > 0.9 &&
		candidate.population >= 0.008 && candidate.text >= 0.5 && candidate.saliency >= 0.7
		? 0.14
		: 0
	const relaxedSourceIdentity = contrastRatio(background.rgb, candidate.rgb) < 4.5
		? clamp01(candidate.chroma / 0.08) * 0.6
		: 0
	if (mode === "expressive") {
		return contrast * 0.25 + candidate.saliency * 0.27 + candidate.text * 0.2 +
			clamp01(candidate.chroma / 0.18) * 0.16 + population * 0.04 + source * 0.03 + sourceTextExtreme * 0.05
	}
	return contrast * 0.23 + candidate.text * 0.21 + candidate.saliency * 0.15 + population * 0.08 +
		source * 0.07 + sourceTextExtreme * 0.18 + prominentExtreme * 0.15 + explicitExtreme +
		relaxedSourceIdentity
}

function surfaceScore(
	candidate: Candidate,
	background: Candidate,
	foreground: Candidate,
	maxPopulation: number,
	smoothGradient: boolean,
	backgroundFamilyCoverage: number,
	allowRepresentativeSurface: boolean,
): number {
	if (candidate.id === background.id) {
		if (smoothGradient) return 0.24
		return backgroundFamilyCoverage >= 0.75 ? 0.58 : 0.43
	}
	const distance = okDistance(candidate.lab, background.lab)
	if (!smoothGradient && background.lab[0] < 0.15 && candidate.lab[0] < 0.25 && candidate.chroma < 0.05) {
		return 0.2
	}
	if (smoothGradient) {
		const population = Math.sqrt(candidate.population / Math.max(maxPopulation, 1e-9))
		const ratio = contrastRatio(candidate.rgb, foreground.rgb)
		const allowedContrast = foregroundSurfaceContrast(foreground, background, allowRepresentativeSurface)
		const minimumContrast = ratio >= 4.5 ? 4.5 : allowedContrast
		const contrast = clamp01((ratio - minimumContrast) / (10 - minimumContrast))
		const separation = clamp01(distance / 0.32)
		return candidate.background * 0.15 + population * 0.24 + separation * 0.34 +
			contrast * 0.14 + clamp01(candidate.chroma / 0.15) * 0.13
	}
	const idealDistance = smoothGradient ? 0.16 : 0.1
	const affinity = Math.exp(-((distance - idealDistance) ** 2) / 0.018)
	const population = Math.sqrt(candidate.population / Math.max(maxPopulation, 1e-9))
	const ratio = contrastRatio(candidate.rgb, foreground.rgb)
	const allowedContrast = foregroundSurfaceContrast(foreground, background, allowRepresentativeSurface)
	const minimumContrast = ratio >= 4.5 ? 4.5 : allowedContrast
	const contrast = clamp01((ratio - minimumContrast) / (10 - minimumContrast))
	const gradientSeparation = smoothGradient ? clamp01(distance / 0.24) * 0.14 : 0
	return candidate.background * 0.28 + population * 0.22 + affinity * 0.25 + contrast * 0.17 + gradientSeparation
}

function accentScore(
	candidate: Candidate,
	foreground: Candidate,
	background: Candidate,
	maxPopulation: number,
	mode: Mode,
): number {
	const colorfulness = clamp01(candidate.chroma / 0.18)
	const foregroundDistance = clamp01(okDistance(candidate.lab, foreground.lab) / 0.28)
	const population = Math.sqrt(candidate.population / Math.max(maxPopulation, 1e-9))
	const achromaticIntent = clamp01(1 - candidate.chroma / 0.05) * candidate.saliency
	const identity = clamp01(textIdentityScore(candidate))
	const backgroundPenalty = candidate.background * 0.16
	const extremeTypography = candidate.text >= 0.53 && candidate.saliency >= 0.55 && (
		(foreground.lab[0] < 0.7 && candidate.chroma < 0.08 && candidate.lab[0] > 0.9) ||
		(foreground.lab[0] > 0.7 && background.chroma >= 0.04 && candidate.chroma < 0.02 &&
			candidate.population <= 0.03 && candidate.lab[0] < 0.18)
	)
		? 0.22
		: 0
	const chromaticTypography = candidate.chroma >= 0.14 && candidate.population >= 0.005 && candidate.population <= 0.02 &&
		candidate.text >= 0.58 && candidate.saliency >= 0.45 && candidate.background < 0.4
		? 0.18
		: 0
	const vividDetail = colorfulness * candidate.saliency * (1 - candidate.background)
	const lightNeutralColorCoverage = background.lab[0] > 0.85 && background.chroma < 0.05
		? clamp01(candidate.population / 0.05) * colorfulness * (1 - candidate.background)
		: 0
	const prominentIdentity = candidate.population >= 0.15 && candidate.saliency >= 0.4 &&
		candidate.background <= 0.35 && candidate.chroma >= 0.025
		? 1
		: 0
	if (mode === "expressive") {
		return colorfulness * 0.34 + candidate.saliency * 0.25 + foregroundDistance * 0.16 +
			population * 0.06 + achromaticIntent * 0.07 + identity * 0.12 + prominentIdentity * 0.1 - backgroundPenalty
	}
	return colorfulness * 0.3 + candidate.saliency * 0.21 + foregroundDistance * 0.14 +
		population * 0.05 + candidate.text * 0.07 + achromaticIntent * 0.15 + identity * 0.12 +
		vividDetail * 0.12 + lightNeutralColorCoverage * 0.25 + prominentIdentity * 0.12 +
		extremeTypography + chromaticTypography - backgroundPenalty
}

function textIdentityScore(candidate: Candidate): number {
	return candidate.text * 0.4 + candidate.saliency * 0.35 +
		Math.abs(candidate.lab[0] - 0.5) * 0.4 + (1 - Math.sqrt(candidate.population)) * 0.08
}

function colorFamilyCoverage(candidate: Candidate, candidates: Candidate[]): number {
	return candidates.reduce((sum, other) =>
		sum + (okDistance(candidate.lab, other.lab) < 0.055 ? other.population : 0), 0)
}

function nearestSourceDistance(lab: OKLab, analysis: RegionAnalysis): number {
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(lab, region.lab))
	return nearest
}

function roleColor(candidate: Candidate, analysis: RegionAnalysis): RoleColor {
	return {
		rgb: candidate.rgb,
		hex: candidate.hex,
		generated: candidate.generated,
		sourceDistance: nearestSourceDistance(candidate.lab, analysis),
	}
}

function smoothGradientEvidence(analysis: RegionAnalysis): GradientEvidence {
	const farOffset = 12
	let samples = 0
	let evidence = 0
	let localDistanceTotal = 0
	let farDistanceTotal = 0
	for (let y = 0; y < analysis.height - farOffset; y += 2) {
		for (let x = 0; x < analysis.width - farOffset; x += 2) {
			const pixel = y * analysis.width + x
			if (analysis.regions[analysis.labels[pixel]].background < 0.35) continue
			for (const [deltaX, deltaY] of [[1, 0], [0, 1]]) {
				const localPixel = (y + deltaY) * analysis.width + x + deltaX
				const farPixel = (y + deltaY * farOffset) * analysis.width + x + deltaX * farOffset
				const localDistance = okDistance(labAt(analysis.labs, pixel), labAt(analysis.labs, localPixel))
				const farDistance = okDistance(labAt(analysis.labs, pixel), labAt(analysis.labs, farPixel))
				samples++
				localDistanceTotal += localDistance
				farDistanceTotal += farDistance
				if (localDistance > 0.0005 && localDistance < 0.025 && farDistance > 0.025 && farDistance > localDistance * 2) {
					evidence++
				}
			}
		}
	}
	if (samples === 0) return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	const ratio = evidence / samples
	const localMean = localDistanceTotal / samples
	const farMean = farDistanceTotal / samples
	const isGradient = ratio >= 0.32 && localMean < 0.025 && farMean > 0.035
	const confidence = isGradient
		? clamp01(0.45 + ratio * 0.7 + Math.min(farMean, 0.15))
		: clamp01(0.55 + Math.max(0, 0.32 - ratio) + Math.max(0, localMean - 0.025) * 3)
	return {
		isGradient,
		confidence,
		coverage: ratio,
		continuity: clamp01(farMean / 0.1),
		coherence: clamp01(1 - localMean / 0.05),
	}
}

function detectGradient(
	background: Candidate,
	surface: Candidate,
	analysis: RegionAnalysis,
): GradientEvidence {
	const smooth = smoothGradientEvidence(analysis)
	const difference: OKLab = [
		surface.lab[0] - background.lab[0],
		surface.lab[1] - background.lab[1],
		surface.lab[2] - background.lab[2],
	]
	const squaredDistance = difference[0] ** 2 + difference[1] ** 2 + difference[2] ** 2
	const distance = Math.sqrt(squaredDistance)
	if (distance < 0.045) {
		return smooth
	}

	const binCount = 18
	const bins = new Uint32Array(binCount)
	const mask = new Uint8Array(analysis.width * analysis.height)
	let onPath = 0
	let intermediate = 0
	const tolerance = Math.max(0.016, distance * 0.16)
	for (let pixel = 0; pixel < mask.length; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const relative: OKLab = [
			lab[0] - background.lab[0],
			lab[1] - background.lab[1],
			lab[2] - background.lab[2],
		]
		const projection = (
			relative[0] * difference[0] + relative[1] * difference[1] + relative[2] * difference[2]
		) / squaredDistance
		if (projection < -0.04 || projection > 1.04) continue
		const clampedProjection = clamp01(projection)
		const projected: OKLab = [
			background.lab[0] + difference[0] * clampedProjection,
			background.lab[1] + difference[1] * clampedProjection,
			background.lab[2] + difference[2] * clampedProjection,
		]
		if (okDistance(lab, projected) > tolerance) continue
		onPath++
		bins[Math.min(binCount - 1, Math.floor(clampedProjection * binCount))]++
		if (clampedProjection > 0.12 && clampedProjection < 0.88) {
			mask[pixel] = 1
			intermediate++
		}
	}

	const coverage = onPath / mask.length
	const continuity = bins.slice(2, -2).filter((count) => count > 0).length / (binCount - 4)
	let largestComponent = 0
	let componentCount = 0
	const visited = new Uint8Array(mask.length)
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		componentCount++
		let size = 0
		const stack = [start]
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			size++
			const x = pixel % analysis.width
			const y = Math.floor(pixel / analysis.width)
			const neighbors = [
				x > 0 ? pixel - 1 : -1,
				x + 1 < analysis.width ? pixel + 1 : -1,
				y > 0 ? pixel - analysis.width : -1,
				y + 1 < analysis.height ? pixel + analysis.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		largestComponent = Math.max(largestComponent, size)
	}
	const coherence = intermediate === 0 ? 0 : largestComponent / intermediate
	const intermediateRatio = intermediate / mask.length
	const rawConfidence = clamp01(
		coverage * 1.8 + continuity * 0.33 + coherence * 0.3 + intermediateRatio * 2.2 -
		Math.min(componentCount, 30) / 100,
	)
	const isGradient = coverage >= 0.08 && intermediateRatio >= 0.035 && continuity >= 0.55 && coherence >= 0.22
	if (smooth.isGradient && !isGradient) return smooth
	return {
		isGradient,
		confidence: isGradient ? rawConfidence : Math.max(smooth.confidence, 1 - rawConfidence * 0.65),
		coverage,
		continuity,
		coherence,
	}
}

function paletteMetrics(selection: Selection, analysis: RegionAnalysis): PaletteMetrics {
	const selected = [selection.background, selection.foreground, selection.surface, selection.accent]
	let reconstruction = 0
	let samples = 0
	const stride = Math.max(1, Math.floor((analysis.width * analysis.height) / 12_000))
	for (let pixel = 0; pixel < analysis.width * analysis.height; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		reconstruction += Math.min(...selected.map((candidate) => okDistance(lab, candidate.lab)))
		samples++
	}
	return {
		foregroundContrast: contrastRatio(selection.background.rgb, selection.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(selection.surface.rgb, selection.foreground.rgb),
		accentContrast: contrastRatio(selection.background.rgb, selection.accent.rgb),
		accentSurfaceContrast: contrastRatio(selection.surface.rgb, selection.accent.rgb),
		minimumRoleDistance: roleMinimumDistance(selected.map((candidate) => candidate.lab)),
		meanSourceDistance: selected.reduce((sum, candidate) => sum + nearestSourceDistance(candidate.lab, analysis), 0) / selected.length,
		meanReconstructionError: samples === 0 ? 0 : reconstruction / samples,
	}
}

function toPalette(selection: Selection, analysis: RegionAnalysis): Palette {
	if (okDistance(selection.accent.lab, selection.background.lab) < minimumAccentRoleDistance ||
		okDistance(selection.accent.lab, selection.surface.lab) < minimumAccentRoleDistance) {
		throw new Error("Accent must be perceptually distinct from background and surface")
	}
	const gradient = detectGradient(selection.background, selection.surface, analysis)
	if (selection.gradientHint && selection.background.id !== selection.surface.id) {
		gradient.isGradient = true
		gradient.confidence = Math.max(gradient.confidence, 0.6)
	}
	return {
		background: roleColor(selection.background, analysis),
		foreground: roleColor(selection.foreground, analysis),
		surface: roleColor(selection.surface, analysis),
		accent: roleColor(selection.accent, analysis),
		gradient,
		score: selection.score,
		metrics: paletteMetrics(selection, analysis),
	}
}

export function solvePalette(candidates: Candidate[], analysis: RegionAnalysis, mode: Mode): Palette {
	if (candidates.length === 0) throw new Error("Cannot solve a palette without color candidates")
	const maxPopulation = Math.max(...candidates.map((candidate) => candidate.population))
	const generated = [generatedCandidate([0, 0, 0], -1), generatedCandidate([255, 255, 255], -2)]
	const rankedBackgrounds = [...candidates]
		.sort((first, second) => backgroundScore(second, maxPopulation) - backgroundScore(first, maxPopulation))
	const bestBackgroundScore = backgroundScore(rankedBackgrounds[0], maxPopulation)
	const smoothGradient = smoothGradientEvidence(analysis)
	const backgroundShortlist = rankedBackgrounds
		.filter((candidate) => backgroundScore(candidate, maxPopulation) >= bestBackgroundScore - 0.075)
	const substantialGradientBackgrounds = backgroundShortlist.filter((candidate) => candidate.population >= 0.05)
	const backgrounds = (smoothGradient.isGradient && substantialGradientBackgrounds.length > 0
		? substantialGradientBackgrounds
		: backgroundShortlist)
		.slice(0, 6)
	const totalCandidatePopulation = candidates.reduce((sum, candidate) => sum + candidate.population, 0)
	const dominantFamilyCoverage = candidates.reduce((sum, candidate) =>
		sum + (okDistance(candidates[0].lab, candidate.lab) < 0.08 ? candidate.population : 0), 0) /
		Math.max(totalCandidatePopulation, 1e-9)
	const dominantLightness = candidates[0].lab[0]
	const monochrome = dominantFamilyCoverage >= 0.8 && candidates[0].chroma < 0.04 &&
		(dominantLightness < 0.15 || dominantLightness > 0.92) && !smoothGradient.isGradient
	if (monochrome) {
		const background = [...candidates]
			.sort((first, second) => backgroundScore(second, maxPopulation) - backgroundScore(first, maxPopulation))[0]
		const sourceForegrounds = sourceForegroundPool(candidates, background)
		const foregroundPool = sourceForegrounds.length > 0 ? sourceForegrounds : generated
		const foreground = foregroundPool
			.filter((candidate) => contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundContrast(candidate))
			.sort((first, second) =>
				foregroundScore(second, background, maxPopulation, mode) +
					Math.sqrt(second.population / Math.max(maxPopulation, 1e-9)) * 0.15 -
				foregroundScore(first, background, maxPopulation, mode) -
					Math.sqrt(first.population / Math.max(maxPopulation, 1e-9)) * 0.15,
			)[0] || generated[0]
		const sourceAccent = candidates
			.filter((candidate) => candidate.id !== background.id && candidate.id !== foreground.id &&
				okDistance(candidate.lab, background.lab) >= 0.08 && okDistance(candidate.lab, foreground.lab) >= 0.08 &&
				(candidate.chroma >= 0.04 || candidate.population >= 0.008))
			.sort((first, second) =>
				accentScore(second, foreground, background, maxPopulation, mode) -
				accentScore(first, foreground, background, maxPopulation, mode),
			)[0]
		return toPalette({ background, foreground, surface: background, accent: sourceAccent || foreground, score: 1 }, analysis)
	}
	let best: Selection | undefined

	for (const background of backgrounds) {
		const allowRepresentativeSurface = hasMultipleBackgroundFields(candidates, background)
		const chromaticCoverage = candidates.reduce((sum, candidate) =>
			sum + (candidate.chroma >= 0.04 && okDistance(background.lab, candidate.lab) >= 0.08 ? candidate.population : 0), 0)
		const darkChromaticGradient = background.lab[0] < 0.2 && chromaticCoverage >= 0.15 &&
			smoothGradient.coverage >= 0.05 && smoothGradient.coherence >= 0.55
		const expectsGradient = smoothGradient.isGradient || darkChromaticGradient
		const sourceForegrounds = sourceForegroundPool(candidates, background)
		const foregroundPool = sourceForegrounds.length > 0 ? sourceForegrounds : generated
		const rankedForegrounds = foregroundPool
			.filter((candidate) => contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundContrast(candidate))
			.sort((first, second) =>
				foregroundScore(second, background, maxPopulation, mode) - foregroundScore(first, background, maxPopulation, mode),
			)
		const bestForegroundScore = rankedForegrounds.length > 0
			? foregroundScore(rankedForegrounds[0], background, maxPopulation, mode)
			: -Infinity
		const foregrounds = rankedForegrounds
			.filter((candidate) => foregroundScore(candidate, background, maxPopulation, mode) >= bestForegroundScore - 0.08)
			.slice(0, 6)
		for (const foreground of foregrounds) {
			const familyCoverage = colorFamilyCoverage(background, candidates)
			const rankedSurfaces = [background, ...candidates.filter((candidate) =>
				candidate.id !== background.id &&
				candidate.population >= (expectsGradient ? 0.008 : 0.02) &&
				okDistance(background.lab, candidate.lab) >= (expectsGradient ? 0.025 : 0.05) &&
				okDistance(background.lab, candidate.lab) <= 0.38 &&
				(!expectsGradient || chromaticCoverage < 0.15 || candidate.chroma >= 0.04) &&
				contrastRatio(candidate.rgb, foreground.rgb) >= foregroundSurfaceContrast(
					foreground, background, allowRepresentativeSurface,
				),
			)]
				.sort((first, second) =>
					surfaceScore(second, background, foreground, maxPopulation, expectsGradient, familyCoverage, allowRepresentativeSurface) -
					surfaceScore(first, background, foreground, maxPopulation, expectsGradient, familyCoverage, allowRepresentativeSurface),
				)
			const bestSurfaceScore = surfaceScore(
				rankedSurfaces[0], background, foreground, maxPopulation, expectsGradient, familyCoverage,
				allowRepresentativeSurface,
			)
			const surfaces = rankedSurfaces
				.filter((candidate) => surfaceScore(
					candidate, background, foreground, maxPopulation, expectsGradient, familyCoverage,
					allowRepresentativeSurface,
				) >= bestSurfaceScore - 0.08)
				.slice(0, 5)
			for (const surface of surfaces) {
				const rankedAccents = candidates.filter((candidate) =>
					candidate.id !== background.id &&
					candidate.id !== surface.id &&
					candidate.id !== foreground.id &&
					okDistance(background.lab, candidate.lab) >= 0.08 &&
					okDistance(surface.lab, candidate.lab) >= 0.06 &&
					okDistance(foreground.lab, candidate.lab) >= 0.08 &&
					(candidate.chroma >= 0.04 || contrastRatio(foreground.rgb, candidate.rgb) >= 1.5),
				)
					.sort((first, second) =>
						accentScore(second, foreground, background, maxPopulation, mode) -
						accentScore(first, foreground, background, maxPopulation, mode),
					)
				const bestAccentScore = rankedAccents.length > 0
					? accentScore(rankedAccents[0], foreground, background, maxPopulation, mode)
					: -Infinity
				const accents = rankedAccents
					.filter((candidate) => accentScore(
						candidate, foreground, background, maxPopulation, mode,
					) >= bestAccentScore - 0.02)
					.slice(0, 5)
				if (accents.length === 0) accents.push(foreground)
				for (const accent of accents) {
					const duplicatePenalty = !monochrome && okDistance(accent.lab, foreground.lab) < 0.025 ? 0.12 : 0
					const generatedPenalty = foreground.generated ? 0.12 : 0
					const score = (
						backgroundScore(background, maxPopulation) +
						foregroundScore(foreground, background, maxPopulation, mode) +
						surfaceScore(
							surface, background, foreground, maxPopulation, expectsGradient, familyCoverage, allowRepresentativeSurface,
						) +
						accentScore(accent, foreground, background, maxPopulation, mode)
					) / 4 - duplicatePenalty - generatedPenalty
					const selection = { background, foreground, surface, accent, score, gradientHint: expectsGradient }
					if (isBetterSelection(selection, best)) best = selection
				}
			}
		}
	}

	if (!best) {
		const background = backgrounds[0]
		const foreground = contrastRatio(background.rgb, generated[0].rgb) >= contrastRatio(background.rgb, generated[1].rgb)
			? generated[0]
			: generated[1]
		best = { background, foreground, surface: background, accent: foreground, score: 0 }
	}
	let selected: Selection = best
	if (selected.background.lab[0] > 0.9 && selected.surface.lab[0] > 0.9 &&
		selected.surface.chroma + 0.02 < selected.background.chroma && selected.surface.background >= selected.background.background) {
		selected = { ...selected, background: selected.surface, surface: selected.background }
	}
	if (selected.background.lab[0] < 0.15 && selected.foreground.lab[0] > 0.75 && selected.foreground.chroma < 0.02) {
		const allowRepresentativeSurface = hasMultipleBackgroundFields(candidates, selected.background)
		const nearWhite = candidates.filter((candidate) =>
			candidate.lab[0] > selected.foreground.lab[0] && candidate.chroma < 0.02 && candidate.population >= 0.01 &&
			candidate.text >= 0.4 && candidate.saliency >= 0.65 &&
			contrastRatio(candidate.rgb, selected.background.rgb) >= foregroundBackgroundContrast(candidate) &&
			contrastRatio(candidate.rgb, selected.surface.rgb) >= foregroundSurfaceContrast(
				candidate, selected.background, allowRepresentativeSurface,
			),
		).sort((first, second) => second.lab[0] - first.lab[0])[0]
		if (nearWhite) selected = { ...selected, foreground: nearWhite }
	}
	if (selected.gradientHint && selected.surface.chroma >= 0.1 && selected.accent.chroma >= 0.15 &&
		contrastRatio(selected.surface.rgb, selected.accent.rgb) < 1.2) {
		const familyCoverage = colorFamilyCoverage(selected.background, candidates)
		const allowRepresentativeSurface = hasMultipleBackgroundFields(candidates, selected.background)
		const chromaticCoverage = candidates.reduce((sum, candidate) =>
			sum + (candidate.chroma >= 0.04 && okDistance(selected.background.lab, candidate.lab) >= 0.08
				? candidate.population
				: 0), 0)
		const alternatives = candidates.filter((candidate) =>
			candidate.id !== selected.background.id && candidate.id !== selected.foreground.id && candidate.id !== selected.accent.id &&
			candidate.population >= 0.008 && candidate.background >= 0.3 &&
			okDistance(selected.background.lab, candidate.lab) >= 0.025 &&
			okDistance(selected.background.lab, candidate.lab) <= 0.38 &&
			(chromaticCoverage < 0.15 || candidate.chroma >= 0.04) &&
			contrastRatio(candidate.rgb, selected.foreground.rgb) >= foregroundSurfaceContrast(
				selected.foreground, selected.background, allowRepresentativeSurface,
			) &&
			okDistance(candidate.lab, selected.accent.lab) >= 0.06 && contrastRatio(candidate.rgb, selected.accent.rgb) >= 1.5,
		).sort((first, second) =>
			surfaceScore(second, selected.background, selected.foreground, maxPopulation, true, familyCoverage, allowRepresentativeSurface) -
			surfaceScore(first, selected.background, selected.foreground, maxPopulation, true, familyCoverage, allowRepresentativeSurface),
		)
		if (alternatives[0]) selected = { ...selected, surface: alternatives[0] }
	}
	const selectedGradient = detectGradient(selected.background, selected.surface, analysis)
	if (selectedGradient.isGradient && selectedGradient.coherence >= 0.9 &&
		okDistance(selected.background.lab, selected.surface.lab) < 0.1) {
		const allowRepresentativeSurface = hasMultipleBackgroundFields(candidates, selected.background)
		const alternatives = candidates.filter((candidate) =>
			candidate.id !== selected.background.id && candidate.id !== selected.foreground.id && candidate.id !== selected.accent.id &&
			candidate.population >= 0.04 && candidate.background >= 0.4 &&
			okDistance(selected.background.lab, candidate.lab) >= 0.12 &&
			okDistance(selected.background.lab, candidate.lab) <= 0.38 &&
			contrastRatio(candidate.rgb, selected.foreground.rgb) >= foregroundSurfaceContrast(
				selected.foreground, selected.background, allowRepresentativeSurface,
			) &&
			okDistance(candidate.lab, selected.accent.lab) >= 0.06,
		).sort((first, second) =>
			okDistance(selected.background.lab, second.lab) - okDistance(selected.background.lab, first.lab),
		)
		if (alternatives[0]) selected = { ...selected, surface: alternatives[0] }
	}
	return toPalette(selected, analysis)
}

export function quantizedBaseline(candidates: Candidate[], analysis: RegionAnalysis): Palette {
	if (candidates.length === 0) throw new Error("Cannot build a baseline without candidates")
	const background = [...candidates].sort((first, second) => second.population - first.population)[0]
	const sourceForegrounds = candidates
		.filter((candidate) => candidate.id !== background.id && contrastRatio(background.rgb, candidate.rgb) >= 4.5)
		.sort((first, second) => contrastRatio(background.rgb, second.rgb) - contrastRatio(background.rgb, first.rgb))
	const black = generatedCandidate([0, 0, 0], -1)
	const white = generatedCandidate([255, 255, 255], -2)
	const foreground = sourceForegrounds[0] || (
		contrastRatio(background.rgb, black.rgb) >= contrastRatio(background.rgb, white.rgb) ? black : white
	)
	const surface = candidates
		.filter((candidate) => candidate.id !== background.id && contrastRatio(candidate.rgb, foreground.rgb) >= 4.5)
		.sort((first, second) => second.population - first.population)[0] || background
	const accent = candidates
		.filter((candidate) =>
			candidate.id !== background.id && candidate.id !== surface.id &&
			okDistance(candidate.lab, background.lab) >= minimumAccentRoleDistance &&
			okDistance(candidate.lab, surface.lab) >= minimumAccentRoleDistance,
		)
		.sort((first, second) =>
			second.chroma * Math.sqrt(second.population) - first.chroma * Math.sqrt(first.population),
		)[0] || foreground
	return toPalette({ background, foreground, surface, accent, score: 0 }, analysis)
}
