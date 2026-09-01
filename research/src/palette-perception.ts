import {
	buildCandidateContext,
	type Candidate,
	type CandidateContext,
	type CandidatePerceptionRecord,
	type ColorBin,
	type ColorFamilyRecord,
	type CandidateSpatialEvidence,
} from "./candidates.ts"
import { chroma } from "./color.ts"
import { analyzeRegions, type RegionAnalysis } from "./regions.ts"
import type { RawImage } from "./types.ts"

export const PALETTE_PERCEPTION_VERSION = "palette-perception-0.1.0-dev"

export type PalettePerception = {
	version: typeof PALETTE_PERCEPTION_VERSION
	analysis: RegionAnalysis
	candidates: readonly Candidate[]
	bins: readonly ColorBin[]
	pixelBinIds: Int32Array
	representativePixelIndices: Int32Array
	candidateRecords: readonly CandidatePerceptionRecord[]
	families: readonly ColorFamilyRecord[]
}

function freezeSpatialEvidence(evidence: CandidateSpatialEvidence): void {
	for (const component of evidence.components) {
		Object.freeze(component.regionIds)
		Object.freeze(component.sideCoverage)
		Object.freeze(component)
	}
	Object.freeze(evidence.components)
	Object.freeze(evidence.regionIds)
	Object.freeze(evidence.sideCoverage)
	Object.freeze(evidence)
}

function cloneAnalysis(analysis: RegionAnalysis): RegionAnalysis {
	return {
		regions: analysis.regions.map((region) => ({
			...region,
			lab: [...region.lab],
			rgb: [...region.rgb],
			neighbors: [...region.neighbors],
		})),
		labels: new Int32Array(analysis.labels),
		labs: new Float32Array(analysis.labs),
		edges: new Float32Array(analysis.edges),
		data: new Uint8Array(analysis.data),
		width: analysis.width,
		height: analysis.height,
	}
}

function freezePerception(analysis: RegionAnalysis, context: CandidateContext): PalettePerception {
	for (const region of analysis.regions) {
		Object.freeze(region.lab)
		Object.freeze(region.rgb)
		Object.freeze(region.neighbors)
		Object.freeze(region)
	}
	Object.freeze(analysis.regions)
	Object.freeze(analysis)

	const frozenSpatial = new Set<CandidateSpatialEvidence>()
	for (const candidate of context.candidates) {
		for (const evidence of [candidate.spatial, candidate.familySpatial]) {
			if (!frozenSpatial.has(evidence)) {
				freezeSpatialEvidence(evidence)
				frozenSpatial.add(evidence)
			}
		}
		Object.freeze(candidate.rgb)
		Object.freeze(candidate.lab)
		Object.freeze(candidate.regionIds)
		Object.freeze(candidate)
	}
	Object.freeze(context.candidates)

	for (const bin of context.bins) {
		Object.freeze(bin.lab)
		Object.freeze(bin.rgb)
		Object.freeze(bin)
	}
	Object.freeze(context.bins)

	const candidateRecords = context.candidateRecords.map((record): CandidatePerceptionRecord => {
		const binIds = [...record.binIds]
		Object.freeze(binIds)
		return Object.freeze({
			candidateId: record.candidateId,
			binIds,
			get mask(): Uint8Array { return new Uint8Array(record.mask) },
			representativePixelIndex: record.representativePixelIndex,
		})
	})
	Object.freeze(candidateRecords)
	const families = context.families.map((family): ColorFamilyRecord => {
		const memberCandidateIds = [...family.memberCandidateIds]
		const primaryCandidateIds = [...family.primaryCandidateIds]
		Object.freeze(memberCandidateIds)
		Object.freeze(primaryCandidateIds)
		return Object.freeze({
			id: family.id,
			anchorCandidateId: family.anchorCandidateId,
			memberCandidateIds,
			primaryCandidateIds,
			get mask(): Uint8Array { return new Uint8Array(family.mask) },
			spatial: family.spatial,
		})
	})
	Object.freeze(families)
	return Object.freeze({
		version: PALETTE_PERCEPTION_VERSION,
		get analysis(): RegionAnalysis { return cloneAnalysis(analysis) },
		candidates: context.candidates,
		bins: context.bins,
		get pixelBinIds(): Int32Array { return new Int32Array(context.pixelBinIds) },
		get representativePixelIndices(): Int32Array {
			return new Int32Array(context.representativePixelIndices)
		},
		candidateRecords,
		families,
	})
}

