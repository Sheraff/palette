import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { resolve } from "node:path"
import { chroma, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import { GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY } from "../src/gradient-field-topology-model.ts"
import {
	buildNativeCompletePalette,
	evaluateNativeCompletePaletteBlocks,
	NATIVE_COMPLETE_PALETTE_ABLATIONS,
	NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER,
	NATIVE_COMPLETE_PALETTE_POLICY,
	NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256,
	NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER,
	NATIVE_COMPLETE_PALETTE_THRESHOLDS,
	nativeCompletePaletteStrictlyDominates,
	parseNativeCompletePaletteProtocol,
	selectNativeCompletePaletteFromEvidence,
	selectNativeCompletePalettePareto,
	type NativeCompletePaletteComponentName,
	type NativeCompletePaletteFamilyEvidence,
	type NativeCompletePalettePreparedEvidence,
	type NativeCompletePaletteRelationEvidence,
	type NativeCompletePaletteRepresentativeEvidence,
	type NativeCompletePaletteTopologyResolver,
} from "../src/native-complete-palette.ts"
import {
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION,
	NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
	type NativeFieldFamilyQuery,
	type NativeFieldTopologyQuery,
} from "../src/native-field-hypothesis-graph.ts"
import type { Palette, RawImage, RGB } from "../src/types.ts"

const projectRoot = resolve(import.meta.dirname, "../..")
const sourceSha256 = "0".repeat(64)

function rasterSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

function rawImage(colors: readonly RGB[]): RawImage {
	return { width: colors.length, height: 1, data: Uint8Array.from(colors.flat()) }
}

function representative(input: {
	stableKey: string
	familyStableKey: string
	familyKind: "primary-field" | "connected-overlay"
	roleDomain: "primary" | "typography" | "connected-overlay"
	rgb: RGB
	pixel: number
	population: number
	familyPopulation: number
	familySupport: number
	familyStability: number
	text?: number
	saliency?: number
	detail?: number
}): NativeCompletePaletteRepresentativeEvidence {
	const lab = rgbToOKLab(input.rgb)
	return {
		stableKey: input.stableKey,
		familyStableKey: input.familyStableKey,
		familyKind: input.familyKind,
		roleDomain: input.roleDomain,
		rgb: [...input.rgb],
		lab,
		representativePixelIndex: input.pixel,
		construction: input.roleDomain === "connected-overlay" ? "connected-family-reserve" :
			input.roleDomain === "typography" ? "light-typography" : "lloyd-cluster",
		selectedBy: [input.roleDomain === "typography" ? "text" : "population"],
		population: input.population,
		saliency: input.saliency ?? 0.001,
		text: input.text ?? 0.001,
		chroma: chroma(lab),
		detail: input.detail ?? 0.001,
		familyPopulation: input.familyPopulation,
		familySupport: input.familySupport,
		familyStability: input.familyStability,
	}
}

function family(input: {
	stableKey: string
	kind: "primary-field" | "connected-overlay"
	population: number
	support: number
	stability: number
	oneFieldFit?: number
	representatives: NativeCompletePaletteRepresentativeEvidence[]
}): NativeCompletePaletteFamilyEvidence {
	return {
		stableKey: input.stableKey,
		kind: input.kind,
		population: input.population,
		support: input.support,
		stability: input.stability,
		oneFieldFitMinimum: input.oneFieldFit ?? input.support,
		oneFieldFitRange: 0.05,
		representatives: input.representatives,
	}
}

function relation(background: string, surface: string): NativeCompletePaletteRelationEvidence {
	return {
		stableKey: `${background}>${surface}`,
		backgroundFamilyStableKey: background,
		surfaceFamilyStableKey: surface,
		twoFieldFitMinimum: 0.7,
		stateAgreement: 1,
		distinctFlatSupportMinimum: 0.7,
		distinctFlatSupportRange: 0.05,
		gradientSupportMinimum: 0.7,
		gradientSupportRange: 0.05,
	}
}

function prepared(native: RawImage, families: NativeCompletePaletteFamilyEvidence[],
	relations: NativeCompletePaletteRelationEvidence[]): NativeCompletePalettePreparedEvidence {
	const primary = families.filter((entry) => entry.kind === "primary-field").length
	const connected = families.length - primary
	const ordered = primary * (primary - 1)
	return {
		version: "native-complete-palette-prepared-evidence-v1",
		source: {
			sha256: sourceSha256,
			nativeWidth: native.width,
			nativeHeight: native.height,
			nativeRasterSha256: rasterSha256(native),
			profiles: [448, 224, 112].map((edge) => ({ id: `max-edge-${edge}-area-srgb`, rasterSha256: String(edge).padStart(64, "0") })),
		},
		graph: {
			version: NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION,
			policyVersion: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_VERSION,
			policySha256: NATIVE_FIELD_HYPOTHESIS_GRAPH_POLICY_SHA256,
			counts: {
				primaryFieldFamilies: primary,
				connectedOverlayFamilies: connected,
				representatives: families.reduce((sum, entry) => sum + entry.representatives.length, 0),
				maximumRepresentativesPerFamily: Math.max(...families.map((entry) => entry.representatives.length)),
				orderedRelations: ordered,
				collapsedHypotheses: primary,
				distinctFlatHypotheses: ordered,
				gradientHypotheses: ordered,
				totalHypotheses: primary + 2 * ordered,
				logicalHypothesisBound: 276,
			},
		},
		families,
		relations,
	}
}

function role(rgb: RGB, generated = false) {
	return { rgb: [...rgb] as RGB, hex: rgbToHex(rgb), generated, sourceDistance: generated ? 0.5 : 0 }
}

function palette(background: RGB, foreground: RGB, surface: RGB, accent: RGB,
	options: { gradient?: boolean; generatedForeground?: boolean } = {}): Palette {
	return {
		background: role(background),
		foreground: role(foreground, options.generatedForeground),
		surface: role(surface),
		accent: role(accent),
		gradient: { isGradient: options.gradient ?? false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 0.5,
		metrics: {
			foregroundContrast: 1,
			foregroundSurfaceContrast: 1,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function topologyResolver(native?: RawImage): NativeCompletePaletteTopologyResolver {
	return (pairs) => ({
		sourceSha256,
		nativeRasterSha256: native ? rasterSha256(native) : "",
		queryPolicySha256: NATIVE_COMPLETE_PALETTE_QUERY_POLICY_SHA256,
		queries: pairs.map(({ backgroundRgb, surfaceRgb }): NativeFieldTopologyQuery => {
		const profiles = [448, 224, 112].map((edge) => ({
			profileId: `max-edge-${edge}-area-srgb`,
			endpointDistance: okDistance(rgbToOKLab(backgroundRgb), rgbToOKLab(surfaceRgb)),
			features: { unifiedOwnedContinuity: 0.2, ownedProgression: 0.1, ownedConnectivity: 0.2 },
			score: 0.2,
			threshold: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold,
			margin: 0.2 - GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold,
			eligible: false,
		}))
		return {
			backgroundRgb: [...backgroundRgb],
			surfaceRgb: [...surfaceRgb],
			status: "mapped",
			backgroundFamilyStableKey: `query:${rgbToHex(backgroundRgb)}`,
			surfaceFamilyStableKey: `query:${rgbToHex(surfaceRgb)}`,
			profiles,
			observation224: { score: 0.2, margin: 0.2 - GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold, eligible: false },
		}
		}),
	})
}

function query(rgb: RGB, status: NativeFieldFamilyQuery["status"], familyStableKey: string | null,
	pixel: number | null): NativeFieldFamilyQuery {
	return {
		rgb: [...rgb],
		status,
		familyStableKey,
		nativePixelIndex: pixel,
		nativeRgb: pixel === null ? null : [...rgb],
		distance: status === "exact-rgb" ? 0 : null,
		secondFamilyDistance: null,
	}
}

function completeFixture(permuted = false) {
	const gray: RGB = [180, 180, 180]
	const white: RGB = [245, 245, 245]
	const blue: RGB = [30, 60, 100]
	const black: RGB = [5, 5, 5]
	const red: RGB = [120, 0, 0]
	const cyan: RGB = [0, 90, 180]
	const native = rawImage([gray, white, white, blue, black, red, cyan])
	const familyA = family({
		stableKey: "family:a", kind: "primary-field", population: 0.3, support: 0.3, stability: 0.5,
		representatives: [
			representative({ stableKey: "a:gray", familyStableKey: "family:a", familyKind: "primary-field",
				roleDomain: "primary", rgb: gray, pixel: 0, population: 0.3, familyPopulation: 0.3,
				familySupport: 0.3, familyStability: 0.5, detail: 0.001 }),
			representative({ stableKey: "a:black-text", familyStableKey: "family:a", familyKind: "primary-field",
				roleDomain: "typography", rgb: black, pixel: 4, population: 0.05, familyPopulation: 0.3,
				familySupport: 0.3, familyStability: 0.5, text: 0.9, detail: 0.9 }),
		],
	})
	const familyB = family({
		stableKey: "family:b", kind: "primary-field", population: 0.55, support: 0.8, stability: 0.95,
		representatives: [
			representative({ stableKey: "b:001", familyStableKey: "family:b", familyKind: "primary-field",
				roleDomain: "primary", rgb: white, pixel: 1, population: 0.55, familyPopulation: 0.55,
				familySupport: 0.8, familyStability: 0.95 }),
			representative({ stableKey: "b:002", familyStableKey: "family:b", familyKind: "primary-field",
				roleDomain: "primary", rgb: white, pixel: 2, population: 0.2, familyPopulation: 0.55,
				familySupport: 0.8, familyStability: 0.95 }),
		],
	})
	const familyC = family({
		stableKey: "family:c", kind: "primary-field", population: 0.05, support: 0.01, stability: 0.9,
		representatives: [representative({
			stableKey: "c:blue", familyStableKey: "family:c", familyKind: "primary-field", roleDomain: "primary",
			rgb: blue, pixel: 3, population: 0.05, familyPopulation: 0.05, familySupport: 0.01,
			familyStability: 0.9,
		})],
	})
	const connected = family({
		stableKey: "family:connected", kind: "connected-overlay", population: 0.1, support: 0.01, stability: 0.9,
		representatives: [
			representative({ stableKey: "connected:red", familyStableKey: "family:connected",
				familyKind: "connected-overlay", roleDomain: "connected-overlay", rgb: red, pixel: 5,
				population: 0.1, familyPopulation: 0.1, familySupport: 0.01, familyStability: 0.9,
				text: 0.9, saliency: 0.9, detail: 0.9 }),
			representative({ stableKey: "connected:cyan", familyStableKey: "family:connected",
				familyKind: "connected-overlay", roleDomain: "connected-overlay", rgb: cyan, pixel: 6,
				population: 0.01, familyPopulation: 0.1, familySupport: 0.01, familyStability: 0.9,
				text: 0, saliency: 0, detail: 0 }),
		],
	})
	const families = [familyA, familyB, familyC, connected]
	const primaryKeys = [familyA.stableKey, familyB.stableKey, familyC.stableKey]
	const relations = primaryKeys.flatMap((background) => primaryKeys
		.filter((surface) => surface !== background).map((surface) => relation(background, surface)))
	const evidence = prepared(native, permuted
		? [connected, { ...familyC, representatives: [...familyC.representatives].reverse() }, familyB, familyA]
		: families, permuted ? [...relations].reverse() : relations)
	const canonical = palette(gray, black, gray, red)
	const queries = [
		query(gray, "exact-rgb", "family:a", 0),
		query(black, "exact-rgb", "family:a", 4),
		query(red, "unmappable", null, null),
	]
	return { native, evidence, canonical, queries, colors: { gray, white, blue, black, red, cyan } }
}

function runCompleteFixture(permuted = false) {
	const fixture = completeFixture(permuted)
	return {
		fixture,
		result: selectNativeCompletePaletteFromEvidence({
			native: fixture.native,
			sourceSha256,
			canonical: fixture.canonical,
			evidence: fixture.evidence,
			canonicalQueries: fixture.queries,
			resolveTopology: topologyResolver(fixture.native),
		}),
	}
}

function incompleteCanonicalWitnessFixture() {
	const base = completeFixture()
	const originalColors = Array.from({ length: base.native.width }, (_, index): RGB => {
		const offset = index * 3
		return [base.native.data[offset], base.native.data[offset + 1], base.native.data[offset + 2]]
	})
	const extraRedCount = 6
	const native = rawImage([...originalColors,
		...Array.from({ length: extraRedCount }, (): RGB => [...base.colors.red] as RGB)])
	const families = base.evidence.families.map((entry) => {
		if (entry.stableKey !== "family:connected") return entry
		const aliases = Array.from({ length: extraRedCount }, (_, index) => representative({
			stableKey: `connected:red-${index + 2}`,
			familyStableKey: "family:connected",
			familyKind: "connected-overlay",
			roleDomain: "connected-overlay",
			rgb: base.colors.red,
			pixel: originalColors.length + index,
			population: 0.1,
			familyPopulation: 0.1,
			familySupport: 0.01,
			familyStability: 0.9,
			text: 0.9,
			saliency: 0.9,
			detail: 0.9,
		}))
		return { ...entry, representatives: [...entry.representatives, ...aliases] }
	})
	const evidence = prepared(native, families, [...base.evidence.relations])
	const canonical = structuredClone(base.canonical)
	canonical.accent.generated = true
	return selectNativeCompletePaletteFromEvidence({
		native,
		sourceSha256,
		canonical,
		evidence,
		canonicalQueries: base.queries,
		resolveTopology: topologyResolver(native),
	})
}

function fallbackFixture() {
	const white: RGB = [245, 245, 245]
	const salmon: RGB = [200, 130, 130]
	const black: RGB = [0, 0, 0]
	const native = rawImage([white, salmon])
	const fieldFamily = family({
		stableKey: "fallback:field", kind: "primary-field", population: 0.9, support: 0.8, stability: 0.9,
		representatives: [representative({
			stableKey: "fallback:white", familyStableKey: "fallback:field", familyKind: "primary-field",
			roleDomain: "primary", rgb: white, pixel: 0, population: 0.9, familyPopulation: 0.9,
			familySupport: 0.8, familyStability: 0.9,
		})],
	})
	const accentFamily = family({
		stableKey: "fallback:accent", kind: "connected-overlay", population: 0.1, support: 0.01, stability: 0.9,
		representatives: [representative({
			stableKey: "fallback:salmon", familyStableKey: "fallback:accent", familyKind: "connected-overlay",
			roleDomain: "connected-overlay", rgb: salmon, pixel: 1, population: 0.1, familyPopulation: 0.1,
			familySupport: 0.01, familyStability: 0.9, text: 0.8, saliency: 0.8, detail: 0.8,
		})],
	})
	const evidence = prepared(native, [fieldFamily, accentFamily], [])
	const canonical = palette(white, black, white, salmon, { generatedForeground: true })
	return {
		canonical,
		result: selectNativeCompletePaletteFromEvidence({
			native, sourceSha256, canonical, evidence, resolveTopology: topologyResolver(native),
			canonicalQueries: [query(white, "exact-rgb", "fallback:field", 0), query(salmon, "unmappable", null, null)],
		}),
	}
}

function assertDeeplyFrozen(value: unknown, seen = new Set<unknown>()): void {
	if (!value || typeof value !== "object" || seen.has(value) || ArrayBuffer.isView(value)) return
	seen.add(value)
	assert.equal(Object.isFrozen(value), true)
	for (const child of Object.values(value)) assertDeeplyFrozen(child, seen)
}

test("protocol artifact freezes identities, mathematics, source custody, resources, and authorization", async () => {
	const path = resolve(projectRoot,
		"research/data/experiments/native-complete-palette-0.2.5-development/protocol.json")
	const protocol = parseNativeCompletePaletteProtocol(await readFile(path, "utf8"))
	assert.deepEqual(protocol.componentOrder, NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER)
	assert.deepEqual(protocol.thresholds, NATIVE_COMPLETE_PALETTE_THRESHOLDS)
	assert.deepEqual(protocol.sources.allowedRoots, ["00", "images"])
	assert.deepEqual(protocol.sources.forbiddenRoots, ["10", "11", "12", "13", "14"])
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.perSourceWallMilliseconds, 600_000)
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.perSourceChildRssBytes, 1.25 * 1024 ** 3)
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.concurrency, 4)
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.aggregateDeclaredChildCeilingBytes, 5 * 1024 ** 3)
	assert.deepEqual(Object.keys(NATIVE_COMPLETE_PALETTE_POLICY.componentFormulas), NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER)
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.componentFormulas["composition.familyCoverage"],
		"clamp01(sum(unique-selected-primary-field-family-native-population))")
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.marginFormulas.component,
		"value-threshold;pass-iff-margin>=-1e-12")
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.completeTupleMemory.dominanceWitnessExampleLimit, 16)
	assert.equal(NATIVE_COMPLETE_PALETTE_POLICY.ablationEvaluation.pruningAdded, false)
	assert.equal((protocol.ablationEvaluation as { separateStream: string }).separateStream,
		"without-connected-family-local")
	assert.equal(protocol.authorization.reserveAccess, false)
	assert.equal(protocol.status, "phase-5-matrix-authorized")
	assert.equal(protocol.authorization.developmentMatrix, true)
	assert.equal(protocol.authorization.realSourceOutputInspection, true)
	const phase5 = protocol.phase5AuthorizationAmendment as {
		predeclared: boolean
		requiredEvaluatorFiles: string[]
		scientificPolicyMustRemainByteSemanticEqual: boolean
	}
	assert.equal(phase5.predeclared, true)
	assert.deepEqual(phase5.requiredEvaluatorFiles, [
		"research/evaluate-native-complete-palette.ts",
		"research/native-complete-palette-child.ts",
	])
	assert.equal(phase5.scientificPolicyMustRemainByteSemanticEqual, true)
	assert.throws(() => parseNativeCompletePaletteProtocol(JSON.stringify({ ...protocol, componentOrder: [] })),
		/policy mathematics drifted/)
	const rosterPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.path.replace(/#sources$/, ""))
	const rosterRaw = await readFile(rosterPath)
	const roster = JSON.parse(rosterRaw.toString("utf8")) as {
		sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
	}
	const ascii = (first: string, second: string) => first < second ? -1 : first > second ? 1 : 0
	const sources = [...roster.sources].sort((first, second) => ascii(first.cohort, second.cohort) ||
		ascii(first.path, second.path) || ascii(first.sha256, second.sha256))
	assert.equal(createHash("sha256").update(rosterRaw).digest("hex"),
		NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.artifactSha256)
	assert.equal(createHash("sha256").update(JSON.stringify(sources)).digest("hex"),
		NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.asciiSortedSemanticSha256)
	assert.equal(new Set(sources.map((source) => source.path)).size, 392)
	assert.equal(new Set(sources.map((source) => source.sha256)).size, 391)
	assert.equal(sources.filter((source) => source.cohort === "development" && source.path.startsWith("images/")).length, 37)
	assert.equal(sources.filter((source) => source.cohort === "00" && source.path.startsWith("00/")).length, 355)
	assert.ok(sources.every((source) => /^(?:images|00)\/[^/]+$/.test(source.path)))
	const closure = protocol.implementationClosure as {
		status: string
		files: Array<{ path: string; sha256: string }>
	}
	assert.equal(closure.status, "phase-5-execution-frozen")
	for (const file of closure.files) {
		const bytes = await readFile(resolve(projectRoot, file.path))
		assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path)
	}
})

