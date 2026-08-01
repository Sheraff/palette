import { readdir } from "node:fs/promises"
import { resolve } from "node:path"

import { readJson, verdictsPath } from "../../v2-3-eval/src/shared.ts"
import type { BlindPalette, Role } from "../../v2-3-eval/src/shared.ts"
import { loadVerdicts } from "../../v2-3-eval/src/warehouse.ts"
import { okDistance, rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"
import { CONFIGURATIONS } from "./corpus.ts"

/**
 * Check each toggle's mover set against the adversarial review's *exact* stated predictions, and
 * classify every mover against the latest endorsed samples.
 *
 * The review's counterfactuals are all at the ranking layer (98% concordant with published output);
 * everything below is end to end, which is the bar this arm was set. Where the two disagree, the
 * end-to-end number is the measurement and the ranking-layer number is the prediction it failed.
 */

const roles: readonly Role[] = ["background", "surface", "foreground", "accent"]

function hexToOKLab(hex: string): OKLab {
	const value = Number.parseInt(hex.slice(1), 16)
	return rgbToOKLab([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])
}

type Winner = Readonly<Record<Role, string> & {
	gradient: boolean
	collapseSurface: boolean
	collapseAccent: boolean
	midpoint: string | null
}>

type Result = Readonly<{ image: string; strata: readonly string[]; verdict: string | null; winner: Winner }>

async function loadConfig(config: string): Promise<Map<string, Result>> {
	const root = resolve(import.meta.dirname, "data", config)
	const results = new Map<string, Result>()
	for (const file of (await readdir(root)).filter((name) => name.endsWith(".json")).sort()) {
		const result = await readJson<Result>(resolve(root, file))
		results.set(result.image, result)
	}
	return results
}

function displayKey(winner: Winner): string {
	return `${roles.map((role) => winner[role]).join(":")}:${winner.gradient ? "gradient" : "flat"}`
		+ `:${winner.collapseSurface}:${winner.collapseAccent}:${winner.midpoint ?? "none"}`
}

const records = await loadVerdicts(verdictsPath)
const byImage = new Map<string, typeof records>()
for (const record of records) {
	if (!byImage.has(record.image)) byImage.set(record.image, [])
	byImage.get(record.image)!.push(record)
}

type Sample = Readonly<{ kind: string; recordedAt: string; roles: Partial<Record<Role, string>> }>

function samples(image: string): Sample[] {
	const found: Sample[] = []
	for (const record of byImage.get(image) ?? []) {
		if (Object.keys(record.corrections).length > 0) {
			found.push({ kind: `correction/${record.batch}`, recordedAt: record.recordedAt, roles: record.corrections })
		}
		if (record.verdict !== "strong") continue
		for (const label of record.verdictApplies) {
			const palette = record.palettes[label] as BlindPalette | undefined
			if (!palette) continue
			found.push({
				kind: `endorsed/${record.batch}/${label}`,
				recordedAt: record.recordedAt,
				roles: Object.fromEntries(roles.map((role) => [role, palette[role].hex])) as Record<Role, string>,
			})
		}
	}
	return found
}

function cost(winner: Winner, sample: Sample): number {
	let total = 0
	let count = 0
	for (const role of roles) {
		const hex = sample.roles[role]
		if (hex === undefined) continue
		total += okDistance(hexToOKLab(winner[role]), hexToOKLab(hex)) * 100
		count += 1
	}
	return count === 0 ? Number.POSITIVE_INFINITY : total / count
}

/** The review's own REAL/COSMETIC readability line: max per-role dOKLab x100 >= 3. */
function visible(first: Winner, second: Winner): number {
	let worst = 0
	for (const role of roles) worst = Math.max(worst, okDistance(hexToOKLab(first[role]), hexToOKLab(second[role])) * 100)
	return worst
}

const baseline = await loadConfig("or-off")

/** Each toggle's mover set as the review predicted it, verbatim from `REVIEW.md`. */
const PREDICTIONS: Readonly<Record<string, { moves: readonly string[]; holds: readonly string[]; bound: string }>> = {
	"or-t1-envelope": {
		moves: [],
		holds: [],
		bound: "<= 2 artworks move; birdsofprey's promotion flips or its margin changes (A2)",
	},
	"or-t2-vocabulary": {
		moves: ["000285d1", "001102263870", "0011c0148119", "00079d5a", "horrorwood.jpg"],
		holds: ["havana.jpg", "slim.jpg", "johns.jpg", "000d5cdb", "000e91d6"],
		bound: "the 5 attributed artworks and <= 3 others; the 5 named guardrails all unchanged (A1)",
	},
	"or-t3-leximin": {
		moves: ["0002881a", "00066a61", "0005597105", "00113e35"],
		holds: [],
		bound: "exactly those 4 can move, and no others — the stage is unreachable elsewhere (A3)",
	},
}

for (const config of Object.keys(CONFIGURATIONS).filter((name) => name !== "or-off")) {
	const results = await loadConfig(config)
	const movers = [...results.values()]
		.filter((result) => displayKey(baseline.get(result.image)!.winner) !== displayKey(result.winner))
		.sort((first, second) => (first.image < second.image ? -1 : 1))
	const verdictMovers = movers.filter(({ strata }) => strata.includes("verdict"))
	process.stdout.write(`\n===== ${config}\n`)
	process.stdout.write(`movers: ${movers.length}/171 total, ${verdictMovers.length} verdict-carrying, `
		+ `${movers.filter(({ strata }) => strata.includes("scrambled")).length} scrambled, `
		+ `${movers.filter(({ strata }) => strata.includes("fixture")).length} fixture\n`)

	const prediction = PREDICTIONS[config]
	if (prediction) {
		process.stdout.write(`prediction: ${prediction.bound}\n`)
		const moved = new Set(movers.map(({ image }) => image))
		const matches = (needle: string, image: string): boolean => image.includes(needle)
		for (const needle of prediction.moves) {
			const hit = [...moved].some((image) => matches(needle, image))
			process.stdout.write(`  predicted MOVE ${needle.padEnd(16)} -> ${hit ? "moved OK" : "DID NOT MOVE (miss)"}\n`)
		}
		for (const needle of prediction.holds) {
			const hit = [...moved].some((image) => matches(needle, image))
			process.stdout.write(`  predicted HOLD ${needle.padEnd(16)} -> ${hit ? "MOVED (prediction broken)" : "held OK"}\n`)
		}
		const unpredicted = movers.filter(({ image, strata }) => strata.includes("verdict") &&
			!prediction.moves.some((needle) => matches(needle, image)))
		process.stdout.write(`  unpredicted verdict-carrying movers: ${unpredicted.length}\n`)
	}

	let fixes = 0
	let regressions = 0
	let neutral = 0
	let undecided = 0
	let cosmetic = 0
	for (const result of verdictMovers) {
		const before = baseline.get(result.image)!.winner
		const distance = visible(before, result.winner)
		const found = samples(result.image)
		if (found.length === 0) { undecided += 1; continue }
		const bestBefore = Math.min(...found.map((sample) => cost(before, sample)))
		const bestAfter = Math.min(...found.map((sample) => cost(result.winner, sample)))
		if (distance < 3) { cosmetic += 1; continue }
		if (bestAfter < bestBefore - 0.05) fixes += 1
		else if (bestAfter > bestBefore + 0.05) regressions += 1
		else neutral += 1
	}
	process.stdout.write(`verdict-carrying classification (REAL only, vs best endorsed sample): `
		+ `${fixes} FIX / ${regressions} REG / ${neutral} equal-cost / ${cosmetic} cosmetic / ${undecided} no-sample\n`)

	const gradientFlips = movers.filter(({ image, winner }) => baseline.get(image)!.winner.gradient !== winner.gradient)
	const collapseChanges = movers.filter(({ image, winner }) =>
		baseline.get(image)!.winner.collapseSurface !== winner.collapseSurface ||
		baseline.get(image)!.winner.collapseAccent !== winner.collapseAccent)
	const midpointChanges = movers.filter(({ image, winner }) => baseline.get(image)!.winner.midpoint !== winner.midpoint)
	process.stdout.write(`gradient neutrality: ${gradientFlips.length} flip(s) `
		+ `(${gradientFlips.map(({ image }) => image).join(", ") || "none"}); `
		+ `${collapseChanges.length} collapse change(s) (${collapseChanges.map(({ image }) => image).join(", ") || "none"}); `
		+ `${midpointChanges.length} midpoint change(s) (${midpointChanges.map(({ image }) => image).join(", ") || "none"})\n`)
}

// Joint composition: is the joint mover set exactly the union of the single-toggle sets?
const single = ["or-t1-envelope", "or-t2-vocabulary", "or-t3-leximin"]
const union = new Set<string>()
for (const config of single) {
	const results = await loadConfig(config)
	for (const [image, result] of results) {
		if (displayKey(baseline.get(image)!.winner) !== displayKey(result.winner)) union.add(image)
	}
}
const joint = await loadConfig("or-on")
const jointMovers = new Set([...joint.entries()]
	.filter(([image, result]) => displayKey(baseline.get(image)!.winner) !== displayKey(result.winner))
	.map(([image]) => image))
process.stdout.write(`\n===== joint composition\n`)
process.stdout.write(`union of single toggles: ${union.size}; joint movers: ${jointMovers.size}\n`)
const onlyUnion = [...union].filter((image) => !jointMovers.has(image)).sort()
const onlyJoint = [...jointMovers].filter((image) => !union.has(image)).sort()
process.stdout.write(`in a single toggle but NOT in joint (interaction cancels it): ${onlyUnion.join(", ") || "none"}\n`)
process.stdout.write(`in joint but in NO single toggle (interaction creates it): ${onlyJoint.join(", ") || "none"}\n`)
