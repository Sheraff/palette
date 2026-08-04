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
	const { palette, diagnostics, fieldOrder } = await analyzeImage(absolute)
	return {
		image: absolute,
		size: `${palette.metadata.sourceRendition.width}×${palette.metadata.sourceRendition.height}`,
		fieldOrder,
		diagnostics,
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
