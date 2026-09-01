import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	projectAlbumArtworkPaletteV2Phase3WinnerResearchRender,
} from "../src/album-artwork-palette-v2-phase-3-review-render.ts"
import {
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
} from "../src/complete-palette-review-v2.ts"
import {
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath,
} from "../src/album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY,
} from "../src/album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidate,
} from "../src/album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3FinalCandidate,
} from "../src/album-artwork-palette-v2-phase-3-final-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate,
} from "../src/album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-adapter.ts"
import {
	normalizeAlbumArtworkPaletteV2Phase3Result,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import {
	compareCompleteRenderCandidates,
} from "../src/album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import { mixOKLab, oklabToRGB, rgbToHex, rgbToOKLab } from "../src/color.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import { normalizeTreatment } from "../tools/review-evidence/normalize.ts"
import type { OKLab, RawImage, RGB } from "../src/types.ts"

const identity = {
	attemptId: "phase-3-supported-gradient-path",
	configurationId: "supported-gradient-test-v1",
}

function midpoint() {
	return {
		kind: "source-supported-three-stop",
		position: 0.5,
		color: { rgb: [24, 128, 167], oklab: [0.5, 0, 0], hex: "#1880a7" },
		provenance: {
			exactSource: true,
			familyId: "family-middle",
			regionId: "region-middle",
			pixelIndex: 304,
			x: 4,
			y: 3,
			fieldDomainId: "field-domain-1",
			stageIndex: 1,
			spatialPosition: 0.5,
			colorPosition: 0.5,
			populationFraction: 0.12,
		},
	}
}

function output(midpointValue: ReturnType<typeof midpoint> | Readonly<{
	kind: "ordinary-two-stop"
	position: null
	color: null
	provenance: null
}> = midpoint()) {
	return {
		dimensions: { width: 100, height: 80 },
		winner: {
			key: "#141975:#3fa72a:#030102:#d02981:gradient",
			treatment: {
				gradient: true,
				sourceFieldHypothesisId: "field-transition-1",
			},
		},
		diagnostics: {
			phase3SupportedGradientPath: {
				configurationId: identity.configurationId,
				gradientAuthority: {
					winnerKey: "#141975:#3fa72a:#030102:#d02981:gradient",
					correspondingPathIndex: 0,
					midpoint: midpointValue,
				},
				supportedGradientPath: {
					paths: [{
						eligible: true,
						hypothesisId: "field-transition-1",
						midpointCustody: structuredClone(midpointValue),
					}],
				},
			},
		},
	}
}

test("projects an exact midpoint into a review-only three-stop descriptor", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output(), identity, "fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output({
		kind: "ordinary-two-stop", position: null, color: null, provenance: null,
	}), identity, "fixture"), undefined)
})

test("fails closed when midpoint source or winner-path custody is stale", () => {
	const staleSource = output()
	staleSource.diagnostics.phase3SupportedGradientPath.gradientAuthority.midpoint.provenance!.pixelIndex = 305
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(staleSource, identity, "fixture"),
		/source coordinates are invalid/u)
	const stalePath = output()
	stalePath.diagnostics.phase3SupportedGradientPath.supportedGradientPath.paths[0].hypothesisId = "other"
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(stalePath, identity, "fixture"),
		/not bound to the rendered winner path/u)
})

const integratedIdentity = {
	attemptId: "phase-3-integrated-candidate",
	configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
}

function integratedOutput(kind: "three" | "two" | "flat" | "none") {
	const roleColor = (rgb: RGB, hex: string, familyId: string, x: number) => ({
		rgb,
		oklab: rgbToOKLab(rgb),
		hex,
		generated: false,
		strategy: "dense-exact",
		support: {
			exactSource: true,
			exemplar: { x, y: 0 },
			anchorFamilyId: familyId,
			regionIds: [`${familyId}-region`],
			perceptualDensity: 0.5,
			totalSupport: 0.5,
			connectedSupport: 0.5,
			spatialCoverage: 0.5,
			concentration: 0.5,
			prototypeDistance: 0,
			outlierScore: 0,
			synthesis: null,
		},
	})
	const background = roleColor([20, 25, 117], "#141975", "family-background", 1)
	const surface = roleColor([63, 167, 42], "#3fa72a", "family-surface", 2)
	const foreground = roleColor([3, 1, 2], "#030102", "family-foreground", 3)
	const accent = roleColor([208, 41, 129], "#d02981", "family-accent", 4)
	const roles = { background, surface, foreground, accent }
	const familyRoles = {
		background: "family-background",
		surface: "family-surface",
		foreground: "family-foreground",
		accent: "family-accent",
	}
	const gradient = kind === "three" || kind === "two"
	const winnerKey = [...Object.values(roles).map(({ hex }) => hex), gradient ? "gradient" : "flat"].join(":")
	const gradientSiblingKey = [...Object.values(roles).map(({ hex }) => hex), "gradient"].join(":")
	const winner = {
		...roles,
		familyRoles,
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		sourceFieldHypothesisId: "field-transition-1",
		collapse: { surface: false, accent: false },
		gradientEvidence: gradient ? {
			fieldDomainId: "field-domain-1",
			topology: "linear",
			direction: "horizontal",
			backgroundTopologyEndpoint: "low",
			supportingFamilyIds: [familyRoles.background, familyRoles.surface],
			supportingEndpointHexes: [background.hex, surface.hex],
			roleAssignment: {
				backgroundFamilyId: familyRoles.background,
				surfaceFamilyId: familyRoles.surface,
			},
		} : null,
	}
	const none = { kind: "none", position: null, color: null, provenance: null }
	const ordinary = { kind: "ordinary-two-stop", position: null, color: null, provenance: null }
	const midpointValue = kind === "three" ? midpoint() : kind === "two" ? ordinary : none
	const pathMidpoint = kind === "none" ? ordinary : midpointValue
	const strictVeto = kind === "flat"
	const selectedTransitionGradient = kind !== "none"
	const pathEligible = !strictVeto
	const acceptedIntermediateSupport = kind === "three" ? [{
		stageIndex: midpointValue.provenance!.stageIndex,
		familyId: midpointValue.provenance!.familyId,
		regionId: midpointValue.provenance!.regionId,
		spatialPosition: midpointValue.provenance!.spatialPosition,
		colorPosition: midpointValue.provenance!.colorPosition,
		populationFraction: midpointValue.provenance!.populationFraction,
		directPathDifference: 0.1,
		spatialHalfwayDelta: 0,
		colorHalfwayDelta: 0,
		spatiallyHalfwayCompatible: true,
		colorHalfwayCompatible: true,
		materiallyDifferentFromDirectPath: true,
		acceptedForMidpoint: true,
		exactColor: {
			...midpointValue.color,
			provenance: {
				exactSource: true,
				familyId: midpointValue.provenance!.familyId,
				regionId: midpointValue.provenance!.regionId,
				pixelIndex: midpointValue.provenance!.pixelIndex,
				x: midpointValue.provenance!.x,
				y: midpointValue.provenance!.y,
			},
		},
	}] : []
	const path = {
		pathIndex: 0,
		hypothesisId: "field-transition-1",
		fieldDomainId: "field-domain-1",
		topology: "linear",
		direction: "horizontal",
		connected: true,
		legacyEligible: true,
		strictTransitionEligible: pathEligible,
		endpointInterval: [0.15, 0.85],
		endpointHueSeparation: 2,
		endpointChromas: [0.1, 0.1],
		crossHue: kind === "three",
		stagePositions: [0, 0.5, 1],
		stageColorPositions: [0, 0.5, 1],
		stagePopulationFractions: [0.2, 0.1, 0.2],
		transitionFamilyCount: 3,
		transitionPopulationFraction: 0.1,
		transitionQuadrantCoverage: 1,
		acceptedIntermediateSupport,
		midpointCustody: structuredClone(pathMidpoint),
		eligible: pathEligible,
		rejectionReasons: pathEligible ? [] : ["strict-transition-path-ineligible"],
	}
	return {
		dimensions: { width: 100, height: 80 },
		winner: { key: winnerKey, treatment: winner },
		diagnostics: {
			phase3IntegratedCandidate: {
				version: "album-artwork-palette-v2-phase-3-integrated-candidate-diagnostics-v2",
				configurationId: integratedIdentity.configurationId,
				supportedGradientAuthority:
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
				selection: {
					winnerKey,
					transitionPromoted: selectedTransitionGradient,
					slateKeys: [winnerKey],
				},
				gradientAuthority: {
					version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_SUPPORTED_GRADIENT_AUTHORITY_ID,
					authority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_ID,
					selectedTransitionGradient,
					strictVetoApplied: strictVeto,
					projectedFlatSibling: strictVeto,
					baselineWinnerKey: strictVeto ? gradientSiblingKey : winnerKey,
					winnerKey,
					correspondingPathIndex: selectedTransitionGradient ? 0 : null,
					midpoint: structuredClone(midpointValue),
					flatCustody: strictVeto ? {
						kind: "source-connected-flat-projection",
						sourceConnected: true,
						sourceTypes: ["native-field-transition"],
						sourceFieldHypothesisId: winner.sourceFieldHypothesisId,
						roleBinding: "same-four-roles",
						hypothesisBinding: "same-source-field-hypothesis",
					} : null,
				},
				supportedGradientPath: {
					policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_POLICY,
					formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_SUPPORTED_GRADIENT_PATH_FORMULAS,
					discoveredPathCount: 1,
					strictTransitionEligiblePathCount: pathEligible ? 1 : 0,
					eligiblePathCount: pathEligible ? 1 : 0,
					selectedPathIndex: pathEligible ? 0 : null,
					paths: [path],
				},
			},
		},
	}
}

