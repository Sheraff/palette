/**
 * # `sensitivity` — the exchange-rate falsifier (P6 `README.md` falsifier 3).
 *
 * This file **measures**. It decides nothing, it recommends nothing, and it must never be used to
 * move a rate: `README.md`'s standing prohibition ("no exchange rate is ever tuned against
 * adjudication wins, the demo set, or reviewer feedback") is exactly about the output of this
 * harness. Every number it prints is a perturbation response, and a perturbation response that
 * happens to look "better" is still not evidence for a value — the pre-registered convention below
 * is a *reporting* convention and the reviewer is the judge.
 *
 * ## What it runs
 *
 * The pre-registered grid (README falsifier 3, restated in the W10 brief):
 *
 * 1. **the six free rates** of `DEFAULT_EXCHANGE_RATES`, each at ×½ and ×2 (12 configs);
 * 2. **baseline** (1 config);
 * 3. **the quadrature comparison class** — lattice bandwidth ×½ and ×2, and `cellsPerBandwidth` one
 *    step denser and one step coarser than the shipped list's working point (4 configs).
 *    These *should* be flat. Proposal §3: a quadrature knob that moves palettes is a violated
 *    design, and this harness reports it as such rather than as a finding about a rate;
 * 4. **an extended anisotropy sweep** — `accentAnisotropy ∈ {0.25, 0.5, 1, 2, 4, 8}`, disclosed as
 *    an extension *beyond* the pre-registered ×½/×2 pair and reported as a full curve. It is here
 *    because `reports/second-palettes.md` §6 measured the accent and foreground role terms to be
 *    *identical* at λ = 1 on greyscale artwork (relative fitness gap 3e-16), so λ is the one rate
 *    whose curve is a statement about whether the mechanism has four roles or three.
 *    {0.5, 1, 2} are shared with (1)+(2); the extension adds {0.25, 4, 8}.
 *
 * Twenty distinct configurations in total.
 *
 * ## Why it composes the pipeline itself instead of calling `../src/candidate.ts`
 *
 * `candidate.ts`'s `paletteOf` closes over `DEFAULT_EXCHANGE_RATES` and calls `buildLattice`, which
 * takes no quadrature options — there is no hook, and adding one is not this worker's path. The four
 * module entry points all already take their arguments explicitly, so the pipeline is reassembled
 * below in the same four lines `candidate.ts` uses. That reassembly is the only place this file
 * could drift from the shipped candidate, so it is written to be diffed against `candidate.ts:79-87`
 * and nothing else about it is clever.
 *
 * ## Movement
 *
 * A palette "moved" when any published role colour differs from the baseline's by **at least the
 * regional same-colour bar for that pair** — `barFor(…, "regional")` from
 * `../../../src/adjudication/match.ts`, one bar across instruments, per SPEC. Gradient publication,
 * collapse flags and escapes are reported separately: they are not colours and the bar says nothing
 * about them.
 *
 * ## Determinism
 *
 * Fixed cover order (the set file's order), no timestamps anywhere in the output, and every run id
 * is a hash of the configuration it describes. Re-running writes byte-identical result files given
 * byte-identical palettes.
 *
 *     # 1. baseline, contention-free, one cover at a time — the only timings this tool reports
 *     node --experimental-strip-types prototypes/p6-figureground/tools/sensitivity.ts \
 *       --baseline --out <dir>
 *
 *     # 2. the other 19 configs (timings from this pass are NOT reportable — see --concurrency)
 *     node --experimental-strip-types prototypes/p6-figureground/tools/sensitivity.ts \
 *       --sweep --out <dir> --concurrency 6
 *
 *     # 3. the tables
 *     node --experimental-strip-types prototypes/p6-figureground/tools/sensitivity.ts \
 *       --report --out <dir>
 */

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { barFor } from "../../../src/adjudication/match.ts"
import { colorDistance, colorFromRgb, rgbToHex, rgbToOkLab } from "../../../src/contract/color.ts"
import type { PaletteColor, Rgb8 } from "../../../src/contract/types.ts"
import { REPO_ROOT } from "../../../src/devloop/run.ts"
import { DEFAULT_EXCHANGE_RATES } from "../src/energy/rates.ts"
import { solve } from "../src/energy/solve.ts"
import {
	accentFitness,
	belongingCost,
	computeFitnessScales,
	type FieldPath,
	foregroundFitness,
	representativenessCost,
} from "../src/energy/terms.ts"
import { buildFieldHypotheses } from "../src/fieldmodel/index.ts"
import { buildLatticeWith, LATTICE_BANDWIDTH, LATTICE_CELLS_PER_BANDWIDTH } from "../src/lattice/index.ts"
import type { LatticeOptions } from "../src/lattice/index.ts"
import { buildSubstrate } from "../src/substrate/index.ts"
import type { ExchangeRates } from "../src/types.ts"

