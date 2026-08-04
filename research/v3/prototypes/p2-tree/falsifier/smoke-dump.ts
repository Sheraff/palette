/**
 * A synthetic node dump over the real endorsed artworks. **NOT A PIPELINE, NOT A RESULT.**
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *   research/v3/prototypes/p2-tree/falsifier/smoke-dump.ts \
 *   --out research/v3/prototypes/p2-tree/falsifier/out/smoke-nodes.jsonl --area-floor 0.002
 * ```
 *
 * Worker A's α-tree and worker B's tree-of-shapes dumps are what the falsifier is for. Until they
 * exist there is no way to tell "the harness reads 0% because the paradigm is fine" from "the
 * harness reads 0% because it is broken", so this writes two fabricated pipelines whose answers are
 * known in advance and bound the instrument from both ends over the *real* 173-artwork join:
 *
 * - **`smoke-oracle`** — the retained-node set *is* the control set. Every colour reachable from the
 *   control is reachable from the nodes, so the falsifier's numerator must be **exactly 0**. Any
 *   other number is a bug in the harness, not a fact about P2.
 * - **`smoke-null`** — one node, mid-grey, on every image. Nothing is reachable from the nodes, so
 *   the numerator must equal the count of control-reachable colours: the **ceiling** the falsifier
 *   can ever report at this floor.
 *
 * Neither line says anything whatsoever about hierarchical region decomposition. A reader who quotes
 * one as a P2 result has quoted a tautology.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DEFAULT_LEGACY_DIR } from "../../../src/adjudication/evidence.ts"
import { controlSetOf, corpusRoots, resolveImagePath } from "./corpus.ts"
import { DEFAULT_AREA_FLOOR } from "./constants.ts"

/** The one node the null pipeline retains. `[UNCALIBRATED]` — an arbitrary mid-grey, chosen to be wrong. */
export const NULL_PIPELINE_REPR = "#808080"

type LegacyFile = { entries: { artwork: { imagePath: string } }[] }

export async function writeSmokeDump(
	options: Readonly<{
		out: string
		areaFloor: number
		corpusRoot: string | null
		limit: number | null
		/**
		 * Emit `smoke-null` only. The null pipeline's numerator **is** the control-reachable count, so
		 * a null-only dump measures the control set's own ceiling at a floor — the sweep in `NOTES.md`
		 * — without paying for the oracle pipeline's node set, which at a low floor is every triple in
		 * the image.
		 */
		nullOnly?: boolean
	}>,
): Promise<{ written: number; unresolved: string[]; refused: string[] }> {
	const legacy = JSON.parse(
		readFileSync(resolve(DEFAULT_LEGACY_DIR, "endorsements.json"), "utf8"),
	) as LegacyFile
	const paths = [...new Set(legacy.entries.map((entry) => entry.artwork.imagePath))].sort()
	const roots = corpusRoots(options.corpusRoot)

	const lines: string[] = []
	const unresolved: string[] = []
	const refused: string[] = []
	let written = 0

	for (const imagePath of paths) {
		if (options.limit !== null && written >= options.limit) break
		const resolved = resolveImagePath(imagePath, roots)
		if (!resolved) {
			unresolved.push(imagePath)
			continue
		}
		let control
		try {
			control = await controlSetOf(resolved.absolute, options.areaFloor)
		} catch (error) {
			refused.push(`${imagePath}: ${(error as Error).message}`)
			continue
		}
		const shared = { imagePath, width: control.width, height: control.height, areaFloor: options.areaFloor }
		if (!options.nullOnly) {
			lines.push(JSON.stringify({
				...shared,
				pipeline: "smoke-oracle",
				nodes: control.colors.map((color, index) => ({
					id: index,
					parent: null,
					depth: 1,
					areaFraction: null,
					repr: color.hex,
				})),
			}))
		}
		lines.push(JSON.stringify({
			...shared,
			pipeline: "smoke-null",
			nodes: [{ id: 0, parent: null, depth: 1, areaFraction: 1, repr: NULL_PIPELINE_REPR }],
		}))
		written += 1
	}

	mkdirSync(dirname(resolve(options.out)), { recursive: true })
	writeFileSync(resolve(options.out), lines.join("\n") + "\n")
	return { written, unresolved, refused }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const argv = process.argv.slice(2)
	const flag = (name: string): string | null => {
		const index = argv.indexOf(name)
		return index === -1 ? null : argv[index + 1] ?? null
	}
	const out = flag("--out")
	if (!out) throw new Error("--out is required")
	const areaFloor = flag("--area-floor") ? Number(flag("--area-floor")) : DEFAULT_AREA_FLOOR
	const limitArg = flag("--limit")
	const result = await writeSmokeDump({
		out,
		areaFloor,
		corpusRoot: flag("--corpus-root"),
		limit: limitArg === null ? null : Number(limitArg),
		nullOnly: argv.includes("--null-only"),
	})
	process.stdout.write(
		`SYNTHETIC DUMP — NOT A PIPELINE. images: ${result.written} | unresolved: ${result.unresolved.length} | ` +
			`refused: ${result.refused.length} | area floor: ${areaFloor}\n`,
	)
	for (const line of result.refused.slice(0, 10)) process.stdout.write(`  refused ${line}\n`)
}
