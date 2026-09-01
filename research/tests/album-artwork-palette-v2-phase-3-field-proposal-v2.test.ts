import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildNativePaletteEvidence,
	diagnoseGradientFits,
} from "../src/album-artwork-palette-v2.ts"
import type { FieldHypothesis } from "../src/album-artwork-palette-v2.ts"
import type { AlbumArtworkPaletteV2Phase3FieldProposalV2Module } from
	"../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_MODULE,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY,
	proposeAlbumArtworkPaletteV2Phase3Fields,
} from "../src/album-artwork-palette-v2-phase-3-field-proposal-v2.ts"
import { oklabToRGB } from "../src/color.ts"
import type { RGB, RawImage } from "../src/types.ts"

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function mix(first: RGB, second: RGB, amount: number): RGB {
	return [
		clampByte(first[0] + (second[0] - first[0]) * amount),
		clampByte(first[1] + (second[1] - first[1]) * amount),
		clampByte(first[2] + (second[2] - first[2]) * amount),
	]
}

function image(width: number, height: number, pixel: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

function majorHueTransition(): RawImage {
	const first: RGB = [31, 52, 137]
	const middle: RGB = [61, 163, 143]
	const last: RGB = [221, 170, 58]
	return image(112, 68, (x, y) => {
		const amount = clamp(x / 111 + 0.035 * Math.sin(Math.PI * y / 67))
		return amount < 0.48
			? mix(first, middle, amount / 0.48)
			: mix(middle, last, (amount - 0.48) / 0.52)
	})
}

function tonalField(span: number, topology: "horizontal" | "radial" = "radial"): RawImage {
	return image(144, 96, (x, y) => {
		const position = topology === "horizontal"
			? x / 143
			: clamp(Math.hypot(x / 143 - 0.5, y / 95 - 0.5) / Math.SQRT1_2)
		return oklabToRGB([0.48 + span * position, 0.018, -0.025])
	})
}

function objectLocalLighting(): RawImage {
	const background: RGB = [32, 64, 126]
	return image(112, 112, (x, y) => {
		const radius = Math.hypot(x / 111 - 0.5, y / 111 - 0.5)
		return radius < 0.28 ? mix([224, 196, 94], background, radius / 0.28) : background
	})
}

function proposal(value: RawImage) {
	const evidence = buildNativePaletteEvidence(value)
	return proposeAlbumArtworkPaletteV2Phase3Fields({
		evidence,
		gradientFits: diagnoseGradientFits(evidence),
	})
}

function hypotheses(value: ReturnType<typeof proposal>, kind?: FieldHypothesis["kind"]): FieldHypothesis[] {
	return value.fieldHypotheses
		.map(({ hypothesis }) => hypothesis)
		.filter((hypothesis) => kind === undefined || hypothesis.kind === kind)
}

function sameEndpointPair(first: FieldHypothesis, second: FieldHypothesis): boolean {
	return first.backgroundFamilyId === second.backgroundFamilyId &&
		first.surfaceFamilyId === second.surfaceFamilyId &&
		first.backgroundRepresentatives[0]?.hex === second.backgroundRepresentatives[0]?.hex &&
		first.surfaceRepresentatives[0]?.hex === second.surfaceRepresentatives[0]?.hex
}

test("module implements the common interface and retains source-supported flat proposals", () => {
	const module: AlbumArtworkPaletteV2Phase3FieldProposalV2Module =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_MODULE
	const value = majorHueTransition()
	const evidence = buildNativePaletteEvidence(value)
	const input = { evidence, gradientFits: diagnoseGradientFits(evidence) }
	const direct = proposeAlbumArtworkPaletteV2Phase3Fields(input)
	assert.deepEqual(module.propose(input), direct)
	assert.ok(direct.fieldHypotheses.length > 0)
	assert.ok(direct.fieldHypotheses.every(({ sourceType }) => sourceType === "field-proposal-v2"))
	assert.equal(direct.diagnostics.proposalCount, direct.fieldHypotheses.length)
	assert.equal(direct.diagnostics.oneFieldProposalCount, hypotheses(direct, "one-field").length)
	for (const field of hypotheses(direct)) {
		for (const representative of [...field.backgroundRepresentatives, ...field.surfaceRepresentatives]) {
			assert.equal("generated" in representative.support, false)
			if (!("generated" in representative.support)) assert.ok(representative.support.regionIds.length > 0)
		}
	}
})

test("major-hue transition keeps its native gradient and exact flat counterfactual", () => {
	const result = proposal(majorHueTransition())
	const gradients = hypotheses(result, "gradient-field")
	const flats = hypotheses(result, "separate-flat-fields")
	assert.ok(gradients.length > 0)
	assert.ok(result.diagnostics.candidates.some(({ origin, gradientEmitted }) =>
		origin === "native-transition" && gradientEmitted))
	for (const gradient of gradients) {
		assert.ok(flats.some((flat) => sameEndpointPair(flat, gradient)))
		assert.ok(gradient.gradientEvidence)
		assert.ok(gradient.gradientEvidence.modeProgression > 0)
		assert.notEqual(gradient.backgroundRepresentatives[0].hex, gradient.surfaceRepresentatives[0].hex)
	}
})

test("subtle same-family radial progression emits the pair as flat instead of an invisible gradient", () => {
	const result = proposal(tonalField(0.072))
	const radial = result.diagnostics.candidates.find(({ origin, topology }) =>
		origin === "band-local-endpoint" && topology === "radial-center")
	assert.ok(radial)
	assert.equal(radial.gradientEligible, false)
	assert.equal(radial.gradientEmitted, false)
	assert.equal(radial.flatCounterfactualEmitted, true)
	assert.ok(radial.rejectionReasons.some((reason) =>
		reason.includes("visible") || reason.includes("inconsequential") || reason.includes("salience")))
	assert.ok(hypotheses(result, "separate-flat-fields").some((flat) =>
		flat.backgroundFamilyId.startsWith("band-local:") && flat.surfaceFamilyId?.startsWith("band-local:")))
	assert.equal(hypotheses(result, "gradient-field").some(({ gradientEvidence }) =>
		gradientEvidence?.topology === "radial-center"), false)
})

test("meaningful same-family tonal progressions retain visible linear and radial gradients", () => {
	for (const [fixture, topology, direction] of [
		[tonalField(0.085, "horizontal"), "linear", "horizontal"],
		[tonalField(0.085, "radial"), "radial-center", "center-out"],
	] as const) {
		const result = proposal(fixture)
		const diagnostic = result.diagnostics.candidates.find((candidate) =>
			candidate.origin === "band-local-endpoint" &&
			candidate.topology === topology && candidate.direction === direction)
		assert.ok(diagnostic, JSON.stringify(result.diagnostics.candidates))
		assert.equal(diagnostic.gradientEligible, true, JSON.stringify(diagnostic))
		assert.equal(diagnostic.gradientEmitted, true)
		assert.ok(diagnostic.endpointDistance >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.minimumRenderedEndpointDistance)
		assert.ok(diagnostic.renderedEndpointSalience >=
			(topology === "linear"
				? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.minimumEndpointSalience
				: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.minimumSameFamilyRadialEndpointSalience))
		const gradient = hypotheses(result, "gradient-field").find(({ gradientEvidence }) =>
			gradientEvidence?.topology === topology && gradientEvidence.direction === direction)
		assert.ok(gradient)
		assert.ok(hypotheses(result, "separate-flat-fields").some((flat) => sameEndpointPair(flat, gradient)))
	}
})

test("hard regions, stripes, and object-local lighting preserve gradient negatives", () => {
	const fixtures = [
		image(112, 72, (x) => x < 56 ? [27, 55, 139] : [222, 166, 54]),
		image(112, 72, (x) => mix([29, 55, 136], [221, 169, 57], Math.floor(x / 14) / 7)),
		objectLocalLighting(),
	]
	for (const fixture of fixtures) {
		const result = proposal(fixture)
		assert.equal(hypotheses(result, "gradient-field").length, 0,
			JSON.stringify(result.diagnostics.candidates))
		assert.ok(hypotheses(result, "one-field").length > 0)
		assert.ok(result.diagnostics.candidates.every(({ gradientEmitted }) => !gradientEmitted))
	}
})

test("candidate and proposal diagnostics are deterministic and bounded", () => {
	const first = proposal(majorHueTransition())
	const second = proposal(majorHueTransition())
	assert.deepEqual(first, second)
	assert.ok(first.diagnostics.oneFieldProposalCount <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.oneFieldProposals)
	assert.ok(first.diagnostics.flatCounterfactualCount <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.endpointPairProposals)
	assert.ok(first.diagnostics.gradientProposalCount <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.gradientProposals)
	assert.ok(first.diagnostics.diagnosticCandidateCount <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.diagnosticCandidates)
	assert.equal(first.diagnostics.diagnosticCandidateCount, first.diagnostics.candidates.length)
	assert.equal(first.diagnostics.normalizedCandidateCount,
		first.diagnostics.diagnosticCandidateCount + first.diagnostics.omittedDiagnosticCandidateCount)
})

test("inference has no filesystem, metadata label, or unconstrained pair dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-field-proposal-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|feedback|review|warehouse|manifest|sourceId|caseId|artworkId|target.?color|historical)/iu)
	assert.doesNotMatch(source, /(?:readFile|writeFile|readdir|realpath|createHash|Math\.random)/u)
	assert.doesNotMatch(source, /for\s*\([^)]*firstIndex[^)]*\)[\s\S]{0,200}secondIndex/u)
})