test("projects retained integrated three-stop authority and validates non-three-stop states", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		integratedOutput("three"), integratedIdentity, "integrated three-stop fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
	for (const kind of ["two", "flat", "none"] as const) {
		assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			integratedOutput(kind), integratedIdentity, `integrated ${kind} fixture`), undefined, kind)
	}
})

test("fails closed on stale integrated supported-gradient authority and source custody", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{ label: "configuration", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.configurationId = "stale"
		} },
		{ label: "winner key", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.winnerKey = "stale"
		} },
		{ label: "strict authority", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.strictVetoApplied = true
		} },
		{ label: "path eligibility", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.supportedGradientPath.paths[0].eligible = false
		} },
		{ label: "path index", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.correspondingPathIndex = 1
		} },
		{ label: "hypothesis", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.supportedGradientPath.paths[0].hypothesisId = "stale"
		} },
		{ label: "midpoint color", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.midpoint.color.hex = "#000000"
		} },
		{ label: "midpoint provenance", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.midpoint.provenance.regionId = "stale"
		} },
		{ label: "midpoint coordinates", mutate: (value) => {
			value.diagnostics.phase3IntegratedCandidate.gradientAuthority.midpoint.provenance.x = 100
		} },
		{ label: "output role", mutate: (value) => {
			value.winner.treatment.background.hex = "#000000"
		} },
		{ label: "output endpoints", mutate: (value) => {
			value.winner.treatment.gradientEvidence.supportingFamilyIds[0] = "stale"
		} },
	]
	for (const fixture of cases) {
		const value = integratedOutput("three")
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, integratedIdentity, fixture.label), /integrated|supported-gradient/u, fixture.label)
	}
})

test("projects genuine current integrated retained midpoint authority", () => {
	const value = normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3IntegratedCandidate(currentV3Image()),
	)
	const authority = value.diagnostics.phase3IntegratedCandidate.gradientAuthority
	assert.equal(authority.midpoint.kind, "source-supported-three-stop")
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, integratedIdentity, "genuine integrated fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{
					kind: "source-supported-color",
					hex: authority.midpoint.color!.hex,
					position: 0.5,
				},
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
})

const finalIdentity = {
	attemptId: "phase-3-final-candidate",
	configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
}