test("exact topology evidence must bind the same source, raster, and query policy", () => {
	const fixture = completeFixture()
	const valid = topologyResolver(fixture.native)
	assert.throws(() => selectNativeCompletePaletteFromEvidence({
		native: fixture.native,
		sourceSha256,
		canonical: fixture.canonical,
		evidence: fixture.evidence,
		canonicalQueries: fixture.queries,
		resolveTopology: (pairs) => ({ ...valid(pairs), sourceSha256: "f".repeat(64) }),
	}), /not bound to the graph source/)
})

test("field domain enumerates all states, semantically deduplicates aliases, and keeps connected overlays out", () => {
	const { result } = runCompleteFixture()
	const counts = result.certificate.stagedDomain.counts
	assert.equal(counts.rawFieldProvenanceTreatments, 24)
	assert.equal(counts.hardFieldRejectedProvenanceTreatments, 0)
	assert.equal(counts.hardFieldEligibleProvenanceTreatments, 24)
	assert.equal(counts.semanticFieldTreatments, 15)
	assert.equal(counts.semanticAliasDuplicates, 9)
	assert.equal(counts.nonTopologyRejectedAliases, 13)
	assert.equal(counts.topologyRejectedAliases, 0)
	assert.equal(counts.retainedFieldAliases, 11)
	assert.equal(counts.topologySemanticPairsRequested, 2)
	assert.ok(result.certificate.stagedDomain.witnesses.some((witness) =>
		witness.stage === "field-nonacceptability" && witness.component === "field.backgroundSupport"))
	for (const roleName of ["background", "surface"] as const) {
		const role = result.certificate.selection.roles[roleName]
		assert.equal(role.status, "exact-source")
		if (role.status === "exact-source") assert.equal(role.familyKind, "primary-field")
	}
	assert.equal(result.certificate.invariants.connectedFamiliesOverlayOnly, true)
})

