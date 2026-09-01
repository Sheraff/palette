/**
 * Freeze the standing rendition-pair sample.
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-pair-set.ts
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-pair-set.ts --verify
 * ```
 *
 * `--verify` regenerates the draw and exits 1 if it differs from the committed file, ignoring
 * `writtenAt`. That is the check that the sample is genuinely a seeded draw over pinned inputs and
 * not a thing somebody once ran: if an input moves, this fails and the set is re-frozen deliberately
 * under a new `setId` rather than drifting.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import { buildPairSet, sha256Of } from "./pair-set.ts"
import type { PairSetFile } from "./types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const V3_ROOT = path.resolve(HERE, "..", "..")
export const REPO_ROOT = path.resolve(V3_ROOT, "..", "..")
export const OUTPUT_PATH = path.join(V3_ROOT, "data", "robustness", "pair-set-1.json")

export const INPUTS = {
	census: path.join(V3_ROOT, "data/embeddings/near-dup-census.json"),
	overlay: path.join(V3_ROOT, "data/embeddings/near-dup-census.holdout-v2.json"),
	holdout: path.join(V3_ROOT, "data/holdout/holdout.json"),
	warehouse: path.join(V3_ROOT, "data/warehouse/warehouse.jsonl"),
	embeddingsDir: path.join(V3_ROOT, "data/embeddings"),
	transparency: path.join(V3_ROOT, "data/source-surveys/pixel_results.json"),
}

/** Everything except the timestamp, which is the only field allowed to change on a re-run. */
export function comparableBody(file: PairSetFile): Omit<PairSetFile, "writtenAt"> {
	const { writtenAt: _ignored, ...rest } = file
	return rest
}

export type MovedInput = { key: string; was: string; now: string }

/** Which pinned inputs no longer hash to what the set file recorded. */
export async function movedInputs(committed: PairSetFile): Promise<MovedInput[]> {
	const moved: MovedInput[] = []
	for (const [key, source] of Object.entries(committed.sources)) {
		const current = await sha256Of(path.join(REPO_ROOT, source.path))
		if (current !== source.sha256) moved.push({ key, was: source.sha256, now: current })
	}
	return moved
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { verify: { type: "boolean", default: false }, out: { type: "string" } } })
	const outPath = values.out ?? OUTPUT_PATH
	const built = await buildPairSet({
		repoRoot: REPO_ROOT,
		censusPath: INPUTS.census,
		overlayPath: INPUTS.overlay,
		holdoutPath: INPUTS.holdout,
		warehousePath: INPUTS.warehouse,
		embeddingsDir: INPUTS.embeddingsDir,
		transparencyPath: INPUTS.transparency,
	})

	if (values.verify) {
		const committed = JSON.parse(await readFile(outPath, "utf8")) as PairSetFile
		// Two different failures, and conflating them would be the whole problem. An input that
		// moved is expected — the warehouse is append-only and grows every review round — and the
		// answer is a deliberate re-freeze under a new setId. A draw that differs while every input
		// hash still matches is a code change that silently moved a frozen sample, which is a bug.
		const moved = await movedInputs(committed)
		if (moved.length > 0) {
			console.error("pair set inputs MOVED since the draw. The sample is not stale — it is standing on inputs")
			console.error("that have changed. Re-freeze deliberately, under a NEW setId; do not overwrite this one.")
			for (const entry of moved) console.error(`  ${entry.key}: ${entry.was.slice(0, 12)} -> ${entry.now.slice(0, 12)}`)
			process.exitCode = 1
			return
		}
		const same = JSON.stringify(comparableBody(committed)) === JSON.stringify(comparableBody(built))
		if (!same) {
			console.error("pair set is STALE — every input hash matches, but the draw differs. Something in the")
			console.error("sampling code changed the sample. That is a bug, not a re-freeze.")
			console.error(`  committed: ${committed.pairs.length} pairs, seed ${committed.seedHex}`)
			console.error(`  rebuilt:   ${built.pairs.length} pairs, seed ${built.seedHex}`)
			process.exitCode = 1
			return
		}
		console.log(`pair set verified: ${built.pairs.length} pairs, seed ${built.seedHex}, all input hashes match`)
		return
	}

	await mkdir(path.dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(built, null, "\t")}\n`)
	console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`)
	for (const [key, value] of Object.entries(built.counts)) console.log(`  ${key}: ${value}`)
	console.log("  strata:")
	for (const stratum of built.strata) {
		console.log(`    ${stratum.stratum.padEnd(34)} ${stratum.drawn}/${stratum.population}${stratum.exhaustive ? "  (whole stratum)" : ""}`)
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main()
}