function finalOutput(kind: "three" | "flat" | "none") {
	const integrated = integratedOutput(kind)
	const winner = integrated.winner
	const finalKeys = [winner.key]
	return {
		dimensions: integrated.dimensions,
		winner,
		alternatives: [winner],
		diagnostics: {
			familyCount: 4,
			retainedFamilyCount: 4,
			families: (["background", "surface", "foreground", "accent"] as const).map((role) => {
				const color = winner.treatment[role]
				return {
					id: winner.treatment.familyRoles[role],
					representatives: [{
						rgb: color.rgb,
						oklab: color.oklab,
						hex: color.hex,
						strategy: color.strategy,
						support: color.support,
					}],
				}
			}),
			fieldHypotheses: [{
				id: "field-transition-1",
				backgroundFamilyId: winner.treatment.familyRoles.background,
				surfaceFamilyId: winner.treatment.familyRoles.surface,
			}],
			completeCandidateCount: 1,
			candidateAvailability: {
				foregroundLaneFamilyIds: [winner.treatment.familyRoles.foreground],
				signatureLaneFamilyIds: [winner.treatment.familyRoles.accent],
				fieldHypothesisFamilyIds: [
					winner.treatment.familyRoles.background,
					winner.treatment.familyRoles.surface,
				],
				completeCandidateForegroundFamilyIds: [winner.treatment.familyRoles.foreground],
				completeCandidateAccentFamilyIds: [winner.treatment.familyRoles.accent],
				slateForegroundFamilyIds: [winner.treatment.familyRoles.foreground],
				slateAccentFamilyIds: [winner.treatment.familyRoles.accent],
			},
			phase3FinalCandidate: {
				version: "album-artwork-palette-v2-phase-3-final-candidate-diagnostics-v1",
				configurationId: finalIdentity.configurationId,
				configuration: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
				winnerAuthority: "immutable-integrated-after-strict-supported-gradient-midpoint-authority",
				excludedWinnerAuthorities:
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities,
				integrated: integrated.diagnostics.phase3IntegratedCandidate,
				selector: { evaluations: [{
					key: winner.key,
					structuralKey: [
						winner.key,
						winner.treatment.fieldTreatment,
						winner.treatment.familyRoles.background,
						winner.treatment.familyRoles.surface,
						winner.treatment.familyRoles.foreground,
						winner.treatment.familyRoles.accent,
					].join("\0"),
				}] },
				lineageEligibility: { candidates: [{ key: winner.key }] },
				componentLocalEndpointProposal: { proposals: [] },
				selection: { winnerKey: winner.key, slateKeys: finalKeys },
				gradientAuthority:
					structuredClone(integrated.diagnostics.phase3IntegratedCandidate.gradientAuthority),
				supportedGradientPath:
					structuredClone(integrated.diagnostics.phase3IntegratedCandidate.supportedGradientPath),
				composition: {
					version: "album-artwork-palette-v2-phase-3-final-candidate-composition-v1",
					configuration: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
					baselineWinnerKey: winner.key,
					baselineKeys: finalKeys,
					finalWinnerKey: winner.key,
					finalKeys,
					retainedIntegratedKeys: finalKeys,
					displacedIntegratedKeys: [],
					mechanisms: [
						{
							mechanism: "component-local-endpoint",
							mechanismIndex: 0,
							admittedKey: null,
							displacedIntegratedKey: null,
							noAdmission: true,
							outputIndex: null,
						},
						{
							mechanism: "raw-relation-slate-complement",
							mechanismIndex: 1,
							admittedKey: null,
							displacedIntegratedKey: null,
							noAdmission: true,
							outputIndex: null,
						},
					],
					checks: { exactWinnerObject: true, exactWinnerKey: true, winnerFirst: true },
				},
				finalSlateCustody: [{
					key: winner.key,
					selectorEvaluation: true,
					lineageCandidate: true,
					integratedGradientProjection: kind === "flat",
					endpointProposalCustody: false,
					familyRolesPublished: true,
					familySupport: true,
					represented: true,
				}],
				evidenceCustody: {
					baseFamilyCount: 4,
					endpointAdditiveFamilyIds: [],
					retainedFamilyIds: Object.values(winner.treatment.familyRoles),
					publishedFamilyIds: Object.values(winner.treatment.familyRoles),
					fieldHypothesisIds: ["field-transition-1"],
					completeCandidateCount: 1,
					checks: { familyCountReconciled: true },
				},
				checks: {
					allFinalSlateKeysRepresented: true,
					exactIntegratedWinnerObject: true,
					exactIntegratedWinnerKey: true,
					strictGradientAuthorityPreserved: true,
					supportedGradientPathPreserved: true,
					rawNeverWinner: true,
				},
			},
		},
	}
}

test("projects retained final three-stop authority and validates flat/no-midpoint custody", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		finalOutput("three"), finalIdentity, "final three-stop fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
	for (const kind of ["flat", "none"] as const) {
		assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			finalOutput(kind), finalIdentity, `final ${kind} fixture`), undefined, kind)
	}
})

test("projects current synthetic final midpoint authority", () => {
	const value = normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3FinalCandidate(currentV3Image()),
	)
	const authority = value.diagnostics.phase3FinalCandidate.gradientAuthority
	assert.equal(authority.midpoint.kind, "source-supported-three-stop")
	const render = projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, finalIdentity, "genuine final fixture")
	assert.equal(render?.field.stops[1].kind, "source-supported-color")
	assert.equal(render?.field.stops[1].hex, authority.midpoint.color!.hex)
	assert.equal(render!.field.stops[1].hex, "#427180")
})

test("projects the hash-bound development-03 final midpoint exactly", async () => {
	const bytes = await readFile("images/birdsofprey.jpg")
	assert.equal(createHash("sha256").update(bytes).digest("hex"),
		"26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d")
	const value = normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3FinalCandidate(await loadNativeImage(bytes)),
	)
	const root = value.diagnostics.phase3FinalCandidate
	const authority = root.gradientAuthority
	assert.equal(root.winnerAuthority,
		"immutable-integrated-after-strict-supported-gradient-midpoint-authority")
	assert.deepEqual(authority, root.integrated.gradientAuthority)
	assert.deepEqual(root.supportedGradientPath, root.integrated.supportedGradientPath)
	assert.equal(authority.selectedTransitionGradient, true)
	assert.equal(authority.strictVetoApplied, false)
	assert.equal(authority.midpoint.kind, "source-supported-three-stop")
	assert.equal(authority.midpoint.color!.hex, "#1880a7")
	assert.equal(root.composition.baselineWinnerKey, value.winner.key)
	assert.equal(root.composition.finalWinnerKey, value.winner.key)
	assert.deepEqual(root.composition.finalKeys, value.alternatives.map(({ key }) => key))
	assert.equal(root.composition.mechanisms.every(({ noAdmission }) => noAdmission), true)
	assert.equal(root.checks.exactIntegratedWinnerObject, true)
	assert.equal(root.checks.exactIntegratedWinnerKey, true)
	assert.equal(root.checks.strictGradientAuthorityPreserved, true)
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, finalIdentity, "development-03 final fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
})

test("projects the hash-bound working-expansion-10 final one-field authority as undefined", async () => {
	const bytes = await readFile("05/ab67616d0000b2730005478f00d26e406b8cf923")
	assert.equal(createHash("sha256").update(bytes).digest("hex"),
		"ac51677a48ef8cfdadae86c1141ce8a1a0bb417ccfcb51bce8258989c63f1e96")
	const value = normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3FinalCandidate(await loadNativeImage(bytes)),
	)
	assert.equal(value.winner.treatment.fieldTreatment, "one-field")
	assert.equal(value.winner.treatment.collapse.surface, true)
	assert.equal(value.winner.treatment.gradient, false)
	assert.equal(value.winner.treatment.gradientEvidence, null)
	assert.deepEqual(value.winner.treatment.surface, value.winner.treatment.background)
	assert.equal(value.winner.treatment.familyRoles.surface,
		value.winner.treatment.familyRoles.background)
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, finalIdentity, "working-expansion-10 final fixture"), undefined)

	const cases: Array<Readonly<{ label: string; mutate: (treatment: any) => void }>> = [
		{ label: "noncollapsed", mutate: (treatment) => { treatment.collapse.surface = false } },
		{ label: "unequal canonical colors", mutate: (treatment) => {
			treatment.surface.oklab[0] += 0.01
		} },
		{ label: "stale family", mutate: (treatment) => {
			treatment.familyRoles.surface = value.diagnostics.families.find(({ id }) =>
				id !== treatment.familyRoles.background)!.id
		} },
		{ label: "stale support", mutate: (treatment) => {
			treatment.surface.support.anchorFamilyId = value.diagnostics.families.find(({ id }) =>
				id !== treatment.familyRoles.background)!.id
		} },
	]
	for (const fixture of cases) {
		const integrated = {
			dimensions: structuredClone(value.dimensions),
			winner: structuredClone(value.winner),
			diagnostics: {
				phase3IntegratedCandidate: structuredClone(value.diagnostics.phase3FinalCandidate.integrated),
			},
		}
		integrated.winner.treatment.surface = structuredClone(integrated.winner.treatment.surface)
		fixture.mutate(integrated.winner.treatment)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			integrated, integratedIdentity, `working-expansion-10 ${fixture.label} fixture`),
		/integrated flat winner authority is stale/u, fixture.label)
	}

	const gradientOneField = integratedOutput("three")
	gradientOneField.winner.treatment.fieldTreatment = "one-field"
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		gradientOneField, integratedIdentity, "gradient one-field fixture"),
	/integrated gradient winner authority is stale/u)
})

