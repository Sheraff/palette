import { readdir } from "node:fs/promises"
import { resolve } from "node:path"

import { readJson, verdictsPath } from "../../v2-3-eval/src/shared.ts"
import type { BlindPalette, Role } from "../../v2-3-eval/src/shared.ts"
import { loadVerdicts } from "../../v2-3-eval/src/warehouse.ts"
import type { VerdictRecord } from "../../v2-3-eval/src/warehouse.ts"
import { okDistance, rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { CONFIGURATIONS } from "./corpus.ts"

function hexToOKLab(hex: string): OKLab {
	const value = Number.parseInt(hex.slice(1), 16)
	return rgbToOKLab([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])
}

/**
 * Diff every configuration against `or-off` and attribute each mover against the latest verdict.
 *
 * All comparisons are on the *published* winner (four role hexes, gradient flag, both collapse
 * flags, source-supported midpoint) — end to end, not at the ranking layer.
 */

const roles: readonly Role[] = ["background", "surface", "foreground", "accent"]

type Winner = Readonly<{
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapseSurface: boolean
	collapseAccent: boolean
	midpoint: string | null
}>

type Result = Readonly<{
	config: string
	image: string
	strata: readonly string[]
	verdict: string | null
	winner: Winner
}>

async function loadConfig(config: string): Promise<Map<string, Result>> {
	const root = resolve(import.meta.dirname, "data", config)
	const files = (await readdir(root)).filter((name) => name.endsWith(".json")).sort()
	const results = new Map<string, Result>()
	for (const file of files) {
		const result = await readJson<Result>(resolve(root, file))
		results.set(result.image, result)
	}
	return results
}

/** Max per-role OKLab distance, on the review's `x100` scale: `>= 3` is REAL, below it COSMETIC. */
function maxRoleDistance(first: Winner, second: Winner): number {
	let worst = 0
	for (const role of roles) worst = Math.max(worst, okDistance(hexToOKLab(first[role]), hexToOKLab(second[role])) * 100)
	return worst
}

function changedFields(first: Winner, second: Winner): string[] {
	const changed: string[] = []
	for (const role of roles) if (first[role] !== second[role]) changed.push(role)
	if (first.gradient !== second.gradient) changed.push("gradient")
	if (first.collapseSurface !== second.collapseSurface) changed.push("collapse.surface")
	if (first.collapseAccent !== second.collapseAccent) changed.push("collapse.accent")
	if (first.midpoint !== second.midpoint) changed.push("midpoint")
	return changed
}

function paletteKey(winner: Winner): string {
	return `${winner.background}:${winner.surface}:${winner.foreground}:${winner.accent}:`
		+ `${winner.gradient ? "gradient" : "flat"}`
}

/**
 * Every palette a human endorsed for one artwork, as an equally valid target (eval README, section
 * 6): a `strong` verdict endorses the palettes in `verdictApplies`, and a correction is a palette
 * the reviewer assembled by hand. Both are samples, never oracles.
 */
type Endorsement = Readonly<{ kind: string; batch: string; recordedAt: string; roles: Partial<Record<Role, string>> }>

function endorsements(records: readonly VerdictRecord[]): Endorsement[] {
	const found: Endorsement[] = []
	for (const record of records) {
		if (Object.keys(record.corrections).length > 0) {
			found.push({ kind: "correction", batch: record.batch, recordedAt: record.recordedAt, roles: record.corrections })
		}
		if (record.verdict !== "strong") continue
		for (const label of record.verdictApplies) {
			const palette = record.palettes[label] as BlindPalette | undefined
			if (!palette) continue
			found.push({
				kind: `endorsed(${label})`,
				batch: record.batch,
				recordedAt: record.recordedAt,
				roles: Object.fromEntries(roles.map((role) => [role, palette[role].hex])) as Record<Role, string>,
			})
		}
	}
	return found
}

/** Mean per-role OKLab distance over the roles the endorsement actually set, `x100`. */
function endorsementCost(winner: Winner, endorsement: Endorsement): number {
	let total = 0
	let count = 0
	for (const role of roles) {
		const hex = endorsement.roles[role]
		if (hex === undefined) continue
		total += okDistance(hexToOKLab(winner[role]), hexToOKLab(hex)) * 100
		count += 1
	}
	return count === 0 ? Number.POSITIVE_INFINITY : total / count
}

const records = await loadVerdicts(verdictsPath)
const byImage = new Map<string, VerdictRecord[]>()
for (const record of records) {
	if (!byImage.has(record.image)) byImage.set(record.image, [])
	byImage.get(record.image)!.push(record)
}

const baseline = await loadConfig("or-off")
const configs = Object.keys(CONFIGURATIONS).filter((name) => name !== "or-off")

process.stdout.write(`baseline or-off: ${baseline.size} image(s)\n`)

for (const config of configs) {
	const results = await loadConfig(config)
	const movers: { image: string; result: Result; before: Winner }[] = []
	for (const [image, result] of results) {
		const before = baseline.get(image)
		if (!before) {
			process.stdout.write(`  MISSING BASELINE ${image}\n`)
			continue
		}
		if (paletteKey(before.winner) !== paletteKey(result.winner) ||
			before.winner.midpoint !== result.winner.midpoint ||
			before.winner.collapseSurface !== result.winner.collapseSurface ||
			before.winner.collapseAccent !== result.winner.collapseAccent) {
			movers.push({ image, result, before: before.winner })
		}
	}
	movers.sort((first, second) => (first.image < second.image ? -1 : 1))
	process.stdout.write(`\n########## ${config}: ${movers.length} mover(s) of ${results.size}\n`)
	for (const { image, result, before } of movers) {
		const distance = maxRoleDistance(before, result.winner)
		const visibility = distance >= 3 ? "REAL" : "COSMETIC"
		process.stdout.write(`\n- ${image}  [${result.strata.join("+")}]  verdict=${result.verdict ?? "none"}  `
			+ `${visibility} dOKLab=${distance.toFixed(1)}  changed=${changedFields(before, result.winner).join(",")}\n`)
		process.stdout.write(`    off : ${paletteKey(before)}${before.midpoint ? ` mid=${before.midpoint}` : ""}\n`)
		process.stdout.write(`    ${config.padEnd(4)}: ${paletteKey(result.winner)}`
			+ `${result.winner.midpoint ? ` mid=${result.winner.midpoint}` : ""}\n`)
		const found = endorsements(byImage.get(image) ?? [])
		if (found.length === 0) {
			process.stdout.write(`    no endorsed sample on record\n`)
			continue
		}
		const scored = found.map((endorsement) => ({
			endorsement,
			beforeCost: endorsementCost(before, endorsement),
			afterCost: endorsementCost(result.winner, endorsement),
		})).sort((first, second) => first.afterCost - second.afterCost)
		const bestBefore = Math.min(...scored.map(({ beforeCost }) => beforeCost))
		const bestAfter = Math.min(...scored.map(({ afterCost }) => afterCost))
		const direction = bestAfter < bestBefore - 0.05 ? "TOWARD endorsed"
			: bestAfter > bestBefore + 0.05 ? "AWAY from endorsed" : "neutral"
		process.stdout.write(`    best endorsed cost: off ${bestBefore.toFixed(2)} -> ${config} `
			+ `${bestAfter.toFixed(2)}  ${direction}\n`)
		for (const { endorsement, beforeCost, afterCost } of scored.slice(0, 4)) {
			process.stdout.write(`      ${endorsement.kind} ${endorsement.batch} `
				+ `(${endorsement.recordedAt.slice(0, 10)}): ${roles.map((role) => endorsement.roles[role] ?? "----").join(" ")} `
				+ `| off ${beforeCost.toFixed(2)} -> ${afterCost.toFixed(2)}\n`)
		}
	}
}
