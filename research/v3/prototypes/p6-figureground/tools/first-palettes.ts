/**
 * # `first-palettes` — the measurement behind `reports/first-palettes.md`.
 *
 * Two modes, one file, because they answer two halves of the same question and share every helper.
 *
 *     # (a) the audit surface for one cover: palette, per-term energy, and the survivor table
 *     node --experimental-strip-types prototypes/p6-figureground/tools/first-palettes.ts \
 *       --probe 00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg
 *
 *     # (b) the numbers for a finished dev-loop run
 *     node --experimental-strip-types prototypes/p6-figureground/tools/first-palettes.ts \
 *       --run data/devloop/runs/<runId>.jsonl
 *
 * ## What this file may and may not do
 *
 * It **measures**; it decides nothing. There is no number in it that enters a palette: the rates
 * come from `../src/energy/rates.ts` untouched, the barriers from `../src/energy/barriers.ts`, and
 * the contract's own `scorePalette` produces the scorecard. The one constant below (`SURVIVORS`) is
 * how many rows a table prints. `REVIEWER_EVIDENCE.md`'s standing rule applies to whoever reads its
 * output: none of this may move a rate.
 *
 * ## The survivor table, and why it is a re-derivation rather than a solver hook
 *
 * `src/energy/solve.ts` is not this worker's path, and instrumenting a search that is asserted to be
 * bit-identical to an exhaustive reference is a good way to make it stop being so. Instead the table
 * re-derives the foreground and accent option lists **from the exported terms**, under the field the
 * solver actually chose (`Solution.field`), using the same expressions `solve.ts` uses — the unary
 * cost, its three components, and the ratio/coincidence factors underneath the role fitness. Where
 * the re-derivation and the solver could disagree, the winner's row is checked against
 * `Solution.energy.terms["unary.foreground"]` and the disagreement printed; a silent one would make
 * the table fiction.
 */

import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"

import {
	apcaRaw,
	colorFromRgb,
	okLabDistance,
	rgbToHex,
	rgbToOkLab,
	sameColorBar,
} from "../../../src/contract/color.ts"
import { EPSILON_ACCENT_RAW, EPSILON_TEXT_RAW } from "../../../src/contract/constants.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../src/contract/invariants.ts"
import { minRawContrastOverRamp } from "../../../src/contract/ramp.ts"
import { scorePalette } from "../../../src/contract/scorecard.ts"
import type { GradientStop, Palette, Rgb8 } from "../../../src/contract/types.ts"
import { REPO_ROOT } from "../../../src/devloop/run.ts"
import type { RunFooter, RunHeader, RunRow } from "../../../src/devloop/types.ts"
import { DEFAULT_EXCHANGE_RATES } from "../src/energy/rates.ts"
import { solveWithDiagnostics } from "../src/energy/solve.ts"
import {
	accentFitness,
	belongingCost,
	computeFitnessScales,
	type FieldPath,
	fieldFitness,
	foregroundFitness,
	groundCoincidence,
	representativenessCost,
} from "../src/energy/terms.ts"
import { buildFieldHypotheses } from "../src/fieldmodel/index.ts"
import { buildLattice } from "../src/lattice/index.ts"
import { buildSubstrate } from "../src/substrate/index.ts"
import type { CandidateStats, DistinctTriple, Solution } from "../src/types.ts"

/** How many rows a survivor table prints. `[HELD — a table height, nothing reads it]` */
const SURVIVORS = 20

/* ------------------------------------------------------------------------------------------- */
/* (a) one cover                                                                                  */
/* ------------------------------------------------------------------------------------------- */

type Row = Readonly<{
	rgb: Rgb8
	presence: number
	inkEnergy: number
	markEnergy: number
	inkPerMass: number
	groundCoincidence: number
	fitness: number
	belonging: number
	representativeness: number
	roleMisfit: number
	unary: number
	/** |APCA| against the published background — the readability the reviewer is about. */
	apcaAgainstBackground: number
}>

