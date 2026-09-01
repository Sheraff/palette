import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
	buildCandidateContext,
	spatialEvidence,
	type Candidate,
	type CandidatePerceptionRecord,
	type CandidateSpatialEvidence,
	type ColorFamilyRecord,
} from "./candidates.ts"
import {
 	buildConnectedFamilyCandidateAvailability,
	CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
} from "./connected-family-candidate-availability.ts"
import type { ConnectedFamilyCandidate } from "./connected-family-palette-perception.ts"
import { chroma, labAt, okDistance, rgbAt, rgbToHex, rgbToOKLab } from "./color.ts"
import {
	analyzeFieldRelation,
	clampRelationEvidence,
	deriveSourceFieldEligibilityDomain,
	harmonicConjunction,
	type FieldRelationEvidence,
	type SourceFieldEligibility,
} from "./field-relation.ts"
import { analyzeGradientFieldTopology } from "./gradient-field-topology.ts"
import { scoreGradientFieldTopologyEvidence } from "./gradient-field-topology-model.ts"
import { loadNativeImage, NATIVE_IMAGE_MAXIMUM_PIXELS } from "./native-resolution-image.ts"
import type { PaletteEvidenceNode } from "./palette-evidence-graph.ts"
import { PALETTE_PERCEPTION_VERSION, type PalettePerception } from "./palette-perception.ts"
import { analyzeRegions, type RegionAnalysis } from "./regions.ts"
import type { OKLab, RawImage, RGB } from "./types.ts"

export const NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION = "native-field-hypothesis-graph-0.1.0-development" as const
export const NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION = "native-field-hypothesis-graph-policy-v1" as const
export const NATIVE_FIELD_HYPOTHESIS_PROFILE_EDGES = [448, 224, 112] as const
export const NATIVE_FIELD_HYPOTHESIS_MAXIMUM_REPRESENTATIVES = 8

export const NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY = Object.freeze({
	version: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION,
	nativeDecode: "sharp-0.33.5-rotate-flatten-white-srgb-remove-alpha-raw-uchar",
	nativeMaximumPixels: NATIVE_IMAGE_MAXIMUM_PIXELS,
	perceptionPolicy: "native-analyze-regions-plus-role-aware-12-stable-family-anchors-plus-majority-typography-overlay",
	connectedAvailabilityVersion: CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
	analysisOwnership: "single-owned-native-analysis-no-defensive-raster-copies",
	familyDomains: ["primary-field", "connected-overlay"],
	representativeCriteria: [
		"population", "largest-component", "saliency", "text", "chroma", "darkest", "lightest", "center",
	],
	observationProfiles: NATIVE_FIELD_HYPOTHESIS_PROFILE_EDGES.map((maxEdge) => `max-edge-${maxEdge}-area-srgb`),
	projection: "exact-rational-cell-area-primary-argmax-ascii-family-key-tie-overlay-majority",
	fieldRelation: "field-relation-evidence-0.1.0-dev-unchanged",
	oneFieldFit: "H(clamp(population/0.5),field-support)",
	twoFieldFit: "H(background-support,surface-support,clamp(pair-mass/0.6),balance,clamp(distance/0.18))",
	incrementalSurfaceIdentity: "H(clamp(surface-population/0.15),surface-support,clamp(distance/0.18))",
	overlayComplementarity: "H(max(text,saliency,detail),min-field-distance/0.18,max(chroma/0.18,text))",
	hypothesisDomain: "all-collapsed-plus-all-ordered-distinct-flat-plus-all-ordered-gradient",
	selectionPolicy: "none-evidence-only",
	canonicalRolePolicy: "not-loaded-not-used",
})

export const NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256 = createHash("sha256")
	.update(NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION, "utf8")
	.update("\0")
	.update(JSON.stringify(NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY), "utf8")
	.digest("hex")

export type NativeFieldRepresentativeCriterion =
	| "population"
	| "largest-component"
	| "saliency"
	| "text"
	| "chroma"
	| "darkest"
	| "lightest"
	| "center"

export type NativeFieldRepresentative = {
	stableKey: string
	familyStableKey: string
	rgb: RGB
	lab: OKLab
	hex: string
	representativePixelIndex: number
	construction: ConnectedFamilyCandidate["construction"] | "family-largest-component" | "family-center"
	fieldRoleAllowed: boolean
	selectedBy: NativeFieldRepresentativeCriterion[]
	evidence: {
		population: number
		saliency: number
		text: number
		chroma: number
		detail: number
	}
}

type FieldEvidenceSummary = {
	population: number
	background: number
	saliency: number
	text: number
	spatial: {
		field: number
		detail: number
		frame: number
		largestComponentPopulation: number
		componentCount: number
	}
	fieldEligibility: SourceFieldEligibility
	oneFieldFit: number
	nativePopulationMovement: number
}

export type NativeFieldFamilyNode = {
	id: number
	stableKey: string
	kind: "primary-field" | "connected-overlay"
	anchorCandidateId: number
	memberCandidateIds: number[]
	maskSha256: string
	population: number
	centerRepresentativeKey: string
	representatives: NativeFieldRepresentative[]
	native: FieldEvidenceSummary
	profiles: Array<{
		profileId: string
		width: number
		height: number
		evidence: FieldEvidenceSummary
	}>
}

export type ScalarScaleSummary = {
	minimum: number
	maximum: number
	mean: number
	range: number
}

type OneTwoFieldEvidence = {
	backgroundPopulation: number
	surfacePopulation: number
	pairMass: number
	balance: number
	distinguishability: number
	incrementalSurfaceIdentity: number
	twoFieldFit: number
}

export type NativeFieldRelationRecord = {
	stableKey: string
	backgroundFamilyStableKey: string
	surfaceFamilyStableKey: string
	backgroundRepresentativeKey: string
	surfaceRepresentativeKey: string
	endpointDistance: number
	profiles: Array<{
		profileId: string
		relation: FieldRelationEvidence
		oneTwoField: OneTwoFieldEvidence
		largerStateSupport: "distinct-flat" | "gradient" | "tie"
	}>
	scale: {
		distinctFlatSupport: ScalarScaleSummary
		gradientSupport: ScalarScaleSummary
		twoFieldFit: ScalarScaleSummary
		incrementalSurfaceIdentity: ScalarScaleSummary
		stateAgreement: number
		stateCounts: { distinctFlat: number; gradient: number; tie: number }
	}
}

type OverlayComplement = {
	representativeKey: string
	familyStableKey: string
	hex: string
	support: number
	overlayEvidence: number
	identityDistance: number
	identityStrength: number
}

export type NativeFieldHypothesis = {
	stableKey: string
	state: "collapsed" | "distinct-flat" | "gradient"
	backgroundFamilyStableKey: string
	surfaceFamilyStableKey: string | null
	relationStableKey: string | null
	stateSupport: ScalarScaleSummary
	oneFieldFit: ScalarScaleSummary
	twoFieldFit: ScalarScaleSummary | null
	incrementalSurfaceIdentity: ScalarScaleSummary | null
	overlayComplements: OverlayComplement[]
}

