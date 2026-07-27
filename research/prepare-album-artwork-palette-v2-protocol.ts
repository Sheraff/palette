import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./src/album-artwork-palette-v2-protocol.ts"

type InventoryVariant = Readonly<{
	path: string
	byteCount: number
	sha256: string
	artworkId: string
	jpegSignatures: Readonly<{ startsWithSoi: boolean; endsWithEoi: boolean }>
}>

type InventoryFamily = Readonly<{
	artworkId: string
	preferredSourcePath: string
	variants: readonly InventoryVariant[]
}>

type Inventory = Readonly<{
	inventoryVersion: string
	inventoryId: string
	families: readonly InventoryFamily[]
}>

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset" | "fresh"
	structureTags: readonly string[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const inventoryPath = resolve(moduleDirectory, "data/source-provenance-inventory-00-14.json")
const developmentOutputPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const freshOutputPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-fresh-sample.sealed.json")

const STRESS_SOURCES = [
	["images/pureblack.jpg", ["genuinely one-color", "emergency unsupported color"]],
	["images/purered.jpg", ["genuinely one-color", "exceptionally low supported contrast"]],
	["images/birdsofprey.jpg", ["broad gradient", "photography and portrait", "highly chromatic"]],
	["images/placebo.jpg", ["photography and portrait", "low-chroma", "typography-led"]],
	["images/maroon5-original.jpg", ["flat layered fields", "illustration", "typography-led"]],
	["images/infected.jpg", ["illustration", "small signature colors", "highly chromatic"]],
	["images/muse.jpg", ["monochrome", "photography", "strong corner fields"]],
	["images/elephunk.jpg", ["frame and border", "flat layered fields", "typography-led"]],
	["images/ybbb.jpg", ["minimalist", "small repeated signatures", "textured field"]],
	["images/snarky.jpg", ["minimalist", "repeated small signatures", "no defensible distinct surface"]],
	["images/toxicity.jpg", ["photography", "typography-led", "small signature color", "compressed or noisy"]],
	["images/vvbrown.jpg", ["portrait", "monochrome and low-chroma", "typography-led"]],
	["images/once.jpg", ["low-chroma", "frame and border", "near-uniform"]],
	["images/black.jpg", ["near-uniform", "small coherent signature", "no defensible distinct accent"]],
	["images/horrorwood.jpg", ["high-detail artwork", "photography", "small signature colors"]],
	["images/nada.jpg", ["broad flat field", "repeated small signatures", "highly chromatic"]],
	["images/havana.jpg", ["flat layered fields", "illustration", "broad fields"]],
	["images/artofficial.jpg", ["collage", "high-detail artwork", "highly chromatic"]],
	["images/knuckles.jpg", ["compressed or noisy", "photography", "low source quality"]],
] as const

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

function variantFor(family: InventoryFamily): InventoryVariant {
	const variant = family.variants.find(({ path }) => path === family.preferredSourcePath)
	if (!variant) throw new Error(`Missing preferred variant ${family.preferredSourcePath}`)
	if (!variant.jpegSignatures.startsWithSoi || !variant.jpegSignatures.endsWithEoi) {
		throw new Error(`Invalid JPEG signatures for ${variant.path}`)
	}
	return variant
}

function sourceSelectionKey(domain: string, inventoryId: string, family: InventoryFamily, variant: InventoryVariant): string {
	return sha256(`${domain}\0${inventoryId}\0${family.artworkId}\0${variant.path}\0${variant.sha256}`)
}

function selectInventorySources(
	inventory: Inventory,
	roots: readonly string[],
	perRoot: number,
	domain: string,
	cohort: "dataset" | "fresh",
): SourceRecord[] {
	const output: SourceRecord[] = []
	const seenHashes = new Set<string>()
	for (const root of roots) {
		const candidates = inventory.families
			.filter(({ preferredSourcePath }) => preferredSourcePath.startsWith(`${root}/`))
			.map((family) => ({ family, variant: variantFor(family) }))
			.sort((first, second) => {
				const firstKey = sourceSelectionKey(domain, inventory.inventoryId, first.family, first.variant)
				const secondKey = sourceSelectionKey(domain, inventory.inventoryId, second.family, second.variant)
				return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0
			})
		let selected = 0
		for (const { family, variant } of candidates) {
			if (seenHashes.has(variant.sha256)) continue
			seenHashes.add(variant.sha256)
			output.push({
				caseId: `${cohort}-${String(output.length + 1).padStart(2, "0")}`,
				path: variant.path,
				sha256: variant.sha256,
				byteCount: variant.byteCount,
				artworkId: family.artworkId,
				cohort,
				structureTags: cohort === "dataset" ? ["dataset diversity probe"] : [],
			})
			selected += 1
			if (selected === perRoot) break
		}
		if (selected !== perRoot) throw new Error(`Could not select ${perRoot} independent sources from ${root}`)
	}
	return output
}

async function stressSources(): Promise<SourceRecord[]> {
	const output: SourceRecord[] = []
	for (const [path, structureTags] of STRESS_SOURCES) {
		const bytes = await readFile(resolve(projectRoot, path))
		output.push({
			caseId: `stress-${String(output.length + 1).padStart(2, "0")}`,
			path,
			sha256: sha256(bytes),
			byteCount: bytes.byteLength,
			artworkId: `exact:${sha256(bytes)}`,
			cohort: "stress",
			structureTags,
		})
	}
	return output
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }).catch(async (error: unknown) => {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	})
	await rename(temporary, path)
}

