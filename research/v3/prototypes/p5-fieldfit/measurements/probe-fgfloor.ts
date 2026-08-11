/**
 * W-M1 probe 2 (ruling R3) — blast radius of raising the foreground floor 15 → 20.
 *
 * The override is probe-level and touches no file: `overlay.ts` computes the effective floor as
 * `max(contrast.minTextContrast.effectiveRawMagnitude, FOREGROUND_MIN_RAW_APCA)`, and the contract's
 * `lcFloorToRawMagnitude` is exactly `|Lc| + APCA_LC_TO_RAW_OFFSET` above the dead band. So an Lc
 * request of 17.3 resolves to raw 20.000 and the effective foreground floor becomes 20 — the caller
 * path the constant's own doc-comment names ("a caller can raise it and cannot lower it"). Selection
 * is the only thing that moves: `minTextContrast` is read in exactly two places in the prototype,
 * this gate and the margin report.
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/probe-fgfloor.ts
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { analyzeImage } from "../candidate.ts"
import { DEFAULT_CONTRAST_PARAMETERS } from "../../../src/contract/invariants.ts"
import { APCA_LC_TO_RAW_OFFSET } from "../../../src/contract/constants.ts"

const REPO_ROOT = resolve(import.meta.dirname, "../../../../..")
const SETS = ["demo-20", "p5-round2-fresh", "p5-round3-fresh", "p5-round4-fresh"]

const covers: string[] = []
for (const set of SETS) {
	const text = readFileSync(resolve(REPO_ROOT, `research/v3/data/devloop/sets/${set}.txt`), "utf8")
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed === "" || trimmed.startsWith("#")) continue
		if (!covers.includes(trimmed)) covers.push(trimmed)
	}
}

type Reading = {
	fg: string
	minRawApca: number
	mass: number | null
	class: string | null
	source: string | null
	escape: string | null
	accent: string
	admissibleAtFloor: { hex: string; class: string; mass: number; apca: number }[]
}

async function read(path: string): Promise<Reading> {
	const analysis = await analyzeImage(resolve(REPO_ROOT, path))
	const chosen = analysis.assignment?.chosen ?? null
	return {
		fg: analysis.palette.roles.foreground.hex,
		minRawApca: Number(
			analysis.diagnostics.margins.foregroundLegibility.minRawApca.toFixed(3),
		),
		mass: chosen === null ? null : Number(chosen.foreground.mass.toFixed(1)),
		class: chosen?.foreground.foregroundClass ?? null,
		source: chosen?.foreground.source ?? null,
		escape: analysis.palette.escape?.color ?? null,
		accent: analysis.palette.roles.accent.hex,
		admissibleAtFloor: (analysis.assignment?.foregroundShortlist ?? []).map((c) => ({
			hex: c.color.hex,
			class: c.foregroundClass,
			mass: Number(c.mass.toFixed(1)),
			apca: Number(c.legibility.toFixed(2)),
		})),
	}
}

const results: { cover: string; before: Reading; after: Reading }[] = []
for (const cover of covers) {
	DEFAULT_CONTRAST_PARAMETERS.minTextContrast = 0
	const before = await read(cover)
	DEFAULT_CONTRAST_PARAMETERS.minTextContrast = 20 - APCA_LC_TO_RAW_OFFSET
	const after = await read(cover)
	DEFAULT_CONTRAST_PARAMETERS.minTextContrast = 0
	results.push({ cover, before, after })
	process.stderr.write(
		`${cover.split("/")[1]?.slice(-12)}  ${before.fg}@${before.minRawApca} -> ${after.fg}@${after.minRawApca}${
			before.fg === after.fg ? "" : "   *** CHANGED"
		}\n`,
	)
}

process.stdout.write(JSON.stringify({ coverCount: covers.length, results }, null, 2))