function probeOne(
	solution: Solution,
	stats: readonly CandidateStats[],
	triples: readonly DistinctTriple[],
	role: "foreground" | "accent",
): Row[] {
	const rates = DEFAULT_EXCHANGE_RATES
	const scales = computeFitnessScales(stats, rates)
	const field: FieldPath = solution.field.stops.map((stop) => stop.triple.lab)
	const backgroundRgb = solution.background.rgb

	const rows: Row[] = []
	for (let index = 0; index < triples.length; index++) {
		const one = stats[index]
		const fitness = role === "foreground"
			? foregroundFitness(one, field, scales)
			: accentFitness(one, field, scales, rates)
		const belonging = rates.belonging * belongingCost(one)
		const representativeness = rates.representativeness * representativenessCost(one)
		const roleMisfit = 1 - fitness
		rows.push({
			rgb: triples[index].rgb,
			presence: one.presence,
			inkEnergy: one.inkEnergy,
			markEnergy: one.markEnergy,
			inkPerMass: one.inkEnergy / Math.max(one.presence, 1e-30),
			groundCoincidence: groundCoincidence(one, field),
			fitness,
			belonging,
			representativeness,
			roleMisfit,
			unary: belonging + roleMisfit + representativeness,
			apcaAgainstBackground: Math.abs(apcaRaw(triples[index].rgb, backgroundRgb)),
		})
	}
	rows.sort((first, second) => first.unary - second.unary)
	return rows
}

function formatRows(rows: readonly Row[], limit: number): string {
	const header =
		"| # | hex | unary | belonging | roleMisfit | repr | fitness | inkE | ink/mass | M | groundCoinc | \\|APCA\\| vs bg |"
	const lines = [header, "|---|---|---|---|---|---|---|---|---|---|---|---|"]
	for (let index = 0; index < Math.min(limit, rows.length); index++) {
		const row = rows[index]
		lines.push(
			`| ${index + 1} | \`${rgbToHex(row.rgb)}\` | ${f(row.unary)} | ${f(row.belonging)} | ${
				f(row.roleMisfit)
			} | ${f(row.representativeness)} | ${f(row.fitness)} | ${e(row.inkEnergy)} | ${
				f(row.inkPerMass)
			} | ${e(row.presence)} | ${f(row.groundCoincidence)} | ${row.apcaAgainstBackground.toFixed(1)} |`,
		)
	}
	return lines.join("\n")
}

const f = (value: number): string => value.toFixed(4)
const e = (value: number): string => value.toExponential(2)

