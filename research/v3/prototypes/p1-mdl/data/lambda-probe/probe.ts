/**
 * # The λ-vs-budget probe — disentangling arm A's v0 collapse
 *
 *     cd research/v3
 *     node --experimental-strip-types prototypes/p1-mdl/data/lambda-probe/probe.ts            # all six covers
 *     node --experimental-strip-types prototypes/p1-mdl/data/lambda-probe/probe.ts --cover 3  # one cover
 *
 * ## The question
 *
 * v0 emitted a two-colour palette for arm A on **20/20** demo-20 covers, with 16/20 searches
 * budget-exhausted. Two explanations are confounded in that one run:
 *
 * - **λ-priced degeneracy.** Arm A's structural term is `λ·Ω`, and `Ω` counts an uncollapsed surface,
 *   a gradient, each interior stop and an uncollapsed accent as **one** each (`src/energy/a/index.ts`
 *   `structuralCount`). At λ=1 [UNCALIBRATED] every extra published role costs one nat against a
 *   field+ink data term whose whole magnitude on demo-20 is single-digit nats. If that is the cause,
 *   structure appears as λ falls **at a fixed budget**.
 * - **Under-search.** 16/20 searches ran out of predicted-cost budget, and a search that never reached
 *   a structured configuration cannot have priced it. If that is the cause, the winner changes when the
 *   budget is multiplied **at a fixed λ**.
 *
 * The two are separable because the budget is a deterministic **counter**, not a clock
 * (`src/search/evaluator.ts`): the same image spends the same budget on any machine at any load, so
 * running the cells in parallel changes wall time and nothing else.
 *
 * ## Scope discipline
 *
 * `DESIGN.md` §"V1 — the one bounded iteration" grants exactly (2) *"λ recalibration + disentangling
 * arm A's collapse degeneracy"*. This file changes no constant, no energy and no mechanism: it calls
 * the shipped `emit()` with `lambda` and `budgetMs` options that already exist, and writes only under
 * `data/lambda-probe/`. `budgetMs` is a compute knob — the cost-honesty rules apply, so every cell
 * publishes its predicted spend, its exhaustion flag *and* its measured wall time.
 *
 * ## The grid
 *
 * Six demo-20 covers, stratified by what v0 did (see {@link COVERS}), × {@link LAMBDAS} ×
 * {@link BUDGETS} for arm `a` (60 runs), plus arm `aprime` at its own v0 λ=1 on the same two budgets
 * (12 runs) — the control that asks whether A′'s structure rate is budget-limited too.
 *
 * The measurement is taken **once per cover** and handed to every cell through `EmitOptions.measurement`,
 * so decode cost is paid six times rather than 72 times. Nothing else is shared between cells.
 */

import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { resolveCorpusPath } from "../../src/emit/paths.ts"
import { measureImage } from "../../src/measure/index.ts"
import type { Measurement } from "../../src/measure/types.ts"
import { emit } from "../../src/search/index.ts"
import { SEARCH_BUDGET_MS } from "../../src/search/constants.ts"
import type { ArmName } from "../../src/search/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const PARTS_DIR = join(HERE, "parts")
const RESULTS_PATH = join(HERE, "results.json")

// ---------------------------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------------------------

/**
 * The six covers, stratified by **what v0 published**, read out of
 * `data/emitter/{a,aprime}-demo-20-2026-08-05.jsonl`.
 *
 * Two per stratum, as briefed. `v0` records the pair (arm A roles, arm A′ roles) so a cell's result
 * is always readable against the run it is explaining.
 */
export const COVERS = [
	{
		stratum: "both-collapsed",
		id: "0bb3dc49",
		path: "00/ab67616d00001e0200000bb3dc49110c4aab8aa7.jpg",
		artwork: "black type on near-white ground, small banknote — genuinely two-tone",
		v0: { aRoles: 2, aprimeRoles: 2, aprimeGradient: false },
		/** The flat anchor: the cover that must STILL collapse at the recommended λ. */
		flatAnchor: true,
	},
	{
		stratum: "both-collapsed",
		id: "1ecff3d9",
		path: "00/ab67616d00001e0200001ecff3d9ec20cac4b472.jpg",
		artwork: "greyscale photograph (cans on wet ground); 256 distinct triples",
		v0: { aRoles: 2, aprimeRoles: 3, aprimeGradient: false },
		flatAnchor: false,
	},
	{
		stratum: "aprime-four-roles",
		id: "0ee5a621",
		path: "00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg",
		artwork: "muted green-grey room, bright window, dark chair",
		v0: { aRoles: 2, aprimeRoles: 4, aprimeGradient: false },
		flatAnchor: false,
	},
	{
		stratum: "aprime-four-roles",
		id: "22e7e9d1",
		path: "00/ab67616d00001e02000022e7e9d11c908479200b.jpg",
		artwork: "orange/pink sunset sky, black wheat silhouette — the missing-structure case",
		v0: { aRoles: 2, aprimeRoles: 4, aprimeGradient: false },
		flatAnchor: false,
	},
	{
		stratum: "aprime-gradient",
		id: "00007e97",
		path: "00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg",
		artwork: "cream ground, vivid red mark",
		v0: { aRoles: 2, aprimeRoles: 3, aprimeGradient: true },
		flatAnchor: false,
	},
	{
		stratum: "aprime-gradient",
		id: "18e9b0ec",
		path: "00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg",
		artwork: "pale ground with saturated green and red elements",
		v0: { aRoles: 2, aprimeRoles: 3, aprimeGradient: true },
		flatAnchor: false,
	},
] as const

