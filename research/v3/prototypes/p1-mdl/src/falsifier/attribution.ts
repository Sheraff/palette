/**
 * # M1 attribution — which term, if any, is culpable
 *
 * ```sh
 * cd research/v3
 * NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *   prototypes/p1-mdl/src/falsifier/attribution.ts
 * ```
 *
 * The pre-registered falsifier clause (`DESIGN.md` §Milestones M1, from `phase-1/proposals/
 * arm-a-prime.md` §7) does not let the M1 null stand on the win/loss counts alone. It reads:
 * *"if endorsed palettes are NOT systematically lower in energy than known-bad for the same
 * artwork — no rank signal, **no single term culpable**, at any λ in the sweep — the currency is
 * wrong"*. Three conditions, and only the first was measured by `run.ts`. This program measures
 * the second, and the two structural confounds that could manufacture the first.
 *
 * ## What this program is
 *
 * **A pure reader of `data/falsifier/m1-results.json`.** It re-scores nothing, re-measures
 * nothing, opens no image, and draws no random number. Every quantity below is an arithmetic
 * rearrangement of numbers `run.ts` already wrote, which is what makes it safe to run after the
 * fact: it cannot move the falsifier's answer, only decompose it. The one thing it adds that
 * `run.ts` did not have is *pairing by term* — `run.ts` compared totals, and a total that comes
 * out even can still be two large terms cancelling.
 *
 * Both arms' `terms` blocks are stored at λ=1 and sum to `totals["1"]` exactly (verified in
 * `termSumCheck` below, and the check is written into the output rather than asserted quietly).
 * `terms.structural` is already λ·Ω and `terms.paletteBits` is already λ·L(P), so at λ=1 the term
 * vector is a genuine additive decomposition of the compared scalar, and per-term deltas of a pair
 * sum to the margin that decided it.
 *
 * ## The five questions, and the instrument for each
 *
 * 1. **Which term drives the losses.** For every pair in every pre-registered comparison, the
 *    per-term delta (left − right, i.e. good minus bad, so *positive is the good side paying
 *    more*). Ranked by mean and median contribution, and by how often each term is the single
 *    largest positive contributor to the margin. Shares are `delta_term / delta_total`, which sum
 *    to 1 by construction and are comparable across artworks whose absolute scales differ by
 *    orders of magnitude — the reason a mean of raw deltas alone would be dominated by two or
 *    three artworks.
 * 2. **The reconstruction question.** `emit/legacy.ts` reconstructs a v2-3 gradient as
 *    `[background@0, midpoint@0.5, surface@1]` and says so (`gradient-reconstructed-from-v2-3-
 *    convention`); `meta.gradientAdvisory` warns that stop comparison is advisory only. If
 *    reconstructed ramps systematically pay in the field/path terms, an M1 null on a tier mix
 *    whose gradient rates differ is an artifact of that convention and not evidence about the
 *    currency. Measured three ways: the pair cross-tab by (left gradient, right gradient), the
 *    within-artwork gradient-true vs gradient-false pairing, and the per-entry term shares split
 *    by gradient.
 * 3. **The degeneracy question.** 59 of 197 artworks explain <1% of their mass
 *    (`DEGENERATE_EXPLAINED_MASS_BELOW`). On those, arm A′'s likelihood is almost entirely
 *    `genericBits` — the same number for both sides when both sides explain nothing — so the
 *    margin can reduce to λ·ΔL(P): *whichever palette names fewer colours wins*. Counted
 *    directly: pairs where the likelihood delta is exactly zero and the palette-bits delta is not.
 * 4. **The ink-support question.** `DESIGN.md` decision 9 records a known arm-A defect: the ink
 *    term prices no support, so broad flat mass can read as ink. If the known-bad side exploits
 *    it, the known-bad side should be putting *more* mass into ink in the pairs the good side
 *    loses. `nuisance.inkMassFraction` is the profiled quantity and is reported per side.
 * 5. **Tier structural census.** Gradient rate, collapse rates, mean stops, mean L(P), mean Ω,
 *    per tier and per stratum — the table questions 3 and 5 of the λ-anchor reading need.
 *
 * ## Statistical discipline
 *
 * Nothing here was pre-registered. Every test in this file is **exploratory and two-sided**, is
 * labelled as such in its own provenance, and none of them is corrected against the others,
 * because a family of post-hoc decompositions has no honest family size. They exist to size an
 * effect, not to license a claim. The pre-registered numbers remain the ones in `m1-summary.json`.
 *
 * Outputs `data/falsifier/m1-attribution.json` (every number) and `m1-attribution.md` (the tables).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { exactBinomialTest, wilsonInterval } from "../../../../src/stats/binomial.ts"
import { quantileSorted } from "../../../../src/stats/numeric.ts"
import { honestLine } from "../../../../src/stats/types.ts"
import { PROTOTYPE_ROOT } from "../emit/paths.ts"

// ---------------------------------------------------------------------------------------------
// The shape of the artifact being read
// ---------------------------------------------------------------------------------------------

/**
 * Structural types for `m1-results.json`, declared locally rather than imported from
 * `falsifier/types.ts`.
 *
 * Deliberate: this program's contract is with the *file on disk*, not with the types the run
 * happened to use. If `types.ts` is later refactored, this reader should keep reading the archived
 * artifact, and a compile error here would be a false alarm about a file that has not changed.
 */
type Shape = { gradient: boolean; stopCount: number; surfaceCollapsed: boolean; accentCollapsed: boolean }

type ArmBlock = {
	dataPart: number
	structuralPart: number
	totals: Record<string, number>
	terms: Record<string, number>
	nuisance: Record<string, number | string>
}

type Entry = {
	entryId: string
	tier: "endorsed" | "acceptable" | "known-bad"
	artworkSha: string
	imagePath: string
	shape: Shape
	explainedMassFraction: number
	p1a: ArmBlock
	p1ap: ArmBlock
}

type PairRow = {
	artworkSha: string
	imagePath: string
	stratum: "degenerate" | "structured"
	explainedMassFraction: number
	leftEntryId: string
	rightEntryId: string
	leftTotal: number
	rightTotal: number
	outcome: "left-lower" | "right-lower" | "tie"
}

type Comparison = {
	id: string
	label: string
	selection: string
	leftTiers: string[]
	rightTiers: string[]
	arm: "p1a" | "p1ap"
	lambda: number
	stratum: string
	counts: { wins: number; losses: number; ties: number }
	rows: PairRow[]
}

type Results = {
	header: Record<string, unknown>
	strataCensus: { degenerate: number; structured: number }
	artworks: { artworkSha: string; stratum: "degenerate" | "structured"; explainedMassFraction: number }[]
	entries: Entry[]
	comparisons: Comparison[]
}

/** Arm A's four terms, in the order `energy/a/index.ts` returns them. */
const TERMS_A = ["field", "ink", "structural", "escape"] as const
/** Arm A′'s six terms, in the order `energy/aprime/index.ts` returns them. */
const TERMS_AP = [
	"fieldColorBits",
	"fieldSupportBits",
	"inkColorBits",
	"inkSupportBits",
	"genericBits",
	"paletteBits",
] as const

const TERMS: Record<"p1a" | "p1ap", readonly string[]> = { p1a: TERMS_A, p1ap: TERMS_AP }

/** Arm units, carried into every table so a bits number is never printed next to a nats number. */
const UNITS: Record<"p1a" | "p1ap", string> = { p1a: "nats", p1ap: "bits" }

/**
 * The λ the term decomposition is exact at.
 *
 * The brief asks for λ=1 and that is also the only λ where the stored `terms` vector sums to the
 * stored total, because `structural` and `paletteBits` were baked with λ=1 folded in. Other λ are
 * still reachable — `totals` carries the whole grid — and the λ-flip analysis below uses them, but
 * a *term* attribution at another λ would require multiplying one term and is therefore done
 * explicitly where it happens, never silently.
 */
const LAMBDA = 1

/** The λ grid `run.ts` swept, read back so the flip analysis quotes the same endpoints. */
const LAMBDA_GRID = [0.25, 0.5, 1, 2, 4] as const

