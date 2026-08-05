/**
 * # `run-emitter` — one arm, one set, one JSONL file
 *
 *     cd research/v3
 *     node --experimental-strip-types prototypes/p1-mdl/src/search/run-emitter.ts \
 *       --arm a --set demo-20 --as-of 2026-08-05
 *
 * Writes `prototypes/p1-mdl/data/emitter/<arm>-<set>-<as-of>.jsonl`: a provenance header row, one row
 * per image carrying the palette **and its full diagnostics**, and a footer row with the run's own
 * tallies.
 *
 * ## Why the diagnostics live here and not in the candidate
 *
 * `candidates/p1a.ts` returns a `Palette` and nothing else, because `CandidatePalette` is that
 * signature and a candidate with a side-channel is a candidate whose two runs can differ. This CLI
 * calls `emit()` directly, so it gets the `Diagnostics` the dev loop cannot carry: the search
 * certificate and the coarseness it ran at, the runner-up list with gaps, the F/A-swap delta, the
 * min-|APCA| report for both inks, and the per-image self-falsifier. Those are the M2 deliverable;
 * the palettes are what the review server will show.
 *
 * ## `--as-of` is not the wall clock
 *
 * `CONVENTIONS.md`'s dating rule: a result file is named for the date it *belongs to*, supplied by
 * the caller, not for whenever the process happened to run. A re-run that produces the same answers
 * overwrites the same file instead of silently forking the record into two dates.
 *
 * ## Flags
 *
 * | flag | meaning |
 * | --- | --- |
 * | `--arm a\|aprime\|both` | which energy. `both` runs the two arms in sequence into two files. |
 * | `--set <name\|path>` | a set file in `data/devloop/sets/`, or an absolute path. |
 * | `--as-of YYYY-MM-DD` | the date the output belongs to. Required. |
 * | `--lambda <number>` | `DESIGN.md` decision 2's exchange rate. Defaults to each energy's own 1.0. |
 * | `--limit <n>` | first n images only, for a smoke run. |
 * | `--budget-ms <n>` | override the per-image allowance. A run that used it says so in the header. |
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { DEVLOOP_SETS_DIR, PROTOTYPE_ROOT, readSetFile } from "../emit/paths.ts"
import { ALGORITHM_VERSIONS } from "../emit/palette.ts"
import { ENERGY_A_VERSION } from "../energy/a/constants.ts"
import { writeHeader } from "../../../../src/provenance/header.ts"
import { emit } from "./index.ts"
import { SEARCH_BUDGET_MS, SEARCH_CERTIFICATE } from "./constants.ts"
import { ARM_CANDIDATE_ID, ARM_ENERGY_UNIT, type ArmName, type Diagnostics } from "./types.ts"

/** Where a run's output goes. One directory, one file per (arm, set, date). */
export const EMITTER_DATA_DIR = join(PROTOTYPE_ROOT, "data", "emitter")

/** Arm A′'s energy has no version constant of its own; `candidates/p1ap.ts` explains why. */
const ENERGY_APRIME_VERSION = "p1ap-energy-0.1.0"

export type EmitterRow = Readonly<{
	kind: "p1-emitter-row"
	index: number
	imagePath: string
	ok: boolean
	palette: unknown
	diagnostics: Diagnostics | null
	error: string | null
	/** Wall milliseconds for this image, measured around the `emit()` call. */
	wallMs: number
}>

function parseArgs(argv: readonly string[]): Map<string, string> {
	const args = new Map<string, string>()
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		if (!token.startsWith("--")) continue
		const next = argv[index + 1]
		args.set(token.slice(2), next !== undefined && !next.startsWith("--") ? next : "true")
	}
	return args
}

function resolveSetPath(nameOrPath: string): string {
	return nameOrPath.includes("/") ? nameOrPath : join(DEVLOOP_SETS_DIR, `${nameOrPath}.txt`)
}

/**
 * Run one arm over one set.
 *
 * Failures are **rows, not omissions** — the same rule `src/devloop/types.ts` states for `RunRow`. A
 * candidate that throws on three covers has said something; a file in which those three simply do not
 * appear has said nothing at all.
 */