/** λ for arm A. 1 is v0's [UNCALIBRATED] default; the rest are the recalibration candidates. */
export const LAMBDAS = [0.05, 0.1, 0.25, 0.5, 1] as const

/** v0's per-image allowance, and 4× it. A compute knob; both are reported per cell. */
export const V0_BUDGET_MS = SEARCH_BUDGET_MS
export const BUDGETS = [V0_BUDGET_MS, 4 * V0_BUDGET_MS] as const

/** Arm A′ runs only at its own v0 λ — the control is about budget, not about A′'s pricing. */
export const APRIME_LAMBDA = 1

// ---------------------------------------------------------------------------------------------
// One cell
// ---------------------------------------------------------------------------------------------

export type Cell = {
	coverId: string
	arm: ArmName
	lambda: number
	budgetMs: number
	/** Distinct role colours among {background, surface, foreground, accent}: 2, 3 or 4. */
	distinctRoles: number
	roles: { background: string; surface: string; foreground: string; accent: string }
	gradient: boolean
	stops: number
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	fieldOrder: string
	/** Energy of the winner **at this cell's λ** — never comparable across λ, only within a column. */
	energy: number
	terms: Record<string, number>
	/** Ω for arm A (what λ multiplied), L(P) bits for arm A′. */
	structuralCount: number
	energyEvaluations: number
	feasibleConfigurations: number
	configurationsEnumerated: number
	budgetExhausted: boolean
	predictedMsSpent: number
	predictedMsBudget: number
	coarseRepresentatives: number
	coarseCellBarMultiple: number
	grammarLevel: string
	/** The tie-break identity. Two cells with the same key found the same configuration. */
	canonicalKey: string
	wallMs: number
	error: string | null
}

async function runCell(
	cover: (typeof COVERS)[number],
	imagePath: string,
	measurement: Measurement,
	arm: ArmName,
	lambda: number,
	budgetMs: number,
): Promise<Cell> {
	const startedAt = performance.now()
	const base = { coverId: cover.id, arm, lambda, budgetMs }
	try {
		const { palette, diagnostics } = await emit(imagePath, {
			arm,
			lambda,
			budgetMs,
			measurement,
		})
		const configuration = diagnostics.incumbent.configuration
		const roles = {
			background: palette.roles.background.hex,
			surface: palette.roles.surface.hex,
			foreground: palette.roles.foreground.hex,
			accent: palette.roles.accent.hex,
		}
		return {
			...base,
			distinctRoles: new Set(Object.values(roles)).size,
			roles,
			gradient: configuration.gradient,
			stops: configuration.stops.length,
			surfaceCollapsed: configuration.surfaceCollapsed,
			accentCollapsed: configuration.accentCollapsed,
			fieldOrder: configuration.fieldOrder,
			energy: diagnostics.incumbent.energy,
			terms: { ...diagnostics.incumbent.terms },
			structuralCount: diagnostics.incumbent.structuralCount,
			energyEvaluations: diagnostics.effort.energyEvaluations,
			feasibleConfigurations: diagnostics.effort.feasibleConfigurations,
			configurationsEnumerated: diagnostics.effort.configurationsEnumerated,
			budgetExhausted: diagnostics.effort.budgetExhausted,
			predictedMsSpent: diagnostics.effort.predictedMsSpent,
			predictedMsBudget: diagnostics.effort.predictedMsBudget,
			coarseRepresentatives: diagnostics.searchScale.coarseRepresentatives,
			coarseCellBarMultiple: diagnostics.searchScale.coarseCellBarMultiple,
			grammarLevel: diagnostics.searchScale.grammarLevel,
			canonicalKey: diagnostics.incumbent.canonicalKey,
			wallMs: performance.now() - startedAt,
			error: null,
		}
	} catch (error) {
		return {
			...base,
			distinctRoles: 0,
			roles: { background: "", surface: "", foreground: "", accent: "" },
			gradient: false,
			stops: 0,
			surfaceCollapsed: false,
			accentCollapsed: false,
			fieldOrder: "",
			energy: Number.NaN,
			terms: {},
			structuralCount: Number.NaN,
			energyEvaluations: 0,
			feasibleConfigurations: 0,
			configurationsEnumerated: 0,
			budgetExhausted: false,
			predictedMsSpent: 0,
			predictedMsBudget: budgetMs,
			coarseRepresentatives: 0,
			coarseCellBarMultiple: Number.NaN,
			grammarLevel: "",
			canonicalKey: "",
			wallMs: performance.now() - startedAt,
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
		}
	}
}

