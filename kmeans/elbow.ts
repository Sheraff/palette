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

		const startSlope = start.length < 2 ? 0 : startPoints.reduce((acc, val, i, arr) => i === 0
			? 0
			: acc + (val.wcss - arr[i - 1].wcss) / (start[i] - start[i - 1]),
			0
		) / (start.length - 1)
		const endSlope = end.length < 2 ? 0 : endPoints.reduce((acc, val, i, arr) => i === 0
			? 0
			: acc + (val.wcss - arr[i - 1].wcss) / (end[i] - end[i - 1]),
			0
		) / (end.length - 1)

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