test("production boundary builds frozen native graph evidence from a synthetic raster and preserves canonical input", () => {
	const native = rawImage(Array.from({ length: 24 * 24 }, (): RGB => [245, 245, 245]))
	native.width = 24
	native.height = 24
	const canonical = palette([245, 245, 245], [0, 0, 0], [245, 245, 245], [245, 245, 245], {
		generatedForeground: true,
	})
	const result = buildNativeCompletePalette(native, sourceSha256, canonical)
	assert.equal(result.palette, canonical)
	assert.equal(result.certificate.graph.version, NATIVE_FIELD_HYPOTHESIS_GRAPH_VERSION)
	assert.equal(result.certificate.source.nativeRasterMatchesGraph, true)
	assert.equal(result.certificate.unchangedCanonicalAssertion.exactObjectReferencePreserved, true)
	assert.equal(Object.isFrozen(canonical), false)
})

test("selected challenger has exact pixels, legal cardinality, distances, collapse, and no overlay collapse", () => {
	const { fixture, result } = runCompleteFixture()
	assert.equal(result.certificate.selection.route, "challenger-selected")
	assert.deepEqual(result.palette.background.rgb, fixture.colors.white)
	assert.deepEqual(result.palette.surface.rgb, fixture.colors.white)
	assert.equal(result.palette.gradient.isGradient, false)
	assert.deepEqual(result.palette.foreground.rgb, fixture.colors.black)
	assert.deepEqual(result.palette.accent.rgb, fixture.colors.red)
	const selected = result.certificate.selection.roles
	for (const roleName of ["background", "surface", "foreground", "accent"] as const) {
		const role = selected[roleName]
		assert.equal(role.status, "exact-source")
		if (role.status !== "exact-source") continue
		const offset = role.representativePixelIndex * 3
		assert.deepEqual(role.rgb, [...fixture.native.data.subarray(offset, offset + 3)])
	}
	const colors = [result.palette.background.rgb, result.palette.surface.rgb,
		result.palette.foreground.rgb, result.palette.accent.rgb]
	assert.ok(new Set(colors.map((rgb) => rgb.join(","))).size <= 4)
	assert.notDeepEqual(result.palette.foreground.rgb, result.palette.accent.rgb)
	assert.ok(okDistance(rgbToOKLab(result.palette.accent.rgb), rgbToOKLab(result.palette.background.rgb)) >= 0.025)
	assert.ok(okDistance(rgbToOKLab(result.palette.accent.rgb), rgbToOKLab(result.palette.foreground.rgb)) >= 0.025)
	assert.equal(result.certificate.invariants.generatedAccentAbsent, true)
	const selectedCoverage = result.certificate.selection.blocks
		.flatMap((block) => block.components)
		.find((component) => component.name === "composition.familyCoverage")
	const canonicalCoverage = result.certificate.canonical.blocks
		.flatMap((block) => block.components)
		.find((component) => component.name === "composition.familyCoverage")
	assert.ok(Math.abs((selectedCoverage?.value ?? 0) - 0.85) <= 1e-12)
	assert.equal(canonicalCoverage?.value, 0.3)
	const accent = result.certificate.selection.roles.accent
	assert.equal(accent.status, "exact-source")
	if (accent.status === "exact-source") assert.equal(accent.familyKind, "connected-overlay")
})

