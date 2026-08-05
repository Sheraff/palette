// Input-only census over coverage-set-1, for round-3 items 4-8 selection.
// Extends round-2/select-fresh-covers.mjs with the statistics the five round-3 classes need.
// Decodes each candidate at 64x64 and reports OKLab field statistics.
// NOTHING here calls the candidate algorithm; no palette is produced or read.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const WT = "/Users/Flo/GitHub/palette/.worktrees/p5-fieldfit"
const MAIN = "/Users/Flo/GitHub/palette"
const require_ = createRequire(WT + "/package.json")
const sharp = require_("sharp")

const cov = JSON.parse(fs.readFileSync(MAIN + "/research/v3/data/coverage-set/coverage-set-1.json", "utf8"))
const holdout = JSON.parse(fs.readFileSync(MAIN + "/research/v3/data/holdout/holdout.json", "utf8"))
const holdoutIds = new Set(holdout.artworks.map((a) => a.id))
const holdoutPaths = new Set([
	...holdout.artworks.flatMap((a) => (a.files ?? []).map((f) => f.path)),
	...holdout.artworks.map((a) => a.bestRenditionPath).filter(Boolean),
])

const demoSet = fs
	.readFileSync(WT + "/research/v3/data/devloop/sets/demo-20.txt", "utf8")
	.split("\n")
	.map((l) => l.trim())
	.filter((l) => l && !l.startsWith("#"))
const stem = (p) => path.basename(p).replace(/\.[a-z0-9]+$/i, "")
// spotify-style ids: first 16 hex encode the rendition size, the trailing 24 identify the artwork
const artKey = (p) => {
	const s = stem(p)
	return /^ab67616d[0-9a-f]{32}$/.test(s) ? s.slice(-24) : s
}
// round-2's two fresh covers (items 7 and 8) — no cover may be drawn twice across rounds
const round2Fresh = [
	"14/ab67616d0000b2730014816eee85382bf569f953",
	"08/ab67616d00001e0200083d2741c5ebb948ee7f1b",
]
const seenKeys = new Set([...demoSet, ...round2Fresh].map(artKey))

