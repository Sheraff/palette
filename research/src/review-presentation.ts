import { createHash } from "node:crypto"
import { namePalette, type ColorPresentationDescriptor } from "./color-name.ts"
import type { CorpusResult, Palette, RoleName, RGB } from "./types.ts"

const roles: readonly RoleName[] = ["background", "foreground", "surface", "accent"]

export const REVIEW_PRESENTATION_VERSION = 3 as const
export const REVIEW_COLOR_NAME_POLICY = "colornames-oklab-0.6.0-nearest-oklab-presentation-only" as const

export type ReviewPresentationEntry = {
	file: string
	sourceSha256: string
	canonical: Palette
	treatment: Palette
}

export type ReviewDuplicateCarryEdge = {
	representativeFile: string
	duplicateFile: string
	sourceSha256: string
	exactSourceBytes: true
	exactCanonicalPresentation: true
	exactTreatmentPresentation: true
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function renderedPalette(palette: Palette) {
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			generated: palette[role].generated,
		}])),
		gradient: palette.gradient.isGradient,
	}
}

export function buildReviewColorNames(...corpora: readonly CorpusResult[]): Record<string, ColorPresentationDescriptor> {
	const colors = new Map<string, RGB>()
	for (const corpus of corpora) {
		for (const entry of corpus.entries) {
			for (const method of ["spatial", "expressive", "quantized"] as const) {
				const palette = entry.extraction.methods[method]
				for (const role of roles) colors.set(rgbKey(palette[role].rgb), palette[role].rgb)
			}
		}
	}
	const ordered = [...colors.values()].sort((first, second) =>
		first[0] - second[0] || first[1] - second[1] || first[2] - second[2])
	const descriptors = namePalette(ordered)
	return Object.fromEntries(ordered.map((rgb, index) => [descriptors[index].sourceHex.toLowerCase(), descriptors[index]]))
}

function presentationKey(entry: ReviewPresentationEntry): string {
	return createHash("sha256").update(JSON.stringify({
		sourceSha256: entry.sourceSha256,
		canonical: renderedPalette(entry.canonical),
		treatment: renderedPalette(entry.treatment),
	})).digest("hex")
}

export function deduplicateReviewPresentations(entries: readonly ReviewPresentationEntry[]): {
	representatives: ReviewPresentationEntry[]
	duplicateCarryEdges: ReviewDuplicateCarryEdge[]
} {
	const groups = new Map<string, ReviewPresentationEntry[]>()
	for (const entry of entries) {
		if (!/^[0-9a-f]{64}$/.test(entry.sourceSha256)) throw new Error(`Invalid review source identity: ${entry.file}`)
		const key = presentationKey(entry)
		const group = groups.get(key)
		if (group) group.push(entry)
		else groups.set(key, [entry])
	}
	const representatives: ReviewPresentationEntry[] = []
	const duplicateCarryEdges: ReviewDuplicateCarryEdge[] = []
	for (const group of groups.values()) {
		group.sort((first, second) => first.file.localeCompare(second.file, "en"))
		const representative = group[0]
		representatives.push(representative)
		for (const duplicate of group.slice(1)) duplicateCarryEdges.push({
			representativeFile: representative.file,
			duplicateFile: duplicate.file,
			sourceSha256: representative.sourceSha256,
			exactSourceBytes: true,
			exactCanonicalPresentation: true,
			exactTreatmentPresentation: true,
		})
	}
	representatives.sort((first, second) => first.file.localeCompare(second.file, "en"))
	duplicateCarryEdges.sort((first, second) => first.duplicateFile.localeCompare(second.duplicateFile, "en"))
	return { representatives, duplicateCarryEdges }
}