/** All 12 cells for one cover: 10 arm-A (λ × budget) and 2 arm-A′ (budget only). */
export async function runCover(index: number): Promise<{ cover: unknown; cells: Cell[] }> {
	const cover = COVERS[index]
	const imagePath = resolveCorpusPath(cover.path)
	if (imagePath === null) throw new Error(`probe: cover ${cover.id} not found at ${cover.path}`)
	const measurement = await measureImage(imagePath)
	const cells: Cell[] = []
	for (const budgetMs of BUDGETS) {
		for (const lambda of LAMBDAS) {
			const cell = await runCell(cover, imagePath, measurement, "a", lambda, budgetMs)
			cells.push(cell)
			console.log(
				`  ${cover.id} a λ=${lambda} B=${budgetMs} -> roles=${cell.distinctRoles} grad=${cell.gradient} Ω=${cell.structuralCount} exh=${cell.budgetExhausted} ${(cell.wallMs / 1000).toFixed(0)}s`,
			)
		}
		const control = await runCell(cover, imagePath, measurement, "aprime", APRIME_LAMBDA, budgetMs)
		cells.push(control)
		console.log(
			`  ${cover.id} aprime λ=1 B=${budgetMs} -> roles=${control.distinctRoles} grad=${control.gradient} exh=${control.budgetExhausted} ${(control.wallMs / 1000).toFixed(0)}s`,
		)
	}
	return { cover, cells }
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

function partPath(index: number): string {
	return join(PARTS_DIR, `cover-${index}.json`)
}

async function main(): Promise<void> {
	mkdirSync(PARTS_DIR, { recursive: true })
	const argv = process.argv.slice(2)
	const coverArg = argv.indexOf("--cover")

	if (coverArg !== -1) {
		const index = Number(argv[coverArg + 1])
		const startedAt = performance.now()
		const result = await runCover(index)
		writeFileSync(
			partPath(index),
			JSON.stringify({ ...result, elapsedMs: performance.now() - startedAt }, null, "\t"),
			"utf8",
		)
		return
	}

	// One child process per cover, all six in parallel. The budget is a counter, so parallelism cannot
	// change a single published number — only how long the wall clock says the probe took.
	const startedAt = performance.now()
	const children = COVERS.map(
		(cover, index) =>
			new Promise<void>((resolve, reject) => {
				const child = spawn(
					process.execPath,
					["--experimental-strip-types", fileURLToPath(import.meta.url), "--cover", String(index)],
					{ stdio: ["ignore", "inherit", "inherit"] },
				)
				child.on("exit", (code) =>
					code === 0 ? resolve() : reject(new Error(`cover ${cover.id} exited ${code}`)),
				)
			}),
	)
	await Promise.all(children)
	const elapsedMs = performance.now() - startedAt

	const parts = COVERS.map((_, index) => JSON.parse(readFileSync(partPath(index), "utf8")))
	const cells: Cell[] = parts.flatMap((part) => part.cells as Cell[])
	writeFileSync(
		RESULTS_PATH,
		JSON.stringify(
			{
				what: "P1 v1 λ-vs-budget probe — arm A λ sweep × 4× budget, arm A′ budget control",
				generatedBy: "research/v3/prototypes/p1-mdl/data/lambda-probe/probe.ts",
				asOf: "2026-08-05",
				grid: {
					lambdas: LAMBDAS,
					budgetsMs: BUDGETS,
					v0BudgetMs: V0_BUDGET_MS,
					aprimeLambda: APRIME_LAMBDA,
					arms: ["a", "aprime"],
				},
				covers: COVERS,
				wall: {
					elapsedMs,
					summedCellMs: cells.reduce((total, cell) => total + cell.wallMs, 0),
					note:
						"six cover processes ran in parallel; the search's budget is a deterministic counter, not a clock, so parallelism changes elapsedMs and nothing else",
				},
				cells,
			},
			null,
			"\t",
		),
		"utf8",
	)
	console.log(`-> ${RESULTS_PATH} (${cells.length} cells, ${(elapsedMs / 1000).toFixed(0)}s elapsed)`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
