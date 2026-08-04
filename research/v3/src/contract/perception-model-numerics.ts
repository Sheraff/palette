/**
 * Numerics for the perception-model study — logistic fitting, derivative-free optimisation,
 * and cluster-aware cross-validation.
 *
 * Split out of `perception-model-study.ts` so that the estimators can be unit-tested on synthetic
 * data where the right answer is known, independently of any human answer. `src/stats` deliberately
 * ships no fitter, no cross-validation and no model-comparison routine (its README: "a statistic
 * that should not be computed is a type, not a value" — it offers inference, not estimation), so
 * these are written here rather than imported. Everything inference-shaped — intervals,
 * multiplicity, support declarations — still goes through `src/stats`, and this module deliberately
 * exposes no p-value and no interval of its own.
 *
 * Conventions this module follows, from `research/v3/CONVENTIONS.md` and
 * `reviews/toolbox-review/gap-scan.md` §5:
 *
 *   - Empty or degenerate input throws. There is no comfortable default.
 *   - Every optimisation is deterministic: fixed starts, fixed iteration counts, no clock, no
 *     `Math.random`. Two runs on unchanged input produce byte-identical output.
 *   - Ridge penalty matches the repository's existing fitter (`RIDGE_PENALTY = 1e-3` in
 *     `src/review-server/analyze-bracketing.ts`) so that a one-parameter model fitted here is
 *     comparable with the thresholds the calibration rounds already published.
 */

/** Matches `RIDGE_PENALTY` in `src/review-server/analyze-bracketing.ts`. */
export const RIDGE_PENALTY = 1e-3

/** Newton/IRLS iteration cap. Reached only on data the fit cannot separate; convergence is reported. */
export const MAX_IRLS_ITERATIONS = 200

/** Convergence test on the maximum absolute coefficient step. */
export const IRLS_TOLERANCE = 1e-10

export type DesignRow = Readonly<{
	/** Predictor values, INCLUDING the leading 1 for the intercept if the model wants one. */
	x: readonly number[]
	/** The binary outcome being modelled. */
	y: boolean
	/** Resampling / fold-assignment unit. Rows sharing a cluster never split across a fold. */
	cluster: string
}>

export type LogisticCoefficients = Readonly<{
	beta: readonly number[]
	converged: boolean
	iterations: number
	/** Penalised log-likelihood at the optimum. Not a model-selection score on its own. */
	penalisedLogLikelihood: number
}>

export function sigmoid(z: number): number {
	// Branch on the sign so that neither exp() overflows; both branches are exact in the limit.
	if (z >= 0) {
		const e = Math.exp(-z)
		return 1 / (1 + e)
	}
	const e = Math.exp(z)
	return e / (1 + e)
}

/**
 * Ridge-penalised logistic regression by iteratively reweighted least squares.
 *
 * The penalty is applied to every coefficient INCLUDING the intercept, matching the existing
 * bracketing fitter, which does the same. That is a mild, declared bias toward zero; it is what
 * makes a separated sample return a finite answer instead of diverging, and separation is the
 * normal case in this corpus (`accent-real-1` hue-third 0 was completely separated).
 */
export function fitLogisticRidge(
	rows: readonly DesignRow[],
	ridge: number = RIDGE_PENALTY,
): LogisticCoefficients {
	if (rows.length === 0) throw new Error("fitLogisticRidge: no rows")
	const p = rows[0].x.length
	if (p === 0) throw new Error("fitLogisticRidge: design has no columns")
	for (const row of rows) {
		if (row.x.length !== p) throw new Error("fitLogisticRidge: ragged design matrix")
		for (const value of row.x) {
			if (!Number.isFinite(value)) throw new Error("fitLogisticRidge: non-finite predictor")
		}
	}

	let beta = new Array<number>(p).fill(0)
	let converged = false
	let iterations = 0

	for (let iter = 0; iter < MAX_IRLS_ITERATIONS; iter++) {
		iterations = iter + 1
		// Gradient and Hessian of the penalised negative log-likelihood.
		const gradient = new Array<number>(p).fill(0)
		const hessian = Array.from({ length: p }, () => new Array<number>(p).fill(0))

		for (const row of rows) {
			let z = 0
			for (let j = 0; j < p; j++) z += beta[j] * row.x[j]
			const mu = sigmoid(z)
			const residual = (row.y ? 1 : 0) - mu
			// Floor the IRLS weight: at mu ~ 0 or 1 the Hessian goes singular and the step blows up.
			const w = Math.max(mu * (1 - mu), 1e-10)
			for (let j = 0; j < p; j++) {
				gradient[j] += residual * row.x[j]
				for (let k = 0; k < p; k++) hessian[j][k] += w * row.x[j] * row.x[k]
			}
		}
		for (let j = 0; j < p; j++) {
			gradient[j] -= ridge * beta[j]
			hessian[j][j] += ridge
		}

		const step = solveSymmetric(hessian, gradient)
		if (step === null) break

		let maxStep = 0
		for (let j = 0; j < p; j++) {
			beta[j] += step[j]
			maxStep = Math.max(maxStep, Math.abs(step[j]))
		}
		if (!beta.every(Number.isFinite)) throw new Error("fitLogisticRidge: diverged to non-finite")
		if (maxStep < IRLS_TOLERANCE) {
			converged = true
			break
		}
	}

	return {
		beta,
		converged,
		iterations,
		penalisedLogLikelihood: penalisedLogLikelihood(rows, beta, ridge),
	}
}