export async function runEmitter(options: {
	arm: ArmName
	setPath: string
	asOf: string
	lambda?: number
	limit?: number
	budgetMs?: number
	log?: (line: string) => void
}): Promise<{ outputPath: string; rows: EmitterRow[] }> {
	const log = options.log ?? ((line: string) => console.log(line))
	const setName = basename(options.setPath).replace(/\.txt$/, "")
	const { found, missing } = readSetFile(options.setPath)
	const imagePaths = options.limit === undefined ? found : found.slice(0, options.limit)

	const header = {
		kind: "p1-emitter-run-header" as const,
		what:
			`P1 v0 emitter run — arm ${options.arm} (${ARM_CANDIDATE_ID[options.arm]}) over set ${setName}`,
		arm: options.arm,
		candidateId: ARM_CANDIDATE_ID[options.arm],
		energyUnit: ARM_ENERGY_UNIT[options.arm],
		algorithmVersion: ALGORITHM_VERSIONS[ARM_CANDIDATE_ID[options.arm]],
		energyVersion: options.arm === "a" ? ENERGY_A_VERSION : ENERGY_APRIME_VERSION,
		searchCertificate: SEARCH_CERTIFICATE,
		lambda: options.lambda ?? null,
		budgetMs: options.budgetMs ?? SEARCH_BUDGET_MS,
		setPath: options.setPath,
		setName,
		imageCount: imagePaths.length,
		imagesMissingFromSet: missing,
		asOf: options.asOf,
		provenance: writeHeader({
			what: `P1 v0 emitter, arm ${options.arm}, set ${setName}`,
			generatedBy: "research/v3/prototypes/p1-mdl/src/search/run-emitter.ts",
			inputs: [options.setPath],
		}),
	}

	const rows: EmitterRow[] = []
	for (let index = 0; index < imagePaths.length; index += 1) {
		const imagePath = imagePaths[index]
		const startedAt = performance.now()
		try {
			const { palette, diagnostics } = await emit(imagePath, {
				arm: options.arm,
				...(options.lambda === undefined ? {} : { lambda: options.lambda }),
				...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
			})
			rows.push({
				kind: "p1-emitter-row",
				index,
				imagePath,
				ok: true,
				palette,
				diagnostics,
				error: null,
				wallMs: performance.now() - startedAt,
			})
			log(
				`  [${index + 1}/${imagePaths.length}] ${basename(imagePath)} ${
					diagnostics.incumbent.configuration.fieldOrder
				} E=${diagnostics.incumbent.energy.toPrecision(8)} ${
					((performance.now() - startedAt) / 1000).toFixed(1)
				}s`,
			)
		} catch (error) {
			rows.push({
				kind: "p1-emitter-row",
				index,
				imagePath,
				ok: false,
				palette: null,
				diagnostics: null,
				error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
				wallMs: performance.now() - startedAt,
			})
			log(`  [${index + 1}/${imagePaths.length}] ${basename(imagePath)} FAILED`)
		}
	}

	const okRows = rows.filter((row) => row.ok)
	const footer = {
		kind: "p1-emitter-run-footer" as const,
		imageCount: rows.length,
		okCount: okRows.length,
		failedCount: rows.length - okRows.length,
		escapeCount: okRows.filter((row) => row.diagnostics?.escape.used === true).length,
		underSearchedCount: okRows.filter(
			(row) => row.diagnostics?.knownBetterFeasible.underSearched === true,
		).length,
		budgetExhaustedCount: okRows.filter((row) => row.diagnostics?.effort.budgetExhausted === true)
			.length,
		wallMsTotal: rows.reduce((total, row) => total + row.wallMs, 0),
	}

	mkdirSync(EMITTER_DATA_DIR, { recursive: true })
	const outputPath = join(EMITTER_DATA_DIR, `${options.arm}-${setName}-${options.asOf}.jsonl`)
	writeFileSync(
		outputPath,
		[header, ...rows, footer].map((line) => JSON.stringify(line)).join("\n") + "\n",
		"utf8",
	)
	return { outputPath, rows }
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2))
	const asOf = args.get("as-of")
	if (asOf === undefined || asOf === "true") {
		console.error("run-emitter: --as-of YYYY-MM-DD is required (CONVENTIONS.md's dating rule)")
		process.exitCode = 2
		return
	}
	const setPath = resolveSetPath(args.get("set") ?? "demo-20")
	const armArg = args.get("arm") ?? "both"
	const arms: ArmName[] = armArg === "both" ? ["a", "aprime"] : [armArg as ArmName]
	const lambdaArg = args.get("lambda")
	const limitArg = args.get("limit")
	const budgetArg = args.get("budget-ms")

	for (const arm of arms) {
		console.log(`arm ${arm} over ${setPath}`)
		const { outputPath } = await runEmitter({
			arm,
			setPath,
			asOf,
			...(lambdaArg === undefined ? {} : { lambda: Number(lambdaArg) }),
			...(limitArg === undefined ? {} : { limit: Number(limitArg) }),
			...(budgetArg === undefined ? {} : { budgetMs: Number(budgetArg) }),
		})
		console.log(`  -> ${outputPath}`)
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