test("signed APCA is finite comparative evidence and generated foreground remains structurally bounded", () => {
	const standard = runCompleteFixture().result
	assert.equal(standard.certificate.counts.foregroundFallbackTreatments, 0)
	for (const decision of Object.values(standard.certificate.selection.apca)) {
		assert.equal(decision.passed, true)
		assert.notEqual(decision.polarity, "none")
		assert.ok(decision.margin >= -1e-12)
		assert.equal(decision.positiveMinimumLc, 0)
		assert.equal(decision.negativeMinimumMagnitudeLc, 0)
	}
	assert.equal(NATIVE_COMPLETE_PALETTE_THRESHOLDS["foreground.backgroundApca"], 0)
	assert.equal(NATIVE_COMPLETE_PALETTE_THRESHOLDS["foreground.surfaceApca"], 0)
	assert.equal(NATIVE_COMPLETE_PALETTE_THRESHOLDS["accent.backgroundApca"], 0)
	assert.equal(NATIVE_COMPLETE_PALETTE_THRESHOLDS["accent.surfaceApca"], 0)
	const lowFixture = completeFixture()
	const lowCanonical = palette(lowFixture.colors.gray, lowFixture.colors.red,
		lowFixture.colors.gray, lowFixture.colors.cyan)
	lowCanonical.accent.generated = true
	const lowResult = selectNativeCompletePaletteFromEvidence({
		native: lowFixture.native,
		sourceSha256,
		canonical: lowCanonical,
		evidence: lowFixture.evidence,
		canonicalQueries: lowFixture.queries,
		resolveTopology: topologyResolver(lowFixture.native),
	})
	assert.equal(lowResult.palette, lowCanonical)
	const lowForeground = [lowResult.certificate.selection.apca.foregroundOnBackground,
		lowResult.certificate.selection.apca.foregroundOnSurface]
	assert.ok(lowForeground.every((decision) => Math.abs(decision.lc) < 60 && decision.passed))
	const { canonical, result } = fallbackFixture()
	assert.equal(result.palette, canonical)
	assert.ok(result.certificate.counts.foregroundFallbackTreatments > 0)
	assert.equal(result.certificate.counts.foregroundFallbackEvaluated,
		result.certificate.counts.foregroundFallbackTreatments * 2)
	assert.ok(result.certificate.counts.foregroundFallbackRetained > 0)
	const foreground = result.certificate.canonical.roles.foreground
	assert.equal(foreground.status, "canonical-generated")
	assert.equal(foreground.evidenceAlias?.status, "generated-fallback")
	if (foreground.evidenceAlias?.status === "generated-fallback") {
		assert.equal(foreground.evidenceAlias.necessity.sourceForegroundsPassing, 0)
		assert.equal(foreground.evidenceAlias.necessity.perTreatmentAuthorized, true)
	}
})

