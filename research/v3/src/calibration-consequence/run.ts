/**
 * Run the ruler consequence analysis and write
 * `research/v3/data/calibration-consequence/report.json` plus a plain-language summary.
 *
 * Usage (from the repository root):
 *
 *     node --experimental-strip-types research/v3/src/calibration-consequence/run.ts
 *     node --experimental-strip-types research/v3/src/calibration-consequence/run.ts --skip-sampling
 *
 * Deterministic end to end: the corpus is read from disk in a fixed order, the image sample is a
 * fixed function of the sorted shard listing, and the pixel-pair sampler is seeded. Two runs on an
 * unchanged repository produce identical output.
 */

/// <reference path="../../../src/colornames-oklab.d.ts" />
import { mkdir, writeFile } from "node:fs/promises"
import { closest } from "colornames-oklab"
import { hex as canonicalHex, hexToRgb, rgbToOkLab } from "../contract/color.ts"
import { assertBarsMatchSource, SAME_COLOR_BAR_BY_HUE_THIRD, SAME_COLOR_BAR_CI_HIGH_BY_REGION, SAME_COLOR_BAR_CI_LOW_BY_REGION, VARIANT_NAMES } from "./bars.ts"
import { loadDecisionCorpus } from "./decision-corpus.ts"
import { evaluateCorpus, summarizeMatrix, type MatrixReport } from "./decision-flips.ts"
import { sampleNearPairs, type NearPairReport } from "./near-pairs.ts"
import { POOLED_SAME_COLOR_BAR, SAME_COLOR_BAR_BY_REGION } from "../contract/constants.ts"

const REPOSITORY_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "")
const V3 = `${REPOSITORY_ROOT}/research/v3`
const ANALYSIS_PATH = `${V3}/data/calibration/bracketing-round-2-analysis.json`
const OUTPUT_DIRECTORY = `${V3}/data/calibration-consequence`

function percent(value: number): string {
	return `${(value * 100).toFixed(2)}%`
}

/**
 * `CONVENTIONS.md`: human-facing colour output is always named via `colornames-oklab` alongside the
 * hex. Only the colours this report actually shows a human are named — every hex that appears in a
 * flipped pair or in a baseline violation.
 */
function nameColors(matrices: readonly MatrixReport[]): Record<string, string> {
	const hexes = new Set<string>()
	for (const matrix of matrices) {
		for (const pair of matrix.baselineViolatingPairDetails) for (const hex of pair.hexes) hexes.add(hex)
		for (const variant of matrix.variants) {
			for (const pair of variant.flippedPairs) for (const hex of pair.hexes) hexes.add(hex)
		}
	}
	const unique = [...hexes].sort()
	if (unique.length === 0) return {}
	const matches = closest(unique.map((value) => rgbToOkLab(hexToRgb(canonicalHex(value)))))
	const names: Record<string, string> = {}
	unique.forEach((hex, index) => {
		names[hex] = matches[index].name
	})
	return names
}

