// Track B comparison: before/after table plus per-role OKLab movement.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/compare.ts <before> <after> [...after]

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { rgbToOKLab, okDistance } from "../../v2-3/src/internal/color.ts"
import type { CaseRecord } from "./run-cases.ts"

function load(label: string): Map<string, CaseRecord> {
	const path = resolve(import.meta.dirname, `results-${label}.json`)
	return new Map((JSON.parse(readFileSync(path, "utf8")) as CaseRecord[]).map((record) => [record.caseId, record]))
}

function toRgb(hex: string): [number, number, number] {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
}

function movement(first: string, second: string): number {
	return okDistance(rgbToOKLab(toRgb(first)), rgbToOKLab(toRgb(second)))
}

const [beforeLabel, ...afterLabels] = process.argv.slice(2)
const before = load(beforeLabel)
const roles = ["background", "surface", "foreground", "accent"] as const

for (const afterLabel of afterLabels) {
	const after = load(afterLabel)
	console.log(`\n=== ${beforeLabel} -> ${afterLabel} ===`)
	let changed = 0
	let gradientFlips = 0
	let midpointChanges = 0
	for (const [caseId, second] of [...after.entries()].sort()) {
		const first = before.get(caseId)
		if (!first) continue
		const deltas = roles.map((role) => movement(first[role], second[role]))
		const maximumDelta = Math.max(...deltas)
		const identical = roles.every((role) => first[role] === second[role]) &&
			first.gradient === second.gradient && first.midpoint === second.midpoint
		if (identical) continue
		changed += 1
		if (first.gradient !== second.gradient) gradientFlips += 1
		if (first.midpoint !== second.midpoint) midpointChanges += 1
		console.log(`${caseId.padEnd(18)} maxRoleDelta=${maximumDelta.toFixed(4)}`)
		for (const [index, role] of roles.entries()) {
			if (first[role] === second[role]) continue
			console.log(`   ${role.padEnd(11)} ${first[role]} -> ${second[role]}  (dE=${deltas[index].toFixed(4)})`)
		}
		if (first.gradient !== second.gradient) console.log(`   gradient    ${first.gradient} -> ${second.gradient}  <<< BOOLEAN FLIP`)
		if (first.midpoint !== second.midpoint) console.log(`   midpoint    ${first.midpoint ?? "-"} -> ${second.midpoint ?? "-"}`)
	}
	console.log(`-- ${changed} case(s) changed, ${gradientFlips} gradient boolean flip(s), ${midpointChanges} midpoint change(s)`)
}