function assertPerceptionProvenance(analysis: RegionAnalysis, context: CandidateContext): void {
	const total = analysis.width * analysis.height
	const candidatesById = new Map(context.candidates.map((candidate) => [candidate.id, candidate]))
	const recordsById = new Map(context.candidateRecords.map((record) => [record.candidateId, record]))
	if (candidatesById.size !== context.candidates.length) throw new Error("Candidate IDs must be unique")
	if (recordsById.size !== context.candidateRecords.length || recordsById.size !== candidatesById.size) {
		throw new Error("Every candidate must have exactly one perception record")
	}
	if (context.pixelBinIds.length !== total) throw new Error("Pixel-to-bin assignments must cover the image")
	if (context.representativePixelIndices.length !== context.bins.length) {
		throw new Error("Every color bin must have one representative source pixel")
	}
	const primaryCoverage = new Uint8Array(total)

	for (const record of context.candidateRecords) {
		const candidate = candidatesById.get(record.candidateId)
		if (!candidate) throw new Error(`Missing candidate ${record.candidateId} for perception record`)
		if (record.mask.length !== total) throw new Error(`Candidate ${record.candidateId} mask has invalid length`)
		if (record.representativePixelIndex < 0 || record.representativePixelIndex >= total) {
			throw new Error(`Candidate ${record.candidateId} lacks exact source-pixel provenance`)
		}
		const offset = record.representativePixelIndex * 3
		if (candidate.rgb[0] !== analysis.data[offset] || candidate.rgb[1] !== analysis.data[offset + 1] ||
			candidate.rgb[2] !== analysis.data[offset + 2]) {
			throw new Error(`Candidate ${record.candidateId} representative is not an exact source pixel`)
		}
		const binIds = new Set(record.binIds)
		if (!binIds.has(context.pixelBinIds[record.representativePixelIndex]) || !record.mask[record.representativePixelIndex]) {
			throw new Error(`Candidate ${record.candidateId} representative is outside its exact evidence mask`)
		}
		for (const binId of record.binIds) {
			if (!context.bins[binId]) throw new Error(`Candidate ${record.candidateId} references missing bin ${binId}`)
		}
		let support = 0
		for (let pixel = 0; pixel < total; pixel++) {
			const expected = binIds.has(context.pixelBinIds[pixel]) ? 1 : 0
			if (record.mask[pixel] !== expected) throw new Error(`Candidate ${record.candidateId} mask disagrees with its bins`)
			support += record.mask[pixel]
			if (!candidate.typographyOnly) primaryCoverage[pixel] += record.mask[pixel]
		}
		if (Math.abs(candidate.spatial.population - support / total) > epsilon) {
			throw new Error(`Candidate ${record.candidateId} mask population is inconsistent`)
		}
	}
	for (const coverage of primaryCoverage) {
		if (coverage !== 1) throw new Error("Primary candidate masks must partition every source pixel")
	}

	const familyIds = new Set<number>()
	const familyMembers = new Set<number>()
	for (const family of context.families) {
		if (familyIds.has(family.id)) throw new Error(`Duplicate family ID ${family.id}`)
		familyIds.add(family.id)
		if (family.mask.length !== total) throw new Error(`Family ${family.id} mask has invalid length`)
		if (!family.primaryCandidateIds.includes(family.anchorCandidateId)) {
			throw new Error(`Family ${family.id} anchor is not a primary member`)
		}
		for (const candidateId of family.memberCandidateIds) {
			if (familyMembers.has(candidateId)) throw new Error(`Candidate ${candidateId} belongs to multiple families`)
			familyMembers.add(candidateId)
			if (candidatesById.get(candidateId)?.familyId !== family.id) {
				throw new Error(`Family ${family.id} contains an inconsistent candidate`)
			}
		}
		const primaryRecords = family.primaryCandidateIds.map((candidateId) => recordsById.get(candidateId)!)
		let support = 0
		for (let pixel = 0; pixel < total; pixel++) {
			const expected = primaryRecords.some((record) => record.mask[pixel] > 0) ? 1 : 0
			if (family.mask[pixel] !== expected) throw new Error(`Family ${family.id} mask is not its primary-member union`)
			support += family.mask[pixel]
		}
		if (Math.abs(family.spatial.population - support / total) > epsilon) {
			throw new Error(`Family ${family.id} mask population is inconsistent`)
		}
	}
	if (familyMembers.size !== candidatesById.size) throw new Error("Every candidate must belong to exactly one family")
}

const epsilon = 1e-12

export function perceivePaletteImage(image: RawImage): PalettePerception {
	const analysis = analyzeRegions({
		width: image.width,
		height: image.height,
		data: new Uint8Array(image.data),
	})
	const context = buildCandidateContext(analysis, 12, true, { stableFamilyAnchors: true })
	for (const candidate of context.candidates) candidate.chroma = chroma(candidate.lab)
	assertPerceptionProvenance(analysis, context)
	return freezePerception(analysis, context)
}
