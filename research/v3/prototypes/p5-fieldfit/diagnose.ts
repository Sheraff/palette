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
import { analyzeImage } from "./candidate.ts"

/** The report shape. JSON only — a reader of this output is usually `jq`, not a human. */
export type DiagnosticReport = Awaited<ReturnType<typeof diagnose>>

export async function diagnose(imagePath: string) {
	const absolute = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath)
	const { palette, diagnostics, pathExcursion, fieldOrder, fieldComponents } = await analyzeImage(
		absolute,
	)
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