test("fails closed on stale final composition, retained authority, path, or midpoint", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{ label: "configuration", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.configurationId = "stale"
		} },
		{ label: "composition baseline", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.composition.baselineWinnerKey = "stale"
		} },
		{ label: "composition final", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.composition.finalWinnerKey = "stale"
		} },
		{ label: "retained authority", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.gradientAuthority.winnerKey = "stale"
		} },
		{ label: "integrated authority", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.integrated.gradientAuthority.winnerKey = "stale"
		} },
		{ label: "path", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.supportedGradientPath.paths[0].hypothesisId = "stale"
		} },
		{ label: "midpoint", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.gradientAuthority.midpoint.provenance.pixelIndex++
		} },
		{ label: "endpoint admission winner", mutate: (value) => {
			const root = value.diagnostics.phase3FinalCandidate
			root.composition.mechanisms[0].admittedKey = value.winner.key
			root.composition.mechanisms[0].noAdmission = false
			root.composition.mechanisms[0].outputIndex = 0
		} },
		{ label: "rejected combined authority", mutate: (value) => {
			value.diagnostics.phase3FinalCandidate.pathBoundWinnerAuthority = {}
		} },
	]
	for (const fixture of cases) {
		const value = finalOutput("three")
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, finalIdentity, fixture.label), /final-candidate|integrated/u, fixture.label)
	}
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(finalOutput("three"), {
		attemptId: "phase-3-combined-v3-path-bound-winner",
		configurationId: "rejected",
	}, "rejected combined attempt"), undefined)
})

test("fails closed on independently stale final family publication custody", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{
			label: "coordinated winner family role and support",
			mutate: (value) => {
				const treatment = value.winner.treatment
				treatment.familyRoles.foreground = treatment.familyRoles.accent
				treatment.foreground.support.anchorFamilyId = treatment.familyRoles.accent
			},
		},
		{
			label: "missing published family",
			mutate: (value) => { value.diagnostics.families.pop() },
		},
		{
			label: "duplicate published family",
			mutate: (value) => { value.diagnostics.families.push(value.diagnostics.families[0]) },
		},
		{
			label: "family count",
			mutate: (value) => { value.diagnostics.familyCount++ },
		},
		{
			label: "retained family count",
			mutate: (value) => { value.diagnostics.retainedFamilyCount-- },
		},
		{
			label: "field availability",
			mutate: (value) => {
				value.diagnostics.candidateAvailability.fieldHypothesisFamilyIds = ["family-accent"]
			},
		},
		{
			label: "slate availability",
			mutate: (value) => {
				value.diagnostics.candidateAvailability.slateForegroundFamilyIds = ["family-accent"]
			},
		},
		{
			label: "complete availability",
			mutate: (value) => {
				value.diagnostics.candidateAvailability.completeCandidateAccentFamilyIds = ["missing-family"]
			},
		},
		{
			label: "claimed slate custody",
			mutate: (value) => {
				value.diagnostics.phase3FinalCandidate.finalSlateCustody[0].familySupport = false
				value.diagnostics.phase3FinalCandidate.finalSlateCustody[0].represented = false
			},
		},
	]
	for (const fixture of cases) {
		const value = finalOutput("three")
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, finalIdentity, fixture.label), /final-candidate/u, fixture.label)
	}
})

const midpointAwareIdentity = {
	attemptId: "phase-3-midpoint-aware-render-candidate",
	configurationId: "midpoint-aware-test-v1",
}
const familyBinStep = 0.02
const imageWidth = 256
const imageHeight = 2
const firstEndpointRgb: RGB = [25, 46, 118]
const secondEndpointRgb: RGB = [219, 164, 47]

function exactColor(rgb: RGB, pixelIndex: number, familyId: string) {
	const regionId = `${familyId}-transition-region-${pixelIndex}`
	return {
		rgb,
		oklab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		provenance: { exactSource: true, familyId, regionId, pixelIndex, x: pixelIndex, y: 0 },
	}
}

function exactColorNear(lab: OKLab, pixelIndex: number, familyId: string) {
	return exactColor(oklabToRGB(lab), pixelIndex, familyId)
}

function pathStage(color: ReturnType<typeof exactColor>, stageIndex: number, spatialPosition: number) {
	return {
		stageIndex,
		familyId: color.provenance.familyId,
		regionId: color.provenance.regionId,
		spatialPosition,
		colorPosition: spatialPosition,
		population: 150,
		populationFraction: 0.15,
		imagePopulationFraction: 0.075,
		quadrantCoverage: 1,
		prototype: color.oklab,
		exactColor: color,
	}
}

function renderPath(kind: "flat" | "supported-two-stop" | "supported-three-stop") {
	const hypothesisId = `midpoint-aware-${kind}`
	const first = exactColor(firstEndpointRgb, 10, "family-background")
	const second = exactColor(secondEndpointRgb, 50, "family-surface")
	const positions = [0, 0.25, 0.5, 0.75, 1]
	const stages = kind === "flat"
		? [first, first, first, second, second].map((color, index) =>
			pathStage(color, index, positions[index]))
		: kind === "supported-two-stop"
			? positions.map((position, index) => pathStage(
				index === 0
					? first
					: index === positions.length - 1
						? second
						: exactColorNear(
							mixOKLab(first.oklab, second.oklab, position),
							10 + index * 10,
							`family-direct-${index}`,
						),
				index,
				position,
			))
			: (() => {
				const middle = exactColor([50, 140, 170], 30, "family-middle")
				return positions.map((position, index) => pathStage(
					index === 0
						? first
						: index === 2
							? middle
							: index === positions.length - 1
								? second
								: exactColorNear(
									position < 0.5
										? mixOKLab(first.oklab, middle.oklab, position * 2)
										: mixOKLab(middle.oklab, second.oklab, position * 2 - 1),
									10 + index * 10,
									`family-curved-${index}`,
								),
					index,
					position,
				))
			})()
	const gradientEvidence = {
		fieldDomainId: `domain:${hypothesisId}`,
		topology: "linear",
		direction: "horizontal",
		backgroundTopologyEndpoint: "low",
		supportingFamilyIds: [first.provenance.familyId, second.provenance.familyId],
		supportingEndpointHexes: [first.hex, second.hex],
	}
	const acceptedIntermediateSupport = stages.slice(1, -1)
	return {
		fieldDomainId: gradientEvidence.fieldDomainId,
		topology: gradientEvidence.topology,
		direction: gradientEvidence.direction,
		spatialCenter: null,
		endpointFamilyIds: gradientEvidence.supportingFamilyIds,
		endpointInterval: [0.15, 0.85],
		stageFamilyIds: stages.map(({ familyId }) => familyId),
		stageRegionIds: stages.map(({ regionId }) => regionId),
		stagePositions: stages.map(({ spatialPosition }) => spatialPosition),
		stageColorPositions: stages.map(({ colorPosition }) => colorPosition),
		stagePopulationFractions: stages.map(({ populationFraction }) => populationFraction),
		stages,
		acceptedIntermediateSupport,
		transitionFamilyCount: new Set(acceptedIntermediateSupport.map(({ familyId }) => familyId)).size,
		transitionPopulationFraction: acceptedIntermediateSupport.reduce((sum, stage) =>
			sum + stage.populationFraction, 0),
		transitionQuadrantCoverage: 1,
		connected: true,
		legacyEligible: true,
		eligible: true,
		rejectionReasons: [],
		hypothesis: {
			id: hypothesisId,
			backgroundFamilyId: first.provenance.familyId,
			surfaceFamilyId: second.provenance.familyId,
			fieldFidelity: 0.9,
			gradientEvidence,
		},
	}
}

