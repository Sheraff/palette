import { labSpace } from "./lab.ts"
import { oklabSpace } from "./oklab.ts"
import { rgbSpace } from "./rgb.ts"
import type { ColorSpace } from "./types"

export const spacesByKey: Record<string, ColorSpace> = {
	rgb: rgbSpace,
	oklab: oklabSpace,
	lab: labSpace,
}