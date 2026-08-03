/**
 * The contract's invariants, one function per invariant of `PHASE_0_DECISIONS.md` §4, plus
 * `validatePalette()` which runs them all and returns a structured violation list.
 *
 * Three meta-rules from §4 shape this file and are worth stating because they are easy to violate
 * by accident:
 *
 * - **Validation runs on the final published object only.** Nothing here inspects intermediate
 *   state, and nothing here repairs. A validator that could repair would eventually be asked to.
 * - **Any repair re-validates the entire palette.** v2-3's first repair relocated the defect in
 *   13 of 15 cases. That is a rule for whoever writes the repair, but it is why `validatePalette`
 *   is cheap, total, and safe to call again.
 * - **Invariant thresholds reuse the one ruler or carry measured provenance.** Every threshold used
 *   here comes from `constants.ts` with a provenance tag; there are no numbers in this file.
 *
 * An invariant is a claim that a condition is *never* legitimate on any artwork. §4 also says the
 * reviewer outranks the rule: an invariant that ever blocks a palette the reviewer endorses is
 * demoted. Codes are stable strings so that demotion, and the census, can be done by grep.
 */

import {
	apcaRaw,
	colorDistance,
	colorRegion,
	isHexColor,
	isRgb8,
	lcFloorToRawMagnitude,
	rgbToHex,
	sameColorBar,
} from "./color.ts"
import {
	ACCENT_VISIBILITY_COLOR_DISTANCE,
	CONTENT_HASH_PATTERN,
	CONTRAST_FLOOR_TOLERANCE,
	EPSILON_ACCENT_RAW,
	EPSILON_TEXT_RAW,
	MAX_GRADIENT_STOPS,
	MIN_GRADIENT_STOPS,
	POSITION_MAX,
	POSITION_MIN,
	ROLE_NAMES,
	SOURCE_POPULATION_FLOOR,
} from "./constants.ts"
import { firstInvisibleAccentOnRamp, minRawContrastOverRamp, rampPath } from "./ramp.ts"
import type {
	ContrastParameters,
	Palette,
	PaletteColor,
	PixelSample,
	PixelSource,
	ResolvedContrastFloors,
	TransparencyReport,
	ValidationResult,
	Violation,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function violation(
	invariant: Violation["invariant"],
	code: string,
	message: string,
	subjects: readonly string[],
	measured?: Violation["measured"],
): Violation {
	return measured === undefined
		? { invariant, code, message, subjects }
		: { invariant, code, message, subjects, measured }
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

/**
 * Is this a well-formed published colour — an 8-bit triple, a canonical hex, and the two agreeing?
 * The agreement check is the point: a palette must not be able to carry an rgb triple and a hex that
 * disagree, because every downstream check picks one of them.
 */
function colorProblems(color: unknown, path: string): Violation[] {
	if (typeof color !== "object" || color === null) {
		return [violation("I1", "I1.color-missing", `${path} is not a color object`, [path])]
	}
	const candidate = color as Partial<PaletteColor>
	const problems: Violation[] = []
	if (!isRgb8(candidate.rgb)) {
		problems.push(violation(
			"I1",
			"I1.color-invalid-rgb",
			`${path}.rgb is not an 8-bit sRGB triple`,
			[path],
		))
	}
	if (!isHexColor(candidate.hex)) {
		problems.push(violation(
			"I1",
			"I1.color-invalid-hex",
			`${path}.hex is not a canonical #rrggbb lowercase hex`,
			[path],
		))
	}
	if (problems.length === 0 && rgbToHex(candidate.rgb!) !== candidate.hex) {
		problems.push(violation(
			"I1",
			"I1.color-hex-rgb-mismatch",
			`${path}.hex does not spell ${path}.rgb`,
			[path],
			{ hex: candidate.hex as string, derived: rgbToHex(candidate.rgb!) },
		))
	}
	return problems
}

/**
 * Every colour this palette publishes, with the dotted path that names it. This list *is* the
 * distinctness matrix's row and column set, and the set invariant 2 demands source support for.
 */
export type PublishedColor = Readonly<{ path: string; color: PaletteColor }>

export function publishedColors(palette: Palette): PublishedColor[] {
	// Total by construction. This runs as a corpus-wide gate over persisted JSON, where one
	// malformed record must be a counted violation and never a crashed sweep — so every access here
	// tolerates a palette that is null, empty, or wrong in shape, and hands the resulting `undefined`
	// colours to the callers, all of which already skip anything invariant 1 has condemned.
	const roles = (palette as Partial<Palette> | null | undefined)?.roles as
		| Record<string, PaletteColor>
		| undefined
	const published: PublishedColor[] = ROLE_NAMES.map((role) => ({
		path: `roles.${role}`,
		color: (roles == null ? undefined : roles[role]) as PaletteColor,
	}))
	const stops = (palette as Partial<Palette> | null | undefined)?.gradient?.stops
	if (Array.isArray(stops)) {
		stops.forEach((stop, index) => {
			published.push({ path: `gradient.stops[${index}]`, color: stop?.color as PaletteColor })
		})
	}
	return published
}

// ---------------------------------------------------------------------------------------------
// Contrast parameters
// ---------------------------------------------------------------------------------------------

/**
 * Turn the caller's parameters into the floors the algorithm enforces and records.
 *
 * This is the whole of "always set, default = minimum = ε, callers may only raise"
 * (`PHASE_0_DECISIONS.md` §2, §6). A request of 0 — the default — carries no information, because
 * Lc cannot express any magnitude below 7.3; it resolves to the epsilon. A request inside the dead
 * band resolves to the epsilon too, for the same reason. A request above it converts exactly.
 */
export function resolveContrastParameters(parameters: ContrastParameters): ResolvedContrastFloors {
	return {
		minTextContrast: {
			requestedLc: parameters.minTextContrast,
			effectiveRawMagnitude: Math.max(
				lcFloorToRawMagnitude(parameters.minTextContrast),
				EPSILON_TEXT_RAW,
			),
		},
		minAccentContrast: {
			requestedLc: parameters.minAccentContrast,
			effectiveRawMagnitude: Math.max(
				lcFloorToRawMagnitude(parameters.minAccentContrast),
				EPSILON_ACCENT_RAW,
			),
		},
	}
}

/** The parameters at their defaults, which are also their minima. */
export const DEFAULT_CONTRAST_PARAMETERS: ContrastParameters = {
	minTextContrast: 0,
	minAccentContrast: 0,
}

// ---------------------------------------------------------------------------------------------
// I1 — Schema validity
// ---------------------------------------------------------------------------------------------

/**
 * **Invariant 1.** Four roles present and valid sRGB; stops 2–4 with ordered positions in [0,1];
 * collapse flags consistent; metadata block complete.
 *
 * Collapse-flag consistency lives here and only here: a flag set means the two colours are
 * **exactly** equal, a flag clear means they are not. The *near*-identical case — different hexes
 * that the ruler cannot tell apart — is a distinctness question and belongs to invariant 3.
 */
export function validateSchema(palette: Palette): Violation[] {
	const violations: Violation[] = []

	if (!isNonEmptyString(palette?.contractVersion)) {
		violations.push(violation("I1", "I1.contract-version-missing", "contractVersion is missing", [
			"contractVersion",
		]))
	}

	// --- roles ---
	// No early return: a palette missing its roles must still have its collapse, contrast and
	// metadata blocks reported, because a corpus gate wants the whole diagnosis from one pass.
	if (typeof palette?.roles !== "object" || palette.roles === null) {
		violations.push(violation("I1", "I1.roles-missing", "roles block is missing", ["roles"]))
	} else {
		for (const role of ROLE_NAMES) {
			if (!(role in palette.roles)) {
				violations.push(violation("I1", "I1.role-missing", `role ${role} is missing`, [`roles.${role}`]))
				continue
			}
			violations.push(...colorProblems(palette.roles[role], `roles.${role}`))
		}
	}

	// --- gradient ---
	if (palette?.gradient !== null && palette?.gradient !== undefined) {
		const stops = palette.gradient?.stops
		if (!Array.isArray(stops)) {
			violations.push(violation("I1", "I1.stops-missing", "gradient.stops is not an array", [
				"gradient.stops",
			]))
		} else {
			if (stops.length < MIN_GRADIENT_STOPS || stops.length > MAX_GRADIENT_STOPS) {
				violations.push(violation(
					"I1",
					"I1.stop-count-out-of-range",
					`gradient has ${stops.length} stops; the contract allows ${MIN_GRADIENT_STOPS}–${MAX_GRADIENT_STOPS}`,
					["gradient.stops"],
					{ count: stops.length },
				))
			}
			let previousPosition = Number.NEGATIVE_INFINITY
			stops.forEach((stop, index) => {
				const path = `gradient.stops[${index}]`
				violations.push(...colorProblems(stop?.color, `${path}.color`))
				const position = stop?.position
				if (typeof position !== "number" || !Number.isFinite(position)) {
					violations.push(violation("I1", "I1.stop-position-invalid", `${path}.position is not a number`, [
						path,
					]))
					return
				}
				if (position < POSITION_MIN || position > POSITION_MAX) {
					violations.push(violation(
						"I1",
						"I1.stop-position-out-of-range",
						`${path}.position ${position} is outside [${POSITION_MIN}, ${POSITION_MAX}]`,
						[path],
						{ position },
					))
				}
				// Strictly increasing. Two stops at one position would be a hard stop, which nothing in
				// the contract asks for and which renders as a band edge — the opposite of the
				// "flattest path that stays on-artwork" rule.
				if (position <= previousPosition) {
					violations.push(violation(
						"I1",
						"I1.stop-positions-not-ordered",
						`${path}.position ${position} does not exceed the previous stop's ${previousPosition}`,
						[path],
						{ position, previousPosition },
					))
				}
				previousPosition = position
			})

			// The ramp spans its own parameter fully: the first stop sits exactly at t = 0 and the last
			// exactly at t = 1 (orchestrator decision 2026-08-02, recorded in PHASE_0_DECISIONS §2).
			// Positions are normalized over the ramp's own span by construction, so a first stop at 0.2
			// or a last at 0.8 does not describe a shorter gradient — it describes a mis-normalized one.
			// Combined with strict increase, this also forces every interior stop strictly inside (0,1),
			// which is why there is no separate interior clause.
			const positions = stops.map((stop) => stop?.position)
			const allPositionsValid = positions.every((position) =>
				typeof position === "number" && Number.isFinite(position)
			)
			if (allPositionsValid && positions.length > 0) {
				const first = positions[0] as number
				const last = positions[positions.length - 1] as number
				if (first !== POSITION_MIN) {
					violations.push(violation(
						"I1",
						"I1.stop-span-incomplete",
						`gradient.stops[0].position is ${first}; the first stop must sit exactly at ${POSITION_MIN}`,
						["gradient.stops[0]"],
						{ position: first, expected: POSITION_MIN, end: "first" },
					))
				}
				if (last !== POSITION_MAX) {
					violations.push(violation(
						"I1",
						"I1.stop-span-incomplete",
						`gradient.stops[${positions.length - 1}].position is ${last}; the last stop must sit exactly at ${POSITION_MAX}`,
						[`gradient.stops[${positions.length - 1}]`],
						{ position: last, expected: POSITION_MAX, end: "last" },
					))
				}
			}
		}

		const geometry = palette.gradient?.geometry
		if (geometry !== undefined) {
			if (!["linear", "radial", "conic"].includes(geometry.kind)) {
				violations.push(violation("I1", "I1.geometry-kind-invalid", `gradient.geometry.kind ${String(geometry.kind)} is not a known family`, [
					"gradient.geometry",
				]))
			}
			for (const key of ["start", "end", "center"] as const) {
				const point = geometry[key]
				if (point === undefined) continue
				const inRange = Array.isArray(point) && point.length === 2 &&
					point.every((c) => typeof c === "number" && Number.isFinite(c) && c >= POSITION_MIN && c <= POSITION_MAX)
				if (!inRange) {
					violations.push(violation(
						"I1",
						"I1.geometry-coordinate-invalid",
						`gradient.geometry.${key} is not a normalized [0,1] coordinate pair`,
						["gradient.geometry"],
					))
				}
			}
			if (geometry.angleDegrees !== undefined && !Number.isFinite(geometry.angleDegrees)) {
				violations.push(violation("I1", "I1.geometry-angle-invalid", "gradient.geometry.angleDegrees is not finite", [
					"gradient.geometry",
				]))
			}
		}
	}

	// --- collapse flags ---
	const collapse = palette?.collapse
	if (typeof collapse !== "object" || collapse === null) {
		violations.push(violation("I1", "I1.collapse-missing", "collapse block is missing", ["collapse"]))
	} else {
		for (
			const [flag, first, second] of [
				["surfaceCollapsed", "surface", "background"],
				["accentCollapsed", "accent", "foreground"],
			] as const
		) {
			const value = collapse[flag]
			if (typeof value !== "boolean") {
				violations.push(violation("I1", "I1.collapse-flag-not-boolean", `collapse.${flag} is not a boolean`, [
					`collapse.${flag}`,
				]))
				continue
			}
			const a = palette?.roles?.[first]
			const b = palette?.roles?.[second]
			if (!isHexColor(a?.hex) || !isHexColor(b?.hex)) continue
			const equal = a.hex === b.hex
			if (value !== equal) {
				violations.push(violation(
					"I1",
					"I1.collapse-flag-inconsistent",
					value
						? `collapse.${flag} is set but ${first} (${a.hex}) and ${second} (${b.hex}) are not exactly equal`
						: `${first} and ${second} are exactly equal (${a.hex}) but collapse.${flag} is not set`,
					[`collapse.${flag}`, `roles.${first}`, `roles.${second}`],
					{ flag: value, exactlyEqual: equal },
				))
			}
		}
	}

	// --- contrast floors ---
	const contrast = palette?.contrast
	if (typeof contrast !== "object" || contrast === null) {
		violations.push(violation("I1", "I1.contrast-missing", "contrast block is missing", ["contrast"]))
	} else {
		for (const key of ["minTextContrast", "minAccentContrast"] as const) {
			const floor = contrast[key]
			if (typeof floor !== "object" || floor === null) {
				violations.push(violation("I1", "I1.contrast-floor-missing", `contrast.${key} is missing`, [
					`contrast.${key}`,
				]))
				continue
			}
			const requestedValid = typeof floor.requestedLc === "number" &&
				Number.isFinite(floor.requestedLc) && floor.requestedLc >= 0
			if (!requestedValid) {
				violations.push(violation("I1", "I1.contrast-requested-invalid", `contrast.${key}.requestedLc must be a finite Lc magnitude`, [
					`contrast.${key}`,
				]))
			}
			// Strictly positive: the floor is always set, and its minimum is a positive epsilon.
			if (
				typeof floor.effectiveRawMagnitude !== "number" ||
				!Number.isFinite(floor.effectiveRawMagnitude) || floor.effectiveRawMagnitude <= 0
			) {
				violations.push(violation("I1", "I1.contrast-effective-invalid", `contrast.${key}.effectiveRawMagnitude must be a positive raw APCA magnitude`, [
					`contrast.${key}`,
				]))
				continue
			}

			// The floor invariant 4 measures against is a field of the object being validated, so it
			// has to be checked against the constant rather than taken on trust. Without this, a
			// palette could declare `effectiveRawMagnitude: 0.0001` and certify its own foreground as
			// legible at |raw| 0.699 — which is exactly the case §4 invariant 4 exists to forbid
			// ("invalid regardless of hue"). An independent verifier found this hole on 2026-08-02
			// with `#5a5a5a` on `#002bff`: isoluminant, 0.297 apart in OKLab, and previously reported
			// zero violations. "Callers can raise the floor, never lower it below ε" is a rule about
			// the published object, not only about `resolveContrastParameters`.
			const epsilon = key === "minTextContrast" ? EPSILON_TEXT_RAW : EPSILON_ACCENT_RAW
			if (floor.effectiveRawMagnitude < epsilon) {
				violations.push(violation(
					"I1",
					"I1.contrast-floor-below-epsilon",
					`contrast.${key}.effectiveRawMagnitude is ${floor.effectiveRawMagnitude}, below the ${epsilon} epsilon that is this parameter's minimum; callers may raise a floor, never lower it`,
					[`contrast.${key}`],
					{ declared: floor.effectiveRawMagnitude, epsilon, parameter: key },
				))
				continue
			}

			// And it must be the floor the recorded request actually resolves to — a declared floor
			// that does not follow from `requestedLc` is a palette misreporting what it enforced,
			// which makes every verdict about it unscopable.
			if (requestedValid) {
				const expected = Math.max(lcFloorToRawMagnitude(floor.requestedLc), epsilon)
				if (Math.abs(floor.effectiveRawMagnitude - expected) > CONTRAST_FLOOR_TOLERANCE) {
					violations.push(violation(
						"I1",
						"I1.contrast-floor-inconsistent",
						`contrast.${key}.effectiveRawMagnitude is ${floor.effectiveRawMagnitude} but Lc ${floor.requestedLc} resolves to ${expected}`,
						[`contrast.${key}`],
						{ declared: floor.effectiveRawMagnitude, expected, requestedLc: floor.requestedLc },
					))
				}
			}
		}
	}

	// --- metadata ---
	const metadata = palette?.metadata
	if (typeof metadata !== "object" || metadata === null) {
		violations.push(violation("I1", "I1.metadata-missing", "metadata block is missing", ["metadata"]))
	} else {
		if (!isNonEmptyString(metadata.algorithmVersion)) {
			violations.push(violation("I1", "I1.metadata-algorithm-version-missing", "metadata.algorithmVersion is missing", [
				"metadata.algorithmVersion",
			]))
		}
		if (!isNonEmptyString(metadata.preprocessingVersion)) {
			violations.push(violation("I1", "I1.metadata-preprocessing-version-missing", "metadata.preprocessingVersion is missing", [
				"metadata.preprocessingVersion",
			]))
		}
		if (!isNonEmptyString(metadata.inputContentHash) || !CONTENT_HASH_PATTERN.test(metadata.inputContentHash)) {
			violations.push(violation("I1", "I1.metadata-content-hash-invalid", "metadata.inputContentHash is not a lowercase sha-256 hex digest", [
				"metadata.inputContentHash",
			]))
		}
		const rendition = metadata.sourceRendition
		if (typeof rendition !== "object" || rendition === null) {
			violations.push(violation("I1", "I1.metadata-rendition-missing", "metadata.sourceRendition is missing", [
				"metadata.sourceRendition",
			]))
		} else {
			if (!isNonEmptyString(rendition.path)) {
				violations.push(violation("I1", "I1.metadata-rendition-path-missing", "metadata.sourceRendition.path is missing", [
					"metadata.sourceRendition.path",
				]))
			}
			if (!isNonEmptyString(rendition.format)) {
				violations.push(violation("I1", "I1.metadata-rendition-format-missing", "metadata.sourceRendition.format is missing", [
					"metadata.sourceRendition.format",
				]))
			}
			if (!isPositiveInteger(rendition.width) || !isPositiveInteger(rendition.height)) {
				violations.push(violation("I1", "I1.metadata-rendition-size-invalid", "metadata.sourceRendition dimensions must be positive integers (read from the decoder header, never the filename)", [
					"metadata.sourceRendition",
				]))
			}
		}
		const processed = metadata.processedSize
		if (
			typeof processed !== "object" || processed === null ||
			!isPositiveInteger(processed.width) || !isPositiveInteger(processed.height)
		) {
			violations.push(violation("I1", "I1.metadata-processed-size-invalid", "metadata.processedSize dimensions must be positive integers", [
				"metadata.processedSize",
			]))
		}
	}

	return violations
}

// ---------------------------------------------------------------------------------------------
// I3 — Palette-wide distinctness
// ---------------------------------------------------------------------------------------------

/**
 * The two pairs that are allowed to be the same colour, and the flag that has to say so.
 *
 * `[REVIEWED]` — `PHASE_0_DECISIONS.md` §4 invariant 3. Exactly two, and no others: surface may
 * collapse onto background, accent may collapse onto foreground.
 */
const SANCTIONED_COLLAPSE_PAIRS = [
	{ first: "roles.surface", second: "roles.background", flag: "surfaceCollapsed" },
	{ first: "roles.accent", second: "roles.foreground", flag: "accentCollapsed" },
] as const

/**
 * The field roles, which are exempt from distinctness against gradient stops.
 *
 * `[REVIEWED]` — `PHASE_0_DECISIONS.md` §4 invariant 3, second exception class: "background/surface
 * may coincide with stop colors (with decoupled stops this is the natural case)". The foreground and
 * the accent get no such exemption — a foreground that matches a stop is "white on white", and an
 * accent that matches a stop is invisible.
 */
const STOP_EXEMPT_ROLE_PATHS = new Set(["roles.background", "roles.surface"])

function pairKey(first: string, second: string): string {
	return first < second ? `${first}|${second}` : `${second}|${first}`
}

/**
 * **Invariant 3.** Every pair of published colours is distinct above the same-colour bar, with
 * exactly two exception classes.
 *
 * This one invariant subsumes a whole family of v2-3 checks: stop distinctness, invisible accent,
 * foreground-matches-a-stop, black-on-black foreground/background, and non-degenerate gradient
 * (distinct stops imply distinct endpoints). They are not separate rules here; they are cells of the
 * same matrix.
 *
 * A sanctioned collapse is exempt only when it is an **exact** equality *and* its flag is set.
 * Near-identical-but-unequal is a violation like any other pair — the flag cannot launder it. The
 * "flag set but not exactly equal" and "exactly equal but flag clear" cases are reported by
 * invariant 1, which owns flag consistency.
 *
 * **The bar is per pair, not per palette.** The reviewer's bracketing round refuted a single
 * threshold, so each cell of the matrix is judged against the bar for the region its two colours sit
 * in — see `sameColorBar()` in `color.ts` for the regional values and for how a straddling pair is
 * resolved. `barFor` overrides the measurement; supply `() => x` to force one bar across the whole
 * matrix, which is what a future bracketing round sweeping the threshold would do.
 */
export function validateDistinctness(
	palette: Palette,
	barFor: (first: PaletteColor, second: PaletteColor) => number = sameColorBar,
): Violation[] {
	const violations: Violation[] = []
	const colors = publishedColors(palette)

	const sanctioned = new Map<string, { flag: string; satisfied: boolean }>()
	for (const pair of SANCTIONED_COLLAPSE_PAIRS) {
		const first = palette?.roles?.[pair.first.slice("roles.".length) as keyof Palette["roles"]]
		const second = palette?.roles?.[pair.second.slice("roles.".length) as keyof Palette["roles"]]
		const flagSet = palette?.collapse?.[pair.flag] === true
		const exactlyEqual = isHexColor(first?.hex) && isHexColor(second?.hex) && first.hex === second.hex
		sanctioned.set(pairKey(pair.first, pair.second), { flag: pair.flag, satisfied: flagSet && exactlyEqual })
	}

	for (let i = 0; i < colors.length; i++) {
		for (let j = i + 1; j < colors.length; j++) {
			const a = colors[i]
			const b = colors[j]
			if (!isRgb8(a.color?.rgb) || !isRgb8(b.color?.rgb)) continue // invariant 1's problem

			const aIsStop = a.path.startsWith("gradient.stops")
			const bIsStop = b.path.startsWith("gradient.stops")

			// Exception class 2: field roles versus stops.
			if (
				(aIsStop && STOP_EXEMPT_ROLE_PATHS.has(b.path)) ||
				(bIsStop && STOP_EXEMPT_ROLE_PATHS.has(a.path))
			) continue

			// Exception class 1: a sanctioned collapse that is exact and flagged.
			const collapse = sanctioned.get(pairKey(a.path, b.path))
			if (collapse?.satisfied) continue

			const distance = colorDistance(a.color, b.color)
			const bar = barFor(a.color, b.color)
			if (distance >= bar) continue

			violations.push(violation(
				"I3",
				collapse === undefined ? "I3.pair-not-distinct" : "I3.collapse-not-sanctioned",
				collapse === undefined
					? `${a.path} (${a.color.hex}) and ${b.path} (${b.color.hex}) are the same color by the one ruler (OKLab distance ${distance.toFixed(5)} < ${bar})`
					: `${a.path} (${a.color.hex}) and ${b.path} (${b.color.hex}) are the same color by the one ruler (OKLab distance ${distance.toFixed(5)} < ${bar}) and the collapse is not sanctioned: it must be exact hex equality with collapse.${collapse.flag} set`,
				[a.path, b.path],
				{
					distance,
					bar,
					firstRegion: colorRegion(a.color),
					secondRegion: colorRegion(b.color),
				},
			))
		}
	}

	return violations
}

// ---------------------------------------------------------------------------------------------
// I4 — No flat pair at exact-zero luminance contrast
// ---------------------------------------------------------------------------------------------

/**
 * The four pairs invariant 4 covers, and which floor governs each.
 *
 * `[REVIEWED]` — `PHASE_0_DECISIONS.md` §4 invariant 4: foreground versus background and versus
 * surface; accent versus background and versus surface, with its own threshold.
 *
 * The foreground versus the **published gradient stops** is covered too, by
 * `FOREGROUND_STOP_FLOOR` below rather than by a row here, because the stop count varies per palette.
 */
const CONTRAST_FLOOR_PAIRS = [
	{ text: "foreground", field: "background", floor: "minTextContrast", colorRescue: false },
	{ text: "foreground", field: "surface", floor: "minTextContrast", colorRescue: false },
	{ text: "accent", field: "background", floor: "minAccentContrast", colorRescue: true },
	{ text: "accent", field: "surface", floor: "minAccentContrast", colorRescue: true },
] as const

/**
 * The foreground **and the accent** against the whole **rendered gradient ramp**, each under its own
 * parameter.
 *
 * `[REVIEWED — reviewer's ruling, 2026-08-03]`, verbatim on both counts: the accent's minimum
 * contrast must be checked against gradient backgrounds the way the foreground's is, and *"it's not
 * 'each stop' by the way, because the contrast issue could happen somewhere in the middle of 2 points
 * too."* Both floors hold over the entire ramp, not at the stop points.
 *
 * `PHASE_0_DECISIONS.md` §2 defines `minTextContrast` as "foreground vs background, surface, **and
 * every published stop**" and `minAccentContrast` as "accent vs same". The ruling reads "and every
 * published stop" as naming the gradient, not as naming four colours: a stop is a point on a
 * continuum the viewer sees all of, and §2 pins the preview renderer precisely because "gradient
 * verdicts are verdicts about a rendered ramp".
 *
 * ## What this replaced, and why the codes are what they are
 *
 * The first version of this clause, added earlier the same day, checked the foreground against each
 * published stop as a discrete pair. It closed a real hole — the adversarial review had constructed
 * a palette publishing clean with its text invisible against half its own gradient
 * (`reviews/phase-0-adversarial/contract.md` finding 2: foreground `#111111` over a `#000000` stop,
 * |raw APCA| 1.17, Lc 0, 0.178 apart in OKLab, so invariant 3 was legitimately content) — but it
 * checked the corners of a picture and called it the picture, and it left the accent out entirely.
 *
 * The stops are points *on* the ramp, so the whole-ramp minimum is a strict superset of what the
 * per-stop check saw: nothing that used to be caught can now escape. Where the minimum lands on a
 * published stop the violation still carries `I4.stop-below-contrast-floor` and names that stop,
 * which keeps the existing census countable; where it lands between stops it carries
 * `I4.ramp-below-contrast-floor` and names the position. The code therefore says *where*, and a
 * reader of the census can tell the new cases from the old ones.
 *
 * One violation is reported per role rather than one per failing stop: the quantity being enforced is
 * a minimum over the ramp, and a minimum has one location. The message quotes it.
 *
 * `PHASE_0_LOOSE_ENDS.md` B15's *indistinct fraction* — how much of the ramp sits below the bar — is
 * a different quantity and stays parked. Nothing here measures a length; it measures an extremum.
 */
const RAMP_FLOOR_ROLES = [
	{ role: "foreground", floor: "minTextContrast", colorRescue: false },
	{ role: "accent", floor: "minAccentContrast", colorRescue: true },
] as const

/**
 * **Invariant 4.** No flat pair at exact-zero luminance contrast.
 *
 * "Exact zero" is operationally `|raw APCA| < ε` on the **raw pre-clamp scale**. It has to be raw:
 * the public Lc scale clamps everything below 7.3 to 0 and so cannot tell "truly invisible" from
 * "very low but real", which is precisely the distinction being made.
 *
 * There is no separate enforcement path for this invariant — it is the contrast parameters at their
 * floor (`PHASE_0_DECISIONS.md` §4, implementation note). The threshold read here is therefore the
 * palette's own recorded `effectiveRawMagnitude`, which equals the epsilon when the caller left the
 * parameter at its default and is higher when the caller raised it. That is why the same function
 * serves as both the invariant and the caller's opt-in floor.
 *
 * **The two roles are judged on different numbers of dimensions, and that asymmetry is measured.**
 *
 * - *Foreground:* luminance alone. A text pair at zero luminance contrast is invalid regardless of
 *   hue. That is a standing reviewer verdict carried over from v2-3 and is not reopened here — there
 *   is no colour rescue for text.
 *   The foreground is held to this floor against **three** fields, per §2's definition of the
 *   parameter: `background`, `surface`, and every published gradient stop
 *   (`FOREGROUND_STOP_FLOOR`).
 * - *Accent:* luminance **and** colour distance, both. An accent-versus-field pair violates only when
 *   `|raw APCA| < ε` *and* the two colours are closer than `ACCENT_VISIBILITY_COLOR_DISTANCE`.
 *   Bracketing round 1 part 2 put equal-luminance chromatic accent pairs in front of the reviewer and
 *   the answer was that chroma alone carries visibility from about 0.074 OKLab apart. An accent is
 *   icons, not prose; it can be read by hue in a way a paragraph cannot.
 *
 * The accent's two pairs are skipped entirely when the accent has genuinely collapsed onto the
 * foreground — see the note in the body.
 */
export function validateContrastFloors(palette: Palette): Violation[] {
	const violations: Violation[] = []

	// A genuinely collapsed accent *is* the foreground and has no independent existence, so it is
	// validated as the foreground and its own pairs are skipped (orchestrator decision 2026-08-02,
	// recorded in PHASE_0_DECISIONS §4). Without this, raising `minAccentContrast` above
	// `minTextContrast` would report a violation against a colour the palette only publishes once.
	//
	// "Genuinely" is load-bearing: the exemption requires the flag *and* the exact equality it
	// claims. A flag set over two different colours is an invariant-1 violation, and must not also
	// buy the accent an exemption from invariant 4 — otherwise a lying flag hides an invisible accent.
	const accent = palette?.roles?.accent
	const foreground = palette?.roles?.foreground
	const accentIsForeground = palette?.collapse?.accentCollapsed === true &&
		isHexColor(accent?.hex) && isHexColor(foreground?.hex) && accent.hex === foreground.hex

	const pairs: {
		textPath: string
		text: PaletteColor
		fieldPath: string
		field: PaletteColor
		floor: "minTextContrast" | "minAccentContrast"
		colorRescue: boolean
		code: string
	}[] = []

	for (const pair of CONTRAST_FLOOR_PAIRS) {
		if (pair.text === "accent" && accentIsForeground) continue
		const text = palette?.roles?.[pair.text]
		const field = palette?.roles?.[pair.field]
		if (!isRgb8(text?.rgb) || !isRgb8(field?.rgb)) continue // invariant 1's problem
		pairs.push({
			textPath: `roles.${pair.text}`,
			text,
			fieldPath: `roles.${pair.field}`,
			field,
			floor: pair.floor,
			colorRescue: pair.colorRescue,
			code: "I4.below-contrast-floor",
		})
	}

	for (const pair of pairs) {
		const { text, field } = pair

		// The declared floor is a field of the object under validation, so it is a claim, not an
		// authority. Invariant 1 rejects any declaration below the epsilon — but this invariant must
		// also be sound when run on its own, because §4 lets each invariant run independently and the
		// codes drive the census. So the floor enforced here is the declaration raised to the epsilon:
		// a caller can only ever push it up, and a palette declaring 0.0001 is measured against 2.5
		// exactly as if it had declared nothing.
		const epsilon = pair.floor === "minTextContrast" ? EPSILON_TEXT_RAW : EPSILON_ACCENT_RAW
		const declared = palette?.contrast?.[pair.floor]?.effectiveRawMagnitude
		const declaredUsable = typeof declared === "number" && Number.isFinite(declared)
		const floor = declaredUsable ? Math.max(declared, epsilon) : epsilon

		const raw = apcaRaw(text.rgb, field.rgb)
		if (!Number.isFinite(raw)) {
			violations.push(violation(
				"I4",
				"I4.contrast-not-computable",
				`raw APCA between ${pair.textPath} and ${pair.fieldPath} is not a finite number`,
				[pair.textPath, pair.fieldPath],
			))
			continue
		}
		if (Math.abs(raw) >= floor) continue

		// The accent's second dimension. Chroma rescues an accent that luminance alone condemns:
		// bracketing round 1 part 2 showed the reviewer equal-luminance chromatic accent pairs and
		// found them clearly visible from about 0.074 OKLab apart. The foreground gets no such rescue
		// — text is luminance-driven, and that is a standing reviewer verdict, not an oversight here.
		//
		// The rescue applies **only at the epsilon**, never to a floor the caller raised. What the
		// reviewer was asked is "can you see this accent at all?", at zero luminance contrast; the
		// answer licenses chroma as a substitute for *visibility*. A caller asking for Lc 60 on the
		// accent is asking for something else entirely, and "but it is a different hue" does not
		// satisfy a request for luminance contrast. Above the epsilon the clause is one-dimensional
		// again, which is also what keeps the caller's parameter meaning what it says.
		const distance = colorDistance(text, field)
		const rescueAvailable = pair.colorRescue && floor <= epsilon
		if (rescueAvailable && distance >= ACCENT_VISIBILITY_COLOR_DISTANCE) continue

		violations.push(violation(
			"I4",
			pair.code,
			rescueAvailable
				? `${pair.textPath} (${text.hex}) on ${pair.fieldPath} (${field.hex}) has |raw APCA| ${
					Math.abs(raw).toFixed(4)
				}, below the ${pair.floor} floor of ${floor}, and is only ${
					distance.toFixed(5)
				} away in OKLab — under the ${ACCENT_VISIBILITY_COLOR_DISTANCE} at which colour alone makes an accent visible`
				: `${pair.textPath} (${text.hex}) on ${pair.fieldPath} (${field.hex}) has |raw APCA| ${
					Math.abs(raw).toFixed(4)
				}, below the ${pair.floor} floor of ${floor}`,
			[pair.textPath, pair.fieldPath],
			{
				raw,
				floorRawMagnitude: floor,
				parameter: pair.floor,
				declaredRawMagnitude: declaredUsable ? declared : epsilon,
				epsilon,
				colorDistance: distance,
				...(rescueAvailable ? { visibilityDistance: ACCENT_VISIBILITY_COLOR_DISTANCE } : {}),
			},
		))
	}

	// --- the whole rendered ramp, for the foreground and the accent alike ---
	// See `RAMP_FLOOR_ROLES`. Skipped entirely if any stop is malformed: interpolating through a
	// colour invariant 1 has already condemned would manufacture a field nothing renders.
	const stops = palette?.gradient?.stops
	const stopsUsable = Array.isArray(stops) && stops.length >= 2 &&
		stops.every((stop) =>
			isRgb8(stop?.color?.rgb) && typeof stop?.position === "number" && Number.isFinite(stop.position)
		)

	if (stopsUsable) {
		for (const entry of RAMP_FLOOR_ROLES) {
			if (entry.role === "accent" && accentIsForeground) continue
			const subject = palette?.roles?.[entry.role]
			if (!isRgb8(subject?.rgb)) continue // invariant 1's problem

			const subjectPath = `roles.${entry.role}`
			const epsilon = entry.floor === "minTextContrast" ? EPSILON_TEXT_RAW : EPSILON_ACCENT_RAW
			const declared = palette?.contrast?.[entry.floor]?.effectiveRawMagnitude
			const declaredUsable = typeof declared === "number" && Number.isFinite(declared)
			const floor = declaredUsable ? Math.max(declared, epsilon) : epsilon

			// The colour rescue is available on the same terms as for a flat field: the accent only,
			// and only at the epsilon. Where it applies, both dimensions are evaluated **at the same
			// ramp point** — see `firstInvisibleAccentOnRamp` for why a conjunction cannot be
			// whole-ramped by minimising its two halves separately.
			const rescueAvailable = entry.colorRescue && floor <= epsilon
			const extremum = rescueAvailable
				? firstInvisibleAccentOnRamp(subject, stops, floor, ACCENT_VISIBILITY_COLOR_DISTANCE)
				: minRawContrastOverRamp(subject, stops)

			if (extremum === null) continue
			if (!Number.isFinite(extremum.raw)) {
				violations.push(violation(
					"I4",
					"I4.contrast-not-computable",
					`raw APCA between ${subjectPath} and the rendered ramp at ${extremum.position.toFixed(6)} is not a finite number`,
					[subjectPath, rampPath(extremum)],
				))
				continue
			}
			// `firstInvisibleAccentOnRamp` returns only points that already fail both dimensions, so
			// this re-test is the one-dimensional path's — and it is a no-op for the rescued path.
			if (!rescueAvailable && Math.abs(extremum.raw) >= floor) continue

			const fieldPath = rampPath(extremum)
			const where = extremum.stopIndex === null
				? `the rendered ramp at t=${extremum.position.toFixed(6)}`
				: `${fieldPath}`
			violations.push(violation(
				"I4",
				extremum.stopIndex === null ? "I4.ramp-below-contrast-floor" : "I4.stop-below-contrast-floor",
				rescueAvailable
					? `${subjectPath} (${subject.hex}) over ${where} (${extremum.color.hex}) has |raw APCA| ${
						Math.abs(extremum.raw).toFixed(4)
					}, below the ${entry.floor} floor of ${floor}, and is only ${
						extremum.distance.toFixed(5)
					} away in OKLab — under the ${ACCENT_VISIBILITY_COLOR_DISTANCE} at which colour alone makes an accent visible`
					: `${subjectPath} (${subject.hex}) over ${where} (${extremum.color.hex}) has |raw APCA| ${
						Math.abs(extremum.raw).toFixed(4)
					}, below the ${entry.floor} floor of ${floor} — this is the minimum over the entire rendered ramp, not a stop-point check`,
				[subjectPath, fieldPath],
				{
					raw: extremum.raw,
					floorRawMagnitude: floor,
					parameter: entry.floor,
					declaredRawMagnitude: declaredUsable ? declared : epsilon,
					epsilon,
					colorDistance: extremum.distance,
					rampPosition: extremum.position,
					rampColor: extremum.color.hex,
					...(extremum.stopIndex === null ? {} : { stopIndex: extremum.stopIndex }),
					...(rescueAvailable ? { visibilityDistance: ACCENT_VISIBILITY_COLOR_DISTANCE } : {}),
				},
			))
		}
	}

	return violations
}

// ---------------------------------------------------------------------------------------------
// I2 — Source support
// ---------------------------------------------------------------------------------------------

/** Normalize either access shape into one stream of samples. */
function* iterateSource(source: PixelSource): Generator<PixelSample> {
	if ("pixels" in source) {
		yield* source.pixels()
		return
	}
	for (let y = 0; y < source.height; y++) {
		for (let x = 0; x < source.width; x++) {
			yield { x: x / source.width, y: y / source.height, rgb: source.getPixel(x, y) }
		}
	}
}

/**
 * Name of the deferred half of invariant 2, reported by `validateSourceSupport` and carried through
 * `ValidationResult.deferred` so no caller can read silence as a pass.
 *
 * See `SpatialSpreadValidator` in `types.ts`: the *shape* is settled, the thresholds are not, and
 * `PHASE_0_DECISIONS.md` §4 invariant 2 requires them to carry provenance. Implementing the check
 * with a made-up threshold would be worse than not implementing it.
 */
export const DEFERRED_SPATIAL_SPREAD = "I2.spatial-spread"

/**
 * Name of invariant 5 when `validatePalette` was not given a transparency report, carried through
 * `ValidationResult.deferred` for exactly the same reason as invariant 2's two entries: a check that
 * did not run must never be readable as a check that passed.
 *
 * The reason it can be skipped at all is that the report comes from the decoder, not from the
 * palette — nothing in a published palette records whether its input had transparent pixels, so
 * `validatePalette` cannot answer the question on its own and must say so instead.
 *
 * **Added 2026-08-03.** Before that, omitting the option skipped invariant 5 in silence and returned
 * `valid: true` (`reviews/phase-0-adversarial/contract.md` finding 5) — for an invariant whose whole
 * statement is "transparent input refused **loudly**" (`PHASE_0_DECISIONS.md` §4). A corpus gate that
 * forgot the option would have reported a clean sweep.
 */
export const DEFERRED_TRANSPARENCY_REPORT = "I5.transparency-report"

export type SourceSupportResult = Readonly<{
	violations: readonly Violation[]
	deferred: readonly string[]
}>

/**
 * **Invariant 2.** Every published colour is an exact pixel of the input, meeting the population
 * floor.
 *
 * "Exact pixel" is literal: the same three 8-bit channel values, not the nearest quantised bin. This
 * is the invariant that makes the whole contract falsifiable against the artwork — a palette colour
 * that is not in the image is an invention, whatever it looks like.
 *
 * The population floor is scale-free (a fraction of the image, `SOURCE_POPULATION_FLOOR`), so the
 * check means the same thing on a 350 px thumbnail and a 3000 px master.
 *
 * One pass over the pixels, counting by hex. Colours published in more than one role are counted
 * once and reported against every path that published them.
 */
export function validateSourceSupport(palette: Palette, source: PixelSource): SourceSupportResult {
	const violations: Violation[] = []
	const colors = publishedColors(palette).filter((entry) => isRgb8(entry.color?.rgb))

	const pathsByHex = new Map<string, string[]>()
	for (const entry of colors) {
		const key = rgbToHex(entry.color.rgb)
		const existing = pathsByHex.get(key)
		if (existing) existing.push(entry.path)
		else pathsByHex.set(key, [entry.path])
	}

	const counts = new Map<string, number>()
	for (const key of pathsByHex.keys()) counts.set(key, 0)

	let total = 0
	for (const sample of iterateSource(source)) {
		total++
		const key = rgbToHex(sample.rgb)
		const count = counts.get(key)
		if (count !== undefined) counts.set(key, count + 1)
	}

	if (total === 0) {
		violations.push(violation("I2", "I2.source-empty", "the source reported no pixels", ["metadata.sourceRendition"]))
		return { violations, deferred: [DEFERRED_SPATIAL_SPREAD] }
	}

	const declared = source.width * source.height
	if (declared !== total) {
		violations.push(violation(
			"I2",
			"I2.source-size-mismatch",
			`the source yielded ${total} pixels but declares ${source.width}×${source.height} = ${declared}`,
			["metadata.sourceRendition"],
			{ yielded: total, declared },
		))
	}

	for (const [key, paths] of pathsByHex) {
		const count = counts.get(key) ?? 0
		if (count === 0) {
			violations.push(violation(
				"I2",
				"I2.color-absent-from-source",
				`${key} is published by ${paths.join(", ")} but is not an exact pixel of the input`,
				paths,
				{ hex: key, occurrences: 0 },
			))
			continue
		}
		const fraction = count / total
		if (fraction < SOURCE_POPULATION_FLOOR) {
			violations.push(violation(
				"I2",
				"I2.population-below-floor",
				`${key} covers ${(fraction * 100).toFixed(4)}% of the input, below the ${SOURCE_POPULATION_FLOOR * 100}% population floor`,
				paths,
				{ hex: key, fraction, floor: SOURCE_POPULATION_FLOOR, occurrences: count },
			))
		}
	}

	return { violations, deferred: [DEFERRED_SPATIAL_SPREAD] }
}

// ---------------------------------------------------------------------------------------------
// I5 — Transparent input refused loudly
// ---------------------------------------------------------------------------------------------

/**
 * Thrown when an input with genuinely transparent pixels reaches the pipeline.
 *
 * `PHASE_0_DECISIONS.md` §1 and §4 invariant 5. This is a typed throw, not a return value, because
 * the failure mode being prevented is *silence*: the tempting alternative is to flatten onto white
 * and carry on, which produces a plausible palette of colours the artwork does not contain. The
 * measurement behind the policy: `music-artworks/` holds 797 PNGs with real transparency and visual
 * inspection found none of them to be album artwork — they are disc scans with circular cutouts and
 * artist press-photo cutouts. Excluding them is a candidate-set decision; hitting one anyway is a
 * bug that must be heard.
 */
export class TransparentInputError extends Error {
	override readonly name = "TransparentInputError"
	readonly report: TransparencyReport
	readonly path: string

	constructor(path: string, report: TransparencyReport) {
		const fraction = report.transparentFraction === undefined
			? ""
			: ` (${(report.transparentFraction * 100).toFixed(2)}% of pixels)`
		super(
			`refusing to extract a palette from an input with real transparent pixels${fraction}: ${path}. ` +
				`Transparent inputs are never silently flattened; exclude the file from the album-artwork candidate set ` +
				`or supply an opaque rendition.`,
		)
		this.report = report
		this.path = path
	}
}

/**
 * **Invariant 5**, in its loud form. Call this before extraction.
 *
 * An alpha channel is not transparency: a PNG whose alpha is uniformly opaque is fine, and the
 * sharded corpus is 100% JPEG with no alpha at all. Only actual non-opaque pixels refuse.
 */
export function assertOpaqueInput(path: string, report: TransparencyReport): void {
	if (report.hasTransparentPixels) throw new TransparentInputError(path, report)
}

/**
 * **Invariant 5**, in its reporting form, for callers assembling a violation list rather than
 * failing fast. `validatePalette` throws by default; this is what it uses when told not to.
 */
export function validateOpaqueInput(path: string, report: TransparencyReport): Violation[] {
	if (!report.hasTransparentPixels) return []
	return [violation(
		"I5",
		"I5.transparent-input",
		`input has real transparent pixels and must be refused, not flattened: ${path}`,
		["metadata.sourceRendition.path"],
		report.transparentFraction === undefined
			? { path }
			: { path, transparentFraction: report.transparentFraction },
	)]
}

// ---------------------------------------------------------------------------------------------
// validatePalette
// ---------------------------------------------------------------------------------------------

export type ValidatePaletteOptions = Readonly<{
	/**
	 * The decoded input. Supplying it enables invariant 2; omitting it means source support is not
	 * checked and is reported as deferred.
	 */
	source?: PixelSource
	/** The decoder's transparency report. Supplying it enables invariant 5. */
	transparency?: TransparencyReport
	/**
	 * Override the same-colour bar with a per-pair function. Exists so a future bracketing round can
	 * sweep the threshold without editing constants other runs are reading. Defaults to the measured
	 * regional bar, `sameColorBar` from `color.ts`; pass `() => x` to force a single bar.
	 */
	sameColorBar?: (first: PaletteColor, second: PaletteColor) => number
	/**
	 * Whether a transparent input throws. Defaults to `true`, which is the policy. Set `false` only
	 * when deliberately collecting violations across a corpus rather than refusing one file.
	 */
	throwOnTransparentInput?: boolean
}>

/**
 * Run every invariant against a **published** palette and return the structured result.
 *
 * Order is I5, I1, I3, I4, I2 — transparency first because it is a refusal rather than a finding,
 * then schema, because the later checks skip anything invariant 1 has already condemned rather than
 * reporting the same broken colour four times.
 */
export function validatePalette(palette: Palette, options: ValidatePaletteOptions = {}): ValidationResult {
	const violations: Violation[] = []
	const deferred: string[] = []

	if (options.transparency !== undefined) {
		const path = palette?.metadata?.sourceRendition?.path ?? "<unknown input>"
		if (options.throwOnTransparentInput !== false) {
			assertOpaqueInput(path, options.transparency)
		} else {
			violations.push(...validateOpaqueInput(path, options.transparency))
		}
	} else {
		// No report, no answer — and the absence is reported, never passed over. See
		// `DEFERRED_TRANSPARENCY_REPORT`.
		deferred.push(DEFERRED_TRANSPARENCY_REPORT)
	}

	violations.push(...validateSchema(palette))
	violations.push(...validateDistinctness(palette, options.sameColorBar ?? sameColorBar))
	violations.push(...validateContrastFloors(palette))

	if (options.source !== undefined) {
		const support = validateSourceSupport(palette, options.source)
		violations.push(...support.violations)
		deferred.push(...support.deferred)
	} else {
		deferred.push("I2.source-support")
		deferred.push(DEFERRED_SPATIAL_SPREAD)
	}

	return { valid: violations.length === 0, violations, deferred }
}
