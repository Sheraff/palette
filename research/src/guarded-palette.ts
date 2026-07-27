import { contrastRatio, labAt, okDistance, rgbToOKLab, roleMinimumDistance } from "./color.ts"
import type { Candidate } from "./candidates.ts"
import {
	resolveForegroundBackgroundRequirement,
	resolveForegroundSurfaceRequirement,
	resolveSourceForegroundPreferenceMinimum,
	sourceForegroundIsPreferred,
	type ForegroundContrastProfile,
} from "./foreground-contrast.ts"
import { detectGradient, minimumAccentBackgroundContrast, solvePalette } from "./palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RGB, RoleColor, RoleName } from "./types.ts"

export const GUARDED_ALGORITHM_VERSION = "region-guarded-correction-0.1.0-poc.1"
export const GUARDED_BASELINE_VERSION = "region-graph-0.15.0"

export type GuardRule =
	| "thin-frame-background"
	| "foreground-separated-accent"
	| "chromatic-salient-accent"
	| "low-identity-neutral-accent"
	| "collapsed-contrast-accent"

type RoleSummary = Record<RoleName, { hex: string; generated: boolean }>

export type GuardedPaletteCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof GUARDED_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof GUARDED_BASELINE_VERSION
	selectionRule: "canonical-incumbent-then-single-role-guard"
	invariants: {
		canonicalFallback: true
		singleRoleChangeMaximum: true
		nonTargetRolesFrozen: true
		gradientDecisionFrozen: true
	}
	baseline: { roles: RoleSummary; gradient: boolean }
	final: { roles: RoleSummary; gradient: boolean }
	decision: {
		kind: "preserve" | "replace-background" | "replace-accent"
		rule: GuardRule | null
		considered: number
		hardGateFeasible: number
		admitted: number
		selected: string | null
		alternatives: Array<{
			hex: string
			rule: GuardRule
			rank: number[]
			evidence: Record<string, number>
		}>
	}
	gates: {
		foregroundBackground: number
		foregroundSurface: number
		accentBackground: number
		accentSurface: number
		accentBackgroundDistance: number
		accentSurfaceDistance: number
	}
	foregroundContrastProfile?: ForegroundContrastProfile
}

type Admitted = GuardedPaletteCertificate["decision"]["alternatives"][number] & { candidate: Candidate }

