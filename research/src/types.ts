export type RGB = readonly [red: number, green: number, blue: number]
export type OKLab = readonly [lightness: number, a: number, b: number]

export type RawImage = {
	width: number
	height: number
	data: Uint8Array
}

export type RoleName = "background" | "foreground" | "surface" | "accent"

export type RoleColor = {
	rgb: RGB
	hex: string
	generated: boolean
	sourceDistance: number
}

export type GradientEvidence = {
	isGradient: boolean
	confidence: number
	coverage: number
	continuity: number
	coherence: number
}

export type PaletteMetrics = {
	foregroundContrast: number
	foregroundSurfaceContrast: number
	accentContrast: number
	accentSurfaceContrast: number
	minimumRoleDistance: number
	meanSourceDistance: number
	meanReconstructionError: number
}

export type Palette = {
	background: RoleColor
	foreground: RoleColor
	surface: RoleColor
	accent: RoleColor
	gradient: GradientEvidence
	score: number
	metrics: PaletteMetrics
}

export type CandidateDiagnostic = {
	hex: string
	rgb: RGB
	population: number
	background: number
	saliency: number
	text: number
	chroma: number
}

export type ExtractionResult = {
	version: string
	width: number
	height: number
	methods: {
		spatial: Palette
		expressive: Palette
		quantized: Palette
	}
	candidates: CandidateDiagnostic[]
	diagnostics: {
		regionCount: number
		candidateCount: number
		processingMs: number
	}
}

export type CorpusEntry = {
	file: string
	kind: "artwork" | "synthetic" | "diagnostic" | "holdout"
	review: boolean
}

export type CorpusResult = {
	generatedAt: string
	algorithmVersion: string
	entries: Array<CorpusEntry & {
		width: number
		height: number
		extraction: ExtractionResult
	}>
}
