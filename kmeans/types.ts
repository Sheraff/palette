import type { ColorSpace } from "../spaces/types.ts"

export interface Strategy {
	(name: string, colorSpace: ColorSpace, data: Uint32Array, size: number, useWorkers: boolean): Promise<Map<number, number>>
}