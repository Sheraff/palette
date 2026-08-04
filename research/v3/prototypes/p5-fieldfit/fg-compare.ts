/**
 * P5 field-fit — **the foreground experiment** (SPEC decision 13). Temporary; delete with the losing
 * branch once the orchestrator has picked.
 *
 * Usage, from `research/v3`:
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/fg-compare.ts <set.txt> [<set.txt> …]
 *
 * Decision 13's question is not answerable by argument. The foreground principle is *the artwork's
 * own ink, provided it registers* — round-2 item 7 wants the white title on a light field, where
 * `apca-max` reaches past it for the black shadows, and round-2 item 1's black **is** the artwork's
 * ink, which `apca-max` gets right. Two stated rules, both defensible, disagreeing on the evidence
 * covers. So this script runs the pipeline to the point where the two rules diverge and prints what
 * each would publish, per cover, with both quantities that decide it.
 *
 * **It changes nothing.** `candidate.ts` is untouched by this file and still ships
 * `DEFAULT_FOREGROUND_RULE`; the only thing here that is not already in the candidate is the second
 * call to `readOverlay` with the other rule selected.
 *
 * The pipeline up to the ramp is run **once** per cover and shared between the two readings, so any
 * difference in the table is the foreground rule and nothing else.
 */

import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { colorFromRgb, rgbToHex } from "../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../src/contract/constants.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "../../src/contract/invariants.ts"
import { minRawContrastOverRamp } from "../../src/contract/ramp.ts"
import type { GradientStop } from "../../src/contract/types.ts"
import { REPO_ROOT } from "../../src/devloop/run.ts"

import { decodeAndInventory, unpackRgb } from "./src/decode.ts"
import { explainedFractionByColors, fitField, NO_FIELD_EXPLAINED_FRACTION } from "./src/fieldfit.ts"
import { readOverlay } from "./src/overlay.ts"
import type { ForegroundRule } from "./src/overlay.ts"
import { highestFieldMassTriple, readRamp, twoBlockCandidates } from "./src/ramp.ts"
import { snapToArtwork } from "./src/snap.ts"

const RULES: readonly ForegroundRule[] = ["apca-max", "mass-led"]

type Row = Readonly<{
	cover: string
	picks: Readonly<Record<ForegroundRule, { hex: string; raw: number; mass: number } | null>>
	differ: boolean
}>

/**
 * The candidate's field path, up to and including the published ramp.
 *
 * Deliberately a transcription of `candidate.ts`'s first half rather than a call into it: `paletteOf`
 * returns a `Palette`, which has already thrown the overlay reading away, and the comparison needs
 * the ramp *before* the roles are chosen. Any drift between the two is a bug in this script and
 * shows up as a foreground that neither rule would have produced — which is why both picks are
 * printed with their measured quantities rather than as bare hexes.
 */
async function rampOf(imagePath: string) {
	const { raster, inventory } = await decodeAndInventory(imagePath)
	const fit = fitField(raster)
	const ramp = readRamp(fit, raster, inventory)

	let backgroundTarget = ramp.backgroundTarget
	let surfaceTarget = ramp.surfaceTarget
	let gradientCandidate = ramp.gradientCandidate
	if (fit.noField) {
		gradientCandidate = false
		const blocks = twoBlockCandidates(fit, raster, inventory)
		const rescued = blocks !== null && blocks.surface !== null &&
			explainedFractionByColors(raster, [blocks.background.lab, blocks.surface.lab]) >=
				NO_FIELD_EXPLAINED_FRACTION
		if (rescued && blocks?.surface) {
			backgroundTarget = blocks.background.lab
			surfaceTarget = blocks.surface.lab
		} else {
			const retreat = highestFieldMassTriple(fit, raster, inventory)
			backgroundTarget = retreat ? retreat.lab : backgroundTarget
			surfaceTarget = backgroundTarget
		}
	}

	const backgroundSnap = snapToArtwork(backgroundTarget, inventory, POOLED_SAME_COLOR_BAR)
	const surfaceSnap = surfaceTarget === backgroundTarget
		? backgroundSnap
		: snapToArtwork(surfaceTarget, inventory, POOLED_SAME_COLOR_BAR)
	const background = colorFromRgb(backgroundSnap.rgb)
	const snapped = colorFromRgb(surfaceSnap.rgb)
	const collapses = background.hex === snapped.hex ||
		// Same test `candidate.ts` makes, without re-importing its private helpers.
		Math.hypot(...backgroundSnap.lab.map((v, i) => v - surfaceSnap.lab[i])) === 0
	const surface = collapses ? background : snapped

	// Interior stops are not reconstructed: they move the ramp the floors are measured over by less
	// than the excursion bar, and no cover in either set carries one (`thirdStopAccepted` is false
	// across demo-20). Stated so the omission is a known simplification and not an oversight.
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		{ color: surface, position: 1 },
	]
	void gradientCandidate
	return { fit, raster, inventory, stops }
}

export async function compare(imagePaths: readonly string[]): Promise<Row[]> {
	const contrast = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)
	const rows: Row[] = []

	for (const imagePath of imagePaths) {
		const { fit, raster, inventory, stops } = await rampOf(imagePath)
		const picks: Record<ForegroundRule, { hex: string; raw: number; mass: number } | null> = {
			"apca-max": null,
			"mass-led": null,
		}
		for (const rule of RULES) {
			const reading = readOverlay(fit, raster, inventory, contrast, stops, { foregroundRule: rule })
			if (reading.foreground === null) {
				picks[rule] = null
				continue
			}
			const color = colorFromRgb(unpackRgb(reading.foreground.representative))
			const extremum = minRawContrastOverRamp(color, stops, 64, 64)
			picks[rule] = {
				hex: color.hex,
				raw: extremum === null ? Number.NaN : Math.abs(extremum.raw),
				mass: reading.foreground.overlayMass,
			}
		}
		rows.push({
			cover: imagePath.split("/").slice(-2).join("/"),
			picks,
			differ: picks["apca-max"]?.hex !== picks["mass-led"]?.hex,
		})
	}
	return rows
}

async function readSet(setPath: string): Promise<string[]> {
	const lines = (await readFile(resolve(setPath), "utf8")).split("\n")
	const paths: string[] = []
	for (const raw of lines) {
		const line = raw.trim()
		if (line === "" || line.startsWith("#")) continue
		paths.push(isAbsolute(line) ? line : resolve(REPO_ROOT, line))
	}
	return paths
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.length === 0) {
		process.stdout.write("usage: fg-compare.ts <set.txt> [<set.txt> …]\n")
		return 2
	}
	const imagePaths: string[] = []
	for (const setPath of argv) imagePaths.push(...(await readSet(setPath)))

	const rows = await compare(imagePaths)
	const cell = (pick: Row["picks"][ForegroundRule]) =>
		pick === null
			? "escape".padEnd(28)
			: `${pick.hex} raw ${pick.raw.toFixed(1).padStart(6)} mass ${pick.mass.toFixed(0).padStart(7)}`

	process.stdout.write(
		`${"cover".padEnd(45)} ${"apca-max".padEnd(30)} ${"mass-led".padEnd(30)} differ\n`,
	)
	for (const row of rows) {
		process.stdout.write(
			`${row.cover.padEnd(45)} ${cell(row.picks["apca-max"]).padEnd(30)} ${
				cell(row.picks["mass-led"]).padEnd(30)
			} ${row.differ ? "YES" : "."}\n`,
		)
	}
	const differing = rows.filter((row) => row.differ).length
	process.stdout.write(`\n${differing} of ${rows.length} covers differ\n`)
	return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2))
}
