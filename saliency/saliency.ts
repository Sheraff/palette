import type { ColorSpace } from "../spaces/types.ts"
import { join } from "node:path"
import type { Pool } from "../kmeans/types.ts"
import type { PooledWorkerArgs, StandaloneWorkerData } from "./saliency.worker.ts"

export async function saliency(
	name: string,
	space: ColorSpace,
	data: Uint8Array | Uint8ClampedArray,
	result: Uint8Array | Uint8ClampedArray,
	width: number,
	height: number,
	channels: number,
	workers: boolean | Pool
): Promise<void> {
	if (!workers) {
		const { saliency } = await import('./saliency.worker.ts')
		return saliency(
			space,
			data,
			width,
			height,
			channels,
			result
		)
	}
	const pool = workers === true
		? makeStandaloneWorker()
		: workers
	const workerArgs: PooledWorkerArgs = {
		name,
		space: space.name,
		data,
		result,
		width,
		height,
		channels,
	}
	return await pool.run(workerArgs, {
		filename: join(import.meta.dirname, 'saliency.worker.ts'),
	})
}

const makeStandaloneWorker = () => ({
	async run({ name, space, data, result, width, height, channels }) {
		const workerData: StandaloneWorkerData = {
			id: 'no-pooling-call',
			buffer: result.buffer,
			space,
			name,
			data: data.buffer,
			width,
			height,
			channels,
		}
		const { Worker } = await import("node:worker_threads")
		const worker = new Worker(join(import.meta.dirname, 'saliency.worker.ts'), { workerData })
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
})