function srgbToOklab(r8, g8, b8) {
	const f = (u) => {
		const c = u / 255
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	const r = f(r8), g = f(g8), b = f(b8)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

const N = 64
async function stats(abs) {
	// `.removeAlpha()` BEFORE the resize. Round 2's census indexed the raw buffer at stride 3
	// unconditionally, which silently misread every RGBA PNG in the pool (sharp returns 4 channels,
	// and the resize premultiplies). The prototype's own decoder reads `info.channels` and ignores
	// alpha (`prototypes/p5-fieldfit/src/decode.ts:97-101`); dropping alpha first is the faithful
	// 64x64 analogue of that. `info.channels` is asserted below so a future format cannot re-open
	// the same hole quietly.
	const { data, info } = await sharp(abs)
		.removeAlpha()
		.resize(N, N, { fit: "fill" })
		.toColorspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })
	if (info.channels !== 3) throw new Error(`expected 3 channels after removeAlpha, got ${info.channels} for ${abs}`)
	const L = new Float64Array(N * N)
	const A = new Float64Array(N * N)
	const Bc = new Float64Array(N * N)
	const C = new Float64Array(N * N)
	const bins = new Set()
	for (let i = 0; i < N * N; i++) {
		const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]
		const [ll, aa, bb] = srgbToOklab(r, g, b)
		L[i] = ll
		A[i] = aa
		Bc[i] = bb
		C[i] = Math.hypot(aa, bb)
		bins.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4))
	}
	const sorted = (arr) => Float64Array.from(arr).sort()
	const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]
	const Ls = sorted(L), Cs = sorted(C)
	const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
	// affine (plane) fit of L over normalized x,y — the "is the field a ramp" proxy
	let sxx = 0, syy = 0, sxy = 0, sxL = 0, syL = 0
	const mx = (N - 1) / 2, mL = mean(L)
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		const i = y * N + x, dx = (x - mx) / N, dy = (y - mx) / N, dL = L[i] - mL
		sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxL += dx * dL; syL += dy * dL
	}
	const det = sxx * syy - sxy * sxy
	const bx = det === 0 ? 0 : (syy * sxL - sxy * syL) / det
	const by = det === 0 ? 0 : (sxx * syL - sxy * sxL) / det
	let ssRes = 0, ssTot = 0
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		const i = y * N + x, dx = (x - mx) / N, dy = (y - mx) / N
		const pred = mL + bx * dx + by * dy
		ssRes += (L[i] - pred) ** 2
		ssTot += (L[i] - mL) ** 2
	}
	// flat-region fraction: share of pixels whose 4-neighbourhood is perceptually identical.
	// Vector/illustrated covers are mostly flat fills; continuous-tone photographs are not.
	let flat = 0
	for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
		const i = y * N + x
		const d = Math.max(
			Math.abs(L[i] - L[i - 1]), Math.abs(L[i] - L[i + 1]),
			Math.abs(L[i] - L[i - N]), Math.abs(L[i] - L[i + N]),
			Math.abs(C[i] - C[i - 1]), Math.abs(C[i] - C[i + 1]),
			Math.abs(C[i] - C[i - N]), Math.abs(C[i] - C[i + N]),
		)
		if (d < 0.01) flat++
	}
	const flatFrac = flat / ((N - 2) * (N - 2))
	// share of the single most common 4-bit RGB bin
	const binCount = new Map()
	for (let i = 0; i < N * N; i++) {
		const r = data[i * 3] >> 4, g = data[i * 3 + 1] >> 4, b = data[i * 3 + 2] >> 4
		const k = (r << 8) | (g << 4) | b
		binCount.set(k, (binCount.get(k) ?? 0) + 1)
	}
	const topBinShare = Math.max(...binCount.values()) / (N * N)
	// mean |dL| between 4-neighbours — texture/detail proxy
	let det4 = 0, cnt = 0
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		const i = y * N + x
		if (x + 1 < N) { det4 += Math.abs(L[i] - L[i + 1]); cnt++ }
		if (y + 1 < N) { det4 += Math.abs(L[i] - L[i + N]); cnt++ }
	}
	// ---- robust FIELD statistics: 16x16 blocks of 4x4 px, per-block median L / chroma.
	// A block median rejects overlay text and small marks, so the plane fit below reads the
	// background field rather than what is printed on top of it.
	const B = 16, S = N / B
	const bl = [], bc = [], ba = [], bb_ = []
	for (let by2 = 0; by2 < B; by2++) for (let bx2 = 0; bx2 < B; bx2++) {
		const vs = [], cs = [], as = [], bs = []
		for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
			const i = (by2 * S + y) * N + (bx2 * S + x)
			vs.push(L[i]); cs.push(C[i]); as.push(A[i]); bs.push(Bc[i])
		}
		vs.sort((a, b) => a - b); cs.sort((a, b) => a - b)
		as.sort((a, b) => a - b); bs.sort((a, b) => a - b)
		bl.push(vs[vs.length >> 1]); bc.push(cs[cs.length >> 1])
		ba.push(as[as.length >> 1]); bb_.push(bs[bs.length >> 1])
	}
	const mBL = mean(bl)
	let fxx = 0, fyy = 0, fxy = 0, fxL = 0, fyL = 0
	const mb = (B - 1) / 2
	for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
		const i = y * B + x, dx = (x - mb) / B, dy = (y - mb) / B, dL = bl[i] - mBL
		fxx += dx * dx; fyy += dy * dy; fxy += dx * dy; fxL += dx * dL; fyL += dy * dL
	}
	const fdet = fxx * fyy - fxy * fxy
	const fbx = fdet === 0 ? 0 : (fyy * fxL - fxy * fyL) / fdet
	const fby = fdet === 0 ? 0 : (fxx * fyL - fxy * fxL) / fdet
	let fRes = 0, fTot = 0
	for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
		const i = y * B + x, dx = (x - mb) / B, dy = (y - mb) / B
		fRes += (bl[i] - (mBL + fbx * dx + fby * dy)) ** 2
		fTot += (bl[i] - mBL) ** 2
	}
	const blS = Float64Array.from(bl).sort()
	const bcS = Float64Array.from(bc).sort()

	// ================= round-3 additions =================

	// (i) VECTOR field-plane fit: independent affine fits of block-median L, a and b over x,y.
	//     fieldVectorPlaneR2 pools the three residual sums against the three total sums, so a field
	//     that ramps in HUE or CHROMA at near-constant lightness still reads as a ramp (the L-only
	//     fit above misses those). fieldVectorAmplitude is the OKLab distance the fitted vector
	//     plane travels corner-to-corner across the frame.
	const fitPlane = (v) => {
		const mv = mean(v)
		let axx = 0, ayy = 0, axy = 0, axv = 0, ayv = 0
		for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
			const i = y * B + x, dx = (x - mb) / B, dy = (y - mb) / B, dv = v[i] - mv
			axx += dx * dx; ayy += dy * dy; axy += dx * dy; axv += dx * dv; ayv += dy * dv
		}
		const d = axx * ayy - axy * axy
		const gx = d === 0 ? 0 : (ayy * axv - axy * ayv) / d
		const gy = d === 0 ? 0 : (axx * ayv - axy * axv) / d
		let res = 0, tot = 0
		for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
			const i = y * B + x, dx = (x - mb) / B, dy = (y - mb) / B
			res += (v[i] - (mv + gx * dx + gy * dy)) ** 2
			tot += (v[i] - mv) ** 2
		}
		return { gx, gy, res, tot }
	}
	const pL = fitPlane(bl), pA = fitPlane(ba), pB = fitPlane(bb_)
	const vecTot = pL.tot + pA.tot + pB.tot
	const vecRes = pL.res + pA.res + pB.res
	const span = (B - 1) / B
	const fieldVectorAmplitude = Math.hypot(
		(Math.abs(pL.gx) + Math.abs(pL.gy)) * span,
		(Math.abs(pA.gx) + Math.abs(pA.gy)) * span,
		(Math.abs(pB.gx) + Math.abs(pB.gy)) * span,
	)

	// (ii) BLOCK-SCALE detail vs PIXEL-SCALE detail. blockDetail is the mean |dL| between
	//      neighbouring block medians (structure at field scale); `detail` above is the same at
	//      pixel scale. textureIndex = detail / blockDetail is high when the frame carries a lot of
	//      fine variation that the field-scale structure does not explain — brushwork, grain, weave.
	let bDet = 0, bCnt = 0
	for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
		const i = y * B + x
		if (x + 1 < B) { bDet += Math.abs(bl[i] - bl[i + 1]); bCnt++ }
		if (y + 1 < B) { bDet += Math.abs(bl[i] - bl[i + B]); bCnt++ }
	}
	const blockDetail = bDet / bCnt
	const detail = det4 / cnt
	const textureIndex = blockDetail <= 1e-9 ? 0 : detail / blockDetail

	// (iii) PANEL split: the best straight horizontal or vertical cut through the block grid.
	//       splitR2 is the share of block-median (L,a,b) variance that the two-side means explain;
	//       splitDeltaE is the OKLab distance between the two side means; splitBalance is the
	//       smaller side's share of blocks. A poster split into two colour panels scores high on
	//       all three; a continuous photograph does not.
	let best = { splitR2: 0, splitDeltaE: 0, splitBalance: 0, splitAxis: null, splitAt: 0 }
	{
		const mA = mean(ba), mB2 = mean(bb_)
		let tot = 0
		for (let i = 0; i < B * B; i++) tot += (bl[i] - mBL) ** 2 + (ba[i] - mA) ** 2 + (bb_[i] - mB2) ** 2
		for (const axis of ["h", "v"]) for (let cut = 1; cut < B; cut++) {
			let n1 = 0, s1 = [0, 0, 0], s2 = [0, 0, 0]
			for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
				const i = y * B + x
				const first = axis === "h" ? y < cut : x < cut
				const t = first ? s1 : s2
				t[0] += bl[i]; t[1] += ba[i]; t[2] += bb_[i]
				if (first) n1++
			}
			const n2 = B * B - n1
			if (n1 === 0 || n2 === 0) continue
			const c1 = s1.map((v) => v / n1), c2 = s2.map((v) => v / n2)
			let res = 0
			for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
				const i = y * B + x
				const c = (axis === "h" ? y < cut : x < cut) ? c1 : c2
				res += (bl[i] - c[0]) ** 2 + (ba[i] - c[1]) ** 2 + (bb_[i] - c[2]) ** 2
			}
			const r2 = tot === 0 ? 0 : 1 - res / tot
			if (r2 > best.splitR2) {
				best = {
					splitR2: r2,
					splitDeltaE: Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]),
					splitBalance: Math.min(n1, n2) / (B * B),
					splitAxis: axis,
					splitAt: cut / B,
				}
			}
		}
	}

	// (iv) MARKS against the field: a pixel is a mark when it departs from its own block's median L
	//      by >= 0.05. markFrac is how much of the frame is marks; markLightShare is the share of
	//      those marks that are LIGHTER than the field they sit on. Light text on a light field is
	//      exactly markLightShare near 1 at a high fieldMedianL.
	let marks = 0, lightMarks = 0
	for (let by2 = 0; by2 < B; by2++) for (let bx2 = 0; bx2 < B; bx2++) {
		const m = bl[by2 * B + bx2]
		for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
			const i = (by2 * S + y) * N + (bx2 * S + x)
			const d = L[i] - m
			if (Math.abs(d) >= 0.05) { marks++; if (d > 0) lightMarks++ }
		}
	}
	const markFrac = marks / (N * N)
	const markLightShare = marks === 0 ? 0 : lightMarks / marks

	return {
		flatFrac, topBinShare,
		fieldMedianL: blS[blS.length >> 1],
		fieldMedianC: bcS[bcS.length >> 1],
		fieldPlaneR2: fTot === 0 ? 0 : 1 - fRes / fTot,
		// peak-to-peak of the fitted plane across the frame, in OKLab L
		fieldPlaneAmplitude: (Math.abs(fbx) + Math.abs(fby)) * (B - 1) / B,
		fieldBlockRange: blS[blS.length - 1] - blS[0],
		meanL: mean(L), p05L: q(Ls, 0.05), p95L: q(Ls, 0.95),
		meanC: mean(C), p90C: q(Cs, 0.9),
		vividFrac: C.reduce((a, c) => a + (c >= 0.12 ? 1 : 0), 0) / C.length,
		planeR2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
		planeSlope: Math.hypot(bx, by),
		distinctBins: bins.size,
		detail,
		// round-3 additions
		fieldVectorPlaneR2: vecTot === 0 ? 0 : 1 - vecRes / vecTot,
		fieldVectorAmplitude,
		blockDetail,
		textureIndex,
		...best,
		markFrac,
		markLightShare,
	}
}

const rows = []
let skippedHoldout = 0, skippedSeen = 0, skippedMissing = 0
for (const a of cov.artworks) {
	if (holdoutIds.has(a.artworkId) || holdoutPaths.has(a.path)) { skippedHoldout++; continue }
	if (seenKeys.has(artKey(a.path))) { skippedSeen++; continue }
	const wt = path.join(WT, a.path)
	if (!fs.existsSync(wt)) { skippedMissing++; continue }
	const s = await stats(wt)
	rows.push({ path: a.path, stem: stem(a.path), collection: a.collection, role: a.role, cluster: a.cluster, ...s })
}
fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1))
console.log(
	"census rows:", rows.length, "of", cov.artworks.length,
	"| skipped holdout:", skippedHoldout,
	"seen(demo-20+round-2):", skippedSeen,
	"unreachable:", skippedMissing,
)
