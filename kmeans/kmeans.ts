import { Worker } from "node:worker_threads"
import type { ColorSpace } from "../spaces/types.ts"
import { join } from "node:path"
import type { Pool } from "./types.ts"
import type { PooledWorkerArgs, StandaloneWorkerData } from "./kmeans.worker"

let localPool: Pool

export async function kmeans(
	name: string,
	space: ColorSpace,
	array: Uint32Array,
	k: number,
	workers: boolean | Pool
): Promise<{
	centroids: Map<number, number>,
	wcss: number
}> {
	if (!workers) {
		const { kmeans } = await import('./kmeans.worker.ts')
		return kmeans(name, space, array, k)
	}
	if (workers === true && !localPool) {
		try {
			const { default: Piscina } = await import("piscina")
			localPool = new Piscina({
				idleTimeout: 100,
			})
		} catch {
			localPool = makeStandaloneWorker()
		}
	}
	const pool = workers === true ? localPool : workers
	const workerArgs: PooledWorkerArgs = { name, space: space.name, array, k }
	return await pool.run(workerArgs, {
		filename: join(import.meta.dirname, 'kmeans.worker.ts'),
	})
}

function makeStandaloneWorker() {
	return {
		run({ name, space, array, k }) {
			const workerData: StandaloneWorkerData = {
				id: 'no-pooling-call',
				buffer: array.buffer,
				k,
				space,
				name,
			}
			const worker = new Worker(join(import.meta.dirname, 'kmeans.worker.ts'), { workerData })
			worker.unref()
			return new Promise((resolve, reject) => {
				worker.on('message', resolve)
				worker.on('error', reject)
				worker.on('exit', (code) => {
					if (code !== 0)
						reject(new Error(`Worker stopped with exit code ${code}`))
				})
			})
		}
	}
}