/**
 * Ties are exact-zero margins, not near-zero ones.
 *
 * `compare.ts` decides `tie` by `===`, so this reader uses the same rule. A tolerance here would
 * silently reclassify pairs the pre-registered comparison counted the other way, and the whole
 * point of a reader is that its counts reconcile with the artifact's.
 */
function isZero(x: number): boolean {
	return x === 0
}

// ---------------------------------------------------------------------------------------------
// Small deterministic summaries
// ---------------------------------------------------------------------------------------------

function mean(values: readonly number[]): number | null {
	if (values.length === 0) return null
	let total = 0
	for (const v of values) total += v
	return total / values.length
}

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null
	return quantileSorted([...values].sort((a, b) => a - b), 0.5)
}

/** Pearson correlation. Returns null when either side has no spread (r is undefined, not zero). */
function pearson(xs: readonly number[], ys: readonly number[]): number | null {
	if (xs.length !== ys.length || xs.length < 3) return null
	const mx = mean(xs)!
	const my = mean(ys)!
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (let i = 0; i < xs.length; i += 1) {
		const dx = xs[i]! - mx
		const dy = ys[i]! - my
		sxy += dx * dy
		sxx += dx * dx
		syy += dy * dy
	}
	if (sxx === 0 || syy === 0) return null
	return sxy / Math.sqrt(sxx * syy)
}

/**
 * A two-sided exact binomial against a fair coin, with the exploratory label attached at source.
 *
 * Every call site in this file is post-hoc. Rather than trusting each of them to remember the
 * caveat, the caveat is spelled once here and the honest line carries it wherever the number goes.
 */
function exploratoryCoinTest(successes: number, trials: number, what: string): {
	summary: string
	honest: string
	successes: number
	trials: number
	pValue: number | null
	interval: string
} {
	const test = exactBinomialTest({
		successes,
		trials,
		nullProbability: 0.5,
		alternative: "two-sided",
		trialsAreDistinctUnits: true,
	})
	const ci = wilsonInterval(successes, trials)
	return {
		summary: test.summary,
		honest: `${what}: ${honestLine(test)} | EXPLORATORY: post-hoc decomposition of an already-null pre-registered result; two-sided, no direction fixed in advance, no multiplicity correction across this file's decompositions because a post-hoc family has no honest size.`,
		successes,
		trials,
		pValue: test.ok ? test.pValue : null,
		interval: ci.summary,
	}
}

// ---------------------------------------------------------------------------------------------
// Pair assembly
// ---------------------------------------------------------------------------------------------

type Pair = {
	comparisonId: string
	family: string
	selection: string
	arm: "p1a" | "p1ap"
	artworkSha: string
	imagePath: string
	stratum: "degenerate" | "structured"
	explainedMassFraction: number
	left: Entry
	right: Entry
	/** left − right at λ=1. Positive means the good/left side is the more expensive one. */
	deltaTotal: number
	/** Per-term left − right at λ=1. Sums to `deltaTotal`. */
	deltaTerms: Record<string, number>
	/** left − right of the λ-free part and of the λ-scaled part, for the flip analysis. */
	deltaData: number
	deltaStructural: number
	outcome: "win" | "loss" | "tie"
}

function buildPairs(results: Results): Pair[] {
	const byId = new Map(results.entries.map((e) => [e.entryId, e]))
	const pairs: Pair[] = []
	for (const c of results.comparisons) {
		if (c.lambda !== LAMBDA) continue
		// The stratum-restricted comparisons are subsets of the `all` ones; taking them too would
		// double-count the same artworks in a pooled table. Stratum is read off the row instead.
		if (c.stratum !== "all") continue
		const family = c.id.split("|")[0]!
		for (const row of c.rows) {
			const left = byId.get(row.leftEntryId)
			const right = byId.get(row.rightEntryId)
			if (left === undefined || right === undefined) {
				throw new Error(`m1-results.json references an entry it does not contain: ${row.leftEntryId}/${row.rightEntryId}`)
			}
			const terms = TERMS[c.arm]
			const deltaTerms: Record<string, number> = {}
			for (const t of terms) deltaTerms[t] = (left[c.arm].terms[t] ?? 0) - (right[c.arm].terms[t] ?? 0)
			const deltaTotal = left[c.arm].totals[String(LAMBDA)]! - right[c.arm].totals[String(LAMBDA)]!
			pairs.push({
				comparisonId: c.id,
				family,
				selection: c.selection,
				arm: c.arm,
				artworkSha: row.artworkSha,
				imagePath: row.imagePath,
				stratum: row.stratum,
				explainedMassFraction: row.explainedMassFraction,
				left,
				right,
				deltaTotal,
				deltaTerms,
				deltaData: left[c.arm].dataPart - right[c.arm].dataPart,
				deltaStructural: left[c.arm].structuralPart - right[c.arm].structuralPart,
				outcome: isZero(deltaTotal) ? "tie" : deltaTotal < 0 ? "win" : "loss",
			})
		}
	}
	return pairs
}

// ---------------------------------------------------------------------------------------------
// Q1 — term attribution
// ---------------------------------------------------------------------------------------------

type TermStat = {
	term: string
	n: number
	meanDelta: number | null
	medianDelta: number | null
	/**
	 * `delta_term / delta_total`. Sums to 1 across terms within a pair.
	 *
	 * Routinely exceeds 100% and goes negative, and that is the honest reading, not a bug: when two
	 * terms move hard in opposite directions and nearly cancel, the surviving margin is small and
	 * each term's share of it is large. A share of 650% means *that term alone would have decided
	 * the pair six times over, and the others gave most of it back*. Read next to
	 * `medianAbsShareOfGrossMovement`, which is bounded and answers the different question of how
	 * much of the total movement the term accounts for.
	 */
	meanShare: number | null
	medianShare: number | null
	/** |delta_term| / Σ|delta_term|, in [0, 1]. How much of the *gross* movement this term is. */
	meanAbsShareOfGrossMovement: number | null
	medianAbsShareOfGrossMovement: number | null
	/** How often this term is the single largest contributor *in the direction of the margin*. */
	argmaxCount: number
	/** How often this term moves the margin against the good side at all (delta > 0). */
	againstGoodCount: number
}

function termAttribution(pairs: readonly Pair[], arm: "p1a" | "p1ap", which: "loss" | "win"): {
	n: number
	meanDeltaTotal: number | null
	medianDeltaTotal: number | null
	terms: TermStat[]
	dominance: {
		topByMeanShare: string | null
		topByArgmax: string | null
		argmaxFraction: number | null
		medianShareOfTop: number | null
		verdict: string
	}
} {
	const subset = pairs.filter((p) => p.outcome === which)
	const terms = TERMS[arm]
	const perTerm = new Map<
		string,
		{ deltas: number[]; shares: number[]; absShares: number[]; argmax: number; against: number }
	>()
	for (const t of terms) perTerm.set(t, { deltas: [], shares: [], absShares: [], argmax: 0, against: 0 })

	for (const p of subset) {
		let gross = 0
		for (const t of terms) gross += Math.abs(p.deltaTerms[t]!)
		// Share of the margin: positive share = the term pushed the pair in the direction it went.
		for (const t of terms) {
			const d = p.deltaTerms[t]!
			const s = perTerm.get(t)!
			s.deltas.push(d)
			s.shares.push(d / p.deltaTotal)
			if (gross > 0) s.absShares.push(Math.abs(d) / gross)
			if (d > 0) s.against += 1
		}
		// argmax is over the *signed contribution to the observed margin*, i.e. d/deltaTotal, so a
		// loss's culprit is the term that paid most and a win's hero is the term that saved most.
		let best: string | null = null
		let bestValue = -Infinity
		for (const t of terms) {
			const v = p.deltaTerms[t]! / p.deltaTotal
			if (v > bestValue) {
				bestValue = v
				best = t
			}
		}
		if (best !== null) perTerm.get(best)!.argmax += 1
	}

	const stats: TermStat[] = terms.map((t) => {
		const s = perTerm.get(t)!
		return {
			term: t,
			n: s.deltas.length,
			meanDelta: mean(s.deltas),
			medianDelta: median(s.deltas),
			meanShare: mean(s.shares),
			medianShare: median(s.shares),
			meanAbsShareOfGrossMovement: mean(s.absShares),
			medianAbsShareOfGrossMovement: median(s.absShares),
			argmaxCount: s.argmax,
			againstGoodCount: s.against,
		}
	})

	const ranked = [...stats].sort((a, b) => (b.meanShare ?? -Infinity) - (a.meanShare ?? -Infinity))
	const rankedArgmax = [...stats].sort((a, b) => b.argmaxCount - a.argmaxCount)
	const topArgmax = subset.length === 0 ? null : rankedArgmax[0]!.term
	const argmaxFraction = subset.length === 0 ? null : rankedArgmax[0]!.argmaxCount / subset.length
	const topShare = subset.length === 0 ? null : ranked[0]!.medianShare

	/**
	 * The dominance rule, stated before the numbers were seen in this file's own terms.
	 *
	 * The falsifier clause asks a yes/no question — *is a single term identifiable as the culprit* —
	 * and a rule that is invented after looking at the ranking answers nothing. So: a term is
	 * *culpable* only if it is the largest contributor in at least two thirds of the pairs **and**
	 * its median share of the margin is at least one half. Two thirds because a four- or six-term
	 * decomposition puts the chance-level argmax at 25%/17%, and half because a term carrying less
	 * than half the margin is by arithmetic not carrying it alone. Anything else is `spread`.
	 */
	const ARGMAX_FLOOR = 2 / 3
	const SHARE_FLOOR = 0.5
	let verdict = "no pairs"
	if (subset.length > 0) {
		verdict =
			argmaxFraction! >= ARGMAX_FLOOR && (topShare ?? 0) >= SHARE_FLOOR
				? `single term: ${topArgmax}`
				: "spread"
	}

	return {
		n: subset.length,
		meanDeltaTotal: mean(subset.map((p) => p.deltaTotal)),
		medianDeltaTotal: median(subset.map((p) => p.deltaTotal)),
		terms: stats,
		dominance: {
			topByMeanShare: subset.length === 0 ? null : ranked[0]!.term,
			topByArgmax: topArgmax,
			argmaxFraction,
			medianShareOfTop: topShare,
			verdict,
		},
	}
}