function roleColor(color: ReturnType<typeof exactColor>) {
	return { rgb: color.rgb, oklab: color.oklab, hex: color.hex, generated: false }
}

function midpointAwareOutput(kind: "flat" | "supported-two-stop" | "supported-three-stop") {
	const path = renderPath(kind)
	const endpoints = [path.stages[0], path.stages.at(-1)!].map((stage) => ({
		familyId: stage.familyId,
		regionId: stage.regionId,
		exactColor: stage.exactColor,
	}))
	const bundle = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidateForPath(
		path as never,
		endpoints as never,
		familyBinStep,
	)
	assert.equal(bundle.selectedRender?.kind, kind)
	const selectedRender = bundle.selectedRender!
	const foreground = exactColor([242, 240, 232], 200, "family-foreground")
	const accent = exactColor([216, 42, 113], 210, "family-accent")
	const familyRoles = {
		background: path.stages[0].familyId,
		surface: path.stages.at(-1)!.familyId,
		foreground: foreground.provenance.familyId,
		accent: accent.provenance.familyId,
	}
	const roles = {
		background: roleColor(path.stages[0].exactColor),
		surface: roleColor(path.stages.at(-1)!.exactColor),
		foreground: roleColor(foreground),
		accent: roleColor(accent),
	}
	const provisional = {
		id: "midpoint-aware-treatment",
		...roles,
		gradient: true,
		fieldTreatment: "gradient-field",
		sourceFieldHypothesisId: path.hypothesis.id,
		familyRoles,
		collapse: { surface: false, accent: false },
		gradientEvidence: path.hypothesis.gradientEvidence,
	}
	const winner = {
		...provisional,
		gradient: kind !== "flat",
		fieldTreatment: kind === "flat" ? "separate-flat-fields" : "gradient-field",
		gradientEvidence: kind === "flat" ? null : {
			...provisional.gradientEvidence,
			supportingEndpointHexes: selectedRender.endpoints.map(({ exactColor: color }) => color.hex),
		},
	}
	const outputKey = [...Object.values(roles).map(({ hex }) => hex),
		kind === "flat" ? "flat" : "gradient"].join(":")
	const sourceKey = [...Object.values(roles).map(({ hex }) => hex), "gradient"].join(":")
	const descriptor = {
		sourceType: "native-field-transition",
		treatment: provisional,
		fieldHypothesis: path.hypothesis,
		lineage: { sourceConnected: true, fieldHypothesisId: path.hypothesis.id },
	}
	const exactEndpointCustody = selectedRender.endpoints.map((stop, index) => ({
		role: index === 0 ? "background" : "surface",
		familyId: stop.familyId,
		componentStartPixelIndex: stop.exactColor.provenance.pixelIndex,
		derivedTransitionRegionId: stop.regionId,
		pathRegionId: stop.regionId,
		exemplar: { x: stop.exactColor.provenance.x, y: stop.exactColor.provenance.y },
		custody: endpoints[index],
	}))
	return {
		dimensions: { width: imageWidth, height: imageHeight },
		winner: { key: outputKey, treatment: winner },
		diagnostics: {
			phase3MidpointAwareRenderCandidate: {
				version: "album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-diagnostics-v2",
				configurationId: midpointAwareIdentity.configurationId,
				applicable: true,
				noOpReason: null,
				baselineWinnerKey: sourceKey,
				outputWinnerKey: outputKey,
				provisionalTreatment: provisional,
				candidateEvaluation: { familyBinStep },
				exactEndpointCustody,
				reEvaluatedBundle: bundle,
				selectedBundle: bundle,
				selectedPath: path,
				selectedRender,
				selectedEndpointStops: selectedRender.endpoints,
				lineageBasis: "ordinary-complete-source-lineage",
				lineage: {
					provisionalCandidate: { key: sourceKey, treatment: provisional, descriptors: [descriptor] },
					eligibility: {
						key: sourceKey,
						eligible: true,
						basis: "ordinary-complete-source-lineage",
						descriptors: [{ ordinaryEligible: true, lineageSourceConnected: true }],
					},
					sourceConnected: true,
					nativeTransitionDescriptors: [descriptor],
					boundNativeTransitionDescriptor: descriptor,
					completeLineageCustody: { key: sourceKey, winnerEligible: true },
				},
				renderProjection: {
					version: "album-artwork-palette-v2-phase-3-midpoint-aware-render-projection-v1",
					sourceKey,
					outputKey,
					renderKind: kind,
					exactEndpoints: selectedRender.endpoints,
					exactMidpoint: selectedRender.midpoint,
					sourceLineageBasis: "ordinary-complete-source-lineage",
					qualityAndContrastReevaluated: false,
					qualityCustody: "pre-render-selector-diagnostics",
					contrastCustody: "provisional-treatment-diagnostics",
				},
			},
		},
	}
}

function midpointAwareNoOpOutput() {
	const value: any = structuredClone(midpointAwareOutput("supported-two-stop"))
	const root = value.diagnostics.phase3MidpointAwareRenderCandidate
	const controlWinner = structuredClone(value.winner.treatment)
	const controlAlternatives = [structuredClone(controlWinner)]
	value.alternatives = controlAlternatives.map((treatment) => ({
		key: value.winner.key,
		treatment: structuredClone(treatment),
	}))
	root.applicable = false
	root.noOpReason = "corresponding-supported-path-unavailable"
	root.outputSlateKeys = value.alternatives.map((entry: any) => entry.key)
	root.renderProjection = null
	root.selectedRender = null
	root.selectedEndpointStops = null
	root.selectedBundle = null
	root.selectedPath = null
	root.controlIntegratedResult = {
		version: "phase-3-integrated-candidate",
		protocol: "control",
		width: imageWidth,
		height: imageHeight,
		winner: controlWinner,
		alternatives: controlAlternatives,
		diagnostics: {},
	}
	return value
}

