/**
 * The perception-model study — do the contract's perceptual thresholds have the right SHAPE?
 *
 * Commissioned by the reviewer's ruling of 2026-08-04:
 *
 *   > "it would be good to have all our constraints figured out... in previous attempts discovering
 *   > a constraint late has led to failure of the attempts — we should explore different cutoffs
 *   > based on hue / direction / whatever else — the cutoff could also be linear, not 1 number per
 *   > quadrant but a function of the position in color space — we might also explore other color
 *   > spaces."
 *
 * Two measured direction-dependences prompted it, and both are already on the record:
 *
 *   - `bracketing-round-3` returned **anisotropy-confounded**: at matched OKLab distances inside the
 *     same band, lightness-dominant pairs read "same colour" 15/21 and chroma-dominant pairs 2/21
 *     (exact p = 0.00022). Its own conclusion was that "no scalar combination of two regional bars
 *     can represent that".
 *   - `accent-real-1` was **refused as stratum-dependent**: the pooled functional threshold 0.18630
 *     was contradicted by hue-third 0 at 0.13417 and hue-third 2 at 0.26385.
 *
 * This script does not change the contract. It measures. Every proposal is in
 * `PERCEPTION_MODEL_STUDY.md` for the reviewer to accept, amend or refuse, and nothing here edits
 * `PHASE_0_DECISIONS.md` or `data/decisions/decisions.json`.
 *
 * Usage, from the repository root:
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/contract/perception-model-study.ts
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/contract/perception-model-study.ts --write
 *
 * Deterministic end to end: fixtures are read in file order, the warehouse is resolved by the
 * repository's own collector, every model start point is fixed, folds are dealt rather than drawn,
 * and both bootstraps are seeded. Two runs on an unchanged repository produce identical output.
 *
 * ## The honesty constraints this script is built to satisfy
 *
 * From `research/v3/CONVENTIONS.md` and `reviews/toolbox-review/gap-scan.md` §5:
 *
 *   - **No post-hoc model selection.** The full grid of spaces x shapes is declared in
 *     `perception-model-spaces.ts` and `RULE_SHAPES` below, before any answer is read, and EVERY
 *     cell of the grid is reported. Nothing is dropped for scoring badly.
 *   - **Criteria are never pooled.** Identity ("same colour?"), detection ("can you clearly see the
 *     shapes?") and function ("does this work as an accent at a glance?") are three different
 *     questions measured under three different instructions. `bracketing.ts:84-95` records that 72
 *     answers were already discarded once over exactly this confusion. They are carried as separate
 *     criteria end to end and no table ever adds them up.
 *   - **`n` is declared as units, not trials.** A silent repeat carries byte-identical pixels to the
 *     item it repeats, so it is not an independent trial. Repeats share a cluster with their source,
 *     every fold assignment respects clusters, and every interval is a cluster bootstrap.
 *   - **Held-out, not in-sample.** A richer model always fits the data it was fitted on better. Every
 *     number in the comparison table is out-of-fold.
 *   - **The family size is declared.** Comparing 8 spaces x 6 shapes and then quoting the best cell
 *     is the classic way to manufacture a finding; `sweepThenTest` is given the true count.
 *   - **Empty input throws** rather than returning a comfortable default.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { clusterBootstrapCI, makeRng, sweepThenTest, wilsonInterval } from "../stats/index.ts"
import { assessSupport } from "../stats/truncation.ts"
import { readAll, resolve } from "../warehouse/warehouse.ts"
import type { OracleLabelRecord, WarehouseRecord } from "../warehouse/records.ts"
import { colorFromHex, colorRegion, hexToRgb, type HexColor } from "./color.ts"
import { ACCENT_FUNCTIONAL_DISTANCE, SAME_COLOR_BAR_BY_REGION } from "./constants.ts"
import { COLOR_SPACES, decompose, ellipsoidDistance, runSpaceSelfChecks, type ColorSpaceDefinition, type Decomposition, type SpaceId } from "./perception-model-spaces.ts"
import { AUDIT_ROWS, auditCounts } from "./perception-model-audit.ts"
import { sizeRound } from "./perception-model-round-design.ts"
import {
	crossValidate,
	fitLogisticRidge,
	nelderMead,
	perRowLogLoss,
	RIDGE_PENALTY,
	sigmoid,
	type DesignRow,
} from "./perception-model-numerics.ts"

const CALIBRATION = new URL("../../data/calibration/", import.meta.url)
const WAREHOUSE_PATH = fileURLToPath(new URL("../../data/warehouse/warehouse.jsonl", import.meta.url))
const OUTPUT_PATH = fileURLToPath(new URL("../../data/contract/perception-model-study.json", import.meta.url))

/** Folds for the primary cross-validation. */
const FOLDS = 10
/** Resamples for every cluster bootstrap. Above `MIN_RESAMPLES` (1000) in `src/stats`. */
const RESAMPLES = 2000
/** Seed for every draw in this script. Integer, per `makeRng`. */
const SEED = 20260804

/**
 * Below this ratio of observations to free parameters, a fitted shape is reported but marked
 * under-identified. Declared here, before any data is read, so it cannot be tuned to a result.
 * Ten observations per parameter is the conventional floor for a binary-outcome fit and is
 * deliberately generous to the complex shapes rather than to the incumbent.
 */
const MIN_OBSERVATIONS_PER_PARAMETER = 10

/**
 * The OKLab-distance range each criterion's constant is actually USED over, declared here rather
 * than read off the sample. See the note at the `assessSupport` call for why this must not be the
 * observed range.
 *
 *   - identity: from below the tightest frozen bar (dark-neutral, 0.00932) to above the loosest
 *     (light-saturated, 0.02293), widened to 0.05 because this study measures a pure-lightness bar
 *     around 0.045 and a claim domain that stopped at 0.023 would exclude the study's own finding.
 *   - the accent criteria: the [0.06, 0.30] window `accent-real-round-1-preregistration.md` §6.2
 *     declared, reused unchanged so the support verdicts stay comparable with that round's.
 */
const CLAIM_DOMAINS: Record<CriterionId, { min: number; max: number }> = {
	identity: { min: 0.005, max: 0.05 },
	"functional-real": { min: 0.06, max: 0.3 },
	"functional-synthetic": { min: 0.06, max: 0.3 },
	detection: { min: 0.06, max: 0.3 },
}

// =================================================================================================
// The criteria. Three different questions; never pooled.
// =================================================================================================

export type CriterionId = "identity" | "functional-real" | "functional-synthetic" | "detection"

export type Criterion = Readonly<{
	id: CriterionId
	label: string
	question: string
	/** `"below"`: the answer is true when the two colours are CLOSE (identity). `"above"`: when far. */
	trueWhen: "below" | "above"
	/** What the contract constant fitted on this criterion is, today. */
	incumbentConstant: string
	notes: string
}>