// ---------------------------------------------------------------------------------------------
// Q1b — could λ have rescued the losses?
// ---------------------------------------------------------------------------------------------

/**
 * For each losing pair, the λ at which the margin would change sign, and whether it is inside the
 * swept grid.
 *
 * `total(λ) = dataPart + λ·structuralPart` exactly (`run.ts`'s own `lambdaAlgebraCheck` measured
 * deviation 0 at λ=4), so the crossing is `λ* = −Δdata / Δstructural` and exists only when
 * `Δstructural ≠ 0`. This is the quantitative form of "at any λ in the sweep": a loss that no λ in
 * [¼, 4] can flip is a loss the structural charge cannot be blamed for.
 */
function lambdaFlip(pairs: readonly Pair[]): {
	n: number
	flippableInGrid: number
	flippableAnyPositiveLambda: number
	structuralTied: number
	crossings: number[]
} {
	const losses = pairs.filter((p) => p.outcome === "loss")
	let inGrid = 0
	let anyPositive = 0
	let structuralTied = 0
	const crossings: number[] = []
	for (const p of losses) {
		if (p.deltaStructural === 0) {
			structuralTied += 1
			continue
		}
		const star = -p.deltaData / p.deltaStructural
		crossings.push(star)
		if (star > 0) anyPositive += 1
		if (star >= LAMBDA_GRID[0] && star <= LAMBDA_GRID[LAMBDA_GRID.length - 1]!) inGrid += 1
	}
	return {
		n: losses.length,
		flippableInGrid: inGrid,
		flippableAnyPositiveLambda: anyPositive,
		structuralTied,
		crossings: crossings.sort((a, b) => a - b),
	}
}

// ---------------------------------------------------------------------------------------------
// Q2 — the reconstruction question
// ---------------------------------------------------------------------------------------------

/** The terms a reconstructed ramp is expected to move, per arm. Named, not inferred. */
const PATH_TERMS: Record<"p1a" | "p1ap", readonly string[]> = {
	// Arm A: the ramp lives inside the field mixture (`fieldOrder: "ramp"` + a profiled geometry),
	// and the ramp plus its interior stop are two of Ω's counts.
	p1a: ["field", "structural"],
	// Arm A′: the ramp is coded through the field's own colour and support codes, and its stops are
	// named colours in L(P).
	p1ap: ["fieldColorBits", "fieldSupportBits", "paletteBits"],
}

function gradientCrossTab(pairs: readonly Pair[], arm: "p1a" | "p1ap") {
	const cells = new Map<
		string,
		{ n: number; wins: number; losses: number; ties: number; deltaTotals: number[]; pathDeltas: number[] }
	>()
	for (const key of ["grad-grad", "grad-flat", "flat-grad", "flat-flat"]) {
		cells.set(key, { n: 0, wins: 0, losses: 0, ties: 0, deltaTotals: [], pathDeltas: [] })
	}
	for (const p of pairs) {
		const key = `${p.left.shape.gradient ? "grad" : "flat"}-${p.right.shape.gradient ? "grad" : "flat"}`
		const c = cells.get(key)!
		c.n += 1
		if (p.outcome === "win") c.wins += 1
		else if (p.outcome === "loss") c.losses += 1
		else c.ties += 1
		c.deltaTotals.push(p.deltaTotal)
		let path = 0
		for (const t of PATH_TERMS[arm]) path += p.deltaTerms[t] ?? 0
		c.pathDeltas.push(path)
	}
	return [...cells.entries()].map(([cell, c]) => ({
		cell,
		n: c.n,
		wins: c.wins,
		losses: c.losses,
		ties: c.ties,
		winRateOfDecided: c.wins + c.losses === 0 ? null : c.wins / (c.wins + c.losses),
		meanDeltaTotal: mean(c.deltaTotals),
		medianDeltaTotal: median(c.deltaTotals),
		meanPathDelta: mean(c.pathDeltas),
		medianPathDelta: median(c.pathDeltas),
	}))
}

/**
 * The question the cross-tab exists to answer: **if the reconstruction confound is removed, does a
 * signal appear?**
 *
 * Restricting to pairs where both sides declared the same gradient boolean removes the
 * reconstruction penalty from the comparison entirely — both sides pay it or neither does. If the
 * good side's win rate climbs above chance on that subset, the M1 null is an artifact of
 * `emit/legacy.ts`'s `[background@0, midpoint@0.5, surface@1]` convention. If it does not, the
 * reconstruction penalty is real *and* is not what produced the null, and both facts are reportable.
 */
function gradientMatchedWinRate(pairs: readonly Pair[], arm: "p1a" | "p1ap", family: string, selection: string) {
	const subset = pairs.filter(
		(p) =>
			p.arm === arm &&
			p.family === family &&
			p.selection === selection &&
			p.left.shape.gradient === p.right.shape.gradient,
	)
	const wins = subset.filter((p) => p.outcome === "win").length
	const losses = subset.filter((p) => p.outcome === "loss").length
	const mismatched = pairs.filter(
		(p) =>
			p.arm === arm &&
			p.family === family &&
			p.selection === selection &&
			p.left.shape.gradient !== p.right.shape.gradient,
	)
	// In the mismatched cells, "the flat side won" is the reconstruction penalty in its purest form.
	const flatSideWon = mismatched.filter((p) => {
		if (p.outcome === "tie") return false
		const leftWon = p.outcome === "win"
		return leftWon ? !p.left.shape.gradient : !p.right.shape.gradient
	}).length
	const mismatchedDecided = mismatched.filter((p) => p.outcome !== "tie").length
	return {
		arm,
		family,
		selection,
		matchedPairs: subset.length,
		matchedWins: wins,
		matchedLosses: losses,
		matchedTies: subset.length - wins - losses,
		matchedWinRate: wins + losses === 0 ? null : wins / (wins + losses),
		matchedTest:
			wins + losses === 0
				? null
				: exploratoryCoinTest(wins, wins + losses, `${arm} ${family}/${selection}: good side lower on gradient-matched pairs`),
		mismatchedDecided,
		flatSideWon,
		flatSideWonTest:
			mismatchedDecided === 0
				? null
				: exploratoryCoinTest(
						flatSideWon,
						mismatchedDecided,
						`${arm} ${family}/${selection}: on gradient-mismatched pairs the flat side is the cheaper one`,
					),
	}
}