export type NativeFieldHypothesisGraph = {
	schemaVersion: 1
	version: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION
	policy: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY
	policySha256: typeof NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256
	source: { sha256: string }
	native: { width: number; height: number; rasterSha256: string }
	profiles: Array<{ id: string; maxEdge: number; width: number; height: number; rasterSha256: string }>
	families: NativeFieldFamilyNode[]
	relations: NativeFieldRelationRecord[]
	hypotheses: NativeFieldHypothesis[]
	certificate: {
		counts: {
			primaryFieldFamilies: number
			connectedOverlayFamilies: number
			representatives: number
			maximumRepresentativesPerFamily: number
			orderedRelations: number
			collapsedHypotheses: number
			distinctFlatHypotheses: number
			gradientHypotheses: number
			totalHypotheses: number
			logicalHypothesisBound: number
		}
		partitions: {
			nativePrimaryPartitionSha256: string
			profilePrimaryPartitionSha256: Record<string, string>
		}
		invariants: {
			exactNativeRepresentatives: true
			nativePrimaryPartition: true
			projectedPrimaryPartitions: true
			connectedFamiliesOverlayOnly: true
			boundedRepresentativeFrontiers: true
			completeOrderedRelations: true
			completeStateEnumeration: true
			finiteNormalizedEvidence: true
			generatedColorsUsed: false
			paletteOutputProduced: false
			canonicalRoleColorsUsed: false
		}
	}
}

export const NATIVE_FIELD_FAMILY_QUERY_POLICY = Object.freeze({
	version: "native-field-family-query-policy-v1",
	maximumOKLabDistance: 0.025,
	minimumSecondFamilyMarginExclusive: 0.005,
	generatedColorsAllowed: false,
	mutationPolicy: "read-only-linkage-no-candidate-or-family-mutation",
} as const)

export type NativeFieldFamilyQuery = {
	rgb: RGB
	status: "exact-rgb" | "unique-nearest" | "ambiguous" | "unmappable"
	familyStableKey: string | null
	nativePixelIndex: number | null
	nativeRgb: RGB | null
	distance: number | null
	secondFamilyDistance: number | null
}

export type NativeFieldHypothesisGraphWithFamilyQueries = {
	graph: NativeFieldHypothesisGraph
	queryPolicy: typeof NATIVE_FIELD_FAMILY_QUERY_POLICY
	queries: NativeFieldFamilyQuery[]
	topologyQueries: NativeFieldTopologyQuery[]
}

export type NativeFieldFamilyTopologyQueryResult = {
	queryPolicy: typeof NATIVE_FIELD_FAMILY_QUERY_POLICY
	queries: NativeFieldFamilyQuery[]
	topologyQueries: NativeFieldTopologyQuery[]
}

export type NativeFieldTopologyQueryInput = {
	backgroundRgb: RGB
	surfaceRgb: RGB
}

export type NativeFieldTopologyQuery = NativeFieldTopologyQueryInput & ({
	status: "mapped"
	backgroundFamilyStableKey: string
	surfaceFamilyStableKey: string
	profiles: Array<{
		profileId: string
		endpointDistance: number
		features: ReturnType<typeof scoreGradientFieldTopologyEvidence>["features"]
		score: number
		threshold: number
		margin: number
		eligible: boolean
	}>
	observation224: {
		score: number
		margin: number
		eligible: boolean
	}
} | {
	status: "ambiguous" | "unmappable" | "indistinguishable"
	backgroundFamilyStableKey: string | null
	surfaceFamilyStableKey: string | null
	profiles: []
	observation224: null
})

type ExactAxisSegment = {
	start: number
	endExclusive: number
	overlapNumerator: bigint
}

type SummedAreaTable = {
	stride: number
	data: Uint32Array
}

type InternalFamily = {
	id: number
	stableKey: string
	kind: NativeFieldFamilyNode["kind"]
	anchor: ConnectedFamilyCandidate
	members: ConnectedFamilyCandidate[]
	mask: Uint8Array
	maskSha256: string
	center: NativeFieldRepresentative
	representatives: NativeFieldRepresentative[]
	nativeSpatial: CandidateSpatialEvidence
	nativeFields: ReturnType<typeof weightedFieldsForMask>
}

type ProfileContext = {
	id: string
	maxEdge: number
	image: RawImage
	analysis: RegionAnalysis
	rasterSha256: string
	familyEvidence: Map<string, {
		fields: ReturnType<typeof weightedFields>
		spatial: CandidateSpatialEvidence
	}>
	partitionSha256: string
}

const epsilon = 1e-12

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function rasterSha256(image: Pick<RawImage, "width" | "height" | "data">): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

function typedArraySha256(value: Int32Array | Uint8Array): string {
	return createHash("sha256").update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).digest("hex")
}

function exactAxisSegments(
	lowerNumerator: bigint,
	upperNumerator: bigint,
	q: bigint,
	extent: number,
): readonly ExactAxisSegment[] {
	if (q <= 0n || lowerNumerator < 0n || upperNumerator <= lowerNumerator || upperNumerator > BigInt(extent) * q) {
		throw new RangeError("Projection axis interval is invalid")
	}
	const segments: ExactAxisSegment[] = []
	const lowerPixel = lowerNumerator / q
	const lowerRemainder = lowerNumerator % q
	if (lowerRemainder !== 0n) {
		const pixelEnd = (lowerPixel + 1n) * q
		const segmentEnd = upperNumerator < pixelEnd ? upperNumerator : pixelEnd
		segments.push({
			start: Number(lowerPixel),
			endExclusive: Number(lowerPixel + 1n),
			overlapNumerator: segmentEnd - lowerNumerator,
		})
		if (upperNumerator <= pixelEnd) return segments
	}
	const fullStart = lowerRemainder === 0n ? lowerPixel : lowerPixel + 1n
	const upperPixel = upperNumerator / q
	const upperRemainder = upperNumerator % q
	if (upperPixel > fullStart) {
		segments.push({ start: Number(fullStart), endExclusive: Number(upperPixel), overlapNumerator: q })
	}
	if (upperRemainder !== 0n) {
		segments.push({ start: Number(upperPixel), endExclusive: Number(upperPixel + 1n), overlapNumerator: upperRemainder })
	}
	if (segments.length === 0 || segments.length > 3) throw new Error("Projection axis segmentation failed")
	return segments
}

function axisCellSegments(sourceExtent: number, targetExtent: number): readonly (readonly ExactAxisSegment[])[] {
	const source = BigInt(sourceExtent)
	const q = BigInt(targetExtent)
	return Array.from({ length: targetExtent }, (_, index) => exactAxisSegments(
		BigInt(index) * source,
		BigInt(index + 1) * source,
		q,
		sourceExtent,
	))
}

function buildSummedAreaTable(
	mask: Uint8Array,
	width: number,
	height: number,
	reusable?: SummedAreaTable,
): SummedAreaTable {
	if (mask.length !== width * height) throw new Error("Projection mask dimensions are invalid")
	const stride = width + 1
	const data = reusable?.stride === stride && reusable.data.length === stride * (height + 1)
		? reusable.data
		: new Uint32Array(stride * (height + 1))
	data.fill(0)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = mask[y * width + x]
			if (value !== 0 && value !== 1) throw new Error("Projection masks must be binary")
			const target = (y + 1) * stride + x + 1
			data[target] = value + data[target - 1] + data[target - stride] - data[target - stride - 1]
		}
	}
	return { stride, data }
}

function weightedCellCount(
	sat: SummedAreaTable,
	xSegments: readonly ExactAxisSegment[],
	ySegments: readonly ExactAxisSegment[],
): number {
	let weighted = 0
	for (const y of ySegments) {
		for (const x of xSegments) {
			const topLeft = y.start * sat.stride + x.start
			const topRight = y.start * sat.stride + x.endExclusive
			const bottomLeft = y.endExclusive * sat.stride + x.start
			const bottomRight = y.endExclusive * sat.stride + x.endExclusive
			const count = sat.data[bottomRight] - sat.data[topRight] - sat.data[bottomLeft] + sat.data[topLeft]
			weighted += count * Number(x.overlapNumerator) * Number(y.overlapNumerator)
		}
	}
	if (!Number.isSafeInteger(weighted) || weighted < 0) throw new Error("Projected family area is invalid")
	return weighted
}