/* ------------------------------------------------------------------------------------------- */
/* the cover set                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * The 18-cover scratch set — `demo-20` minus the two covers on which the exact search does not
 * terminate.
 *
 * `[INHERITED — reports/first-palettes.md §3.0]` demo-20 indices 5 (`…0000bbc3367a…`) and 13
 * (`…00001a9be12b…`) were killed at a 180 s cap there and again at a 300 s cap in
 * `reports/second-palettes.md` §4. Both prior reports measure this same 18, so the sensitivity
 * curves are comparable with them cover for cover. The order is the set file's order and is fixed.
 */
export const SENSITIVITY_COVERS: readonly string[] = [
	"00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg",
	"00/ab67616d00001e02000000d8bc25fbca2eff2a4a.jpg",
	"00/ab67616d00001e02000001335fe604d859a69094.jpg",
	"00/ab67616d00001e020000099e97d17d28279e9184.jpg",
	"00/ab67616d00001e0200000bb3dc49110c4aab8aa7.jpg",
	"00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg",
	"00/ab67616d00001e0200000f92552b0935b967964d.jpg",
	"00/ab67616d00001e0200001073a73e3a949021f65e.jpg",
	"00/ab67616d00001e02000013cdd885595a94002abc.jpg",
	"00/ab67616d00001e0200001448e1c8dadd225466f4.jpg",
	"00/ab67616d00001e0200001456cbd4881a798808bf.jpg",
	"00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg",
	"00/ab67616d00001e0200001ecff3d9ec20cac4b472.jpg",
	"00/ab67616d00001e02000021fd811bf36e739e61bf.jpg",
	"00/ab67616d00001e02000022e7e9d11c908479200b.jpg",
	"00/ab67616d00001e02000023e98b7381eaed77a9cb.jpg",
	"00/ab67616d00001e02000025b4e66a00806cb6dd7d.jpg",
	"00/ab67616d00001e020000269ead63cf2376a6b67d.jpg",
]

/**
 * How a cover is named in every table: its **set index** (the 0…17 of `reports/second-palettes.md`)
 * and the distinguishing tail of its filename. Every cover but the first shares the same 16-character
 * `ab67616d00001e02` prefix, so a leading slice identifies nothing.
 */
export function coverLabel(cover: string): string {
	const index = SENSITIVITY_COVERS.indexOf(cover)
	const base = cover.split("/").at(-1)!.replace(/\.[^.]+$/u, "")
	return `${index} …${base.slice(16, 26)}`
}

/**
 * Wall cap per (config, cover), in milliseconds.
 *
 * `[HELD — a cap, not a threshold]` 240 s, i.e. twice the 120 s exclusion line the brief sets, so a
 * config that makes an *included* cover twice as slow as its exclusion boundary is still measured
 * rather than silently dropped. A cover that hits it is recorded as `timeout` and counted in the
 * denominators as "no palette", never as "did not move".
 */
export const RUN_CAP_MS = 240_000

/**
 * The baseline solve time above which a cover is excluded from the sweep.
 *
 * `[INHERITED — the W10 brief]` 120 s. A sensitivity result on the fast subset is a result about the
 * fast subset, so the exclusion list is reported before any curve.
 */
export const EXCLUSION_MS = 120_000

/* ------------------------------------------------------------------------------------------- */
/* the configuration grid                                                                         */
/* ------------------------------------------------------------------------------------------- */

export type ConfigFamily = "baseline" | "rate" | "quadrature" | "anisotropy-extension"

export type SensitivityConfig = Readonly<{
	/** `<knob>-<factor>-<hash>`; the hash is over the perturbed values, never over a clock. */
	id: string
	family: ConfigFamily
	/** The perturbed knob's name, or `"—"` for the baseline. */
	knob: string
	/** Human label for the perturbation, e.g. `×2` or `λ=4`. */
	label: string
	rates: ExchangeRates
	lattice: LatticeOptions
}>

