declare module "colornames-oklab" {
	export type ColorNameTier = "srgb" | "p3" | "rec2020"
	export type ColorNameOKLab = readonly [lightness: number, a: number, b: number]

	export type ColorNameReference = Readonly<{
		name: string
		tier: ColorNameTier
		hex: string
		oklab: ColorNameOKLab
	}>

	export type ClosestColorName = ColorNameReference & Readonly<{
		distance: number
	}>

	export type ClosestOptions = Readonly<{
		unique?: boolean
	}>

	const colors: readonly ColorNameReference[]
	export default colors

	export function closest(input: ColorNameOKLab, options?: ClosestOptions): ClosestColorName
	export function closest(input: readonly ColorNameOKLab[]): ClosestColorName[]
	export function closest(
		input: readonly ColorNameOKLab[],
		options: Readonly<{ unique?: false }>,
	): ClosestColorName[]
	export function closest(
		input: readonly ColorNameOKLab[],
		options: Readonly<{ unique: true }>,
	): Array<ClosestColorName | null>
	export function closest(
		input: readonly ColorNameOKLab[],
		options: ClosestOptions,
	): Array<ClosestColorName | null>
}