async function main(): Promise<void> {
	const inventoryBytes = await readFile(inventoryPath)
	const inventory = JSON.parse(inventoryBytes.toString("utf8")) as Inventory
	if (inventory.inventoryVersion !== "source-provenance-inventory-00-14-v1") {
		throw new Error(`Unexpected inventory version ${inventory.inventoryVersion}`)
	}

	const stress = await stressSources()
	const dataset = selectInventorySources(
		inventory,
		["00", "01", "02", "03", "04", "05", "06", "07", "08"],
		1,
		"album-artwork-palette-v2-development-source-selection-v1",
		"dataset",
	)
	const sources = [...stress, ...dataset].map((source, index) => ({
		...source,
		caseId: `development-${String(index + 1).padStart(2, "0")}`,
	}))
	const developmentWithoutId = {
		schemaVersion: 1,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		inventoryVersion: inventory.inventoryVersion,
		inventoryId: inventory.inventoryId,
		inventorySha256: sha256(inventoryBytes),
		selectionPolicy: "19-explicit-stress-sources-plus-one-domain-separated-sha256-source-from-each-root-00-through-08",
		sourceCount: sources.length,
		sources,
	}
	const development = {
		...developmentWithoutId,
		manifestId: sha256(canonicalJson(developmentWithoutId)),
	}

	const freshSources = selectInventorySources(
		inventory,
		["0f"],
		12,
		"album-artwork-palette-v2-fresh-directional-selection-v1",
		"fresh",
	)
	const developmentHashes = new Set(sources.map(({ sha256 }) => sha256))
	if (freshSources.some(({ sha256 }) => developmentHashes.has(sha256))) {
		throw new Error("Fresh and development source groups overlap")
	}
	const freshWithoutId = {
		schemaVersion: 1,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PROTOCOL,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		inventoryVersion: inventory.inventoryVersion,
		inventoryId: inventory.inventoryId,
		inventorySha256: sha256(inventoryBytes),
		selectionPolicy: "first-12-independent-0f-source-groups-by-domain-separated-sha256-key",
		selectionDomain: "album-artwork-palette-v2-fresh-directional-selection-v1",
		candidateOutputOpened: false,
		phaseRequiredToOpen: 4,
		sourceCount: freshSources.length,
		sources: freshSources,
	}
	const fresh = {
		...freshWithoutId,
		manifestId: sha256(canonicalJson(freshWithoutId)),
		sealCommitment: sha256(`sealed-fresh-sample-v1\0${canonicalJson(freshWithoutId)}`),
	}

	await atomicJson(developmentOutputPath, development)
	await atomicJson(freshOutputPath, fresh)
	process.stdout.write(`Prepared ${sources.length} development sources and sealed ${freshSources.length} fresh sources.\n`)
	process.stdout.write(`Development manifest: ${development.manifestId}\n`)
	process.stdout.write(`Fresh seal: ${fresh.sealCommitment}\n`)
}

await main()
