/**
 * # The report-only instruments every emitted palette carries
 *
 * Three of them, each one an obligation `DESIGN.md` took on in writing before the first emitter run,
 * recorded so that later reads are attributable rather than post-hoc:
 *
 * 1. **min-|APCA| over the rendered field, for the foreground *and* the accent** (reviewer-evidence
 *    item 1 and addendum item 5). The position on this is deliberate and worth restating where the
 *    code is: P1 does **not** add an APCA reward term. Contrast is *bounded by the contract, never
 *    rewarded by the objective*, because the bet under test is that the foreground is legible for
 *    being the colour the artwork used as ink. The number below is how that bet gets falsified —
 *    *"if our foregrounds draw the same 'unreadable' verdicts, that falsifies the ink-recovery story,
 *    not the tuning."*
 * 2. **The F/A-swapped assignment's energy delta** (addendum item 6). `DESIGN.md` decision 3 orders
 *    the two inks by a rule rather than by the energy; this is the rule's bill, per palette.
 * 3. **`knownBetterFeasible`** (arm A §7): does a *legacy endorsed* configuration for this very
 *    artwork score lower, under this very energy, while being feasible under the v3 contract? If it
 *    does, the search under-searched — and that is a different failure from the currency being wrong,
 *    which is the distinction the whole falsifier stage rests on.
 *
 * Every number here is computed **after** the search and read by nothing inside it.
 */

import {
	apcaRaw,
	colorDistance,
	colorFromRgb,
	rgbToHex,
} from "../../../../src/contract/color.ts"
import { minRawContrastOverRamp, rampPath } from "../../../../src/contract/ramp.ts"
import type { Palette, Rgb8 } from "../../../../src/contract/types.ts"
import {
	loadLegacyTier,
	toConfiguration,
	type LegacyEntry,
	type LegacyTierFile,
} from "../emit/legacy.ts"
import type { Configuration } from "../emit/types.ts"
import { withInksSwapped } from "./conventions.ts"
import type { Evaluator } from "./evaluator.ts"
import type { InkContrastReport, KnownBetterFeasible, Scored, SwapProbe } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// 1. The contrast report
// ---------------------------------------------------------------------------------------------

/**
 * `min |raw APCA|` between one ink and the field it renders on.
 *
 * Computed **through the contract's own machinery** — `minRawContrastOverRamp` for a gradient field,
 * `apcaRaw` for a flat one — as the M2 brief requires, so this number and the number invariant 4
 * enforced are the same quantity produced by the same code rather than two implementations that
 * agree until they do not.
 *
 * For a flat field the minimum runs over the two published field colours, which is the set invariant
 * 4's `CONTRAST_FLOOR_PAIRS` holds an ink against. For a collapsed field those two are one colour and
 * the minimum is over a singleton, correctly.
 */
export function inkContrast(palette: Palette, ink: Rgb8): InkContrastReport {
	const subject = colorFromRgb(ink)
	const stops = palette.gradient?.stops
	if (stops !== undefined && stops !== null && stops.length >= 2) {
		const extremum = minRawContrastOverRamp(subject, stops)
		if (extremum !== null) {
			return {
				minAbsRaw: Math.abs(extremum.raw),
				at: rampPath(extremum),
				distance: extremum.distance,
				field: "rendered-ramp",
			}
		}
	}

	const candidates = [
		{ name: "roles.background", color: palette.roles.background },
		{ name: "roles.surface", color: palette.roles.surface },
	]
	let best: InkContrastReport | null = null
	for (const candidate of candidates) {
		const raw = Math.abs(apcaRaw(ink, candidate.color.rgb))
		if (best === null || raw < best.minAbsRaw) {
			best = {
				minAbsRaw: raw,
				at: candidate.name,
				distance: colorDistance(subject, candidate.color),
				field: "flat-field",
			}
		}
	}
	return best as InkContrastReport
}

// ---------------------------------------------------------------------------------------------
// 2. The F/A swap probe
// ---------------------------------------------------------------------------------------------

/**
 * Score the assignment decision 3 rejected.
 *
 * Off-budget and outside the competition: this configuration is *not* a candidate for emission — the
 * search already decided the assignment by rule — and letting it into the incumbent list would be the
 * energy quietly overruling decision 3 through the back door.
 *
 * A collapsed accent has one assignment and nothing to swap, which is reported as such rather than as
 * a zero delta: zero would read as "the swap costs nothing", and there is no swap.
 */
