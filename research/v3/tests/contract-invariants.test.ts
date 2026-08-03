/**
 * Invariant tests for the v3 contract.
 *
 * Every invariant of `PHASE_0_DECISIONS.md` §4 is exercised in both directions: a valid palette that
 * must pass it, and a palette built to trip it and nothing else. The second half is the point —
 * §4 makes a violation reaching the corpus stop-the-line, so a validator that quietly stops
 * detecting something is a worse failure than one that crashes.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/contract-*.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
	apcaLc,
	apcaRawBetween,
	colorDistance,
	colorFromHex,
	colorRegion,
	sameColorBar,
} from "../src/contract/color.ts"
import {
	EPSILON_ACCENT_RAW,
	EPSILON_TEXT_RAW,
	ACCENT_VISIBILITY_COLOR_DISTANCE,
	SAME_COLOR_BAR_BY_REGION,
	SOURCE_POPULATION_FLOOR,
} from "../src/contract/constants.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	DEFERRED_SPATIAL_SPREAD,
	DEFERRED_TRANSPARENCY_REPORT,
	assertOpaqueInput,
	publishedColors,
	resolveContrastParameters,
	TransparentInputError,
	validateContrastFloors,
	validateDistinctness,
	validateOpaqueInput,
	validatePalette,
	validateSchema,
	validateSourceSupport,
} from "../src/contract/invariants.ts"
import {
	accentFloorJustOverEpsilon,
	accentFloorJustUnderEpsilon,
	accentInvisibleAtEqualLuminance,
	accentJustOverVisibilityDistance,
	accentJustUnderVisibilityDistance,
	accentRescuedByColor,
	bandedSource,
	collapsedAccentUnderRaisedFloor,
	contrastFloorInconsistent,
	contrastFloorSelfCertified,
	contrastFloorViolation,
	distinctnessForegroundMatchesStop,
	distinctnessIndistinctStops,
	distinctnessInvisibleAccent,
	distinctnessNearCollapse,
	fixtureMetadata,
	foregroundInvisibleOverStop,
	HAND_WRITTEN_EPSILON_CONTRAST,
	iterableSource,
	lyingAccentCollapseFlag,
	makePalette,
	malformedPalettes,
	missingAccentSource,
	opaqueJpegReport,
	opaquePngReport,
	regionalBarDistinctInDarkNeutral,
	regionalBarSameInLightSaturated,
	regionalBarStraddlingPair,
	schemaBadMetadata,
	schemaCollapseUnflagged,
	schemaFlagWithoutEquality,
	schemaHexRgbMismatch,
	schemaStopOutOfRange,
	schemaStopSpanIncomplete,
	schemaTooManyStops,
	schemaUnorderedStops,
	sparseSource,
	textFloorJustOverEpsilon,
	textFloorJustUnderEpsilon,
	transparentDiscScanReport,
	validCollapsed,
	validFlat,
	validFlatSource,
	validGradient,
	validGradientSource,
	validPalettes,
} from "../src/contract/fixtures.ts"
import type { Palette, Violation } from "../src/contract/types.ts"

function codes(violations: readonly Violation[]): string[] {
	return violations.map((entry) => entry.code).sort()
}

function hasCode(violations: readonly Violation[], code: string): boolean {
	return violations.some((entry) => entry.code === code)
}

// ---------------------------------------------------------------------------------------------
// The valid fixtures are actually valid
// ---------------------------------------------------------------------------------------------

test("every valid fixture passes every invariant that does not need the source", () => {
	for (const palette of validPalettes) {
		const result = validatePalette(palette)
		assert.deepEqual(result.violations, [], `unexpected violations: ${JSON.stringify(result.violations, null, 2)}`)
		assert.equal(result.valid, true)
	}
})

test("a valid palette validates against its own source too", () => {
	const flat = validatePalette(validFlat, { source: validFlatSource, transparency: opaqueJpegReport })
	assert.deepEqual(flat.violations, [])
	assert.equal(flat.valid, true)

	const gradient = validatePalette(validGradient, {
		source: validGradientSource,
		transparency: opaquePngReport,
	})
	assert.deepEqual(gradient.violations, [])
	assert.equal(gradient.valid, true)
})

test("the valid fixtures are non-trivial: they exercise collapse, gradients and the stop exemption", () => {
	assert.equal(validCollapsed.collapse.surfaceCollapsed, true)
	assert.equal(validCollapsed.collapse.accentCollapsed, true)
	assert.equal(validCollapsed.roles.surface.hex, validCollapsed.roles.background.hex)
	assert.equal(validCollapsed.roles.accent.hex, validCollapsed.roles.foreground.hex)

	assert.equal(validGradient.gradient?.stops.length, 3)
	// The first stop is exactly the background, which is the exemption invariant 3 grants.
	assert.equal(validGradient.gradient?.stops[0].color.hex, validGradient.roles.background.hex)
	assert.notEqual(validGradient.gradient?.geometry, undefined)
})

// ---------------------------------------------------------------------------------------------
// I1 — schema validity
// ---------------------------------------------------------------------------------------------

test("I1 accepts the valid fixtures", () => {
	for (const palette of validPalettes) assert.deepEqual(validateSchema(palette), [])
})

test("I1 rejects a fifth gradient stop", () => {
	const violations = validateSchema(schemaTooManyStops)
	assert.ok(hasCode(violations, "I1.stop-count-out-of-range"), codes(violations).join(", "))
	assert.equal(violations.find((v) => v.code === "I1.stop-count-out-of-range")?.measured?.count, 5)
})

test("I1 rejects a single-stop gradient — two stops is the floor for a colour path", () => {
	const palette = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533a",
		stops: [["#2b3f57", 0]],
	})
	assert.ok(hasCode(validateSchema(palette), "I1.stop-count-out-of-range"))
})

test("I1 rejects unordered and out-of-range stop positions", () => {
	assert.ok(hasCode(validateSchema(schemaUnorderedStops), "I1.stop-positions-not-ordered"))
	assert.ok(hasCode(validateSchema(schemaStopOutOfRange), "I1.stop-position-out-of-range"))
})

test("I1 requires the ramp to span its own parameter: first stop at 0, last at 1", () => {
	const violations = validateSchema(schemaStopSpanIncomplete)
	const span = violations.filter((entry) => entry.code === "I1.stop-span-incomplete")
	assert.equal(span.length, 2, codes(violations).join(", "))
	assert.deepEqual(span.map((entry) => entry.measured?.end), ["first", "last"])
	assert.equal(span[0].measured?.position, 0.2)
	assert.equal(span[1].measured?.position, 0.8)

	// Each end is reported independently.
	const shortAtStart = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533a",
		stops: [["#2b3f57", 0.001], ["#4a6b8a", 1]],
	})
	const startOnly = validateSchema(shortAtStart).filter((entry) => entry.code === "I1.stop-span-incomplete")
	assert.equal(startOnly.length, 1)
	assert.equal(startOnly[0].measured?.end, "first")
})

test("I1 accepts a full-span ramp, and the span clause forces interior stops strictly inside (0,1)", () => {
	// 0, 0.5, 1 — the valid gradient fixture. No span violation, and no interior clause needed:
	// strict increase plus fixed endpoints already pins every interior stop into the open interval.
	assert.deepEqual(validateSchema(validGradient), [])
	const interiorAtEnd = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533a",
		stops: [["#101820", 0], ["#2b3f57", 1], ["#4a6b8a", 1]],
	})
	assert.ok(hasCode(validateSchema(interiorAtEnd), "I1.stop-positions-not-ordered"))
})

test("I1 rejects two stops at the same position — a hard stop is not in the contract", () => {
	const palette = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533a",
		stops: [["#2b3f57", 0.5], ["#4a6b8a", 0.5]],
	})
	assert.ok(hasCode(validateSchema(palette), "I1.stop-positions-not-ordered"))
})

test("I1 rejects a missing role", () => {
	const palette = { ...validFlat, roles: { ...validFlat.roles } } as unknown as Palette
	delete (palette.roles as Record<string, unknown>).accent
	const violations = validateSchema(palette)
	assert.ok(hasCode(violations, "I1.role-missing"))
})

test("I1 rejects a colour whose hex and rgb disagree", () => {
	assert.ok(hasCode(validateSchema(schemaHexRgbMismatch), "I1.color-hex-rgb-mismatch"))
})

test("I1 rejects an invalid sRGB triple", () => {
	const palette = {
		...validFlat,
		roles: { ...validFlat.roles, accent: { rgb: [300, 0, 0], hex: "#ff0000" } },
	} as unknown as Palette
	assert.ok(hasCode(validateSchema(palette), "I1.color-invalid-rgb"))
})

test("I1 enforces collapse-flag consistency in both directions", () => {
	// Exactly equal, flag clear.
	const unflagged = validateSchema(schemaCollapseUnflagged)
	assert.ok(hasCode(unflagged, "I1.collapse-flag-inconsistent"))
	assert.equal(unflagged.find((v) => v.code === "I1.collapse-flag-inconsistent")?.measured?.exactlyEqual, true)

	// Flag set, not exactly equal.
	const overclaimed = validateSchema(schemaFlagWithoutEquality)
	assert.ok(hasCode(overclaimed, "I1.collapse-flag-inconsistent"))
	assert.equal(overclaimed.find((v) => v.code === "I1.collapse-flag-inconsistent")?.measured?.exactlyEqual, false)
})

test("I1 rejects an incomplete metadata block", () => {
	assert.ok(hasCode(validateSchema(schemaBadMetadata), "I1.metadata-content-hash-invalid"))

	const noVersion = { ...validFlat, metadata: fixtureMetadata({ algorithmVersion: "" }) }
	assert.ok(hasCode(validateSchema(noVersion), "I1.metadata-algorithm-version-missing"))

	const noPreprocessing = { ...validFlat, metadata: fixtureMetadata({ preprocessingVersion: "" }) }
	assert.ok(hasCode(validateSchema(noPreprocessing), "I1.metadata-preprocessing-version-missing"))

	const badSize = {
		...validFlat,
		metadata: fixtureMetadata({
			sourceRendition: { path: "/fixtures/album.jpg", width: 0, height: 200, format: "jpeg" },
		}),
	}
	assert.ok(hasCode(validateSchema(badSize), "I1.metadata-rendition-size-invalid"))

	const badProcessed = {
		...validFlat,
		metadata: fixtureMetadata({ processedSize: { width: 200, height: -1 } }),
	}
	assert.ok(hasCode(validateSchema(badProcessed), "I1.metadata-processed-size-invalid"))
})

test("I1 rejects a contrast block that is absent or not actually set", () => {
	const missing = { ...validFlat, contrast: undefined } as unknown as Palette
	assert.ok(hasCode(validateSchema(missing), "I1.contrast-missing"))

	// The parameters are always set; a zero floor would mean "off", which the contract has no state for.
	const off = {
		...validFlat,
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 0 },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: EPSILON_ACCENT_RAW },
		},
	}
	assert.ok(hasCode(validateSchema(off), "I1.contrast-effective-invalid"))
})

test("I1 rejects a declared contrast floor below its epsilon — invariant 4 must not be self-certifiable", () => {
	// The verifier's construction. Without this clause the palette reported ZERO violations: an
	// isoluminant pair 0.297 apart in OKLab, |raw APCA| 0.699, certified legible by a floor the
	// palette declared for itself.
	const foreground = contrastFloorSelfCertified.roles.foreground
	const background = contrastFloorSelfCertified.roles.background
	assert.equal(foreground.hex, "#5a5a5a")
	assert.equal(background.hex, "#002bff")
	assert.ok(colorDistance(foreground, background) > sameColorBar(foreground, background) * 10, "invariant 3 is content")
	assert.ok(Math.abs(apcaRawBetween(foreground, background)) < 1, "the pair really is at zero contrast")

	const violations = validateSchema(contrastFloorSelfCertified)
	assert.ok(hasCode(violations, "I1.contrast-floor-below-epsilon"), codes(violations).join(", "))
	const flagged = violations.filter((entry) => entry.code === "I1.contrast-floor-below-epsilon")
	assert.equal(flagged.length, 2, "both parameters declared a floor under their epsilon")
	assert.equal(flagged[0].measured?.declared, 0.0001)
	assert.equal(flagged[0].measured?.epsilon, EPSILON_TEXT_RAW)

	// And the whole palette is invalid, which is what the verifier's case demanded.
	const result = validatePalette(contrastFloorSelfCertified)
	assert.equal(result.valid, false)
})

test("I1 rejects a declared floor that does not follow from the recorded request", () => {
	const violations = validateSchema(contrastFloorInconsistent)
	assert.ok(hasCode(violations, "I1.contrast-floor-inconsistent"), codes(violations).join(", "))
	const flagged = violations.find((entry) => entry.code === "I1.contrast-floor-inconsistent")!
	assert.equal(flagged.measured?.declared, 3)
	assert.equal(flagged.measured?.expected, 62.7)
})

test("I1 accepts every floor that resolveContrastParameters can actually produce", () => {
	for (const requested of [0, 3, 7.3, 15, 45, 60, 105]) {
		const palette: Palette = {
			...validFlat,
			contrast: resolveContrastParameters({ minTextContrast: requested, minAccentContrast: requested }),
		}
		const violations = validateSchema(palette).filter((entry) => entry.code.startsWith("I1.contrast"))
		assert.deepEqual(violations, [], `Lc ${requested} produced ${codes(violations).join(", ")}`)
	}
})

test("I1 rejects geometry with denormalized coordinates", () => {
	const palette: Palette = {
		...validGradient,
		gradient: {
			stops: validGradient.gradient!.stops,
			geometry: { kind: "linear", start: [0, 0], end: [640, 640] },
		},
	}
	assert.ok(hasCode(validateSchema(palette), "I1.geometry-coordinate-invalid"))
})

test("I1 accepts an absent geometry — it is opportunistic, never required", () => {
	const palette: Palette = {
		...validGradient,
		gradient: { stops: validGradient.gradient!.stops },
	}
	assert.deepEqual(validateSchema(palette), [])
})

// ---------------------------------------------------------------------------------------------
// I3 — palette-wide distinctness
// ---------------------------------------------------------------------------------------------

test("I3 accepts the valid fixtures, including both sanctioned collapses", () => {
	for (const palette of validPalettes) assert.deepEqual(validateDistinctness(palette), [])
})

test("I3 checks the full matrix: every unordered pair of published colours", () => {
	// Four roles plus three stops is seven colours, twenty-one pairs. Six of them are exempt:
	// background and surface against each of the three stops. One pair (background/stop 0) is also
	// an exact match, which is exactly why the exemption exists.
	const colors = publishedColors(validGradient)
	assert.equal(colors.length, 7)
	assert.deepEqual(colors.map((entry) => entry.path), [
		"roles.background",
		"roles.surface",
		"roles.foreground",
		"roles.accent",
		"gradient.stops[0]",
		"gradient.stops[1]",
		"gradient.stops[2]",
	])
	assert.equal(validGradient.roles.background.hex, validGradient.gradient!.stops[0].color.hex)
	assert.deepEqual(validateDistinctness(validGradient), [])
})

test("I3 rejects indistinct gradient stops — a degenerate ramp", () => {
	const violations = validateDistinctness(distinctnessIndistinctStops)
	assert.ok(hasCode(violations, "I3.pair-not-distinct"), codes(violations).join(", "))
	const subjects = violations[0].subjects
	assert.deepEqual([...subjects].sort(), ["gradient.stops[0]", "gradient.stops[1]"])
})

test("I3 rejects a foreground that matches a stop — white on white", () => {
	const violations = validateDistinctness(distinctnessForegroundMatchesStop)
	assert.ok(hasCode(violations, "I3.pair-not-distinct"))
	assert.ok(violations.some((entry) => entry.subjects.includes("roles.foreground")))
	// The background matching stop 0 in the same fixture must NOT be reported.
	assert.equal(
		violations.some((entry) => entry.subjects.includes("roles.background")),
		false,
		"field roles are exempt from stop distinctness",
	)
})

test("I3 rejects an invisible accent", () => {
	const violations = validateDistinctness(distinctnessInvisibleAccent)
	assert.ok(hasCode(violations, "I3.pair-not-distinct"))
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.accent", "roles.surface"])
})

test("I3 rejects a near-identical-but-unequal sanctioned collapse", () => {
	// Invariant 1 is content: the flag is clear and the colours are not exactly equal, so the flag is
	// consistent. Invariant 3 is not: a collapse must be exact, never approximate.
	assert.deepEqual(validateSchema(distinctnessNearCollapse), [])
	const violations = validateDistinctness(distinctnessNearCollapse)
	assert.ok(hasCode(violations, "I3.collapse-not-sanctioned"), codes(violations).join(", "))
	assert.ok((violations[0].measured?.distance as number) < SAME_COLOR_BAR_BY_REGION["dark-neutral"])
})

test("I3 rejects an exactly-equal collapse whose flag is clear, alongside I1", () => {
	// Both fire, and they say different things: I1 says the flag lies, I3 says the pair is the same
	// colour and is not sanctioned. Neither report is redundant.
	assert.ok(hasCode(validateSchema(schemaCollapseUnflagged), "I1.collapse-flag-inconsistent"))
	assert.ok(hasCode(validateDistinctness(schemaCollapseUnflagged), "I3.collapse-not-sanctioned"))
})

test("I3 rejects a black-on-black foreground/background", () => {
	const palette = makePalette({
		background: "#000000",
		surface: "#1e2a38",
		foreground: "#000000",
		accent: "#e0533a",
	})
	const violations = validateDistinctness(palette)
	assert.ok(hasCode(violations, "I3.pair-not-distinct"))
	assert.ok(violations.some((entry) =>
		entry.subjects.includes("roles.foreground") && entry.subjects.includes("roles.background")
	))
})

test("I3 judges each pair against its own region's bar — one distance, two answers", () => {
	// The same 0.0140 stop separation, in two regions. This is the finding that refuted a single
	// threshold, expressed as two palettes that must validate differently. The distance sits outside
	// both regions' confidence intervals, so the demonstration does not rest on the point estimates.
	assert.deepEqual(validateDistinctness(regionalBarDistinctInDarkNeutral), [])

	const violations = validateDistinctness(regionalBarSameInLightSaturated)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].code, "I3.pair-not-distinct")
	assert.equal(violations[0].measured?.firstRegion, "light-saturated")
	assert.equal(violations[0].measured?.bar, SAME_COLOR_BAR_BY_REGION["light-saturated"])

	// Same distance in both, to five decimal places.
	const darkStops = regionalBarDistinctInDarkNeutral.gradient!.stops
	const lightStops = regionalBarSameInLightSaturated.gradient!.stops
	const darkDistance = colorDistance(darkStops[0].color, darkStops[1].color)
	const lightDistance = colorDistance(lightStops[0].color, lightStops[1].color)
	assert.ok(Math.abs(darkDistance - lightDistance) < 1e-5, `${darkDistance} vs ${lightDistance}`)
})

test("I3 resolves a straddling pair with the larger of the two bars", () => {
	const stops = regionalBarStraddlingPair.gradient!.stops
	assert.equal(colorRegion(stops[0].color), "dark-saturated")
	assert.equal(colorRegion(stops[1].color), "dark-neutral")

	const violations = validateDistinctness(regionalBarStraddlingPair)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].measured?.bar, SAME_COLOR_BAR_BY_REGION["dark-saturated"])
	// The smaller bar would have called this pair distinct — the rule is what decides here.
	const distance = violations[0].measured?.distance as number
	assert.ok(distance > SAME_COLOR_BAR_BY_REGION["dark-neutral"])
	assert.ok(distance < SAME_COLOR_BAR_BY_REGION["dark-saturated"])
	assert.deepEqual(
		validateDistinctness(regionalBarStraddlingPair, () => SAME_COLOR_BAR_BY_REGION["dark-neutral"]),
		[],
		"forcing the smaller bar flips the verdict, which is what makes the choice load-bearing",
	)
})

test("I3's bar is overridable with a per-pair function, for a future sweep", () => {
	// The near-collapse pair is 0.0075 apart. Forced to 0.005 it is distinct; forced to 0.02 it is not.
	assert.deepEqual(validateDistinctness(distinctnessNearCollapse, () => 0.005), [])
	assert.ok(validateDistinctness(distinctnessNearCollapse, () => 0.02).length > 0)
})

// ---------------------------------------------------------------------------------------------
// I4 — zero-contrast floors
// ---------------------------------------------------------------------------------------------

test("I4 accepts the valid fixtures", () => {
	for (const palette of validPalettes) assert.deepEqual(validateContrastFloors(palette), [])
})

test("I4 rejects a pair that the one ruler calls distinct and APCA calls invisible", () => {
	// This fixture is the reason invariant 4 is not subsumed by invariant 3.
	const foreground = contrastFloorViolation.roles.foreground
	const background = contrastFloorViolation.roles.background
	assert.ok(
		colorDistance(foreground, background) > sameColorBar(foreground, background) * 10,
		"the pair must be emphatically distinct by the one ruler",
	)
	assert.equal(apcaLc(foreground.rgb, background.rgb), 0, "APCA's public scale reports nothing")
	assert.ok(Math.abs(apcaRawBetween(foreground, background)) < EPSILON_TEXT_RAW)

	assert.deepEqual(validateDistinctness(contrastFloorViolation), [], "invariant 3 must be content")
	const violations = validateContrastFloors(contrastFloorViolation)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].code, "I4.below-contrast-floor")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.background", "roles.foreground"])
	assert.equal(violations[0].measured?.parameter, "minTextContrast")
})

test("I4 covers all four pairs and uses the right epsilon for each", () => {
	// A foreground and an accent both sitting at zero luminance contrast against both fields. The
	// accent must also be chromatically close, or its second dimension would rescue it.
	const palette = makePalette({
		background: "#808080",
		surface: "#808080",
		foreground: "#ca00ff",
		accent: "#5e8876",
		surfaceCollapsed: true,
	})
	const violations = validateContrastFloors(palette)
	const pairs = violations.map((entry) => [...entry.subjects].sort().join("+")).sort()
	assert.deepEqual(pairs, [
		"roles.accent+roles.background",
		"roles.accent+roles.surface",
		"roles.background+roles.foreground",
		"roles.foreground+roles.surface",
	])
	const parameters = new Set(violations.map((entry) => entry.measured?.parameter))
	assert.deepEqual([...parameters].sort(), ["minAccentContrast", "minTextContrast"])
})

test("I4 reads the palette's own recorded floor, so a caller-raised floor is enforced", () => {
	// validFlat's accent sits at raw -38.4 against the background: fine at the epsilon, and a
	// violation once a caller asks for Lc 60. Note the colour rescue does not apply here — a raised
	// floor is a request for luminance contrast, which chroma cannot satisfy.
	assert.deepEqual(validateContrastFloors(validFlat), [])

	const strict: Palette = {
		...validFlat,
		contrast: resolveContrastParameters({ minTextContrast: 0, minAccentContrast: 60 }),
	}
	const violations = validateContrastFloors(strict)
	assert.ok(violations.length > 0)
	assert.ok(violations.every((entry) => entry.measured?.parameter === "minAccentContrast"))
	assert.equal(strict.contrast.minAccentContrast.effectiveRawMagnitude, 62.7)
})

test("the defaults resolve to the epsilons, which is what makes I4 the parameter's floor", () => {
	const resolved = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)
	assert.equal(resolved.minTextContrast.requestedLc, 0)
	assert.equal(resolved.minTextContrast.effectiveRawMagnitude, EPSILON_TEXT_RAW)
	assert.equal(resolved.minAccentContrast.effectiveRawMagnitude, EPSILON_ACCENT_RAW)
})

test("I4 skips the accent's pairs when the accent has genuinely collapsed onto the foreground", () => {
	// The accent is exactly the foreground and the caller asked for Lc 105 on the accent — a raw
	// floor of 107.7, above the pair's actual 102.6. Nothing is reported: a collapsed accent has no
	// independent existence and is validated as the foreground.
	assert.equal(collapsedAccentUnderRaisedFloor.collapse.accentCollapsed, true)
	assert.equal(
		collapsedAccentUnderRaisedFloor.roles.accent.hex,
		collapsedAccentUnderRaisedFloor.roles.foreground.hex,
	)
	assert.equal(collapsedAccentUnderRaisedFloor.contrast.minAccentContrast.effectiveRawMagnitude, 107.7)
	const raw = Math.abs(apcaRawBetween(
		collapsedAccentUnderRaisedFloor.roles.accent,
		collapsedAccentUnderRaisedFloor.roles.background,
	))
	assert.ok(raw < 107.7, "the pair must actually be under the raised accent floor, or the test proves nothing")

	assert.deepEqual(validateContrastFloors(collapsedAccentUnderRaisedFloor), [])
	assert.deepEqual(validatePalette(collapsedAccentUnderRaisedFloor).violations, [])
})

test("I4 still checks the foreground when the accent is collapsed — only the accent's own pairs are skipped", () => {
	const palette: Palette = {
		...makePalette({
			background: "#808080",
			surface: "#101820",
			foreground: "#ca00ff",
			accent: "#ca00ff",
		}),
	}
	assert.equal(palette.collapse.accentCollapsed, true)
	const violations = validateContrastFloors(palette)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].measured?.parameter, "minTextContrast")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.background", "roles.foreground"])
})

test("a lying accentCollapsed flag buys no exemption from I4", () => {
	// The flag is set over two different colours. Invariant 1 catches the flag; invariant 4 must
	// still catch the invisible accent, or a false flag would hide exactly what the flag exists to
	// make countable.
	assert.ok(hasCode(validateSchema(lyingAccentCollapseFlag), "I1.collapse-flag-inconsistent"))
	const violations = validateContrastFloors(lyingAccentCollapseFlag)
	assert.ok(violations.length > 0, "the exemption must require the equality the flag claims")
	assert.ok(violations.every((entry) => entry.measured?.parameter === "minAccentContrast"))
	assert.deepEqual(
		violations.map((entry) => [...entry.subjects].sort().join("+")).sort(),
		["roles.accent+roles.background", "roles.accent+roles.surface"],
	)
})

test("I4 is sound standalone: a declared floor below the epsilon is raised to it, not trusted", () => {
	// I1 rejects the declaration, but I4 must also catch the pair on its own — §4 lets each invariant
	// run independently, and the codes drive the census. A validator that is only correct when its
	// siblings also ran is not a gate.
	const violations = validateContrastFloors(contrastFloorSelfCertified)
	assert.ok(hasCode(violations, "I4.below-contrast-floor"), codes(violations).join(", "))
	const flagged = violations.find((entry) => entry.code === "I4.below-contrast-floor")!
	assert.equal(flagged.measured?.declaredRawMagnitude, 0.0001)
	assert.equal(flagged.measured?.floorRawMagnitude, EPSILON_TEXT_RAW)
	assert.ok(Math.abs(flagged.measured?.raw as number) < 1)

	// Identical foreground and background, with the same bogus declaration.
	const identical: Palette = {
		...makePalette({
			background: "#3a5f7d",
			surface: "#101820",
			foreground: "#3a5f7d",
			accent: "#f2f5f7",
		}),
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 0.0001 },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 0.0001 },
		},
	}
	assert.ok(hasCode(validateContrastFloors(identical), "I4.below-contrast-floor"))
})

test("I4 uses the epsilon when the contrast block is missing entirely", () => {
	const noContrast = { ...contrastFloorViolation, contrast: undefined } as unknown as Palette
	assert.ok(hasCode(validateContrastFloors(noContrast), "I4.below-contrast-floor"))
})

test("I4's accent clause is two-dimensional: chroma rescues an equal-luminance accent", () => {
	// Bracketing round 1 part 2. The accent is at zero luminance contrast against the background and
	// would have been a violation under the one-dimensional rule; it is 0.263 apart in OKLab, three
	// and a half times the measured visibility distance, and the reviewer sees it plainly.
	const accent = accentRescuedByColor.roles.accent
	const background = accentRescuedByColor.roles.background
	assert.ok(Math.abs(apcaRawBetween(accent, background)) < EPSILON_ACCENT_RAW, "luminance says invisible")
	assert.ok(colorDistance(accent, background) >= ACCENT_VISIBILITY_COLOR_DISTANCE, "colour says visible")

	assert.deepEqual(validateContrastFloors(accentRescuedByColor), [])
	assert.deepEqual(validatePalette(accentRescuedByColor).violations, [])
})

test("I4's accent clause still fires when BOTH dimensions are undershot", () => {
	const accent = accentInvisibleAtEqualLuminance.roles.accent
	const background = accentInvisibleAtEqualLuminance.roles.background
	assert.ok(Math.abs(apcaRawBetween(accent, background)) < EPSILON_ACCENT_RAW)
	assert.ok(colorDistance(accent, background) < ACCENT_VISIBILITY_COLOR_DISTANCE)
	// And it clears invariant 3's bar for this region, so the two invariants really are separate.
	assert.ok(colorDistance(accent, background) > sameColorBar(accent, background))
	assert.deepEqual(validateDistinctness(accentInvisibleAtEqualLuminance), [])

	const violations = validateContrastFloors(accentInvisibleAtEqualLuminance)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].code, "I4.below-contrast-floor")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.accent", "roles.background"])
	assert.equal(violations[0].measured?.visibilityDistance, ACCENT_VISIBILITY_COLOR_DISTANCE)
})

test("the foreground gets no colour rescue — text is luminance-driven", () => {
	// contrastFloorViolation's foreground is 0.307 from its background, four times the accent's
	// visibility distance, and still a violation. If the rescue ever leaked to text this would pass.
	const foreground = contrastFloorViolation.roles.foreground
	const background = contrastFloorViolation.roles.background
	assert.ok(colorDistance(foreground, background) > ACCENT_VISIBILITY_COLOR_DISTANCE * 4)
	const violations = validateContrastFloors(contrastFloorViolation)
	assert.equal(violations.length, 1)
	assert.equal(violations[0].measured?.parameter, "minTextContrast")
	assert.equal(violations[0].measured?.visibilityDistance, undefined, "no rescue was offered to text")
})

test("the colour rescue applies at the epsilon only, never to a caller-raised floor", () => {
	// The reviewer was asked "can you see this accent at all?" at zero luminance contrast. That
	// licenses chroma as a substitute for visibility, not as a substitute for Lc 60.
	assert.deepEqual(validateContrastFloors(accentRescuedByColor), [])

	const strict: Palette = {
		...accentRescuedByColor,
		contrast: resolveContrastParameters({ minTextContrast: 0, minAccentContrast: 60 }),
	}
	const violations = validateContrastFloors(strict)
	assert.ok(violations.length > 0, "a raised floor is a luminance request; chroma cannot satisfy it")
	assert.ok(violations.every((entry) => entry.measured?.parameter === "minAccentContrast"))
	assert.equal(violations[0].measured?.visibilityDistance, undefined)
})

test("I4 flags an exactly identical foreground/background pair", () => {
	// Identical colours do not produce raw 0 — the epsilon has to be above the residue, and is.
	const palette = makePalette({
		background: "#3a5f7d",
		surface: "#101820",
		foreground: "#3a5f7d",
		accent: "#f2f5f7",
	})
	assert.ok(hasCode(validateContrastFloors(palette), "I4.below-contrast-floor"))
})

// ---------------------------------------------------------------------------------------------
// I4 against the published stops — §2's third field for minTextContrast
// ---------------------------------------------------------------------------------------------

test("I4 holds the foreground to minTextContrast against every published stop", () => {
	// PHASE_0_DECISIONS.md §2 defines the parameter as "foreground vs background, surface, and every
	// published stop". The stop half was enforced nowhere, and this exact palette published clean:
	// `{ valid: true, violations: [] }` (`reviews/phase-0-adversarial/contract.md` finding 2).
	const foreground = foregroundInvisibleOverStop.roles.foreground
	const stop = foregroundInvisibleOverStop.gradient!.stops[0].color
	assert.equal(stop.hex, "#000000")
	assert.ok(Math.abs(apcaRawBetween(foreground, stop)) < EPSILON_TEXT_RAW, "luminance says invisible")
	assert.equal(apcaLc(foreground.rgb, stop.rgb), 0, "APCA's public scale reports nothing")

	// Invariant 3 is right to be content: these are genuinely distinct *colours*, nineteen
	// dark-neutral bars apart. Zero *luminance* contrast is a different question, and it is this one.
	assert.ok(colorDistance(foreground, stop) > sameColorBar(foreground, stop) * 15)
	assert.deepEqual(validateDistinctness(foregroundInvisibleOverStop), [])
	assert.deepEqual(validateSchema(foregroundInvisibleOverStop), [])

	const violations = validateContrastFloors(foregroundInvisibleOverStop)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].code, "I4.stop-below-contrast-floor")
	assert.deepEqual([...violations[0].subjects].sort(), ["gradient.stops[0]", "roles.foreground"])
	assert.equal(violations[0].measured?.parameter, "minTextContrast")
	assert.equal(violations[0].measured?.floorRawMagnitude, EPSILON_TEXT_RAW)
	assert.equal(violations[0].measured?.visibilityDistance, undefined, "no colour rescue for text")

	// And the whole palette is now invalid, which is the point of the fix.
	assert.equal(validatePalette(foregroundInvisibleOverStop).valid, false)
})

test("the stop clause leaves a legible foreground alone, over every stop of a real gradient", () => {
	// The enforcement must not cost the valid fixtures anything: validGradient's near-white foreground
	// clears all three of its stops by an order of magnitude, and it did before the clause existed.
	for (const stop of validGradient.gradient!.stops) {
		assert.ok(
			Math.abs(apcaRawBetween(validGradient.roles.foreground, stop.color)) > EPSILON_TEXT_RAW * 20,
			`stop ${stop.color.hex} must be nowhere near the floor`,
		)
	}
	assert.deepEqual(validateContrastFloors(validGradient), [])
	assert.deepEqual(validatePalette(validGradient).violations, [])
})

test("a caller-raised minTextContrast reaches the stops too, and the stops alone can fail it", () => {
	// The clause is the parameter, not a special case of the epsilon: raising the floor raises it
	// everywhere §2 says the parameter applies.
	const strict: Palette = {
		...validGradient,
		contrast: resolveContrastParameters({ minTextContrast: 90, minAccentContrast: 0 }),
	}
	const violations = validateContrastFloors(strict)
	assert.ok(violations.length > 0)
	assert.ok(violations.every((entry) => entry.measured?.parameter === "minTextContrast"))
	// stop 2 (#4a6b8a, |raw| 78.9) is under a 92.7 floor; stop 0 (#101820, 102.6) is not.
	const subjects = violations.map((entry) => [...entry.subjects].sort().join("+")).sort()
	assert.ok(subjects.includes("gradient.stops[2]+roles.foreground"), subjects.join(", "))
	assert.equal(subjects.includes("gradient.stops[0]+roles.foreground"), false, subjects.join(", "))
})

test("the stop clause covers the foreground only — the accent's stop scope is deliberately still open", () => {
	// §2 reads "minAccentContrast (accent vs same)", which arguably extends the accent to the stops as
	// well. That was not implemented here: the adversarial review's finding is about `minTextContrast`,
	// and widening the accent's scope would change which palettes validate on a question the reviewer
	// has not been asked. This test states the current scope so that changing it has to be deliberate.
	const palette = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#506ca0",
		stops: [["#057689", 0], ["#2b3f57", 1]],
	})
	const accentOverStop = Math.abs(apcaRawBetween(palette.roles.accent, palette.gradient!.stops[0].color))
	assert.ok(accentOverStop < EPSILON_ACCENT_RAW, "the accent is at zero luminance contrast over stop 0")
	assert.deepEqual(validateDistinctness(palette), [], "and invariant 3 does not catch it either")

	const violations = validateContrastFloors(palette)
	assert.deepEqual(
		violations.map((entry) => entry.code),
		[],
		"today the accent is not held to the stops — open reviewer item, PHASE_0_LOOSE_ENDS",
	)
})

// ---------------------------------------------------------------------------------------------
// The frozen thresholds, pinned — one LSB either side of each
// ---------------------------------------------------------------------------------------------

test("a hand-written contrast block pins both epsilons through invariant 1", () => {
	// Every other fixture's contrast block comes out of `resolveContrastParameters`, so it moves in
	// lockstep with any edit to the epsilons and can never disagree with them
	// (`reviews/phase-0-adversarial/contract.md` finding 3, root cause). This block is typed out with
	// the frozen digits, and I1 checks a declaration against `max(lcFloor(requestedLc), ε)` to 1e-9 —
	// so an epsilon that moves in *either* direction makes this assertion fail.
	assert.equal(HAND_WRITTEN_EPSILON_CONTRAST.minTextContrast.effectiveRawMagnitude, 2.5)
	assert.equal(HAND_WRITTEN_EPSILON_CONTRAST.minAccentContrast.effectiveRawMagnitude, 2.5)
	assert.equal(HAND_WRITTEN_EPSILON_CONTRAST.minTextContrast.requestedLc, 0)
	assert.deepEqual(validateSchema(textFloorJustOverEpsilon), [])

	// Which is to say: the resolver and the hand-written digits agree, checked without asking the
	// resolver to supply the answer it is being checked against.
	assert.deepEqual(
		resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		HAND_WRITTEN_EPSILON_CONTRAST,
	)
})

test("the text epsilon is bracketed by one least-significant bit", () => {
	// Same background, two foregrounds one LSB apart in red. The magnitudes are recorded here as
	// literals — measured by search over 8-bit pairs, not read back out of the code under test.
	const under = textFloorJustUnderEpsilon.roles
	const over = textFloorJustOverEpsilon.roles
	assert.equal(under.background.hex, over.background.hex)
	assert.ok(Math.abs(Math.abs(apcaRawBetween(under.foreground, under.background)) - 2.437945) < 1e-6)
	assert.ok(Math.abs(Math.abs(apcaRawBetween(over.foreground, over.background)) - 2.538832) < 1e-6)

	// 2.437945 is under the floor and 2.538832 is over it, and nothing else about the two palettes
	// differs. An epsilon anywhere outside (2.437945, 2.538832] breaks one of these two assertions.
	const violations = validateContrastFloors(textFloorJustUnderEpsilon)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].code, "I4.below-contrast-floor")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.background", "roles.foreground"])
	assert.deepEqual(validateContrastFloors(textFloorJustOverEpsilon), [])
	assert.equal(validatePalette(textFloorJustOverEpsilon).valid, true)
})

test("the accent epsilon is bracketed by one least-significant bit", () => {
	// Same background, two accents one LSB apart in green — and both close enough in colour that the
	// rescue is off in both, so the verdict turns on the accent epsilon alone.
	const under = accentFloorJustUnderEpsilon.roles
	const over = accentFloorJustOverEpsilon.roles
	assert.equal(under.background.hex, over.background.hex)
	assert.ok(Math.abs(Math.abs(apcaRawBetween(under.accent, under.background)) - 2.477742) < 1e-6)
	assert.ok(Math.abs(Math.abs(apcaRawBetween(over.accent, over.background)) - 2.506932) < 1e-6)
	assert.ok(colorDistance(under.accent, under.background) < 0.05, "the colour rescue must be off")
	assert.ok(colorDistance(over.accent, over.background) < 0.05, "the colour rescue must be off")

	const violations = validateContrastFloors(accentFloorJustUnderEpsilon)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].measured?.parameter, "minAccentContrast")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.accent", "roles.background"])
	assert.deepEqual(validateContrastFloors(accentFloorJustOverEpsilon), [])
	assert.equal(validatePalette(accentFloorJustOverEpsilon).valid, true)
})

test("the accent visibility distance is bracketed by one least-significant bit", () => {
	// Same background, two accents one LSB apart in red, both at |raw| under 1 — so luminance condemns
	// both and only the colour rescue can save either. 0.073786 is under the frozen 0.07444 and
	// 0.074600 is over it.
	const under = accentJustUnderVisibilityDistance.roles
	const over = accentJustOverVisibilityDistance.roles
	assert.equal(under.background.hex, over.background.hex)
	assert.ok(Math.abs(colorDistance(under.accent, under.background) - 0.073786) < 1e-6)
	assert.ok(Math.abs(colorDistance(over.accent, over.background) - 0.074600) < 1e-6)
	assert.ok(Math.abs(apcaRawBetween(under.accent, under.background)) < 1)
	assert.ok(Math.abs(apcaRawBetween(over.accent, over.background)) < 1)

	const violations = validateContrastFloors(accentJustUnderVisibilityDistance)
	assert.equal(violations.length, 1, codes(violations).join(", "))
	assert.equal(violations[0].measured?.parameter, "minAccentContrast")
	assert.deepEqual([...violations[0].subjects].sort(), ["roles.accent", "roles.background"])
	assert.deepEqual(validateContrastFloors(accentJustOverVisibilityDistance), [])
	assert.equal(validatePalette(accentJustOverVisibilityDistance).valid, true)
})

// ---------------------------------------------------------------------------------------------
// Boundary strictness at the two central comparisons
// ---------------------------------------------------------------------------------------------

test("I3's comparison is inclusive: a pair exactly at the bar is distinct, one ulp under is not", () => {
	// "Distinct **above** the bar" is a semantic claim in §4, and `distance >= bar` survived mutation
	// to `>` (`reviews/phase-0-adversarial/contract.md` finding 6). The override hook exists precisely
	// so a future round can sweep the threshold; here it pins the strictness at the boundary itself.
	const stops = distinctnessNearCollapse.roles
	const distance = colorDistance(stops.surface, stops.background)
	assert.deepEqual(
		validateDistinctness(distinctnessNearCollapse, () => distance),
		[],
		"a bar exactly equal to the distance must call the pair distinct",
	)
	const justAbove = validateDistinctness(distinctnessNearCollapse, () => distance + 1e-12)
	assert.equal(justAbove.length, 1, codes(justAbove).join(", "))
	assert.equal(justAbove[0].code, "I3.collapse-not-sanctioned")
})

test("I4's comparison is inclusive too: |raw| exactly at the floor passes, one notch under does not", () => {
	// Same mutation, same file: `Math.abs(raw) >= floor` survived `>`. The declared floor is the hook
	// here — a caller-raised floor set to exactly the pair's own magnitude.
	// validCollapsed's surface *is* its background and its accent is its foreground, so the palette has
	// exactly one distinct text pair and the floor can be set to that pair's own magnitude with nothing
	// else to trip over.
	const roles = validCollapsed.roles
	const raw = Math.abs(apcaRawBetween(roles.foreground, roles.background))
	assert.ok(Math.abs(raw - 102.6247) < 1e-4, `the fixture pair moved: ${raw}`)

	const atFloor: Palette = {
		...validCollapsed,
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: raw },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: EPSILON_ACCENT_RAW },
		},
	}
	assert.deepEqual(validateContrastFloors(atFloor), [], "exactly at the floor is not below it")

	const justAbove: Palette = {
		...atFloor,
		contrast: {
			...atFloor.contrast,
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: raw + 1e-9 },
		},
	}
	const violations = validateContrastFloors(justAbove)
	// Two, because the collapsed surface is the background: the same pair, named twice.
	assert.equal(violations.length, 2, codes(violations).join(", "))
	assert.deepEqual(
		violations.map((entry) => [...entry.subjects].sort().join("+")).sort(),
		["roles.background+roles.foreground", "roles.foreground+roles.surface"],
	)
})

// ---------------------------------------------------------------------------------------------
// I2 — source support
// ---------------------------------------------------------------------------------------------

test("I2 accepts a palette whose colours are all exact, well-populated source pixels", () => {
	const result = validateSourceSupport(validFlat, validFlatSource)
	assert.deepEqual(result.violations, [])
})

test("I2 reaches the same verdict through the accessor and the iterator shapes", () => {
	const viaAccessor = validateSourceSupport(validGradient, validGradientSource)
	const viaIterator = validateSourceSupport(validGradient, iterableSource(validGradientSource))
	assert.deepEqual(codes(viaAccessor.violations), codes(viaIterator.violations))
	assert.deepEqual(viaAccessor.violations, [])
})

test("I2 rejects a published colour that is not a pixel of the input", () => {
	const result = validateSourceSupport(validFlat, missingAccentSource)
	assert.ok(hasCode(result.violations, "I2.color-absent-from-source"), codes(result.violations).join(", "))
	assert.deepEqual(result.violations[0].subjects, ["roles.accent"])
	assert.equal(result.violations[0].measured?.occurrences, 0)
})

test("I2 is exact, not nearest: a colour one LSB away is absent", () => {
	const palette = makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533b", // the source has #e0533a
	})
	const result = validateSourceSupport(palette, validFlatSource)
	assert.ok(hasCode(result.violations, "I2.color-absent-from-source"))
})

test("I2 rejects a colour present but below the population floor", () => {
	// 20 pixels of 40,000 is 0.0005 — present, and half the floor.
	const source = sparseSource("#101820", "#e0533a", 20)
	const palette = makePalette({
		background: "#101820",
		surface: "#101820",
		foreground: "#f2f5f7",
		accent: "#e0533a",
	})
	const result = validateSourceSupport(palette, source)
	assert.ok(hasCode(result.violations, "I2.population-below-floor"), codes(result.violations).join(", "))
	const floorViolation = result.violations.find((entry) => entry.code === "I2.population-below-floor")!
	assert.equal(floorViolation.measured?.occurrences, 20)
	assert.ok((floorViolation.measured?.fraction as number) < SOURCE_POPULATION_FLOOR)
	// The foreground is genuinely absent, which is a different code.
	assert.ok(hasCode(result.violations, "I2.color-absent-from-source"))
})

test("I2 accepts a colour exactly at the population floor", () => {
	// 40 pixels of 40,000 is exactly 0.001.
	const source = sparseSource("#101820", "#e0533a", 40)
	const palette = makePalette({
		background: "#101820",
		surface: "#101820",
		foreground: "#101820",
		accent: "#e0533a",
	})
	const result = validateSourceSupport(palette, source)
	assert.equal(hasCode(result.violations, "I2.population-below-floor"), false, codes(result.violations).join(", "))
})

test("I2 is scale-free: the same palette and the same source content pass at both sizes", () => {
	const small = bandedSource(["#101820", "#1e2a38", "#f2f5f7", "#e0533a"], { width: 64, height: 64 })
	const large = bandedSource(["#101820", "#1e2a38", "#f2f5f7", "#e0533a"], { width: 400, height: 400 })
	assert.deepEqual(validateSourceSupport(validFlat, small).violations, [])
	assert.deepEqual(validateSourceSupport(validFlat, large).violations, [])
})

test("I2 groups a colour published by several roles into one count, reported against every path", () => {
	const result = validateSourceSupport(validCollapsed, missingAccentSource)
	// validCollapsed publishes #f2f5f7 as both foreground and accent; the source has it.
	// It publishes #101820 as background and surface; the source has that too. Nothing is missing.
	assert.deepEqual(result.violations, [])

	const absent = validateSourceSupport(validCollapsed, bandedSource(["#101820", "#1e2a38"]))
	const missing = absent.violations.find((entry) => entry.code === "I2.color-absent-from-source")!
	assert.deepEqual([...missing.subjects].sort(), ["roles.accent", "roles.foreground"])
})

test("I2 notices when the source contradicts its own declared size", () => {
	const lying = {
		width: 10,
		height: 10,
		pixels: () => iterableSource(bandedSource(["#101820"], { width: 4, height: 4 })).pixels(),
	}
	const result = validateSourceSupport(validFlat, lying)
	assert.ok(hasCode(result.violations, "I2.source-size-mismatch"))
})

test("I2's spatial-spread half is reported as deferred, never as a pass", () => {
	const result = validateSourceSupport(validFlat, validFlatSource)
	assert.deepEqual(result.deferred, [DEFERRED_SPATIAL_SPREAD])

	// And it survives into the aggregate result.
	const aggregate = validatePalette(validFlat, { source: validFlatSource })
	assert.ok(aggregate.deferred.includes(DEFERRED_SPATIAL_SPREAD))
	assert.equal(aggregate.valid, true, "a deferral is not a violation")
})

test("validatePalette without a source says so, rather than silently skipping invariant 2", () => {
	const result = validatePalette(validFlat)
	assert.deepEqual(
		[...result.deferred].sort(),
		["I2.source-support", "I2.spatial-spread", "I5.transparency-report"],
	)
})

test("validatePalette without a transparency report defers invariant 5 rather than skipping it in silence", () => {
	// This assertion used to run the other way: the deferred list was asserted to be *exactly* invariant
	// 2's two entries, which froze the silence in place (`reviews/phase-0-adversarial/contract.md`
	// finding 5). A caller who forgot the option got `valid: true` and no indication that the invariant
	// whose whole statement is "refused loudly" had not run at all.
	const withoutReport = validatePalette(validFlat)
	assert.ok(withoutReport.deferred.includes(DEFERRED_TRANSPARENCY_REPORT))
	assert.equal(withoutReport.valid, true, "a deferral is not a violation")

	// Supplying the report performs the check, so there is nothing to defer.
	const withReport = validatePalette(validFlat, { transparency: opaqueJpegReport })
	assert.equal(withReport.deferred.includes(DEFERRED_TRANSPARENCY_REPORT), false)

	// Including when the report is the refusing kind and the caller asked for violations, not a throw.
	const transparent = validatePalette(validFlat, {
		transparency: transparentDiscScanReport,
		throwOnTransparentInput: false,
	})
	assert.equal(transparent.deferred.includes(DEFERRED_TRANSPARENCY_REPORT), false)
	assert.ok(hasCode(transparent.violations, "I5.transparent-input"))
})

// ---------------------------------------------------------------------------------------------
// I5 — transparent input refused loudly
// ---------------------------------------------------------------------------------------------

test("I5 accepts an opaque input, with or without an alpha channel", () => {
	assert.doesNotThrow(() => assertOpaqueInput("/fixtures/album.jpg", opaqueJpegReport))
	assert.doesNotThrow(() => assertOpaqueInput("/fixtures/album.png", opaquePngReport))
	assert.deepEqual(validateOpaqueInput("/fixtures/album.png", opaquePngReport), [])
})

test("I5 refuses a transparent input with a typed error carrying the evidence", () => {
	assert.throws(
		() => assertOpaqueInput("/music-artworks/disc-scan.png", transparentDiscScanReport),
		(error: unknown) => {
			assert.ok(error instanceof TransparentInputError)
			assert.equal(error.name, "TransparentInputError")
			assert.equal(error.path, "/music-artworks/disc-scan.png")
			assert.equal(error.report.transparentFraction, 0.28)
			assert.match(error.message, /never silently flattened/)
			assert.match(error.message, /28\.00%/)
			return true
		},
	)
})

test("validatePalette throws on a transparent input by default — refusal is the policy", () => {
	assert.throws(
		() => validatePalette(validFlat, { transparency: transparentDiscScanReport }),
		TransparentInputError,
	)
})

test("validatePalette can report transparency instead of throwing, for corpus sweeps", () => {
	const result = validatePalette(validFlat, {
		transparency: transparentDiscScanReport,
		throwOnTransparentInput: false,
	})
	assert.equal(result.valid, false)
	assert.ok(hasCode(result.violations, "I5.transparent-input"))
	assert.equal(result.violations[0].subjects[0], "metadata.sourceRendition.path")
})

// ---------------------------------------------------------------------------------------------
// validatePalette as a whole
// ---------------------------------------------------------------------------------------------

test("validatePalette collects violations from every invariant at once", () => {
	const broken: Palette = {
		...makePalette({
			background: "#808080",
			surface: "#808080",
			foreground: "#ca00ff",
			accent: "#f2f5f7",
			surfaceCollapsed: false, // exactly equal, flag clear: I1 and I3
			stops: [["#2b3f57", 0.9], ["#2e425a", 0.1]], // unordered: I1; indistinct: I3
		}),
		metadata: fixtureMetadata({ inputContentHash: "nope" }), // I1
	}
	const result = validatePalette(broken, { source: missingAccentSource })
	assert.equal(result.valid, false)
	const found = new Set(result.violations.map((entry) => entry.invariant))
	assert.deepEqual([...found].sort(), ["I1", "I2", "I3", "I4"])
})

test("validatePalette is pure: calling it twice gives the same answer and does not mutate the palette", () => {
	const before = JSON.stringify(validGradient)
	const first = validatePalette(validGradient, { source: validGradientSource })
	const second = validatePalette(validGradient, { source: validGradientSource })
	assert.deepEqual(first, second)
	assert.equal(JSON.stringify(validGradient), before)
})

test("validatePalette is total: every malformed shape is counted, never thrown", () => {
	// This gate runs corpus-wide over persisted JSON. One bad record must be a counted violation,
	// not a crashed sweep — so `validatePalette` has to survive anything that can come out of a file.
	for (const [label, value] of malformedPalettes) {
		const result = validatePalette(value as Palette)
		assert.equal(result.valid, false, `${label} should be invalid`)
		assert.ok(result.violations.length > 0, `${label} should report at least one violation`)
	}
})

test("every individual validator is total too, including with a source", () => {
	const source = bandedSource(["#101820", "#f2f5f7"])
	for (const [label, value] of malformedPalettes) {
		const palette = value as Palette
		assert.doesNotThrow(() => validateSchema(palette), `validateSchema on ${label}`)
		assert.doesNotThrow(() => validateDistinctness(palette), `validateDistinctness on ${label}`)
		assert.doesNotThrow(() => validateContrastFloors(palette), `validateContrastFloors on ${label}`)
		assert.doesNotThrow(() => publishedColors(palette), `publishedColors on ${label}`)
		assert.doesNotThrow(() => validateSourceSupport(palette, source), `validateSourceSupport on ${label}`)
		assert.doesNotThrow(
			() => validatePalette(palette, { source, transparency: opaqueJpegReport }),
			`validatePalette on ${label}`,
		)
	}
})

test("the codes for a wholly absent roles or stops block are reachable", () => {
	// Both were dead code until validatePalette was made total: the sweep crashed before reaching them.
	assert.ok(hasCode(validateSchema(null as unknown as Palette), "I1.roles-missing"))
	assert.ok(hasCode(validateSchema({ roles: {} } as unknown as Palette), "I1.role-missing"))
	assert.ok(hasCode(
		validateSchema({ roles: {}, gradient: { stops: "nope" } } as unknown as Palette),
		"I1.stops-missing",
	))
})

test("a malformed palette still reports its other blocks, not just the first thing wrong", () => {
	// No early return on missing roles: a corpus gate wants the whole diagnosis from one pass.
	const found = new Set(validateSchema({} as unknown as Palette).map((entry) => entry.code))
	assert.ok(found.has("I1.roles-missing"))
	assert.ok(found.has("I1.collapse-missing"))
	assert.ok(found.has("I1.contrast-missing"))
	assert.ok(found.has("I1.metadata-missing"))
})

test("every violation carries a stable code, a message, and the paths it is about", () => {
	const broken = distinctnessInvisibleAccent
	for (const violation of validatePalette(broken).violations) {
		assert.match(violation.code, /^I[1-5]\./)
		assert.equal(violation.code.startsWith(`${violation.invariant}.`), true)
		assert.ok(violation.message.length > 0)
		assert.ok(violation.subjects.length > 0)
	}
})

test("the ruler used by invariant 3 is the one from color.ts, not a private copy", () => {
	// If distinctness ever grew its own distance function this comparison would drift.
	const a = colorFromHex("#2b3f57")
	const b = colorFromHex("#2d4159")
	const violations = validateDistinctness(distinctnessNearCollapse)
	assert.equal(violations[0].measured?.distance, colorDistance(a, b))
	assert.equal(violations[0].measured?.bar, SAME_COLOR_BAR_BY_REGION["dark-neutral"])
	assert.equal(violations[0].measured?.firstRegion, "dark-neutral")
	assert.equal(violations[0].measured?.secondRegion, "dark-neutral")
})