/** The six free rates, in the registry's own declaration order. */
export const FREE_RATE_NAMES = [
	"belonging",
	"coverage",
	"fieldDescriptionLength",
	"collapse",
	"representativeness",
	"accentAnisotropy",
] as const

/**
 * The quadrature working point the pipeline actually runs at on these covers.
 *
 * `[MEASURED — ../src/lattice/constants.ts]` `LATTICE_CELLS_PER_BANDWIDTH` is a *list* and the
 * builder takes the highest resolution that fits the cell budget; on ordinary artwork that is 1.75
 * (the constant's own doc comment, re-checked against the 300×300 covers here). "One step denser"
 * and "one step coarser" are therefore the neighbours in that list: 2 and 1.5.
 */
const CELLS_PER_BANDWIDTH_WORKING_POINT = LATTICE_CELLS_PER_BANDWIDTH[1]

function hashOf(payload: unknown): string {
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8)
}

function makeConfig(
	family: ConfigFamily,
	knob: string,
	label: string,
	rates: ExchangeRates,
	lattice: LatticeOptions,
): SensitivityConfig {
	const id = `${knob}-${label}-${hashOf({ rates, lattice })}`.replace(/[^a-zA-Z0-9.=-]/gu, "")
	return { id, family, knob, label, rates, lattice }
}

/**
 * The 20 configurations, in a fixed order: baseline, the twelve rate perturbations in registry
 * order, the four quadrature ones, then the three extra anisotropy points.
 */
export function buildConfigs(): readonly SensitivityConfig[] {
	const configs: SensitivityConfig[] = [
		makeConfig("baseline", "baseline", "x1", DEFAULT_EXCHANGE_RATES, {}),
	]

	for (const name of FREE_RATE_NAMES) {
		for (const factor of [0.5, 2] as const) {
			configs.push(makeConfig(
				"rate",
				name,
				factor === 0.5 ? "xhalf" : "x2",
				{ ...DEFAULT_EXCHANGE_RATES, [name]: DEFAULT_EXCHANGE_RATES[name] * factor },
				{},
			))
		}
	}

	configs.push(
		makeConfig("quadrature", "bandwidth", "xhalf", DEFAULT_EXCHANGE_RATES, {
			bandwidth: LATTICE_BANDWIDTH * 0.5,
		}),
		makeConfig("quadrature", "bandwidth", "x2", DEFAULT_EXCHANGE_RATES, {
			bandwidth: LATTICE_BANDWIDTH * 2,
		}),
		makeConfig("quadrature", "cellsPerBandwidth", "denser", DEFAULT_EXCHANGE_RATES, {
			cellsPerBandwidth: LATTICE_CELLS_PER_BANDWIDTH[0],
		}),
		makeConfig("quadrature", "cellsPerBandwidth", "coarser", DEFAULT_EXCHANGE_RATES, {
			cellsPerBandwidth: LATTICE_CELLS_PER_BANDWIDTH[2],
		}),
	)

	// The extension. 0.5, 1 and 2 are already above; only the three new points are added, so no cover
	// is ever solved twice under the same numbers.
	for (const lambda of [0.25, 4, 8] as const) {
		configs.push(makeConfig(
			"anisotropy-extension",
			"accentAnisotropy",
			`lambda=${lambda}`,
			{ ...DEFAULT_EXCHANGE_RATES, accentAnisotropy: lambda },
			{},
		))
	}

	return configs
}

/** The anisotropy curve's points, in sweep order, as `[λ, configId]`. */
export function anisotropyCurve(configs: readonly SensitivityConfig[]): readonly [number, string][] {
	const byLambda = new Map<number, string>()
	for (const config of configs) {
		if (config.knob === "accentAnisotropy") byLambda.set(config.rates.accentAnisotropy, config.id)
		if (config.family === "baseline") byLambda.set(config.rates.accentAnisotropy, config.id)
	}
	return [0.25, 0.5, 1, 2, 4, 8].map((lambda) => [lambda, byLambda.get(lambda)!] as [number, string])
}

/* ------------------------------------------------------------------------------------------- */
/* one measurement                                                                                */
/* ------------------------------------------------------------------------------------------- */

