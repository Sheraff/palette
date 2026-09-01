/**
 * Seeded, deterministic k-means over L2-normalized embedding vectors.
 *
 * Written here rather than reused from the embedding gallery because the gallery
 * clustered FILES (16,145 of them) and the coverage set clusters ARTWORKS. Same
 * algorithm, same k, different population — so the cluster ids are not comparable
 * across the two, and this file does not pretend they are.
 *
 * Both the points and the centroids are unit-length (centroids are re-normalized
 * every round), so squared Euclidean distance is `2 - 2·dot`: nearest centroid is
 * the largest dot product, and the two orderings are identical. Everything below
 * works in dot products because that is one multiply-add per dimension instead of
 * a subtract-multiply-add, and this loop runs ~10^8 times per iteration.
 *
 * Determinism rules, all load-bearing:
 *   - k-means++ seeding driven by one `mulberry32` stream, drawn in point order.
 *   - float64 accumulation for centroid sums (the vectors are float32).
 *   - assignment ties go to the lowest cluster index.
 *   - an emptied cluster is re-seeded from the point currently farthest from its
 *     own centroid, ties by lowest point index.
 */

/** [REVIEWED] Iteration ceiling. The gallery's k=36 run converged in 93 iterations
 *  over 16,145 points; 300 leaves ample headroom and makes a non-converging run a
 *  reported fact rather than a hang. */
const MAX_ITERATIONS = 300

export type KMeansResult = {
	k: number
	iterations: number
	converged: boolean
	/** Cluster index per point, in the input point order. */
	assignment: Int32Array
	/** Centroids, row-major, k × dim, each row unit-length. */
	centroids: Float64Array
	dim: number
	sizes: number[]
}

/** Cosine between a point and a centroid. Both are unit-length, so this is the dot. */
export function cosineToCentroid(points: Float32Array, pointIndex: number, centroids: Float64Array, clusterIndex: number, dim: number): number {
	let sum = 0
	const pointOffset = pointIndex * dim
	const centroidOffset = clusterIndex * dim
	for (let i = 0; i < dim; i++) sum += points[pointOffset + i]! * centroids[centroidOffset + i]!
	return sum
}

export function kmeans(points: Float32Array, count: number, dim: number, k: number, rng: () => number): KMeansResult {
	if (count < k) throw new Error(`cannot fit k=${k} clusters over ${count} points`)
	const centroids = new Float64Array(k * dim)

	// ---- k-means++ seeding -------------------------------------------------
	const firstIndex = Math.floor(rng() * count)
	for (let i = 0; i < dim; i++) centroids[i] = points[firstIndex * dim + i]!

	// Squared distance to the nearest chosen centroid, as `2 - 2·dot`, clamped at
	// zero (the clamp only ever fires on floating-point noise at an exact match).
	const closestSquared = new Float64Array(count)
	for (let p = 0; p < count; p++) closestSquared[p] = Math.max(0, 2 - 2 * cosineToCentroid(points, p, centroids, 0, dim))

	for (let c = 1; c < k; c++) {
		let total = 0
		for (let p = 0; p < count; p++) total += closestSquared[p]!
		const target = rng() * total
		let running = 0
		let picked = count - 1
		for (let p = 0; p < count; p++) {
			running += closestSquared[p]!
			if (running >= target) {
				picked = p
				break
			}
		}
		for (let i = 0; i < dim; i++) centroids[c * dim + i] = points[picked * dim + i]!
		for (let p = 0; p < count; p++) {
			const d = Math.max(0, 2 - 2 * cosineToCentroid(points, p, centroids, c, dim))
			if (d < closestSquared[p]!) closestSquared[p] = d
		}
	}

	// ---- Lloyd iterations --------------------------------------------------
	const assignment = new Int32Array(count).fill(-1)
	const sums = new Float64Array(k * dim)
	const counts = new Int32Array(k)
	const similarity = new Float64Array(k)
	let iterations = 0
	let converged = false

	for (; iterations < MAX_ITERATIONS; iterations++) {
		let changed = 0
		for (let p = 0; p < count; p++) {
			const pointOffset = p * dim
			for (let c = 0; c < k; c++) {
				const centroidOffset = c * dim
				let sum = 0
				for (let i = 0; i < dim; i++) sum += points[pointOffset + i]! * centroids[centroidOffset + i]!
				similarity[c] = sum
			}
			let best = 0
			let bestSimilarity = similarity[0]!
			for (let c = 1; c < k; c++) {
				if (similarity[c]! > bestSimilarity) {
					bestSimilarity = similarity[c]!
					best = c
				}
			}
			if (assignment[p] !== best) {
				assignment[p] = best
				changed++
			}
		}
		if (changed === 0) {
			converged = true
			break
		}

		sums.fill(0)
		counts.fill(0)
		for (let p = 0; p < count; p++) {
			const c = assignment[p]!
			counts[c]!++
			const pointOffset = p * dim
			const sumOffset = c * dim
			for (let i = 0; i < dim; i++) sums[sumOffset + i]! += points[pointOffset + i]!
		}

		for (let c = 0; c < k; c++) {
			if (counts[c] === 0) {
				// Re-seed from the point farthest from its own centroid.
				let worst = 0
				let worstDistance = -1
				for (let p = 0; p < count; p++) {
					const d = 2 - 2 * cosineToCentroid(points, p, centroids, assignment[p]!, dim)
					if (d > worstDistance) {
						worstDistance = d
						worst = p
					}
				}
				for (let i = 0; i < dim; i++) centroids[c * dim + i] = points[worst * dim + i]!
				assignment[worst] = c
				continue
			}
			let norm = 0
			for (let i = 0; i < dim; i++) {
				const value = sums[c * dim + i]! / counts[c]!
				centroids[c * dim + i] = value
				norm += value * value
			}
			norm = Math.sqrt(norm)
			if (norm > 0) for (let i = 0; i < dim; i++) centroids[c * dim + i]! /= norm
		}
	}

	const sizes = new Array<number>(k).fill(0)
	for (let p = 0; p < count; p++) sizes[assignment[p]!]!++

	return { k, iterations, converged, assignment, centroids, dim, sizes }
}

/** Nearest centroid for an arbitrary vector. Ties go to the lowest cluster index. */
export function nearestCentroid(vector: Float32Array, offset: number, centroids: Float64Array, k: number, dim: number): { cluster: number; cosine: number } {
	let best = 0
	let bestCosine = Number.NEGATIVE_INFINITY
	for (let c = 0; c < k; c++) {
		const centroidOffset = c * dim
		let sum = 0
		for (let i = 0; i < dim; i++) sum += vector[offset + i]! * centroids[centroidOffset + i]!
		if (sum > bestCosine) {
			bestCosine = sum
			best = c
		}
	}
	return { cluster: best, cosine: bestCosine }
}
