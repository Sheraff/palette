export type ForegroundContrastProfile = Readonly<{
	ordinary: Readonly<{
		backgroundMinimum: number
		surfaceMinimum: number
	}>
	strongTypography: Readonly<{
		backgroundMinimum: number
		surfaceMinimum: number
	}>
	generatedFallback: Readonly<{
		backgroundMinimum: number
		surfaceMinimum: number
	}>
	sourceForegroundPreferenceMinimum: number
	backgroundScoringPreferenceMinimum?: number
	surfaceScoringPreferenceMinimum?: number
}>

export type ForegroundContrastEvidence = Readonly<{
	generated: boolean
	population: number
	text: number
	saliency: number
}>

export type ForegroundSurfaceContext = Readonly<{
	foregroundBackgroundContrast: number
	allowRepresentativeSurface: boolean
}>

const profileKeys = ["ordinary", "strongTypography", "generatedFallback", "sourceForegroundPreferenceMinimum"]
const scoringPreferenceKeys = ["backgroundScoringPreferenceMinimum", "surfaceScoringPreferenceMinimum"]
const tierKeys = ["backgroundMinimum", "surfaceMinimum"]
const validatedProfiles = new WeakSet<object>()

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function validRatio(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 21
}

export function assertForegroundContrastProfile(value: unknown): asserts value is ForegroundContrastProfile {
	if (isRecord(value) && validatedProfiles.has(value)) return
	if (!isRecord(value)) throw new Error("Foreground contrast profile is invalid")
	const hasBackgroundScoringPreference = "backgroundScoringPreferenceMinimum" in value
	const hasSurfaceScoringPreference = "surfaceScoringPreferenceMinimum" in value
	const hasScoringPreferences = hasBackgroundScoringPreference && hasSurfaceScoringPreference
	if (hasBackgroundScoringPreference !== hasSurfaceScoringPreference ||
		!exactKeys(value, hasScoringPreferences ? [...profileKeys, ...scoringPreferenceKeys] : profileKeys) ||
		!validRatio(value.sourceForegroundPreferenceMinimum) ||
		(hasScoringPreferences && (!validRatio(value.backgroundScoringPreferenceMinimum) ||
			!validRatio(value.surfaceScoringPreferenceMinimum)))) {
		throw new Error("Foreground contrast profile is invalid")
	}
	for (const tier of ["ordinary", "strongTypography", "generatedFallback"] as const) {
		const thresholds = value[tier]
		if (!isRecord(thresholds) || !exactKeys(thresholds, tierKeys) ||
			!validRatio(thresholds.backgroundMinimum) || !validRatio(thresholds.surfaceMinimum)) {
			throw new Error(`Foreground contrast profile ${tier} thresholds are invalid`)
		}
	}
	if (Object.isFrozen(value) && Object.isFrozen(value.ordinary) && Object.isFrozen(value.strongTypography) &&
		Object.isFrozen(value.generatedFallback)) validatedProfiles.add(value)
}

export function defineForegroundContrastProfile(value: ForegroundContrastProfile): ForegroundContrastProfile {
	assertForegroundContrastProfile(value)
	const scoringPreferences = value.backgroundScoringPreferenceMinimum === undefined
		? {}
		: {
			backgroundScoringPreferenceMinimum: value.backgroundScoringPreferenceMinimum,
			surfaceScoringPreferenceMinimum: value.surfaceScoringPreferenceMinimum,
		}
	const profile = Object.freeze({
		ordinary: Object.freeze({ ...value.ordinary }),
		strongTypography: Object.freeze({ ...value.strongTypography }),
		generatedFallback: Object.freeze({ ...value.generatedFallback }),
		sourceForegroundPreferenceMinimum: value.sourceForegroundPreferenceMinimum,
		...scoringPreferences,
	})
	validatedProfiles.add(profile)
	return profile
}