const expectedResearchRender = {
	schemaVersion: 1,
	field: {
		kind: "linear-gradient",
		angleDegrees: 135,
		interpolation: "oklab",
		stops: [
			{ kind: "role", role: "background", position: 0 },
			{ kind: "source-supported-color", hex: "#328caa", position: 0.5 },
			{ kind: "role", role: "surface", position: 1 },
		],
	},
}

test("projects only an exact midpoint-aware three-stop winner after validating flat and two-stop custody", () => {
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareOutput("flat"), midpointAwareIdentity, "flat fixture"), undefined)
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareOutput("supported-two-stop"), midpointAwareIdentity, "two-stop fixture"), undefined)
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareOutput("supported-three-stop"), midpointAwareIdentity, "three-stop fixture"),
		expectedResearchRender)
})

test("accepts an exact midpoint-aware no-op control output without projecting a render", () => {
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareNoOpOutput(), midpointAwareIdentity, "no-op fixture"), undefined)
})

test("fails closed when a midpoint-aware no-op carries render authority or changes control output", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{
			label: "render projection",
			mutate: (value) => { value.diagnostics.phase3MidpointAwareRenderCandidate.renderProjection = {} },
		},
		{
			label: "selected render",
			mutate: (value) => { value.diagnostics.phase3MidpointAwareRenderCandidate.selectedRender = {} },
		},
		{
			label: "winner",
			mutate: (value) => { value.winner.treatment.accent.hex = "#000000" },
		},
		{
			label: "slate",
			mutate: (value) => {
				value.alternatives = []
				value.diagnostics.phase3MidpointAwareRenderCandidate.outputSlateKeys = []
			},
		},
	]
	for (const fixture of cases) {
		const value = midpointAwareNoOpOutput()
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareIdentity, fixture.label), /midpoint-aware no-op/u, fixture.label)
	}
})

test("preserves the old supported-gradient projection unchanged", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output(), identity, "old fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
})

test("fails closed on stale midpoint-aware configuration, keys, endpoints, midpoint, coordinates, or lineage", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{
			label: "configuration",
			mutate: (value) => { value.diagnostics.phase3MidpointAwareRenderCandidate.configurationId = "stale" },
		},
		{
			label: "winner key",
			mutate: (value) => { value.diagnostics.phase3MidpointAwareRenderCandidate.outputWinnerKey = "stale" },
		},
		{
			label: "endpoint",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.selectedRender.endpoints[0].exactColor.hex = "#000000"
			},
		},
		{
			label: "midpoint",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.selectedRender.midpoint.sourceStageIndex = 1
			},
		},
		{
			label: "coordinates",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.selectedRender.midpoint.exactColor.provenance.pixelIndex++
			},
		},
		{
			label: "lineage",
			mutate: (value) => { value.diagnostics.phase3MidpointAwareRenderCandidate.lineage.sourceConnected = false },
		},
	]
	for (const fixture of cases) {
		const value = structuredClone(midpointAwareOutput("supported-three-stop"))
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareIdentity, fixture.label), /midpoint-aware/u, fixture.label)
	}
})

test("presentation-2 keeps two-stop and three-stop treatment identity shared but separates render variants", () => {
	const twoStop = midpointAwareOutput("supported-two-stop")
	const threeStop = midpointAwareOutput("supported-three-stop")
	const researchRender = projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		threeStop, midpointAwareIdentity, "presentation fixture")
	const ordinary = normalizeTreatment(twoStop.winner.treatment, {
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	})
	const rendered = normalizeTreatment({ ...threeStop.winner.treatment, researchRender }, {
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	})
	assert.equal(ordinary.treatmentIdentity, rendered.treatmentIdentity)
	assert.notEqual(ordinary.renderVariantId, rendered.renderVariantId)
})

const midpointAwareV3Identity = {
	attemptId: "phase-3-midpoint-aware-render-candidate",
	configurationId:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
}

function currentV3Image(): RawImage {
	const width = 72
	const height = 48
	const data = new Uint8Array(width * height * 3)
	const first = rgbToOKLab([34, 52, 142])
	const middle = rgbToOKLab([80, 130, 120])
	const second = rgbToOKLab([212, 164, 48])
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			let color = amount < 0.5
				? oklabToRGB(mixOKLab(first, middle, amount * 2))
				: oklabToRGB(mixOKLab(middle, second, amount * 2 - 1))
			if (x >= 20 && x < 52 && (
				(y >= 10 && y < 13) || (y >= 18 && y < 21) || (y >= 26 && y < 29)
			)) color = [8, 8, 12]
			if ((x >= 56 && x < 63 && y >= 34 && y < 41) ||
				(x >= 9 && x < 14 && y >= 37 && y < 42)) color = [225, 30, 92]
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

let currentV3Output: any
let currentV3NoOpOutput: any

function genuineMidpointAwareV3Output() {
	currentV3Output ??= normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate(currentV3Image()),
	)
	return structuredClone(currentV3Output)
}

function genuineMidpointAwareV3NoOpOutput() {
	currentV3NoOpOutput ??= normalizeAlbumArtworkPaletteV2Phase3Result(
		extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 3).fill(64),
		}),
	)
	return structuredClone(currentV3NoOpOutput)
}