function weightedFields(numerators: Float64Array, analysis: RegionAnalysis) {
	let mass = 0
	let background = 0
	let saliency = 0
	let text = 0
	for (let pixel = 0; pixel < numerators.length; pixel++) {
		const weight = numerators[pixel]
		if (weight === 0) continue
		const region = analysis.regions[analysis.labels[pixel]]
		mass += weight
		background += weight * region.background
		saliency += weight * region.saliency
		text += weight * region.text
	}
	if (!(mass > 0) || !Number.isFinite(mass)) throw new Error("Projected family has no finite observation mass")
	return {
		population: mass / numerators.length,
		background: background / mass,
		saliency: saliency / mass,
		text: text / mass,
	}
}

function weightedFieldsForMask(mask: Uint8Array, analysis: RegionAnalysis) {
	const weights = Float64Array.from(mask)
	return weightedFields(weights, analysis)
}

function nearestPixelToCenter(mask: Uint8Array, analysis: RegionAnalysis): { index: number; lab: OKLab } {
	let count = 0
	const center = [0, 0, 0]
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		const lab = labAt(analysis.labs, pixel)
		center[0] += lab[0]
		center[1] += lab[1]
		center[2] += lab[2]
		count++
	}
	if (count === 0) throw new Error("Family mask is empty")
	center[0] /= count
	center[1] /= count
	center[2] /= count
	let index = -1
	let distance = Infinity
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		const candidateDistance = okDistance(labAt(analysis.labs, pixel), center as unknown as OKLab)
		if (candidateDistance < distance || candidateDistance === distance && pixel < index) {
			distance = candidateDistance
			index = pixel
		}
	}
	return { index, lab: labAt(analysis.labs, index) }
}

function largestComponentMask(mask: Uint8Array, width: number, height: number): Uint8Array {
	const visited = new Uint8Array(mask.length)
	const stack = new Int32Array(mask.length)
	let bestStart = -1
	let bestSize = 0
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		let stackLength = 1
		stack[0] = start
		visited[start] = 1
		let size = 0
		while (stackLength > 0) {
			const pixel = stack[--stackLength]
			size++
			const x = pixel % width
			const y = Math.floor(pixel / width)
			const neighbors = [
				x > 0 ? pixel - 1 : -1,
				x + 1 < width ? pixel + 1 : -1,
				y > 0 ? pixel - width : -1,
				y + 1 < height ? pixel + width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack[stackLength++] = neighbor
				}
			}
		}
		if (size > bestSize || size === bestSize && start < bestStart) {
			bestStart = start
			bestSize = size
		}
	}
	const output = new Uint8Array(mask.length)
	if (bestStart < 0) return output
	visited.fill(0)
	let stackLength = 1
	stack[0] = bestStart
	visited[bestStart] = 1
	while (stackLength > 0) {
		const pixel = stack[--stackLength]
		output[pixel] = 1
		const x = pixel % width
		const y = Math.floor(pixel / width)
		const neighbors = [
			x > 0 ? pixel - 1 : -1,
			x + 1 < width ? pixel + 1 : -1,
			y > 0 ? pixel - width : -1,
			y + 1 < height ? pixel + width : -1,
		]
		for (const neighbor of neighbors) {
			if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
				visited[neighbor] = 1
				stack[stackLength++] = neighbor
			}
		}
	}
	return output
}

function candidateRepresentative(
	familyStableKey: string,
	candidate: ConnectedFamilyCandidate,
	representativePixelIndex: number,
	criterion: NativeFieldRepresentativeCriterion,
): NativeFieldRepresentative {
	return {
		stableKey: "",
		familyStableKey,
		rgb: [...candidate.rgb],
		lab: [...candidate.lab],
		hex: candidate.hex.toLowerCase(),
		representativePixelIndex,
		construction: candidate.construction,
		fieldRoleAllowed: candidate.fieldRoleAllowed,
		selectedBy: [criterion],
		evidence: {
			population: candidate.population,
			saliency: candidate.saliency,
			text: candidate.text,
			chroma: candidate.chroma,
			detail: Math.max(candidate.spatial.detail, candidate.familySpatial.detail),
		},
	}
}

function familyRepresentative(
	familyStableKey: string,
	mask: Uint8Array,
	analysis: RegionAnalysis,
	fields: ReturnType<typeof weightedFieldsForMask>,
	spatial: CandidateSpatialEvidence,
	construction: "family-largest-component" | "family-center",
	criterion: "largest-component" | "center",
	fieldRoleAllowed: boolean,
): NativeFieldRepresentative {
	const selected = nearestPixelToCenter(mask, analysis)
	const rgb = rgbAt(analysis.data, selected.index)
	return {
		stableKey: "",
		familyStableKey,
		rgb,
		lab: selected.lab,
		hex: rgbToHex(rgb).toLowerCase(),
		representativePixelIndex: selected.index,
		construction,
		fieldRoleAllowed,
		selectedBy: [criterion],
		evidence: {
			population: fields.population,
			saliency: fields.saliency,
			text: fields.text,
			chroma: chroma(selected.lab),
			detail: spatial.detail,
		},
	}
}

function chooseCandidate(
	members: readonly ConnectedFamilyCandidate[],
	records: ReadonlyMap<number, { representativePixelIndex: number }>,
	criterion: Exclude<NativeFieldRepresentativeCriterion, "largest-component" | "center">,
	fieldFamily: boolean,
): NativeFieldRepresentative {
	const eligible = criterion === "population" && fieldFamily
		? members.filter((candidate) => candidate.fieldRoleAllowed)
		: [...members]
	if (eligible.length === 0) throw new Error(`Representative criterion ${criterion} has no candidates`)
	const value = (candidate: ConnectedFamilyCandidate): number => {
		switch (criterion) {
			case "population": return candidate.population
			case "saliency": return candidate.saliency
			case "text": return candidate.text
			case "chroma": return candidate.chroma
			case "darkest": return -candidate.lab[0]
			case "lightest": return candidate.lab[0]
		}
	}
	const ordered = eligible.sort((first, second) => value(second) - value(first) ||
		records.get(first.id)!.representativePixelIndex - records.get(second.id)!.representativePixelIndex || first.id - second.id)
	const selected = ordered[0]
	return candidateRepresentative("", selected, records.get(selected.id)!.representativePixelIndex, criterion)
}

function buildRepresentatives(
	familyStableKey: string,
	kind: NativeFieldFamilyNode["kind"],
	members: readonly ConnectedFamilyCandidate[],
	records: ReadonlyMap<number, { representativePixelIndex: number }>,
	mask: Uint8Array,
	analysis: RegionAnalysis,
	fields: ReturnType<typeof weightedFieldsForMask>,
	spatial: CandidateSpatialEvidence,
): NativeFieldRepresentative[] {
	const selected = (["population", "saliency", "text", "chroma", "darkest", "lightest"] as const)
		.map((criterion) => chooseCandidate(members, records, criterion, kind === "primary-field"))
	selected.push(familyRepresentative(
		familyStableKey,
		largestComponentMask(mask, analysis.width, analysis.height),
		analysis,
		fields,
		spatial,
		"family-largest-component",
		"largest-component",
		kind === "primary-field",
	))
	selected.push(familyRepresentative(
		familyStableKey, mask, analysis, fields, spatial, "family-center", "center", kind === "primary-field",
	))
	const byIndex = new Map<number, NativeFieldRepresentative>()
	for (const representative of selected) {
		representative.familyStableKey = familyStableKey
		const current = byIndex.get(representative.representativePixelIndex)
		if (current) {
			current.selectedBy.push(...representative.selectedBy)
			current.fieldRoleAllowed ||= representative.fieldRoleAllowed
			continue
		}
		byIndex.set(representative.representativePixelIndex, representative)
	}
	const representatives = [...byIndex.values()].sort((first, second) =>
		first.representativePixelIndex - second.representativePixelIndex)
	for (const representative of representatives) {
		representative.selectedBy.sort((first, second) =>
			NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY.representativeCriteria.indexOf(first) -
			NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY.representativeCriteria.indexOf(second))
		representative.stableKey = `${familyStableKey}:${representative.representativePixelIndex.toString().padStart(12, "0")}:${representative.hex}`
	}
	if (representatives.length > NATIVE_FIELD_HYPOTHESIS_MAXIMUM_REPRESENTATIVES) {
		throw new Error(`Family ${familyStableKey} exceeds the representative bound`)
	}
	return representatives
}