async function probe(imagePaths: readonly string[], brief = false): Promise<void> {
	for (const raw of imagePaths) {
		const imagePath = isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw)
		const started = process.hrtime.bigint()
		const substrate = await buildSubstrate(imagePath)
		const afterSubstrate = process.hrtime.bigint()
		const lattice = buildLattice(substrate)
		const afterLattice = process.hrtime.bigint()
		const hypotheses = buildFieldHypotheses(substrate, lattice, DEFAULT_EXCHANGE_RATES)
		const afterField = process.hrtime.bigint()
		const { solution, diagnostics } = solveWithDiagnostics(
			substrate,
			lattice,
			hypotheses,
			DEFAULT_EXCHANGE_RATES,
		)
		const done = process.hrtime.bigint()
		const ms = (from: bigint, to: bigint): string => (Number(to - from) / 1e6).toFixed(0)

		const stats = lattice.triples.map((triple) => lattice.statsAt(triple.lab))
		const scales = computeFitnessScales(stats, DEFAULT_EXCHANGE_RATES)

		console.log(`\n## ${raw}`)
		console.log(
			`size ${substrate.planes.width}×${substrate.planes.height}, triples ${lattice.triples.length}, ` +
				`hypotheses ${hypotheses.length} (${hypotheses.map((h) => h.kind).join(",")})`,
		)
		console.log(
			`timing ms: substrate ${ms(started, afterSubstrate)}, lattice ${
				ms(afterSubstrate, afterLattice)
			}, field ${ms(afterLattice, afterField)}, solve ${ms(afterField, done)}, total ${
				ms(started, done)
			}; tuples ${diagnostics.tuplesEvaluated}`,
		)
		console.log(
			`palette: bg ${rgbToHex(solution.background.rgb)} surface ${
				rgbToHex(solution.surface.rgb)
			} fg ${rgbToHex(solution.foreground.rgb)} accent ${rgbToHex(solution.accent.rgb)}`,
		)
		console.log(
			`field ${solution.field.kind} (${solution.field.stops.length} stops), collapses s=${solution.surfaceCollapsed} a=${solution.accentCollapsed}, escape ${
				solution.escape === undefined ? "none" : solution.escape.role
			}`,
		)
		console.log(
			`|APCA| fg vs bg ${
				Math.abs(apcaRaw(solution.foreground.rgb, solution.background.rgb)).toFixed(2)
			}, fg vs surface ${
				Math.abs(apcaRaw(solution.foreground.rgb, solution.surface.rgb)).toFixed(2)
			}, floor ${textFloor().toFixed(3)}`,
		)
		console.log(`energy: ${JSON.stringify(solution.energy.terms)}`)
		console.log(`fitness scales: ${JSON.stringify(scales)}`)

		// `groundCoincidence` multiplies BOTH the foreground and the accent fitness, so if it is ~0
		// everywhere, both role-fitness terms are constant and neither role is scored on its own
		// evidence. Measure it directly rather than inferring it from a column of zeros.
		const fieldForCoincidence: FieldPath = solution.field.stops.map((stop) => stop.triple.lab)
		const coincidences = stats.map((one) => groundCoincidence(one, fieldForCoincidence))
		const distances = stats.map((one) => {
			let best = Number.POSITIVE_INFINITY
			for (const point of fieldForCoincidence) best = Math.min(best, okLabDistance(one.habitualGround, point))
			return best
		})
		const sortedDistances = [...distances].sort((a, b) => a - b)
		const bar = sameColorBar(
			colorFromRgb(solution.background.rgb),
			colorFromRgb(solution.background.rgb),
		)
		console.log(
			`groundCoincidence over all ${stats.length} triples: max ${
				Math.max(...coincidences).toExponential(2)
			}, > 1e-3 on ${coincidences.filter((value) => value > 1e-3).length}, > 0.5 on ${
				coincidences.filter((value) => value > 0.5).length
			}`,
		)
		console.log(
			`d(habitualGround, field) in OKLab: min ${sortedDistances[0].toFixed(4)}, median ${
				sortedDistances[Math.floor(sortedDistances.length / 2)].toFixed(4)
			}, max ${sortedDistances[sortedDistances.length - 1].toFixed(4)}; kernel scale (pooled bar) ${
				bar.toFixed(5)
			} ⇒ min distance is ${(sortedDistances[0] / bar).toFixed(1)} bars`,
		)
		{
			const backgroundIndex = lattice.triples.findIndex(
				(triple) => rgbToHex(triple.rgb) === rgbToHex(solution.background.rgb),
			)
			if (backgroundIndex >= 0) {
				const one = stats[backgroundIndex]
				console.log(
					`the background's own habitualGround ${
						one.habitualGround.map((value) => value.toFixed(4)).join(",")
					} vs its own colour ${
						lattice.triples[backgroundIndex].lab.map((value) => value.toFixed(4)).join(",")
					} — d ${distances[backgroundIndex].toFixed(4)}`,
				)
			}
		}

		// The winner's row, as this tool re-derives it, against the solver's own number.
		const foregroundRows = probeOne(solution, stats, lattice.triples, "foreground")
		const winner = foregroundRows.find(
			(row) => rgbToHex(row.rgb) === rgbToHex(solution.foreground.rgb),
		)
		if (winner !== undefined) {
			const solverValue = solution.energy.terms["unary.foreground"]
			console.log(
				`re-derivation check: unary.foreground solver ${solverValue?.toFixed(6)} vs table ${
					winner.unary.toFixed(6)
				} (Δ ${Math.abs((solverValue ?? NaN) - winner.unary).toExponential(2)}); rank ${
					foregroundRows.indexOf(winner) + 1
				} of ${foregroundRows.length} by unary`,
			)
		}

		if (!brief) {
			console.log(`\n### foreground survivors (top ${SURVIVORS} by unary cost)\n`)
			console.log(formatRows(foregroundRows, SURVIVORS))
		}

		// The readable ink the reviewer would have wanted: the cheapest candidate that actually clears
		// a comfortable contrast against the chosen background, and what it costs against the winner.
		const readable = foregroundRows.filter((row) => row.apcaAgainstBackground >= 45)
		if (readable.length > 0 && winner !== undefined) {
			const best = readable[0]
			console.log(
				`\ncheapest fg with |APCA| ≥ 45 vs bg: \`${rgbToHex(best.rgb)}\` unary ${
					f(best.unary)
				} (rank ${foregroundRows.indexOf(best) + 1}) — ${
					f(best.unary - winner.unary)
				} more than the winner; components Δ belonging ${
					f(best.belonging - winner.belonging)
				}, Δ roleMisfit ${f(best.roleMisfit - winner.roleMisfit)}, Δ repr ${
					f(best.representativeness - winner.representativeness)
				}`,
			)
		}

		const accentRows = probeOne(solution, stats, lattice.triples, "accent")
		if (!brief) {
			console.log(`\n### accent survivors (top ${SURVIVORS} by unary cost)\n`)
			console.log(formatRows(accentRows, SURVIVORS))
		}

		// --- CHECK 6: role-ordering fragility --------------------------------------------------------
		// Swap the foreground and the accent, everything else held fixed. The published *set* is
		// unchanged, so coverage, the field, the collapse charges and both field-role unaries are
		// identical between the two assignments and cancel: the whole energy gap is the difference of
		// the two roles' unary costs. No threshold is chosen here — the raw gap is reported.
		{
			const indexOf = (rgb: Rgb8): number =>
				lattice.triples.findIndex((triple) => rgbToHex(triple.rgb) === rgbToHex(rgb))
			const fgIndex = indexOf(solution.foreground.rgb)
			const acIndex = indexOf(solution.accent.rgb)
			if (fgIndex >= 0 && acIndex >= 0 && fgIndex !== acIndex) {
				const rates = DEFAULT_EXCHANGE_RATES
				const field: FieldPath = solution.field.stops.map((stop) => stop.triple.lab)
				const scalesLocal = computeFitnessScales(stats, rates)
				const unary = (index: number, role: "foreground" | "accent"): number => {
					const one = stats[index]
					const fitness = role === "foreground"
						? foregroundFitness(one, field, scalesLocal)
						: accentFitness(one, field, scalesLocal, rates)
					return rates.belonging * belongingCost(one) + (1 - fitness) +
						rates.representativeness * representativenessCost(one)
				}
				const asIs = unary(fgIndex, "foreground") + unary(acIndex, "accent")
				const swapped = unary(acIndex, "foreground") + unary(fgIndex, "accent")
				console.log(
					`\nCHECK6 swap-gap ${(swapped - asIs).toExponential(3)} (as-is ${asIs.toFixed(6)}, swapped ${
						swapped.toFixed(6)
					}); total energy ${solution.energy.total.toFixed(6)}; ratio ${
						((swapped - asIs) / Math.abs(solution.energy.total)).toExponential(3)
					}`,
				)
			} else {
				console.log(`\nCHECK6 swap-gap n/a (accent collapsed onto the foreground)`)
			}
		}

		// --- the two counterfactuals, so the report can say WHICH factor is responsible -------------
		// Neither is a change to the energy and neither may become one: they are the same term with one
		// factor replaced by its stated alternative, evaluated to attribute the failure. Moving a rate
		// on the strength of them is the documented relapse (`REVIEWER_EVIDENCE.md` header).
		if (!brief) {
			let maxInkPerMass = 0
			for (const one of stats) {
				const value = one.inkEnergy / Math.max(one.presence, 1e-30)
				if (value > maxInkPerMass) maxInkPerMass = value
			}
			const clamp = (value: number): number => value <= 0 ? 0 : value >= 1 ? 1 : value
			const variants: readonly [string, (index: number) => number][] = [
				["as implemented", (index) =>
					clamp(stats[index].inkEnergy / scales.maxInkEnergy) * coincidences[index]],
				["coincidence forced to 1", (index) => clamp(stats[index].inkEnergy / scales.maxInkEnergy)],
				["ink per unit mass, coincidence as measured", (index) =>
					clamp((stats[index].inkEnergy / Math.max(stats[index].presence, 1e-30)) / maxInkPerMass) *
					coincidences[index]],
				["ink per unit mass, coincidence forced to 1", (index) =>
					clamp((stats[index].inkEnergy / Math.max(stats[index].presence, 1e-30)) / maxInkPerMass)],
			]
			console.log(`\n### foreground counterfactuals — top 5 by unary cost under each fitness form\n`)
			console.log(`max inkEnergy ${e(scales.maxInkEnergy)} (integral), max ink/mass ${f(maxInkPerMass)}`)
			for (const [label, fitnessOf] of variants) {
				const ranked = stats
					.map((one, index) => ({
						index,
						unary: DEFAULT_EXCHANGE_RATES.belonging * belongingCost(one) +
							(1 - fitnessOf(index)) +
							DEFAULT_EXCHANGE_RATES.representativeness * representativenessCost(one),
					}))
					.sort((first, second) => first.unary - second.unary)
				const top = ranked.slice(0, 5)
				const readableRank = ranked.findIndex((entry) =>
					Math.abs(apcaRaw(lattice.triples[entry.index].rgb, solution.background.rgb)) >= 45
				)
				console.log(
					`- **${label}**: ${
						top.map((entry) =>
							`\`${rgbToHex(lattice.triples[entry.index].rgb)}\`(u ${f(entry.unary)}, |APCA| ${
								Math.abs(apcaRaw(lattice.triples[entry.index].rgb, solution.background.rgb)).toFixed(0)
							})`
						).join(" ")
					} — cheapest |APCA| ≥ 45 at rank ${readableRank < 0 ? "none" : readableRank + 1}${
						readableRank < 0 ? "" : ` (+${f(ranked[readableRank].unary - ranked[0].unary)} over the leader)`
					}`,
				)
			}
		}

		// Check 3's raw material: the artwork's most chromatic significant mark, against the accent.
		const chroma = (rgb: Rgb8): number => {
			const lab = rgbToOkLab(rgb)
			return Math.hypot(lab[1], lab[2])
		}
		const significant = lattice.triples
			.map((triple, index) => ({ triple, presence: stats[index].presence }))
			.filter((entry) => entry.presence >= 1e-3)
			.sort((first, second) => chroma(second.triple.rgb) - chroma(first.triple.rgb))
		if (significant.length > 0) {
			console.log(
				`\nmost chromatic significant mark (M ≥ 1e-3): \`${
					rgbToHex(significant[0].triple.rgb)
				}\` C=${chroma(significant[0].triple.rgb).toFixed(4)} M=${
					e(significant[0].presence)
				}; published accent \`${rgbToHex(solution.accent.rgb)}\` C=${
					chroma(solution.accent.rgb).toFixed(4)
				}`,
			)
		}

		// Field fitness, for the record: the term directive 8's fix moved.
		const fieldRows = lattice.triples
			.map((triple, index) => ({ rgb: triple.rgb, fitness: fieldFitness(stats[index]), stats: stats[index] }))
			.sort((first, second) => second.fitness - first.fitness)
		console.log(
			`\ntop field fitness: ${
				fieldRows.slice(0, 5).map((row) =>
					`${rgbToHex(row.rgb)}=${f(row.fitness)}(spread ${f(row.stats.spatialSpread)})`
				).join(" ")
			}`,
		)
	}
}