test("all five blocks are noncompensatory and flattened dominance is strict", () => {
	const passing = Object.fromEntries(NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.map((name) => [
		name, NATIVE_COMPLETE_PALETTE_THRESHOLDS[name] + 0.1,
	])) as Record<NativeCompletePaletteComponentName, number>
	assert.ok(evaluateNativeCompletePaletteBlocks(passing).every((block) => block.status === "pass"))
	for (const blockName of ["Field", "Foreground", "Accent", "Composition", "Robustness"] as const) {
		const blocks = evaluateNativeCompletePaletteBlocks({
			...passing,
			[Object.keys(passing).find((name) => name.toLowerCase().startsWith(blockName.toLowerCase()))!]: -1,
		})
		assert.equal(blocks.find((block) => block.name === blockName)?.status, "fail")
		assert.ok(blocks.filter((block) => block.name !== blockName).every((block) => block.status === "pass"))
	}
	assert.equal(nativeCompletePaletteStrictlyDominates([1, 1], [1, 1]), false)
	assert.equal(nativeCompletePaletteStrictlyDominates([1, 0], [0, 1]), false)
	assert.equal(nativeCompletePaletteStrictlyDominates([1, 1], [1, 0]), true)
})

test("weak and incomparable candidates preserve incumbent; change blocks precede candidate Pareto", () => {
	const incumbent = [0.5, 0.5]
	const weak = { semanticKey: "weak", provenanceIdentity: "weak", changedSemanticBlocks: 1,
		changedAtoms: 1, vector: [0.5, 0.5] }
	const incomparable = { semanticKey: "incomparable", provenanceIdentity: "incomparable", changedSemanticBlocks: 1,
		changedAtoms: 1, vector: [0.6, 0.4] }
	assert.equal(selectNativeCompletePalettePareto([weak, incomparable], incumbent).selected, null)
	const oneBlock = { semanticKey: "z", provenanceIdentity: "z", changedSemanticBlocks: 1,
		changedAtoms: 2, vector: [0.6, 0.6] }
	const strongerTwoBlocks = { semanticKey: "a", provenanceIdentity: "a", changedSemanticBlocks: 2,
		changedAtoms: 1, vector: [0.8, 0.8] }
	const selected = selectNativeCompletePalettePareto([strongerTwoBlocks, oneBlock], incumbent)
	assert.equal(selected.admittedCount, 2)
	assert.equal(selected.completePareto[0], strongerTwoBlocks)
	assert.equal(selected.selected, oneBlock)
})

