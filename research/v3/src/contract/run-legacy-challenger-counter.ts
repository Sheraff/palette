/**
 * **Populate the challenger disagreement counter from the legacy verdict fixtures.**
 *
 * `[REPORT-ONLY — nothing here can change a verdict, a bar, or an invariant.]`
 *
 * `PHASE_1_HANDOFF.md` §5(b) parks the counter's first review behind "once a real corpus run has
 * populated that file". The file was empty — and not because the pair invariants had never run, but
 * because **nothing had ever called the ledger**: `accumulate`/`saveLedger` had no caller outside
 * `tests/contract-challengers.test.ts`, and `validatePalette` without an observation sink does not
 * even compute a challenger verdict (`invariants.ts` — `observe?.({…})` short-circuits its
 * arguments). This module is the missing caller.
 *
 * It runs over the 554 v2-3 palettes distilled into `data/legacy/`, de-duplicated on
 * `roleSignature`. The pre-registration that governs every number it produces —
 * unit of count, denominator, thresholds, verdict rule, and the scope limits — is
 * `reviews/challenger-counter/PRE_REGISTRATION.md`, committed before this file ran.
 *
 * ## What it is not
 *
 * A **legacy-fixture run, not a v3-pipeline run.** The fixtures carry a gradient *boolean*, never a
 * v3 stop list, so the only pairs judged here are the six role pairs; a v3 palette publishes 2–4
 * stops and its stop pairs are exactly where near-identity lives. And both challenger bars were
 * measured in `dark-neutral` alone and applied globally, so a disagreement elsewhere is two rules
 * differing, not the frozen bar being wrong. See the pre-registration §5.
 *
 * ## Why it writes a side file as well as the ledger
 *
 * `ChallengerTally` splits *disagreements* by region and carries no `judgedByRegion`, so a per-region
 * **rate** is not computable from the ledger alone. The judged-pair counts by region are recorded
 * into `reviews/challenger-counter/run-summary.json` from the same observation stream. The ledger
 * itself stores exactly what the contract's own `tallyChallengers` produces and nothing invented.
 *
 * Run:
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *   research/v3/src/contract/run-legacy-challenger-counter.ts
 * ```
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { colorFromHex } from "./color.ts"
import { CONTRACT_VERSION } from "./constants.ts"
import { tallyChallengers, type ChallengerComparison, type ChallengerId } from "./challengers.ts"
import {
	accumulate,
	emptyLedger,
	saveLedger,
	type ChallengerLedgerFile,
} from "./challenger-ledger.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
	validatePalette,
	type InvariantObservation,
} from "./invariants.ts"
import type { ColorRegion, Palette, PaletteColor } from "./types.ts"
import { clusterBootstrapCI, wilsonInterval } from "../stats/index.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const V3 = join(HERE, "..", "..")

/** Pinned so the ledger is byte-reproducible: a clock in the artifact makes a diff meaningless. */
const OBSERVED_AT = "2026-08-04T00:00:00.000Z"
const RUN_SOURCE =
	"legacy-fixture run 2026-08-04 (data/legacy/, v2-3 distilled palettes) — NOT a v3-pipeline run; " +
	"see research/v3/reviews/challenger-counter/PRE_REGISTRATION.md"

const BOOTSTRAP_RESAMPLES = 10_000
const BOOTSTRAP_SEED = 20260804

const REGIONS: readonly ColorRegion[] = [
	"dark-neutral",
	"dark-saturated",
	"light-neutral",
	"light-saturated",
]

const CHALLENGER_IDS: readonly ChallengerId[] = ["direction-aware-oklab", "ictcp-global"]

type LegacyRole = { hex: string; rgb: readonly number[] }

type LegacyEntry = {
	entryId: string
	roleSignature: string
	artwork: {
		imagePath: string
		contentSha256: string
		rendition: { format: string; width: number; height: number }
	}
	palette: {
		completeness: string
		roles: Partial<Record<"background" | "surface" | "foreground" | "accent", LegacyRole>>
		processedSize: { width: number; height: number } | null
	}
}

type LegacyFile = { entries: LegacyEntry[] }

const TIERS = ["endorsements", "acceptable", "known-bad"] as const
type Tier = (typeof TIERS)[number]

const ROLES = ["background", "surface", "foreground", "accent"] as const

/**
 * Rebuild a v3 `Palette` from a legacy fixture entry.
 *
 * Only two strings are supplied by this run rather than by the fixture — `algorithmVersion` and
 * `preprocessingVersion` — and no pair invariant reads either. Everything a pair invariant touches
 * (the role colours, the collapse flags) comes from the fixture or from exact hex equality.
 *
 * `gradient: null` because the fixtures carry a boolean and no stop colours; the collapse flags are
 * derived from exact hex equality, which is what invariant 1 requires of them and what makes the
 * sanctioned-collapse exemption apply exactly where it genuinely applies.
 */
