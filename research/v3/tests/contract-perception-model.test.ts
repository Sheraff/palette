/**
 * Tests for the perception-model study.
 *
 * Three jobs:
 *   1. Pin the colour-space layer, so a conversion cannot silently stop being the metric it claims.
 *   2. Pin the estimators against synthetic data whose right answer is known.
 *   3. **The audit tripwire.** A constant added to `src/contract/constants.ts` without a row in
 *      `perception-model-audit.ts` fails a test here. That is the whole point of the census: the
 *      reviewer's ruling is about constraints discovered late, and an unaudited constant is exactly
 *      that failure in miniature.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { AUDIT_ROWS, auditCounts } from "../src/contract/perception-model-audit.ts"
import {
	assignFolds,
	crossValidate,
	fitLogisticRidge,
	nelderMead,
	sigmoid,
	type DesignRow,
} from "../src/contract/perception-model-numerics.ts"
import {
	COLOR_SPACES,
	decompose,
	ellipsoidDistance,
	euclidean,
	runSpaceSelfChecks,
} from "../src/contract/perception-model-spaces.ts"
import { RULE_SHAPES } from "../src/contract/perception-model-study.ts"

const CONSTANTS_PATH = fileURLToPath(new URL("../src/contract/constants.ts", import.meta.url))

test("every colour space is the metric it claims to be", () => {
	for (const check of runSpaceSelfChecks()) {
		assert.equal(check.passed, true, `${check.space}: ${check.detail}`)
	}
})

test("the lightness/chroma/hue decomposition is exact in every space", () => {
	for (const space of COLOR_SPACES) {
		for (let i = 0; i < 120; i++) {
			const first = space.toCartesian([(i * 37) % 256, (i * 91) % 256, (i * 17) % 256] as never)
			const second = space.toCartesian([(i * 53 + 7) % 256, (i * 29 + 3) % 256, (i * 71 + 11) % 256] as never)
			const parts = decompose(first, second)
			const direct = euclidean(first, second)
			assert.ok(
				Math.abs(parts.distance - direct) <= 1e-9 * Math.max(1, direct),
				`${space.id}: decomposition ${parts.distance} != euclidean ${direct}`,
			)
			assert.ok(
				Math.abs(parts.fractionLightness + parts.fractionChroma + parts.fractionHue - 1) < 1e-9,
				`${space.id}: direction fractions do not sum to 1`,
			)
		}
	}
})

test("the ellipsoid metric reduces to plain Euclidean at unit weights", () => {
	const space = COLOR_SPACES[0]
	for (let i = 0; i < 50; i++) {
		const first = space.toCartesian([(i * 13) % 256, (i * 47) % 256, (i * 5) % 256] as never)
		const second = space.toCartesian([(i * 61) % 256, (i * 23) % 256, (i * 97) % 256] as never)
		const parts = decompose(first, second)
		assert.ok(Math.abs(ellipsoidDistance(parts, 1, 1) - parts.distance) < 1e-12)
	}
})

test("the logistic fitter recovers known coefficients", () => {
	const rows: DesignRow[] = []
	let state = 99
	const next = (): number => {
		state = (state * 1664525 + 1013904223) % 4294967296
		return state / 4294967296
	}
	for (let i = 0; i < 3000; i++) {
		const x = (i % 40) / 10 - 2
		rows.push({ x: [1, x], y: next() < sigmoid(1.5 - 2 * x), cluster: `c${i % 40}` })
	}
	const fit = fitLogisticRidge(rows)
	assert.equal(fit.converged, true)
	assert.ok(Math.abs(fit.beta[0] - 1.5) < 0.2, `intercept ${fit.beta[0]}`)
	assert.ok(Math.abs(fit.beta[1] + 2) < 0.2, `slope ${fit.beta[1]}`)
})

test("the logistic fitter stays finite under complete separation", () => {
	const rows: DesignRow[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((d, i) => ({
		x: [1, Math.log(d)],
		y: d < 0.45,
		cluster: `s${i}`,
	}))
	const fit = fitLogisticRidge(rows)
	assert.ok(fit.beta.every(Number.isFinite), "separated data produced a non-finite coefficient")
})

test("Nelder-Mead solves Rosenbrock", () => {
	const result = nelderMead(
		(x) => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2,
		[-1.2, 1],
		{ maxIterations: 20000, tolerance: 1e-12 },
	)
	assert.equal(result.converged, true)
	assert.ok(Math.abs(result.x[0] - 1) < 1e-4 && Math.abs(result.x[1] - 1) < 1e-4)
})

test("folds never split a cluster, and every row is held out exactly once", () => {
	const rows: DesignRow[] = Array.from({ length: 60 }, (_, i) => ({
		x: [1, i / 60],
		y: i % 2 === 0,
		cluster: `c${i % 12}`,
	}))
	const assignment = assignFolds(
		rows.map((row) => row.cluster),
		4,
	)
	for (const row of rows) assert.ok(assignment.has(row.cluster))
	// A cluster maps to exactly one fold by construction; assert the map is a function.
	const seen = new Map<string, number>()
	for (const row of rows) {
		const fold = assignment.get(row.cluster)
		assert.notEqual(fold, undefined)
		if (seen.has(row.cluster)) assert.equal(seen.get(row.cluster), fold)
		else seen.set(row.cluster, fold as number)
	}
	const score = crossValidate(
		rows,
		4,
		(training) => ({ model: fitLogisticRidge([...training]), converged: true }),
		(model, row) => sigmoid(model.beta[0] * row.x[0] + model.beta[1] * row.x[1]),
	)
	assert.equal(score.rows, rows.length)
	assert.ok(score.predictions.every(Number.isFinite), "a row was never held out")
})

test("assignFolds refuses more folds than clusters", () => {
	assert.throws(() => assignFolds(["a", "b"], 5), /cannot fill/)
})

test("the audit classifications are a partition and the ids are unique", () => {
	const counts = auditCounts()
	assert.equal(
		counts.positionIndependent + counts.possiblyDependent + counts.unknownUntested,
		counts.total,
	)
	assert.equal(new Set(AUDIT_ROWS.map((row) => row.id)).size, AUDIT_ROWS.length)
	for (const row of AUDIT_ROWS) {
		assert.ok(row.reasoning.length > 80, `${row.id}: reasoning is too thin to be an argument`)
		assert.ok(row.whatWouldSettleIt.length > 0, `${row.id}: no route to settling it`)
	}
})

/**
 * THE TRIPWIRE.
 *
 * Every constant exported from `constants.ts` must be either audited or explicitly listed as out of
 * scope with a reason. Adding a constant without doing one of those two things fails this test.
 *
 * The out-of-scope list is deliberately explicit rather than pattern-matched: deciding that a
 * constant is not a perceptual threshold is a judgement, and judgements belong in a reviewable list,
 * not in a regular expression.
 */