function midpointAwareV3Output(
	kind: "flat" | "supported-two-stop" | "supported-three-stop",
) {
	const value: any = genuineMidpointAwareV3Output()
	const root = value.diagnostics.phase3MidpointAwareRenderCandidate
	const materialization = root.pathBoundMaterialization
	const selected = materialization.eligibleCandidates.find((candidate: any) =>
		candidate.render.kind === kind)
	assert.ok(selected, `fixture has no eligible ${kind} candidate`)
	for (const candidate of materialization.candidates) {
		if (candidate.renderKey === selected.renderKey) continue
		candidate.eligible = false
		candidate.withinQualityBound = false
	}
	materialization.candidates.sort(compareCompleteRenderCandidates)
	materialization.eligibleCandidates = materialization.candidates.filter((candidate: any) =>
		candidate.eligible && candidate.withinMaterializationBounds)
	materialization.diagnostics.qualityEligibleCompleteRenderCandidateCount =
		materialization.eligibleCandidates.length
	const winner = { key: selected.publicTreatmentKey, treatment: selected.treatment }
	value.winner = winner
	value.alternatives = [winner]
	root.selectedRenderKey = selected.renderKey
	root.selectedPublicTreatmentKey = selected.publicTreatmentKey
	root.outputPublicTreatmentKey = selected.publicTreatmentKey
	root.selectedRenderKind = selected.render.kind
	root.selectedRenderFidelity = selected.render.fidelity
	root.selectedAuthority = {
		renderKey: selected.renderKey,
		publicTreatmentKey: selected.publicTreatmentKey,
		renderKind: selected.render.kind,
		renderId: selected.render.id,
		fidelity: selected.render.fidelity,
		pathLineage: selected.pathLineage,
		ordinaryCompleteLineage: selected.ordinaryCompleteLineage,
		numericsCustody: selected.numericsCustody,
		recoveryEvaluation: selected.recoveryEvaluation,
		qualityLossFromBaseline: selected.qualityLossFromBaseline,
		qualityFloor: selected.qualityFloor,
		withinQualityBound: selected.withinQualityBound,
		roleBindingKey: selected.roleBindingKey,
		roleCustody: selected.roleCustody,
	}
	root.selector.selectedRecoveryEvaluation = selected.recoveryEvaluation
	root.qualityLossFromBaseline = selected.qualityLossFromBaseline
	root.sourceToOutputCustody = {
		renderKey: selected.renderKey,
		sourcePublicTreatmentKey: selected.publicTreatmentKey,
		outputPublicTreatmentKey: selected.publicTreatmentKey,
		roleBindingKey: selected.roleBindingKey,
		roleCustody: selected.roleCustody,
		pathLineage: selected.pathLineage,
	}
	root.renderProjection = {
		version: "album-artwork-palette-v2-phase-3-path-bound-render-projection-v3",
		renderKey: selected.renderKey,
		sourcePublicTreatmentKey: selected.publicTreatmentKey,
		outputPublicTreatmentKey: selected.publicTreatmentKey,
		renderKind: selected.render.kind,
		exactEndpoints: selected.pathLineage.endpoints,
		exactMidpoint: selected.pathLineage.midpoint,
		pathLineage: selected.pathLineage,
		ordinaryCompleteLineage: selected.ordinaryCompleteLineage,
		numericsCustody: selected.numericsCustody,
		qualityCustody: {
			source: "selected-path-bound-recovery-evaluation",
			evaluation: selected.recoveryEvaluation,
			recomputedAfterRenderSelection: false,
		},
		contrastCustody: {
			source: selected.numericsCustody.completeTreatmentSource,
			contrast: selected.treatment.contrast,
			recomputedAfterRenderSelection: false,
			threeStopAPCARecomputed: false,
		},
	}
	root.outputSlateKeys = [selected.publicTreatmentKey]
	materialization.selected = selected
	materialization.diagnostics.selectedRenderKey = selected.renderKey
	materialization.diagnostics.selectedPublicTreatmentKey = selected.publicTreatmentKey
	materialization.diagnostics.selectedRenderId = selected.render.id
	for (const bundle of materialization.diagnostics.bundles) {
		const selectedBundle = bundle.bundleId === selected.bundleId
		bundle.selectedRoleBindingKey = selectedBundle ? selected.roleBindingKey : null
		bundle.selectedRoleCustody = selectedBundle ? selected.roleCustody : []
		for (const binding of bundle.sharedRoleBindings) {
			binding.selected = selectedBundle && binding.key === selected.roleBindingKey
		}
	}
	return value
}

function midpointAliasesForeground(value: any) {
	const root = value.diagnostics.phase3MidpointAwareRenderCandidate
	const materialization = root.pathBoundMaterialization
	const selected = materialization.selected
	const midpointColor = selected.render.midpoint.exactColor
	const oldPublicTreatmentKey = selected.publicTreatmentKey
	const oldRenderKey = selected.renderKey
	const treatment = {
		...selected.treatment,
		foreground: {
			...selected.treatment.foreground,
			rgb: midpointColor.rgb,
			oklab: midpointColor.oklab,
			hex: midpointColor.hex,
		},
	}
	const publicTreatmentKey = [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
	const renderKey = `${publicTreatmentKey}\0${selected.render.id}`
	selected.treatment = treatment
	selected.publicTreatmentKey = publicTreatmentKey
	selected.renderKey = renderKey
	selected.recoveryEvaluation = {
		...selected.recoveryEvaluation,
		key: publicTreatmentKey,
		treatment,
	}
	selected.ordinaryCompleteLineage.descriptor.treatment = treatment
	value.winner = { key: publicTreatmentKey, treatment }
	value.alternatives = [value.winner]
	root.selectedRenderKey = renderKey
	root.selectedPublicTreatmentKey = publicTreatmentKey
	root.outputPublicTreatmentKey = publicTreatmentKey
	root.outputSlateKeys = [publicTreatmentKey]
	root.selectedAuthority.renderKey = renderKey
	root.selectedAuthority.publicTreatmentKey = publicTreatmentKey
	root.selectedAuthority.recoveryEvaluation = selected.recoveryEvaluation
	root.selector.selectedRecoveryEvaluation = selected.recoveryEvaluation
	root.sourceToOutputCustody.renderKey = renderKey
	root.sourceToOutputCustody.sourcePublicTreatmentKey = publicTreatmentKey
	root.sourceToOutputCustody.outputPublicTreatmentKey = publicTreatmentKey
	root.renderProjection.renderKey = renderKey
	root.renderProjection.sourcePublicTreatmentKey = publicTreatmentKey
	root.renderProjection.outputPublicTreatmentKey = publicTreatmentKey
	root.renderProjection.qualityCustody.evaluation = selected.recoveryEvaluation
	root.renderProjection.contrastCustody.contrast = treatment.contrast
	materialization.diagnostics.selectedRenderKey = renderKey
	materialization.diagnostics.selectedPublicTreatmentKey = publicTreatmentKey
	const bundle = materialization.diagnostics.bundles.find(({ bundleId }: any) =>
		bundleId === selected.bundleId)
	bundle.completeRenderKeys = bundle.completeRenderKeys.map((key: string) =>
		key === oldRenderKey ? renderKey : key)
	assert.notEqual(oldPublicTreatmentKey, publicTreatmentKey)
	return value
}

test("projects current v3 flat, two-stop, and three-stop selected complete renders", () => {
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareV3Output("flat"), midpointAwareV3Identity, "v3 flat fixture"), undefined)
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareV3Output("supported-two-stop"), midpointAwareV3Identity, "v3 two-stop fixture"), undefined)
	const three = midpointAwareV3Output("supported-three-stop")
	const selected = three.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization.selected
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		three, midpointAwareV3Identity, "v3 three-stop fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{
					kind: "source-supported-color",
					hex: selected.render.midpoint.exactColor.hex,
					position: 0.5,
				},
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
})

test("accepts genuine current v3 applicable and no-op adapter domains", () => {
	const applicable = genuineMidpointAwareV3Output()
	assert.equal(applicable.diagnostics.phase3MidpointAwareRenderCandidate.applicable, true)
	assert.doesNotThrow(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		applicable, midpointAwareV3Identity, "genuine v3 applicable fixture"))
	const noOp = genuineMidpointAwareV3NoOpOutput()
	assert.equal(noOp.diagnostics.phase3MidpointAwareRenderCandidate.applicable, false)
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		noOp, midpointAwareV3Identity, "genuine v3 no-op fixture"), undefined)
})