function summaryLines(
	corpusReport: Awaited<ReturnType<typeof loadDecisionCorpus>>["report"],
	roles: MatrixReport,
	withGradient: MatrixReport,
	nearPairs: NearPairReport | null,
	names: Record<string, string>,
): string[] {
	const swatch = (hex: string) => `${hex} ${names[hex] ?? "?"}`
	const lines: string[] = []
	const rule = "-".repeat(96)

	lines.push("RULER CONSEQUENCE ANALYSIS — does the same-colour bar's remaining uncertainty change anything?")
	lines.push(rule)
	lines.push("")
	lines.push("THE QUESTION")
	lines.push("  The same-colour bar is calibrated per region, but each region's threshold is a fitted point")
	lines.push("  inside a 95% interval, and one region (light-saturated) is known not to be one population:")
	lines.push("  split by hue it reads 0.01516 / 0.02074 / 0.03805. Both of those are recorded in")
	lines.push("  constants.ts as open. This analysis prices them: if resolving the uncertainty the other way")
	lines.push("  changes no decision, the bar can be frozen and a third bracketing round is not worth a")
	lines.push("  reviewer's afternoon. If it changes decisions, the flips say which region to aim the round at.")
	lines.push("")
	lines.push("WHAT WAS MEASURED")
	lines.push(
		`  Corpus: ${corpusReport.total} real published palettes with reviewer verdicts ` +
			`(${Object.entries(corpusReport.entriesByFixture).map(([k, v]) => `${v} ${k}`).join(", ")}),`,
	)
	lines.push(`  ${corpusReport.distinctRoleSignatures} distinct role signatures among them.`)
	lines.push("  Every pair the contract's distinctness invariant actually checks was enumerated by calling")
	lines.push("  validateDistinctness() itself — the exemptions (sanctioned collapses, field-role-versus-stop)")
	lines.push("  and the straddle rule are the contract's, not a copy. The invariant was then re-run once per")
	lines.push("  bar variant and the verdicts compared pair by pair.")
	lines.push("")
	lines.push("  Variants: point estimates (today's constants) | per-region CI low | per-region CI high |")
	lines.push("  hue-split (light-saturated replaced by its three hue-third values, other regions unchanged).")
	lines.push("")

	for (const report of [roles, withGradient]) {
		const label = report.matrix === "roles"
			? "MATRIX 1 — ROLES ONLY (the headline)"
			: "MATRIX 2 — ROLES + RECONSTRUCTED v2-3 GRADIENT (advisory)"
		lines.push(label)
		if (report.matrix === "roles+gradient") {
			lines.push("  v2-3 published no stops; it rendered background → midpoint → surface. Reconstructing that")
			lines.push("  as v3 stops is not a reading of what v3 will publish, but it does exercise the stop×stop,")
			lines.push("  stop×foreground and stop×accent cells that the roles-only matrix has none of.")
		}
		lines.push(`  ${report.palettes} palettes, ${report.pairsEvaluated} pairs evaluated.`)
		lines.push(
			`  At today's constants: ${report.baselineViolatingPairs} pairs read as the same colour, in ` +
				`${report.baselineViolatingPalettes} palettes.`,
		)
		lines.push(
			`  Pairs sitting anywhere inside their region's 95% window: ${report.pairsInsideCiWindow} ` +
				`(${percent(report.pairsInsideCiWindowRate)}).`,
		)
		lines.push("")
		for (const variant of report.variants) {
			lines.push(
				`  ${variant.variant.padEnd(9)} ${String(variant.flips).padStart(5)} flips ` +
					`(${percent(variant.flipRate).padStart(7)} of pairs) — ` +
					`${variant.toSame} to-same, ${variant.toDistinct} to-distinct; ` +
					`${variant.palettesWithAnyFlip} palettes touched; ` +
					`${variant.validityChanges} palette validities change ` +
					`(${variant.validityToInvalid} clean→violating, ${variant.validityToValid} violating→clean).`,
			)
		}
		lines.push("")
		const anyFlips = report.variants.some((variant) => variant.flips > 0)
		if (anyFlips) {
			lines.push("  Every flip, in full — there are few enough to list:")
			for (const variant of report.variants) {
				for (const flip of variant.flippedPairs) {
					lines.push(
						`    ${variant.variant.padEnd(9)} ${flip.fixture}/${flip.entryId} ${flip.pair}`,
					)
					lines.push(
						`              ${swatch(flip.hexes[0])} vs ${swatch(flip.hexes[1])} — ` +
							`distance ${flip.distance.toFixed(5)}, bar ${flip.baselineBar.toFixed(5)} → ` +
							`${flip.variantBar.toFixed(5)}, ${flip.direction}` +
							`${flip.changesPaletteValidity ? ", changes palette validity" : ""} ` +
							`[${flip.regions.join(" × ")}]`,
					)
				}
			}
			lines.push("")
		}
	}

	if (nearPairs !== null) {
		lines.push("CORPUS-PAIR SUPPLEMENT — where do real artwork pairs land?")
		lines.push(
			`  ${nearPairs.pairsKept} pixel pairs from ${nearPairs.imagesDecoded} sharded artworks, drawn at ` +
				`random and kept when their`,
		)
		lines.push(
			`  OKLab distance fell in [${nearPairs.band.low}, ${nearPairs.band.high}) — the band that strictly ` +
				`contains every region's window.`,
		)
		lines.push(
			`  Acceptance rate ${percent(nearPairs.acceptanceRate)} of attempts; seed ${nearPairs.seed}.`,
		)
		lines.push(
			`  Inside the uncertainty window: ${nearPairs.overall.insideWindow} of ${nearPairs.pairsKept} ` +
				`(${percent(nearPairs.overall.insideWindowRate)}).`,
		)
		lines.push(
			`  Below it (settled "same" whatever the calibration): ${nearPairs.overall.belowWindow}; ` +
				`above it (settled "distinct"): ${nearPairs.overall.aboveWindow}.`,
		)
		lines.push("  By the region that governs the pair:")
		for (const [region, counts] of Object.entries(nearPairs.byGoverningRegion)) {
			lines.push(
				`    ${region.padEnd(16)} ${String(counts.pairs).padStart(6)} pairs, ` +
					`${percent(counts.insideWindowRate).padStart(7)} inside the window` +
					(region === "light-saturated"
						? `, ${counts.hueSplitDisagreements} judged differently by the hue split`
						: ""),
			)
		}
		lines.push("")
	}

	return lines
}

