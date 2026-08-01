/**
 * The accent evidence channel — derivation measurement.
 *
 * For every STANDING salience ask, rebuild each family's `signatureScore` terms and evaluate a
 * set of *derived* accent-path score forms. Each form is a structural transplant of the role
 * classifier's own `accentRaw` (role-obligations.ts:249-255) onto `signatureScore`'s terms; none
 * carries a fitted constant.
 *
 * Scored by the only thing that matters at the three quality sites: does the accent-path score
 * rank the reviewer's wanted family ABOVE the family the algorithm published?
 *
 * CORPUS: real artwork only, via `probe.ts::resolveArtwork` (shared checkout; refuses decoys).
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/accent-evidence/analysis/accent-decompose.ts
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { buildNativePaletteEvidence } from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { familyAccentRoleEvidence } from "../../../v2-3/src/internal/role-obligations.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { SALIENCE } from "./salience-set.ts"

sharp.concurrency(1)

const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))

/** Re-derived from the live warehouse by `standing-asks.ts` at arm start (2026-08-01, 287 records). */
const SUPERSEDED = new Set([132, 135, 178, 240])
/** The sr-batch adjudication: the human PREFERRED the prescribed accent on these. */
const MANDATE = new Set([96, 102, 140, 164, 175, 205, 216])
/** Out of scope per the mandate: completeness / arrangement concepts, not accent evidence. */
const OUT_OF_SCOPE = new Set([209, 210])

type Terms = {
	id: string
	coherentSupport: number
	componentCoherence: number
	repeatedSupport: number
	distinctive: number
	chromatic: number
	chromaticRelative: number
	notBroad: number
	observation: number
	markSupport: number
	support: number
	reported: number
	populationFraction: number
	largestComponentFraction: number
	/** the role classifier's own accent score, `accentRaw * (0.50 + 0.50 * coherentSupport)` */
	accentRoleScore: number
	accentRaw: number
	accentSupport: number
}

/**
 * Candidate accent-path evidence scores. Every weight is quoted from an existing site:
 *   accentRaw     = 0.29 compact + 0.24 repetition + 0.25 chroma + 0.14 localContrast
 *                   + 0.08 signatureObservation,   gated by (0.50 + 0.50 * support)
 *   signatureScore= 0.25 coherentSupport + 0.18 componentCoherence + 0.16 repeatedSupport
 *                   + 0.22 distinctive + 0.11 chromatic + 0.08 notBroad
 * The outer wrapper is `signatureRoleScore`'s own 0.55 / 0.45 in every case.
 */