function spatialSummary(spatial: CandidateSpatialEvidence) {
	const largestComponentPopulation = Math.max(0, ...spatial.components.map((component) => component.population))
	const expectedField = spatial.population > 0 ? largestComponentPopulation / Math.sqrt(spatial.population) : 0
	if (Math.abs(spatial.field - expectedField) > 1e-12) {
		throw new Error(`Spatial field summary is internally inconsistent: ${JSON.stringify({
			population: spatial.population,
			field: spatial.field,
			expectedField,
			largestComponentPopulation,
			componentCount: spatial.components.length,
		})}`)
	}
	return {
		field: spatial.field,
		detail: spatial.detail,
		frame: spatial.frame,
		largestComponentPopulation,
		componentCount: spatial.components.length,
	}
}

function freezeSpatialSnapshot(spatial: CandidateSpatialEvidence): CandidateSpatialEvidence {
	for (const component of spatial.components) {
		Object.freeze(component.regionIds)
		Object.freeze(component.sideCoverage)
		Object.freeze(component)
	}
	Object.freeze(spatial.regionIds)
	Object.freeze(spatial.components)
	Object.freeze(spatial.sideCoverage)
	return Object.freeze(spatial)
}

function makeEvidenceNode(
	id: number,
	family: InternalFamily,
	fields: ReturnType<typeof weightedFields>,
	spatial: CandidateSpatialEvidence,
): PaletteEvidenceNode & { fieldRoleAllowed: boolean } {
	const representative = family.center
	const candidate: Candidate = {
		id,
		rgb: representative.rgb,
		lab: representative.lab,
		hex: representative.hex,
		population: fields.population,
		background: fields.background,
		saliency: fields.saliency,
		text: fields.text,
		chroma: representative.evidence.chroma,
		generated: false,
		typographyOnly: false,
		regionIds: spatial.regionIds,
		familyId: id,
		spatial,
		familySpatial: spatial,
	}
	const familyRecord: ColorFamilyRecord = {
		id,
		anchorCandidateId: id,
		memberCandidateIds: [id],
		primaryCandidateIds: [id],
		mask: new Uint8Array(spatial.population > 0 ? 1 : 0),
		spatial,
	}
	return {
		id,
		stableKey: family.stableKey,
		rgb: candidate.rgb,
		lab: candidate.lab,
		hex: candidate.hex,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
		typographyOnly: false,
		regionIds: spatial.regionIds,
		spatial,
		familyId: id,
		familySpatial: spatial,
		mask: new Uint8Array(1),
		binIds: [],
		representativePixelIndex: representative.representativePixelIndex,
		family: familyRecord,
		candidate,
		fieldRoleAllowed: family.kind === "primary-field",
	}
}

function evidenceSummary(
	fields: ReturnType<typeof weightedFields>,
	spatial: CandidateSpatialEvidence,
	fieldEligibility: SourceFieldEligibility,
	nativePopulation: number,
): FieldEvidenceSummary {
	return {
		population: fields.population,
		background: fields.background,
		saliency: fields.saliency,
		text: fields.text,
		spatial: spatialSummary(spatial),
		fieldEligibility,
		oneFieldFit: harmonicConjunction([clampRelationEvidence(fields.population / 0.5), fieldEligibility.support]),
		nativePopulationMovement: fields.population - nativePopulation,
	}
}

function summarize(values: readonly number[]): ScalarScaleSummary {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value))) throw new Error("Scale summary is not finite")
	const minimum = Math.min(...values)
	const maximum = Math.max(...values)
	return { minimum, maximum, mean: values.reduce((sum, value) => sum + value, 0) / values.length, range: maximum - minimum }
}

function projectFamilies(
	families: readonly InternalFamily[],
	native: RawImage,
	analysis: RegionAnalysis,
): { evidence: ProfileContext["familyEvidence"]; partitionSha256: string } {
	const primary = families.filter((family) => family.kind === "primary-field").sort((first, second) =>
		compareAscii(first.stableKey, second.stableKey))
	const overlays = families.filter((family) => family.kind === "connected-overlay")
	const targetPixels = analysis.width * analysis.height
	const denominator = native.width * native.height
	const xCells = axisCellSegments(native.width, analysis.width)
	const yCells = axisCellSegments(native.height, analysis.height)
	const planes = new Map<string, Float64Array>()
	const labels = new Int32Array(targetPixels).fill(-1)
	const bestNumerators = new Float64Array(targetPixels).fill(-1)
	let reusableSat: SummedAreaTable | undefined
	for (const [familyIndex, family] of primary.entries()) {
		const sat = buildSummedAreaTable(family.mask, native.width, native.height, reusableSat)
		reusableSat = sat
		const plane = new Float64Array(targetPixels)
		let target = 0
		for (let y = 0; y < analysis.height; y++) {
			for (let x = 0; x < analysis.width; x++) {
				const numerator = weightedCellCount(sat, xCells[x], yCells[y])
				plane[target] = numerator / denominator
				if (numerator > bestNumerators[target] || numerator === bestNumerators[target] &&
					(labels[target] < 0 || compareAscii(family.stableKey, primary[labels[target]].stableKey) < 0)) {
					bestNumerators[target] = numerator
					labels[target] = familyIndex
				}
				target++
			}
		}
		planes.set(family.stableKey, plane)
	}
	for (let pixel = 0; pixel < targetPixels; pixel++) {
		let sum = 0
		for (const family of primary) sum += planes.get(family.stableKey)![pixel]
		if (labels[pixel] < 0 || Math.abs(sum - 1) > 1e-12) throw new Error("Projected primary families do not partition")
	}
	const masks = new Map<string, Uint8Array>()
	for (const family of primary) masks.set(family.stableKey, new Uint8Array(targetPixels))
	for (let pixel = 0; pixel < targetPixels; pixel++) masks.get(primary[labels[pixel]].stableKey)![pixel] = 1
	for (const family of overlays) {
		const sat = buildSummedAreaTable(family.mask, native.width, native.height, reusableSat)
		reusableSat = sat
		const plane = new Float64Array(targetPixels)
		const mask = new Uint8Array(targetPixels)
		let target = 0
		for (let y = 0; y < analysis.height; y++) {
			for (let x = 0; x < analysis.width; x++) {
				const numerator = weightedCellCount(sat, xCells[x], yCells[y])
				plane[target] = numerator / denominator
				if (numerator * 2 >= denominator) mask[target] = 1
				target++
			}
		}
		planes.set(family.stableKey, plane)
		masks.set(family.stableKey, mask)
	}
	const evidence = new Map<string, { fields: ReturnType<typeof weightedFields>; spatial: CandidateSpatialEvidence }>()
	for (const family of families) {
		const spatial = spatialEvidence(analysis, masks.get(family.stableKey)!)
		spatialSummary(spatial)
		freezeSpatialSnapshot(spatial)
		evidence.set(family.stableKey, {
			fields: weightedFields(planes.get(family.stableKey)!, analysis),
			spatial,
		})
	}
	return { evidence, partitionSha256: typedArraySha256(labels) }
}

