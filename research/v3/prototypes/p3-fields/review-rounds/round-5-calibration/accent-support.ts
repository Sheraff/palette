/**
 * Round-5 selection probe — the eligibility verdict behind every published accent on coverage-220.
 *
 * ## Why this exists
 *
 * The round's second class is "newly-admitted accents": accents that publish at 0.4.1 because the
 * coherence rule (`support ≥ COHERENT_SUPPORT_MIN AND fill ≥ COHERENT_FILL_FLOOR`) admitted them, and
 * that the retired raw-share wall (`support ≥ SOURCE_POPULATION_FLOOR`) would have refused. That is a
 * statement about `verifyColor`'s verdict for the *published* pixel, and the verdict is nowhere in a
 * run file: `run.ts` writes `palette` and nothing else, and the `P3_DIAG` chain records the accent's
 * hex, cursor and population size but not its support/fill/route.
 *
 * `extractPalette` returns `intermediates.verdicts` — "the **whole** verdict of every verification the
 * run performed" (`pipeline.ts`) — so this probe calls the pipeline directly and keeps the verdict for
 * the pixel that was actually published. Nothing here recomputes a palette differently from the run:
 * the same `extractPalette` the candidate adapter calls, over the same set file, so `published.accent`
 * below is checked against `run-coverage-220-0.4.1.jsonl` by `verify.ts` rather than trusted.
 *
 * ## Which verdict belongs to the published accent
 *
 * The fg↔accent comparator can swap the two **labels** after both roles are selected and verified
 * (`pipeline.ts`, `shouldSwapRoles`). So:
 *
 *   - not swapped → the published accent is the accent search's pixel → key `accent:<accentStep>`;
 *   - swapped     → the published accent is the *foreground* search's pixel → key
 *                   `foreground:<regime>:<foregroundStep mod (MAX_RANK_STEPS + 1)>`, the same key
 *                   `searchForeground` writes and the same reduction `pipeline.ts`'s own diagnostics
 *                   apply to the cursor.
 *
 * The chosen verdict's `pixel` is emitted so the mapping is auditable, and `verdictKeys` lists every
 * key the run produced so a wrong pick is visible rather than silent.
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/review-rounds/round-5-calibration/accent-support.ts
 *
 * Writes `accent-support-0.4.1.json` beside this file. Sequential on purpose — 220 images at ~1 s, and
 * a pool would buy nothing but a second source of nondeterminism in a selection input.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../../src/pipeline.ts"
import { MAX_RANK_STEPS } from "../../src/constants.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { SOURCE_POPULATION_FLOOR } from "../../../../src/contract/constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"
const SET_FILE = join(HERE, "..", "..", "measurements", "coverage-set-1-220.txt")

const paths = readFileSync(SET_FILE, "utf8")
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))

type Out = Record<string, unknown>
const rows: Out[] = []

for (let index = 0; index < paths.length; index += 1) {
	const relative = paths[index]
	const absolute = resolve(WORKTREE, relative)
	const { palette, intermediates } = await extractPalette(absolute)

	const swapped = intermediates.roleSwapApplied
	const key = swapped
		? `foreground:${intermediates.foregroundRegime}:${intermediates.foregroundStep % (MAX_RANK_STEPS + 1)}`
		: `accent:${intermediates.accentStep}`
	const verdict = intermediates.accentCollapsed ? null : (intermediates.verdicts[key] ?? null)
	const validation = validatePalette(palette)

	rows.push({
		index,
		imagePath: relative,
		stem: basename(relative).replace(/\.[a-z]+$/iu, ""),
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		accentCollapsed: palette.collapse.accentCollapsed,
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		gradientStops: palette.gradient === null ? 0 : palette.gradient.stops.length,
		roleSwapApplied: swapped,
		accentStep: intermediates.accentStep,
		foregroundRegime: intermediates.foregroundRegime,
		foregroundStep: intermediates.foregroundStep,
		accentQualified: intermediates.accentQualified,
		eligiblePixels: intermediates.eligiblePixels,
		verdictKey: verdict === null ? null : key,
		verdictKeys: Object.keys(intermediates.verdicts),
		accentVerdict: verdict === null ? null : {
			pixel: verdict.pixel,
			support: verdict.support,
			spread: verdict.spread,
			fill: verdict.fill,
			rawSharePasses: verdict.rawSharePasses,
			coherencePasses: verdict.coherencePasses,
		},
		// The round's class-2 predicate, spelled out rather than left to the reader: published, and
		// admitted by the coherence route on a support the retired 0.1 % wall would have refused.
		newlyAdmitted: verdict !== null && verdict.coherencePasses && !verdict.rawSharePasses,
		valid: validation.valid,
		violations: validation.violations.map((violation) => violation.subjects.join("+")),
	})

	if ((index + 1) % 25 === 0) process.stdout.write(`  ${index + 1}/${paths.length}\n`)
}

writeFileSync(join(HERE, "accent-support-0.4.1.json"), `${JSON.stringify(rows, null, "\t")}\n`)
const admitted = rows.filter((row) => row.newlyAdmitted === true)
process.stdout.write(
	`${rows.length} rows · ${rows.filter((r) => r.accentCollapsed === true).length} accent collapses · ` +
		`${admitted.length} newly admitted (raw-share floor ${SOURCE_POPULATION_FLOOR}) · ` +
		`${rows.filter((r) => r.valid !== true).length} invalid\n`,
)
