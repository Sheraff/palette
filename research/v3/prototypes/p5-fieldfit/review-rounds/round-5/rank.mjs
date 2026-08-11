// Round-5 class ranking over the round-5 census (input-only statistics; no palette involved).
//
// EVERY RULE BELOW WAS WRITTEN INTO THIS FILE BEFORE ANY RANKING WAS READ, and this file was run to
// produce the selection recorded in STAGING.md. Reading the rules off this program rather than off
// the prose is the point.
//
// CROSS-CLASS RULE: classes resolve in the order 4, 5, 6, 7, 8. A cover SELECTED by an earlier class
// is removed from every later pool. (Round 4 also had to say "or nominated"; round 5 has no
// nomination path — every class here either selects or is recorded as empty.)
//
// ITEM 4 — vivid illustration. ROUND.md fixes the rule: round-2/3's photographic gate with its two
//   SHAPE terms INVERTED, i.e. round-4 §3.2's rule verbatim:
//     flatFrac >= 0.20  AND  topBinShare >= 0.15
//   rank survivors by vividFrac descending, take rank 1. The photo gate's third term
//   (distinctBins >= 500) is DROPPED, not inverted, exactly as round 4 stated: it is a busyness
//   gate and demanding busyness of a flat-fill illustration would contradict the two inverted terms.
//   MISS RISK, DISCLOSED IN ADVANCE AND NOT MITIGATED: round 4 ran this identical gate over this
//   identical pool and drew a near-solid colour field (distinctBins 6, detail 0.0018) rather than an
//   illustration; its STAGING §3.2 concluded that NEITHER the gate nor its inversion encodes
//   "illustration" and that the class needs a mark-level or edge-level statistic. Round 5 re-runs the
//   same gate on the same pool minus round-4's pick, so rank 1 here is round-4's runner-up promoted.
//   The probability of another miss is therefore high and known before the draw. ROUND.md accepts
//   that trade: the class gets either its first real instance or another recorded miss.
//
// ITEM 5 — two-component / panel. Round-3 §3.2's rule, verbatim (round 4 used it verbatim too, so
//   round-3 item 5, round-4 item 7 and round-5 item 5 are three comparable draws):
//     splitR2 >= 0.50  AND  splitDeltaE >= 0.15  AND  splitBalance >= 0.25
//   rank survivors by splitR2 descending, take rank 1.
//
// ITEM 6 — gradient-rich, ROUND.md's "high-chroma plane rule". Round-3 §3.6's rule, verbatim:
//     fieldMedianC >= 0.09  AND  fieldVectorPlaneR2 >= 0.60  AND  fieldVectorAmplitude >= 0.06
//   rank survivors by fieldMedianC descending, take rank 1. The three terms read "the field carries
//   real colour", "the field's OKLab vector varies as a plane, not as noise or panels" and "the
//   plane actually goes somewhere across the frame".
//
// ITEM 7 — WILDCARD A: ORDINARINESS. Round-4 §3.4's rule, verbatim, so the two draws are comparable.
//   Over the six statistics
//     fieldMedianL, fieldMedianC, flatFrac, detail, splitR2, vividFrac
//   compute each cover's percentile rank within the pool remaining at this point, score it
//     sum over the six of |percentile - 0.5|
//   and rank ascending (tie-break: stem ascending). Rank 1 is the cover closest to the middle of the
//   pool on all six axes at once — an artwork with no distinguishing property to blame a bad palette
//   on.
//
// ITEM 8 — WILDCARD B: DIVERSITY, and it is a DIFFERENT rule from item 7's by construction (item 7
//   maximises typicality within the pool; item 8 maximises distance from what the reviewer has
//   already been shown, which is a property of the review history, not of the pool). Rule:
//     over the twelve statistics
//       fieldMedianL, fieldMedianC, fieldBlockRange, flatFrac, topBinShare, distinctBins,
//       detail, textureIndex, splitR2, splitDeltaE, vividFrac, markLightShare
//     z-standardise each axis using the MEAN and SD of the pool remaining at this point, apply the
//     same pool mean/sd to the 20 covers rounds 1-4 actually SERVED (served-census.json), and for
//     each pool cover compute the MINIMUM Euclidean distance to any served cover in that space.
//     Rank DESCENDING on that minimum (tie-break: stem ascending), take rank 1.
//   Rank 1 is the pool's furthest cover from everything already served: max-min distance, so it
//   cannot be near ANY previously served cover rather than merely far from their average.
import fs from "node:fs"

const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const servedRows = JSON.parse(fs.readFileSync(process.argv[3], "utf8"))
const out = {}
const taken = new Set()
const avail = () => rows.filter((r) => !taken.has(r.stem))
const fmt = (r, keys) => Object.fromEntries(keys.map((k) => [k, typeof r[k] === "number" ? +r[k].toFixed(4) : r[k]]))