function textFloor(): number {
	const floors = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)
	return Math.max(floors.minTextContrast.effectiveRawMagnitude, EPSILON_TEXT_RAW)
}

/* ------------------------------------------------------------------------------------------- */
/* (b) one run                                                                                    */
/* ------------------------------------------------------------------------------------------- */

function quantile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return NaN
	const position = q * (sorted.length - 1)
	const low = Math.floor(position)
	const high = Math.ceil(position)
	if (low === high) return sorted[low]
	return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

/**
 * The foreground's minimum |APCA| over everything it is rendered on: both flat field roles, and the
 * whole rendered ramp when one is published. `REVIEWER_EVIDENCE.md` check 1's "min APCA over the
 * whole rendered ramp", read through the contract's own function so the margin is the barrier's.
 */
function foregroundMinApca(palette: Palette): number {
	const fg = palette.roles.foreground.rgb
	let worst = Math.min(
		Math.abs(apcaRaw(fg, palette.roles.background.rgb)),
		Math.abs(apcaRaw(fg, palette.roles.surface.rgb)),
	)
	if (palette.gradient !== null) {
		const extremum = minRawContrastOverRamp(
			palette.roles.foreground,
			palette.gradient.stops as readonly GradientStop[],
		)
		worst = Math.min(worst, Math.abs(extremum.rawMagnitude))
	}
	return worst
}