export const CRITERIA: readonly Criterion[] = [
	{
		id: "identity",
		label: "Identity — do two colours register as the same colour?",
		question:
			'"Same color?" — Answer whether they register as the same color, not whether you can detect any difference at the seam.',
		trueWhen: "below",
		incumbentConstant: "SAME_COLOR_BAR_BY_REGION (four regional bars, cross-region resolved by Math.max)",
		notes:
			"bracketing-round-1-clarified + bracketing-round-2 + bracketing-round-3, all under the " +
			"byte-identical clarified criterion. The abandoned bracketing-round-1 detection pass is " +
			"excluded on batch id, as every other analysis in this repository excludes it.",
	},
	{
		id: "functional-real",
		label: "Function — does an accent do an accent's job, on a real cover?",
		question:
			'"Does this work as an accent at a glance?" — not "can you see the difference"; assume you can.',
		trueWhen: "above",
		incumbentConstant: "ACCENT_FUNCTIONAL_DISTANCE (one global constant, [UNCALIBRATED])",
		notes:
			"accent-real-1 ladder items only, matching that round's own pre-registered population. " +
			"Anchors are a different stimulus class and the Sunshine item is a known prior answer; " +
			"both are excluded, as the round excluded them.",
	},
	{
		id: "functional-synthetic",
		label: "Function — the same question on flat synthetic panels",
		question: "identical wording to functional-real",
		trueWhen: "above",
		incumbentConstant: "ACCENT_FUNCTIONAL_DISTANCE (same constant, different stimulus class)",
		notes:
			"accent-functional-1. The round's fit was REFUSED (it contradicted a reviewer retraction), " +
			"but its data is valid and its own decision record calls it 'the cleanest round this " +
			"repository has run'. Kept strictly separate from functional-real: the two stimulus classes " +
			"differ by +0.14076 in fitted threshold, which is the whole reason the real round exists.",
	},
	{
		id: "detection",
		label: "Detection — can you clearly see the accent shapes?",
		question: '"Can you clearly see the shapes?" — would these icons work as UI elements?',
		trueWhen: "above",
		incumbentConstant: "ACCENT_VISIBILITY_COLOR_DISTANCE / FOREGROUND_ACCENT_SEPARATION_DISTANCE (0.07444)",
		notes:
			"bracketing-round-1-clarified part 2. Ten fitted points, completely separated in the " +
			"original analysis. Carried here for completeness and for the sampling-gap map; it is far " +
			"too small for a model comparison and this script refuses to run one on it.",
	},
] as const

// =================================================================================================
// Observations
// =================================================================================================

export type Observation = Readonly<{
	criterion: CriterionId
	round: string
	itemId: string
	/** Resampling and fold unit. A silent repeat shares its source's cluster. */
	cluster: string
	firstHex: string
	secondHex: string
	answer: boolean
	role: string
	/** Design metadata carried through for the gap map. Absent fields are null, never invented. */
	stratum: string | null
	declaredDirection: string | null
	hueThird: number | null
	band: string | null
	governingRole: string | null
}>

type BracketingFixtureItem = {
	itemId: string
	part: string
	stratum?: string
	firstHex: string
	secondHex: string
	role: string
	repeatOf: string | null
	direction?: string
	hueThird?: number
}

async function readJson<T>(url: URL): Promise<T> {
	return JSON.parse(await readFile(url, "utf8")) as T
}

/**
 * Latest non-retracted oracle label per (batch, join key, question key).
 *
 * Uses the repository's own `resolve` so that amendments, retractions and supersessions follow the
 * same rule every other round uses — this is deliberately not a second implementation of that rule.
 */
function latestLabels(
	records: readonly WarehouseRecord[],
	batchId: string,
	keyOf: (label: OracleLabelRecord) => string,
): Map<string, OracleLabelRecord> {
	const latest = new Map<string, { label: OracleLabelRecord; index: number }>()
	resolve(records).forEach((entry, index) => {
		if (entry.retracted) return
		const record = entry.record
		if (record.type !== "oracle-label") return
		const label = record as OracleLabelRecord
		if (label.batch === null || label.batch.id !== batchId) return
		const key = keyOf(label)
		const current = latest.get(key)
		if (
			current === undefined ||
			current.label.ts < label.ts ||
			(current.label.ts === label.ts && current.index < index)
		) {
			latest.set(key, { label, index })
		}
	})
	return new Map([...latest].map(([key, value]) => [key, value.label]))
}

async function loadBracketingRound(
	records: readonly WarehouseRecord[],
	fixtureFile: string,
	batchId: string,
	part: string,
	criterion: CriterionId,
	roundLabel: string,
): Promise<Observation[]> {
	const fixture = await readJson<{ items: BracketingFixtureItem[] }>(new URL(fixtureFile, CALIBRATION))
	const labels = latestLabels(records, batchId, (label) => `${label.imageId} ${label.questionKey}`)
	const observations: Observation[] = []
	for (const item of fixture.items) {
		if (item.part !== part) continue
		// Attention checks are excluded from every fit. `control-identical` additionally carries a
		// zero distance, which has no logarithm; the rest are excluded for the same reason the
		// rounds excluded them, which is that they measure attention, not location.
		if (item.role.startsWith("control")) continue
		const label = labels.get(`${item.itemId} ${item.part}`)
		if (label === undefined) continue
		if (typeof label.answer !== "boolean") continue
		observations.push({
			criterion,
			round: roundLabel,
			itemId: item.itemId,
			cluster: `${roundLabel}:${item.repeatOf ?? item.itemId}`,
			firstHex: item.firstHex,
			secondHex: item.secondHex,
			answer: label.answer,
			role: item.role,
			stratum: item.stratum ?? null,
			declaredDirection: item.direction ?? null,
			hueThird: item.hueThird ?? null,
			band: null,
			governingRole: null,
		})
	}
	return observations
}

async function loadAccentReal(records: readonly WarehouseRecord[]): Promise<Observation[]> {
	const truth = await readJson<{
		items: {
			itemId: string
			questionKey: string
			role: string
			band: string | null
			hueThird: number | null
			governingRole: string
			accentHex: string
			repeatOf: string | null
			governing: { fieldHex: string; okLabDistance: number }
		}[]
	}>(new URL("accent-real-round-1-truth.json", CALIBRATION))
	const labels = latestLabels(records, "accent-real-1", (label) => label.questionKey)
	const observations: Observation[] = []
	for (const item of truth.items) {
		// The round's own pre-registered population: the 30 ladder items and nothing else. Anchors
		// are a different stimulus class, the Sunshine item is a known prior answer, and repeats
		// measure noise rather than location.
		if (item.role !== "ladder") continue
		const label = labels.get(item.questionKey)
		if (label === undefined) continue
		// `cant_tell` is an escape, not a judgement of distance. It was used zero times on the ladder
		// items; the guard is here so that a future round's escapes cannot silently become "no".
		if (label.answer !== "works" && label.answer !== "does_not_work") continue
		observations.push({
			criterion: "functional-real",
			round: "accent-real-1",
			itemId: item.itemId,
			cluster: `accent-real-1:${item.repeatOf ?? item.itemId}`,
			firstHex: item.governing.fieldHex,
			secondHex: item.accentHex,
			answer: label.answer === "works",
			role: item.role,
			stratum: `${item.governingRole}-${item.band ?? "?"}`,
			declaredDirection: null,
			hueThird: item.hueThird,
			band: item.band,
			governingRole: item.governingRole,
		})
	}
	return observations
}

