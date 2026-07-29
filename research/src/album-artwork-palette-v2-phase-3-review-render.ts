import type { CompletePaletteReviewResearchRender } from "./complete-palette-review-v2.ts"

type JsonObject = Record<string, unknown>

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_REVIEW_RENDER_VERSION =
	"phase-3-supported-gradient-three-stop-review-render-v1" as const

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function rgbHex(rgb: readonly number[]): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function sameMidpoint(first: JsonObject, second: JsonObject): boolean {
	if (first.kind !== second.kind || first.position !== second.position ||
		!isObject(first.color) || !isObject(second.color) ||
		first.color.hex !== second.color.hex || !Array.isArray(first.color.rgb) ||
		!Array.isArray(second.color.rgb) || first.color.rgb.length !== second.color.rgb.length ||
		first.color.rgb.some((channel, index) => channel !== (second.color!.rgb as unknown[])[index]) ||
		!isObject(first.provenance) || !isObject(second.provenance)) return false
	for (const key of ["exactSource", "familyId", "regionId", "pixelIndex", "x", "y", "fieldDomainId",
		"stageIndex", "spatialPosition", "colorPosition", "populationFraction"] as const) {
		if (first.provenance[key] !== second.provenance[key]) return false
	}
	return true
}

export function projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
	output: unknown,
	identity: Readonly<{ attemptId: string; configurationId: string }>,
	label: string,
): CompletePaletteReviewResearchRender | undefined {
	if (identity.attemptId !== "phase-3-supported-gradient-path") return undefined
	invariant(isObject(output) && isObject(output.winner) && isObject(output.winner.treatment) &&
		isObject(output.diagnostics) && isObject(output.dimensions), `${label} is missing supported-gradient output custody`)
	const root = output.diagnostics.phase3SupportedGradientPath
	invariant(isObject(root) && root.configurationId === identity.configurationId,
		`${label} supported-gradient diagnostics do not match the attempt identity`)
	const authority = root.gradientAuthority
	const supported = root.supportedGradientPath
	invariant(isObject(authority) && isObject(supported) && Array.isArray(supported.paths),
		`${label} is missing supported-gradient render authority`)
	const winnerKey = output.winner.key
	const winner = output.winner.treatment
	invariant(typeof winnerKey === "string" && authority.winnerKey === winnerKey,
		`${label} supported-gradient render authority is stale`)
	const midpoint = authority.midpoint
	if (isObject(midpoint) && midpoint.kind === "none") return undefined
	if (isObject(midpoint) && midpoint.kind === "ordinary-two-stop") {
		invariant(winner.gradient === true, `${label} ordinary two-stop authority is stale`)
		return undefined
	}
	invariant(winner.gradient === true, `${label} source-supported render authority is stale`)
	invariant(isObject(midpoint) && midpoint.kind === "source-supported-three-stop" && midpoint.position === 0.5 &&
		isObject(midpoint.color) && isObject(midpoint.provenance), `${label} has an invalid supported-gradient midpoint`)
	const color = midpoint.color
	const provenance = midpoint.provenance
	invariant(typeof color.hex === "string" && /^#[0-9a-f]{6}$/u.test(color.hex) && Array.isArray(color.rgb) &&
		color.rgb.length === 3 && color.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) &&
		rgbHex(color.rgb as number[]) === color.hex, `${label} midpoint RGB and hex custody disagree`)
	invariant(provenance.exactSource === true && Number.isSafeInteger(provenance.pixelIndex) &&
		Number.isSafeInteger(provenance.x) && Number.isSafeInteger(provenance.y),
		`${label} midpoint lacks exact source custody`)
	const width = output.dimensions.width
	const height = output.dimensions.height
	invariant(Number.isSafeInteger(width) && (width as number) > 0 && Number.isSafeInteger(height) &&
		(height as number) > 0 && (provenance.x as number) >= 0 && (provenance.x as number) < (width as number) &&
		(provenance.y as number) >= 0 && (provenance.y as number) < (height as number) &&
		provenance.pixelIndex === (provenance.y as number) * (width as number) + (provenance.x as number),
		`${label} midpoint source coordinates are invalid`)
	const pathIndex = authority.correspondingPathIndex
	invariant(Number.isSafeInteger(pathIndex) && (pathIndex as number) >= 0 &&
		(pathIndex as number) < supported.paths.length, `${label} midpoint path index is invalid`)
	const path = supported.paths[pathIndex as number]
	invariant(isObject(path) && path.eligible === true && path.hypothesisId === winner.sourceFieldHypothesisId &&
		isObject(path.midpointCustody) && sameMidpoint(midpoint, path.midpointCustody),
		`${label} midpoint is not bound to the rendered winner path`)
	return {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: color.hex, position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	}
}
