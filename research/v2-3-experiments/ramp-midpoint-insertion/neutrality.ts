import { readdirSync, readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import type { Measurement } from "./measure.ts"

/**
 * Flag-off against flag-on, over the same corpus, from two real sweeps.
 *
 * §4 of `EXPERIMENT.md` argues gradient neutrality structurally — `applyRampMidpoint` runs after the
 * gradient decision and cannot reach it. This is the empirical check on that argument: it compares two
 * sweeps taken with `RAMP_MIDPOINT_INSERTION` genuinely flipped in the source, and reports every role
 * colour, gradient boolean and midpoint that differs. A structural argument that no measurement backs
 * is a claim, not a result.
 *
 *   node --experimental-strip-types neutrality.ts <off-dir> <on-dir>
 */

const here = resolve(fileURLToPath(import.meta.url), "..")
const [offName = "ranked", onName = "flag-on"] = process.argv.slice(2)
const load = (name: string): Map<string, Measurement> => {
	const dir = resolve(here, "data", name)
	if (!existsSync(dir)) throw new Error(`missing sweep directory ${dir}`)
	return new Map(readdirSync(dir).filter((file) => file.endsWith(".json"))
		.map((file) => JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Measurement)
		.map((measurement) => [measurement.image, measurement]))
}

const off = load(offName)
const on = load(onName)

const lines: string[] = []
const say = (text = ""): void => { lines.push(text) }

const missing = [...off.keys()].filter((image) => !on.has(image))
if (missing.length > 0) say(`NOT IN THE FLAG-ON SWEEP (${missing.length}): ${missing.join(", ")}`)

let compared = 0
let gradientChanges = 0
let roleChanges = 0
const midpointChanges: string[] = []
for (const [image, before] of off) {
	const after = on.get(image)
	if (!after) continue
	compared += 1
	if (before.gradient !== after.gradient) {
		gradientChanges += 1
		say(`GRADIENT CHANGED ${image}: ${before.gradient} -> ${after.gradient}`)
	}
	if (before.background !== after.background || before.surface !== after.surface
		|| before.foreground !== after.foreground || before.accent !== after.accent) {
		roleChanges += 1
		say(`ROLES CHANGED ${image}: ${[before.background, before.surface, before.foreground, before.accent].join("/")} `
			+ `-> ${[after.background, after.surface, after.foreground, after.accent].join("/")}`)
	}
	if (before.publishedMidpoint !== after.publishedMidpoint) {
		midpointChanges.push(`${image}: ${before.publishedMidpoint ?? "none"} (${before.publishedMidpointOrigin ?? "—"}) `
			+ `-> ${after.publishedMidpoint ?? "none"} (${after.publishedMidpointOrigin ?? "—"}), `
			+ `${before.background} -> ${after.surface === before.surface ? before.surface : after.surface}, `
			+ `excursion ${before.excursionBefore.toFixed(2)}`)
	}
}

say()
say(`compared ${compared} artworks (${offName} vs ${onName})`)
say(`gradient booleans changed: ${gradientChanges}`)
say(`gradients flag off: ${[...off.values()].filter(({ gradient }) => gradient).length} · `
	+ `flag on: ${[...on.values()].filter(({ gradient }) => gradient).length}`)
say(`role colours changed:      ${roleChanges}`)
say(`midpoints changed:         ${midpointChanges.length}`)
for (const change of midpointChanges) say(`  ${change}`)
say(`midpoints flag off: ${[...off.values()].filter(({ publishedMidpoint }) => publishedMidpoint !== null).length} · `
	+ `flag on: ${[...on.values()].filter(({ publishedMidpoint }) => publishedMidpoint !== null).length}`)

process.stdout.write(`${lines.join("\n")}\n`)