export type CoverResult = Readonly<{
	configId: string
	cover: string
	status: "ok" | "error"
	ms: number
	error?: string
	roles?: Readonly<{ background: Rgb8; surface: Rgb8; foreground: Rgb8; accent: Rgb8 }>
	gradientStops?: number
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
	escape?: string | null
	energyTotal?: number
	triples?: number
	/** `reports/first-palettes.md` CHECK6: the energy gap of exchanging the fg and accent seats. */
	swapGap?: number | null
	/** `max_i |fgFitness_i − accentFitness_i| / max_i fgFitness_i` — second-palettes §6's statistic. */
	fitnessRelativeGap?: number
	/** The two role terms' own argmax triples: identical leaders means the roles are not separated. */
	foregroundLeader?: string
	accentLeader?: string
	/** `Σ markEnergy / Σ inkEnergy` over all triples — the cover's chromatic content. */
	markOverInk?: number
}>

/** Solve one cover under one configuration and read the diagnostics the report needs off it. */
export async function measureOne(
	config: SensitivityConfig,
	coverPath: string,
): Promise<CoverResult> {
	const imagePath = isAbsolute(coverPath) ? coverPath : resolve(REPO_ROOT, coverPath)
	const started = process.hrtime.bigint()
	try {
		// The four lines of `../src/candidate.ts:79-87`, with the two overrides threaded in.
		const substrate = await buildSubstrate(imagePath)
		const lattice = buildLatticeWith(substrate, config.lattice)
		const hypotheses = buildFieldHypotheses(substrate, lattice, config.rates)
		const solution = solve(substrate, lattice, hypotheses, config.rates)
		const ms = Number(process.hrtime.bigint() - started) / 1e6

		const stats = lattice.triples.map((triple) => lattice.statsAt(triple.lab))
		const scales = computeFitnessScales(stats, config.rates)
		const field: FieldPath = solution.field.stops.map((stop) => stop.triple.lab)

		let maxForeground = 0
		let maxAccent = 0
		let maxAbsoluteGap = 0
		let foregroundLeader = 0
		let accentLeader = 0
		let sumMark = 0
		let sumInk = 0
		for (let index = 0; index < stats.length; index++) {
			const one = stats[index]!
			const fg = foregroundFitness(one, field, scales)
			const ac = accentFitness(one, field, scales, config.rates)
			if (fg > maxForeground) {
				maxForeground = fg
				foregroundLeader = index
			}
			if (ac > maxAccent) {
				maxAccent = ac
				accentLeader = index
			}
			const gap = Math.abs(fg - ac)
			if (gap > maxAbsoluteGap) maxAbsoluteGap = gap
			sumMark += one.markEnergy
			sumInk += one.inkEnergy
		}

		// CHECK6, re-derived exactly as `first-palettes.ts` derives it: everything but the two role
		// unaries cancels between the two seat assignments, so the gap IS the energy of the swap.
		const indexOf = (rgb: Rgb8): number =>
			lattice.triples.findIndex((triple) => rgbToHex(triple.rgb) === rgbToHex(rgb))
		const foregroundIndex = indexOf(solution.foreground.rgb)
		const accentIndex = indexOf(solution.accent.rgb)
		let swapGap: number | null = null
		if (foregroundIndex >= 0 && accentIndex >= 0 && foregroundIndex !== accentIndex) {
			const unary = (index: number, role: "foreground" | "accent"): number => {
				const one = stats[index]!
				const fitness = role === "foreground"
					? foregroundFitness(one, field, scales)
					: accentFitness(one, field, scales, config.rates)
				return config.rates.belonging * belongingCost(one) + (1 - fitness) +
					config.rates.representativeness * representativenessCost(one)
			}
			const asIs = unary(foregroundIndex, "foreground") + unary(accentIndex, "accent")
			const swapped = unary(accentIndex, "foreground") + unary(foregroundIndex, "accent")
			swapGap = swapped - asIs
		}

		return {
			configId: config.id,
			cover: coverPath,
			status: "ok",
			ms,
			roles: {
				background: solution.background.rgb,
				surface: solution.surface.rgb,
				foreground: solution.foreground.rgb,
				accent: solution.accent.rgb,
			},
			gradientStops: solution.field.kind === "gradient" ? solution.field.stops.length : 0,
			surfaceCollapsed: solution.surfaceCollapsed,
			accentCollapsed: solution.accentCollapsed,
			escape: solution.escape === undefined ? null : solution.escape.role,
			energyTotal: solution.energy.total,
			triples: lattice.triples.length,
			swapGap,
			fitnessRelativeGap: maxForeground > 0 ? maxAbsoluteGap / maxForeground : 0,
			foregroundLeader: rgbToHex(lattice.triples[foregroundLeader]!.rgb),
			accentLeader: rgbToHex(lattice.triples[accentLeader]!.rgb),
			markOverInk: sumInk > 0 ? sumMark / sumInk : 0,
		}
	} catch (error) {
		return {
			configId: config.id,
			cover: coverPath,
			status: "error",
			ms: Number(process.hrtime.bigint() - started) / 1e6,
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
		}
	}
}