export async function loadObservations(): Promise<Map<CriterionId, Observation[]>> {
	const records = readAll(WAREHOUSE_PATH)
	const byCriterion = new Map<CriterionId, Observation[]>()

	const identity = [
		...(await loadBracketingRound(
			records,
			"bracketing-round-1.json",
			"bracketing-round-1-clarified",
			"same-color",
			"identity",
			"bracketing-1-clarified",
		)),
		...(await loadBracketingRound(
			records,
			"bracketing-round-2.json",
			"bracketing-round-2",
			"same-color",
			"identity",
			"bracketing-2",
		)),
		...(await loadBracketingRound(
			records,
			"bracketing-round-3.json",
			"bracketing-round-3",
			"same-color",
			"identity",
			"bracketing-3",
		)),
	]
	byCriterion.set("identity", identity)

	byCriterion.set(
		"detection",
		await loadBracketingRound(
			records,
			"bracketing-round-1.json",
			"bracketing-round-1-clarified",
			"accent-visible",
			"detection",
			"bracketing-1-clarified",
		),
	)

	byCriterion.set(
		"functional-synthetic",
		await loadBracketingRound(
			records,
			"accent-functional-round-1.json",
			"accent-functional-1",
			"accent-visible",
			"functional-synthetic",
			"accent-functional-1",
		),
	)

	byCriterion.set("functional-real", await loadAccentReal(records))

	for (const [id, list] of byCriterion) {
		if (list.length === 0) throw new Error(`loadObservations: criterion ${id} produced no observations`)
	}
	return byCriterion
}

// =================================================================================================
// Geometry per (observation, space)
// =================================================================================================

export type Geometry = Readonly<{
	distance: number
	decomposition: Decomposition
	/** Contract regions of the two colours. Always the OKLab-defined partition — see the note below. */
	regionFirst: string
	regionSecond: string
	/** Position features, scaled by fixed per-space gamut constants so no answer informs the scaling. */
	positionLightness: number
	positionChroma: number
	positionHueCos: number
	positionHueSin: number
}>

/**
 * Per-space scaling constants for the position features, computed from a fixed 8-bit sRGB grid.
 *
 * This exists so that shape (c)'s coefficients are on a comparable footing across spaces whose
 * lightness axes differ by two orders of magnitude — and, more importantly, so that the scaling is
 * a property of the SPACE and never of the answers. Standardising against the observed sample would
 * leak the test fold into the training fold; standardising against the gamut cannot.
 */
function gamutScales(space: ColorSpaceDefinition): { lightness: number; chroma: number } {
	let maxLightness = 0
	let maxChroma = 0
	for (let r = 0; r < 256; r += 15) {
		for (let g = 0; g < 256; g += 15) {
			for (let b = 0; b < 256; b += 15) {
				const point = space.toCartesian([r, g, b] as never)
				maxLightness = Math.max(maxLightness, Math.abs(point[0]))
				maxChroma = Math.max(maxChroma, Math.hypot(point[1], point[2]))
			}
		}
	}
	if (maxLightness === 0 || maxChroma === 0) throw new Error("gamutScales: degenerate space")
	return { lightness: maxLightness, chroma: maxChroma }
}

const GAMUT_SCALES = new Map<SpaceId, { lightness: number; chroma: number }>(
	COLOR_SPACES.map((space) => [space.id, gamutScales(space)]),
)

export function geometryFor(space: ColorSpaceDefinition, observation: Observation): Geometry {
	const first = space.toCartesian(hexToRgb(observation.firstHex as HexColor))
	const second = space.toCartesian(hexToRgb(observation.secondHex as HexColor))
	const decomposition = decompose(first, second)
	const scales = GAMUT_SCALES.get(space.id)
	if (scales === undefined) throw new Error(`geometryFor: no gamut scale for ${space.id}`)
	return {
		distance: decomposition.distance,
		decomposition,
		// The REGION partition stays the contract's OKLab-defined one in every space, deliberately.
		// Shape (b) asks "does this space's distance still need the correction OKLab needs?", so the
		// correction being tested has to be the contract's actual correction, not a re-derived one.
		regionFirst: colorRegion(colorFromHex(observation.firstHex)),
		regionSecond: colorRegion(colorFromHex(observation.secondHex)),
		positionLightness: decomposition.midLightness / scales.lightness,
		positionChroma: decomposition.midChroma / scales.chroma,
		positionHueCos: Math.cos(decomposition.midHue),
		positionHueSin: Math.sin(decomposition.midHue),
	}
}

// =================================================================================================
// The rule shapes. Declared before any answer is read; every cell of the grid is reported.
// =================================================================================================

export type ShapeId =
	| "global-constant"
	| "per-region-constants"
	| "linear-in-position"
	| "direction-aware"
	| "direction-and-position"
	| "per-region-and-direction"

export type RuleShape = Readonly<{
	id: ShapeId
	label: string
	description: string
	/** Free parameters, including the logistic slope. Used for the under-identification flag. */
	parameters: number
	/** True for the shape the contract uses today, per criterion. */
	isIncumbentFor: readonly CriterionId[]
}>

export const RULE_SHAPES: readonly RuleShape[] = [
	{
		id: "global-constant",
		label: "(a) one global constant",
		description:
			"A single threshold everywhere. This is the shape rounds 1+2 measured and REFUTED for identity " +
			"(`oneThresholdSurvives: false`), and it is the shape the accent constants use today.",
		parameters: 2,
		isIncumbentFor: ["functional-real", "functional-synthetic", "detection"],
	},
	{
		id: "per-region-constants",
		label: "(b) per-region constants",
		description:
			"One threshold per contract colour region. For identity this is the incumbent exactly, " +
			"including the cross-region `Math.max` resolution, which is why it is fitted by Nelder-Mead " +
			"rather than as a design matrix: a maximum of two parameters is not linear in them.",
		parameters: 5,
		isIncumbentFor: ["identity"],
	},
	{
		id: "linear-in-position",
		label: "(c) linear function of position",
		description:
			"log threshold varies linearly with lightness, chroma and the two hue harmonics at the pair's " +
			"midpoint. This is the reviewer's 'the cutoff could also be linear, not 1 number per quadrant " +
			"but a function of the position in color space', taken literally.",
		parameters: 6,
		isIncumbentFor: [],
	},
	{
		id: "direction-aware",
		label: "(d) direction-aware (ellipsoidal)",
		description:
			"A global threshold under a reweighted metric, d² = ΔL² + wC·ΔC² + wH·ΔH², with the " +
			"lightness weight fixed at 1 for identifiability. The simplest honest local-ellipse " +
			"parameterisation: two free weights and one threshold. Note that this shape is EXACTLY " +
			"'a different colour space with a global constant' — the fitted weights say what rescaling " +
			"of the space's axes would make shape (a) work.",
		parameters: 4,
		isIncumbentFor: [],
	},
	{
		id: "direction-and-position",
		label: "(e) direction-aware + linear position",
		description: "(d) and (c) together. Reported for completeness; the most over-parameterised cell in the grid.",
		parameters: 8,
		isIncumbentFor: [],
	},
	{
		id: "per-region-and-direction",
		label: "(f) per-region constants + direction-aware metric",
		description:
			"The incumbent's regional bars, measured under the reweighted metric. Answers the specific " +
			"question of whether the four bars are still needed once direction is accounted for.",
		parameters: 7,
		isIncumbentFor: [],
	},
	{
		id: "frozen-contract",
		label: "(ref) the contract exactly as it stands",
		description:
			"NOT A CANDIDATE — a reference row. The contract's own frozen constants, held fixed at their " +
			"committed values (SAME_COLOR_BAR_BY_REGION for identity, ACCENT_FUNCTIONAL_DISTANCE for the " +
			"functional criteria), with only the logistic sharpness fitted so that a threshold can be " +
			"scored as a probability at all. Every other row refits its thresholds on the training fold; " +
			"this row refits nothing, so it answers a different and more direct question: how well does " +
			"what is committed today predict held-out human answers? " +
			"DISCLOSURE: this row was added after the first run of the grid, deliberately, once it was " +
			"clear that every candidate row was refitting the bars and none of them showed the status " +
			"quo. It is excluded from the multiplicity family for exactly that reason — it is not " +
			"competing for the title, and counting it as a candidate would be the post-hoc move this " +
			"study exists to avoid.",
		parameters: 1,
		isIncumbentFor: [],
	},
] as const

