/**
 * Ambient types for dependencies that ship none.
 * `colornames-oklab` is a plain ESM module with JSDoc only; this declares the one
 * export the warehouse CLI uses (CONVENTIONS.md: human-facing colour output is always
 * named via colornames-oklab).
 */
declare module 'colornames-oklab' {
	export interface NamedColor {
		name: string
		tier: 'srgb' | 'p3' | 'rec2020'
		hex: string
		oklab: [number, number, number]
		distance: number
	}
	export function closest(oklab: [number, number, number]): NamedColor
	export function closest(oklab: Array<[number, number, number]>, options?: { unique?: boolean }): NamedColor[]
	const colors: Array<Omit<NamedColor, 'distance'>>
	export default colors
}