function rebuild(entry: LegacyEntry): Palette {
	const roles = {} as Record<(typeof ROLES)[number], PaletteColor>
	for (const role of ROLES) {
		const value = entry.palette.roles[role]
		if (value !== undefined) roles[role] = colorFromHex(value.hex)
	}
	const size = entry.palette.processedSize ?? {
		width: entry.artwork.rendition.width,
		height: entry.artwork.rendition.height,
	}
	return {
		contractVersion: CONTRACT_VERSION,
		roles,
		gradient: null,
		collapse: {
			surfaceCollapsed: roles.surface !== undefined && roles.surface.hex === roles.background?.hex,
			accentCollapsed: roles.accent !== undefined && roles.accent.hex === roles.foreground?.hex,
		},
		escape: null,
		contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: "v2-3",
			preprocessingVersion: "v2-3/native-resolution",
			inputContentHash: entry.artwork.contentSha256,
			sourceRendition: {
				path: entry.artwork.imagePath,
				format: entry.artwork.rendition.format,
				width: entry.artwork.rendition.width,
				height: entry.artwork.rendition.height,
			},
			processedSize: size,
		},
	} as Palette
}

type PaletteRun = {
	subject: string
	roleSignature: string
	tiers: Tier[]
	entryIds: string[]
	roleCount: number
	comparisons: ChallengerComparison[]
}