function penalisedLogLikelihood(
	rows: readonly DesignRow[],
	beta: readonly number[],
	ridge: number,
): number {
	let total = 0
	for (const row of rows) {
		let z = 0
		for (let j = 0; j < beta.length; j++) z += beta[j] * row.x[j]
		total += row.y ? logSigmoid(z) : logSigmoid(-z)
	}
	let penalty = 0
	for (const b of beta) penalty += b * b
	return total - 0.5 * ridge * penalty
}

/** log(1/(1+exp(-z))), computed without overflow at either tail. */
export function logSigmoid(z: number): number {
	if (z >= 0) return -Math.log1p(Math.exp(-z))
	return z - Math.log1p(Math.exp(z))
}

/** Gaussian elimination with partial pivoting. Returns null on a singular system. */
function solveSymmetric(matrix: number[][], rhs: readonly number[]): number[] | null {
	const n = rhs.length
	const a = matrix.map((row, i) => [...row, rhs[i]])
	for (let col = 0; col < n; col++) {
		let pivot = col
		for (let row = col + 1; row < n; row++) {
			if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
		}
		if (Math.abs(a[pivot][col]) < 1e-14) return null
		if (pivot !== col) {
			const swap = a[pivot]
			a[pivot] = a[col]
			a[col] = swap
		}
		for (let row = col + 1; row < n; row++) {
			const factor = a[row][col] / a[col][col]
			if (factor === 0) continue
			for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k]
		}
	}
	const solution = new Array<number>(n).fill(0)
	for (let row = n - 1; row >= 0; row--) {
		let sum = a[row][n]
		for (let k = row + 1; k < n; k++) sum -= a[row][k] * solution[k]
		solution[row] = sum / a[row][row]
	}
	return solution.every(Number.isFinite) ? solution : null
}

/**
 * Nelder–Mead simplex minimisation, for the model shapes whose threshold is not linear in its
 * parameters — the incumbent `Math.max(barA, barB)` straddle rule above all, which cannot be
 * written as a design matrix.
 *
 * Deterministic: the initial simplex is a fixed offset from the start point, and the standard
 * reflection/expansion/contraction/shrink coefficients are used with no randomised restart.
 */
export type NelderMeadResult = Readonly<{
	x: readonly number[]
	value: number
	iterations: number
	converged: boolean
}>

export function nelderMead(
	objective: (x: readonly number[]) => number,
	start: readonly number[],
	options: Readonly<{ maxIterations?: number; tolerance?: number; initialStep?: number }> = {},
): NelderMeadResult {
	if (start.length === 0) throw new Error("nelderMead: no parameters")
	const maxIterations = options.maxIterations ?? 4000
	const tolerance = options.tolerance ?? 1e-10
	const initialStep = options.initialStep ?? 0.1
	const n = start.length

	const safe = (x: readonly number[]): number => {
		const value = objective(x)
		return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
	}

	let simplex: { x: number[]; f: number }[] = [{ x: [...start], f: safe(start) }]
	for (let i = 0; i < n; i++) {
		const point = [...start]
		point[i] += point[i] === 0 ? initialStep : initialStep * Math.abs(point[i])
		simplex.push({ x: point, f: safe(point) })
	}

	let iterations = 0
	let converged = false
	for (; iterations < maxIterations; iterations++) {
		simplex.sort((a, b) => a.f - b.f)
		const best = simplex[0]
		const worst = simplex[n]
		const secondWorst = simplex[n - 1]

		const spread = Math.abs(worst.f - best.f)
		let widest = 0
		for (let i = 1; i <= n; i++) {
			for (let j = 0; j < n; j++) widest = Math.max(widest, Math.abs(simplex[i].x[j] - best.x[j]))
		}
		if (spread < tolerance && widest < tolerance) {
			converged = true
			break
		}

		const centroid = new Array<number>(n).fill(0)
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n
		}

		const reflected = centroid.map((c, j) => c + (c - worst.x[j]))
		const fReflected = safe(reflected)
		if (fReflected < best.f) {
			const expanded = centroid.map((c, j) => c + 2 * (c - worst.x[j]))
			const fExpanded = safe(expanded)
			simplex[n] = fExpanded < fReflected ? { x: expanded, f: fExpanded } : { x: reflected, f: fReflected }
			continue
		}
		if (fReflected < secondWorst.f) {
			simplex[n] = { x: reflected, f: fReflected }
			continue
		}
		const contracted = centroid.map((c, j) => c + 0.5 * (worst.x[j] - c))
		const fContracted = safe(contracted)
		if (fContracted < worst.f) {
			simplex[n] = { x: contracted, f: fContracted }
			continue
		}
		simplex = simplex.map((point, i) =>
			i === 0 ? point : { x: point.x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j])), f: 0 },
		)
		for (let i = 1; i <= n; i++) simplex[i].f = safe(simplex[i].x)
	}

	simplex.sort((a, b) => a.f - b.f)
	return { x: simplex[0].x, value: simplex[0].f, iterations, converged }
}