export function swapProbe(evaluator: Evaluator, incumbent: Scored): SwapProbe {
	if (incumbent.configuration.accentCollapsed) {
		return {
			feasible: false,
			energy: null,
			delta: null,
			reason: "accent is collapsed onto the foreground; the assignment is not two-valued",
		}
	}
	const { scored, report } = evaluator.scoreOffBudget(
		withInksSwapped(incumbent.configuration),
		false,
	)
	if (scored === null) {
		const codes = report.violations.map((violation) => violation.code).join(", ")
		return {
			feasible: false,
			energy: null,
			delta: null,
			reason: `the swapped assignment is infeasible (${codes || "no violation codes reported"})`,
		}
	}
	return {
		feasible: true,
		energy: scored.energy,
		delta: scored.energy - incumbent.energy,
		reason: null,
	}
}

// ---------------------------------------------------------------------------------------------
// 3. The per-image self-falsifier
// ---------------------------------------------------------------------------------------------

/**
 * The endorsed tier, loaded once per process.
 *
 * `loadLegacyTier` is deliberately unmemoised (a cache is a place for a stale tier to hide), which is
 * right for a falsifier run that reads it once and wrong for an emitter run that would otherwise
 * re-read ~1 MB of JSON per image. The memo here is *this module's*, scoped to one process, and it is
 * the endorsed tier only — the three tiers are never concatenated and the other two have no business
 * in this comparison. `acceptable` is a not-rejected baseline, not an endorsement; `known-bad` is a
 * gate, and a known-bad palette scoring lower would say something quite different, which is the
 * falsifier stage's question rather than the emitter's.
 */
let endorsedTier: LegacyTierFile | null = null

function endorsedByArtworkHash(hash: string): LegacyEntry[] {
	endorsedTier ??= loadLegacyTier("endorsed")
	return endorsedTier.entries.filter((entry) => entry.artwork.contentSha256 === hash)
}

/**
 * Score every endorsed legacy configuration for this artwork and compare with what we emitted.
 *
 * Matching is by **content hash of the file's bytes**, the identity `CONVENTIONS.md` and the devloop
 * cache both key on — not by filename and not by path, both of which are known to disagree with the
 * file in this corpus.
 *
 * Feasibility is checked **with the image facts supplied**: a legacy palette's colours are not
 * guaranteed to be triples of the artwork (exactly one of 1,397 endorsed colours is absent from its
 * own artwork, per `BELONGS_STUDY.md`), so invariant 2's existence clause is live for this comparison
 * in a way it is not for the search's own configurations.
 *
 * The reading is deliberately one-directional. `underSearched: true` says a legal configuration
 * scoring lower than ours existed and we did not find it — a fact about the search. `false` says
 * nothing at all about the objective: it is also what an artwork with no endorsed legacy palette
 * returns, which is why the counts travel with the boolean.
 */
export function knownBetterFeasible(
	evaluator: Evaluator,
	incumbent: Scored,
	inputContentHash: string,
): KnownBetterFeasible {
	const entries = endorsedByArtworkHash(inputContentHash)
	let convertible = 0
	let feasible = 0
	let bestEnergy: number | null = null
	let bestEntryId: string | null = null

	for (const entry of entries) {
		const conversion = toConfiguration(entry)
		if (!conversion.ok) continue
		convertible += 1
		const { scored } = evaluator.scoreOffBudget(conversion.configuration as Configuration, true)
		if (scored === null) continue
		feasible += 1
		if (bestEnergy === null || scored.energy < bestEnergy) {
			bestEnergy = scored.energy
			bestEntryId = entry.entryId
		}
	}

	const underSearched = bestEnergy !== null && bestEnergy < incumbent.energy
	return {
		entriesForArtwork: entries.length,
		convertible,
		feasible,
		legacyEnergy: bestEnergy,
		legacyEntryId: bestEntryId,
		incumbentEnergy: incumbent.energy,
		underSearched,
		shortfall: bestEnergy === null ? null : incumbent.energy - bestEnergy,
	}
}

/** Hex spellings of a configuration's four roles, for a terse log line. */
export function roleHexes(configuration: Configuration): string {
	return [
		configuration.background,
		configuration.surface,
		configuration.foreground,
		configuration.accent,
	]
		.map((rgb) => rgbToHex(rgb))
		.join(" ")
}