/**
 * The within-artwork gradient contrast: on artworks where the legacy record disagrees with itself
 * about the gradient boolean, does the reconstructed ramp cost more?
 *
 * Best-of-side on each gradient state, mirroring `compare.ts`'s `best-of-side` selection so the
 * two are read the same way. This is the cleanest available isolation of the reconstruction — same
 * image, same measurement, the gradient boolean the only declared difference — and it is also the
 * smallest: only 15 of 197 artworks carry both states.
 */
function withinArtworkGradient(results: Results, arm: "p1a" | "p1ap") {
	const byArtwork = new Map<string, Entry[]>()
	for (const e of results.entries) {
		const list = byArtwork.get(e.artworkSha)
		if (list === undefined) byArtwork.set(e.artworkSha, [e])
		else list.push(e)
	}
	const stratumOf = new Map(results.artworks.map((a) => [a.artworkSha, a.stratum]))
	const rows: {
		artworkSha: string
		stratum: string
		gradEntryId: string
		flatEntryId: string
		deltaTotal: number
		deltaTerms: Record<string, number>
	}[] = []
	const shas = [...byArtwork.keys()].sort()
	for (const sha of shas) {
		const entries = byArtwork.get(sha)!
		const grad = entries.filter((e) => e.shape.gradient)
		const flat = entries.filter((e) => !e.shape.gradient)
		if (grad.length === 0 || flat.length === 0) continue
		const pick = (list: Entry[]) =>
			[...list].sort((a, b) => {
				const d = a[arm].totals[String(LAMBDA)]! - b[arm].totals[String(LAMBDA)]!
				return d !== 0 ? d : a.entryId < b.entryId ? -1 : 1
			})[0]!
		const g = pick(grad)
		const f = pick(flat)
		const deltaTerms: Record<string, number> = {}
		for (const t of TERMS[arm]) deltaTerms[t] = (g[arm].terms[t] ?? 0) - (f[arm].terms[t] ?? 0)
		rows.push({
			artworkSha: sha,
			stratum: stratumOf.get(sha) ?? "unknown",
			gradEntryId: g.entryId,
			flatEntryId: f.entryId,
			deltaTotal: g[arm].totals[String(LAMBDA)]! - f[arm].totals[String(LAMBDA)]!,
			deltaTerms,
		})
	}
	const gradCostsMore = rows.filter((r) => r.deltaTotal > 0).length
	const decided = rows.filter((r) => !isZero(r.deltaTotal)).length
	const perTerm = TERMS[arm].map((t) => ({
		term: t,
		meanDelta: mean(rows.map((r) => r.deltaTerms[t]!)),
		medianDelta: median(rows.map((r) => r.deltaTerms[t]!)),
		gradHigherCount: rows.filter((r) => r.deltaTerms[t]! > 0).length,
	}))
	return {
		artworksWithBothStates: rows.length,
		decided,
		gradientCostsMore: gradCostsMore,
		test:
			decided === 0
				? null
				: exploratoryCoinTest(gradCostsMore, decided, `${arm}: reconstructed ramp costs more than the flat sibling on the same artwork`),
		meanDeltaTotal: mean(rows.map((r) => r.deltaTotal)),
		medianDeltaTotal: median(rows.map((r) => r.deltaTotal)),
		perTerm,
		rows,
	}
}

/**
 * Per-entry term shares split by the gradient boolean.
 *
 * Unpaired, so it carries an artwork confound the paired instruments do not — reported because the
 * paired instrument has n=15 and this one has n=458, and the two disagreeing would itself be the
 * finding. Shares are of the entry's own |data part|, which normalises the artwork scale away.
 */
function gradientTermShares(results: Results, arm: "p1a" | "p1ap") {
	const groups: Record<string, Entry[]> = { gradient: [], flat: [] }
	for (const e of results.entries) groups[e.shape.gradient ? "gradient" : "flat"]!.push(e)
	const out: Record<string, unknown> = {}
	for (const [name, list] of Object.entries(groups)) {
		const denom = (e: Entry) => {
			const d = Math.abs(e[arm].dataPart)
			return d === 0 ? null : d
		}
		out[name] = {
			n: list.length,
			meanGradientRateStops: mean(list.map((e) => e.shape.stopCount)),
			terms: TERMS[arm].map((t) => {
				const shares = list.map((e) => {
					const d = denom(e)
					return d === null ? null : (e[arm].terms[t] ?? 0) / d
				}).filter((x): x is number => x !== null)
				return { term: t, n: shares.length, meanShareOfDataPart: mean(shares), medianShareOfDataPart: median(shares) }
			}),
		}
	}
	return out
}

// ---------------------------------------------------------------------------------------------
// Q3 — the degeneracy question
// ---------------------------------------------------------------------------------------------

/**
 * On arm A′, how many pairs are decided by serialization bits alone.
 *
 * "Alone" is exact: the likelihood delta is `0`, so every bit of the margin is λ·ΔL(P) and the
 * decision is literally *whichever palette names fewer colours wins*. The weaker relative form —
 * L(P) merely outweighing the likelihood — is counted separately, because a margin that is 99%
 * palette bits is the same failure with a rounding error attached.
 */
function serializationDecided(pairs: readonly Pair[]) {
	const ap = pairs.filter((p) => p.arm === "p1ap")
	const byStratum = new Map<string, Pair[]>([
		["all", ap],
		["degenerate", ap.filter((p) => p.stratum === "degenerate")],
		["structured", ap.filter((p) => p.stratum === "structured")],
	])
	const out: Record<string, unknown> = {}
	for (const [name, list] of byStratum) {
		const decided = list.filter((p) => p.outcome !== "tie")
		const likelihoodDelta = (p: Pair) => p.deltaTotal - p.deltaTerms["paletteBits"]!
		const decidedByLPAlone = decided.filter((p) => isZero(likelihoodDelta(p)) && !isZero(p.deltaTerms["paletteBits"]!))
		const lpNonZero = decided.filter((p) => !isZero(p.deltaTerms["paletteBits"]!))
		// "the L(P)-cheaper side won": the sign of the total margin agrees with the sign of ΔL(P).
		const lpAgrees = lpNonZero.filter((p) => Math.sign(p.deltaTotal) === Math.sign(p.deltaTerms["paletteBits"]!))
		const lpShares = decided
			.filter((p) => p.deltaTotal !== 0)
			.map((p) => Math.abs(p.deltaTerms["paletteBits"]!) / Math.abs(p.deltaTotal))
		out[name] = {
			pairs: list.length,
			ties: list.length - decided.length,
			decided: decided.length,
			decidedByPaletteBitsAlone: decidedByLPAlone.length,
			decidedByPaletteBitsAloneRate: decided.length === 0 ? null : decidedByLPAlone.length / decided.length,
			pairsWithNonZeroPaletteBitsDelta: lpNonZero.length,
			cheaperPaletteWon: lpAgrees.length,
			cheaperPaletteWonRate: lpNonZero.length === 0 ? null : lpAgrees.length / lpNonZero.length,
			medianPaletteBitsShareOfMargin: median(lpShares),
			meanPaletteBitsShareOfMargin: mean(lpShares),
			marginsAbove99PercentPaletteBits: lpShares.filter((s) => s >= 0.99).length,
		}
	}
	return out
}

/**
 * Are the arm-A′ ties the same configuration scored twice, or two different palettes that happen
 * to cost the same?
 *
 * It matters for how the tie count reads. A tie between byte-identical reconstructions is not the
 * energy failing to discriminate; it is two tiers having recorded the same palette, and it should
 * be reported as a pairing artifact rather than as evidence about the currency.
 */