const FORMS: Record<string, (t: Terms) => number> = {
	// what ships today: signatureAccentRoleScore (markSupport repairs the population ratio)
	trunk: (t) => clamp(0.55 * clamp(t.reported + 0.25 * (Math.max(t.coherentSupport, t.markSupport) - t.coherentSupport)) +
		0.45 * t.observation),
	// A — full accentRaw transplant onto signatureScore's terms, accentRaw's own support gate
	A: (t) => clamp(0.55 * (clamp(0.29 * t.componentCoherence + 0.24 * t.repeatedSupport +
		0.25 * t.chromatic + 0.14 * t.distinctive + 0.08 * t.observation) * (0.50 + 0.50 * t.support)) +
		0.45 * t.observation),
	// B — as A, chroma normalised by the artwork's own ceiling (the measured salience statistic)
	B: (t) => clamp(0.55 * (clamp(0.29 * t.componentCoherence + 0.24 * t.repeatedSupport +
		0.25 * t.chromaticRelative + 0.14 * t.distinctive + 0.08 * t.observation) * (0.50 + 0.50 * t.support)) +
		0.45 * t.observation),
	// C — signatureScore, but the accent role's two structural corrections only:
	//     coherentSupport leaves the additive sum and becomes accentRaw's gate;
	//     chroma takes accentRaw's 0.25 in place of signatureScore's 0.11.
	//     The freed 0.25 - 0.14 = 0.11 stays unallocated (the sum is renormalised by its own mass).
	C: (t) => {
		const mass = 0.18 + 0.16 + 0.25 + 0.22 + 0.08
		const raw = clamp((0.18 * t.componentCoherence + 0.16 * t.repeatedSupport +
			0.25 * t.chromatic + 0.22 * t.distinctive + 0.08 * t.notBroad) / mass)
		return clamp(0.55 * (raw * (0.50 + 0.50 * t.support)) + 0.45 * t.observation)
	},
	// D — as C with relative chroma
	D: (t) => {
		const mass = 0.18 + 0.16 + 0.25 + 0.22 + 0.08
		const raw = clamp((0.18 * t.componentCoherence + 0.16 * t.repeatedSupport +
			0.25 * t.chromaticRelative + 0.22 * t.distinctive + 0.08 * t.notBroad) / mass)
		return clamp(0.55 * (raw * (0.50 + 0.50 * t.support)) + 0.45 * t.observation)
	},
	// E — the mandate's literal reading: coherentSupport AND repeatedSupport both leave the
	//     additive sum (the accent's job description asks for neither big blob nor recurrence);
	//     support returns as accentRaw's gate; chroma takes accentRaw's 0.25.
	//     Remaining mass renormalised: 0.18 coherence + 0.22 distinctive + 0.25 chroma + 0.08 notBroad
	E: (t) => {
		const mass = 0.18 + 0.22 + 0.25 + 0.08
		const raw = clamp((0.18 * t.componentCoherence + 0.22 * t.distinctive +
			0.25 * t.chromatic + 0.08 * t.notBroad) / mass)
		return clamp(0.55 * (raw * (0.50 + 0.50 * t.support)) + 0.45 * t.observation)
	},
	// F — as E with relative chroma (the measured salience statistic)
	F: (t) => {
		const mass = 0.18 + 0.22 + 0.25 + 0.08
		const raw = clamp((0.18 * t.componentCoherence + 0.22 * t.distinctive +
			0.25 * t.chromaticRelative + 0.08 * t.notBroad) / mass)
		return clamp(0.55 * (raw * (0.50 + 0.50 * t.support)) + 0.45 * t.observation)
	},
	// G — accentRaw's exact five weights, but `repetition` read as the region-observation term
	//     it actually is in role-obligations.ts (signatureAccentObservation), not as a
	//     count-of-big-components; i.e. accentRaw with signatureScore's available proxies and
	//     no population-shaped term at all.
	G: (t) => clamp(0.55 * (clamp((0.29 * t.componentCoherence + 0.25 * t.chromatic +
		0.14 * t.distinctive + 0.08 * t.observation) / (0.29 + 0.25 + 0.14 + 0.08)) *
		(0.50 + 0.50 * t.support)) + 0.45 * t.observation),
	// H — THE DERIVED ONE. No transplant at all: ask the role classifier its own accent question
	//     (`familyAccentRoleEvidence`, i.e. `accentRaw * (0.50 + 0.50 * coherentSupport)`) and wrap
	//     it in `signatureRoleScore`'s own 0.55 / 0.45. Not one weight is chosen here.
	H: (t) => clamp(0.55 * t.accentRoleScore + 0.45 * t.observation),
	// H0 — the same score with no wrapper, as a sensitivity control on the 0.55/0.45 half.
	H0: (t) => t.accentRoleScore,
}

const results: any[] = []
const tally: Record<string, { mandate: number; standing: number; hold: number }> = {}
for (const k of Object.keys(FORMS)) tally[k] = { mandate: 0, standing: 0, hold: 0 }

