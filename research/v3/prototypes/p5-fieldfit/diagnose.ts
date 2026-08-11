/**
 * P5 field-fit — one image, every margin the pipeline measured (W-INTEG).
 *
 * Usage, from `research/v3`:
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts <imagePath>
 *
 * Prints one JSON object: the `Diagnostics` sidecar from `src/types.ts`, the published role hexes,
 * the gradient stops, the collapse flags and the escape. The dev loop's run file carries the palette
 * and nothing else — the sidecar is deliberately not in the contract (`SPEC.md`, "Diagnostics") — so
 * this is the only place the fit's own numbers are readable per image.
 *
 * v0.5.1 adds `attempts`: one row per level the component recursion fitted, accepted or not, with the
 * two gate quantities (`supportFraction` for *extensive*, `coreFraction` for *smooth*) and the two
 * verdicts. `diagnostics.fieldComponents` counts the accepted rows and `diagnostics.retreat` says the
 * pool was empty, but neither can say **which** level failed **which** gate by how much — and that is
 * the question every ruling about `EXTENSIVE_SUPPORT_FRACTION` and `COMPONENT_CORE_FRACTION` has so
 * far been decided on (`16a8247378`'s sky at core 0.40 is a row of this table). It is `null` when the
 * recursion never ran.
 *
 * v0.6 adds two blocks; v0.6.1 moved both into `Diagnostics` itself (`reports/wp10-types.md`, ratified),
 * so this file reads them off the sidecar like everything else and prints them rounded, once:
 *
 *  - `continuity` — the t-continuity discriminator's measurement, `null` when the straight chord never
 *    left the artwork and the question never arose. `middleBandMass` below the threshold is the *only*
 *    route to `twoBlockFallback` from `readRamp` since decision 5's ruling of 2026-08-05, so this is
 *    the number that says why a cover is a ramp or two blocks;
 *  - `margins` — distance, bar and ratio for every pair the contract judges, plus the foreground's
 *    `min|raw APCA|` over the published ramp against its floor and the accent's twin ratio against the
 *    exclusion multiple. Reporting only. The point is round-3 cross-arm note 6: a scorecard says
 *    *passed*, and a reviewer who calls a passing pair indistinguishable is disagreeing with a margin
 *    nobody wrote down.
 *
 * It calls `analyzeImage` from `candidate.ts`, the same function `paletteOf` wraps, so the palette
 * printed here is the palette the run file would hold, byte for byte.
 */

import { fileURLToPath } from "node:url"
import { isAbsolute, resolve } from "node:path"

import { POOLED_SAME_COLOR_BAR } from "../../src/contract/constants.ts"
import { colorFromRgb } from "../../src/contract/color.ts"
import { analyzeImage } from "./candidate.ts"
import type { RoleCandidate } from "./src/assignment.ts"
import { unpackRgb } from "./src/decode.ts"

/** The report shape. JSON only — a reader of this output is usually `jq`, not a human. */
export type DiagnosticReport = Awaited<ReturnType<typeof diagnose>>

/**
 * One shortlist entry, as the trace prints it: the colour, its salient mass, its legibility, and —
 * v0.8.1 — which half of decision 18(a)'s union it came from. `source` is the first thing to read on
 * any delta a component candidate is suspected of causing, because `mass` means two different
 * (commensurable, but differently sourced) quantities across the two: `Σ(1 − w)` for an overlay
 * cluster, the component's field mass `Σ w` for a component.
 */
function shortlistRow(candidate: RoleCandidate) {
	return {
		hex: candidate.color.hex,
		source: candidate.source,
		mass: Number(candidate.mass.toFixed(1)),
		// v0.9.0: the accent tie-break's quantity, printed beside the mass it now leads, so a published
		// accent can be read against the candidate it beat without re-deriving either number.
		chroma: Number(candidate.chroma.toFixed(4)),
		minRawApca: Number(candidate.legibility.toFixed(2)),
	}
}