test("accepts finite endpoint-axis path color-position overshoot while keeping render stops bounded", () => {
	const value = genuineMidpointAwareV3Output()
	const root = value.diagnostics.phase3MidpointAwareRenderCandidate
	const selected = root.pathBoundMaterialization.selected
	assert.ok(root.coreEvaluation.bundles.some(({ path }: any) => path.stages.some(({ colorPosition }: any) =>
		colorPosition < 0 || colorPosition > 1)))
	assert.ok(selected.render.endpoints.every(({ position, sourceSpatialPosition, sourceColorPosition }: any) =>
		[position, sourceSpatialPosition, sourceColorPosition].every((coordinate) =>
			Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)))
	assert.doesNotThrow(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, midpointAwareV3Identity, "v3 color-position overshoot fixture"))
})

test("allows a three-stop midpoint to alias foreground under the complete-review schema", () => {
	const value = midpointAliasesForeground(midpointAwareV3Output("supported-three-stop"))
	const selected = value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization.selected
	assert.equal(selected.render.midpoint.exactColor.hex, value.winner.treatment.foreground.hex)
	assert.doesNotThrow(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, midpointAwareV3Identity, "v3 foreground-alias fixture"))
})

test("rejects extra, truncated, or duplicate current v3 materialization domains", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{
			label: "extra candidate",
			mutate: (value) => {
				const materialization = value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization
				const extra = structuredClone(materialization.candidates.at(-1))
				extra.render = { ...extra.render, id: `${extra.render.id}:extra` }
				extra.renderKey = `${extra.publicTreatmentKey}\0${extra.render.id}`
				materialization.candidates.push(extra)
			},
		},
		{
			label: "truncated candidate",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization.candidates.pop()
			},
		},
		{
			label: "duplicate candidate",
			mutate: (value) => {
				const materialization = value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization
				materialization.candidates.push(materialization.candidates.at(-1))
			},
		},
	]
	for (const fixture of cases) {
		const value = genuineMidpointAwareV3Output()
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareV3Identity, fixture.label), /midpoint-aware v3/u, fixture.label)
	}
})

test("derives current v3 no-op reasons from the complete core and materialization domains", () => {
	const value = genuineMidpointAwareV3NoOpOutput()
	value.diagnostics.phase3MidpointAwareRenderCandidate.noOpReason =
		"no-quality-eligible-path-bound-render-candidate"
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, midpointAwareV3Identity, "v3 wrong no-op reason fixture"), /midpoint-aware v3 no-op/u)
})

test("rejects serialized current v3 candidates outside canonical generation order", () => {
	const value = genuineMidpointAwareV3Output()
	const candidates = value.diagnostics.phase3MidpointAwareRenderCandidate
		.pathBoundMaterialization.candidates
	assert.ok(candidates.length > 1)
	;[candidates[0], candidates[1]] = [candidates[1], candidates[0]]
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		value, midpointAwareV3Identity, "v3 reordered candidates fixture"),
		/midpoint-aware v3 candidates are not in generation order/u)
})

test("rejects stale current v3 authoritative baseline replay and quality custody", () => {
	const cases: Array<Readonly<{ label: string; mutate: (root: any) => void }>> = [
		{
			label: "baseline shape",
			mutate: (root) => { delete root.authoritativeBaseline.recoveryWinnerKey },
		},
		{
			label: "verified",
			mutate: (root) => { root.authoritativeBaseline.domainVerification.verified = false },
		},
		{
			label: "materialization replay",
			mutate: (root) => {
				root.authoritativeBaseline.domainVerification.materializationReplayMatches = false
			},
		},
		{
			label: "recovery replay",
			mutate: (root) => {
				root.authoritativeBaseline.domainVerification.recoveryReplayMatches = false
			},
		},
		{
			label: "materialization baseline quality",
			mutate: (root) => {
				root.pathBoundMaterialization.diagnostics.baselineUnrestrictedWinnerQualityUtility += 0.001
			},
		},
		{
			label: "selector baseline relation",
			mutate: (root) => { root.selector.baselineDomainContext.winner.relationUtility += 0.001 },
		},
		{
			label: "selected quality loss",
			mutate: (root) => { root.pathBoundMaterialization.selected.qualityLossFromBaseline += 0.001 },
		},
	]
	for (const fixture of cases) {
		const value = genuineMidpointAwareV3Output()
		fixture.mutate(value.diagnostics.phase3MidpointAwareRenderCandidate)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareV3Identity, fixture.label), /midpoint-aware v3/u, fixture.label)
	}
})

test("rejects JSON-roundtripped linear centers and stale radial source partitions", () => {
	const cases: Array<Readonly<{ label: string; mutate: (path: any) => void }>> = [
		{
			label: "linear with center",
			mutate: (path) => { path.spatialCenter = [0.5, 0.5] },
		},
		{
			label: "upper-center in center-first partition",
			mutate: (path) => {
				path.topology = "radial-upper-center"
				path.direction = "center-out"
				path.spatialCenter = [0.5, 0.43]
			},
		},
		{
			label: "stale radial-offset nearest direction",
			mutate: (path) => {
				path.topology = "radial-offset"
				path.direction = "center-0.35-0.50"
				path.spatialCenter = [0.68, 0.48]
			},
		},
	]
	for (const fixture of cases) {
		const value = JSON.parse(JSON.stringify(genuineMidpointAwareV3Output()))
		const bundle = value.diagnostics.phase3MidpointAwareRenderCandidate.coreEvaluation.bundles
			.find(({ path }: any) => path.topology === "linear")
		assert.ok(bundle)
		fixture.mutate(bundle.path)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareV3Identity, fixture.label), /midpoint-aware v3 core render domain/u,
			fixture.label)
	}
})

test("fails closed on malformed or tampered current v3 render projection custody", () => {
	const cases: Array<Readonly<{ label: string; mutate: (value: any) => void }>> = [
		{
			label: "projection treatment mismatch",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.renderProjection.outputPublicTreatmentKey = "stale"
			},
		},
		{
			label: "missing selected candidate",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization.selected = null
			},
		},
		{
			label: "render kind and gradient mismatch",
			mutate: (value) => {
				value.winner.treatment = { ...value.winner.treatment, gradient: false }
			},
		},
		{
			label: "non-finite stop coordinate",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization
					.selected.render.endpoints[0].sourceSpatialPosition = Number.POSITIVE_INFINITY
			},
		},
		{
			label: "out-of-bounds source coordinate",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.pathBoundMaterialization
					.selected.render.midpoint.exactColor.provenance.x = value.dimensions.width
			},
		},
		{
			label: "selected role binding",
			mutate: (value) => {
				value.diagnostics.phase3MidpointAwareRenderCandidate.selectedAuthority.roleBindingKey = "stale"
			},
		},
	]
	for (const fixture of cases) {
		const value = midpointAwareV3Output("supported-three-stop")
		fixture.mutate(value)
		assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
			value, midpointAwareV3Identity, fixture.label), /midpoint-aware v3/u, fixture.label)
	}
})

test("current v3 support leaves historical v1 and v2 review projections unchanged", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		output(), identity, "v1 compatibility fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(
		midpointAwareOutput("supported-three-stop"), midpointAwareIdentity, "v2 compatibility fixture"),
		expectedResearchRender)
})