/* ------------------------------------------------------------------------------------------- */
/* movement                                                                                       */
/* ------------------------------------------------------------------------------------------- */

export const ROLE_ORDER = ["background", "surface", "foreground", "accent"] as const
export type RoleKey = (typeof ROLE_ORDER)[number]

export type Movement = Readonly<{
	moved: boolean
	byRole: Readonly<Record<RoleKey, boolean>>
	/** The fg and accent hexes exchanged, and nothing else about the published set changed. */
	seatSwap: boolean
}>

/**
 * Did this palette move, against the baseline, beyond the regional same-colour bar?
 *
 * One bar across instruments: `barFor(first, second, "regional")` is `sameColorBar` from the
 * contract, the same ruler adjudication uses. `>=` rather than `>` matches `compareRole`'s `same =
 * distance < bar`, so "moved" is exactly "not the same colour".
 */
export function movementOf(
	baseline: Readonly<Record<RoleKey, Rgb8>>,
	other: Readonly<Record<RoleKey, Rgb8>>,
): Movement {
	const byRole = {} as Record<RoleKey, boolean>
	let moved = false
	for (const role of ROLE_ORDER) {
		const first: PaletteColor = colorFromRgb(baseline[role])
		const second: PaletteColor = colorFromRgb(other[role])
		const bar = barFor(first, second, "regional")!
		const differs = colorDistance(first, second) >= bar
		byRole[role] = differs
		if (differs) moved = true
	}
	const seatSwap = rgbToHex(baseline.foreground) === rgbToHex(other.accent) &&
		rgbToHex(baseline.accent) === rgbToHex(other.foreground) &&
		rgbToHex(baseline.foreground) !== rgbToHex(baseline.accent)
	return { moved, byRole, seatSwap }
}

/** Chroma of an sRGB triple in OKLab — used only to label low-chroma covers. */
export function chromaOf(rgb: Rgb8): number {
	const lab = rgbToOkLab(rgb)
	return Math.hypot(lab[1], lab[2])
}

/* ------------------------------------------------------------------------------------------- */
/* driver                                                                                         */
/* ------------------------------------------------------------------------------------------- */

const SELF = fileURLToPath(import.meta.url)

type ChildOutcome = CoverResult | Readonly<{
	configId: string
	cover: string
	status: "timeout" | "crash"
	ms: number
	error?: string
}>

/**
 * Run one (config, cover) in its own process so the cap can actually be enforced — the solver is
 * synchronous branch-and-bound and nothing in-process can interrupt it.
 */
function runChild(configId: string, cover: string): Promise<ChildOutcome> {
	return new Promise((resolveOutcome) => {
		const started = Date.now()
		const child = spawn(
			process.execPath,
			["--experimental-strip-types", SELF, "--worker", configId, cover],
			{ cwd: resolve(SELF, "..", "..", "..", ".."), env: { ...process.env, NODE_NO_WARNINGS: "1" } },
		)
		let out = ""
		let err = ""
		child.stdout.on("data", (chunk) => (out += chunk))
		child.stderr.on("data", (chunk) => (err += chunk))
		const timer = setTimeout(() => child.kill("SIGKILL"), RUN_CAP_MS)
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			const ms = Date.now() - started
			const line = out.split("\n").find((candidate) => candidate.startsWith("RESULT "))
			if (line !== undefined) {
				resolveOutcome(JSON.parse(line.slice("RESULT ".length)) as CoverResult)
				return
			}
			if (signal === "SIGKILL") {
				resolveOutcome({ configId, cover, status: "timeout", ms })
				return
			}
			resolveOutcome({
				configId,
				cover,
				status: "crash",
				ms,
				error: `exit ${code}: ${err.trim().split("\n").slice(-3).join(" / ")}`,
			})
		})
	})
}