test("nondominating witnesses are streamed into a deterministic compact bounded summary", () => {
	const first = incompleteCanonicalWitnessFixture()
	const second = incompleteCanonicalWitnessFixture()
	const summary = first.certificate.dominanceWitnessSummary
	assert.deepEqual(second.certificate.dominanceWitnessSummary, summary)
	assert.equal(summary.total, first.certificate.counts.incumbentNondominatingCompleteTuples)
	assert.ok(summary.total > 16)
	assert.equal(summary.examples.length, 16)
	assert.equal(summary.exampleLimit, 16)
	assert.equal(summary.exampleRule, "first-16-in-deterministic-tuple-enumeration-order")
	assert.equal(Object.values(summary.byReason).reduce((sum, count) => sum + count, 0), summary.total)
	assert.equal(Object.values(summary.byComponent).reduce((sum, count) => sum + count, 0),
		summary.byReason["weaker-component"])
	assert.match(summary.streamingSha256, /^[0-9a-f]{64}$/)
	assert.equal("dominanceWitnesses" in first.certificate, false)
	assert.equal(first.certificate.invariants.nondominatingCompleteTuplesStreamed, true)
	assert.equal(first.certificate.invariants.admittedCompleteTuplesParetoStreamed, true)
	assert.equal(first.certificate.invariants.completeRejectedTupleDomainsSerialized, false)
	assert.ok(JSON.stringify(first.certificate).length < 1_000_000)
})

