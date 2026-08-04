/**
 * Freeze the standing perturbation-cover sample, and optionally warm the perturbation cache.
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts --verify
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts --materialize
 * ```
 *
 * The **set file** is committed; the **perturbed images** are not. `--materialize` generates them
 * under `data/robustness/cache/` (gitignored) and reports whether regeneration was byte-identical,
 * which is the determinism claim this harness rests on: if a re-encode is not reproducible, neither
 * is any number measured through it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import { PERTURBATION_ARMS, materializeArm } from "./perturb.ts"
import { sha256Of } from "./pair-set.ts"
import { buildPerturbationSet } from "./perturbation-set.ts"
import type { PerturbationSetFile } from "./types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const V3_ROOT = path.resolve(HERE, "..", "..")
export const REPO_ROOT = path.resolve(V3_ROOT, "..", "..")
export const OUTPUT_PATH = path.join(V3_ROOT, "data", "robustness", "perturbation-set-1.json")
export const CACHE_DIR = path.join(V3_ROOT, "data", "robustness", "cache")

export const INPUTS = {
	overlay: path.join(V3_ROOT, "data/embeddings/near-dup-census.holdout-v2.json"),
	holdout: path.join(V3_ROOT, "data/holdout/holdout.json"),
	warehouse: path.join(V3_ROOT, "data/warehouse/warehouse.jsonl"),
	embeddingsDir: path.join(V3_ROOT, "data/embeddings"),
	transparency: path.join(V3_ROOT, "data/source-surveys/pixel_results.json"),
}

export function comparableBody(file: PerturbationSetFile): Omit<PerturbationSetFile, "writtenAt"> {
	const { writtenAt: _ignored, ...rest } = file
	return rest
}

export type MovedInput = { key: string; was: string; now: string }

/** Which pinned inputs no longer hash to what the set file recorded. See build-pair-set.ts. */
export async function movedInputs(committed: PerturbationSetFile): Promise<MovedInput[]> {
	const moved: MovedInput[] = []
	for (const [key, source] of Object.entries(committed.sources)) {
		const current = await sha256Of(path.join(REPO_ROOT, source.path))
		if (current !== source.sha256) moved.push({ key, was: source.sha256, now: current })
	}
	return moved
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			verify: { type: "boolean", default: false },
			materialize: { type: "boolean", default: false },
			force: { type: "boolean", default: false },
			out: { type: "string" },
		},
	})
	const outPath = values.out ?? OUTPUT_PATH
	const built = await buildPerturbationSet({
		repoRoot: REPO_ROOT,
		overlayPath: INPUTS.overlay,
		holdoutPath: INPUTS.holdout,
		warehousePath: INPUTS.warehouse,
		embeddingsDir: INPUTS.embeddingsDir,
		transparencyPath: INPUTS.transparency,
	})

	if (values.verify) {
		const committed = JSON.parse(await readFile(outPath, "utf8")) as PerturbationSetFile
		const moved = await movedInputs(committed)
		if (moved.length > 0) {
			console.error("perturbation set inputs MOVED since the draw. Re-freeze deliberately, under a NEW setId.")
			for (const entry of moved) console.error(`  ${entry.key}: ${entry.was.slice(0, 12)} -> ${entry.now.slice(0, 12)}`)
			process.exitCode = 1
			return
		}
		const same = JSON.stringify(comparableBody(committed)) === JSON.stringify(comparableBody(built))
		if (!same) {
			console.error("perturbation set is STALE — the draw over today's inputs differs from the committed file.")
			console.error(`  committed: ${committed.covers.length} covers, seed ${committed.seedHex}`)
			console.error(`  rebuilt:   ${built.covers.length} covers, seed ${built.seedHex}`)
			process.exitCode = 1
			return
		}
		console.log(`perturbation set verified: ${built.covers.length} covers, seed ${built.seedHex}`)
		return
	}

	if (!values.materialize) {
		await mkdir(path.dirname(outPath), { recursive: true })
		await writeFile(outPath, `${JSON.stringify(built, null, "\t")}\n`)
		console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`)
		for (const [key, value] of Object.entries(built.counts)) console.log(`  ${key}: ${value}`)
		return
	}

	// Materialise every arm of every cover, and report determinism.
	const committed = JSON.parse(await readFile(outPath, "utf8")) as PerturbationSetFile
	let generated = 0
	let reused = 0
	for (const cover of committed.covers) {
		const source = path.join(REPO_ROOT, cover.path)
		for (const arm of PERTURBATION_ARMS) {
			const result = await materializeArm(source, cover.sha256, arm, CACHE_DIR, values.force)
			if (result.regenerated) generated += 1
			else reused += 1
		}
	}
	console.log(`materialised ${committed.covers.length} covers x ${PERTURBATION_ARMS.length} arms`)
	console.log(`  generated: ${generated}`)
	console.log(`  reused:    ${reused}`)
	console.log(`  cache:     ${path.relative(REPO_ROOT, CACHE_DIR)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main()
}