const OUT_OF_SCOPE: Record<string, string> = {
	CONTRACT_VERSION: "a schema identifier, not a number",
	ROLE_NAMES: "a vocabulary",
	ESCAPE_COLORS: "two exact hex literals fixed by reviewer ruling; nothing to calibrate",
	ESCAPE_ROLE_PARTNERS: "a mapping fixed by the same ruling",
	COLOR_REGIONS: "the region vocabulary; its BOUNDARIES are audited separately",
	APCA_G4G: "a vendored third-party table, pinned against apca-w3 by contract-color.test.ts",
	CONTENT_HASH_PATTERN: "a regular expression",
	HEX_COLOR_PATTERN: "a regular expression",
	POSITION_MIN: "the gradient position domain, fixed by invariant 1",
	POSITION_MAX: "the gradient position domain, fixed by invariant 1",
}

test("every constant in constants.ts is either audited or explicitly out of scope", async () => {
	const source = await readFile(CONSTANTS_PATH, "utf8")
	const exported = [...source.matchAll(/^export const ([A-Z_0-9]+)/gm)].map((match) => match[1])
	assert.ok(exported.length > 0, "found no exported constants — the scan is broken, not the source")

	const auditedText = AUDIT_ROWS.map((row) => `${row.id} ${row.site} ${row.reasoning}`).join("\n")
	const unaccounted = exported.filter(
		(name) => !(name in OUT_OF_SCOPE) && !auditedText.includes(name),
	)
	assert.deepEqual(
		unaccounted,
		[],
		`these constants have no audit row and are not declared out of scope: ${unaccounted.join(", ")}. ` +
			"Add a row to perception-model-audit.ts, or add it to OUT_OF_SCOPE here with a reason.",
	)
})

test("exactly one rule shape is the incumbent for each scored criterion", () => {
	for (const criterion of ["identity", "functional-real", "functional-synthetic"] as const) {
		const incumbents = RULE_SHAPES.filter((shape) => shape.isIncumbentFor.includes(criterion))
		assert.equal(incumbents.length, 1, `${criterion} has ${incumbents.length} incumbent shapes`)
	}
})

test("the reference row is not a candidate", () => {
	const reference = RULE_SHAPES.find((shape) => shape.id === "frozen-contract")
	assert.notEqual(reference, undefined)
	assert.deepEqual(reference?.isIncumbentFor, [])
	assert.match(reference?.description ?? "", /NOT A CANDIDATE/)
})