test("ASCII ties and input permutations are deterministic and the strict certificate is deeply immutable", () => {
	const first = runCompleteFixture()
	const second = runCompleteFixture(true)
	assert.deepEqual(second.result, first.result)
	assert.match(first.result.certificate.selection.provenanceIdentity, /b:001/)
	assertDeeplyFrozen(first.result.certificate)
	assert.equal(Object.isFrozen(first.fixture.canonical), false)
	assert.equal(Object.isFrozen(first.fixture.canonical.background.rgb), false)
	assert.notEqual(first.result.palette, first.fixture.canonical)
})

test("staged witnesses reject only immutable failed field components", () => {
	const { result } = runCompleteFixture()
	const fieldWitnesses = result.certificate.stagedDomain.witnesses.filter((witness) =>
		witness.stage === "field-nonacceptability")
	assert.ok(fieldWitnesses.length > 0)
	for (const witness of fieldWitnesses) {
		assert.equal(typeof witness.value, "number")
		assert.equal(typeof witness.required, "number")
		assert.ok((witness.value as number) + 1e-12 < (witness.required as number))
		assert.match(witness.proof, /cannot repair/)
	}
	assert.equal(result.certificate.invariants.noHeuristicTopK, true)
})

test("field and complete tuple counts reconcile through selected Pareto frontiers", () => {
	const { result } = runCompleteFixture()
	const field = result.certificate.stagedDomain.counts
	assert.equal(field.rawFieldProvenanceTreatments,
		field.hardFieldRejectedProvenanceTreatments + field.hardFieldEligibleProvenanceTreatments)
	assert.equal(field.hardFieldEligibleProvenanceTreatments,
		field.semanticAliasDuplicates + field.semanticFieldTreatments)
	assert.equal(field.hardFieldEligibleProvenanceTreatments,
		field.nonTopologyRejectedAliases + field.topologyRejectedAliases + field.retainedFieldAliases)
	const counts = result.certificate.counts
	assert.equal(counts.attemptedCompleteTuples, counts.hardRejectedCompleteTuples + counts.hardFeasibleCompleteTuples)
	assert.equal(counts.hardFeasibleCompleteTuples, counts.blockRejectedCompleteTuples + counts.blockPassingCompleteTuples)
	assert.equal(counts.blockPassingCompleteTuples,
		counts.incumbentNondominatingCompleteTuples + counts.incumbentDominatingCompleteTuples)
	assert.equal(counts.completeParetoFrontier, result.certificate.frontiers.completePareto.length)
	assert.equal(counts.withinClassParetoFrontier, result.certificate.frontiers.minimumBlockPareto.length)
	assert.equal(result.certificate.admittedDomain.exactCount, counts.incumbentDominatingCompleteTuples)
	assert.equal(result.certificate.admittedDomain.retainedCompleteParetoTuples, counts.completeParetoFrontier)
	assert.equal(result.certificate.admittedDomain.retainedMinimumBlockParetoTuples,
		counts.withinClassParetoFrontier)
	assert.match(result.certificate.admittedDomain.streamingSha256, /^[0-9a-f]{64}$/)
	assert.equal(result.certificate.dominanceWitnessSummary.total, counts.incumbentNondominatingCompleteTuples)
	assert.equal(result.certificate.canonical.interpretations.exactCount, 1)
	assert.match(result.certificate.canonical.interpretations.streamingSha256, /^[0-9a-f]{64}$/)
	assert.equal(counts.selectedChallengers, 1)
})