async function main(): Promise<void> {
	// --- population -----------------------------------------------------------------------------
	const bySignature = new Map<string, { entry: LegacyEntry; tiers: Set<Tier>; ids: Set<string> }>()
	let entriesRead = 0
	const perTier: Record<string, number> = {}
	for (const tier of TIERS) {
		const file = JSON.parse(
			await readFile(join(V3, "data", "legacy", `${tier}.json`), "utf8"),
		) as LegacyFile
		perTier[tier] = file.entries.length
		for (const entry of file.entries) {
			entriesRead += 1
			const existing = bySignature.get(entry.roleSignature)
			if (existing === undefined) {
				bySignature.set(entry.roleSignature, {
					entry,
					tiers: new Set([tier]),
					ids: new Set([entry.entryId]),
				})
			} else {
				existing.tiers.add(tier)
				existing.ids.add(entry.entryId)
			}
		}
	}

	// --- the run --------------------------------------------------------------------------------
	const runs: PaletteRun[] = []
	for (const [signature, record] of [...bySignature].sort((a, b) => a[0].localeCompare(b[0]))) {
		const palette = rebuild(record.entry)
		const comparisons: ChallengerComparison[] = []
		const observe = (observation: InvariantObservation): void => {
			if (observation.challengers !== undefined) comparisons.push(observation.challengers)
		}
		validatePalette(palette, { observe })
		runs.push({
			subject: `legacy:${signature}`,
			roleSignature: signature,
			tiers: [...record.tiers].sort(),
			entryIds: [...record.ids].sort(),
			roleCount: ROLES.filter((role) => record.entry.palette.roles[role] !== undefined).length,
			comparisons,
		})
	}

	// --- the ledger -----------------------------------------------------------------------------
	let ledger: ChallengerLedgerFile = emptyLedger()
	for (const run of runs) {
		ledger = accumulate(ledger, {
			subject: run.subject,
			observedAt: OBSERVED_AT,
			source: RUN_SOURCE,
			tallies: tallyChallengers(run.comparisons),
		})
	}
	await saveLedger(join(V3, "data", "contract", "challenger-disagreements.json"), ledger)

	// --- analysis -------------------------------------------------------------------------------
	const analysis = CHALLENGER_IDS.map((id) => {
		// Per-palette outcome vectors: one 0/1 per judged pair. These are the bootstrap's clusters.
		const clusters: { subject: string; outcomes: number[]; regions: ColorRegion[] }[] = runs.map(
			(run) => {
				const outcomes: number[] = []
				const regions: ColorRegion[] = []
				for (const comparison of run.comparisons) {
					const verdict = comparison.verdicts.find((v) => v.challenger === id)
					if (verdict === undefined) continue
					outcomes.push(verdict.agrees ? 0 : 1)
					regions.push(comparison.region)
				}
				return { subject: run.subject, outcomes, regions }
			},
		)
		const scoring = clusters.filter((c) => c.outcomes.length > 0)

		const judged = scoring.reduce((n, c) => n + c.outcomes.length, 0)
		const disagreed = scoring.reduce((n, c) => n + c.outcomes.reduce((s, o) => s + o, 0), 0)

		const judgedByRegion = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<ColorRegion, number>
		const disagreedByRegion = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<ColorRegion, number>
		for (const cluster of scoring) {
			cluster.outcomes.forEach((outcome, index) => {
				judgedByRegion[cluster.regions[index]] += 1
				if (outcome === 1) disagreedByRegion[cluster.regions[index]] += 1
			})
		}

		const directional = { challengerSaysSame: 0, incumbentSaysSame: 0 }
		for (const run of runs) {
			for (const comparison of run.comparisons) {
				const verdict = comparison.verdicts.find((v) => v.challenger === id)
				if (verdict === undefined || verdict.agrees) continue
				if (verdict.saysSame) directional.challengerSaysSame += 1
				else directional.incumbentSaysSame += 1
			}
		}

		const rate = judged === 0 ? null : disagreed / judged
		const wilson = wilsonInterval(disagreed, judged)
		const bootstrap = clusterBootstrapCI<number>({
			clusters: scoring.map((c) => c.outcomes),
			statistic: (sample) =>
				sample.length === 0 ? null : sample.reduce((s, o) => s + o, 0) / sample.length,
			resamples: BOOTSTRAP_RESAMPLES,
			seed: BOOTSTRAP_SEED,
			clusterBy: "palette",
		})

		// C-region: the largest disagreement share, and that region's share of the exposure.
		const regionRows = REGIONS.map((region) => ({
			region,
			judged: judgedByRegion[region],
			disagreed: disagreedByRegion[region],
			rate: judgedByRegion[region] === 0 ? null : disagreedByRegion[region] / judgedByRegion[region],
			disagreementShare: disagreed === 0 ? null : disagreedByRegion[region] / disagreed,
			judgedShare: judged === 0 ? null : judgedByRegion[region] / judged,
			// Per-region interval, because `dark-neutral` is the only region either challenger bar was
			// ever measured in and its exposure here is what decides how much this run can say about it.
			interval: wilsonInterval(disagreedByRegion[region], judgedByRegion[region]),
		}))
		const top = [...regionRows].sort((a, b) => b.disagreed - a.disagreed)[0]
		const cRegion = disagreed > 0 &&
			(top.disagreementShare ?? 0) >= 0.6 &&
			(top.judgedShare ?? 1) < 0.4

		// C-palette: the top decile of scoring palettes by disagreement count.
		const perPalette = scoring
			.map((c) => ({ subject: c.subject, judged: c.outcomes.length, disagreed: c.outcomes.reduce((s, o) => s + o, 0) }))
			.sort((a, b) => b.disagreed - a.disagreed || a.subject.localeCompare(b.subject))
		const decileSize = Math.ceil(0.1 * perPalette.length)
		const decileDisagreements = perPalette.slice(0, decileSize).reduce((n, p) => n + p.disagreed, 0)
		const decileShare = disagreed === 0 ? null : decileDisagreements / disagreed
		const cPalette = disagreed > 0 && (decileShare ?? 0) >= 0.5

		const high = rate !== null && rate >= 0.1 && bootstrap.ok && bootstrap.low >= 0.05
		const concentrated = cRegion || cPalette

		return {
			challenger: id,
			judged,
			disagreed,
			rate,
			directional,
			wilson,
			bootstrap,
			regions: regionRows,
			palettesScoring: perPalette.length,
			palettesWithAnyDisagreement: perPalette.filter((p) => p.disagreed > 0).length,
			topPalettes: perPalette.slice(0, 10),
			decile: { size: decileSize, disagreements: decileDisagreements, share: decileShare },
			rule: {
				H1_rateAtLeast0_10: rate !== null && rate >= 0.1,
				H2_bootstrapLowAtLeast0_05: bootstrap.ok && bootstrap.low >= 0.05,
				HIGH: high,
				C_region: cRegion,
				C_palette: cPalette,
				CONCENTRATED: concentrated,
				VERDICT: high && concentrated ? "propose the deferred round" : "keep the round deferred",
			},
		}
	})

	// --- descriptive: where the judged pairs actually sit relative to the bar ----------------------
	// Not part of the pre-registered rule and it changes nothing about it. It exists because a rate of
	// zero has two completely different readings — "the rules agree where it matters" and "nothing in
	// this population ever came near a bar" — and only this block tells them apart.
	const judgedPairs = runs.flatMap((run) =>
		run.comparisons.map((c) => ({
			subject: run.subject,
			distance: c.incumbentDistance,
			bar: c.incumbentBar,
			ratio: c.incumbentDistance / c.incumbentBar,
			region: c.region,
			directionAware: c.verdicts.find((v) => v.challenger === "direction-aware-oklab")?.measured ?? null,
			ictcp: c.verdicts.find((v) => v.challenger === "ictcp-global")?.measured ?? null,
		}))
	)
	const sortedRatios = judgedPairs.map((p) => p.ratio).sort((a, b) => a - b)
	const quantile = (p: number): number | null =>
		sortedRatios.length === 0 ? null : sortedRatios[Math.floor(p * (sortedRatios.length - 1))]
	const distanceStructure = {
		judgedPairs: judgedPairs.length,
		distanceOverBarQuantiles: {
			min: quantile(0),
			p01: quantile(0.01),
			p05: quantile(0.05),
			p25: quantile(0.25),
			median: quantile(0.5),
		},
		judgedPairsWithinMultipleOfBar: {
			"<1x (would be a violation)": judgedPairs.filter((p) => p.ratio < 1).length,
			"<2x": judgedPairs.filter((p) => p.ratio < 2).length,
			"<3x": judgedPairs.filter((p) => p.ratio < 3).length,
			"<5x": judgedPairs.filter((p) => p.ratio < 5).length,
		},
		closestJudgedPairs: [...judgedPairs].sort((a, b) => a.ratio - b.ratio).slice(0, 10),
	}

	// --- positive control -------------------------------------------------------------------------
	// A zero disagreement count has one reading that must be excluded before any other is offered:
	// the instrument silently counting nothing. So the identical code path is run over the palette
	// `tests/contract-challengers.test.ts` constructs to make the challengers disagree — two
	// dark-neutral greys the frozen bar calls distinct and the direction-aware bar calls one colour.
	// It is NOT written to the ledger; it is not a legacy palette and would corrupt the population.
	const controlComparisons: ChallengerComparison[] = []
	validatePalette(
		rebuild({
			entryId: "control",
			roleSignature: "control",
			artwork: {
				imagePath: "<positive control — no file>",
				contentSha256: "0".repeat(64),
				rendition: { format: "none", width: 1, height: 1 },
			},
			palette: {
				completeness: "full",
				roles: {
					background: { hex: "#202020", rgb: [32, 32, 32] },
					surface: { hex: "#232323", rgb: [35, 35, 35] },
					foreground: { hex: "#f2f5f7", rgb: [242, 245, 247] },
					accent: { hex: "#e0533a", rgb: [224, 83, 58] },
				},
				processedSize: null,
			},
		}),
		{ observe: (o) => { if (o.challengers !== undefined) controlComparisons.push(o.challengers) } },
	)
	const controlTallies = tallyChallengers(controlComparisons)
	const positiveControl = {
		what:
			"The palette tests/contract-challengers.test.ts uses to prove the counter counts " +
			"(#202020 / #232323 field roles). Run through the identical code path; NOT in the ledger. " +
			"Non-zero disagreements here are what rule out 'the instrument counted nothing'.",
		tallies: controlTallies.map((t) => ({
			challenger: t.challenger,
			judged: t.judged,
			disagreed: t.disagreed,
			disagreedByRegion: t.disagreedByRegion,
		})),
	}

	const summary = {
		what:
			"First run of the challenger disagreement counter, over the v2-3 palettes distilled into " +
			"data/legacy/. Report-only: nothing here moved a bar, a threshold, or a verdict. Governed " +
			"by reviews/challenger-counter/PRE_REGISTRATION.md, committed before this ran.",
		scope:
			"LEGACY-FIXTURE RUN, NOT A V3-PIPELINE RUN. The fixtures publish no v3 gradient stops, so " +
			"only role pairs are judged. Both challenger bars were measured in dark-neutral alone and " +
			"are applied globally: a disagreement outside dark-neutral is a difference between two " +
			"rules, not evidence that the frozen bar is wrong there.",
		observedAt: OBSERVED_AT,
		population: {
			entriesRead,
			perTier,
			distinctRoleSignatures: bySignature.size,
			palettesRun: runs.length,
			palettesByRoleCount: runs.reduce<Record<number, number>>((map, run) => {
				map[run.roleCount] = (map[run.roleCount] ?? 0) + 1
				return map
			}, {}),
			palettesJudgingZeroPairs: runs.filter((r) => r.comparisons.length === 0).length,
			judgedPairsTotal: runs.reduce((n, r) => n + r.comparisons.length, 0),
			pairsExemptBySanctionedCollapse: runs.reduce(
				(n, r) => n + Math.max(0, (r.roleCount * (r.roleCount - 1)) / 2 - r.comparisons.length),
				0,
			),
			imagesDecoded: 0,
		},
		positiveControl,
		distanceStructure,
		challengers: analysis,
	}

	await writeFile(
		join(V3, "reviews", "challenger-counter", "run-summary.json"),
		`${JSON.stringify(summary, null, "\t")}\n`,
		"utf8",
	)

	for (const row of analysis) {
		console.log(
			`${row.challenger}: ${row.disagreed}/${row.judged} = ${
				row.rate === null ? "—" : (row.rate * 100).toFixed(2) + "%"
			}  HIGH=${row.rule.HIGH} CONCENTRATED=${row.rule.CONCENTRATED} -> ${row.rule.VERDICT}`,
		)
	}
}

await main()
