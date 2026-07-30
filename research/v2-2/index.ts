import { extractPaletteDetails } from "./src/internal/palette.ts"
import { loadNativeImage } from "./src/internal/native-resolution-image.ts"
import type { LoadNativeImageOptions } from "./src/internal/native-resolution-image.ts"
import type { OKLab, RawImage, RGB } from "./src/internal/types.ts"

export type { RawImage } from "./src/internal/types.ts"
export type { LoadNativeImageOptions } from "./src/internal/native-resolution-image.ts"

export const algorithmIdentity = "v2-2" as const

export type PaletteColor = Readonly<{
	rgb: RGB
	oklab: OKLab
	hex: string
	generated: boolean
}>

export type PaletteTreatment = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	foreground: PaletteColor
	accent: PaletteColor
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

export type SourceSupportedMidpointRender = Readonly<{
	schemaVersion: 1
	field: Readonly<{
		kind: "linear-gradient"
		angleDegrees: 135
		interpolation: "oklab"
		stops: readonly [
			Readonly<{ kind: "role"; role: "background"; position: 0 }>,
			Readonly<{ kind: "source-supported-color"; hex: string; position: 0.5 }>,
			Readonly<{ kind: "role"; role: "surface"; position: 1 }>,
		]
	}>
}>

export type PaletteExtraction = Readonly<{
	algorithm: typeof algorithmIdentity
	width: number
	height: number
	winner: PaletteTreatment
	researchRender?: SourceSupportedMidpointRender
}>

export function extractPalette(image: RawImage): PaletteExtraction {
	const details = extractPaletteDetails(image)
	const roles = ["background", "surface", "foreground", "accent"] as const
	const colors = Object.fromEntries(roles.map((role) => {
		const { rgb, oklab, hex, generated } = details.winner[role]
		return [role, { rgb, oklab, hex, generated }]
	})) as Record<typeof roles[number], PaletteColor>
	const researchRender: SourceSupportedMidpointRender | undefined =
		details.midpoint.kind === "source-supported-three-stop"
			? {
				schemaVersion: 1,
				field: {
					kind: "linear-gradient",
					angleDegrees: 135,
					interpolation: "oklab",
					stops: [
						{ kind: "role", role: "background", position: 0 },
						{ kind: "source-supported-color", hex: details.midpoint.color.hex, position: 0.5 },
						{ kind: "role", role: "surface", position: 1 },
					],
				},
			}
			: undefined
	return {
		algorithm: algorithmIdentity,
		width: details.width,
		height: details.height,
		winner: {
			...colors,
			gradient: details.winner.gradient,
			collapse: details.winner.collapse,
		},
		...(researchRender ? { researchRender } : {}),
	}
}

export async function extractPaletteFromBytes(
	source: string | Uint8Array,
	options?: LoadNativeImageOptions,
): Promise<PaletteExtraction> {
	return extractPalette(await loadNativeImage(source, options))
}
