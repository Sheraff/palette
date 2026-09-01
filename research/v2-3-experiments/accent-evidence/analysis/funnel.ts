/**
 * Per-target candidacy funnel, instrumented.
 *
 * For each salience target this records the EXACT stage at which the reviewer's wanted accent
 * family is ranked out, and the statistic that does it:
 *
 *   S0  family exists at all (nearest prototype)
 *   S1  built as a colour-family representative (within MINIMUM_DISTINCT_DISTANCE)
 *   S1b that representative survives `preferredRepresentatives` (bounds.representativesPerRole = 2)
 *   S2  family retained in the signature lane (top-16 by signatureRoleScore)
 *   S3  family appears in `rankAccentOptions` output for some (variant, foreground)  [shortlist]
 *   S3o ... and is APCA peak-observable there
 *   S4  family survives `retainPeakObservableFamilyDirections` (distinctAccentsPerForeground = 4)
 *   S5  offered in a scored candidate's accent slot within MDD of the prescription
 *
 * CORPUS: real artwork only, shared checkout. Never a `-scrambled` decoy.
 */
import { writeFileSync } from "node:fs"
import sharp from "sharp"
import {
	buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, setAccentShortlistTrace,
	setIdentitySelectionTrace,
	type AccentShortlistTraceEvent, type IdentitySelectionTraceEvent,
} from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../../v2-3/src/internal/policy.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { CASES } from "./salience-set.ts"

sharp.concurrency(1)
const MDD = 0.018
const lab = (hex: string) => rgbToOKLab(hexToRgb(hex))
const chromaOf = (l: readonly number[]) => Math.hypot(l[1], l[2])
const sigRole = (f: any) => Math.min(1, Math.max(0, 0.55 * f.signatureScore + 0.45 * f.signatureAccentObservation))

const strategyOrder: Record<string, number> = {
	"dense-exact": 0, "nearest-prototype": 1, "density-synthesized": 2, "generated-emergency": 3,
}
const preferred = (reps: readonly any[]) =>
	[...reps].sort((a, b) => strategyOrder[a.strategy] - strategyOrder[b.strategy])
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.representativesPerRole)

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const klass = process.argv.includes("--all") ? null : "salience"
const outName = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "funnel.json"

