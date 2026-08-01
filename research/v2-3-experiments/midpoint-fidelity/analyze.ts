import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

function hexToRGB(hex: string): RGB {
	const value = Number.parseInt(hex.slice(1), 16)
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

const { values } = parseArgs({ options: { dir: { type: "string" } }, strict: true })
const dir = values.dir ?? resolve(import.meta.dirname, "data/probe")

type Row = {
	key: string; rank: number | null; bg: string; surface: string; mid: string
	chordDeviation: number; minimumChordDeviation: number; chordPass: boolean
	endpointDeltaE: number; deltaEPass: boolean; deltaEToBg: number; deltaEToSurface: number
	lightnessExcursion: number; lightnessBetween: boolean
	bandPopulationFraction: number; occupancyShare: number; spatialSpreadRatio: number
}
type Probe = {
	image: string; familyBinStep: number
	published: {
		key: string; gradient: boolean; background: string; surface: string
		foreground: string; accent: string; midpoint: string | null
		midpointKind: string; midpointOrigin: string | null
	}
	publishedRow: Row | null
	routeB: Record<string, number>
	rows: Row[]
	pathRows: {
		hypothesisId: string | null; eligible: boolean; rejectionReasons: string[]
		stageCount: number; acceptedIntermediateCount: number
		stages: {
			stageIndex: number; hex: string; spatialPosition: number; colorPosition: number
			populationFraction: number; directPathDifference: number
			spatialHalfwayDelta: number; colorHalfwayDelta: number
			spatialPass: boolean; colorPass: boolean; directPass: boolean
		}[]
	}[]
}

const files = (await readdir(dir)).filter((name) => name.endsWith(".json") && !name.startsWith("_")).sort()
const probes: { name: string; probe: Probe }[] = []
for (const file of files) {
	probes.push({ name: file.replace(/\.json$/u, ""), probe: JSON.parse(await readFile(resolve(dir, file), "utf8")) })
}

function short(name: string): string {
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]{24})/u.exec(name)
	return match ? match[1].slice(0, 8) : name.replace(/\.(jpe?g|png|webp|avif)$/iu, "")
}

function lightnessExcursion(midHex: string, bgHex: string, surfaceHex: string): number {
	const l = (hex: string): number => rgbToOKLab(hexToRGB(hex))[0]
	const mid = l(midHex)
	const low = Math.min(l(bgHex), l(surfaceHex))
	const high = Math.max(l(bgHex), l(surfaceHex))
	return mid < low ? low - mid : mid > high ? mid - high : 0
}

console.log(`## Corpus: ${probes.length} artworks (shared checkout, unscrambled)\n`)

// ---- 1. Route B guard accounting ------------------------------------------------------------------
let total = 0, chordPass = 0, bothPass = 0, killedByDeltaE = 0, killedByChord = 0
let chordPassOutside = 0, bothPassOutside = 0
const zeroSurvivors: string[] = []
for (const { name, probe } of probes) {
	total += probe.routeB.total
	chordPass += probe.routeB.chordPass
	bothPass += probe.routeB.bothPass
	killedByDeltaE += probe.routeB.killedByDeltaE
	killedByChord += probe.routeB.total - probe.routeB.chordPass
	chordPassOutside += probe.routeB.chordPassLightnessOutside
	bothPassOutside += probe.routeB.bothPassLightnessOutside
	if (probe.routeB.chordPass > 0 && probe.routeB.bothPass === 0) zeroSurvivors.push(short(name))
}
console.log(`### 1. Route B (field-midpoint-band) guard accounting, all gradient candidates`)
console.log(`candidates carrying midpoint evidence : ${total}`)
console.log(`  killed by chord-deviation guard     : ${killedByChord} (${(100 * killedByChord / total).toFixed(1)}%)`)
console.log(`  pass chord deviation                : ${chordPass}`)
console.log(`  also pass dE>=3.3 distinctness      : ${bothPass}`)
console.log(`  killed by distinctness alone        : ${killedByDeltaE} (${(100 * killedByDeltaE / chordPass).toFixed(1)}% of chord-passers)`)
console.log(`artworks where distinctness kills 100% of chord-passers: ${zeroSurvivors.length}`)
if (zeroSurvivors.length > 0) console.log(`  ${zeroSurvivors.join(", ")}`)
console.log(`chord-passing candidates whose midpoint is OUTSIDE the endpoints' lightness span: ${chordPassOutside} (${(100 * chordPassOutside / chordPass).toFixed(1)}%)`)
console.log(`both-passing (survivors) outside the span: ${bothPassOutside} (${(100 * bothPassOutside / bothPass).toFixed(1)}%)\n`)