/**
 * The contract's committed constants, imported by value so that this row cannot drift from the
 * source. If `constants.ts` changes, this reference row changes with it.
 */
const FROZEN_IDENTITY_BARS: Record<string, number> = { ...SAME_COLOR_BAR_BY_REGION }
const FROZEN_FUNCTIONAL_DISTANCE = ACCENT_FUNCTIONAL_DISTANCE

const REGION_ORDER = ["dark-neutral", "dark-saturated", "light-neutral", "light-saturated"] as const

type Prepared = Readonly<{ observation: Observation; geometry: Geometry }>

/** A fitted model is just a function from a prepared observation to P(answer = true). */
type Predictor = (prepared: Prepared) => number

/**
 * Fit one (space, shape) cell to a set of observations.
 *
 * Every shape is expressed as a threshold surface `τ(x)` plus a logistic sharpness `β`, so that
 * `logit P = β · (log τ(x) − log d)` for a "true when below" criterion and the negation for "true
 * when above". Writing every shape in the same form is what makes the comparison a comparison: the
 * cells differ only in what τ is allowed to depend on.
 */
function fitShape(
	shape: RuleShape,
	criterion: Criterion,
	training: readonly Prepared[],
): { predict: Predictor; converged: boolean; parameters: Record<string, number> } {
	const sign = criterion.trueWhen === "below" ? 1 : -1

	// --- (ref): the contract's committed constants, nothing refitted but the sharpness. ---
	//
	// The frozen bars are OKLab quantities, so this row is only meaningful in OKLab. In any other
	// space the same numeric bar would be a different perceptual distance, which would make the row
	// a comparison of unit systems rather than of rules. It is therefore scored in the baseline space
	// and reported as blank elsewhere.
	if (shape.id === "frozen-contract") {
		const thresholdFor = (prepared: Prepared): number => {
			if (criterion.id === "identity") {
				const first = FROZEN_IDENTITY_BARS[prepared.geometry.regionFirst]
				const second = FROZEN_IDENTITY_BARS[prepared.geometry.regionSecond]
				const candidates = [first, second].filter((value) => typeof value === "number")
				if (candidates.length === 0) throw new Error("fitShape: observation in no known region")
				return Math.max(...candidates)
			}
			return FROZEN_FUNCTIONAL_DISTANCE
		}
		const objective = (params: readonly number[]): number => {
			const beta = Math.exp(params[0])
			let total = 0
			for (const prepared of training) {
				const z =
					sign * beta * (Math.log(thresholdFor(prepared)) - Math.log(Math.max(prepared.geometry.distance, 1e-12)))
				total -= prepared.observation.answer ? logSigmoidSafe(z) : logSigmoidSafe(-z)
			}
			return total + 0.5 * RIDGE_PENALTY * params[0] * params[0]
		}
		const result = nelderMead(objective, [Math.log(4)], { maxIterations: 2000, tolerance: 1e-10 })
		return {
			predict: (prepared) =>
				sigmoid(
					sign *
						Math.exp(result.x[0]) *
						(Math.log(thresholdFor(prepared)) - Math.log(Math.max(prepared.geometry.distance, 1e-12))),
				),
			converged: result.converged,
			parameters: { sharpness: Math.exp(result.x[0]) },
		}
	}

	// --- (a) and (c): linear in the parameters, so IRLS handles them directly. ---
	if (shape.id === "global-constant" || shape.id === "linear-in-position") {
		const columns = (prepared: Prepared): number[] => {
			const base = [1, Math.log(prepared.geometry.distance)]
			if (shape.id === "global-constant") return base
			return [
				...base,
				prepared.geometry.positionLightness,
				prepared.geometry.positionChroma,
				prepared.geometry.positionHueCos,
				prepared.geometry.positionHueSin,
			]
		}
		const rows: DesignRow[] = training.map((prepared) => ({
			x: columns(prepared),
			y: prepared.observation.answer,
			cluster: prepared.observation.cluster,
		}))
		const fit = fitLogisticRidge(rows)
		const parameters: Record<string, number> = {}
		fit.beta.forEach((value, index) => (parameters[`b${index}`] = value))
		return {
			predict: (prepared) => {
				const x = columns(prepared)
				let z = 0
				for (let i = 0; i < x.length; i++) z += fit.beta[i] * x[i]
				return sigmoid(z)
			},
			converged: fit.converged,
			parameters,
		}
	}

	// --- (b), (d), (e), (f): the threshold is not linear in its parameters. Nelder-Mead. ---
	//
	// Parameter vectors, all on a log scale so that no optimiser step can produce a negative
	// threshold or a negative axis weight:
	//   per-region-constants        [logBar x 4, logBeta]
	//   direction-aware             [logWc, logWh, logTau, logBeta]
	//   direction-and-position      [logWc, logWh, logTau, gL, gC, gCos, gSin, logBeta]
	//   per-region-and-direction    [logWc, logWh, logBar x 4, logBeta]
	const usesRegions = shape.id === "per-region-constants" || shape.id === "per-region-and-direction"
	const usesDirection = shape.id !== "per-region-constants"
	const usesPosition = shape.id === "direction-and-position"

	const logThresholdAndDistance = (
		params: readonly number[],
		prepared: Prepared,
	): { logTau: number; logD: number } => {
		let cursor = 0
		let distance = prepared.geometry.distance
		if (usesDirection) {
			const weightChroma = Math.exp(params[cursor++])
			const weightHue = Math.exp(params[cursor++])
			distance = ellipsoidDistance(prepared.geometry.decomposition, weightChroma, weightHue)
		}
		let logTau: number
		if (usesRegions) {
			const bars = REGION_ORDER.map((_, index) => params[cursor + index])
			cursor += REGION_ORDER.length
			const firstIndex = REGION_ORDER.indexOf(prepared.geometry.regionFirst as never)
			const secondIndex = REGION_ORDER.indexOf(prepared.geometry.regionSecond as never)
			// The incumbent's own resolution rule for a straddling pair, reproduced exactly.
			const candidates: number[] = []
			if (firstIndex >= 0) candidates.push(bars[firstIndex])
			if (secondIndex >= 0) candidates.push(bars[secondIndex])
			if (candidates.length === 0) throw new Error("fitShape: observation in no known region")
			logTau = Math.max(...candidates)
		} else {
			logTau = params[cursor++]
		}
		if (usesPosition) {
			logTau +=
				params[cursor] * prepared.geometry.positionLightness +
				params[cursor + 1] * prepared.geometry.positionChroma +
				params[cursor + 2] * prepared.geometry.positionHueCos +
				params[cursor + 3] * prepared.geometry.positionHueSin
			cursor += 4
		}
		return { logTau, logD: Math.log(Math.max(distance, 1e-12)) }
	}

	const betaIndexOf = (params: readonly number[]): number => params.length - 1

	const objective = (params: readonly number[]): number => {
		const beta = Math.exp(params[betaIndexOf(params)])
		let total = 0
		for (const prepared of training) {
			const { logTau, logD } = logThresholdAndDistance(params, prepared)
			const z = sign * beta * (logTau - logD)
			total -= prepared.observation.answer ? logSigmoidSafe(z) : logSigmoidSafe(-z)
		}
		// Same ridge as the linear shapes, on the same scale, so no shape is advantaged by the penalty.
		for (const value of params) total += 0.5 * RIDGE_PENALTY * value * value
		return total
	}

	// Fixed start: the pooled empirical median distance as the threshold, unit axis weights, and a
	// moderate sharpness. Nothing here is drawn or tuned.
	const distances = training.map((prepared) => prepared.geometry.distance).sort((a, b) => a - b)
	const median = Math.log(distances[Math.floor(distances.length / 2)] || 1e-3)
	const start: number[] = []
	if (usesDirection) start.push(0, 0)
	if (usesRegions) for (const _ of REGION_ORDER) start.push(median)
	else start.push(median)
	if (usesPosition) start.push(0, 0, 0, 0)
	start.push(Math.log(4))

	const result = nelderMead(objective, start, { maxIterations: 6000, tolerance: 1e-10 })
	const parameters: Record<string, number> = {}
	let index = 0
	if (usesDirection) {
		parameters.weightChroma = Math.exp(result.x[index++])
		parameters.weightHue = Math.exp(result.x[index++])
	}
	if (usesRegions) {
		for (const region of REGION_ORDER) parameters[`bar:${region}`] = Math.exp(result.x[index++])
	} else {
		parameters.threshold = Math.exp(result.x[index++])
	}
	if (usesPosition) {
		parameters.gradientLightness = result.x[index++]
		parameters.gradientChroma = result.x[index++]
		parameters.gradientHueCos = result.x[index++]
		parameters.gradientHueSin = result.x[index++]
	}
	parameters.sharpness = Math.exp(result.x[index])

	return {
		predict: (prepared) => {
			const beta = Math.exp(result.x[betaIndexOf(result.x)])
			const { logTau, logD } = logThresholdAndDistance(result.x, prepared)
			return sigmoid(sign * beta * (logTau - logD))
		},
		converged: result.converged,
		parameters,
	}
}

