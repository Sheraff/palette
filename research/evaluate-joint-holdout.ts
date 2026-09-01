import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget, resolveOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { extractJointPalette } from "./src/joint-extract.ts"
import { JOINT_ALGORITHM_VERSION, type JointPaletteCertificate } from "./src/joint-palette.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const holdoutRoot = join(projectRoot, "00")
const output = resolveOutputTarget(projectRoot, researchRoot, "holdout-results.json", process.env.RESEARCH_OUTPUT_DIR)
const certificateOutput = resolveOutputTarget(projectRoot, researchRoot, "holdout-joint-certificates.json", process.env.RESEARCH_OUTPUT_DIR)
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function sourcePreference(file: string): number {
	if (file.startsWith("ab67616d0000b273")) return 2
	if (file.startsWith("ab67616d00001e02")) return 1
	return 0
}

const sourceByArtwork = new Map<string, string>()
await prepareOutputTarget(output)
await prepareOutputTarget(certificateOutput)
for (const file of (await readdir(holdoutRoot)).filter((candidate) => supported.has(extname(candidate).toLowerCase())).sort()) {
	const id = artworkId(file)
	const current = sourceByArtwork.get(id)
	if (!current || sourcePreference(file) > sourcePreference(current)) sourceByArtwork.set(id, file)
}
const files = [...sourceByArtwork.values()].sort()
const entries: CorpusResult["entries"] = []
const certificates: Record<string, JointPaletteCertificate> = {}
for (const [index, sourceFile] of files.entries()) {
	const file = `00/${sourceFile}`
	const image = await loadImage(join(holdoutRoot, sourceFile))
	const { extraction, certificate } = extractJointPalette(image)
	entries.push({ file, kind: "holdout", review: false, width: image.width, height: image.height, extraction })
	certificates[file] = certificate
	console.log(`[${index + 1}/${files.length}] ${file}: ${extraction.diagnostics.processingMs}ms`)
}
await writeJsonAtomic(output, {
	generatedAt: new Date().toISOString(),
	algorithmVersion: JOINT_ALGORITHM_VERSION,
	entries,
} satisfies CorpusResult)
await writeJsonAtomic(certificateOutput, {
	schemaVersion: 1,
	algorithmVersion: JOINT_ALGORITHM_VERSION,
	entries: certificates,
})