async function readRun(path: string): Promise<{
	header: RunHeader
	rows: RunRow[]
	footer: RunFooter | null
}> {
	const text = await readFile(resolve(path), "utf8")
	let header: RunHeader | null = null
	let footer: RunFooter | null = null
	const rows: RunRow[] = []
	for (const line of text.split("\n")) {
		if (line.trim().length === 0) continue
		const parsed = JSON.parse(line)
		if (parsed.kind === "devloop-run-header") header = parsed
		else if (parsed.kind === "devloop-run-row") rows.push(parsed)
		else if (parsed.kind === "devloop-run-footer") footer = parsed
	}
	if (header === null) throw new Error(`no header in ${path}`)
	return { header, rows, footer }
}

/**
 * The accent's minimum |APCA| against each field role separately, plus the ramp when one is
 * published — `REVIEWER_EVIDENCE.md` check 5. Kept separate rather than minimised together because
 * the question is which of the two fields the accent is failing on.
 */
function accentApca(palette: Palette): { background: number; surface: number; ramp: number | null } {
	const accent = palette.roles.accent.rgb
	return {
		background: Math.abs(apcaRaw(accent, palette.roles.background.rgb)),
		surface: Math.abs(apcaRaw(accent, palette.roles.surface.rgb)),
		ramp: palette.gradient === null ? null : Math.abs(
			minRawContrastOverRamp(
				palette.roles.accent,
				palette.gradient.stops as readonly GradientStop[],
			).rawMagnitude,
		),
	}
}