// ---- item 4
{
	const KEYS = ["vividFrac", "flatFrac", "topBinShare", "distinctBins", "meanC", "p90C", "fieldMedianL", "fieldMedianC", "detail"]
	const pool = avail()
	const survivors = pool.filter((r) => r.flatFrac >= 0.2 && r.topBinShare >= 0.15)
	survivors.sort((a, b) => b.vividFrac - a.vividFrac)
	out.item4 = {
		poolSize: pool.length,
		gatePool: survivors.length,
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		runnersUp: survivors.slice(1, 7).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	if (survivors[0]) taken.add(survivors[0].stem)
}

// ---- item 5
{
	const KEYS = ["splitR2", "splitDeltaE", "splitBalance", "splitAxis", "splitAt", "fieldBlockRange", "fieldMedianL", "fieldMedianC"]
	const pool = avail()
	const survivors = pool.filter((r) => r.splitR2 >= 0.5 && r.splitDeltaE >= 0.15 && r.splitBalance >= 0.25)
	survivors.sort((a, b) => b.splitR2 - a.splitR2)
	out.item5 = {
		poolSize: pool.length,
		gatePool: survivors.length,
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		runnersUp: survivors.slice(1, 7).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	if (survivors[0]) taken.add(survivors[0].stem)
}

// ---- item 6
{
	const KEYS = ["fieldMedianC", "fieldVectorPlaneR2", "fieldVectorAmplitude", "fieldPlaneR2", "fieldMedianL", "vividFrac", "flatFrac", "detail"]
	const pool = avail()
	const survivors = pool.filter((r) => r.fieldMedianC >= 0.09 && r.fieldVectorPlaneR2 >= 0.6 && r.fieldVectorAmplitude >= 0.06)
	survivors.sort((a, b) => b.fieldMedianC - a.fieldMedianC)
	out.item6 = {
		poolSize: pool.length,
		gatePool: survivors.length,
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		runnersUp: survivors.slice(1, 7).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	if (survivors[0]) taken.add(survivors[0].stem)
}

// ---- item 7 (wildcard A: ordinariness)
{
	const AXES = ["fieldMedianL", "fieldMedianC", "flatFrac", "detail", "splitR2", "vividFrac"]
	const KEYS = [...AXES, "topBinShare", "markLightShare", "textureIndex"]
	const pool = avail()
	const pct = {}
	for (const k of AXES) {
		const sorted = pool.map((r) => r[k]).sort((a, b) => a - b)
		pct[k] = (v) => {
			let lo = 0, hi = sorted.length
			while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m }
			return lo / (sorted.length - 1)
		}
	}
	const scored = pool.map((r) => ({ r, score: AXES.reduce((a, k) => a + Math.abs(pct[k](r[k]) - 0.5), 0) }))
	scored.sort((a, b) => a.score - b.score || (a.r.stem < b.r.stem ? -1 : 1))
	out.item7 = {
		poolSize: pool.length,
		selected: { path: scored[0].r.path, ordinarinessScore: +scored[0].score.toFixed(4), ...fmt(scored[0].r, KEYS) },
		runnersUp: scored.slice(1, 7).map((s) => ({ path: s.r.path, ordinarinessScore: +s.score.toFixed(4), ...fmt(s.r, KEYS) })),
	}
	taken.add(scored[0].r.stem)
}

// ---- item 8 (wildcard B: diversity from everything already served)
{
	const AXES = [
		"fieldMedianL", "fieldMedianC", "fieldBlockRange", "flatFrac", "topBinShare", "distinctBins",
		"detail", "textureIndex", "splitR2", "splitDeltaE", "vividFrac", "markLightShare",
	]
	const KEYS = [...AXES, "markFrac", "meanC"]
	const pool = avail()
	const mean = {}, sd = {}
	for (const k of AXES) {
		const v = pool.map((r) => r[k])
		mean[k] = v.reduce((a, b) => a + b, 0) / v.length
		sd[k] = Math.sqrt(v.reduce((a, b) => a + (b - mean[k]) ** 2, 0) / v.length) || 1
	}
	const z = (r) => AXES.map((k) => (r[k] - mean[k]) / sd[k])
	const servedZ = servedRows.map((r) => ({ stem: r.stem, v: z(r) }))
	const scored = pool.map((r) => {
		const v = z(r)
		let best = Infinity, nearest = null
		for (const s of servedZ) {
			let d = 0
			for (let i = 0; i < v.length; i++) d += (v[i] - s.v[i]) ** 2
			d = Math.sqrt(d)
			if (d < best) { best = d; nearest = s.stem }
		}
		return { r, minDistance: best, nearestServed: nearest }
	})
	scored.sort((a, b) => b.minDistance - a.minDistance || (a.r.stem < b.r.stem ? -1 : 1))
	out.item8 = {
		poolSize: pool.length,
		servedReferenceCount: servedRows.length,
		axes: AXES,
		selected: {
			path: scored[0].r.path,
			minDistanceToServed: +scored[0].minDistance.toFixed(4),
			nearestServed: scored[0].nearestServed,
			...fmt(scored[0].r, KEYS),
		},
		runnersUp: scored.slice(1, 7).map((s) => ({
			path: s.r.path,
			minDistanceToServed: +s.minDistance.toFixed(4),
			nearestServed: s.nearestServed,
			...fmt(s.r, KEYS),
		})),
		poolMedianMinDistance: +scored[Math.floor(scored.length / 2)].minDistance.toFixed(4),
	}
	taken.add(scored[0].r.stem)
}

fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
