/**
 * P6 shared interfaces — the contract between the four modules.
 *
 * Authored by the P6 orchestrator; workers implement against it and do not edit it. If an
 * interface cannot carry your module, report why — the orchestrator amends it for everyone at
 * once. Rationale for every shape is in `../SPEC.md` and the proposal (`arm-e-prime.md`).
 */

import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// Substrate (W1)
// ---------------------------------------------------------------------------------------------

/** Decoded image: OKLab planes for measurement, original 8-bit triples for publication. */
export type ImagePlanes = Readonly<{
	width: number
	height: number
	/** OKLab channels, row-major, length width*height. */
	L: Float32Array
	a: Float32Array
	b: Float32Array
	/** Original sRGB 8-bit channels — the only values a published colour may come from. */
	r8: Uint8Array
	g8: Uint8Array
	b8: Uint8Array
}>

/** The surround ladder: OKLab planes of the Gaussian-blurred image at each scale. */
export type SurroundLadder = Readonly<{
	/** Gaussian sigmas in pixels, coarsest first, geometric spacing (SPEC: ~shortEdge/2 → /64). */
	sigmas: readonly number[]
	levels: readonly Readonly<{ L: Float32Array; a: Float32Array; b: Float32Array }>[]
}>

/**
 * Per-pixel figure–ground decomposition summarised over the ladder. All arrays length
 * width*height. Displacement decomposition matches the contract's (ΔL, ΔC, ΔH) vocabulary.
 */
export type FigureGroundField = Readonly<{
	/** Field-likeness weight in [0,1]: 1 = displacement near zero at every scale. */
	fieldWeight: Float32Array
	/** Ladder-aggregated |ΔL| (ink energy density) per pixel. */
	inkEnergy: Float32Array
	/** Ladder-aggregated √(ΔC²+ΔH²) (mark energy density) per pixel. */
	markEnergy: Float32Array
	/**
	 * Habitual-ground surround colour per pixel (the "sitting on" colour), OKLab planes.
	 * Interpretation correction (2026-08-04, W7 counterfactual): NOT the coarsest rung — at
	 * σ≈shortEdge/2 the surround is ≈ the global mean and habitual-ground coincidence measured
	 * dead (<1e-3) on 10/18 real covers. The rung is the coarsest one that survives W6's
	 * geometric criterion (±2σ must not span the short edge): "what v sits on" must be local
	 * enough to be a surround at all. Anchors at the constant's definition site.
	 */
	ground: Readonly<{ L: Float32Array; a: Float32Array; b: Float32Array }>
}>

export type Substrate = Readonly<{
	planes: ImagePlanes
	ladder: SurroundLadder
	figureGround: FigureGroundField
}>

/** Decode + convert + ladder + figure-ground. Throws SubstrateRefusal on real transparency. */
export type BuildSubstrate = (imagePath: string) => Promise<Substrate>

// ---------------------------------------------------------------------------------------------
// Lattice (W2)
// ---------------------------------------------------------------------------------------------

/** One distinct 8-bit triple of the artwork with its pixel population. */
export type DistinctTriple = Readonly<{
	rgb: Rgb8
	lab: OkLab
	/** Exact pixel count of this triple. */
	count: number
}>

/**
 * The per-candidate statistics the energy consumes (proposal §2.2). Every value is an area
 * integral read from the smoothed lattice — Lipschitz in the pixels by construction.
 */
export type CandidateStats = Readonly<{
	/** Presence mass M(v): neighbourhood share of frame area, in [0,1]. */
	presence: number
	/** Ground mass G(v): share of frame sitting on v (coarsest surround). */
	groundMass: number
	/** M-weighted ink energy E_L(v). */
	inkEnergy: number
	/** M-weighted mark energy E_C(v). */
	markEnergy: number
	/** Habitual ground B(v): mass-weighted mean surround of v's pixels. */
	habitualGround: OkLab
	/** Field-likeness of v's own pixels, mass-weighted, in [0,1]. */
	fieldLikeness: number
	/** Trace of normalised second spatial moment — frame-normalised, scale-free. */
	spatialSpread: number
	/** Border-annulus mass fraction over annulus area fraction; 1.0 = no preference. */
	borderAffinity: number
	/** Distance from v to the mass-weighted centroid of its own neighbourhood (representativeness). */
	centroidDistance: number
}>