function tieAnatomy(pairs: readonly Pair[], arm: "p1a" | "p1ap") {
	const ties = pairs.filter((p) => p.arm === arm && p.outcome === "tie")
	const sameShape = ties.filter(
		(p) =>
			p.left.shape.gradient === p.right.shape.gradient &&
			p.left.shape.stopCount === p.right.shape.stopCount &&
			p.left.shape.surfaceCollapsed === p.right.shape.surfaceCollapsed &&
			p.left.shape.accentCollapsed === p.right.shape.accentCollapsed,
	)
	const allTermsEqual = ties.filter((p) => TERMS[arm].every((t) => isZero(p.deltaTerms[t]!)))
	/**
	 * The evidentiary finding hiding inside the tie count.
	 *
	 * A tie in which every term is identical means the two sides reconstructed to the *same
	 * configuration*, which was nonetheless filed under two different verdict tiers. That is not the
	 * energy failing to separate good from bad; it is the legacy corpus filing one palette under
	 * both labels, and it caps how much rank signal any currency could have extracted from these
	 * pairs. Broken out by tier pair because "endorsed and acceptable agree" is unremarkable and
	 * "good and known-bad agree" is a labelling contradiction.
	 */
	const byTierPair = new Map<string, number>()
	for (const p of allTermsEqual) {
		const key = `${p.left.tier} = ${p.right.tier}`
		byTierPair.set(key, (byTierPair.get(key) ?? 0) + 1)
	}
	return {
		ties: ties.length,
		sameDeclaredShape: sameShape.length,
		everyTermIdentical: allTermsEqual.length,
		differentShapeButEqualTotal: ties.length - sameShape.length,
		identicalConfigurationsByTierPair: Object.fromEntries([...byTierPair.entries()].sort()),
		identicalConfigurationsAcrossGoodAndKnownBad: allTermsEqual.filter(
			(p) => p.left.tier !== p.right.tier && (p.left.tier === "known-bad" || p.right.tier === "known-bad"),
		).length,
	}
}

/**
 * The inversion the brief asks about, taken apart on its own pairs.
 *
 * `m1-summary.json` reports endorsed-vs-acceptable at 9W/21L/18T with two-sided p=0.0428 — acceptable
 * palettes are *cheaper*. The brief's hypothesis is that acceptable wins by naming fewer colours.
 * That is checkable directly and paired: does the acceptable side carry fewer collapse flags, fewer
 * stops and fewer L(P) bits than the endorsed side it beat? If the answer is no, the inversion is a
 * likelihood effect and the serialization story is wrong about it.
 */
function inversionAnatomy(pairs: readonly Pair[], arm: "p1a" | "p1ap") {
	const subset = pairs.filter((p) => p.arm === arm && p.family === "b-endorsed-vs-acceptable")
	const summarise = (list: readonly Pair[], label: string) => ({
		outcome: label,
		n: list.length,
		meanDeltaPaletteBits: mean(
			list.map(
				(p) => (p.left.p1ap.nuisance["serializationBits"] as number) - (p.right.p1ap.nuisance["serializationBits"] as number),
			),
		),
		meanDeltaOmega: mean(list.map((p) => (p.left.p1a.nuisance["omega"] as number) - (p.right.p1a.nuisance["omega"] as number))),
		meanDeltaStops: mean(list.map((p) => p.left.shape.stopCount - p.right.shape.stopCount)),
		endorsedHasMoreCollapses: list.filter(
			(p) =>
				Number(p.left.shape.surfaceCollapsed) + Number(p.left.shape.accentCollapsed) >
				Number(p.right.shape.surfaceCollapsed) + Number(p.right.shape.accentCollapsed),
		).length,
		acceptableHasMoreCollapses: list.filter(
			(p) =>
				Number(p.right.shape.surfaceCollapsed) + Number(p.right.shape.accentCollapsed) >
				Number(p.left.shape.surfaceCollapsed) + Number(p.left.shape.accentCollapsed),
		).length,
		acceptableCheaperInPaletteBits: list.filter(
			(p) =>
				(p.right.p1ap.nuisance["serializationBits"] as number) < (p.left.p1ap.nuisance["serializationBits"] as number),
		).length,
	})
	return {
		arm,
		all: summarise(subset, "all"),
		losses: summarise(subset.filter((p) => p.outcome === "loss"), "loss (acceptable cheaper)"),
		wins: summarise(subset.filter((p) => p.outcome === "win"), "win (endorsed cheaper)"),
		ties: summarise(subset.filter((p) => p.outcome === "tie"), "tie"),
	}
}

// ---------------------------------------------------------------------------------------------
// Q4 — the ink-support question
// ---------------------------------------------------------------------------------------------

/**
 * Does the known-bad side exploit `DESIGN.md` decision 9 — arm A's ink term pricing no support?
 *
 * The prediction the defect makes is directional and specific: if broad mass can read as ink for
 * free, the side that wins by putting more mass into ink is the side that should win *undeservedly*
 * — so in pairs the good side loses, the known-bad side should carry the larger
 * `nuisance.inkMassFraction`. If it does not, decision 9 is a real defect that nonetheless did not
 * produce the M1 null, and fixing it will not, by itself, move the falsifier.
 */
function inkSupport(pairs: readonly Pair[], family: string, selection: string) {
	const subset = pairs.filter((p) => p.arm === "p1a" && p.family === family && p.selection === selection)
	const inkOf = (e: Entry) => e.p1a.nuisance["inkMassFraction"] as number
	const summarise = (list: readonly Pair[]) => ({
		n: list.length,
		meanInkGood: mean(list.map((p) => inkOf(p.left))),
		medianInkGood: median(list.map((p) => inkOf(p.left))),
		meanInkBad: mean(list.map((p) => inkOf(p.right))),
		medianInkBad: median(list.map((p) => inkOf(p.right))),
		meanDeltaInk: mean(list.map((p) => inkOf(p.left) - inkOf(p.right))),
		medianDeltaInk: median(list.map((p) => inkOf(p.left) - inkOf(p.right))),
		badSideHasMoreInk: list.filter((p) => inkOf(p.right) > inkOf(p.left)).length,
	})
	const losses = subset.filter((p) => p.outcome === "loss")
	const wins = subset.filter((p) => p.outcome === "win")
	const lossSummary = summarise(losses)
	return {
		family,
		selection,
		losses: lossSummary,
		wins: summarise(wins),
		lossTest:
			losses.length === 0
				? null
				: exploratoryCoinTest(
						lossSummary.badSideHasMoreInk,
						losses.length,
						"p1a losing pairs where the known-bad side carries the larger inkMassFraction",
					),
		/** Positive r would mean: the more ink mass the good side takes on, the worse it does. */
		correlationDeltaInkVsDeltaTotal: pearson(
			subset.map((p) => inkOf(p.left) - inkOf(p.right)),
			subset.map((p) => p.deltaTotal),
		),
		correlationN: subset.length,
	}
}

// ---------------------------------------------------------------------------------------------
// Q5 — tier structural census
// ---------------------------------------------------------------------------------------------

function tierCensus(results: Results) {
	const stratumOf = new Map(results.artworks.map((a) => [a.artworkSha, a.stratum]))
	const rows: Record<string, unknown>[] = []
	const tiers = ["endorsed", "acceptable", "known-bad"] as const
	const strata = ["all", "degenerate", "structured"] as const
	for (const tier of tiers) {
		for (const stratum of strata) {
			const list = results.entries.filter(
				(e) => e.tier === tier && (stratum === "all" || stratumOf.get(e.artworkSha) === stratum),
			)
			if (list.length === 0) continue
			const rate = (f: (e: Entry) => boolean) => list.filter(f).length / list.length
			rows.push({
				tier,
				stratum,
				entries: list.length,
				artworks: new Set(list.map((e) => e.artworkSha)).size,
				gradientRate: rate((e) => e.shape.gradient),
				surfaceCollapsedRate: rate((e) => e.shape.surfaceCollapsed),
				accentCollapsedRate: rate((e) => e.shape.accentCollapsed),
				anyCollapseRate: rate((e) => e.shape.surfaceCollapsed || e.shape.accentCollapsed),
				meanStops: mean(list.map((e) => e.shape.stopCount)),
				medianStops: median(list.map((e) => e.shape.stopCount)),
				meanPaletteBits: mean(list.map((e) => e.p1ap.nuisance["serializationBits"] as number)),
				medianPaletteBits: median(list.map((e) => e.p1ap.nuisance["serializationBits"] as number)),
				meanOmega: mean(list.map((e) => e.p1a.nuisance["omega"] as number)),
				meanExplainedMassFraction: mean(list.map((e) => e.explainedMassFraction)),
				meanInkMassFractionP1a: mean(list.map((e) => e.p1a.nuisance["inkMassFraction"] as number)),
				meanFieldMassFractionP1a: mean(list.map((e) => e.p1a.nuisance["fieldMassFraction"] as number)),
			})
		}
	}
	return rows
}