function logSigmoidSafe(z: number): number {
	if (z >= 0) return -Math.log1p(Math.exp(-z))
	return z - Math.log1p(Math.exp(z))
}

// =================================================================================================
// Scoring
// =================================================================================================

export type CellResult = Readonly<{
	space: SpaceId
	shape: ShapeId
	criterion: CriterionId
	observations: number
	clusters: number
	parameters: number
	observationsPerParameter: number
	underIdentified: boolean
	/** Primary score: grouped 10-fold held-out mean negative log-likelihood, in nats. Lower is better. */
	logLoss: number
	brier: number
	accuracy: number
	/** Leave-one-round-out held-out log-loss. Null when the criterion has only one round. */
	leaveOneRoundOutLogLoss: number | null
	allFoldsConverged: boolean
	/** Fitted on ALL observations, for reporting the parameters. Never scored. */
	fittedParameters: Record<string, number>
	isIncumbent: boolean
}>

function scoreCell(
	space: ColorSpaceDefinition,
	shape: RuleShape,
	criterion: Criterion,
	observations: readonly Observation[],
): CellResult {
	const prepared: Prepared[] = observations.map((observation) => ({
		observation,
		geometry: geometryFor(space, observation),
	}))
	const rows: DesignRow[] = prepared.map((item) => ({
		x: [0],
		y: item.observation.answer,
		cluster: item.observation.cluster,
	}))
	const byIndex = new Map(rows.map((row, index) => [row, prepared[index]]))

	const fitFrom = (training: readonly DesignRow[]) => {
		const trainingPrepared = training.map((row) => {
			const item = byIndex.get(row)
			if (item === undefined) throw new Error("scoreCell: lost the prepared observation")
			return item
		})
		const fitted = fitShape(shape, criterion, trainingPrepared)
		return { model: fitted, converged: fitted.converged }
	}
	const predictRow = (model: { predict: Predictor }, row: DesignRow) => {
		const item = byIndex.get(row)
		if (item === undefined) throw new Error("scoreCell: lost the prepared observation")
		return model.predict(item)
	}

	const clusters = new Set(observations.map((observation) => observation.cluster)).size
	const folds = Math.min(FOLDS, clusters)
	const cv = crossValidate(rows, folds, fitFrom, predictRow)

	// Leave-one-round-out: the strongest generalisation test available, because the rounds differ in
	// design rather than only in sampling. A model that only wins within a round has not earned much.
	const rounds = [...new Set(observations.map((observation) => observation.round))]
	let leaveOneRoundOut: number | null = null
	if (rounds.length > 1) {
		let total = 0
		let counted = 0
		for (const heldOut of rounds) {
			const training = rows.filter((_, index) => observations[index].round !== heldOut)
			const testing = rows.filter((_, index) => observations[index].round === heldOut)
			if (training.length === 0 || testing.length === 0) continue
			const fitted = fitFrom(training)
			for (const row of testing) {
				const p = Math.min(Math.max(predictRow(fitted.model, row), 1e-6), 1 - 1e-6)
				total += -(row.y ? Math.log(p) : Math.log(1 - p))
				counted++
			}
		}
		leaveOneRoundOut = counted > 0 ? total / counted : null
	}

	const full = fitShape(shape, criterion, prepared)
	const observationsPerParameter = observations.length / shape.parameters

	return {
		space: space.id,
		shape: shape.id,
		criterion: criterion.id,
		observations: observations.length,
		clusters,
		parameters: shape.parameters,
		observationsPerParameter,
		underIdentified: observationsPerParameter < MIN_OBSERVATIONS_PER_PARAMETER,
		logLoss: cv.logLoss,
		brier: cv.brier,
		accuracy: cv.accuracy,
		leaveOneRoundOutLogLoss: leaveOneRoundOut,
		allFoldsConverged: cv.allFoldsConverged,
		fittedParameters: full.parameters,
		isIncumbent: space.isBaseline && shape.isIncumbentFor.includes(criterion.id),
	}
}

