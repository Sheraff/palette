import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { contrastRatio, labAt, okDistance, rgbToOKLab, roleMinimumDistance } from "./src/color.ts"
import { namePalette } from "./src/color-name.ts"
import type { Candidate } from "./src/candidates.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext } from "./src/extract.ts"
import { solveGuardedPalette } from "./src/guarded-palette.ts"
import { loadImage } from "./src/image.ts"
import { detectGradient, solvePalette } from "./src/palette.ts"
import {
	PALETTE_ROLE_PRESENTATION_VERSION,
	PALETTE_ROLE_REVIEW_VERSION,
	paletteRoleManifestId,
	paletteRoleNames,
	type PaletteRoleReviewEntry,
	type PaletteRoleReviewManifest,
	type PresentedAlternative,
	type PresentedPalette,
} from "./src/palette-role-review.ts"
import type { Palette, PaletteMetrics, RGB, RoleColor, RoleName } from "./src/types.ts"
import type { RegionAnalysis } from "./src/regions.ts"

type SourcePlan = {
	file: string
	priorEvidence: string
	targetRoles: RoleName[]
}

const sources: SourcePlan[] = [
	{
		file: "00/ab67616d0000b2730000e47a4e869d4323ad0e3d.jpg",
		priorEvidence: "0.17 absolute review: palette lacked the artwork's color identity",
		targetRoles: ["surface", "accent"],
	},
	{
		file: "00/ab67616d0000b273000062690f9a82145c2fb5df.jpg",
		priorEvidence: "0.17 absolute review: accent too similar to foreground; possible yellow alternative",
		targetRoles: ["accent"],
	},
	{
		file: "00/ab67616d00001e0200004b1453b0c6d8d31c435b.jpg",
		priorEvidence: "0.17 absolute review: accent looked invented or mixed",
		targetRoles: ["accent"],
	},
	{
		file: "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg",
		priorEvidence: "0.17 absolute review: surface looked invented or mixed",
		targetRoles: ["surface"],
	},
	{
		file: "00/ab67616d0000b27300003bdffa5565ae80d51afa.jpg",
		priorEvidence: "0.17 absolute review: surface looked invented or mixed",
		targetRoles: ["surface"],
	},
]

const [outputArgument, ...unexpected] = process.argv.slice(2)
if (!outputArgument || unexpected.length > 0) {
	throw new Error("Usage: prepare-palette-role-attribution-review.ts <manifest.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputPath = resolve(outputArgument)
const absoluteFeedbackPath = resolve(researchRoot, "data/absolute-feedback.json")
const implementationFiles = [
	"research/prepare-palette-role-attribution-review.ts",
	"research/serve-palette-role-attribution-review.ts",
	"research/src/palette-role-review.ts",
	"research/src/extract.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/image.ts",
	"research/src/color-name.ts",
]
const presentationFiles = [
	"research/palette-role-review/index.html",
	"research/palette-role-review/app.js",
	"research/palette-role-review/styles.css",
]

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileHashes(files: string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(resolve(projectRoot, file)))])))
}

function sameRGB(first: readonly number[], second: readonly number[]): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function paletteKey(palette: Palette): string {
	return paletteRoleNames.map((role) => palette[role].hex.toLowerCase()).join(":")
}

function changedRoles(current: Palette, alternative: Palette): RoleName[] {
	return paletteRoleNames.filter((role) => !sameRGB(current[role].rgb, alternative[role].rgb))
}

function candidateForRole(candidates: readonly Candidate[], role: RoleColor): Candidate | null {
	if (role.generated) return null
	return [...candidates].filter((candidate) => sameRGB(candidate.rgb, role.rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || first.id - second.id)[0] ?? null
}

function nearestSourceDistance(rgb: RGB, analysis: RegionAnalysis): number {
	const lab = rgbToOKLab(rgb)
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(lab, region.lab))
	return Number.isFinite(nearest) ? nearest : 0
}

function roleColor(candidate: Candidate, analysis: RegionAnalysis): RoleColor {
	return { rgb: candidate.rgb, hex: candidate.hex, generated: false, sourceDistance: nearestSourceDistance(candidate.rgb, analysis) }
}

