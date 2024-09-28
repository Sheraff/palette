import { kmeans } from "./kmeans.ts"
import type { Strategy } from "./types.ts"

/**
 * Using "gap statistic", we tend to get ~7 colors, which might be too many (e.g. black album gets 6 colors)
 */
export function gapStatisticKmeans({ maxK = 10, minK = 1 } = {}): Strategy {
	function makeUniformData(size: number) {
		const max = 0xffffff
		const step = max / size
		const array = new Uint32Array(size * 2)
		for (let i = 0; i < size; i++) {
			const color = Math.round(i * step)
			array[i] = color
			array[i + 1] = 1
		}
		return array
	}
	return async (name, space, data, size, workers) => {
		const ks = Array.from({ length: maxK - minK + 1 }, (_, i) => i + minK)

		const reference = makeUniformData(size)
		const [
			all,
			references
		] = await Promise.all([
			Promise.all(ks.map(k => kmeans(name, space, data, k, workers))),
			Promise.all(ks.map(k => kmeans(name, space, reference, k, workers))),
		])

		const gaps = ks.map((k, i) => {
			const wk = all[i].wcss
			const wkb = references[i].wcss
			const logWk = Math.log(wk)
			const logWkb = Math.log(wkb)
			const gap = logWkb - logWk
			return gap
		})

		const optimalIndex = gaps.indexOf(Math.max(...gaps))
		const optimal = ks[optimalIndex]
		console.log(name, "Optimal K:", optimal)
		return all[optimalIndex].centroids
	}
}