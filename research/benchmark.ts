import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget, resolveOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { addDeterministicNoise, cropOnePixel, loadImage } from "./src/image.ts"
import type { Palette, RoleName } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const imagesRoot = join(projectRoot, "images")
const output = resolveOutputTarget(projectRoot, researchRoot, "robustness.json", process.env.RESEARCH_OUTPUT_DIR)
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const roles: RoleName[] = ["background", "foreground", "surface", "accent"]

function compare(first: Palette, second: Palette): Record<RoleName, number> {
	return Object.fromEntries(roles.map((role) => [
		role,
		okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)),
	])) as Record<RoleName, number>
}

await prepareOutputTarget(output)
const files = (await readdir(imagesRoot))
	.filter((file) => supported.has(extname(file).toLowerCase()))
	.filter((file) => !file.includes("-scrambled"))
	.filter((file) => !file.includes("-masked") && !file.includes("-saliency"))
	.sort()
const sourceFiles = await Promise.all(files.map(async (file) => [
	file,
	createHash("sha256").update(await readFile(join(imagesRoot, file))).digest("hex"),
] as const))
const sourceSemanticSha256 = createHash("sha256").update(JSON.stringify(sourceFiles)).digest("hex")

const entries = []
for (let index = 0; index < files.length; index++) {
	const file = files[index]
	const source = await loadImage(join(imagesRoot, file))
	const original = extractPalette(source).methods.spatial
	const cropped = extractPalette(cropOnePixel(source)).methods.spatial
	const noisy = extractPalette(addDeterministicNoise(source)).methods.spatial
	const cropDistance = compare(original, cropped)
	const noiseDistance = compare(original, noisy)
	entries.push({ file, cropDistance, noiseDistance })
	console.log(`[${index + 1}/${files.length}] ${file}`)
}

const values = entries.flatMap((entry) => [
	...Object.values(entry.cropDistance),
	...Object.values(entry.noiseDistance),
]).sort((first, second) => first - second)
const percentile = (ratio: number): number => values[Math.round((values.length - 1) * ratio)] || 0
const report = {
	generatedAt: new Date().toISOString(),
	algorithmVersion: ALGORITHM_VERSION,
	source: {
		corpus: "images",
		fileCount: sourceFiles.length,
		semanticSha256: sourceSemanticSha256,
	},
	thresholds: {
		medianAdvisory: 0.02,
		maximumAdvisory: 0.08,
	},
	summary: {
		median: percentile(0.5),
		p90: percentile(0.9),
		maximum: values.at(-1) || 0,
		warnings: values.filter((value) => value > 0.08).length,
	},
	entries,
}

await writeJsonAtomic(output, report)
console.log(report.summary)