/**
 * Deterministic cluster-aware fold assignment.
 *
 * Clusters are sorted by id and dealt round-robin into `folds` folds. Rows sharing a cluster always
 * land in the same fold, which is what makes the held-out score honest for a corpus where a silent
 * repeat carries byte-identical pixels to an item already in the training set. Dealing rather than
 * hashing keeps fold sizes balanced without a random number generator.
 */
export function assignFolds(clusters: readonly string[], folds: number): Map<string, number> {
	if (folds < 2) throw new Error("assignFolds: need at least 2 folds")
	const distinct = [...new Set(clusters)].sort()
	if (distinct.length < folds) {
		throw new Error(`assignFolds: ${distinct.length} clusters cannot fill ${folds} folds`)
	}
	const assignment = new Map<string, number>()
	distinct.forEach((cluster, index) => assignment.set(cluster, index % folds))
	return assignment
}

export type CrossValidationScore = Readonly<{
	/** Mean held-out negative log-likelihood per row, in nats. Lower is better. */
	logLoss: number
	/** Mean held-out Brier score. Lower is better. */
	brier: number
	/** Held-out classification accuracy at p = 0.5. Reported, never used to pick a winner. */
	accuracy: number
	rows: number
	folds: number
	/** Per-row held-out predicted probability, in input order. Feeds the paired cluster bootstrap. */
	predictions: readonly number[]
	/** True when every fold's fit reported convergence. */
	allFoldsConverged: boolean
}>

/**
 * Grouped k-fold cross-validation of an arbitrary fitter.
 *
 * `fit` receives the training rows and must return a predictor. Both the fitter and the predictor
 * are supplied by the caller, so this routine is agnostic to whether the model is a design-matrix
 * logistic or a Nelder–Mead threshold surface.
 */
export function crossValidate<Model>(
	rows: readonly DesignRow[],
	folds: number,
	fit: (training: readonly DesignRow[]) => { model: Model; converged: boolean },
	predict: (model: Model, row: DesignRow) => number,
): CrossValidationScore {
	if (rows.length === 0) throw new Error("crossValidate: no rows")
	const assignment = assignFolds(
		rows.map((row) => row.cluster),
		folds,
	)
	const predictions = new Array<number>(rows.length).fill(Number.NaN)
	let allFoldsConverged = true

	for (let fold = 0; fold < folds; fold++) {
		const training: DesignRow[] = []
		const testing: number[] = []
		rows.forEach((row, index) => {
			if (assignment.get(row.cluster) === fold) testing.push(index)
			else training.push(row)
		})
		if (testing.length === 0) continue
		if (training.length === 0) throw new Error("crossValidate: a fold consumed every row")
		const fitted = fit(training)
		if (!fitted.converged) allFoldsConverged = false
		for (const index of testing) {
			// Clamp away from 0 and 1: one confidently wrong held-out row must not send the mean
			// log-loss to infinity and silently disqualify an otherwise reasonable model.
			predictions[index] = Math.min(Math.max(predict(fitted.model, rows[index]), 1e-6), 1 - 1e-6)
		}
	}

	let logLoss = 0
	let brier = 0
	let correct = 0
	rows.forEach((row, index) => {
		const p = predictions[index]
		if (!Number.isFinite(p)) throw new Error("crossValidate: a row was never held out")
		const y = row.y ? 1 : 0
		logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
		brier += (p - y) * (p - y)
		if ((p >= 0.5) === row.y) correct++
	})

	return {
		logLoss: logLoss / rows.length,
		brier: brier / rows.length,
		accuracy: correct / rows.length,
		rows: rows.length,
		folds,
		predictions,
		allFoldsConverged,
	}
}

/** Per-row held-out log-loss, for the paired cluster bootstrap of a difference between two models. */
export function perRowLogLoss(rows: readonly DesignRow[], predictions: readonly number[]): number[] {
	if (rows.length !== predictions.length) throw new Error("perRowLogLoss: length mismatch")
	return rows.map((row, index) => {
		const p = predictions[index]
		const y = row.y ? 1 : 0
		return -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
	})
}