/** Held-out per-row losses for one cell, for the paired cluster bootstrap against the incumbent. */
function heldOutLosses(
	space: ColorSpaceDefinition,
	shape: RuleShape,
	criterion: Criterion,
	observations: readonly Observation[],
): number[] {
	const prepared: Prepared[] = observations.map((observation) => ({
		observation,
		geometry: geometryFor(space, observation),
	}))
	const rows: DesignRow[] = prepared.map((item) => ({
		x: [0],
		y: item.observation.answer,
		cluster: item.observation.cluster,
	}))
	const byIndex = new Map(rows.map((row, index) => [row, prepared[index]]))
	const clusters = new Set(observations.map((observation) => observation.cluster)).size
	const cv = crossValidate(
		rows,
		Math.min(FOLDS, clusters),
		(training) => {
			const fitted = fitShape(
				shape,
				criterion,
				training.map((row) => {
					const item = byIndex.get(row)
					if (item === undefined) throw new Error("heldOutLosses: lost the prepared observation")
					return item
				}),
			)
			return { model: fitted, converged: fitted.converged }
		},
		(model, row) => {
			const item = byIndex.get(row)
			if (item === undefined) throw new Error("heldOutLosses: lost the prepared observation")
			return model.predict(item)
		},
	)
	return perRowLogLoss(rows, cv.predictions)
}

export type Comparison = Readonly<{
	space: SpaceId
	shape: ShapeId
	criterion: CriterionId
	/** Incumbent log-loss minus this cell's. Positive means this cell predicts held-out answers better. */
	improvement: number
	low: number
	high: number
	/** Two-sided cluster-bootstrap p-value against "no difference". */
	pValue: number
	excludesZero: boolean
}>

/**
 * Paired cluster bootstrap of the held-out log-loss difference against the incumbent cell.
 *
 * Resampling clusters rather than rows is the whole point: a silent repeat and its source are the
 * same stimulus, and treating them as two draws would narrow every interval in this table.
 */
function compareToIncumbent(
	cellLosses: readonly number[],
	incumbentLosses: readonly number[],
	observations: readonly Observation[],
	space: SpaceId,
	shape: ShapeId,
	criterion: CriterionId,
): Comparison {
	const byCluster = new Map<string, number[]>()
	observations.forEach((observation, index) => {
		const differences = byCluster.get(observation.cluster) ?? []
		differences.push(incumbentLosses[index] - cellLosses[index])
		byCluster.set(observation.cluster, differences)
	})
	const clusters = [...byCluster.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, value]) => value)

	const interval = clusterBootstrapCI({
		clusters,
		statistic: (sample) => (sample.length === 0 ? null : sample.reduce((a, b) => a + b, 0) / sample.length),
		resamples: RESAMPLES,
		seed: SEED,
		clusterBy: "stimulus (a silent repeat shares its source's cluster)",
	})
	if (!interval.ok) throw new Error(`compareToIncumbent: bootstrap refused — ${interval.reason}`)

	// The p-value is computed from a second, explicitly-seeded cluster bootstrap rather than read off
	// the interval, because `clusterBootstrapCI` deliberately returns no resample distribution. Both
	// use the same RNG (`makeRng`) and the same seed, so the two are consistent by construction.
	const rng = makeRng(SEED)
	let atOrBelowZero = 0
	let atOrAboveZero = 0
	for (let draw = 0; draw < RESAMPLES; draw++) {
		let sum = 0
		let count = 0
		for (let pick = 0; pick < clusters.length; pick++) {
			const chosen = clusters[Math.floor(rng() * clusters.length)]
			for (const value of chosen) {
				sum += value
				count++
			}
		}
		const mean = count === 0 ? 0 : sum / count
		if (mean <= 0) atOrBelowZero++
		if (mean >= 0) atOrAboveZero++
	}
	const pValue = Math.min(1, 2 * (Math.min(atOrBelowZero, atOrAboveZero) / RESAMPLES))

	return {
		space,
		shape,
		criterion,
		improvement: interval.pointEstimate,
		low: interval.low,
		high: interval.high,
		pValue,
		excludesZero: interval.low > 0 || interval.high < 0,
	}
}

// =================================================================================================
// PART 2 — the sampling-gap map
// =================================================================================================

export type GapCell = Readonly<{
	criterion: CriterionId
	region: string
	direction: string
	count: number
	trueCount: number
	/** Wilson 95% interval on the "true" rate, or null when the cell is empty. */
	rateLow: number | null
	rateHigh: number | null
}>

const DIRECTION_BUCKETS = ["lightness", "chroma", "hue"] as const

export function gapMap(criterion: CriterionId, observations: readonly Observation[]): GapCell[] {
	const baseline = COLOR_SPACES.find((space) => space.isBaseline)
	if (baseline === undefined) throw new Error("gapMap: no baseline space")
	const cells = new Map<string, { count: number; trueCount: number }>()
	for (const region of REGION_ORDER) {
		for (const direction of DIRECTION_BUCKETS) cells.set(`${region}|${direction}`, { count: 0, trueCount: 0 })
	}
	for (const observation of observations) {
		const geometry = geometryFor(baseline, observation)
		// A pair is filed under the region of its FIRST colour for the map. Straddling pairs are
		// counted once, under the region the incumbent's `Math.max` would not necessarily pick — the
		// map is a coverage census, not a re-derivation of the rule.
		const key = `${geometry.regionFirst}|${geometry.decomposition.dominant}`
		const cell = cells.get(key)
		if (cell === undefined) continue
		cell.count++
		if (observation.answer) cell.trueCount++
	}
	return [...cells.entries()].map(([key, value]) => {
		const [region, direction] = key.split("|")
		const interval = value.count > 0 ? wilsonInterval(value.trueCount, value.count) : null
		return {
			criterion,
			region,
			direction,
			count: value.count,
			trueCount: value.trueCount,
			rateLow: interval !== null && interval.ok ? interval.low : null,
			rateHigh: interval !== null && interval.ok ? interval.high : null,
		}
	})
}

