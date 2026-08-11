// Round-4 class ranking over the round-4 census (input-only statistics; no palette involved).
//
// EVERY RULE BELOW WAS WRITTEN INTO THIS FILE BEFORE ANY RANKING WAS READ, and this file was run
// exactly once to produce the selection recorded in STAGING.md.
//
// CROSS-CLASS RULE: classes resolve in the order 5, 6, 7, 8. A cover SELECTED OR NOMINATED by an
// earlier class is removed from every later pool. ("Nominated" covers the item-5 near-miss: if the
// orchestrator later rules the near-miss into slot 5, no other slot can already be holding it.)
//
// ITEM 5 — light field with light text. Round-3 §3.4's statistic, UNRELAXED and tightened on the
//   field terms exactly as ROUND.md's staging brief fixes them:
//     fieldMedianL >= 0.75  AND  fieldMedianC <= 0.06  AND  markLightShare >= 0.60
//   rank survivors by markLightShare descending, tie-break fieldMedianL descending, take rank 1.
//   If the pool is empty: report the measured maximum markLightShare among covers passing the two
//   FIELD terms, and NOMINATE (never silently select) the highest such cover above 0.50. A nominee
//   is not a pick; it goes to ITEM5-QUESTION.md and slot 5 stays empty pending the orchestrator.
//
// ITEM 6 — vivid illustration. Round-2/3's "photographic gate" INVERTED on its two shape terms,
//   which is the whole point: that gate's flatFrac/topBinShare terms encode continuous-tone-and-
//   unconcentrated, and round-3 §3.3 recorded that it therefore drew an illustration anyway. The
//   inversion asks for the opposite shape on purpose — flat fills and a dominant colour:
//     flatFrac >= 0.20  AND  topBinShare >= 0.15
//   rank survivors by vividFrac descending, take rank 1.
//   The photo gate's third term (`distinctBins >= 500`) is DROPPED, not inverted, and this is
//   stated rather than quiet: it is a busyness gate, and requiring busyness of a flat-fill
//   illustration would contradict the two inverted terms rather than sharpen them.
//
// ITEM 7 — two-component / panel. Round-3 §3.2's rule, verbatim, so round-3 item 5 and round-4
//   item 7 are comparable draws:
//     splitR2 >= 0.50  AND  splitDeltaE >= 0.15  AND  splitBalance >= 0.25
//   rank survivors by splitR2 descending, take rank 1.
//
// ITEM 8 — wildcard, MY STATED CHOICE: the pool's most ORDINARY cover. ROUND.md calls slot 8 a
//   drift check, and every other slot in this round is an extreme of some statistic, so an extreme
//   would answer a question the round already asks four times. Rule: over the six statistics
//     fieldMedianL, fieldMedianC, flatFrac, detail, splitR2, vividFrac
//   compute each cover's percentile rank within the pool remaining at this point, score it
//     sum over the six of |percentile - 0.5|
//   and rank ascending (tie-break: stem ascending). Rank 1 is the cover closest to the middle of
//   the pool on all six axes at once — an artwork with no distinguishing property to blame a bad
//   palette on.
import fs from "node:fs"

const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const out = {}
const taken = new Set()
const avail = () => rows.filter((r) => !taken.has(r.stem))
const fmt = (r, keys) => Object.fromEntries(keys.map((k) => [k, typeof r[k] === "number" ? +r[k].toFixed(4) : r[k]]))

// ---- item 5
{
	const KEYS = ["fieldMedianL", "fieldMedianC", "markLightShare", "markFrac", "flatFrac", "topBinShare", "vividFrac", "splitR2"]
	const pool = avail()
	const fieldOk = pool.filter((r) => r.fieldMedianL >= 0.75 && r.fieldMedianC <= 0.06)
	const survivors = fieldOk.filter((r) => r.markLightShare >= 0.6)
	survivors.sort((a, b) => b.markLightShare - a.markLightShare || b.fieldMedianL - a.fieldMedianL)
	fieldOk.sort((a, b) => b.markLightShare - a.markLightShare || b.fieldMedianL - a.fieldMedianL)
	out.item5 = {
		poolSize: pool.length,
		termSurvivors: {
			"fieldMedianL>=0.75": pool.filter((r) => r.fieldMedianL >= 0.75).length,
			"fieldMedianC<=0.06": pool.filter((r) => r.fieldMedianC <= 0.06).length,
			"markLightShare>=0.60": pool.filter((r) => r.markLightShare >= 0.6).length,
			"fieldMedianL>=0.75 AND fieldMedianC<=0.06": fieldOk.length,
			"all three": survivors.length,
		},
		maxMarkLightShareAmongLightNeutralFields: fieldOk.length ? +fieldOk[0].markLightShare.toFixed(4) : null,
		maxMarkLightShareInWholePool: +Math.max(...pool.map((r) => r.markLightShare)).toFixed(4),
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		nominee:
			!survivors.length && fieldOk.length && fieldOk[0].markLightShare > 0.5
				? { path: fieldOk[0].path, ...fmt(fieldOk[0], KEYS) }
				: null,
		top: fieldOk.slice(0, 8).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	// NOTE (disclosed in STAGING.md): the first run of this file added the claimed cover's FILE NAME
	// here while `taken` is compared against `stem` (no extension), so the item-5 nominee was not
	// actually withheld from classes 6-8 on that run. Fixed below and re-run; the selection is
	// byte-identical either way because none of classes 6-8 ranked the nominee anywhere near rank 1.
	const claim = out.item5.selected ?? out.item5.nominee
	if (claim) taken.add(claim.path.split("/")[1].replace(/\.[a-z0-9]+$/i, ""))
}

// ---- item 6
{
	const KEYS = ["vividFrac", "flatFrac", "topBinShare", "distinctBins", "meanC", "p90C", "fieldMedianL", "fieldMedianC", "detail"]
	const pool = avail()
	const survivors = pool.filter((r) => r.flatFrac >= 0.2 && r.topBinShare >= 0.15)
	survivors.sort((a, b) => b.vividFrac - a.vividFrac)
	out.item6 = {
		poolSize: pool.length,
		gatePool: survivors.length,
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		runnersUp: survivors.slice(1, 7).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	if (survivors[0]) taken.add(survivors[0].stem)
}

// ---- item 7
{
	const KEYS = ["splitR2", "splitDeltaE", "splitBalance", "splitAxis", "splitAt", "fieldBlockRange", "fieldMedianL", "fieldMedianC"]
	const pool = avail()
	const survivors = pool.filter((r) => r.splitR2 >= 0.5 && r.splitDeltaE >= 0.15 && r.splitBalance >= 0.25)
	survivors.sort((a, b) => b.splitR2 - a.splitR2)
	out.item7 = {
		poolSize: pool.length,
		gatePool: survivors.length,
		selected: survivors[0] ? { path: survivors[0].path, ...fmt(survivors[0], KEYS) } : null,
		runnersUp: survivors.slice(1, 7).map((r) => ({ path: r.path, ...fmt(r, KEYS) })),
	}
	if (survivors[0]) taken.add(survivors[0].stem)
}

// ---- item 8
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
	out.item8 = {
		poolSize: pool.length,
		selected: { path: scored[0].r.path, ordinarinessScore: +scored[0].score.toFixed(4), ...fmt(scored[0].r, KEYS) },
		runnersUp: scored.slice(1, 7).map((s) => ({ path: s.r.path, ordinarinessScore: +s.score.toFixed(4), ...fmt(s.r, KEYS) })),
	}
	taken.add(scored[0].r.stem)
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