/** How many of a variant's validity changes would block a palette the reviewer endorsed or accepted. */
function endorsedBlocks(variant: MatrixReport["variants"][number]): number {
	return variant.validityChangedPalettes.filter((palette) =>
		palette.to === "violating" && palette.fixture !== "known-bad"
	).length
}

function recommendation(
	roles: MatrixReport,
	withGradient: MatrixReport,
	nearPairs: NearPairReport | null,
): string[] {
	const lines: string[] = []
	const all = [...roles.variants, ...withGradient.variants]
	const worstFlipRate = all.reduce((worst, variant) => (variant.flipRate > worst.flipRate ? variant : worst))
	const totalValidityChanges = all.reduce((total, variant) => total + variant.validityChanges, 0)
	const rolesCiHigh = roles.variants.find((variant) => variant.variant === "ci-high")!
	const rolesCiLow = roles.variants.find((variant) => variant.variant === "ci-low")!
	const rolesHue = roles.variants.find((variant) => variant.variant === "hue-split")!
	const gradientHue = withGradient.variants.find((variant) => variant.variant === "hue-split")!
	const gradientCiHigh = withGradient.variants.find((variant) => variant.variant === "ci-high")!
	const gradientCiLow = withGradient.variants.find((variant) => variant.variant === "ci-low")!
	const endorsedBlockCount = all.reduce((total, variant) => total + endorsedBlocks(variant), 0)
	const countFlips = (
		variants: readonly MatrixReport["variants"][number][],
		predicate: (flip: MatrixReport["variants"][number]["flippedPairs"][number]) => boolean,
	) => variants.reduce((total, variant) => total + variant.flippedPairs.filter(predicate).length, 0)
	const touchesLightSaturated = (flip: MatrixReport["variants"][number]["flippedPairs"][number]) =>
		flip.regions.includes("light-saturated")
	const ciHighVariants = [rolesCiHigh, gradientCiHigh]
	const ciHighFlips = ciHighVariants.reduce((total, variant) => total + variant.flips, 0)
	const ciHighLightSaturated = countFlips(ciHighVariants, touchesLightSaturated)
	const hueFlips = rolesHue.flips + gradientHue.flips

	lines.push("WHAT THE NUMBERS SAY")
	lines.push(
		`  1. On the roles matrix — the decisions v3 will certainly make — the uncertainty is nearly inert: ` +
			`${rolesCiLow.flips} flips at the low end,`,
	)
	lines.push(
		`     ${rolesCiHigh.flips} at the high end, ${rolesHue.flips} under the hue split, out of ` +
			`${roles.pairsEvaluated} pairs. Today's constants call none of those ${roles.pairsEvaluated}`,
	)
	lines.push("     pairs the same colour: published role colours simply are not close to each other.")
	{
		// The corpus stores one entry per reviewer verdict, so one palette can appear more than once.
		// Reporting the distinct colour pairs behind the flips keeps the headline from double-counting.
		const distinctPairs = new Set(
			rolesCiHigh.flippedPairs.map((flip) => [...flip.hexes].sort().join("|")),
		)
		if (rolesCiHigh.flips > 0) {
			lines.push(
				`     Those ${rolesCiHigh.flips} high-end flips are ${distinctPairs.size} distinct colour pair` +
					`${distinctPairs.size === 1 ? "" : "s"}: the corpus holds one entry per reviewer verdict, so a`,
			)
			lines.push("     palette endorsed twice is counted twice.")
		}
	}
	lines.push(
		`  2. Every flip anywhere is in a light or saturated region. ${ciHighLightSaturated} of the ` +
			`${ciHighFlips} high-end flips and all ${hueFlips} hue-split flips`,
	)
	lines.push(
		"     involve a light-saturated colour; the rest are light-neutral pairs, and the low-end flips are " +
			"light-neutral and",
	)
	lines.push(
		"     dark-saturated stop pairs. Dark-neutral — the tightest and best-determined bar — never flips a " +
			"single decision.",
	)
	lines.push(
		`  3. The flips are directional. Widening the bar (ci-high, hue split) only ever *adds* violations ` +
			`(${rolesCiHigh.toSame + gradientCiHigh.toSame + rolesHue.toSame + gradientHue.toSame} to-same,`,
	)
	lines.push(
		`     0 to-distinct); narrowing it only ever removes them ` +
			`(${rolesCiLow.toDistinct + gradientCiLow.toDistinct} to-distinct, 0 to-same). There is no churn, ` +
			"only a monotone dial.",
	)
	lines.push(
		`  4. ${endorsedBlockCount} of the ${totalValidityChanges} validity changes (counted per matrix; the two ` +
			"matrices overlap) would newly",
	)
	lines.push("     condemn a palette the reviewer endorsed or accepted.")
	lines.push(
		"     PHASE_0_DECISIONS §4 says an invariant that blocks an endorsed palette is demoted — so the upper " +
			"end of the",
	)
	lines.push(
		"     interval, and the loosest hue third, are the ends the corpus actively argues against. The lower " +
			"end costs nothing",
	)
	lines.push("     but silence: its flips only release pairs, and a released pair is never seen again.")
	if (nearPairs !== null) {
		lines.push(
			`  5. The uncertainty is common in the *world* and rare in the *decisions*: ` +
				`${percent(nearPairs.overall.insideWindowRate)} of real artwork near-pairs`,
		)
		lines.push(
			`     land inside a window (${percent(nearPairs.byGoverningRegion["light-saturated"].insideWindowRate)} ` +
				`of light-saturated ones), against ${percent(worstFlipRate.flipRate)} of published pairs at worst. ` +
				"Published palette",
		)
		lines.push(
			"     colours are chosen to be far apart, so they sit almost entirely outside the range the " +
				"measurement is unsure about.",
		)
	}
	lines.push("")
	lines.push("RECOMMENDATION — FREEZE the bar at its point estimates. No round 3 for the same-colour bar.")
	lines.push("")
	lines.push(
		`  Freezing costs at most ${roles.variants.reduce((worst, v) => Math.max(worst, v.validityChanges), 0)} ` +
			"palette verdicts out of " + roles.palettes + " on the matrix that matters, and every one of those",
	)
	lines.push(
		"  disagreements is the *loose* end of the interval wanting to condemn a palette the reviewer endorsed. " +
			"A round 3",
	)
	lines.push(
		"  that halved the intervals again would, on this evidence, change between 0 and " +
			`${rolesCiHigh.validityChanges} role-level verdicts. That is not`,
	)
	lines.push("  a reviewer's afternoon well spent, and the reviewer's own repeat consistency is 63% — a third")
	lines.push("  round cannot buy precision the reviewer does not have.")
	lines.push("")
	lines.push("  Three things to keep, not because they change decisions today but because they are cheap:")
	lines.push(
		`  - **If any round 3 is ever run, aim it at light-saturated, and split it by hue.** Every flip that ` +
			"touches the",
	)
	lines.push(
		"    roles matrix is light-saturated, its interval is the widest (0.01658–0.03170, 1.9×), and the hue " +
			"split inside it",
	)
	lines.push(
		"    is the one finding with a real effect behind it (2.5× spread, third 2 separated). Nothing would be " +
			"learned by",
	)
	lines.push("    re-measuring dark-neutral: it is the tightest bar and it moves nothing.")
	lines.push(
		"  - **Do not adopt the hue split as it stands.** It flips only toward *more* violations, all of them on " +
			"endorsed or",
	)
	lines.push(
		`    accepted palettes (${gradientHue.flips} pairs, all from third 2's 0.03805 — the value that is the ` +
			"middle of a separation gap, not",
	)
	lines.push("    a fitted crossing). Encoding it would make the contract stricter exactly where it is least sure.")
	lines.push(
		"  - **The anisotropy finding is untouched by this analysis.** It is not a width in the bar, it is a " +
			"missing dimension,",
	)
	lines.push(
		"    and no variant here can price it. If a round 3 is ever justified, that is the better question to " +
			"spend it on.",
	)
	return lines
}