// ---- 2. Gradient winners --------------------------------------------------------------------------
const gradientWinners = probes.filter(({ probe }) => probe.published.gradient)
const withMidpoint = gradientWinners.filter(({ probe }) => probe.published.midpoint !== null)
console.log(`### 2. Published gradient winners`)
console.log(`gradient winners: ${gradientWinners.length} of ${probes.length}`)
console.log(`  publish a midpoint : ${withMidpoint.length}`)
console.log(`  no midpoint        : ${gradientWinners.length - withMidpoint.length}`)
const byOrigin = new Map<string, number>()
for (const { probe } of withMidpoint) {
	const origin = probe.published.midpointOrigin ?? "?"
	byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + 1)
}
console.log(`  midpoint origins   : ${[...byOrigin].map(([k, v]) => `${k}=${v}`).join(", ")}\n`)

console.log(`### 2b. Gradient winners with NO midpoint — which guard suppressed it`)
console.log(`| artwork | bg | surface | band mid | chordDev/bar | min dE | dE bar pass | L-excursion |`)
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- |`)
for (const { name, probe } of gradientWinners) {
	if (probe.published.midpoint !== null) continue
	const row = probe.publishedRow
	if (!row) {
		console.log(`| ${short(name)} | ${probe.published.background} | ${probe.published.surface} | (no band evidence) | - | - | - | - |`)
		continue
	}
	console.log(`| ${short(name)} | ${row.bg} | ${row.surface} | ${row.mid} | ${row.chordDeviation.toFixed(4)}/${row.minimumChordDeviation.toFixed(2)} ${row.chordPass ? "pass" : "KILL"} | ${row.endpointDeltaE.toFixed(2)} | ${row.deltaEPass ? "pass" : "KILL"} | ${row.lightnessExcursion === 0 ? "inside" : `+${row.lightnessExcursion.toFixed(4)}`} |`)
}
console.log()

// ---- 3. Monotonicity of published midpoints -------------------------------------------------------
console.log(`### 3. Lightness betweenness of PUBLISHED midpoints`)
console.log(`| artwork | bg | mid | surface | L(bg) | L(mid) | L(surf) | excursion | origin |`)
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`)
let outside = 0
for (const { name, probe } of withMidpoint) {
	const { background, surface, midpoint } = probe.published
	const excursion = lightnessExcursion(midpoint!, background, surface)
	if (excursion > 0) outside += 1
	const l = (hex: string): string => rgbToOKLab(hexToRGB(hex))[0].toFixed(3)
	console.log(`| ${short(name)} | ${background} | ${midpoint} | ${surface} | ${l(background)} | ${l(midpoint!)} | ${l(surface)} | ${excursion === 0 ? "-" : excursion.toFixed(4)} | ${probe.published.midpointOrigin} |`)
}
console.log(`\npublished midpoints outside their endpoints' lightness span: ${outside} of ${withMidpoint.length}\n`)

// ---- 4. Route A chord-position guard --------------------------------------------------------------
console.log(`### 4. Route A (transition-path-stage) intermediate-stage guards`)
let stages = 0, spatialKill = 0, colorKill = 0, directKill = 0, accepted = 0, colorOnlyKill = 0
for (const { probe } of probes) {
	for (const path of probe.pathRows) {
		for (const stage of path.stages) {
			stages += 1
			if (!stage.spatialPass) spatialKill += 1
			if (!stage.colorPass) colorKill += 1
			if (!stage.directPass) directKill += 1
			if (stage.spatialPass && stage.colorPass && stage.directPass) accepted += 1
			if (stage.spatialPass && !stage.colorPass && stage.directPass) colorOnlyKill += 1
		}
	}
}
console.log(`candidate intermediate stages: ${stages}`)
console.log(`  fail spatial-halfway (|s-0.5|>0.2)      : ${spatialKill}`)
console.log(`  fail COLOR-halfway   (|c-0.5|>0.2)      : ${colorKill}   <- the chord-position heuristic`)
console.log(`  fail direct-path difference (>=binStep) : ${directKill}`)
console.log(`  accepted                                : ${accepted}`)
console.log(`  killed by the colour-position rule ALONE: ${colorOnlyKill}\n`)
