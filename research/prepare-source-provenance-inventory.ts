import { constants } from "node:fs"
import { lstat, open, readFile, readdir, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import {
	buildSourceProvenanceInventory,
	createSourceProvenanceImplementation,
	SOURCE_PROVENANCE_IMPLEMENTATION_FILES,
	SOURCE_PROVENANCE_ROOTS,
	sourceVariantFromBytes,
	type SourceProvenanceImplementationFile,
	type SourceVariant,
} from "./src/source-provenance-inventory.ts"

if (process.argv.length !== 2) throw new Error("prepare-source-provenance-inventory.ts takes no arguments")

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputPath = join(projectRoot, "research/data/source-provenance-inventory-00-14.json")

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function readRoot(root: string): Promise<SourceVariant[]> {
	const rootPath = join(projectRoot, root)
	const rootStat = await lstat(rootPath)
	if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Source root is not a regular directory: ${root}`)
	const entries = (await readdir(rootPath, { withFileTypes: true })).sort((first, second) => compareText(first.name, second.name))
	const unsupported = entries.filter((entry) => !entry.isFile())
	if (unsupported.length > 0) {
		throw new Error(`Source root ${root} contains symlinks, non-files, or nested paths: ${unsupported.map((entry) => entry.name).join(", ")}`)
	}
	const variants: SourceVariant[] = []
	for (const entry of entries) {
		if (entry.name.includes("/") || entry.name.includes("\\")) throw new Error(`Nested source path is invalid: ${root}/${entry.name}`)
		const path = `${root}/${entry.name}`
		const handle = await open(join(rootPath, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW)
		try {
			const sourceStat = await handle.stat()
			if (!sourceStat.isFile()) throw new Error(`Source is not a regular file: ${path}`)
			const bytes = await handle.readFile()
			if (sourceStat.size !== bytes.byteLength) throw new Error(`Source changed while being inventoried: ${path}`)
			variants.push(sourceVariantFromBytes(path, bytes))
		} finally {
			await handle.close()
		}
	}
	return variants
}

const variants: SourceVariant[] = []
for (const root of SOURCE_PROVENANCE_ROOTS) variants.push(...await readRoot(root))
const implementationFiles: SourceProvenanceImplementationFile[] = await Promise.all(
	SOURCE_PROVENANCE_IMPLEMENTATION_FILES.map(async (path) => ({
		path,
		sha256: sha256(await readFile(resolve(projectRoot, path))),
	})),
)
const inventory = buildSourceProvenanceInventory(variants, createSourceProvenanceImplementation(implementationFiles))
try {
	await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { flag: "wx" })
} catch (error) {
	if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${relative(projectRoot, outputPath)}`)
	throw error
}
process.stderr.write(`Wrote ${inventory.inventoryId} to ${relative(projectRoot, outputPath)}\n`)