const out: any[] = []
for (const c of CASES.filter((x) => (klass === null || x.klass === klass) && (only.length === 0 || only.includes(String(x.idx))))) {
	const path = resolveArtwork(c.image)
	if (!path) { console.error(`UNRESOLVED ${c.idx}`); continue }
	const image = await loadNativeImage(path)
	const preLab = lab(c.prescribed)

	const events: AccentShortlistTraceEvent[] = []
	const idEvents: IdentitySelectionTraceEvent[] = []
	setAccentShortlistTrace((e) => { events.push(e) })
	setIdentitySelectionTrace((e) => { idEvents.push(e) })
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	setAccentShortlistTrace(null)
	setIdentitySelectionTrace(null)

	const families = seed.evidence.families as any[]
	// --- S0/S1: which family owns the prescription, and is it a representative?
	let repDist = Infinity, repHex: string | null = null, wantedFamily: any = null, repStrategy: string | null = null
	for (const f of families) for (const r of f.representatives) {
		const d = okDistance(preLab, r.oklab)
		if (d < repDist) { repDist = d; repHex = r.hex; wantedFamily = f; repStrategy = r.strategy }
	}
	let protoDist = Infinity, protoFamily: any = null
	for (const f of families) {
		const d = okDistance(preLab, f.prototype)
		if (d < protoDist) { protoDist = d; protoFamily = f }
	}
	const builtAsRepresentative = repDist <= MDD
	const owner = builtAsRepresentative ? wantedFamily : protoFamily
	// S1b — is the near representative inside the preferred (top-2) slice?
	const prefReps = preferred(owner.representatives)
	const prefDist = Math.min(...prefReps.map((r: any) => okDistance(preLab, r.oklab)))
	const inPreferred = builtAsRepresentative && prefDist <= MDD

	// --- chroma ceiling statistics
	const chromas = families.map((f) => f.chroma as number)
	const ceiling = Math.max(...chromas)
	const relChroma = owner.chroma / ceiling
	const chromaRank = 1 + chromas.filter((x) => x > owner.chroma).length
	const ceilingFamily = families.reduce((a, b) => (b.chroma > a.chroma ? b : a))

	// --- S2: signature lane
	const laneIds: string[] = (seed.evidence.lanes.find((l: any) => l.name === "signature")?.familyIds ?? []) as string[]
	const inLane = laneIds.includes(owner.id)
	const laneRankAll = [...families]
		.filter((f) => f.population > 0)
		.sort((a, b) => sigRole(b) - sigRole(a) || b.population - a.population || (a.id < b.id ? -1 : 1))
	const laneRank = 1 + laneRankAll.findIndex((f) => f.id === owner.id)
	const laneCut = laneRankAll[ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.signatureFamilies - 1]
	const laneCutScore = laneCut ? sigRole(laneCut) : 0
	const ownerSigRole = sigRole(owner)
	const ceilingInLane = laneIds.includes(ceilingFamily.id)

	// --- S3/S4: shortlist and retention across every (variant, foreground)
	let bestRank = Infinity, bestRankOf = -1, bestObservable = false, everRetained = false
	let everInShortlist = false, everObservable = false, bestScore = -1, cutScoreAtBest = -1
	let excludedAsField = 0, excludedAsForeground = 0
	for (const e of events) {
		const idx = e.ranked.findIndex((r) => r.familyId === owner.id && okDistance(preLab, lab(r.hex)) <= MDD)
		const anyIdx = e.ranked.findIndex((r) => r.familyId === owner.id)
		if (anyIdx < 0) {
			if (e.foregroundFamilyId === owner.id) excludedAsForeground += 1
			else excludedAsField += 1
			continue
		}
		everInShortlist = true
		const entry = e.ranked[anyIdx]
		if (entry.observable) everObservable = true
		// rank among observable options (the retention pool), family-deduped
		const observable = e.ranked.filter((r) => r.observable)
		const seen = new Set<string>()
		const deduped = observable.filter((r) => (seen.has(r.familyId) ? false : (seen.add(r.familyId), true)))
		const famRank = 1 + deduped.findIndex((r) => r.familyId === owner.id)
		if (entry.observable && famRank > 0 && famRank < bestRank) {
			bestRank = famRank
			bestRankOf = deduped.length
			bestObservable = true
			bestScore = entry.score
			cutScoreAtBest = deduped[ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground - 1]?.score ?? -1
		}
		if (e.retained.some((r) => r.familyId === owner.id)) everRetained = true
		void idx
	}

	// --- obligation channel: is the wanted family an identity obligation, and if not, why?
	const obligationIds = (seed.identityObligations as any[]).map((o) => o.familyId)
	const isObligation = obligationIds.includes(owner.id)
	const obligationPriority = obligationIds.indexOf(owner.id)
	const idt = idEvents[0]
	const obligationStage = !idt ? "no-trace"
		: !idt.evaluatedSignatureFamilyIds.includes(owner.id) ? "not-in-signature-lane"
		: idt.fieldOwnedFamilyIds.includes(owner.id) ? "field-owned"
		: idt.notSourceConnectedFamilyIds.includes(owner.id) ? "not-source-connected"
		: idt.notMateriallyDistinctFamilyIds.includes(owner.id) ? "not-materially-distinct"
		: idt.redundantDirectionFamilyIds.includes(owner.id) ? "redundant-direction"
		: idt.neutralQuotaOmittedFamilyIds.includes(owner.id) ? "neutral-quota"
		: idt.boundOmittedFamilyIds.includes(owner.id) ? "bound-omitted"
		: idt.reservedFamilyIds.includes(owner.id) ? "reserved-major"
		: idt.selectedFamilyIds.includes(owner.id) ? "selected"
		: "unknown"
	const rankedIdx = idt ? idt.rankedFamilyIds.indexOf(owner.id) : -1
	// where does the CEILING family stand in the obligation channel?
	const ceilingObligationStage = !idt ? "no-trace"
		: !idt.evaluatedSignatureFamilyIds.includes(ceilingFamily.id) ? "not-in-signature-lane"
		: idt.selectedFamilyIds.includes(ceilingFamily.id) ? "selected"
		: idt.fieldOwnedFamilyIds.includes(ceilingFamily.id) ? "field-owned"
		: idt.notSourceConnectedFamilyIds.includes(ceilingFamily.id) ? "not-source-connected"
		: idt.notMateriallyDistinctFamilyIds.includes(ceilingFamily.id) ? "not-materially-distinct"
		: idt.redundantDirectionFamilyIds.includes(ceilingFamily.id) ? "redundant-direction"
		: idt.neutralQuotaOmittedFamilyIds.includes(ceilingFamily.id) ? "neutral-quota"
		: idt.boundOmittedFamilyIds.includes(ceilingFamily.id) ? "bound-omitted"
		: "unknown"

	// --- S5: offered in a scored candidate's accent slot
	let nearAccent = Infinity, nearAccentHex: string | null = null
	for (const t of seed.completeTreatments as any[]) {
		if (t.collapse.accent) continue
		const d = okDistance(preLab, t.accent.oklab)
		if (d < nearAccent) { nearAccent = d; nearAccentHex = t.accent.hex }
	}

	const row = {
		idx: c.idx, image: c.image, klass: c.klass, prescribed: c.prescribed, published: c.published,
		familyId: owner.id, familyHex: owner.id,
		S0_familyExists: protoDist <= 0.04, protoDist,
		S1_builtAsRepresentative: builtAsRepresentative, repDist, repHex, repStrategy,
		S1b_inPreferredRepresentatives: inPreferred, prefDist, representativeCount: owner.representatives.length,
		S2_inSignatureLane: inLane, laneRank, ownerSigRole, laneCutScore,
		S3_inShortlist: everInShortlist, S3o_observable: everObservable,
		S4_retained: everRetained, bestRank, bestRankOf, bestScore, cutScoreAtBest, bestObservable,
		excludedAsField, excludedAsForeground, shortlistEvents: events.length,
		S5_offeredAsAccent: nearAccent <= MDD, nearAccent, nearAccentHex,
		relChroma, chromaRank, ceiling, ownerChroma: owner.chroma,
		prescribedChroma: chromaOf(preLab),
		ceilingFamilyId: ceilingFamily.id, ceilingInLane,
		ceilingSigRole: sigRole(ceilingFamily), ceilingIsWanted: ceilingFamily.id === owner.id,
		familyCount: families.length,
		populationFraction: owner.populationFraction, markSupport: owner.markSupport,
		isObligation, obligationPriority, obligationStage, obligationRankedIndex: rankedIdx,
		obligationCount: obligationIds.length,
		ceilingObligationStage, ceilingPopulationFraction: ceilingFamily.populationFraction,
		lanePopulationFloor: Math.min(...laneRankAll.slice(0, ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.signatureFamilies).map((f) => f.populationFraction)),
		// full candidacy fixture, so admission rules can be evaluated offline
		families: families.filter((f: any) => f.population > 0).map((f: any) => ({
			id: f.id, chroma: f.chroma, rel: f.chroma / ceiling,
			pop: f.populationFraction, lcf: f.largestComponentFraction, mark: f.markSupport,
			sig: sigRole(f), sigScore: f.signatureScore, sigAcc: f.signatureAccentObservation,
			fieldScore: f.fieldScore, fg: f.foregroundScore,
			inLane: laneIds.includes(f.id), laneRank: 1 + laneRankAll.findIndex((g) => g.id === f.id),
			wanted: f.id === owner.id,
			obligation: obligationIds.includes(f.id),
			ranked: idt ? idt.rankedFamilyIds.includes(f.id) : false,
			boundOmitted: idt ? idt.boundOmittedFamilyIds.includes(f.id) : false,
			neutralQuota: idt ? idt.neutralQuotaOmittedFamilyIds.includes(f.id) : false,
			redundant: idt ? idt.redundantDirectionFamilyIds.includes(f.id) : false,
			notSourceConnected: idt ? idt.notSourceConnectedFamilyIds.includes(f.id) : false,
			notMateriallyDistinct: idt ? idt.notMateriallyDistinctFamilyIds.includes(f.id) : false,
			fieldOwned: idt ? idt.fieldOwnedFamilyIds.includes(f.id) : false,
		})),
	}
	out.push(row)
	console.error(`ok ${c.idx}  lane=${inLane}(${laneRank}) short=${everInShortlist} ret=${everRetained} rank=${bestRank}/${bestRankOf} offered=${row.S5_offeredAsAccent} relC=${relChroma.toFixed(3)} cRank=${chromaRank} oblig=${obligationStage}(${obligationPriority}) ceilOblig=${ceilingObligationStage}`)
}
writeFileSync(new URL(`./${outName}`, import.meta.url), JSON.stringify(out, null, 1))