function buildProfile(native: RawImage, maxEdge: number): ProfileContext {
	const scale = Math.min(1, maxEdge / Math.max(native.width, native.height))
	const width = Math.max(1, Math.floor(native.width * scale))
	const height = Math.max(1, Math.floor(native.height * scale))
	const image = resizeAreaBox(native, width, height)
	return {
		id: `max-edge-${maxEdge}-area-srgb`,
		maxEdge,
		image,
		analysis: analyzeRegions(image),
		rasterSha256: rasterSha256(image),
		familyEvidence: new Map(),
		partitionSha256: "",
	}
}

function resizeAreaBox(source: RawImage, width: number, height: number): RawImage {
	if (width > source.width || height > source.height || width <= 0 || height <= 0) {
		throw new Error("Area-box observation dimensions are invalid")
	}
	if (width === source.width && height === source.height) {
		return { ...source, data: new Uint8Array(source.data) }
	}
	const denominator = source.width * source.height
	if (!Number.isSafeInteger(denominator * 255)) throw new Error("Area-box observation accumulator is unsafe")
	const xCells = axisCellSegments(source.width, width)
	const yCells = axisCellSegments(source.height, height)
	const data = new Uint8Array(width * height * 3)
	let target = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const sums = [0, 0, 0]
			for (const ySegment of yCells[y]) {
				for (const xSegment of xCells[x]) {
					const weight = Number(xSegment.overlapNumerator) * Number(ySegment.overlapNumerator)
					for (let sourceY = ySegment.start; sourceY < ySegment.endExclusive; sourceY++) {
						for (let sourceX = xSegment.start; sourceX < xSegment.endExclusive; sourceX++) {
							const offset = (sourceY * source.width + sourceX) * 3
							sums[0] += source.data[offset] * weight
							sums[1] += source.data[offset + 1] * weight
							sums[2] += source.data[offset + 2] * weight
						}
					}
				}
			}
			const offset = target++ * 3
			data[offset] = Math.floor((sums[0] + denominator / 2) / denominator)
			data[offset + 1] = Math.floor((sums[1] + denominator / 2) / denominator)
			data[offset + 2] = Math.floor((sums[2] + denominator / 2) / denominator)
		}
	}
	return { width, height, data }
}

function oneTwoFieldEvidence(
	background: FieldEvidenceSummary,
	surface: FieldEvidenceSummary,
	endpointDistance: number,
): OneTwoFieldEvidence {
	const pairMass = background.population + surface.population
	const balance = pairMass <= epsilon ? 0 : clampRelationEvidence(
		1 - Math.abs(background.population - surface.population) / pairMass,
	)
	const distinguishability = clampRelationEvidence(endpointDistance / 0.18)
	return {
		backgroundPopulation: background.population,
		surfacePopulation: surface.population,
		pairMass,
		balance,
		distinguishability,
		incrementalSurfaceIdentity: harmonicConjunction([
			clampRelationEvidence(surface.population / 0.15),
			surface.fieldEligibility.support,
			distinguishability,
		]),
		twoFieldFit: harmonicConjunction([
			background.fieldEligibility.support,
			surface.fieldEligibility.support,
			clampRelationEvidence(pairMass / 0.6),
			balance,
			distinguishability,
		]),
	}
}

function overlayComplements(
	fieldFamilies: readonly InternalFamily[],
	overlayRepresentatives: readonly NativeFieldRepresentative[],
): OverlayComplement[] {
	return overlayRepresentatives.map((representative): OverlayComplement => {
		const distance = Math.min(...fieldFamilies.map((family) => okDistance(representative.lab, family.center.lab)))
		const overlayEvidence = Math.max(
			representative.evidence.text,
			representative.evidence.saliency,
			representative.evidence.detail,
		)
		const identityDistance = clampRelationEvidence(distance / 0.18)
		const identityStrength = Math.max(
			clampRelationEvidence(representative.evidence.chroma / 0.18),
			representative.evidence.text,
		)
		return {
			representativeKey: representative.stableKey,
			familyStableKey: representative.familyStableKey,
			hex: representative.hex,
			support: harmonicConjunction([overlayEvidence, identityDistance, identityStrength]),
			overlayEvidence,
			identityDistance,
			identityStrength,
		}
	}).filter((entry) => entry.support > 0)
		.sort((first, second) => second.support - first.support || compareAscii(first.representativeKey, second.representativeKey))
		.slice(0, 3)
}

