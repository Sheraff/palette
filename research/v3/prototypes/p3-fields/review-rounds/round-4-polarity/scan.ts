/**
 * Round 4 (near-neutral polarity pairwise) — run the PINNED candidate over a list of artworks and
 * write, per artwork, the polarity decision chain plus the published palette.
 *
 * Everything is read from `_pinned-5a4f845/`, which is `git show 5a4f845:…/src/*.ts` with two
 * mechanical changes, both documented in `ROUND.md`:
 *
 *   1. the import depth rewrite (`../../../src/` → `../../../../../src/`), the same one round-1's and
 *      the attribution study's pinned copies carry;
 *   2. the dev-only `P3_FORCE_BG_POLARITY` override, which exists only in the pinned copy.
 *
 * **Live `src/` is never read.** Another worker is editing it under 0.4.0 while this round is staged.
 *
 * The environment decides which side is being run — the module reads `P3_FORCE_BG_POLARITY` once, at
 * load — so one process produces exactly one side and a side is never mixed inside a file:
 *
 *   # side 0, as-published (no override at all)
 *   P3_DIAG=<dir>/published node --experimental-strip-types scan.ts <paths.txt> <out.jsonl>
 *   # a forced side
 *   P3_FORCE_BG_POLARITY=light P3_DIAG=<dir>/light node --experimental-strip-types scan.ts …
 *
 * `<paths.txt>` is one absolute image path per line (`#` comments and blanks skipped). Output is one
 * JSON line per artwork. Nothing here selects, decides, or writes a staging file.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { backgroundPolarityOverrideInUse } from "./_pinned-5a4f845/constants.ts"
import { diagnosticsKey } from "./_pinned-5a4f845/diagnostics.ts"
import { extractPalette } from "./_pinned-5a4f845/pipeline.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

const [pathsFile, outFile] = process.argv.slice(2)
if (pathsFile === undefined || outFile === undefined) {
	throw new Error("usage: scan.ts <paths.txt> <out.jsonl>")
}

const diagDir = process.env.P3_DIAG
if (diagDir === undefined || diagDir.length === 0) {
	// The whole point of this script is the decision chain; a run without it would silently produce
	// rows with no polarity fields and be read as "the tie band never fired".
	throw new Error("scan.ts requires P3_DIAG — the polarity decision is read out of the chain")
}

const polarity = backgroundPolarityOverrideInUse()

const paths = readFileSync(pathsFile, "utf8")
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))

const lines: string[] = []

for (const imagePath of paths) {
	let row: Record<string, unknown>
	try {
		const { palette, intermediates } = await extractPalette(imagePath)
		const chain = JSON.parse(readFileSync(join(diagDir, `${diagnosticsKey(imagePath)}.json`), "utf8"))
		const prevalence = chain.prevalence as Record<string, unknown>
		const ends = chain.ends as Record<string, unknown>
		const gradient = chain.gradient as Record<string, unknown>
		const verdict = validatePalette(palette)
		row = {
			imagePath,
			polarityRequested: polarity,
			ok: true,
			// --- the polarity decision, straight off the chain -------------------------------------
			tieBandFired: prevalence.tieBandFired,
			decidedBy: prevalence.decidedBy,
			relativeGap: prevalence.relativeGap,
			farPrevalence: prevalence.far,
			nearPrevalence: prevalence.near,
			farIsBackground: prevalence.farIsBackground,
			// --- the two ends, BEFORE the assignment ------------------------------------------------
			// These are what "same e1/e2 set, swapped assignment" is checked on: the override must not
			// move which two pixels the field's ends are, only which of them is called background.
			e1: ends.e1,
			e1L: ends.e1L,
			e1Hex: ends.e1Hex,
			e2: ends.e2,
			e2L: ends.e2L,
			e2Hex: ends.e2Hex,
			median: ends.median,
			collapsed: ends.collapsed,
			endsStep: ends.endsStep,
			fieldSetRule: (chain.fieldSet as Record<string, unknown>).rule,
			// --- the assignment ---------------------------------------------------------------------
			backgroundL: prevalence.backgroundL,
			surfaceL: prevalence.surfaceL,
			// --- the published palette ---------------------------------------------------------------
			palette,
			gradientPublished: gradient.isGradient,
			gradientStops: gradient.stops,
			bestSpearmanRho: gradient.bestSpearmanRho,
			surfaceCollapsed: palette.collapse.surfaceCollapsed,
			accentCollapsed: palette.collapse.accentCollapsed,
			foregroundRegime: intermediates.foregroundRegime,
			escaped: intermediates.escaped,
			repairs: intermediates.repairs,
			valid: verdict.valid,
			violations: verdict.violations.map((violation) => violation.code),
		}
	} catch (error) {
		row = { imagePath, polarityRequested: polarity, ok: false, error: String(error) }
	}
	lines.push(JSON.stringify(row))
}

writeFileSync(join(HERE, outFile), `${lines.join("\n")}\n`)
console.log(`${lines.length} rows -> ${outFile} (polarity override: ${polarity ?? "none / as-published"})`)