function paletteMetrics(palette: Pick<Palette, RoleName>, analysis: RegionAnalysis): PaletteMetrics {
	const labs = paletteRoleNames.map((role) => rgbToOKLab(palette[role].rgb))
	let reconstruction = 0
	let samples = 0
	const pixelCount = analysis.width * analysis.height
	const stride = Math.max(1, Math.floor(pixelCount / 12_000))
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		reconstruction += Math.min(...labs.map((roleLab) => okDistance(lab, roleLab)))
		samples++
	}
	return {
		foregroundContrast: contrastRatio(palette.background.rgb, palette.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(palette.surface.rgb, palette.foreground.rgb),
		accentContrast: contrastRatio(palette.background.rgb, palette.accent.rgb),
		accentSurfaceContrast: contrastRatio(palette.surface.rgb, palette.accent.rgb),
		minimumRoleDistance: roleMinimumDistance(labs),
		meanSourceDistance: paletteRoleNames.reduce((sum, role) =>
			sum + nearestSourceDistance(palette[role].rgb, analysis), 0) / paletteRoleNames.length,
		meanReconstructionError: samples === 0 ? 0 : reconstruction / samples,
	}
}

function isStrongTypography(candidate: Candidate | null): boolean {
	return !!candidate && candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

function paletteIsSafe(palette: Palette, candidates: readonly Candidate[]): boolean {
	const background = candidateForRole(candidates, palette.background)
	const foreground = candidateForRole(candidates, palette.foreground)
	const surface = candidateForRole(candidates, palette.surface)
	const accent = candidateForRole(candidates, palette.accent)
	if (!background || background.typographyOnly || !surface || surface.typographyOnly || (!palette.accent.generated && !accent)) return false
	const backgroundRequirement = palette.foreground.generated ? 4.5 : isStrongTypography(foreground) ? 3 : 4
	const surfaceRequirement = palette.foreground.generated ? 4.5 : isStrongTypography(foreground) ? 2.5 : 3
	if (contrastRatio(palette.background.rgb, palette.foreground.rgb) < backgroundRequirement ||
		contrastRatio(palette.surface.rgb, palette.foreground.rgb) < surfaceRequirement) return false
	const backgroundSurfaceDistance = okDistance(background.lab, surface.lab)
	if (!sameRGB(background.rgb, surface.rgb) && backgroundSurfaceDistance < 0.05) return false
	if (sameRGB(palette.accent.rgb, palette.foreground.rgb)) return true
	if (!accent || sameRGB(accent.rgb, background.rgb) || sameRGB(accent.rgb, surface.rgb) ||
		contrastRatio(accent.rgb, background.rgb) < 1.2 || contrastRatio(accent.rgb, surface.rgb) < 1.2 ||
		okDistance(accent.lab, background.lab) < 0.08 || okDistance(accent.lab, surface.lab) < 0.06) return false
	return true
}

function replaceRole(
	current: Palette,
	role: RoleName,
	candidate: Candidate,
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
): Palette | null {
	const roles = { ...current, [role]: roleColor(candidate, analysis) }
	const background = role === "background" ? candidate : candidateForRole(candidates, roles.background)
	const surface = role === "surface" ? candidate : candidateForRole(candidates, roles.surface)
	if (!background || !surface) return null
	const gradient = role === "background" || role === "surface"
		? detectGradient(background, surface, analysis)
		: { ...current.gradient }
	const palette: Palette = { ...roles, gradient, score: current.score, metrics: paletteMetrics(roles, analysis) }
	return paletteIsSafe(palette, candidates) ? palette : null
}

function largestComponent(candidate: Candidate): number {
	return candidate.familySpatial.components.reduce((largest, component) => Math.max(largest, component.population), 0)
}

function replacementScore(role: RoleName, candidate: Candidate, current: Palette): number {
	const population = Math.sqrt(candidate.population)
	if (role === "background") {
		return candidate.familySpatial.field * 0.38 + candidate.background * 0.3 + population * 0.2 - candidate.familySpatial.frame * 0.45
	}
	if (role === "surface") {
		if (sameRGB(candidate.rgb, current.background.rgb)) return 1.1
		return candidate.familySpatial.field * 0.42 + largestComponent(candidate) * 0.25 +
			candidate.background * 0.18 + population * 0.15 - candidate.familySpatial.frame * 0.35
	}
	if (role === "foreground") {
		return candidate.text * 0.38 + candidate.saliency * 0.32 + population * 0.15 +
			Math.min(contrastRatio(candidate.rgb, current.background.rgb) / 10, 1) * 0.15
	}
	const minimumContrast = Math.min(
		contrastRatio(candidate.rgb, current.background.rgb),
		contrastRatio(candidate.rgb, current.surface.rgb),
	)
	return Math.min(candidate.chroma / 0.2, 1) * 0.32 + candidate.saliency * 0.28 +
		candidate.spatial.detail * 0.16 + population * 0.12 + Math.min(minimumContrast / 4.5, 1) * 0.12
}

function presentPalette(palette: Palette): PresentedPalette {
	const names = namePalette(paletteRoleNames.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(paletteRoleNames.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex,
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as PresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
		backgroundSurface: {
			oklabDistance: okDistance(rgbToOKLab(palette.background.rgb), rgbToOKLab(palette.surface.rgb)),
			contrast: contrastRatio(palette.background.rgb, palette.surface.rgb),
			collapsed: sameRGB(palette.background.rgb, palette.surface.rgb),
		},
	}
}

function buildAlternatives(
	current: Palette,
	targetRoles: readonly RoleName[],
	candidates: Candidate[],
	analysis: RegionAnalysis,
	expressive: Palette,
): PresentedAlternative[] {
	const seen = new Set([paletteKey(current)])
	const selected: Array<{ kind: PresentedAlternative["kind"]; palette: Palette; score: number }> = []
	const substitutions: Array<{ kind: "candidate-substitution"; palette: Palette; score: number }> = []
	for (const role of targetRoles) {
		for (const candidate of candidates) {
			if (sameRGB(candidate.rgb, current[role].rgb)) continue
			const palette = replaceRole(current, role, candidate, candidates, analysis)
			if (!palette || seen.has(paletteKey(palette))) continue
			substitutions.push({ kind: "candidate-substitution", palette, score: replacementScore(role, candidate, current) })
		}
	}
	substitutions.sort((first, second) => second.score - first.score || paletteKey(first.palette).localeCompare(paletteKey(second.palette), "en"))
	for (const option of substitutions) {
		const key = paletteKey(option.palette)
		if (seen.has(key)) continue
		seen.add(key)
		selected.push(option)
		if (selected.length === 4) break
	}
	const solverDirections = [
		solvePalette(candidates, analysis, "spatial"),
		solveGuardedPalette(candidates, analysis).palette,
		expressive,
	]
	for (const palette of solverDirections) {
		const key = paletteKey(palette)
		if (seen.has(key) || !paletteIsSafe(palette, candidates) || changedRoles(current, palette).length === 0) continue
		seen.add(key)
		selected.push({ kind: "solver-direction", palette, score: 0 })
		if (selected.length === 5) break
	}
	if (selected.length === 0) throw new Error("Review case produced no safe complete-palette alternatives")
	return selected.slice(0, 5).map((alternative, index) => ({
		id: `A${String(index + 1).padStart(2, "0")}`,
		kind: alternative.kind,
		changedRoles: changedRoles(current, alternative.palette),
		palette: presentPalette(alternative.palette),
	}))
}

async function prepareEntry(plan: SourcePlan): Promise<PaletteRoleReviewEntry> {
	const path = resolve(projectRoot, plan.file)
	const bytes = await readFile(path)
	const sourceSha256 = sha256(bytes)
	const metadata = await sharp(bytes).metadata()
	if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions for ${plan.file}`)
	const image = await loadImage(bytes)
	const context = extractPaletteWithContext(image)
	const current = context.extraction.methods.spatial
	return {
		caseId: `pr-${sha256(`${PALETTE_ROLE_REVIEW_VERSION}\0${sourceSha256}`).slice(0, 20)}`,
		source: { file: plan.file, sha256: sourceSha256, bytes: bytes.byteLength, width: metadata.width, height: metadata.height },
		developmentContext: { priorEvidence: plan.priorEvidence, targetRoles: plan.targetRoles },
		normalized: { width: image.width, height: image.height },
		current: presentPalette(current),
		alternatives: buildAlternatives(
			current, plan.targetRoles, context.candidates, context.analysis, context.extraction.methods.expressive,
		),
	}
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const entries: PaletteRoleReviewEntry[] = []
for (const source of sources) entries.push(await prepareEntry(source))
entries.sort((first, second) => sha256(`order\0${first.caseId}`).localeCompare(sha256(`order\0${second.caseId}`), "en"))
const identity: Omit<PaletteRoleReviewManifest, "manifestId" | "generatedAt"> = {
	schemaVersion: 2,
	reviewVersion: PALETTE_ROLE_REVIEW_VERSION,
	presentationVersion: PALETTE_ROLE_PRESENTATION_VERSION,
	algorithmVersion: ALGORITHM_VERSION,
	provenance: {
		sourceSelectionSha256: sha256(JSON.stringify(sources)),
		absoluteFeedbackSha256: sha256(await readFile(absoluteFeedbackPath)),
		implementation: await fileHashes(implementationFiles),
		presentation: await fileHashes(presentationFiles),
	},
	entries,
}
const manifest: PaletteRoleReviewManifest = {
	...identity,
	generatedAt: new Date().toISOString(),
	manifestId: paletteRoleManifestId(identity),
}
await writeExclusiveJson(outputPath, manifest)
process.stderr.write(`Prepared ${entries.length} live-preview palette counterexample cases at ${relative(projectRoot, outputPath)}\n`)
