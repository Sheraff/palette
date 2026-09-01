import { createHash } from "node:crypto"
import type {
	Candidate,
	CandidatePerceptionRecord,
	CandidateSpatialEvidence,
	ColorBin,
	ColorFamilyRecord,
} from "./candidates.ts"
import {
	buildConnectedFamilyCandidateAvailability,
	type ConnectedFamilyCandidateAvailability,
} from "./connected-family-candidate-availability.ts"
import type { PalettePerception } from "./palette-perception.ts"
import { perceivePaletteImage } from "./palette-perception.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { RawImage } from "./types.ts"

export const CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION = "palette-perception-connected-family-0.2.0-dev"

export type ConnectedFamilyCandidateConstruction = "lloyd-cluster" | "light-typography" | "connected-family-reserve"
export type ConnectedFamilyCandidate = Candidate & {
	construction: ConnectedFamilyCandidateConstruction
	fieldRoleAllowed: boolean
	evidenceMaskSha256: string
}

export type ConnectedFamilyPalettePerception = {
	version: typeof CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION
	analysis: RegionAnalysis
	candidates: readonly ConnectedFamilyCandidate[]
	bins: readonly ColorBin[]
	pixelBinIds: Int32Array
	representativePixelIndices: Int32Array
	candidateRecords: readonly CandidatePerceptionRecord[]
	families: readonly ColorFamilyRecord[]
	availability: ConnectedFamilyCandidateAvailability
}

const epsilon = 1e-12

function maskSha256(mask: Uint8Array): string {
	return createHash("sha256").update(mask).digest("hex")
}

function cloneSpatial(evidence: CandidateSpatialEvidence): CandidateSpatialEvidence {
	return {
		...evidence,
		regionIds: [...evidence.regionIds],
		sideCoverage: [...evidence.sideCoverage],
		components: evidence.components.map((component) => ({
			...component,
			regionIds: [...component.regionIds],
			sideCoverage: [...component.sideCoverage],
		})),
	}
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function cloneRecord(record: CandidatePerceptionRecord): CandidatePerceptionRecord {
	return {
		candidateId: record.candidateId,
		binIds: [...record.binIds],
		mask: new Uint8Array(record.mask),
		representativePixelIndex: record.representativePixelIndex,
	}
}

function exactCandidate(
	candidate: Candidate,
	record: CandidatePerceptionRecord,
	construction: ConnectedFamilyCandidateConstruction,
	fieldRoleAllowed: boolean,
): ConnectedFamilyCandidate {
	return {
		...candidate,
		rgb: [...candidate.rgb],
		lab: [...candidate.lab],
		regionIds: [...candidate.regionIds],
		spatial: cloneSpatial(candidate.spatial),
		familySpatial: cloneSpatial(candidate.familySpatial),
		construction,
		fieldRoleAllowed,
		evidenceMaskSha256: maskSha256(record.mask),
	}
}

function buildIntegratedContext(base: PalettePerception, availability: ConnectedFamilyCandidateAvailability) {
	const records = base.candidateRecords.map(cloneRecord)
	const recordById = new Map(records.map((record) => [record.candidateId, record]))
	const candidates = base.candidates.map((candidate) => exactCandidate(
		candidate,
		recordById.get(candidate.id)!,
		candidate.typographyOnly ? "light-typography" : "lloyd-cluster",
		!candidate.typographyOnly,
	))
	const families: ColorFamilyRecord[] = base.families.map((family) => ({
		id: family.id,
		anchorCandidateId: family.anchorCandidateId,
		memberCandidateIds: [...family.memberCandidateIds],
		primaryCandidateIds: [...family.primaryCandidateIds],
		mask: new Uint8Array(family.mask),
		spatial: cloneSpatial(family.spatial),
	}))
	let nextCandidateId = candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1) + 1
	let nextFamilyId = families.reduce((maximum, family) => Math.max(maximum, family.id), -1) + 1
	for (const proposal of [...availability.proposals].sort((first, second) =>
		first.stableKey < second.stableKey ? -1 : first.stableKey > second.stableKey ? 1 : 0)) {
		const id = nextCandidateId++
		const familyId = nextFamilyId++
		const mask = proposal.mask
		const spatial = cloneSpatial(proposal.spatial)
		const candidate: ConnectedFamilyCandidate = {
			id,
			rgb: [...proposal.rgb],
			lab: [...proposal.lab],
			hex: proposal.hex,
			population: proposal.population,
			background: proposal.background,
			saliency: proposal.saliency,
			text: proposal.text,
			chroma: proposal.chroma,
			generated: false,
			typographyOnly: false,
			regionIds: [...spatial.regionIds],
			familyId,
			spatial,
			familySpatial: spatial,
			construction: "connected-family-reserve",
			fieldRoleAllowed: false,
			evidenceMaskSha256: proposal.maskSha256,
		}
		candidates.push(candidate)
		records.push({
			candidateId: id,
			binIds: [...proposal.binIds],
			mask,
			representativePixelIndex: proposal.representativePixelIndex,
		})
		families.push({
			id: familyId,
			anchorCandidateId: id,
			memberCandidateIds: [id],
			primaryCandidateIds: [id],
			mask,
			spatial,
		})
	}
	return { candidates, records, families }
}