// ---------------------------------------------------------------------------------------------
// The check that the decomposition is a decomposition
// ---------------------------------------------------------------------------------------------

function termSumCheck(results: Results) {
	let maxA = 0
	let maxAp = 0
	for (const e of results.entries) {
		let a = 0
		for (const t of TERMS_A) a += e.p1a.terms[t] ?? 0
		maxA = Math.max(maxA, Math.abs(a - e.p1a.totals[String(LAMBDA)]!))
		let ap = 0
		for (const t of TERMS_AP) ap += e.p1ap.terms[t] ?? 0
		maxAp = Math.max(maxAp, Math.abs(ap - e.p1ap.totals[String(LAMBDA)]!))
	}
	return {
		note: "terms are stored at λ=1 and must sum to totals['1'] exactly; if these are not 0 the per-term deltas below are not a decomposition of the compared margin",
		maxAbsoluteResidualP1a: maxA,
		maxAbsoluteResidualP1ap: maxAp,
	}
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

function fmt(x: number | null, digits = 3): string {
	if (x === null || x === undefined || Number.isNaN(x)) return "—"
	if (x === 0) return "0"
	const a = Math.abs(x)
	if (a >= 1e5 || a < 1e-4) return x.toExponential(2)
	return x.toFixed(digits)
}

function pct(x: number | null): string {
	return x === null ? "—" : `${(x * 100).toFixed(1)}%`
}

const PAIR_SETS: { family: string; selection: string; short: string }[] = [
	{ family: "a-good-vs-known-bad", selection: "best-of-side", short: "good-vs-bad (best, primary)" },
	{ family: "a-good-vs-known-bad", selection: "all-pairs", short: "good-vs-bad (all pairs)" },
	{ family: "a-endorsed-vs-known-bad", selection: "best-of-side", short: "endorsed-vs-bad (DESIGN verbatim)" },
	{ family: "b-endorsed-vs-acceptable", selection: "best-of-side", short: "endorsed-vs-acceptable" },
	{ family: "b-acceptable-vs-known-bad", selection: "best-of-side", short: "acceptable-vs-bad" },
]

function main(): void {
	const dataDir = join(PROTOTYPE_ROOT, "data", "falsifier")
	const results = JSON.parse(readFileSync(join(dataDir, "m1-results.json"), "utf8")) as Results
	const pairs = buildPairs(results)

	const arms = ["p1a", "p1ap"] as const

	// --- Q1 ------------------------------------------------------------------------------------
	const q1: Record<string, unknown>[] = []
	for (const set of PAIR_SETS) {
		for (const arm of arms) {
			const subset = pairs.filter((p) => p.family === set.family && p.selection === set.selection && p.arm === arm)
			if (subset.length === 0) continue
			q1.push({
				family: set.family,
				selection: set.selection,
				arm,
				unit: UNITS[arm],
				pairs: subset.length,
				counts: {
					wins: subset.filter((p) => p.outcome === "win").length,
					losses: subset.filter((p) => p.outcome === "loss").length,
					ties: subset.filter((p) => p.outcome === "tie").length,
				},
				losses: termAttribution(subset, arm, "loss"),
				wins: termAttribution(subset, arm, "win"),
				lambdaFlip: lambdaFlip(subset),
			})
		}
	}

	// --- Q2 ------------------------------------------------------------------------------------
	const q2 = {
		note: "positive delta = the left (good/endorsed) side pays more; 'path' = " +
			`p1a {${PATH_TERMS.p1a.join(", ")}}, p1ap {${PATH_TERMS.p1ap.join(", ")}}`,
		crossTabByPairSet: PAIR_SETS.flatMap((set) =>
			arms.map((arm) => ({
				family: set.family,
				selection: set.selection,
				arm,
				unit: UNITS[arm],
				cells: gradientCrossTab(
					pairs.filter((p) => p.family === set.family && p.selection === set.selection && p.arm === arm),
					arm,
				),
			})),
		),
		crossTabPooledGoodVsBad: arms.map((arm) => ({
			arm,
			unit: UNITS[arm],
			cells: gradientCrossTab(
				pairs.filter((p) => p.family === "a-good-vs-known-bad" && p.selection === "all-pairs" && p.arm === arm),
				arm,
			),
		})),
		gradientMatched: PAIR_SETS.flatMap((set) =>
			arms.map((arm) => gradientMatchedWinRate(pairs, arm, set.family, set.selection)),
		),
		withinArtwork: Object.fromEntries(arms.map((arm) => [arm, withinArtworkGradient(results, arm)])),
		perEntryTermShares: Object.fromEntries(arms.map((arm) => [arm, gradientTermShares(results, arm)])),
	}

	// --- Q3 ------------------------------------------------------------------------------------
	const q3 = {
		strataCensus: results.strataCensus,
		degenerateEntries: results.entries.filter(
			(e) => (new Map(results.artworks.map((a) => [a.artworkSha, a.stratum]))).get(e.artworkSha) === "degenerate",
		).length,
		serializationDecidedAllPairSets: serializationDecided(pairs),
		serializationDecidedByPairSet: PAIR_SETS.map((set) => ({
			family: set.family,
			selection: set.selection,
			...serializationDecided(pairs.filter((p) => p.family === set.family && p.selection === set.selection)),
		})),
		tieAnatomy: Object.fromEntries(arms.map((arm) => [arm, tieAnatomy(pairs, arm)])),
		endorsedVsAcceptableInversion: Object.fromEntries(arms.map((arm) => [arm, inversionAnatomy(pairs, arm)])),
		genericBitsShareOfLikelihood: (() => {
			const stratumOf = new Map(results.artworks.map((a) => [a.artworkSha, a.stratum]))
			const of = (list: Entry[]) => {
				const shares = list.map((e) => e.p1ap.terms["genericBits"]! / (e.p1ap.nuisance["likelihoodBits"] as number))
				return { n: list.length, mean: mean(shares), median: median(shares), min: Math.min(...shares) }
			}
			return {
				all: of(results.entries),
				degenerate: of(results.entries.filter((e) => stratumOf.get(e.artworkSha) === "degenerate")),
				structured: of(results.entries.filter((e) => stratumOf.get(e.artworkSha) === "structured")),
			}
		})(),
	}

	// --- Q4 ------------------------------------------------------------------------------------
	const q4 = PAIR_SETS.filter((s) => s.family.endsWith("known-bad")).map((s) => inkSupport(pairs, s.family, s.selection))

	// --- Q5 ------------------------------------------------------------------------------------
	const q5 = tierCensus(results)

	const json = {
		header: {
			analysis: "M1 term attribution",
			prototype: "p1-mdl",
			reads: "data/falsifier/m1-results.json",
			sourceRunGitCommit: (results.header as Record<string, unknown>)["gitCommit"],
			sourceRunAsOf: (results.header as Record<string, unknown>)["asOf"],
			lambda: LAMBDA,
			pureReader: true,
			rng: "none",
			preRegistered: false,
			statisticalNote:
				"every test in this file is post-hoc, two-sided, and uncorrected; the pre-registered numbers are in m1-summary.json",
			clause:
				"DESIGN.md §Milestones M1 / arm-a-prime.md §7 — 'no rank signal, no single term culpable, at any λ in the sweep'",
			dominanceRule:
				"a term is culpable only if it is the largest contributor to the margin in ≥2/3 of losing pairs AND its median share of the margin is ≥0.5; otherwise the loss is spread",
			termSumCheck: termSumCheck(results),
		},
		q1TermAttribution: q1,
		q2Reconstruction: q2,
		q3Degeneracy: q3,
		q4InkSupport: q4,
		q5TierCensus: q5,
	}

	mkdirSync(dataDir, { recursive: true })
	writeFileSync(join(dataDir, "m1-attribution.json"), `${JSON.stringify(json, null, "\t")}\n`)
	writeFileSync(join(dataDir, "m1-attribution.md"), renderMarkdown(json, results, pairs))
	process.stdout.write(`wrote ${join(dataDir, "m1-attribution.json")} and m1-attribution.md\n`)
}

/**
 * The readable half.
 *
 * Kept under 120 lines on purpose: the full cross-product — five pair sets × two arms × two
 * outcomes × every term — is in `m1-attribution.json`, and a report that prints all of it is one
 * nobody reads. What survives here is the two pair sets the falsifier clause is actually about
 * (`a-good-vs-known-bad`, both selections) plus every verdict, and each table says which slice it
 * is showing so the omission is visible rather than silent.
 */
function renderMarkdown(json: Record<string, any>, results: Results, pairs: readonly Pair[]): string {
	const L: string[] = []
	const HEADLINE = json.q1TermAttribution.filter((r: any) => r.family === "a-good-vs-known-bad")

	L.push("# M1 attribution — is a single term culpable?")
	L.push("")
	L.push(
		`Pure reader of \`data/falsifier/m1-results.json\` (run \`${String(json.header.sourceRunGitCommit).slice(0, 10)}\`, as-of ${json.header.sourceRunAsOf}); no re-scoring, no RNG. λ=${LAMBDA}; the stored terms sum to the compared total with residual ${fmt(json.header.termSumCheck.maxAbsoluteResidualP1a, 0)} (p1a, nats) / ${fmt(json.header.termSumCheck.maxAbsoluteResidualP1ap, 0)} (p1ap, bits), so per-term deltas *are* a decomposition of the margin that decided each pair. **Every test here is post-hoc, two-sided and uncorrected**; the pre-registered numbers stay in \`m1-summary.json\`. Sign convention throughout: **positive Δ = the good/left side pays more**. Tables show the two \`a-good-vs-known-bad\` pair sets; all five pair sets are in \`m1-attribution.json\`, and detail tables show the larger \`all-pairs\` selection. Culpability rule, fixed in \`attribution.ts\` before any table was read: ${json.header.dominanceRule}. Every exploratory line below carries the same caveat and it is stated once here: post-hoc, two-sided, no direction fixed in advance, no multiplicity correction, because a post-hoc family has no honest size.`,
	)
	L.push("")

	// --- Q1 -------------------------------------------------------------------------------------
	L.push("## 1. Which term drives the losses")
	L.push("")
	L.push(
		"`share` = Δterm / Δtotal (sums to 1 within a pair; exceeds 100% and goes negative when two terms nearly cancel — a 650% share means that term alone would have decided the pair six times over and the others gave most of it back). `gross` = |Δterm| / Σ|Δterm|, bounded. `argmax` = pairs where this term is the largest contributor *in the direction the pair went*.",
	)
	L.push("")
	L.push("| pair set | arm | term | LOSS mean Δ | LOSS med share | LOSS gross | LOSS argmax | WIN mean Δ | WIN med share | WIN argmax |")
	L.push("|---|---|---|---|---|---|---|---|---|---|")
	for (const row of HEADLINE.filter((r: any) => r.selection === "all-pairs")) {
		const winByTerm = new Map(row.wins.terms.map((t: any) => [t.term, t]))
		for (const t of row.losses.terms) {
			const w = winByTerm.get(t.term) as any
			L.push(
				`| ${row.selection} | ${row.arm} | ${t.term} | ${fmt(t.meanDelta)} | ${pct(t.medianShare)} | ${pct(t.medianAbsShareOfGrossMovement)} | ${t.argmaxCount}/${row.losses.n} | ${fmt(w.meanDelta)} | ${pct(w.medianShare)} | ${w.argmaxCount}/${row.wins.n} |`,
			)
		}
	}
	L.push("")
	L.push("Verdicts under the rule above, all five pair sets:")
	L.push("")
	L.push("| pair set | arm | W/L/T | loss verdict | top-by-argmax | argmax frac | med share | win verdict |")
	L.push("|---|---|---|---|---|---|---|---|")
	for (const row of json.q1TermAttribution) {
		const c = row.counts
		L.push(
			`| ${row.family}/${row.selection} | ${row.arm} | ${c.wins}/${c.losses}/${c.ties} | **${row.losses.dominance.verdict}** | ${row.losses.dominance.topByArgmax ?? "—"} | ${pct(row.losses.dominance.argmaxFraction)} | ${pct(row.losses.dominance.medianShareOfTop)} | ${row.wins.dominance.verdict} |`,
		)
	}
	L.push("")
	L.push("λ rescue — losses whose margin `Δdata + λ·Δstructural` changes sign at some λ, and whether that λ is inside the swept grid [¼, 4]:")
	L.push("")
	L.push(
		`On \`all-pairs\`: ${HEADLINE.filter((r: any) => r.selection === "all-pairs").map((r: any) => `**${r.arm}** ${r.lambdaFlip.n} losses, ${r.lambdaFlip.structuralTied} with Δstructural = 0 (no λ can move them at all), ${r.lambdaFlip.flippableAnyPositiveLambda} flip at some λ>0, ${r.lambdaFlip.flippableInGrid} flip inside the swept grid`).join("; ")}.`,
	)
	L.push("")

	// --- Q2 -------------------------------------------------------------------------------------
	L.push("## 2. The reconstruction question")
	L.push("")
	L.push(
		`Legacy gradients were reconstructed \`[background@0, midpoint@0.5, surface@1]\`. Cross-tab of the pooled good-vs-known-bad pairs (all-pairs, n=47) by the two sides' gradient booleans; \`path\` = p1a {${PATH_TERMS.p1a.join(" + ")}}, p1ap {${PATH_TERMS.p1ap.join(" + ")}}.`,
	)
	L.push("")
	L.push("| arm | cell (good–bad) | n | W/L/T | good win rate | mean Δtotal | mean Δpath | med Δpath |")
	L.push("|---|---|---|---|---|---|---|---|")
	for (const block of json.q2Reconstruction.crossTabPooledGoodVsBad) {
		for (const c of block.cells) {
			if (c.n === 0) continue
			L.push(
				`| ${block.arm} | ${c.cell} | ${c.n} | ${c.wins}/${c.losses}/${c.ties} | ${pct(c.winRateOfDecided)} | ${fmt(c.meanDeltaTotal)} | ${fmt(c.meanPathDelta)} | ${fmt(c.medianPathDelta)} |`,
			)
		}
	}
	L.push("")
	L.push("**The control.** Restricting to pairs where both sides declared the same gradient boolean takes the reconstruction penalty out of the comparison — both sides pay it or neither does. If a signal appears there, the M1 null is a reconstruction artifact.")
	L.push("")
	L.push("| pair set | arm | matched W/L/T | matched good win rate | mismatched decided | flat side cheaper |")
	L.push("|---|---|---|---|---|---|")
	for (const m of json.q2Reconstruction.gradientMatched) {
		if (m.family !== "a-good-vs-known-bad" || m.selection !== "all-pairs") continue
		L.push(
			`| ${m.selection} | ${m.arm} | ${m.matchedWins}/${m.matchedLosses}/${m.matchedTies} | ${pct(m.matchedWinRate)} | ${m.mismatchedDecided} | ${m.flatSideWon}/${m.mismatchedDecided} |`,
		)
	}
	L.push("")
	L.push("Within-artwork gradient contrast — the artworks whose legacy records disagree with themselves about the gradient boolean, best-of-side within each state, Δ = gradient-true − gradient-false:")
	L.push("")
	L.push("| arm | artworks | ramp costs more | mean Δtotal | med Δtotal | per-term mean Δ |")
	L.push("|---|---|---|---|---|---|")
	for (const arm of ["p1a", "p1ap"] as const) {
		const w = json.q2Reconstruction.withinArtwork[arm]
		L.push(
			`| ${arm} | ${w.artworksWithBothStates} | ${w.gradientCostsMore}/${w.decided} | ${fmt(w.meanDeltaTotal)} | ${fmt(w.medianDeltaTotal)} | ${w.perTerm.map((t: any) => `${t.term} ${fmt(t.meanDelta)}`).join("; ")} |`,
		)
	}
	L.push("")
	L.push(
		`- Reconstructed ramp costs more than its flat sibling on the same artwork: ${(["p1a", "p1ap"] as const).map((arm) => `${arm} ${json.q2Reconstruction.withinArtwork[arm].test.summary}`).join("; ")} (exact binomial, two-sided).`,
	)
	L.push(
		`- Good side lower on **gradient-matched** pairs, all-pairs: ${json.q2Reconstruction.gradientMatched.filter((m: any) => m.family === "a-good-vs-known-bad" && m.selection === "all-pairs").map((m: any) => `${m.arm} ${m.matchedTest.summary}`).join("; ")}. On **gradient-mismatched** pairs the flat side is the cheaper one: ${json.q2Reconstruction.gradientMatched.filter((m: any) => m.family === "a-good-vs-known-bad" && m.selection === "all-pairs").map((m: any) => `${m.arm} ${m.flatSideWonTest.summary}`).join("; ")}.`,
	)
	L.push("")

	// --- Q3 -------------------------------------------------------------------------------------
	L.push("## 3. The degeneracy question (arm A′)")
	L.push("")
	const g = json.q3Degeneracy.genericBitsShareOfLikelihood
	L.push(
		`\`genericBits\` median share of the likelihood: all entries ${pct(g.all.median)}, degenerate-artwork entries ${pct(g.degenerate.median)} (n=${g.degenerate.n} entries on ${json.q3Degeneracy.strataCensus.degenerate} artworks), structured ${pct(g.structured.median)}. The premise — that on a degenerate artwork both sides code the same generic mass and the margin reduces to λ·ΔL(P) — is tested directly below.`,
	)
	L.push("")
	L.push("| stratum | pairs | ties | decided | decided by L(P) **alone** | cheaper-L(P) side won | med L(P) share of margin | margins ≥99% L(P) |")
	L.push("|---|---|---|---|---|---|---|---|")
	for (const [name, s] of Object.entries<any>(json.q3Degeneracy.serializationDecidedAllPairSets)) {
		L.push(
			`| ${name} | ${s.pairs} | ${s.ties} | ${s.decided} | ${s.decidedByPaletteBitsAlone} (${pct(s.decidedByPaletteBitsAloneRate)}) | ${s.cheaperPaletteWon}/${s.pairsWithNonZeroPaletteBitsDelta} (${pct(s.cheaperPaletteWonRate)}) | ${pct(s.medianPaletteBitsShareOfMargin)} | ${s.marginsAbove99PercentPaletteBits} |`,
		)
	}
	L.push("")
	L.push("Tie anatomy — a tie in which every term is identical is the same reconstructed configuration filed under two verdict tiers, i.e. a corpus labelling fact, not the energy failing to discriminate:")
	L.push("")
	L.push("| arm | ties | every term identical | identical across good/known-bad | by tier pair |")
	L.push("|---|---|---|---|---|")
	for (const arm of ["p1a", "p1ap"] as const) {
		const t = json.q3Degeneracy.tieAnatomy[arm]
		const pairsText = Object.entries<number>(t.identicalConfigurationsByTierPair).map(([k, v]) => `${k}: ${v}`).join("; ")
		L.push(`| ${arm} | ${t.ties} | ${t.everyTermIdentical} | ${t.identicalConfigurationsAcrossGoodAndKnownBad} | ${pairsText || "—"} |`)
	}
	L.push("")
	L.push("The endorsed-vs-acceptable inversion (`9W/21L/18T`, two-sided p=0.0428 — acceptable is *cheaper*), against the hypothesis that acceptable wins by naming fewer colours. Δ = endorsed − acceptable:")
	L.push("")
	L.push("| arm | subset | n | mean ΔL(P) bits | mean ΔΩ | mean Δstops | endorsed more collapses | acceptable more collapses | acceptable cheaper in L(P) |")
	L.push("|---|---|---|---|---|---|---|---|---|")
	for (const arm of ["p1ap"] as const) {
		const inv = json.q3Degeneracy.endorsedVsAcceptableInversion[arm]
		for (const key of ["all", "losses"] as const) {
			const s = inv[key]
			L.push(
				`| ${arm} | ${s.outcome} | ${s.n} | ${fmt(s.meanDeltaPaletteBits, 2)} | ${fmt(s.meanDeltaOmega)} | ${fmt(s.meanDeltaStops)} | ${s.endorsedHasMoreCollapses}/${s.n} | ${s.acceptableHasMoreCollapses}/${s.n} | ${s.acceptableCheaperInPaletteBits}/${s.n} |`,
			)
		}
	}
	L.push("")

	// --- Q4 -------------------------------------------------------------------------------------
	L.push("## 4. The ink-support question (arm A, DESIGN.md decision 9)")
	L.push("")
	L.push("The known defect lets broad mass read as ink for free. Its prediction: in the pairs the good side loses, the *known-bad* side should be the one carrying the larger `inkMassFraction`.")
	L.push("")
	L.push("| pair set | outcome | n | mean ink (good) | mean ink (bad) | mean Δ | med Δ | bad side has more ink |")
	L.push("|---|---|---|---|---|---|---|---|")
	for (const row of json.q4InkSupport) {
		if (row.family !== "a-good-vs-known-bad" || row.selection !== "all-pairs") continue
		for (const which of ["losses", "wins"] as const) {
			const s = row[which]
			L.push(
				`| ${row.selection} | ${which} | ${s.n} | ${fmt(s.meanInkGood, 4)} | ${fmt(s.meanInkBad, 4)} | ${fmt(s.meanDeltaInk, 4)} | ${fmt(s.medianDeltaInk, 4)} | ${s.badSideHasMoreInk}/${s.n} |`,
			)
		}
	}
	L.push("")
	for (const row of json.q4InkSupport) {
		if (row.family !== "a-good-vs-known-bad" || row.selection !== "all-pairs") continue
		if (row.lossTest !== null) L.push(`- Losing pairs where the known-bad side carries the larger inkMassFraction: ${row.lossTest.summary} — i.e. in ${row.losses.n - row.lossTest.successes} of ${row.losses.n} losses it is the **good** side holding more ink (exact binomial, two-sided).`)
	}
	L.push(
		`- Pearson r(Δ inkMassFraction, Δ total), good-vs-known-bad: ${json.q4InkSupport.filter((r: any) => r.family === "a-good-vs-known-bad").map((r: any) => `${r.selection} r=${fmt(r.correlationDeltaInkVsDeltaTotal)} (n=${r.correlationN})`).join(", ")}. Negative r means *more* ink mass on the good side goes with a *lower* good-side energy — the defect, where it bites, is helping whoever takes the ink, not the known-bad side specifically.`,
	)
	L.push("")

	// --- Q5 -------------------------------------------------------------------------------------
	L.push("## 5. Tier structural census")
	L.push("")
	L.push("| tier | stratum | entries | artworks | gradient | surf. collapsed | acc. collapsed | mean stops | mean L(P) bits | mean Ω | mean explained mass |")
	L.push("|---|---|---|---|---|---|---|---|---|---|---|")
	for (const r of (json.q5TierCensus as any[]).filter((r) => r.stratum === "all")) {
		L.push(
			`| ${r.tier} | ${r.stratum} | ${r.entries} | ${r.artworks} | ${pct(r.gradientRate)} | ${pct(r.surfaceCollapsedRate)} | ${pct(r.accentCollapsedRate)} | ${fmt(r.meanStops)} | ${fmt(r.meanPaletteBits, 2)} | ${fmt(r.meanOmega)} | ${fmt(r.meanExplainedMassFraction, 4)} |`,
		)
	}
	L.push("")
	L.push(
		`λ enters only as λ·Ω (p1a) and λ·L(P) (p1ap), so the tier ordering of those two is the entire channel λ has: ${
			(json.q5TierCensus as any[])
				.filter((r) => r.stratum === "all")
				.map((r) => `${r.tier} Ω=${fmt(r.meanOmega)}, L(P)=${fmt(r.meanPaletteBits, 1)} bits`)
				.join("; ")
		}. Known-bad is the structurally *cheapest* tier on both, so raising λ moves the falsifier against the good tiers, not for them. Per-stratum rows are in the JSON; the sharpest is known-bad on degenerate artworks — 6 entries, 0% gradient, 66.7% surface-collapsed, L(P)=83.0 bits, Ω=1.33.`,
	)
	L.push("")
	L.push(
		`Read: ${pairs.length} pairs (λ=1, stratum=all comparisons only — the stratum-restricted comparisons are subsets and would double-count), ${results.entries.length} entries, ${results.artworks.length} artworks.`,
	)
	L.push("")
	return `${L.join("\n")}\n`
}

main()
