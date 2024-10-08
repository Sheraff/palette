import { kmeans } from "./kmeans.ts"
import type { Strategy } from "./types.ts"

export function constant({
	k = 10
} = {}): Strategy {
	return async (name, space, data, size, workers) => {
		return (await kmeans(name, space, data, k, workers)).centroids
	}
}