async function runConfig(
	config: SensitivityConfig,
	covers: readonly string[],
	outDir: string,
	concurrency: number,
): Promise<readonly ChildOutcome[]> {
	const results: ChildOutcome[] = new Array(covers.length)
	let next = 0
	const workers = Array.from({ length: Math.min(concurrency, covers.length) }, async () => {
		for (;;) {
			const index = next++
			if (index >= covers.length) return
			results[index] = await runChild(config.id, covers[index]!)
			process.stderr.write(
				`  ${config.id} ${coverLabel(covers[index]!)} ${results[index]!.status} ${
					results[index]!.ms.toFixed(0)
				}ms\n`,
			)
		}
	})
	await Promise.all(workers)
	await mkdir(join(outDir, "results"), { recursive: true })
	await writeFile(
		join(outDir, "results", `${config.id}.json`),
		`${JSON.stringify({ config, results }, null, "\t")}\n`,
	)
	return results
}

async function readConfigResults(
	outDir: string,
	configId: string,
): Promise<{ config: SensitivityConfig; results: ChildOutcome[] } | null> {
	try {
		return JSON.parse(await readFile(join(outDir, "results", `${configId}.json`), "utf8"))
	} catch {
		return null
	}
}

/* ------------------------------------------------------------------------------------------- */
/* the report                                                                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The pre-registered reporting convention, applied mechanically.
 *
 * README falsifier 3: *a free rate whose ×2 or ×½ perturbation moves >25% of palettes beyond the
 * bar, while carrying no principled derivation, is reported as* **load-bearing-without-principle**.
 * All six rates in the registry are tagged `[UNCALIBRATED — starting point, not a calibration]`, so
 * the second clause is satisfied for every one of them and only the first is measured here. This
 * function encodes the arithmetic, not the judgement: the reviewer judges.
 */
export const LOAD_BEARING_MOVED_FRACTION = 0.25

export function isLoadBearing(movedFraction: number): boolean {
	return movedFraction > LOAD_BEARING_MOVED_FRACTION
}

function quantile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return NaN
	const position = q * (sorted.length - 1)
	const low = Math.floor(position)
	const high = Math.ceil(position)
	if (low === high) return sorted[low]!
	return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low)
}

