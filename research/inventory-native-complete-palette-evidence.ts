import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
	buildNativeCompletePaletteEvidenceInventory,
	nativeCompletePaletteEvidenceJson,
} from "./src/native-complete-palette-evidence.ts"

export const NATIVE_COMPLETE_PALETTE_EVIDENCE_OUTPUT =
	"research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json" as const

export async function writeNativeCompletePaletteEvidenceInventory(
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<{ path: string; sha256: string; bytes: number }> {
	const inventory = await buildNativeCompletePaletteEvidenceInventory(projectRoot)
	const bytes = Buffer.from(nativeCompletePaletteEvidenceJson(inventory))
	const outputPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_EVIDENCE_OUTPUT)
	await writeFile(outputPath, bytes)
	return {
		path: NATIVE_COMPLETE_PALETTE_EVIDENCE_OUTPUT,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		bytes: bytes.byteLength,
	}
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
	if (process.argv.length !== 2) throw new Error("inventory-native-complete-palette-evidence.ts does not accept arguments")
	const result = await writeNativeCompletePaletteEvidenceInventory()
	process.stdout.write(`${JSON.stringify(result)}\n`)
}
