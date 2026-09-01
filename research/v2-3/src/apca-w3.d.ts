declare module "apca-w3" {
	export function APCAcontrast(textLuminance: number, backgroundLuminance: number, places?: -1): number
	export function sRGBtoY(color: readonly [red: number, green: number, blue: number, alpha?: number]): number
}
