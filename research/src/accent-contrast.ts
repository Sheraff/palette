export type AccentContrastProfile = Readonly<{
	algorithm: "apca-w3-0.1.9"
	backgroundMinimumLc: number
	surfaceMinimumLc: number
}>

const profileKeys = ["algorithm", "backgroundMinimumLc", "surfaceMinimumLc"]
const validatedProfiles = new WeakSet<object>()

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validLc(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 108
}

export function assertAccentContrastProfile(value: unknown): asserts value is AccentContrastProfile {
	if (isRecord(value) && validatedProfiles.has(value)) return
	if (!isRecord(value) || Object.keys(value).sort().join(",") !== [...profileKeys].sort().join(",") ||
		value.algorithm !== "apca-w3-0.1.9" || !validLc(value.backgroundMinimumLc) ||
		!validLc(value.surfaceMinimumLc)) {
		throw new Error("Accent contrast profile is invalid")
	}
	if (Object.isFrozen(value)) validatedProfiles.add(value)
}

export function defineAccentContrastProfile(value: AccentContrastProfile): AccentContrastProfile {
	assertAccentContrastProfile(value)
	const profile = Object.freeze({
		algorithm: value.algorithm,
		backgroundMinimumLc: value.backgroundMinimumLc,
		surfaceMinimumLc: value.surfaceMinimumLc,
	})
	validatedProfiles.add(profile)
	return profile
}

export const UI_ACCENT_CONTRAST_PROFILE = defineAccentContrastProfile({
	algorithm: "apca-w3-0.1.9",
	backgroundMinimumLc: 10,
	surfaceMinimumLc: 10,
})
