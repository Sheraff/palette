import { kmeans } from "./kmeans.ts"
import type { Strategy } from "./types.ts"

/**
 * We don't know how many clusters we need in advance,
 * i.e. how many colors we should divide the pixels into to get the most accurate representation.
 * 
 * We can use the elbow method to find the optimal number of clusters:
 * 1. Compute the Within-Cluster-Sum-of-Squares (WCSS) for different values of K (number of clusters).
 * 2. We take "early" K values (at which the WCSS is still decreasing rapidly) and "late" K values (at which the WCSS is decreasing slowly).
 * 3. We compute the point at which the slopes of the early and late K values intersect.
 * 
 * The "slope intersection" is not trivial to compute and is easily influenced by the `start` and `end` values.
 * It should be improved by using a more sophisticated method, such as the "gap statistic".
 */
export function elbowKmeans({
	start = [1, 2, 3, 4],
	end = [50, 100]
} = {}): Strategy {
	return async (name, space, data, size, useWorkers) => {
		const n = data.length / 2
		if (n === 1) return (await kmeans(name, space, data, 1, useWorkers)).centroids

		start = start.filter(k => k < n)
		end = end.filter(k => k < n)

		const [startPoints, endPoints] = await Promise.all([
			Promise.all(start.map(k => kmeans(name, space, data, k, useWorkers))),
			Promise.all(end.map(k => kmeans(name, space, data, k, useWorkers))),
		])

		// for 1 cluster per color, we can guarantee that the WCSS is 0, which can be used to compute the slope intersection
		if (n > end.at(-1)! * 2) {
			end.push(n)
			endPoints.push({ centroids: new Map(), wcss: 0 })
		}

		const startSlope = computeSlope(start, startPoints)
		const endSlope = computeSlope(end, endPoints)

		const startPoint = startPoints[0].wcss
		const endPoint = endPoints[0].wcss

		console.log(name, "Start Slope:", startSlope, startPoints.map(p => p.wcss))
		console.log(name, "End Slope:", endSlope, endPoints.map(p => p.wcss))

		// compute at which K the start slope and end slope intersect
		// wcss = m * k + b
		// start: wcss = startSlope * k + startPoint - startSlope * start[0]
		// end: wcss = endSlope * k + endPoint - endSlope * end[0]
		// startSlope * k + startPoint - startSlope * start[0] = endSlope * k + endPoint - endSlope * end[0]
		// k = (endPoint - endSlope * end[0] - startPoint + startSlope * start[0]) / (startSlope - endSlope)

		const _optimal = (endPoint - endSlope * end[0] - startPoint + startSlope * start[0]) / (startSlope - endSlope)
		console.log(name, "Optimal K:", _optimal)
		const optimal = Math.round(_optimal)

		const inStart = start.indexOf(optimal)
		if (inStart !== -1) {
			return startPoints[inStart].centroids
		}
		const inEnd = end.indexOf(optimal)
		if (inEnd !== -1) {
			return endPoints[inEnd].centroids
		}

		return (await kmeans(name, space, data, optimal, useWorkers)).centroids
	}
}

/** 
 * Compute the slope of a line given a set of points.
 * Derived from the formula for the slope of the best-fit line in linear regression
 */
function computeSlope(points: number[], results: { wcss: number }[]): number {
	if (points.length < 2) return 0
	const n = points.length

	// Detect and handle outliers
	const cleanedPoints = removeOutliers(points)
	const cleanedResults = removeOutliers(results.map(r => r.wcss))

	const sumX = cleanedPoints.reduce((a, b) => a + b, 0)
	const sumY = cleanedResults.reduce((a, b) => a + b, 0)
	const sumXY = cleanedPoints.reduce((sum, x, i) => sum + x * cleanedResults[i], 0)
	const sumX2 = cleanedPoints.reduce((sum, x) => sum + x * x, 0)

	const denominator = n * sumX2 - sumX * sumX
	if (denominator === 0) return 0

	return (n * sumXY - sumX * sumY) / denominator
}


/** 
 * Remove outliers from an array of numbers.
 */
function removeOutliers(data: number[]): number[] {
	const sortedData = data.slice().sort((a, b) => a - b)
	const q1 = sortedData[Math.floor((sortedData.length / 4))]
	const q3 = sortedData[Math.floor((sortedData.length * (3 / 4)))]
	const iqr = q3 - q1

	const lowerBound = q1 - 1.5 * iqr
	const upperBound = q3 + 1.5 * iqr

	return data.filter(x => x >= lowerBound && x <= upperBound)
}