export async function diagnose(imagePath: string) {
	const absolute = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath)
	const {
		palette,
		diagnostics,
		pathExcursion,
		assignment,
		componentCandidates,
		fieldOrder,
		fieldComponents,
		marks,
	} = await analyzeImage(absolute)
	// `continuity` and `margins` are printed below, rounded to the digits a reader can act on; they are
	// lifted out of the flat sidecar block rather than printed twice.
	const { continuity, margins, ...flatDiagnostics } = diagnostics
	return {
		image: absolute,
		size: `${palette.metadata.sourceRendition.width}×${palette.metadata.sourceRendition.height}`,
		fieldOrder,
		diagnostics: flatDiagnostics,
		continuity: continuity === null ? null : {
			middleBandMass: Number(continuity.middleBandMass.toFixed(4)),
			spanMassFraction: Number(continuity.spanMassFraction.toFixed(4)),
			reading: continuity.bimodal ? "bimodal" : "continuous",
		},
		// SPEC decision 17's deciding quantity, on the published polyline, beside the bar it is judged
		// against and the resolution below which a "reduction" is one measurement twice. `null` when no
		// gradient was published. In bars as well as raw units because every ruling about stops so far
		// has been argued in bars.
		pathExcursion: pathExcursion === null ? null : {
			chord: Number(pathExcursion.chord.toFixed(5)),
			published: Number(pathExcursion.published.toFixed(5)),
			chordBars: Number((pathExcursion.chord / POOLED_SAME_COLOR_BAR).toFixed(3)),
			publishedBars: Number((pathExcursion.published / POOLED_SAME_COLOR_BAR).toFixed(3)),
			precision: Number(pathExcursion.precision.toFixed(6)),
			largestGap: Number(pathExcursion.largestGap.toFixed(5)),
			beyondEnds: Number(pathExcursion.beyondEnds.toFixed(5)),
			samples: pathExcursion.samples,
		},
		margins: {
			pairs: margins.pairs.map((pair) => ({
				pair: pair.pair,
				colors: `${pair.first}/${pair.second}`,
				distance: Number(pair.distance.toFixed(5)),
				bar: Number(pair.bar.toFixed(5)),
				ratio: Number(pair.ratio.toFixed(3)),
				collapsed: pair.collapsed,
			})),
			foregroundLegibility: {
				minRawApca: Number(margins.foregroundLegibility.minRawApca.toFixed(3)),
				floor: margins.foregroundLegibility.floor,
				ratio: Number(margins.foregroundLegibility.ratio.toFixed(3)),
			},
			accentTwin: {
				distance: Number(margins.accentTwin.distance.toFixed(5)),
				bar: Number(margins.accentTwin.bar.toFixed(5)),
				ratio: Number(margins.accentTwin.ratio.toFixed(3)),
				exclusionMultiple: margins.accentTwin.exclusionMultiple,
				clearance: Number(margins.accentTwin.clearance.toFixed(3)),
				collapsed: margins.accentTwin.collapsed,
			},
		},
		// SPEC decision 18's joint solve, entire: the artwork's identity set with each family's share of
		// the image, which families the four published roles reach, the two shortlists the solve ran
		// over, and — the number to read first on any delta — whether coverage or the per-role
		// preference decided this palette. `null` when no assignment was solved.
		//
		// Since v0.9.2, `massRetained` is the share of the image held by the entries the coherence gate
		// **kept**, not by every entry with mass. It falls when material is withheld, and it is supposed
		// to: a set that kept claiming the whole frame after refusing a point would be reporting a
		// coverage it can no longer stand behind. `marks.top[].identityCoherent` names what was refused.
		assignment: assignment === null ? null : {
			shortlistSize: assignment.shortlistSize,
			familyCount: assignment.familyCount,
			enumerated: assignment.enumerated,
			feasible: assignment.feasible,
			totalFamilies: assignment.identity.totalFamilies,
			massRetained: Number(assignment.identity.massRetained.toFixed(4)),
			families: assignment.identity.families.map((family) => ({
				rank: family.rank,
				hex: colorFromRgb(unpackRgb(family.representative)).hex,
				massFraction: Number(family.massFraction.toFixed(4)),
				members: family.memberCount,
			})),
			fieldCovered: assignment.fieldCovered,
			coverage: assignment.chosen?.coverage ?? null,
			covered: assignment.chosen?.covered ?? null,
			coverageDecided: assignment.coverageDecided,
			perRoleOnly: assignment.perRoleOnly === null ? null : {
				foreground: assignment.perRoleOnly.foreground.color.hex,
				accent: assignment.perRoleOnly.accent?.color.hex ?? null,
				coverage: assignment.perRoleOnly.coverage,
			},
			foregroundShortlist: assignment.foregroundShortlist.map(shortlistRow),
			accentShortlist: assignment.accentShortlist.map(shortlistRow),
		},
		// SPEC decision 18's ruling (a), the pool re-union: one row per field-like component that won no
		// field slot and was therefore offered to the ink pool. `admitted: false` means a more extensive
		// component of the same family already holds the entry (`duplicateOf` names it); `supersedes`
		// lists the overlay clusters that left the pool because this component *is* their colour family
		// (the dedupe direction, and the number to read when a cluster the last version published has
		// gone); `feasible: false` means it entered and lost representative-distinctness from a published
		// end. Empty on every cover the global fit explained — those covers cannot move in v0.8.1.
		componentCandidates: componentCandidates.map((row) => ({
			depth: row.depth,
			supportFraction: Number(row.supportFraction.toFixed(4)),
			supportMass: Number(row.supportMass.toFixed(1)),
			centre: row.centre,
			published: row.published,
			admitted: row.admitted,
			duplicateOf: row.duplicateOf,
			supersedes: row.supersedes.map((entry) =>
				`${entry.hex}@${entry.overlayMass.toFixed(1)}`
			),
			feasible: row.feasible,
			minRawApca: row.legibility === null ? null : Number(row.legibility.toFixed(2)),
		})),
		// v0.9.0's mark/region reading — the input to the accent pool's third source and to the identity
		// families, printed as what it is rather than summarized. `scale.curve` is the whole `N(r)` the
		// grouping scale was chosen off, because `criterion` is only arguable against it: `"plateau"`
		// means the count stood still over consecutive rungs and the sweep took that; `"default"` means
		// no count repeated, arm-f's criterion had nothing to read, and
		// `MARK_SCALE_DEFAULT_DIAGONAL_FRACTION` was taken instead. `slopeIndex` is the rung the retired
		// log-log reading would have taken — reported so the retirement stays checkable, read by nothing.
		marks: {
			scale: {
				radius: marks.scale.radius,
				diagonal: Number(marks.scale.diagonal.toFixed(1)),
				criterion: marks.scale.criterion,
				plateauLength: marks.scale.plateauLength,
				chosenIndex: marks.scale.chosenIndex,
				slopeIndex: marks.scale.slopeIndex,
				curve: marks.scale.scales.map((radius, index) => ({
					r: radius,
					n: marks.scale.counts[index],
				})),
			},
			entries: marks.marks.length,
			unexplainedPixels: marks.unexplainedPixels,
			massRetained: Number(marks.massRetained.toFixed(4)),
			// The heaviest sixteen. `inkShaped` is V9a's mark-level shape verdict and is **diagnostics
			// only** — no role ordering reads it (V9a §d measured that an ink preference would displace a
			// reviewer-STRONG foreground), and it is printed so the deferral stays measurable.
			//
			// `selfCoherence` / `identityCoherent` are v0.9.2's gate, and unlike `inkShaped` they **are**
			// read: an entry with `identityCoherent: false` contributes no point and no mass to the
			// identity families above, so this pair is the first place to look when a family that a mark
			// obviously carries is missing from the set. Never a pool gate — a withheld entry is still in
			// the accent shortlist below.
			top: marks.marks.slice(0, 16).map((entry) => ({
				kind: entry.kind,
				hex: colorFromRgb(unpackRgb(entry.representative)).hex,
				pixels: entry.pixels,
				mass: Number(entry.mass.toFixed(1)),
				massFraction: Number(entry.massFraction.toFixed(4)),
				chroma: Number(entry.chroma.toFixed(4)),
				selfCoherence: Number(entry.selfCoherence.toFixed(4)),
				identityCoherent: entry.identityCoherent,
				erosionMortality: entry.ink === null
					? null
					: Number(entry.ink.erosionMortality.toFixed(3)),
				groundAdjacency: entry.ink === null ? null : Number(entry.ink.groundAdjacency.toFixed(3)),
				inkLike: entry.inkLike,
				inkShaped: entry.inkShaped,
			})),
		},
		attempts: fieldComponents === null
			? null
			: fieldComponents.attempts.map((component) => ({
				depth: component.depth,
				order: component.order,
				supportFraction: Number(component.supportFraction.toFixed(4)),
				coreFraction: Number(component.coreFraction.toFixed(4)),
				extensive: component.extensive,
				smooth: component.smooth,
				// SPEC decision 15a: `null` on a level the ink test never reached (never accepted).
				erosionMortality: component.ink === null
					? null
					: Number(component.ink.erosionMortality.toFixed(4)),
				groundAdjacency: component.ink === null
					? null
					: Number(component.ink.groundAdjacency.toFixed(4)),
				inkLike: component.inkLike,
			})),
		palette: {
			background: palette.roles.background.hex,
			surface: palette.roles.surface.hex,
			foreground: palette.roles.foreground.hex,
			accent: palette.roles.accent.hex,
			gradient: palette.gradient === null
				? null
				: palette.gradient.stops.map((stop) => ({
					hex: stop.color.hex,
					position: Number(stop.position.toFixed(4)),
				})),
			geometry: palette.gradient?.geometry ?? null,
			collapse: palette.collapse,
			escape: palette.escape ?? null,
		},
	}
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.length !== 1) {
		process.stdout.write("usage: diagnose.ts <imagePath>\n")
		return 2
	}
	process.stdout.write(`${JSON.stringify(await diagnose(argv[0]), null, 2)}\n`)
	return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2))
}
