import type { ColorSpace } from "../spaces/types.ts"

export interface Strategy {
	(name: string, colorSpace: ColorSpace, data: Uint32Array, size: number, workers: boolean | Pool): Promise<Map<number, number>>
}

interface RunOptions {
	filename?: string | null
	name?: string | null
}
export interface Pool {
	run(task: any, options: RunOptions): Promise<any>
}