// =================================================================================================
// Main
// =================================================================================================

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { write: { type: "boolean", default: false } } })

	const selfChecks = runSpaceSelfChecks()
	const failed = selfChecks.filter((check) => !check.passed)
	if (failed.length > 0) {
		throw new Error(
			`perception-model-study: ${failed.length} colour-space self-check(s) failed — ` +
				failed.map((check) => `${check.space}: ${check.detail}`).join("; "),
		)
	}

	const observationsByCriterion = await loadObservations()

	const cells: CellResult[] = []
	const comparisons: Comparison[] = []
	const gapCells: GapCell[] = []
	const runnerUps: {
		criterion: CriterionId
		leader: string
		challenger: string
		leaderAdvantage: number
		low: number
		high: number
		separable: boolean
	}[] = []

	for (const criterion of CRITERIA) {
		const observations = observationsByCriterion.get(criterion.id)
		if (observations === undefined || observations.length === 0) continue
		gapCells.push(...gapMap(criterion.id, observations))

		// The detection criterion is carried for the gap map and refused for model comparison. Ten
		// observations cannot choose between 48 model cells, and pretending otherwise is the exact
		// failure this study was commissioned to prevent.
		if (criterion.id === "detection") continue

		const incumbentShape = RULE_SHAPES.find((shape) => shape.isIncumbentFor.includes(criterion.id))
		if (incumbentShape === undefined) throw new Error(`main: no incumbent shape for ${criterion.id}`)
		const baseline = COLOR_SPACES.find((space) => space.isBaseline)
		if (baseline === undefined) throw new Error("main: no baseline space")

		const incumbentLosses = heldOutLosses(baseline, incumbentShape, criterion, observations)

		const lossesByCell = new Map<string, number[]>()
		for (const space of COLOR_SPACES) {
			for (const shape of RULE_SHAPES) {
				// The frozen-contract reference row is expressed in the contract's own OKLab units and
				// is meaningless in any other space; see the note in `fitShape`.
				if (shape.id === "frozen-contract" && !space.isBaseline) continue
				const cell = scoreCell(space, shape, criterion, observations)
				cells.push(cell)
				const losses = heldOutLosses(space, shape, criterion, observations)
				lossesByCell.set(`${space.id}:${shape.id}`, losses)
				comparisons.push(
					compareToIncumbent(losses, incumbentLosses, observations, space.id, shape.id, criterion.id),
				)
			}
		}

		// Is the leader separable from the field, or is the top of the table one flat plateau?
		//
		// Comparing only against the incumbent would let any cell in a wide flat region be crowned.
		// The honest question is whether the best cell beats the OTHER GOOD cells, so every candidate
		// is compared against the leader by the same paired cluster bootstrap. If none of these
		// intervals excludes zero, the correct report is "the top of the table is within noise",
		// and this study says so rather than picking the minimum.
		const candidates = cells.filter(
			(cell) => cell.criterion === criterion.id && cell.shape !== "frozen-contract",
		)
		const leader = [...candidates].sort((a, b) => a.logLoss - b.logLoss)[0]
		const leaderLosses = lossesByCell.get(`${leader.space}:${leader.shape}`)
		if (leaderLosses !== undefined) {
			for (const candidate of candidates) {
				if (candidate.space === leader.space && candidate.shape === leader.shape) continue
				const losses = lossesByCell.get(`${candidate.space}:${candidate.shape}`)
				if (losses === undefined) continue
				runnerUps.push({
					criterion: criterion.id,
					leader: `${leader.space} x ${leader.shape}`,
					challenger: `${candidate.space} x ${candidate.shape}`,
					...(() => {
						const comparison = compareToIncumbent(
							leaderLosses,
							losses,
							observations,
							candidate.space,
							candidate.shape,
							criterion.id,
						)
						return {
							leaderAdvantage: comparison.improvement,
							low: comparison.low,
							high: comparison.high,
							separable: comparison.excludesZero,
						}
					})(),
				})
			}
		}
	}

	// Multiplicity. The family is every cell compared against its criterion's incumbent, across both
	// scored criteria — declared at its true size, which is the point of the module.
	// PART 2 inputs, read off this study's own fits rather than assumed. The identity numbers come
	// from the direction-aware cell in the baseline space, because that cell's threshold IS the
	// pure-lightness bar and its sharpness is the slope a direction ladder would see. The functional
	// numbers come from the incumbent global-constant cell, which is the shape that round would use.
	const identityDirectionCell = cells.find(
		(cell) => cell.criterion === "identity" && cell.space === "oklab" && cell.shape === "direction-aware",
	)
	const functionalCell = cells.find(
		(cell) => cell.criterion === "functional-real" && cell.space === "oklab" && cell.shape === "global-constant",
	)
	if (identityDirectionCell === undefined || functionalCell === undefined) {
		throw new Error("main: the cells PART 2's sizing reads from were not scored")
	}
	const identitySharpness = {
		threshold: identityDirectionCell.fittedParameters.threshold,
		sharpness: identityDirectionCell.fittedParameters.sharpness,
	}
	// The global-constant cell is a plain logistic, so its threshold is exp(-intercept/slope) and its
	// sharpness is the magnitude of the slope on log distance.
	const functionalThreshold = Math.exp(-functionalCell.fittedParameters.b0 / functionalCell.fittedParameters.b1)
	const functionalSharpness = Math.abs(functionalCell.fittedParameters.b1)

	// The reference row is not a candidate and is excluded from the family, as its own description says.
	const familyComparisons = comparisons.filter((comparison) => comparison.shape !== "frozen-contract")
	const sweep = sweepThenTest(
		familyComparisons.map((comparison) => ({
			id: `${comparison.criterion}:${comparison.space}:${comparison.shape}`,
			pValue: comparison.pValue,
			label: `${comparison.space} x ${comparison.shape} (${comparison.criterion})`,
		})),
		{
			comparisonsRun: familyComparisons.length,
			correction: "holm",
			alpha: 0.05,
			familyDefinition:
				"every (colour space x rule shape) cell compared by held-out log-loss against its " +
				"criterion's incumbent cell, over both scored criteria (identity and functional-real, " +
				"plus functional-synthetic), fitted and scored identically",
		},
	)
	if (!sweep.ok) throw new Error(`main: multiplicity sweep refused — ${sweep.reason}: ${sweep.detail}`)

	// Support declarations for the incumbent constants' own quantities.
	const supports: Record<string, unknown> = {}
	for (const criterion of CRITERIA) {
		const observations = observationsByCriterion.get(criterion.id)
		if (observations === undefined || observations.length === 0) continue
		const baseline = COLOR_SPACES.find((space) => space.isBaseline)
		if (baseline === undefined) throw new Error("main: no baseline space")
		const distances = observations.map((observation) => geometryFor(baseline, observation).distance)
		// The claim domain is the range over which the CONSTANT is used, not the range that happened
		// to be sampled. Setting it to the observed min and max would make `domainCoverage` 1.00 by
		// construction and the assessment worthless — it would be asking whether the sample covers
		// itself. For identity the domain spans every frozen regional bar (0.00932 to 0.02293) plus
		// the pure-lightness end of the anisotropy this study measures; for the accent criteria it is
		// the window their own rounds pre-registered.
		const claimDomain = CLAIM_DOMAINS[criterion.id]
		supports[criterion.id] = assessSupport({
			variableUnderTest: `OKLab distance between the two colours judged under the ${criterion.id} criterion`,
			claimDomain,
			observedValues: distances,
			selectionRule:
				"the union of the rounds' own pre-registered ladder designs; every stimulus was placed " +
				"by a generator that never saw an answer",
			selectionRelationToVariable: { kind: "independent-of-the-variable" },
		})
	}

	const output = {
		schema: "perception-model-study/v1",
		writtenFor:
			"reviewer ruling 2026-08-04 — figure out the constraints before the rewrite, not after",
		generatedBy: "research/v3/src/contract/perception-model-study.ts",
		regenerateWith:
			"NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/contract/perception-model-study.ts --write",
		seed: SEED,
		resamples: RESAMPLES,
		folds: FOLDS,
		minObservationsPerParameter: MIN_OBSERVATIONS_PER_PARAMETER,
		criteria: CRITERIA,
		spaces: COLOR_SPACES.map((space) => ({
			id: space.id,
			label: space.label,
			conversionSource: space.conversionSource,
			isBaseline: space.isBaseline,
		})),
		spaceSelfChecks: selfChecks,
		shapes: RULE_SHAPES,
		counts: Object.fromEntries(
			[...observationsByCriterion].map(([id, list]) => [
				id,
				{
					observations: list.length,
					clusters: new Set(list.map((observation) => observation.cluster)).size,
					trueAnswers: list.filter((observation) => observation.answer).length,
					rounds: [...new Set(list.map((observation) => observation.round))],
				},
			]),
		),
		cells,
		comparisons,
		multiplicity: sweep,
		// PART 2's sizing, computed from this study's own fitted thresholds and sharpnesses rather
		// than from a rule of thumb. See `perception-model-round-design.ts` for the lapse-rate
		// derivation from the measured 83.3% repeat consistency.
		roundSizing: [
			sizeRound(
				"identity",
				"the per-direction same-colour bar (lightness vs chroma vs hue, within one region)",
				identitySharpness.threshold,
				identitySharpness.sharpness,
			),
			sizeRound(
				"functional-real",
				"the per-hue-third accent functional distance",
				functionalThreshold,
				functionalSharpness,
			),
		],
		runnerUps,
		support: supports,
		gapMap: gapCells,
		audit: { counts: auditCounts(), rows: AUDIT_ROWS },
	}

	printReport(output)

	if (values.write) {
		await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, "\t")}\n`, "utf8")
		process.stdout.write(`\nwrote ${OUTPUT_PATH}\n`)
	} else {
		process.stdout.write("\n(dry run — pass --write to update the data file)\n")
	}
}

function printReport(output: {
	runnerUps: { criterion: string; leader: string; challenger: string; leaderAdvantage: number; low: number; high: number; separable: boolean }[]
	counts: Record<string, { observations: number; clusters: number; trueAnswers: number; rounds: string[] }>
	cells: CellResult[]
	comparisons: Comparison[]
	gapMap: GapCell[]
	audit: { counts: { positionIndependent: number; possiblyDependent: number; unknownUntested: number; total: number } }
}): void {
	const write = (line: string): void => void process.stdout.write(`${line}\n`)

	write("\n=== counts, by criterion (never pooled) ===")
	for (const [id, value] of Object.entries(output.counts)) {
		write(
			`${id.padEnd(22)} n=${String(value.observations).padStart(3)} clusters=${String(value.clusters).padStart(3)} ` +
				`true=${String(value.trueAnswers).padStart(3)}  rounds: ${value.rounds.join(", ")}`,
		)
	}

	for (const criterion of ["identity", "functional-real", "functional-synthetic"] as const) {
		const cells = output.cells.filter((cell) => cell.criterion === criterion)
		if (cells.length === 0) continue
		write(`\n=== ${criterion}: held-out log-loss (lower is better), 10-fold grouped CV ===`)
		const shapes = [...new Set(cells.map((cell) => cell.shape))]
		write(`${"space".padEnd(15)}${shapes.map((shape) => shape.slice(0, 11).padStart(13)).join("")}`)
		for (const space of [...new Set(cells.map((cell) => cell.space))]) {
			const row = shapes.map((shape) => {
				const cell = cells.find((candidate) => candidate.space === space && candidate.shape === shape)
				if (cell === undefined) return "".padStart(13)
				const mark = cell.isIncumbent ? "*" : cell.underIdentified ? "~" : " "
				return `${cell.logLoss.toFixed(4)}${mark}`.padStart(13)
			})
			write(`${space.padEnd(15)}${row.join("")}`)
		}
		write("  * = the contract's incumbent cell   ~ = under-identified (fewer than 10 observations per parameter)")

		const best = [...cells].sort((a, b) => a.logLoss - b.logLoss)[0]
		const incumbent = cells.find((cell) => cell.isIncumbent)
		write(
			`  best: ${best.space} x ${best.shape} at ${best.logLoss.toFixed(4)}` +
				(incumbent === undefined
					? ""
					: `; incumbent ${incumbent.space} x ${incumbent.shape} at ${incumbent.logLoss.toFixed(4)}` +
						` (margin ${(incumbent.logLoss - best.logLoss).toFixed(4)} nats/answer)`),
		)
		const bestComparison = output.comparisons.find(
			(comparison) =>
				comparison.criterion === criterion &&
				comparison.space === best.space &&
				comparison.shape === best.shape,
		)
		if (bestComparison !== undefined) {
			write(
				`  best vs incumbent: ${bestComparison.improvement >= 0 ? "+" : ""}${bestComparison.improvement.toFixed(4)} ` +
					`nats/answer, 95% cluster-bootstrap CI [${bestComparison.low.toFixed(4)}, ${bestComparison.high.toFixed(4)}], ` +
					`excludes zero: ${bestComparison.excludesZero ? "YES" : "no"}`,
			)
		}

		// Leave-one-round-out: the rounds differ in DESIGN, so this is the real generalisation test.
		const loro = [...cells]
			.filter((cell) => cell.leaveOneRoundOutLogLoss !== null)
			.sort((a, b) => (a.leaveOneRoundOutLogLoss ?? 0) - (b.leaveOneRoundOutLogLoss ?? 0))
		if (loro.length > 0) {
			write(
				`  leave-one-round-out best: ${loro[0].space} x ${loro[0].shape} at ${(loro[0].leaveOneRoundOutLogLoss ?? 0).toFixed(4)}` +
					`; 10-fold leader ${best.space} x ${best.shape} ranks ` +
					`${loro.findIndex((cell) => cell.space === best.space && cell.shape === best.shape) + 1} of ${loro.length} there`,
			)
		}

		// Is the leader actually separable from the rest of the table?
		const field = output.runnerUps.filter((row) => row.criterion === criterion)
		if (field.length > 0) {
			const separable = field.filter((row) => row.separable).length
			write(
				`  leader is separable from ${separable} of ${field.length} other candidate cells ` +
					`(95% paired cluster-bootstrap CI excluding zero)`,
			)
		}

		// What rescaling would make a single global constant work? This is the reviewer's question
		// answered numerically rather than in prose.
		const directionCells = cells.filter((cell) => cell.shape === "direction-aware")
		for (const cell of directionCells.slice(0, 3)) {
			const wc = cell.fittedParameters.weightChroma
			const wh = cell.fittedParameters.weightHue
			if (typeof wc === "number" && typeof wh === "number") {
				write(
					`  fitted axis weights in ${cell.space}: chroma ${wc.toFixed(2)}x, hue ${wh.toFixed(2)}x ` +
						`relative to lightness = 1 (so a unit step in chroma costs sqrt(${wc.toFixed(2)}) = ` +
						`${Math.sqrt(wc).toFixed(2)}x a unit step in lightness)`,
				)
			}
		}
	}

	write("\n=== sampling-gap map (baseline OKLab regions x dominant direction) ===")
	for (const criterion of ["identity", "functional-real", "functional-synthetic", "detection"] as const) {
		const cells = output.gapMap.filter((cell) => cell.criterion === criterion)
		if (cells.length === 0) continue
		write(`-- ${criterion}`)
		for (const region of REGION_ORDER) {
			const row = DIRECTION_BUCKETS.map((direction) => {
				const cell = cells.find(
					(candidate) => candidate.region === region && candidate.direction === direction,
				)
				const count = cell?.count ?? 0
				return `${direction}=${String(count).padStart(3)}${count === 0 ? "!" : " "}`
			})
			write(`   ${region.padEnd(17)}${row.join("  ")}`)
		}
	}
	write("   ! = never sampled")

	write("\n=== PART 3 audit ===")
	write(
		`   provably position/direction-independent: ${output.audit.counts.positionIndependent}\n` +
			`   possibly dependent:                     ${output.audit.counts.possiblyDependent}\n` +
			`   unknown / untested:                     ${output.audit.counts.unknownUntested}\n` +
			`   total constants audited:                ${output.audit.counts.total}`,
	)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main()
}
