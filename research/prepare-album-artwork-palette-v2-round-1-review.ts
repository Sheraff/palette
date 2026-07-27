import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.1.0-development/review-manifest.json")

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

const current = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>
const { manifestId: _manifestId, reviewVersion: _reviewVersion, reviewUnit: _reviewUnit, ...stable } = current
const withoutId = {
	...stable,
	reviewVersion: "album-artwork-palette-v2-phase-3-selected-treatment-review-2",
	reviewUnit: "one-selected-treatment-assessment-per-artwork",
}
const manifest = { ...withoutId, manifestId: sha256(canonicalJson(withoutId)) }
const temporary = `${manifestPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
await rename(temporary, manifestPath)
process.stdout.write(`Prepared selected-treatment review manifest ${manifest.manifestId}\n`)
