import { Worker } from "node:worker_threads"
import type { ColorSpace } from "../spaces/types.ts"
import { join } from "node:path"

export async function kmeans(name: string, space: ColorSpace, array: Uint32Array, k: number, useWorkers: boolean) {
	if (!useWorkers) {
		const { kmeans } = await import('./kmeans.worker.ts')
		return kmeans(name, space, array, k)
	}
	const worker = new Worker(join(import.meta.dirname, 'kmeans.worker.ts'), {
		workerData: { buffer: array.buffer, k, space: space.name, name },
	})
	worker.unref()
	return new Promise<{ centroids: Map<number, number>, wcss: number }>((resolve, reject) => {
		worker.on('message', resolve)
		worker.on('error', reject)
		worker.on('exit', (code) => {
			if (code !== 0)
				reject(new Error(`Worker stopped with exit code ${code}`))
		})
	})
}