async function report(outDir: string): Promise<void> {
	const configs = buildConfigs()
	const baseline = configs[0]!
	const baselineFile = await readConfigResults(outDir, baseline.id)
	if (baselineFile === null) throw new Error("no baseline results; run --baseline first")

	const baselineByCover = new Map<string, ChildOutcome>()
	for (const one of baselineFile.results) baselineByCover.set(one.cover, one)

	const included = SENSITIVITY_COVERS.filter((cover) => {
		const one = baselineByCover.get(cover)
		return one !== undefined && one.status === "ok" && one.ms <= EXCLUSION_MS
	})
	const excluded = SENSITIVITY_COVERS.filter((cover) => !included.includes(cover))

	console.log(`## cover set\n`)
	console.log(`| # | cover | baseline ms | status | included |`)
	console.log(`|---|---|---|---|---|`)
	SENSITIVITY_COVERS.forEach((cover, index) => {
		const one = baselineByCover.get(cover)
		console.log(
			`| ${index} | \`${coverLabel(cover)}\` | ${one?.ms.toFixed(0) ?? "—"} | ${
				one?.status ?? "—"
			} | ${included.includes(cover) ? "yes" : "**no**"} |`,
		)
	})
	const okTimes = baselineFile.results.filter((one) => one.status === "ok").map((one) => one.ms).sort(
		(a, b) => a - b,
	)
	console.log(
		`\nbaseline (1 worker, cold): min ${okTimes[0]?.toFixed(0)}, median ${
			quantile(okTimes, 0.5).toFixed(0)
		}, p95 ${quantile(okTimes, 0.95).toFixed(0)}, max ${okTimes[okTimes.length - 1]?.toFixed(0)}; Σ ${
			(okTimes.reduce((sum, value) => sum + value, 0) / 1000).toFixed(0)
		} s`,
	)
	console.log(`included ${included.length}/${SENSITIVITY_COVERS.length}; excluded ${excluded.length}`)

	console.log(`\n## movement\n`)
	console.log(
		`| config | family | knob | moved | bg | surface | fg | accent | seat swaps | no palette |`,
	)
	console.log(`|---|---|---|---|---|---|---|---|---|---|`)
	const movedFractionByConfig = new Map<string, number>()
	for (const config of configs) {
		if (config.family === "baseline") continue
		const file = await readConfigResults(outDir, config.id)
		if (file === null) {
			console.log(`| \`${config.id}\` | ${config.family} | ${config.knob} ${config.label} | — | — | — | — | — | — | — |`)
			continue
		}
		const byCover = new Map(file.results.map((one) => [one.cover, one]))
		let moved = 0
		let compared = 0
		let missing = 0
		let swaps = 0
		const roleCounts: Record<RoleKey, number> = { background: 0, surface: 0, foreground: 0, accent: 0 }
		for (const cover of included) {
			const base = baselineByCover.get(cover)!
			const other = byCover.get(cover)
			if (other === undefined || other.status !== "ok" || !("roles" in other) || other.roles === undefined) {
				missing++
				continue
			}
			compared++
			const movement = movementOf(
				(base as CoverResult).roles!,
				other.roles,
			)
			if (movement.moved) moved++
			if (movement.seatSwap) swaps++
			for (const role of ROLE_ORDER) if (movement.byRole[role]) roleCounts[role]++
		}
		const fraction = compared === 0 ? NaN : moved / compared
		movedFractionByConfig.set(config.id, fraction)
		console.log(
			`| \`${config.id}\` | ${config.family} | ${config.knob} ${config.label} | ${moved}/${compared} (${
				(fraction * 100).toFixed(0)
			}%) | ${roleCounts.background} | ${roleCounts.surface} | ${roleCounts.foreground} | ${roleCounts.accent} | ${swaps} | ${missing} |`,
		)
	}

	console.log(`\n## the pre-registered convention, applied\n`)
	for (const name of FREE_RATE_NAMES) {
		const points = configs.filter((config) => config.knob === name && config.family === "rate")
		const fractions = points.map((config) => movedFractionByConfig.get(config.id) ?? NaN)
		const worst = Math.max(...fractions.filter((value) => Number.isFinite(value)))
		console.log(
			`- **${name}**: ×½ ${(fractions[0]! * 100).toFixed(0)}%, ×2 ${
				(fractions[1]! * 100).toFixed(0)
			}% ⇒ ${isLoadBearing(worst) ? "**LOAD-BEARING-WITHOUT-PRINCIPLE**" : "under the convention's line"}`,
		)
	}
	for (const config of configs.filter((one) => one.family === "quadrature")) {
		const fraction = movedFractionByConfig.get(config.id) ?? NaN
		console.log(
			`- *quadrature* **${config.knob} ${config.label}**: ${(fraction * 100).toFixed(0)}% ⇒ ${
				fraction > 0 ? "**DESIGN VIOLATION (proposal §3)**" : "flat, as the design requires"
			}`,
		)
	}

	console.log(`\n## anisotropy\n`)
	console.log(
		`| λ | moved vs baseline | seat swaps | swap-gap median | swap-gap min | fitness rel-gap median | fg≡accent leaders |`,
	)
	console.log(`|---|---|---|---|---|---|---|`)
	for (const [lambda, configId] of anisotropyCurve(configs)) {
		const file = await readConfigResults(outDir, configId)
		if (file === null) continue
		const byCover = new Map(file.results.map((one) => [one.cover, one]))
		let moved = 0
		let compared = 0
		let swaps = 0
		let sameLeaders = 0
		const gaps: number[] = []
		const relative: number[] = []
		for (const cover of included) {
			const other = byCover.get(cover) as CoverResult | undefined
			if (other === undefined || other.status !== "ok" || other.roles === undefined) continue
			compared++
			const movement = movementOf((baselineByCover.get(cover) as CoverResult).roles!, other.roles)
			if (movement.moved) moved++
			if (movement.seatSwap) swaps++
			if (other.swapGap !== null && other.swapGap !== undefined) gaps.push(Math.abs(other.swapGap))
			if (other.fitnessRelativeGap !== undefined) relative.push(other.fitnessRelativeGap)
			if (other.foregroundLeader === other.accentLeader) sameLeaders++
		}
		gaps.sort((a, b) => a - b)
		relative.sort((a, b) => a - b)
		console.log(
			`| ${lambda} | ${moved}/${compared} | ${swaps} | ${quantile(gaps, 0.5).toExponential(2)} | ${
				gaps[0]?.toExponential(2) ?? "—"
			} | ${quantile(relative, 0.5).toExponential(2)} | ${sameLeaders}/${compared} |`,
		)
	}

	console.log(`\n### per-cover anisotropy detail\n`)
	console.log(`| cover | mark/ink | λ | fg | accent | swap gap | fitness rel-gap |`)
	console.log(`|---|---|---|---|---|---|---|`)
	for (const cover of included) {
		for (const [lambda, configId] of anisotropyCurve(configs)) {
			const file = await readConfigResults(outDir, configId)
			if (file === null) continue
			const one = (file.results as CoverResult[]).find((entry) => entry.cover === cover)
			if (one === undefined || one.status !== "ok" || one.roles === undefined) continue
			console.log(
				`| ${coverLabel(cover)} | ${one.markOverInk?.toFixed(3)} | ${lambda} | \`${
					rgbToHex(one.roles.foreground)
				}\` | \`${rgbToHex(one.roles.accent)}\` | ${
					one.swapGap === null || one.swapGap === undefined ? "—" : one.swapGap.toExponential(2)
				} | ${one.fitnessRelativeGap?.toExponential(2)} |`,
			)
		}
	}
}

