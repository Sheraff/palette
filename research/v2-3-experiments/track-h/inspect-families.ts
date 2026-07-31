/**
 * Dump per-family evidence for one artwork: the foreground lane ranking, the
 * mark terms, and the group geometry of the qualifying components.
 *
 * Read-only — it calls the exported `buildNativePaletteEvidence` and recomputes
 * the mark factors from the returned records, so it cannot perturb the runtime.
 *
 * usage: inspect-families.ts <image-path-relative-to-root> [--focus <hexprefix>] [--top N]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import type { ColorFamilyEvidence } from "../../v2-3/src/internal/palette-core.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const MARK = ALBUM_ARTWORK_PALETTE_V2_POLICY.mark

const target = process.argv[2]
if (!target) throw new Error("usage: inspect-families.ts <image> [--focus hex] [--top N]")
const focusIndex = process.argv.indexOf("--focus")
const focus = focusIndex > 0 ? process.argv[focusIndex + 1] : null
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 14

const clamp = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
const mean = (values: readonly number[]) =>
	values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
const foregroundRoleScore = (family: ColorFamilyEvidence) =>
	clamp(0.60 * family.foregroundScore + 0.40 * family.foregroundTypographyObservation)
const signatureRoleScore = (family: ColorFamilyEvidence) =>
	clamp(0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation)

const toHex = ([l, a, b]: readonly number[]) => {
	// OKLab -> sRGB, matching color.ts closely enough for a label.
	const l_ = l + 0.3963377774 * a + 0.2158037573 * b
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b
	const s_ = l - 0.0894841775 * a - 1.2914855480 * b
	const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3]
	const lin = [
		+4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
		-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
		-0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
	]
	const enc = lin.map((c) => {
		const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
		return Math.max(0, Math.min(255, Math.round(v * 255)))
	})
	return `#${enc.map((c) => c.toString(16).padStart(2, "0")).join("")}`
}

const image = await loadNativeImage(`${ROOT}/${target}`)
const pixelCount = image.width * image.height
const evidence = buildNativePaletteEvidence(image)
console.log(`${target}  ${image.width}x${image.height}  ${pixelCount} px  ${evidence.families.length} families\n`)

const minimumPopulation = Math.max(MARK.minimumComponentPopulation, MARK.minimumComponentFraction * pixelCount)

type Row = ReturnType<typeof describe>
function describe(family: ColorFamilyEvidence) {
	const qualifying = family.components.filter(({ population, retainedFor, observation }) =>
		retainedFor.includes("role-observation") &&
		population >= minimumPopulation &&
		observation.repetition >= MARK.minimumRepetition &&
		observation.borderContact <= MARK.maximumBorderContact &&
		observation.fill >= MARK.minimumFill)
	const strokes = [...qualifying]
		.sort((a, b) => b.observation.signatureAccent.score - a.observation.signatureAccent.score)
		.slice(0, MARK.saturationComponentCount)
	const plurality = clamp(
		(qualifying.length - MARK.minimumComponentCount + 1) /
		(MARK.saturationComponentCount - MARK.minimumComponentCount + 1))
	const coherence = mean(strokes.map(({ observation }) => observation.repetition))
	const resolution = mean(strokes.map(({ observation }) => observation.signatureAccent.geometry))
	const strokeCoverage = clamp(
		qualifying.reduce((sum, { population }) => sum + population, 0) / Math.max(1, family.population))
	const enumerability = clamp(qualifying.length / Math.max(1, family.componentCount))
	// group geometry of the qualifying set
	const box = qualifying.length === 0 ? null : {
		minX: Math.min(...qualifying.map((c) => c.minX)),
		minY: Math.min(...qualifying.map((c) => c.minY)),
		maxX: Math.max(...qualifying.map((c) => c.maxX)),
		maxY: Math.max(...qualifying.map((c) => c.maxY)),
	}
	const groupBoxFraction = box === null
		? 0
		: ((box.maxX - box.minX + 1) * (box.maxY - box.minY + 1)) / pixelCount
	const groupFill = box === null
		? 0
		: qualifying.reduce((sum, { population }) => sum + population, 0) /
			Math.max(1, (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1))
	const heights = qualifying.map((c) => c.maxY - c.minY + 1)
	const heightMean = mean(heights)
	const heightCV = heightMean === 0
		? 0
		: Math.sqrt(mean(heights.map((h) => (h - heightMean) ** 2))) / heightMean
	return {
		family,
		hex: toHex(family.prototype),
		qualifying: qualifying.length,
		observed: family.observedComponentCount,
		components: family.componentCount,
		retained: family.components.length,
		plurality, coherence, resolution, strokeCoverage, enumerability,
		markSupport: family.markSupport,
		groupBoxFraction, groupFill, heightCV, heightMean,
		fgRole: foregroundRoleScore(family),
		sigRole: signatureRoleScore(family),
	}
}

const rows: Row[] = evidence.families.map(describe)

const header = "family        hex      popFrac  comps ret obs qual | mark   plur cohe reso strk enum | grpBox% grpFill hCV  hMean | fgScore fgTypo fgRole | sigRole"
const format = (r: Row) =>
	`${r.family.id.padEnd(13)} ${r.hex} ${(r.family.populationFraction * 100).toFixed(3).padStart(7)}% ${String(r.components).padStart(5)} ${String(r.retained).padStart(3)} ${String(r.observed).padStart(3)} ${String(r.qualifying).padStart(4)} | ${r.markSupport.toFixed(3)} ${r.plurality.toFixed(2)} ${r.coherence.toFixed(2)} ${r.resolution.toFixed(2)} ${r.strokeCoverage.toFixed(2)} ${r.enumerability.toFixed(2)} | ${(r.groupBoxFraction * 100).toFixed(2).padStart(6)} ${r.groupFill.toFixed(3)} ${r.heightCV.toFixed(2)} ${r.heightMean.toFixed(1).padStart(5)} | ${r.family.foregroundScore.toFixed(3)}  ${r.family.foregroundTypographyObservation.toFixed(3)} ${r.fgRole.toFixed(3)} | ${r.sigRole.toFixed(3)}`

if (focus) {
	const hits = rows.filter((r) => r.hex.startsWith(focus) || r.family.id === focus)
	console.log(header)
	for (const r of hits) console.log(format(r))
	console.log()
	for (const r of hits) {
		console.log(`--- ${r.family.id} ${r.hex}: retained components (qualifying marked *)`)
		for (const c of r.family.components) {
			const q = c.retainedFor.includes("role-observation") &&
				c.population >= minimumPopulation &&
				c.observation.repetition >= MARK.minimumRepetition &&
				c.observation.borderContact <= MARK.maximumBorderContact &&
				c.observation.fill >= MARK.minimumFill
			console.log(`  ${q ? "*" : " "} pop ${String(c.population).padStart(6)}  box ${String(c.maxX - c.minX + 1).padStart(4)}x${String(c.maxY - c.minY + 1).padStart(4)} @(${c.minX},${c.minY})  fill ${c.observation.fill.toFixed(3)} rep ${c.observation.repetition.toFixed(3)} border ${c.observation.borderContact.toFixed(3)} geo ${c.observation.foregroundTypography.geometry.toFixed(3)} src ${c.observation.foregroundTypography.sourceSupport.toFixed(3)} typoScore ${c.observation.foregroundTypography.score.toFixed(3)} for=[${c.retainedFor.join(",")}]`)
		}
	}
} else {
	console.log("=== foreground lane (top by foregroundRoleScore)")
	console.log(header)
	for (const r of [...rows].sort((a, b) => b.fgRole - a.fgRole).slice(0, top)) console.log(format(r))
	console.log("\n=== by markSupport")
	console.log(header)
	for (const r of [...rows].sort((a, b) => b.markSupport - a.markSupport).slice(0, 8)) console.log(format(r))
	console.log("\n=== by population")
	console.log(header)
	for (const r of [...rows].sort((a, b) => b.family.populationFraction - a.family.populationFraction).slice(0, 8)) console.log(format(r))
}