function assertNormalized(value: unknown, path = "graph"): void {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${path} contains non-finite evidence`)
		return
	}
	if (Array.isArray(value)) {
		value.forEach((child, index) => assertNormalized(child, `${path}[${index}]`))
		return
	}
	if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) assertNormalized(child, `${path}.${key}`)
	}
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function buildOwnedNativePerception(native: RawImage): {
	analysis: RegionAnalysis
	candidates: ConnectedFamilyCandidate[]
	records: CandidatePerceptionRecord[]
	families: ColorFamilyRecord[]
} {
	const analysis = analyzeRegions(native)
	const context = buildCandidateContext(analysis, 12, true, { stableFamilyAnchors: true })
	for (const candidate of context.candidates) candidate.chroma = chroma(candidate.lab)
	const availabilityInput: PalettePerception = {
		version: PALETTE_PERCEPTION_VERSION,
		analysis,
		candidates: context.candidates,
		bins: context.bins,
		pixelBinIds: context.pixelBinIds,
		representativePixelIndices: context.representativePixelIndices,
		candidateRecords: context.candidateRecords,
		families: context.families,
	}
	const availability = buildConnectedFamilyCandidateAvailability(availabilityInput)
	const records: CandidatePerceptionRecord[] = [...context.candidateRecords]
	const candidates: ConnectedFamilyCandidate[] = context.candidates.map((candidate) => ({
		...candidate,
		construction: candidate.typographyOnly ? "light-typography" : "lloyd-cluster",
		fieldRoleAllowed: !candidate.typographyOnly,
		evidenceMaskSha256: sha256(context.candidateRecords.find((record) => record.candidateId === candidate.id)!.mask),
	}))
	const families: ColorFamilyRecord[] = [...context.families]
	let nextCandidateId = candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1) + 1
	let nextFamilyId = families.reduce((maximum, family) => Math.max(maximum, family.id), -1) + 1
	for (const proposal of [...availability.proposals].sort((first, second) => compareAscii(first.stableKey, second.stableKey))) {
		const id = nextCandidateId++
		const familyId = nextFamilyId++
		const mask = proposal.mask
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
			regionIds: [...proposal.spatial.regionIds],
			familyId,
			spatial: proposal.spatial,
			familySpatial: proposal.spatial,
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
			spatial: proposal.spatial,
		})
	}
	return { analysis, candidates, records, families }
}

function queryPrimaryFamilyMembership(
	native: RawImage,
	analysis: RegionAnalysis,
	primary: readonly InternalFamily[],
	partitionLabels: Int16Array,
	requestedRgbs: readonly RGB[],
): NativeFieldFamilyQuery[] {
	return requestedRgbs.map((requested): NativeFieldFamilyQuery => {
		if (!Array.isArray(requested) || requested.length !== 3 ||
			requested.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
			throw new Error("Native field family query RGB must contain three byte values")
		}
		const queryRgb: RGB = [requested[0], requested[1], requested[2]]
		const target = rgbToOKLab(queryRgb)
		const exactFamilies = new Set<number>()
		const exactPixels = new Map<number, number>()
		const nearest = primary.map(() => ({ distance: Infinity, pixel: -1 }))
		for (let pixel = 0; pixel < partitionLabels.length; pixel++) {
			const family = partitionLabels[pixel]
			if (family < 0 || family >= primary.length) throw new Error("Native primary partition query label is invalid")
			const rgb = rgbAt(native.data, pixel)
			if (rgb[0] === queryRgb[0] && rgb[1] === queryRgb[1] && rgb[2] === queryRgb[2]) {
				exactFamilies.add(family)
				if (!exactPixels.has(family)) exactPixels.set(family, pixel)
			}
			const distance = okDistance(target, labAt(analysis.labs, pixel))
			if (distance < nearest[family].distance || distance === nearest[family].distance && pixel < nearest[family].pixel) {
				nearest[family] = { distance, pixel }
			}
		}
		if (exactFamilies.size > 1) {
			return {
				rgb: queryRgb, status: "ambiguous", familyStableKey: null, nativePixelIndex: null,
				nativeRgb: null, distance: 0, secondFamilyDistance: 0,
			}
		}
		if (exactFamilies.size === 1) {
			const family = [...exactFamilies][0]
			const pixel = exactPixels.get(family)!
			return {
				rgb: queryRgb, status: "exact-rgb", familyStableKey: primary[family].stableKey,
				nativePixelIndex: pixel, nativeRgb: rgbAt(native.data, pixel), distance: 0, secondFamilyDistance: null,
			}
		}
		const ordered = nearest.map((entry, family) => ({ ...entry, family }))
			.sort((first, second) => first.distance - second.distance ||
				compareAscii(primary[first.family].stableKey, primary[second.family].stableKey))
		const best = ordered[0]
		const second = ordered[1]
		if (!best || best.pixel < 0 || best.distance > NATIVE_FIELD_FAMILY_QUERY_POLICY.maximumOKLabDistance) {
			return {
				rgb: queryRgb, status: "unmappable", familyStableKey: null, nativePixelIndex: null,
				nativeRgb: null, distance: best && Number.isFinite(best.distance) ? best.distance : null,
				secondFamilyDistance: second && Number.isFinite(second.distance) ? second.distance : null,
			}
		}
		if (second && second.distance - best.distance <=
			NATIVE_FIELD_FAMILY_QUERY_POLICY.minimumSecondFamilyMarginExclusive) {
			return {
				rgb: queryRgb, status: "ambiguous", familyStableKey: null, nativePixelIndex: null,
				nativeRgb: null, distance: best.distance, secondFamilyDistance: second.distance,
			}
		}
		return {
			rgb: queryRgb, status: "unique-nearest", familyStableKey: primary[best.family].stableKey,
			nativePixelIndex: best.pixel, nativeRgb: rgbAt(native.data, best.pixel), distance: best.distance,
			secondFamilyDistance: second?.distance ?? null,
		}
	})
}

function buildNativeFieldHypothesisGraphInternal(
	native: RawImage,
	sourceSha256: string,
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[],
	output: "complete",
): NativeFieldHypothesisGraphWithFamilyQueries
function buildNativeFieldHypothesisGraphInternal(
	native: RawImage,
	sourceSha256: string,
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[],
	output: "queries",
): NativeFieldFamilyTopologyQueryResult
function buildNativeFieldHypothesisGraphInternal(
	native: RawImage,
	sourceSha256: string,
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[],
	output: "complete" | "queries",
): NativeFieldHypothesisGraphWithFamilyQueries | NativeFieldFamilyTopologyQueryResult {
	if (!/^[0-9a-f]{64}$/.test(sourceSha256)) throw new Error("Encoded source SHA-256 is invalid")
	const nativePixels = native.width * native.height
	if (!Number.isSafeInteger(nativePixels) || nativePixels <= 0 || nativePixels > NATIVE_IMAGE_MAXIMUM_PIXELS ||
		native.data.length !== nativePixels * 3) throw new Error("Native field graph input is invalid")
	const perception = buildOwnedNativePerception(native)
	const analysis = perception.analysis
	const candidates = new Map(perception.candidates.map((candidate) => [candidate.id, candidate]))
	const records = new Map(perception.records.map((record) => [record.candidateId, record]))
	const internalFamilies: InternalFamily[] = perception.families.map((family): InternalFamily => {
		const anchor = candidates.get(family.anchorCandidateId)
		if (!anchor) throw new Error(`Family ${family.id} has no anchor candidate`)
		const kind: NativeFieldFamilyNode["kind"] = anchor.construction === "connected-family-reserve"
			? "connected-overlay"
			: "primary-field"
		if (kind === "primary-field" && !anchor.fieldRoleAllowed || kind === "connected-overlay" && anchor.fieldRoleAllowed) {
			throw new Error(`Family ${family.id} has inconsistent field membership`)
		}
		const mask = family.mask
		const maskSha256 = sha256(mask)
		const stableKey = `${kind}:${maskSha256}:${anchor.hex.toLowerCase()}`
		const members = family.memberCandidateIds.map((candidateId) => candidates.get(candidateId)!)
		const nativeFields = weightedFieldsForMask(mask, analysis)
		const representatives = buildRepresentatives(
			stableKey, kind, members, records, mask, analysis, nativeFields, family.spatial,
		)
		const center = representatives.find((representative) => representative.selectedBy.includes("center"))
		if (!center) throw new Error(`Family ${stableKey} has no center representative`)
		return {
			id: family.id,
			stableKey,
			kind,
			anchor,
			members,
			mask,
			maskSha256,
			center,
			representatives,
			nativeSpatial: family.spatial,
			nativeFields,
		}
	}).sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const primary = internalFamilies.filter((family) => family.kind === "primary-field")
	const overlays = internalFamilies.filter((family) => family.kind === "connected-overlay")
	if (primary.length === 0 || primary.length > 12 || overlays.length > 12) throw new Error("Native family domain exceeds its bound")
	const nativePartition = new Uint8Array(nativePixels)
	const nativePartitionLabels = new Int16Array(nativePixels).fill(-1)
	for (const [familyIndex, family] of primary.entries()) for (let pixel = 0; pixel < nativePixels; pixel++) {
		if (family.mask[pixel] === 0) continue
		nativePartition[pixel]++
		if (nativePartitionLabels[pixel] === -1) nativePartitionLabels[pixel] = familyIndex
	}
	if (nativePartition.some((count) => count !== 1)) throw new Error("Native primary families do not partition")
	const queries = queryPrimaryFamilyMembership(native, analysis, primary, nativePartitionLabels, requestedRgbs)

	const profiles = NATIVE_FIELD_HYPOTHESIS_PROFILE_EDGES.map((maxEdge) => buildProfile(native, maxEdge))
	for (const profile of profiles) {
		const projected = projectFamilies(internalFamilies, native, profile.analysis)
		profile.familyEvidence = projected.evidence
		profile.partitionSha256 = projected.partitionSha256
	}

	const profileNodes = new Map<string, Map<string, PaletteEvidenceNode & { fieldRoleAllowed: boolean }>>()
	const profileEligibility = new Map<string, ReadonlyMap<number, SourceFieldEligibility>>()
	const nativeNodes = primary.map((family, index) =>
		makeEvidenceNode(index, family, family.nativeFields, family.nativeSpatial))
	const nativeNodesByKey = new Map(nativeNodes.map((node) => [node.stableKey, node]))
	const nativeEligibility = deriveSourceFieldEligibilityDomain(nativeNodes)
	for (const profile of profiles) {
		const nodes = primary.map((family, index) => {
			const evidence = profile.familyEvidence.get(family.stableKey)!
			return makeEvidenceNode(index, family, evidence.fields, evidence.spatial)
		})
		profileNodes.set(profile.id, new Map(nodes.map((node) => [node.stableKey, node])))
		profileEligibility.set(profile.id, deriveSourceFieldEligibilityDomain(nodes))
	}
	const queryByRgb = new Map(queries.map((query) => [query.rgb.join(","), query]))
	const topologyQueries = topologyPairQueries.map((requested): NativeFieldTopologyQuery => {
		const backgroundQuery = queryByRgb.get(requested.backgroundRgb.join(","))
		const surfaceQuery = queryByRgb.get(requested.surfaceRgb.join(","))
		if (!backgroundQuery || !surfaceQuery) throw new Error("Topology query endpoints must have family queries")
		const backgroundFamilyStableKey = backgroundQuery.familyStableKey
		const surfaceFamilyStableKey = surfaceQuery.familyStableKey
		if (backgroundQuery.status === "ambiguous" || surfaceQuery.status === "ambiguous") {
			return {
				backgroundRgb: [...requested.backgroundRgb], surfaceRgb: [...requested.surfaceRgb], status: "ambiguous",
				backgroundFamilyStableKey, surfaceFamilyStableKey, profiles: [], observation224: null,
			}
		}
		if (!backgroundFamilyStableKey || !surfaceFamilyStableKey) {
			return {
				backgroundRgb: [...requested.backgroundRgb], surfaceRgb: [...requested.surfaceRgb], status: "unmappable",
				backgroundFamilyStableKey, surfaceFamilyStableKey, profiles: [], observation224: null,
			}
		}
		if (backgroundFamilyStableKey === surfaceFamilyStableKey) {
			return {
				backgroundRgb: [...requested.backgroundRgb], surfaceRgb: [...requested.surfaceRgb], status: "indistinguishable",
				backgroundFamilyStableKey, surfaceFamilyStableKey, profiles: [], observation224: null,
			}
		}
		const decisions = profiles.map((profile) => {
			const nodes = profileNodes.get(profile.id)!
			const backgroundNode = nodes.get(backgroundFamilyStableKey)!
			const surfaceNode = nodes.get(surfaceFamilyStableKey)!
			const backgroundCandidate: Candidate = {
				...backgroundNode.candidate,
				rgb: [...requested.backgroundRgb],
				lab: rgbToOKLab(requested.backgroundRgb),
				hex: rgbToHex(requested.backgroundRgb),
				chroma: chroma(rgbToOKLab(requested.backgroundRgb)),
			}
			const surfaceCandidate: Candidate = {
				...surfaceNode.candidate,
				rgb: [...requested.surfaceRgb],
				lab: rgbToOKLab(requested.surfaceRgb),
				hex: rgbToHex(requested.surfaceRgb),
				chroma: chroma(rgbToOKLab(requested.surfaceRgb)),
			}
			const evidence = analyzeGradientFieldTopology(backgroundCandidate, surfaceCandidate, profile.analysis)
			const decision = scoreGradientFieldTopologyEvidence(evidence)
			return {
				profileId: profile.id,
				endpointDistance: evidence.endpointDistance,
				features: decision.features,
				score: decision.score,
				threshold: decision.threshold,
				margin: decision.margin,
				eligible: decision.eligible,
			}
		})
		const observation224 = decisions.find((decision) => decision.profileId === "max-edge-224-area-srgb")
		if (!observation224) throw new Error("Topology query has no 224 observation decision")
		return {
			backgroundRgb: [...requested.backgroundRgb],
			surfaceRgb: [...requested.surfaceRgb],
			status: "mapped",
			backgroundFamilyStableKey,
			surfaceFamilyStableKey,
			profiles: decisions,
			observation224: {
				score: observation224.score,
				margin: observation224.margin,
				eligible: observation224.eligible,
			},
		}
	})
	if (output === "queries") {
		return deepFreeze({ queryPolicy: NATIVE_FIELD_FAMILY_QUERY_POLICY, queries, topologyQueries })
	}

	const familyNodes = internalFamilies.map((family): NativeFieldFamilyNode => {
		const nativeNode = family.kind === "primary-field"
			? nativeNodesByKey.get(family.stableKey)!
			: makeEvidenceNode(family.id, family, family.nativeFields, family.nativeSpatial)
		const familyNativeEligibility = family.kind === "primary-field"
			? nativeEligibility.get(nativeNode.id)!
			: deriveSourceFieldEligibilityDomain([nativeNode]).get(nativeNode.id)!
		return {
			id: family.id,
			stableKey: family.stableKey,
			kind: family.kind,
			anchorCandidateId: family.anchor.id,
			memberCandidateIds: family.members.map((candidate) => candidate.id).sort((first, second) => first - second),
			maskSha256: family.maskSha256,
			population: family.nativeFields.population,
			centerRepresentativeKey: family.center.stableKey,
			representatives: family.representatives,
			native: evidenceSummary(
				family.nativeFields, family.nativeSpatial, familyNativeEligibility, family.nativeFields.population,
			),
			profiles: profiles.map((profile) => {
				const evidence = profile.familyEvidence.get(family.stableKey)!
				const eligibility = family.kind === "primary-field"
					? profileEligibility.get(profile.id)!.get(profileNodes.get(profile.id)!.get(family.stableKey)!.id)!
					: deriveSourceFieldEligibilityDomain([
						makeEvidenceNode(family.id, family, evidence.fields, evidence.spatial),
					]).get(family.id)!
				return {
					profileId: profile.id,
					width: profile.image.width,
					height: profile.image.height,
					evidence: evidenceSummary(
						evidence.fields, evidence.spatial, eligibility, family.nativeFields.population,
					),
				}
			}),
		}
	})
	const familyNodeByKey = new Map(familyNodes.map((family) => [family.stableKey, family]))
	const relations: NativeFieldRelationRecord[] = []
	for (const background of primary) {
		for (const surface of primary) {
			if (background === surface) continue
			const relationProfiles = profiles.map((profile) => {
				const nodes = profileNodes.get(profile.id)!
				const backgroundNode = nodes.get(background.stableKey)!
				const surfaceNode = nodes.get(surface.stableKey)!
				const eligibility = profileEligibility.get(profile.id)!
				const relation = deepFreeze(analyzeFieldRelation(
					backgroundNode,
					surfaceNode,
					eligibility.get(backgroundNode.id)!,
					eligibility.get(surfaceNode.id)!,
					profile.analysis,
				))
				const backgroundEvidence = familyNodeByKey.get(background.stableKey)!.profiles.find((entry) =>
					entry.profileId === profile.id)!.evidence
				const surfaceEvidence = familyNodeByKey.get(surface.stableKey)!.profiles.find((entry) =>
					entry.profileId === profile.id)!.evidence
				const oneTwo = oneTwoFieldEvidence(backgroundEvidence, surfaceEvidence, relation.endpointDistance)
				const largerStateSupport = relation.stateSupport.distinctFlat === relation.stateSupport.gradient
					? "tie" as const
					: relation.stateSupport.distinctFlat > relation.stateSupport.gradient
						? "distinct-flat" as const
						: "gradient" as const
				return { profileId: profile.id, relation, oneTwoField: oneTwo, largerStateSupport }
			})
			const stateCounts = {
				distinctFlat: relationProfiles.filter((entry) => entry.largerStateSupport === "distinct-flat").length,
				gradient: relationProfiles.filter((entry) => entry.largerStateSupport === "gradient").length,
				tie: relationProfiles.filter((entry) => entry.largerStateSupport === "tie").length,
			}
			relations.push({
				stableKey: `${background.stableKey}>${surface.stableKey}`,
				backgroundFamilyStableKey: background.stableKey,
				surfaceFamilyStableKey: surface.stableKey,
				backgroundRepresentativeKey: background.center.stableKey,
				surfaceRepresentativeKey: surface.center.stableKey,
				endpointDistance: okDistance(background.center.lab, surface.center.lab),
				profiles: relationProfiles,
				scale: {
					distinctFlatSupport: summarize(relationProfiles.map((entry) => entry.relation.stateSupport.distinctFlat)),
					gradientSupport: summarize(relationProfiles.map((entry) => entry.relation.stateSupport.gradient)),
					twoFieldFit: summarize(relationProfiles.map((entry) => entry.oneTwoField.twoFieldFit)),
					incrementalSurfaceIdentity: summarize(relationProfiles.map((entry) =>
						entry.oneTwoField.incrementalSurfaceIdentity)),
					stateAgreement: Math.max(stateCounts.distinctFlat, stateCounts.gradient, stateCounts.tie) / profiles.length,
					stateCounts,
				},
			})
		}
	}
	relations.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const overlayRepresentatives = internalFamilies.flatMap((family) => family.representatives)
		.filter((representative) => !representative.fieldRoleAllowed)
	const relationsByKey = new Map(relations.map((relation) => [relation.stableKey, relation]))
	const hypotheses: NativeFieldHypothesis[] = []
	for (const background of primary) {
		const node = familyNodeByKey.get(background.stableKey)!
		const oneFieldFit = summarize(node.profiles.map((profile) => profile.evidence.oneFieldFit))
		hypotheses.push({
			stableKey: `collapsed:${background.stableKey}`,
			state: "collapsed",
			backgroundFamilyStableKey: background.stableKey,
			surfaceFamilyStableKey: null,
			relationStableKey: null,
			stateSupport: oneFieldFit,
			oneFieldFit,
			twoFieldFit: null,
			incrementalSurfaceIdentity: null,
			overlayComplements: overlayComplements([background], overlayRepresentatives),
		})
		for (const surface of primary) {
			if (surface === background) continue
			const relation = relationsByKey.get(`${background.stableKey}>${surface.stableKey}`)!
			for (const state of ["distinct-flat", "gradient"] as const) {
				hypotheses.push({
					stableKey: `${state}:${relation.stableKey}`,
					state,
					backgroundFamilyStableKey: background.stableKey,
					surfaceFamilyStableKey: surface.stableKey,
					relationStableKey: relation.stableKey,
					stateSupport: state === "distinct-flat" ? relation.scale.distinctFlatSupport : relation.scale.gradientSupport,
					oneFieldFit,
					twoFieldFit: relation.scale.twoFieldFit,
					incrementalSurfaceIdentity: relation.scale.incrementalSurfaceIdentity,
					overlayComplements: overlayComplements([background, surface], overlayRepresentatives),
				})
			}
		}
	}
	hypotheses.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const expectedRelations = primary.length * (primary.length - 1)
	const counts = {
		primaryFieldFamilies: primary.length,
		connectedOverlayFamilies: overlays.length,
		representatives: familyNodes.reduce((sum, family) => sum + family.representatives.length, 0),
		maximumRepresentativesPerFamily: Math.max(...familyNodes.map((family) => family.representatives.length)),
		orderedRelations: relations.length,
		collapsedHypotheses: hypotheses.filter((hypothesis) => hypothesis.state === "collapsed").length,
		distinctFlatHypotheses: hypotheses.filter((hypothesis) => hypothesis.state === "distinct-flat").length,
		gradientHypotheses: hypotheses.filter((hypothesis) => hypothesis.state === "gradient").length,
		totalHypotheses: hypotheses.length,
		logicalHypothesisBound: 276,
	}
	if (relations.length !== expectedRelations || counts.collapsedHypotheses !== primary.length ||
		counts.distinctFlatHypotheses !== expectedRelations || counts.gradientHypotheses !== expectedRelations ||
		counts.totalHypotheses !== primary.length + expectedRelations * 2) {
		throw new Error("Native field hypothesis domain is incomplete")
	}
	for (const family of internalFamilies) {
		for (const representative of family.representatives) {
			if (representative.representativePixelIndex < 0 || representative.representativePixelIndex >= nativePixels ||
				representative.rgb.some((channel, index) => channel !==
					native.data[representative.representativePixelIndex * 3 + index])) {
				throw new Error(`Representative ${representative.stableKey} is not an exact native pixel`)
			}
		}
	}
	const graph: NativeFieldHypothesisGraph = {
		schemaVersion: 1,
		version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
		policy: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY,
		policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
		source: { sha256: sourceSha256 },
		native: { width: native.width, height: native.height, rasterSha256: rasterSha256(native) },
		profiles: profiles.map((profile) => ({
			id: profile.id,
			maxEdge: profile.maxEdge,
			width: profile.image.width,
			height: profile.image.height,
			rasterSha256: profile.rasterSha256,
		})),
		families: familyNodes,
		relations,
		hypotheses,
		certificate: {
			counts,
			partitions: {
				nativePrimaryPartitionSha256: typedArraySha256(nativePartition),
				profilePrimaryPartitionSha256: Object.fromEntries(profiles.map((profile) => [
					profile.id, profile.partitionSha256,
				])),
			},
			invariants: {
				exactNativeRepresentatives: true,
				nativePrimaryPartition: true,
				projectedPrimaryPartitions: true,
				connectedFamiliesOverlayOnly: true,
				boundedRepresentativeFrontiers: true,
				completeOrderedRelations: true,
				completeStateEnumeration: true,
				finiteNormalizedEvidence: true,
				generatedColorsUsed: false,
				paletteOutputProduced: false,
				canonicalRoleColorsUsed: false,
			},
		},
	}
	assertNormalized(graph)
	return deepFreeze({ graph, queryPolicy: NATIVE_FIELD_FAMILY_QUERY_POLICY, queries, topologyQueries })
}

export function buildNativeFieldHypothesisGraph(native: RawImage, sourceSha256: string): NativeFieldHypothesisGraph {
	return buildNativeFieldHypothesisGraphInternal(native, sourceSha256, [], [], "complete").graph
}

function uniqueQueryRgbs(
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[],
): RGB[] {
	const allRgbs = [...requestedRgbs]
	for (const query of topologyPairQueries) allRgbs.push(query.backgroundRgb, query.surfaceRgb)
	return [...new Map(allRgbs.map((rgb) => [rgb.join(","), rgb])).values()]
}

export function buildNativeFieldHypothesisGraphWithFamilyQueries(
	native: RawImage,
	sourceSha256: string,
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[] = [],
): NativeFieldHypothesisGraphWithFamilyQueries {
	return buildNativeFieldHypothesisGraphInternal(
		native, sourceSha256, uniqueQueryRgbs(requestedRgbs, topologyPairQueries), topologyPairQueries, "complete",
	)
}

export function queryNativeFieldFamiliesAndTopology(
	native: RawImage,
	sourceSha256: string,
	requestedRgbs: readonly RGB[],
	topologyPairQueries: readonly NativeFieldTopologyQueryInput[] = [],
): NativeFieldFamilyTopologyQueryResult {
	return buildNativeFieldHypothesisGraphInternal(
		native, sourceSha256, uniqueQueryRgbs(requestedRgbs, topologyPairQueries), topologyPairQueries, "queries",
	)
}

export async function loadAndBuildNativeFieldHypothesisGraph(source: string | Uint8Array): Promise<NativeFieldHypothesisGraph> {
	const encoded = typeof source === "string" ? await readFile(source) : source
	const sourceSha256 = sha256(encoded)
	return buildNativeFieldHypothesisGraph(await loadNativeImage(encoded), sourceSha256)
}
