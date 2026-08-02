/**
 * Ambient types for dependencies that ship none.
 *
 * `apca-w3` is plain JavaScript. Only the two functions the contract's cross-check test needs are
 * declared: the contract itself computes APCA in `color.ts` (the package exposes only the clamped
 * Lc, and invariant 4 needs the raw pre-clamp value), and imports the package purely so
 * `contract-color.test.ts` can prove the two agree.
 *
 * Kept separate from `research/v3/src/warehouse/vendor.d.ts`, which declares `colornames-oklab`;
 * neither file declares a module the other does.
 */
declare module "apca-w3" {
	export function APCAcontrast(textLuminance: number, backgroundLuminance: number, places?: -1): number
	export function sRGBtoY(color: readonly [red: number, green: number, blue: number, alpha?: number]): number
}