for (const kase of SALIENCE) {
	const path = resolveArtwork(kase.image)
	if (!path) { results.push({ idx: kase.idx, error: "unresolved" }); continue }
	const image = await loadNativeImage(path)
	const evidence = buildNativePaletteEvidence(image)
	const families = evidence.families as any[]
	const ceiling = Math.max(...families.map((f) => f.chroma))

	const own = (hex: string): string | null => {
		const lab = rgbToOKLab(hexToRgb(hex))
		for (const f of families) if (f.representatives.some((r: any) => r.hex.toLowerCase() === hex.toLowerCase())) return f.id
		let best = Infinity, bestId: string | null = null
		for (const f of families) { const d = okDistance(lab, f.prototype); if (d < best) { best = d; bestId = f.id } }
		return bestId
	}
	const wantedId = own(kase.prescribed)
	const publishedId = own(kase.published)

	const terms = new Map<string, Terms>()
	for (const f of families) {
		const coherentSupport = clamp(f.largestComponentFraction / 0.002)
		const accent = familyAccentRoleEvidence(f)
		terms.set(f.id, {
			accentRoleScore: accent.score,
			accentRaw: accent.raw,
			accentSupport: accent.support,
			id: f.id,
			coherentSupport,
			componentCoherence: clamp(f.familyConcentration),
			repeatedSupport: clamp((f.repeatedComponentCount - 1) / 3),
			distinctive: clamp(f.localContrast / 0.16),
			chromatic: clamp(f.chroma / 0.18),
			chromaticRelative: ceiling > 0 ? clamp(f.chroma / ceiling) : 0,
			notBroad: 1 - clamp((f.populationFraction - 0.18) / 0.35),
			observation: f.signatureAccentObservation,
			markSupport: f.markSupport,
			support: Math.max(coherentSupport, f.markSupport),
			reported: f.signatureScore,
			populationFraction: f.populationFraction,
			largestComponentFraction: f.largestComponentFraction,
		})
	}
	const w = wantedId ? terms.get(wantedId)! : null
	const p = publishedId ? terms.get(publishedId)! : null

	const row: any = {
		idx: kase.idx, image: kase.image, ceiling,
		standing: !SUPERSEDED.has(kase.idx), mandate: MANDATE.has(kase.idx), outOfScope: OUT_OF_SCOPE.has(kase.idx),
		wantedId, publishedId, sameFamily: wantedId === publishedId,
		wantedPop: w?.populationFraction, wantedLcf: w?.largestComponentFraction,
		wantedCoherent: w?.coherentSupport, wantedRepeated: w?.repeatedSupport, wantedMark: w?.markSupport,
		forms: {} as any,
	}
	for (const [name, fn] of Object.entries(FORMS)) {
		const sw = w ? fn(w) : NaN
		const sp = p ? fn(p) : NaN
		// rank of wanted among all families under this form
		const ranked = [...terms.values()].map((t) => ({ id: t.id, s: fn(t) }))
			.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
		const rank = ranked.findIndex((r) => r.id === wantedId) + 1
		const beats = sw > sp
		row.forms[name] = { wanted: sw, published: sp, delta: sw - sp, beats, rank }
		if (wantedId !== publishedId) {
			if (MANDATE.has(kase.idx) && beats) tally[name].mandate++
			if (!SUPERSEDED.has(kase.idx) && !OUT_OF_SCOPE.has(kase.idx) && beats) tally[name].standing++
			if (SUPERSEDED.has(kase.idx) && !beats) tally[name].hold++
		}
	}
	results.push(row)
	process.stdout.write(`idx ${String(kase.idx).padStart(3)} ${kase.image.slice(16, 24)} ` +
		`${row.standing ? "STAND" : "super"}${row.mandate ? "*" : " "} pop ${(w?.populationFraction ?? 0).toExponential(1)} ` +
		`lcf ${(w?.largestComponentFraction ?? 0).toExponential(1)} coh ${(w?.coherentSupport ?? 0).toFixed(2)} ` +
		`rep ${(w?.repeatedSupport ?? 0).toFixed(2)} mark ${(w?.markSupport ?? 0).toFixed(2)} | ` +
		Object.keys(FORMS).map((k) => `${k}:${row.forms[k].beats ? "Y" : "."}${String(row.forms[k].rank).padStart(3)}`).join(" ") + "\n")
}

process.stdout.write(`\nform      mandate(7)  standing(13)  hold-superseded(4)\n`)
for (const [k, v] of Object.entries(tally)) {
	process.stdout.write(`${k.padEnd(9)} ${String(v.mandate).padStart(7)} ${String(v.standing).padStart(12)} ${String(v.hold).padStart(18)}\n`)
}
writeFileSync(resolve(import.meta.dirname, "accent-decompose.json"), JSON.stringify(results, null, "\t") + "\n")