const n = out.length
const count = (p: (r: any) => boolean) => out.filter(p).length
console.log(`\n=== candidacy funnel (n=${n}) ===`)
console.log(`S0 family exists                    ${count((r) => r.S0_familyExists)}/${n}`)
console.log(`S1 built as representative          ${count((r) => r.S1_builtAsRepresentative)}/${n}`)
console.log(`S1b survives preferredRepresentatives ${count((r) => r.S1b_inPreferredRepresentatives)}/${n}`)
console.log(`S2 retained in signature lane       ${count((r) => r.S2_inSignatureLane)}/${n}`)
console.log(`S3 present in accent shortlist      ${count((r) => r.S3_inShortlist)}/${n}`)
console.log(`S3o APCA peak-observable there      ${count((r) => r.S3o_observable)}/${n}`)
console.log(`S4 survives per-foreground top-4    ${count((r) => r.S4_retained)}/${n}`)
console.log(`S5 offered in an accent slot        ${count((r) => r.S5_offeredAsAccent)}/${n}`)
console.log(`\nceiling family is the wanted one    ${count((r) => r.ceilingIsWanted)}/${n}`)
console.log(`ceiling family is in the lane       ${count((r) => r.ceilingInLane)}/${n}`)
console.log(`wanted family is an obligation      ${count((r) => r.isObligation)}/${n}`)
const stages = new Map<string, number>()
for (const r of out) stages.set(r.obligationStage, (stages.get(r.obligationStage) ?? 0) + 1)
console.log(`obligation stage:`, [...stages].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "))
const cstages = new Map<string, number>()
for (const r of out) cstages.set(r.ceilingObligationStage, (cstages.get(r.ceilingObligationStage) ?? 0) + 1)
console.log(`ceiling obligation stage:`, [...cstages].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "))