async function report(runPath: string): Promise<void> {
	const { header, rows, footer } = await readRun(runPath)
	const ok = rows.filter((row) => row.ok && row.palette !== null)
	const times = rows.map((row) => row.computeMs).sort((a, b) => a - b)
	const floor = textFloor()

	console.log(`run ${header.runId}`)
	console.log(`code ${header.codeVersion}, set ${header.setName} (${header.imageCount})`)
	console.log(
		`rows ${rows.length}, ok ${ok.length}, failed ${rows.length - ok.length}, wall ${
			footer?.wallMs ?? "?"
		} ms, workers ${header.workerCount}`,
	)
	console.log(
		`computeMs: min ${times[0]?.toFixed(0)}, median ${quantile(times, 0.5).toFixed(0)}, p95 ${
			quantile(times, 0.95).toFixed(0)
		}, max ${times[times.length - 1]?.toFixed(0)}`,
	)

	console.log(`\n| # | cover | bg | surface | fg | accent | field | collapses | escape | fg minAPCA | margin |`)
	console.log(`|---|---|---|---|---|---|---|---|---|---|---|`)
	const margins: number[] = []
	let subBarPairs = 0
	let gradients = 0
	let escapes = 0
	let passes = 0
	const failures: string[] = []
	for (const row of rows) {
		const palette = row.palette
		const name = row.imagePath.split("/").slice(-1)[0].slice(0, 12)
		if (palette === null || !row.ok) {
			console.log(`| ${row.index} | ${name} | — | — | — | — | — | — | — | — | FAILED: ${row.error} |`)
			continue
		}
		const minApca = foregroundMinApca(palette)
		margins.push(minApca - floor)
		if (palette.gradient !== null) gradients++
		if (palette.escape !== null) escapes++

		const published: [string, typeof palette.roles.background][] = [
			["background", palette.roles.background],
			["surface", palette.roles.surface],
			["foreground", palette.roles.foreground],
			["accent", palette.roles.accent],
		]
		for (let i = 0; i < published.length; i++) {
			for (let j = i + 1; j < published.length; j++) {
				const first = published[i][1]
				const second = published[j][1]
				if (first.hex === second.hex) continue // a declared collapse, not a twin
				const bar = sameColorBar(first, second)
				if (okLabDistance(rgbToOkLab(first.rgb), rgbToOkLab(second.rgb)) < bar) {
					subBarPairs++
					console.log(
						`  SUB-BAR: ${row.index} ${published[i][0]}/${published[j][0]} ${first.hex}/${second.hex} d=${
							okLabDistance(rgbToOkLab(first.rgb), rgbToOkLab(second.rgb)).toFixed(5)
						} bar=${bar.toFixed(5)}`,
					)
				}
			}
		}

		const { scorecard } = scorePalette(palette)
		if (scorecard.valid) passes++
		else failures.push(`${row.index} ${name}: ${scorecard.invariants.filter((i) => i.status === "fail").map((i) => i.codes.map((c) => c.code).join(",")).join(";")}`)

		console.log(
			`| ${row.index} | ${name} | ${palette.roles.background.hex} | ${palette.roles.surface.hex} | ${palette.roles.foreground.hex} | ${palette.roles.accent.hex} | ${
				palette.gradient === null ? "flat" : `gradient(${palette.gradient.stops.length})`
			} | ${palette.collapse.surfaceCollapsed ? "s" : "-"}${
				palette.collapse.accentCollapsed ? "a" : "-"
			} | ${palette.escape === null ? "-" : palette.escape.role} | ${minApca.toFixed(2)} | ${
				(minApca - floor).toFixed(2)
			} |`,
		)
	}

	// --- CHECK 5: the accent against BOTH fields, separately -------------------------------------
	const accentFloor = Math.max(
		resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS).minAccentContrast.effectiveRawMagnitude,
		EPSILON_ACCENT_RAW,
	)
	console.log(`\n| # | cover | accent | \\|APCA\\| vs bg | margin | \\|APCA\\| vs surface | margin | ramp |`)
	console.log(`|---|---|---|---|---|---|---|---|`)
	const accentBackgroundMargins: number[] = []
	const accentSurfaceMargins: number[] = []
	for (const row of rows) {
		if (row.palette === null || !row.ok) continue
		const values = accentApca(row.palette)
		accentBackgroundMargins.push(values.background - accentFloor)
		accentSurfaceMargins.push(values.surface - accentFloor)
		console.log(
			`| ${row.index} | ${row.imagePath.split("/").slice(-1)[0].slice(0, 12)} | ${row.palette.roles.accent.hex} | ${
				values.background.toFixed(2)
			} | ${(values.background - accentFloor).toFixed(2)} | ${values.surface.toFixed(2)} | ${
				(values.surface - accentFloor).toFixed(2)
			} | ${values.ramp === null ? "—" : values.ramp.toFixed(2)} |`,
		)
	}
	const describe = (label: string, values: readonly number[]): void => {
		const sorted = [...values].sort((a, b) => a - b)
		console.log(
			`${label}: min ${sorted[0]?.toFixed(2)}, p25 ${quantile(sorted, 0.25).toFixed(2)}, median ${
				quantile(sorted, 0.5).toFixed(2)
			}, p75 ${quantile(sorted, 0.75).toFixed(2)}, max ${sorted[sorted.length - 1]?.toFixed(2)}; ` +
				`< 5 on ${sorted.filter((value) => value < 5).length}/${sorted.length}`,
		)
	}
	console.log(`\naccent floor ${accentFloor.toFixed(3)} raw APCA`)
	describe("accent margin vs background", accentBackgroundMargins)
	describe("accent margin vs surface", accentSurfaceMargins)

	const sortedMargins = [...margins].sort((a, b) => a - b)
	console.log(
		`\nfg min-APCA margin above the floor (${floor.toFixed(3)}): min ${
			sortedMargins[0]?.toFixed(2)
		}, p25 ${quantile(sortedMargins, 0.25).toFixed(2)}, median ${
			quantile(sortedMargins, 0.5).toFixed(2)
		}, p75 ${quantile(sortedMargins, 0.75).toFixed(2)}, max ${
			sortedMargins[sortedMargins.length - 1]?.toFixed(2)
		}`,
	)
	const clustered = sortedMargins.filter((margin) => margin < 5).length
	console.log(`covers with margin < 5 raw APCA (floor-clustering): ${clustered}/${sortedMargins.length}`)
	console.log(`sub-bar published pairs: ${subBarPairs}`)
	console.log(`gradient-first: ${gradients}/${ok.length}; escapes fired: ${escapes}/${ok.length}`)
	console.log(`scorecard: valid ${passes}/${rows.length}; failures: ${failures.join(" | ") || "none"}`)
}

/* ------------------------------------------------------------------------------------------- */

const argv = process.argv.slice(2)
const runIndex = argv.indexOf("--run")
const probeIndex = argv.indexOf("--probe")
if (runIndex >= 0) await report(argv[runIndex + 1])
else if (probeIndex >= 0) {
	await probe(argv.slice(probeIndex + 1).filter((value) => value !== "--brief"), argv.includes("--brief"))
}
else {
	console.error("usage: first-palettes.ts (--probe <image…> | --run <run.jsonl>)")
	process.exit(2)
}
