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
 * It calls `analyzeImage` from `candidate.ts`, the same function `paletteOf` wraps, so the palette
 * printed here is the palette the run file would hold, byte for byte.
 */

import { fileURLToPath } from "node:url"
import { isAbsolute, resolve } from "node:path"

import { analyzeImage } from "./candidate.ts"

/** The report shape. JSON only — a reader of this output is usually `jq`, not a human. */
export type DiagnosticReport = Awaited<ReturnType<typeof diagnose>>

export async function diagnose(imagePath: string) {
	const absolute = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath)
	const { palette, diagnostics, fieldOrder, fieldComponents } = await analyzeImage(absolute)
	return {
		image: absolute,
		size: `${palette.metadata.sourceRendition.width}×${palette.metadata.sourceRendition.height}`,
		fieldOrder,
		diagnostics,
		attempts: fieldComponents === null
			? null
			: fieldComponents.attempts.map((component) => ({
				depth: component.depth,
				order: component.order,
				supportFraction: Number(component.supportFraction.toFixed(4)),
				coreFraction: Number(component.coreFraction.toFixed(4)),
				extensive: component.extensive,
				smooth: component.smooth,
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