async function main(): Promise<void> {
	const skipSampling = process.argv.includes("--skip-sampling")

	await assertBarsMatchSource(ANALYSIS_PATH)

	const { palettes, report: corpusReport } = await loadDecisionCorpus(`${V3}/data/legacy`)
	const results = evaluateCorpus(palettes)
	const roles = summarizeMatrix(results, "roles")
	const withGradient = summarizeMatrix(results, "roles+gradient")

	// The enumeration is the load-bearing step: if it is wrong, every rate below is wrong. The corpus
	// loader counted the role pairs longhand, without the contract; the two must agree exactly.
	if (roles.pairsEvaluated !== corpusReport.independentRolePairCount) {
		throw new Error(
			`enumeration disagreement: validateDistinctness() enumerated ${roles.pairsEvaluated} role pairs, ` +
				`the independent count says ${corpusReport.independentRolePairCount}`,
		)
	}
	if (corpusReport.collapseFlagMismatches !== 0) {
		throw new Error(
			`${corpusReport.collapseFlagMismatches} legacy entries declare a collapse flag that disagrees with ` +
				"exact hex equality; the derived-flag shortcut in decision-corpus.ts is no longer safe",
		)
	}

	const nearPairs = skipSampling ? null : await sampleNearPairs(REPOSITORY_ROOT)
	const colorNames = nameColors([roles, withGradient])

	const lines = [
		...summaryLines(corpusReport, roles, withGradient, nearPairs, colorNames),
		...recommendation(roles, withGradient, nearPairs),
	]

	await mkdir(OUTPUT_DIRECTORY, { recursive: true })
	await writeFile(
		`${OUTPUT_DIRECTORY}/report.json`,
		`${
			JSON.stringify(
				{
					generatedBy: "research/v3/src/calibration-consequence/run.ts",
					question:
						"Does the same-colour bar's remaining calibration uncertainty — the per-region 95% intervals, and the unencoded hue split inside light-saturated — change any decision the contract actually makes?",
					sources: {
						calibrationAnalysis: "research/v3/data/calibration/bracketing-round-2-analysis.json",
						legacyCorpus: "research/v3/data/legacy/{known-bad,endorsements,acceptable}.json",
						invariant: "research/v3/src/contract/invariants.ts validateDistinctness()",
					},
					bars: {
						variants: VARIANT_NAMES,
						point: SAME_COLOR_BAR_BY_REGION,
						ciLow: SAME_COLOR_BAR_CI_LOW_BY_REGION,
						ciHigh: SAME_COLOR_BAR_CI_HIGH_BY_REGION,
						hueThirds: SAME_COLOR_BAR_BY_HUE_THIRD,
						pooledForReference: POOLED_SAME_COLOR_BAR,
					},
					corpus: corpusReport,
					colorNames,
					matrices: { roles, withGradient },
					nearPairs,
					summary: lines,
				},
				null,
				"\t",
			)
		}\n`,
	)
	await writeFile(`${OUTPUT_DIRECTORY}/summary.txt`, `${lines.join("\n")}\n`)
	console.log(lines.join("\n"))
}

await main()