export const DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE = defineForegroundContrastProfile({
	ordinary: { backgroundMinimum: 3.5, surfaceMinimum: 3 },
	strongTypography: { backgroundMinimum: 3, surfaceMinimum: 2.5 },
	generatedFallback: { backgroundMinimum: 4.5, surfaceMinimum: 4.5 },
	sourceForegroundPreferenceMinimum: 3.5,
})

export const DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE = defineForegroundContrastProfile({
	ordinary: { backgroundMinimum: 3.5, surfaceMinimum: 3 },
	strongTypography: { backgroundMinimum: 3, surfaceMinimum: 2.5 },
	generatedFallback: { backgroundMinimum: 4.5, surfaceMinimum: 4.5 },
	sourceForegroundPreferenceMinimum: 4.5,
	backgroundScoringPreferenceMinimum: 4.5,
	surfaceScoringPreferenceMinimum: 4.5,
})

export function hasStrongTypographyEvidence(candidate: ForegroundContrastEvidence): boolean {
	return !candidate.generated && candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

export function resolveForegroundBackgroundRequirement(
	candidate: ForegroundContrastEvidence,
	profile?: ForegroundContrastProfile,
): number {
	if (profile) {
		assertForegroundContrastProfile(profile)
		if (candidate.generated) return profile.generatedFallback.backgroundMinimum
		return hasStrongTypographyEvidence(candidate)
			? profile.strongTypography.backgroundMinimum
			: profile.ordinary.backgroundMinimum
	}
	if (candidate.generated) return 4.5
	return hasStrongTypographyEvidence(candidate) ? 3 : 4
}

export function resolveForegroundSurfaceRequirement(
	candidate: ForegroundContrastEvidence,
	context: ForegroundSurfaceContext,
	profile?: ForegroundContrastProfile,
): number {
	if (profile) {
		assertForegroundContrastProfile(profile)
		if (candidate.generated) return profile.generatedFallback.surfaceMinimum
		return hasStrongTypographyEvidence(candidate)
			? profile.strongTypography.surfaceMinimum
			: profile.ordinary.surfaceMinimum
	}
	if (candidate.generated) return 4.5
	if (hasStrongTypographyEvidence(candidate) && context.foregroundBackgroundContrast < 4.5) return 2.5
	return context.foregroundBackgroundContrast < 4.5 || context.allowRepresentativeSurface ? 3 : 4.5
}

export function resolveSourceForegroundPreferenceMinimum(profile?: ForegroundContrastProfile): number {
	if (!profile) return 4.5
	assertForegroundContrastProfile(profile)
	return profile.sourceForegroundPreferenceMinimum
}

export function sourceForegroundIsPreferred(
	candidate: ForegroundContrastEvidence,
	contrast: number,
	profile?: ForegroundContrastProfile,
): boolean {
	return contrast >= resolveSourceForegroundPreferenceMinimum(profile) || hasStrongTypographyEvidence(candidate)
}

export function resolveForegroundBackgroundScoringBreakpoint(
	candidate: ForegroundContrastEvidence,
	contrast: number,
	profile?: ForegroundContrastProfile,
): number {
	const required = resolveForegroundBackgroundRequirement(candidate, profile)
	if (!profile) return contrast >= 4.5 ? 4.5 : required
	const preferred = Math.max(required, profile.backgroundScoringPreferenceMinimum ?? required)
	return contrast >= preferred ? preferred : required
}

export function resolveForegroundSurfaceScoringBreakpoint(
	candidate: ForegroundContrastEvidence,
	contrast: number,
	context: ForegroundSurfaceContext,
	profile?: ForegroundContrastProfile,
): number {
	const required = resolveForegroundSurfaceRequirement(candidate, context, profile)
	if (!profile) return contrast >= 4.5 ? 4.5 : required
	const preferred = Math.max(required, profile.surfaceScoringPreferenceMinimum ?? required)
	return contrast >= preferred ? preferred : required
}