export type Lattice = Readonly<{
	/** All distinct triples of the artwork. Never filtered — this IS the feasible set. */
	triples: readonly DistinctTriple[]
	/** Statistics for any OKLab point, by trilinear read of the convolved stack. */
	statsAt: (lab: OkLab) => CandidateStats
	/** Nearest populated artwork triple to an OKLab point (for excursion + stop insertion). */
	nearestTriple: (lab: OkLab) => DistinctTriple
	/** Distance from a point to the nearest populated artwork colour (excursion integrand). */
	distanceToArtwork: (lab: OkLab) => number
	/** The bandwidth h actually used (provenance-tagged at its definition site). */
	bandwidth: number
}>

export type BuildLattice = (substrate: Substrate) => Lattice

// ---------------------------------------------------------------------------------------------
// Field model (W3)
// ---------------------------------------------------------------------------------------------

export type FieldStop = Readonly<{
	/** An exact artwork triple. */
	triple: DistinctTriple
	/** Position along the ramp in [0,1]; first stop IS background, last IS surface. */
	t: number
}>

export type FieldHypothesis = Readonly<{
	kind: "flat" | "gradient"
	/**
	 * Flat: exactly one stop (the field colour). Gradient: 2–3 stops, ends fixed by orientation
	 * (top-left mass end first, per the 135° ruling). A useful 4th stop is recorded in
	 * `reportedFourthStop`, never published.
	 */
	stops: readonly FieldStop[]
	/** Description length of this model of Φ — comparable across hypotheses. */
	descriptionLength: number
	/** Max excursion of the rendered ramp from artwork colours, after stop insertion. */
	maxExcursion: number
	reportedFourthStop?: Readonly<{ stop: FieldStop; excursionEvidence: number }>
}>

/**
 * Ranked field hypotheses (best first, small fixed number carried — SPEC: the count is a [HELD]
 * parameter). The energy evaluates the full tuple under each; the field decision is NOT taken
 * here (proposal §2.5). Takes the exchange-rate registry because the DL rate (free parameter 6)
 * lives there and nowhere else — amended per SPEC "Integration directives" item 3.
 */
export type BuildFieldHypotheses = (
	substrate: Substrate,
	lattice: Lattice,
	rates: ExchangeRates,
) => readonly FieldHypothesis[]

// ---------------------------------------------------------------------------------------------
// Energy + solver (W4)
// ---------------------------------------------------------------------------------------------

/**
 * The exchange-rate registry. EVERY free rate of the energy lives here and nowhere else, each
 * with a provenance tag at its definition. `tools/sensitivity.ts` perturbs this object wholesale
 * — the energy must accept it as an argument rather than importing constants directly.
 */
export type ExchangeRates = Readonly<{
	/** Free parameter 3: belonging vs role-fitness. [UNCALIBRATED] */
	belonging: number
	/** Free parameter 4: identity-coverage weight. [UNCALIBRATED] */
	coverage: number
	/** Free parameter 6: field-model DL rate (colour fit vs spatial coherence). [UNCALIBRATED] */
	fieldDescriptionLength: number
	/** Free parameter 7: collapse cost. [UNCALIBRATED] */
	collapse: number
	/** Representativeness weight — smallest term, pixel-snapping reintroduction point; keep small. */
	representativeness: number
	/** Free parameter 5: accent lightness/chroma anisotropy magnitude. Direction from perception-4. */
	accentAnisotropy: number
}>

export type Solution = Readonly<{
	field: FieldHypothesis
	background: DistinctTriple
	surface: DistinctTriple
	foreground: DistinctTriple
	accent: DistinctTriple
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	/** Set only when the constrained problem over artwork triples was infeasible (proposal §2.4). */
	escape?: Readonly<{ role: "background" | "foreground"; color: "#ffffff" | "#000000" }>
	/**
	 * Total energy and per-term breakdown — the survivor-table / audit surface.
	 * NOT naively summable: the map is hierarchical — `belonging.*` entries are components already
	 * included in their `unary.*` parents (verifier measured naive sum 1.4126 vs total 2.8028 on a
	 * real cover). Consumers reconstruct the total from top-level terms only; the verifier's check 5
	 * re-derives it to 3e-17 and is the reference for which keys are top-level.
	 */
	energy: Readonly<{ total: number; terms: Readonly<Record<string, number>> }>
	/** Barriers every tuple violated, when the escape fired. */
	infeasibilityCertificate?: readonly string[]
}>

export type Solve = (
	substrate: Substrate,
	lattice: Lattice,
	hypotheses: readonly FieldHypothesis[],
	rates: ExchangeRates,
) => Solution