const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareRank(first: Admitted, second: Admitted): number {
	for (let index = 0; index < Math.max(first.rank.length, second.rank.length); index++) {
		const difference = (second.rank[index] ?? 0) - (first.rank[index] ?? 0)
		if (Math.abs(difference) > 1e-12) return difference
	}
	return compareAscii(first.hex, second.hex)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function roleSummary(palette: Palette): RoleSummary {
	return Object.fromEntries(roleNames.map((role) => [role, {
		hex: palette[role].hex.toLowerCase(),
		generated: palette[role].generated,
	}])) as RoleSummary
}

function candidateForRole(candidates: readonly Candidate[], role: RoleColor): Candidate | null {
	if (role.generated) return null
	return [...candidates]
		.filter((candidate) => !candidate.generated && sameRgb(candidate.rgb, role.rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || compareAscii(first.hex, second.hex))[0] ?? null
}

function nearestSourceDistance(rgb: RGB, analysis: RegionAnalysis): number {
	const lab = rgbToOKLab(rgb)
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(lab, region.lab))
	return Number.isFinite(nearest) ? nearest : 0
}

function roleColor(candidate: Candidate, analysis: RegionAnalysis): RoleColor {
	return {
		rgb: candidate.rgb,
		hex: candidate.hex,
		generated: false,
		sourceDistance: nearestSourceDistance(candidate.rgb, analysis),
	}
}

function paletteMetrics(palette: Pick<Palette, RoleName>, analysis: RegionAnalysis): PaletteMetrics {
	const roleLabs = roleNames.map((role) => rgbToOKLab(palette[role].rgb))
	let reconstruction = 0
	let samples = 0
	const pixelCount = analysis.width * analysis.height
	const stride = Math.max(1, Math.floor(pixelCount / 12_000))
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		reconstruction += Math.min(...roleLabs.map((roleLab) => okDistance(lab, roleLab)))
		samples++
	}
	return {
		foregroundContrast: contrastRatio(palette.background.rgb, palette.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(palette.surface.rgb, palette.foreground.rgb),
		accentContrast: contrastRatio(palette.background.rgb, palette.accent.rgb),
		accentSurfaceContrast: contrastRatio(palette.surface.rgb, palette.accent.rgb),
		minimumRoleDistance: roleMinimumDistance(roleLabs),
		meanSourceDistance: roleNames.reduce((sum, role) =>
			sum + nearestSourceDistance(palette[role].rgb, analysis), 0) / roleNames.length,
		meanReconstructionError: samples === 0 ? 0 : reconstruction / samples,
	}
}

function foregroundRequirement(
	candidate: Candidate | null,
	generated: boolean,
	profile?: ForegroundContrastProfile,
): number {
	return resolveForegroundBackgroundRequirement(candidate ?? {
		generated,
		population: 0,
		text: 0,
		saliency: 0,
	}, profile)
}

function sourceForegroundPool(
	candidates: readonly Candidate[],
	background: Candidate,
	profile?: ForegroundContrastProfile,
): Candidate[] {
	const preferenceMinimum = resolveSourceForegroundPreferenceMinimum(profile)
	const standard = candidates.filter((candidate) => candidate.id !== background.id &&
		contrastRatio(background.rgb, candidate.rgb) >= preferenceMinimum)
	const eligible = candidates.filter((candidate) => candidate.id !== background.id &&
		contrastRatio(background.rgb, candidate.rgb) >= foregroundRequirement(candidate, false, profile))
	return standard.length > 0
		? eligible.filter((candidate) => sourceForegroundIsPreferred(
			candidate, contrastRatio(background.rgb, candidate.rgb), profile,
		))
		: eligible
}

function foregroundSurfaceRequirement(
	foreground: Candidate | null,
	foregroundRole: RoleColor,
	background: Candidate,
	candidates: readonly Candidate[],
	profile?: ForegroundContrastProfile,
): number {
	const backgroundContrast = contrastRatio(foregroundRole.rgb, background.rgb)
	const representative = candidates.filter((candidate) => !candidate.typographyOnly && candidate.id !== background.id &&
		candidate.population >= 0.15 && candidate.background >= 0.4 && okDistance(candidate.lab, background.lab) >= 0.08).length >= 2
	return resolveForegroundSurfaceRequirement(foreground ?? {
		generated: foregroundRole.generated,
		population: 0,
		text: 0,
		saliency: 0,
	}, { foregroundBackgroundContrast: backgroundContrast, allowRepresentativeSurface: representative }, profile)
}

function backgroundHardGates(
	candidate: Candidate,
	baseline: Palette,
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
	profile?: ForegroundContrastProfile,
): boolean {
	const foreground = candidateForRole(candidates, baseline.foreground)
	const surface = candidateForRole(candidates, baseline.surface)
	const accentLab = rgbToOKLab(baseline.accent.rgb)
	const sourcePool = sourceForegroundPool(candidates, candidate, profile)
	if (baseline.foreground.generated) {
		if (sourcePool.length > 0) return false
	} else if (!foreground || !sourcePool.includes(foreground)) return false
	if (!surface || baseline.background.hex === baseline.surface.hex) return false
	if (contrastRatio(candidate.rgb, baseline.foreground.rgb) <
		foregroundRequirement(foreground, baseline.foreground.generated, profile)) return false
	if (contrastRatio(surface.rgb, baseline.foreground.rgb) < foregroundSurfaceRequirement(
		foreground, baseline.foreground, candidate, candidates, profile,
	)) return false
	if (contrastRatio(candidate.rgb, baseline.accent.rgb) < minimumAccentBackgroundContrast) return false
	if (okDistance(candidate.lab, accentLab) < 0.025 || okDistance(surface.lab, accentLab) < 0.025) return false
	return detectGradient(candidate, surface, analysis).isGradient === baseline.gradient.isGradient
}

function accentHardGates(candidate: Candidate, baseline: Palette): boolean {
	const candidateLab = candidate.lab
	return !candidate.generated &&
		!sameRgb(candidate.rgb, baseline.background.rgb) &&
		!sameRgb(candidate.rgb, baseline.foreground.rgb) &&
		!sameRgb(candidate.rgb, baseline.surface.rgb) &&
		contrastRatio(candidate.rgb, baseline.background.rgb) >= minimumAccentBackgroundContrast &&
		okDistance(candidateLab, rgbToOKLab(baseline.background.rgb)) >= 0.08 &&
		okDistance(candidateLab, rgbToOKLab(baseline.surface.rgb)) >= 0.06 &&
		okDistance(candidateLab, rgbToOKLab(baseline.foreground.rgb)) >= 0.08 &&
		(candidate.chroma >= 0.04 || contrastRatio(candidate.rgb, baseline.foreground.rgb) >= 1.5)
}

function backgroundAlternatives(
	baseline: Palette,
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
	profile?: ForegroundContrastProfile,
): { considered: number; feasible: number; alternatives: Admitted[] } {
	const current = candidateForRole(candidates, baseline.background)
	if (!current || current.spatial.population > 0.05 || current.spatial.frame < 0.7 ||
		current.spatial.sideCoverage.some((coverage) => coverage < 0.9)) {
		return { considered: 0, feasible: 0, alternatives: [] }
	}
	let feasible = 0
	const alternatives: Admitted[] = []
	for (const candidate of candidates) {
		if (candidate.typographyOnly || candidate.id === current.id || okDistance(candidate.lab, current.lab) < 0.08) continue
		if (!backgroundHardGates(candidate, baseline, candidates, analysis, profile)) continue
		feasible++
		const largest = Math.max(0, ...candidate.spatial.components.map((component) => component.population))
		const canonicalSurface = sameRgb(candidate.rgb, baseline.surface.rgb)
		if ((candidate.background < 0.8 && !canonicalSurface) || candidate.population < 0.1 || candidate.chroma < 0.02 ||
			candidate.spatial.frame > 0.15 || largest < current.population + 0.05) continue
		alternatives.push({
			candidate,
			hex: candidate.hex.toLowerCase(),
			rule: "thin-frame-background",
			rank: [candidate.population, largest, candidate.background, -candidate.spatial.frame],
			evidence: {
				currentPopulation: current.population,
				currentFrame: current.spatial.frame,
				population: candidate.population,
				largestComponent: largest,
				background: candidate.background,
				frame: candidate.spatial.frame,
			},
		})
	}
	return { considered: candidates.length, feasible, alternatives: alternatives.sort(compareRank) }
}

function accentAlternatives(
	baseline: Palette,
	candidates: readonly Candidate[],
): { considered: number; feasible: number; alternatives: Admitted[] } {
	const current = candidateForRole(candidates, baseline.accent)
	if (!current) return { considered: 0, feasible: 0, alternatives: [] }
	const foregroundLab = rgbToOKLab(baseline.foreground.rgb)
	const surfaceLab = rgbToOKLab(baseline.surface.rgb)
	const currentForegroundDistance = okDistance(current.lab, foregroundLab)
	const currentSurfaceDistance = okDistance(current.lab, surfaceLab)
	const currentMinimumContrast = Math.min(
		contrastRatio(current.rgb, baseline.background.rgb),
		contrastRatio(current.rgb, baseline.surface.rgb),
	)
	let feasible = 0
	const alternatives: Admitted[] = []
	for (const candidate of candidates) {
		if (candidate.id === current.id || !accentHardGates(candidate, baseline)) continue
		feasible++
		const foregroundDistance = okDistance(candidate.lab, foregroundLab)
		const surfaceDistance = okDistance(candidate.lab, surfaceLab)
		const minimumContrast = Math.min(
			contrastRatio(candidate.rgb, baseline.background.rgb),
			contrastRatio(candidate.rgb, baseline.surface.rgb),
		)
		const commonEvidence = {
			currentPopulation: current.population,
			population: candidate.population,
			currentChroma: current.chroma,
			chroma: candidate.chroma,
			currentSaliency: current.saliency,
			saliency: candidate.saliency,
			currentForegroundDistance,
			foregroundDistance,
			currentSurfaceDistance,
			surfaceDistance,
			currentMinimumContrast,
			minimumContrast,
		}
		const add = (rule: GuardRule, rank: number[]): void => {
			alternatives.push({ candidate, hex: candidate.hex.toLowerCase(), rule, rank, evidence: commonEvidence })
		}
		if (currentMinimumContrast <= 1.1 && minimumContrast >= 8 &&
			surfaceDistance >= currentSurfaceDistance + 0.5 && candidate.spatial.frame <= 0.01) {
			add("collapsed-contrast-accent", [candidate.population, minimumContrast, surfaceDistance])
		} else if (current.chroma <= 0.01 && candidate.saliency >= current.saliency + 0.28 &&
			surfaceDistance >= currentSurfaceDistance + 0.2 && minimumContrast >= currentMinimumContrast + 5) {
			add("low-identity-neutral-accent", [candidate.saliency, minimumContrast, candidate.population])
		} else if (current.chroma <= 0.02 && candidate.chroma >= current.chroma + 0.04 &&
			minimumContrast >= currentMinimumContrast + 1 && candidate.saliency >= 0.85 && candidate.population >= 0.005) {
			add("chromatic-salient-accent", [candidate.chroma, candidate.saliency, minimumContrast])
		} else if (currentForegroundDistance <= 0.1 && foregroundDistance >= currentForegroundDistance + 0.1 &&
			candidate.population >= current.population * 1.5 && candidate.saliency >= current.saliency) {
			add("foreground-separated-accent", [foregroundDistance, candidate.population, minimumContrast])
		}
	}
	const priorities: Record<GuardRule, number> = {
		"collapsed-contrast-accent": 4,
		"low-identity-neutral-accent": 3,
		"chromatic-salient-accent": 2,
		"foreground-separated-accent": 1,
		"thin-frame-background": 0,
	}
	alternatives.sort((first, second) => priorities[second.rule] - priorities[first.rule] || compareRank(first, second))
	return { considered: candidates.length, feasible, alternatives }
}

function gateSummary(palette: Palette): GuardedPaletteCertificate["gates"] {
	const backgroundLab = rgbToOKLab(palette.background.rgb)
	const surfaceLab = rgbToOKLab(palette.surface.rgb)
	const accentLab = rgbToOKLab(palette.accent.rgb)
	return {
		foregroundBackground: contrastRatio(palette.background.rgb, palette.foreground.rgb),
		foregroundSurface: contrastRatio(palette.surface.rgb, palette.foreground.rgb),
		accentBackground: contrastRatio(palette.background.rgb, palette.accent.rgb),
		accentSurface: contrastRatio(palette.surface.rgb, palette.accent.rgb),
		accentBackgroundDistance: okDistance(accentLab, backgroundLab),
		accentSurfaceDistance: okDistance(accentLab, surfaceLab),
	}
}

export function applyGuardedCorrections(
	baseline: Palette,
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
	profile?: ForegroundContrastProfile,
): { palette: Palette; certificate: GuardedPaletteCertificate } {
	const background = backgroundAlternatives(baseline, candidates, analysis, profile)
	const accent = background.alternatives.length === 0 ? accentAlternatives(baseline, candidates) : null
	const selected = background.alternatives[0] ?? accent?.alternatives[0] ?? null
	let palette = baseline
	let kind: GuardedPaletteCertificate["decision"]["kind"] = "preserve"
	if (selected?.rule === "thin-frame-background") {
		const replacement = roleColor(selected.candidate, analysis)
		const surface = candidateForRole(candidates, baseline.surface)!
		const gradient: GradientEvidence = detectGradient(selected.candidate, surface, analysis)
		const roles = { ...baseline, background: replacement }
		palette = { ...roles, gradient, metrics: paletteMetrics(roles, analysis) }
		kind = "replace-background"
	} else if (selected) {
		const roles = { ...baseline, accent: roleColor(selected.candidate, analysis) }
		palette = { ...roles, metrics: paletteMetrics(roles, analysis) }
		kind = "replace-accent"
	}
	const source = background.alternatives.length > 0 ? background : accent ?? background
	return {
		palette,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: GUARDED_ALGORITHM_VERSION,
			baselineAlgorithmVersion: GUARDED_BASELINE_VERSION,
			selectionRule: "canonical-incumbent-then-single-role-guard",
			invariants: {
				canonicalFallback: true,
				singleRoleChangeMaximum: true,
				nonTargetRolesFrozen: true,
				gradientDecisionFrozen: true,
			},
			baseline: { roles: roleSummary(baseline), gradient: baseline.gradient.isGradient },
			final: { roles: roleSummary(palette), gradient: palette.gradient.isGradient },
			decision: {
				kind,
				rule: selected?.rule ?? null,
				considered: source.considered,
				hardGateFeasible: source.feasible,
				admitted: source.alternatives.length,
				selected: selected?.hex ?? null,
				alternatives: source.alternatives.map(({ candidate: _candidate, ...alternative }) => alternative),
			},
			gates: gateSummary(palette),
			...(profile ? { foregroundContrastProfile: profile } : {}),
		},
	}
}

export function solveGuardedPalette(
	candidates: Candidate[],
	analysis: RegionAnalysis,
	profile?: ForegroundContrastProfile,
): { palette: Palette; certificate: GuardedPaletteCertificate } {
	return applyGuardedCorrections(solvePalette(candidates, analysis, "spatial", profile), candidates, analysis, profile)
}