test("all eight constrained ablations use independent exact accumulators with legacy-equivalent science", () => {
	const first = runCompleteFixture().result.certificate.ablations
	const scientific = Object.fromEntries(Object.entries(first)
		.map(([name, { independentAccumulator: _, ...summary }]) => [name, summary]))
	assert.equal(createHash("sha256").update(JSON.stringify(scientific)).digest("hex"),
		"7e82ecb8a1be82bfbaccea9ecf3e59a209826bb5ba72a656ce7182c446201691")
	const second = runCompleteFixture().result.certificate.ablations
	assert.deepEqual(Object.keys(first), NATIVE_COMPLETE_PALETTE_ABLATIONS)
	assert.deepEqual(second, first)
	for (const name of NATIVE_COMPLETE_PALETTE_ABLATIONS) {
		assert.equal(first[name].independentAccumulator, true)
		assert.notEqual(first[name], first[NATIVE_COMPLETE_PALETTE_ABLATIONS[(NATIVE_COMPLETE_PALETTE_ABLATIONS.indexOf(name) + 1) % 8]])
		assert.match(first[name].domainSha256, /^[0-9a-f]{64}$/)
		assert.equal(first[name].dominanceWitnessSummary.total,
			first[name].counts.incumbentNondominatingCompleteTuples)
		assert.ok(first[name].dominanceWitnessSummary.examples.length <= 16)
		assert.equal(first[name].admittedDomain.exactCount,
			first[name].counts.incumbentDominatingCompleteTuples)
	}
	assert.equal(first["canonical-field-block"].route, "preserve-canonical")
	assert.equal(first["without-connected-family-local"].route, "preserve-canonical")
})

test("inference has no forbidden supervision feature or reserve authorization", async () => {
	const source = await readFile(resolve(projectRoot, "research/src/native-complete-palette.ts"), "utf8")
	assert.doesNotMatch(source, /caseId|reviewId|batchId|targetHex|colorName|knownCase/)
	assert.equal(source.split("\n").filter((line) => /if\s*\(.*(?:filename|review|comment|target)/i.test(line)).length, 0)
	assert.deepEqual(NATIVE_COMPLETE_PALETTE_POLICY.allowedSourceRoots, ["00", "images"])
	assert.equal("reserveAuthorization" in NATIVE_COMPLETE_PALETTE_POLICY, false)
})