function assertIntegratedProvenance(
	analysis: RegionAnalysis,
	candidates: readonly ConnectedFamilyCandidate[],
	records: readonly CandidatePerceptionRecord[],
	families: readonly ColorFamilyRecord[],
	bins: readonly ColorBin[],
	pixelBinIds: Int32Array,
): void {
	const total = analysis.width * analysis.height
	const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
	const recordById = new Map(records.map((record) => [record.candidateId, record]))
	if (candidateById.size !== candidates.length || recordById.size !== candidates.length) {
		throw new Error("Connected family perception candidates and records must be one-to-one")
	}
	const primaryCoverage = new Uint8Array(total)
	for (const candidate of candidates) {
		const record = recordById.get(candidate.id)
		if (!record || record.mask.length !== total || !record.mask[record.representativePixelIndex]) {
			throw new Error(`Connected family candidate ${candidate.id} has invalid mask provenance`)
		}
		const offset = record.representativePixelIndex * 3
		if (candidate.rgb[0] !== analysis.data[offset] || candidate.rgb[1] !== analysis.data[offset + 1] ||
			candidate.rgb[2] !== analysis.data[offset + 2] || candidate.evidenceMaskSha256 !== maskSha256(record.mask)) {
			throw new Error(`Connected family candidate ${candidate.id} is not source exact`)
		}
		const binIds = new Set(record.binIds)
		let support = 0
		for (let pixel = 0; pixel < total; pixel++) {
			if (!record.mask[pixel]) continue
			support++
			if (!binIds.has(pixelBinIds[pixel]) || !bins[pixelBinIds[pixel]]) {
				throw new Error(`Connected family candidate ${candidate.id} mask escapes its source bins`)
			}
			if (candidate.construction === "lloyd-cluster") primaryCoverage[pixel]++
		}
		if (Math.abs(candidate.population - support / total) > epsilon) {
			throw new Error(`Connected family candidate ${candidate.id} population is inconsistent`)
		}
		if (candidate.fieldRoleAllowed !== (candidate.construction === "lloyd-cluster")) {
			throw new Error(`Connected family candidate ${candidate.id} has implicit field membership`)
		}
	}
	for (const coverage of primaryCoverage) {
		if (coverage !== 1) throw new Error("Lloyd field-source masks must retain the complete source partition")
	}
	const familyMembers = new Set<number>()
	for (const family of families) {
		if (!family.primaryCandidateIds.includes(family.anchorCandidateId)) {
			throw new Error(`Connected family ${family.id} has an invalid anchor`)
		}
		for (const candidateId of family.memberCandidateIds) {
			if (familyMembers.has(candidateId) || candidateById.get(candidateId)?.familyId !== family.id) {
				throw new Error(`Connected family candidate ${candidateId} has inconsistent membership`)
			}
			familyMembers.add(candidateId)
		}
		for (let pixel = 0; pixel < total; pixel++) {
			const expected = family.primaryCandidateIds.some((candidateId) => recordById.get(candidateId)!.mask[pixel]) ? 1 : 0
			if (family.mask[pixel] !== expected) throw new Error(`Connected family ${family.id} mask is inconsistent`)
		}
	}
	if (familyMembers.size !== candidates.length) throw new Error("Every connected family candidate must have one family")
}

function freezeRecord(record: CandidatePerceptionRecord): CandidatePerceptionRecord {
	const mask = new Uint8Array(record.mask)
	const binIds = [...record.binIds]
	Object.freeze(binIds)
	return Object.freeze({
		candidateId: record.candidateId,
		binIds,
		get mask(): Uint8Array { return new Uint8Array(mask) },
		representativePixelIndex: record.representativePixelIndex,
	})
}

function freezeFamily(family: ColorFamilyRecord): ColorFamilyRecord {
	const mask = new Uint8Array(family.mask)
	const memberCandidateIds = [...family.memberCandidateIds]
	const primaryCandidateIds = [...family.primaryCandidateIds]
	Object.freeze(memberCandidateIds)
	Object.freeze(primaryCandidateIds)
	return Object.freeze({
		id: family.id,
		anchorCandidateId: family.anchorCandidateId,
		memberCandidateIds,
		primaryCandidateIds,
		get mask(): Uint8Array { return new Uint8Array(mask) },
		spatial: family.spatial,
	})
}

export function perceivePaletteImageWithConnectedFamilies(image: RawImage): ConnectedFamilyPalettePerception {
	const base = perceivePaletteImage(image)
	const availability = buildConnectedFamilyCandidateAvailability(base)
	const analysis = base.analysis
	const bins = [...base.bins]
	const pixelBinIds = base.pixelBinIds
	const representativePixelIndices = base.representativePixelIndices
	const context = buildIntegratedContext(base, availability)
	assertIntegratedProvenance(
		analysis,
		context.candidates,
		context.records,
		context.families,
		bins,
		pixelBinIds,
	)
	const candidates = context.candidates.map((candidate) => deepFreeze(candidate))
	const records = context.records.map(freezeRecord)
	const families = context.families.map((family) => deepFreeze(freezeFamily(family)))
	Object.freeze(candidates)
	Object.freeze(records)
	Object.freeze(families)
	Object.freeze(bins)
	return Object.freeze({
		version: CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
		get analysis(): RegionAnalysis { return base.analysis },
		candidates,
		bins,
		get pixelBinIds(): Int32Array { return new Int32Array(pixelBinIds) },
		get representativePixelIndices(): Int32Array { return new Int32Array(representativePixelIndices) },
		candidateRecords: records,
		families,
		availability,
	})
}
