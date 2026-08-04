/**
 * Check 4 — contract re-check, independent of the workers' claims.
 *
 * `scorePalette` from `src/contract` is run over every palette row of both `demo-20` runs, twice:
 * once bare (no source, no transparency report — I2 and I5 defer), and once with **this file's own**
 * decode supplied as the `PixelSource` and its own transparency report, so I2's existence clause and
 * I5 are genuinely exercised rather than deferred.
 */

import sharp from "sharp"
import { scorePalette } from "../../../src/contract/index.ts"
import type { PixelAccessor, TransparencyReport } from "../../../src/contract/types.ts"
import { readJsonl } from "./lib.ts"

const HERE = new URL("./", import.meta.url).pathname

async function sourceOf(path: string): Promise<{ source: PixelAccessor; transparency: TransparencyReport }> {
	const image = sharp(path, { limitInputPixels: false })
	const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
	const ch = info.channels
	let transparent = 0
	if (ch === 4) {
		for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) transparent++
	}
	return {
		source: {
			width: info.width,
			height: info.height,
			getPixel: (x, y) => {
				const i = (y * info.width + x) * ch
				return [data[i]!, data[i + 1]!, data[i + 2]!]
			},
		},
		transparency: {
			hasAlphaChannel: ch === 4,
			hasTransparentPixels: transparent > 0,
			transparentFraction: transparent / (info.width * info.height),
		},
	}
}

for (const [label, path] of [
	["p2-alpha", `${HERE}out/alpha-demo20.jsonl`],
	["p2-tos", `${HERE}out/tos-demo20.jsonl`],
] as const) {
	const rows = (await readJsonl<any>(path)).filter((l) => l.kind === "devloop-run-row")
	const tally: Record<string, Record<string, number>> = {}
	const bump = (inv: string, status: string) => {
		;(tally[inv] ??= {})[status] = ((tally[inv] ??= {})[status] ?? 0) + 1
	}
	let validBare = 0
	let validSourced = 0
	const violations: string[] = []
	const deferredNames = new Map<string, number>()

	for (const row of rows) {
		const p = row.palette
		const bare = scorePalette(p)
		if (bare.result.valid) validBare++

		const { source, transparency } = await sourceOf(row.imagePath)
		const sourced = scorePalette(p, { source, transparency, throwOnTransparentInput: false })
		if (sourced.result.valid) validSourced++
		for (const inv of sourced.scorecard.invariants) bump(inv.invariant, inv.status)
		for (const v of sourced.result.violations)
			violations.push(`${row.imagePath.split("/").pop()}:${v.invariant}:${v.code}`)
		for (const d of sourced.result.deferred) deferredNames.set(d, (deferredNames.get(d) ?? 0) + 1)
	}

	console.log(
		JSON.stringify({
			check: "contract",
			candidate: label,
			rows: rows.length,
			validBare: validBare,
			validWithIndependentSource: validSourced,
			perInvariantWithSource: tally,
			deferredNames: Object.fromEntries([...deferredNames].sort()),
			violations: violations.slice(0, 10),
			violationCount: violations.length,
		}),
	)
}