/* ------------------------------------------------------------------------------------------- */

const argv = process.argv.slice(2)
const outIndex = argv.indexOf("--out")
const outDir = outIndex >= 0 ? resolve(argv[outIndex + 1]!) : ""

// The CLI runs only when this file *is* the program. `tests/sensitivity.test.ts` imports the pure
// helpers above, and a top-level `process.exit(2)` on import would make the suite untestable.
const isEntryPoint = process.argv[1] !== undefined && resolve(process.argv[1]) === SELF

if (!isEntryPoint) {
	// imported as a library — nothing to do
} else if (argv[0] === "--worker") {
	const config = buildConfigs().find((one) => one.id === argv[1])
	if (config === undefined) throw new Error(`unknown config ${argv[1]}`)
	const result = await measureOne(config, argv[2]!)
	process.stdout.write(`RESULT ${JSON.stringify(result)}\n`)
} else if (argv.includes("--baseline")) {
	const config = buildConfigs()[0]!
	process.stderr.write(`baseline ${config.id}, ${SENSITIVITY_COVERS.length} covers, 1 worker\n`)
	const results = await runConfig(config, SENSITIVITY_COVERS, outDir, 1)
	const total = results.reduce((sum, one) => sum + one.ms, 0)
	const included = results.filter((one) => one.status === "ok" && one.ms <= EXCLUSION_MS)
	process.stdout.write(
		`baseline wall ${(total / 1000).toFixed(0)} s over ${results.length} covers; ` +
			`included ${included.length}; ` +
			`projection for 19 further configs on the included subset: ${
				(included.reduce((sum, one) => sum + one.ms, 0) * 19 / 1000 / 60).toFixed(0)
			} min of single-worker compute\n`,
	)
} else if (argv.includes("--sweep")) {
	const concurrencyIndex = argv.indexOf("--concurrency")
	const concurrency = concurrencyIndex >= 0 ? Number(argv[concurrencyIndex + 1]) : 1
	const onlyIndex = argv.indexOf("--only")
	const only = onlyIndex >= 0 ? argv[onlyIndex + 1]!.split(",") : null
	const configs = buildConfigs()
	const baselineFile = await readConfigResults(outDir, configs[0]!.id)
	if (baselineFile === null) throw new Error("run --baseline first")
	const covers = SENSITIVITY_COVERS.filter((cover) => {
		const one = baselineFile.results.find((entry) => entry.cover === cover)
		return one !== undefined && one.status === "ok" && one.ms <= EXCLUSION_MS
	})
	for (const config of configs) {
		if (config.family === "baseline") continue
		if (only !== null && !only.includes(config.family) && !only.includes(config.knob)) continue
		if (await readConfigResults(outDir, config.id) !== null) {
			process.stderr.write(`skip ${config.id} (already measured)\n`)
			continue
		}
		process.stderr.write(`config ${config.id} over ${covers.length} covers\n`)
		await runConfig(config, covers, outDir, concurrency)
	}
} else if (argv.includes("--report")) {
	await report(outDir)
} else {
	console.error(
		"usage: sensitivity.ts --out <dir> (--baseline | --sweep [--concurrency n] [--only fam,knob] | --report)",
	)
	process.exit(2)
}
