/**
 * Read `decompose.json` and answer: which term of `signatureScore` actually separates the
 * reviewer's wanted accent family from the published one? Pure arithmetic, reads no image.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const data = JSON.parse(readFileSync(resolve(import.meta.dirname, "decompose.json"), "utf8"))
const rows = data.filter((d: any) => d.wanted && d.published)

const TERMS = [
	["coherentSupport", 0.25],
	["componentCoherence", 0.18],
	["repeatedSupport", 0.16],
	["distinctive", 0.22],
	["chromaticTrunk", 0.11],
	["notBroad", 0.08],
] as const

function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Exact two-sided sign test. */
function signTest(deltas: number[]): { neg: number; pos: number; p: number } {
	const neg = deltas.filter((d) => d < 0).length
	const pos = deltas.filter((d) => d > 0).length
	const n = neg + pos
	if (n === 0) return { neg, pos, p: 1 }
	const k = Math.min(neg, pos)
	const choose = (a: number, b: number) => {
		let r = 1
		for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
		return r
	}
	let tail = 0
	for (let i = 0; i <= k; i++) tail += choose(n, i)
	return { neg, pos, p: Math.min(1, 2 * tail / 2 ** n) }
}

process.stdout.write(`n = ${rows.length} salience cases with both families resolved\n\n`)

process.stdout.write("=== Per-term: wanted minus published (raw term value, then weighted) ===\n")
process.stdout.write(["term", "w", "medWanted", "medPub", "medDelta", "medWxDelta", "neg/pos", "p"].join("\t") + "\n")
const contributions: { term: string; weighted: number }[] = []
for (const [term, weight] of TERMS) {
	const wantedValues = rows.map((r: any) => r.wanted[term])
	const publishedValues = rows.map((r: any) => r.published[term])
	const deltas = rows.map((r: any) => r.wanted[term] - r.published[term])
	const test = signTest(deltas)
	const medDelta = median(deltas)
	contributions.push({ term, weighted: weight * medDelta })
	process.stdout.write([
		term, weight, median(wantedValues).toFixed(3), median(publishedValues).toFixed(3),
		medDelta.toFixed(3), (weight * medDelta).toFixed(4),
		`${test.neg}/${test.pos}`, test.p.toFixed(4),
	].join("\t") + "\n")
}

process.stdout.write("\n=== Ranked by how much the term holds the wanted family DOWN ===\n")
for (const c of [...contributions].sort((a, b) => a.weighted - b.weighted)) {
	process.stdout.write(`${c.term.padEnd(20)} ${c.weighted >= 0 ? "+" : ""}${c.weighted.toFixed(4)}\n`)
}

const sigDeltas = rows.map((r: any) => r.wanted.signatureScoreReported - r.published.signatureScoreReported)
const roleDeltas = rows.map((r: any) => r.wanted.sigRoleTrunk - r.published.sigRoleTrunk)
const obsDeltas = rows.map((r: any) => r.wanted.signatureAccentObservation - r.published.signatureAccentObservation)
process.stdout.write(`\nsignatureScore          med Δ ${median(sigDeltas).toFixed(4)}  ${JSON.stringify(signTest(sigDeltas))}\n`)
process.stdout.write(`signatureAccentObs      med Δ ${median(obsDeltas).toFixed(4)}  ${JSON.stringify(signTest(obsDeltas))}\n`)
process.stdout.write(`signatureRoleScore      med Δ ${median(roleDeltas).toFixed(4)}  ${JSON.stringify(signTest(roleDeltas))}\n`)

process.stdout.write("\n=== Chroma ceiling vs the fixed 0.18 scale ===\n")
const ceilings = data.map((d: any) => d.chromaCeiling)
process.stdout.write(`ceilings: min ${Math.min(...ceilings).toFixed(4)} med ${median(ceilings).toFixed(4)} max ${Math.max(...ceilings).toFixed(4)}\n`)
process.stdout.write(`ratio ceiling/0.18: min ${(Math.min(...ceilings) / 0.18).toFixed(2)} med ${(median(ceilings) / 0.18).toFixed(2)} max ${(Math.max(...ceilings) / 0.18).toFixed(2)}\n`)
const trunkSat = rows.filter((r: any) => r.wanted.chromaticTrunk >= 1).length
process.stdout.write(`wanted family saturates chroma/0.18 at 1.0 in ${trunkSat}/${rows.length} cases\n`)
const pubSat = rows.filter((r: any) => r.published.chromaticTrunk >= 1).length
process.stdout.write(`published family saturates chroma/0.18 at 1.0 in ${pubSat}/${rows.length} cases\n`)

process.stdout.write("\n=== Lane rank movement under relative normalisation ===\n")
let better = 0, worse = 0, same = 0
for (const r of data) {
	if (!r.wanted) continue
	const d = r.wanted.laneRankRelative - r.wanted.laneRankTrunk
	if (d < 0) better++; else if (d > 0) worse++; else same++
}
process.stdout.write(`wanted lane rank: ${better} better, ${same} unchanged, ${worse} worse\n`)
const inTrunk = data.filter((r: any) => r.wanted?.inLaneTrunk).length
const inRel = data.filter((r: any) => r.wanted?.inLaneRelative).length
process.stdout.write(`wanted family inside the top-16 signature lane: trunk ${inTrunk}/19, relative ${inRel}/19\n`)

process.stdout.write("\n=== Per-case detail: wanted vs published, dominant suppressor ===\n")
process.stdout.write(["idx", "art", "laneW", "laneP", "cohW", "cohP", "chrW", "chrP", "disW", "disP", "obsW", "obsP"].join("\t") + "\n")
for (const r of rows) {
	process.stdout.write([
		r.idx, r.image.slice(16, 24), r.wanted.laneRankTrunk, r.published.laneRankTrunk,
		r.wanted.coherentSupport.toFixed(2), r.published.coherentSupport.toFixed(2),
		r.wanted.chromaticTrunk.toFixed(2), r.published.chromaticTrunk.toFixed(2),
		r.wanted.distinctive.toFixed(2), r.published.distinctive.toFixed(2),
		r.wanted.signatureAccentObservation.toFixed(2), r.published.signatureAccentObservation.toFixed(2),
	].join("\t") + "\n")
}
