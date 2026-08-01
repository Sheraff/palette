/**
 * One-artwork probe: extract the palette and report every APCA pair that matters for the
 * "foreground on surface must not be essentially zero" question.
 *
 * Reads artwork from `PALETTE_IMAGES_ROOT`'s parent so the sharded `<2-hex>/` caches resolve.
 * Usage: probe.ts <absolute-image-path> [more paths...]
 */
import sharp from "sharp"

import { apcaContrast, perceptualDifference } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

sharp.concurrency(1)

for (const path of process.argv.slice(2)) {
	const image = await loadNativeImage(path)
	const details = extractPaletteDetails(image)
	const winner = details.winner
	const roles = ["background", "surface", "foreground", "accent"] as const
	const hexes = Object.fromEntries(roles.map((role) => [role, winner[role].hex]))
	process.stdout.write(`${path}\n`)
	process.stdout.write(`  ${roles.map((role) => `${role}=${hexes[role]}`).join(" ")}`)
	process.stdout.write(` gradient=${winner.gradient} collapse=${JSON.stringify(winner.collapse)}`)
	process.stdout.write(` midpoint=${details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.hex : "none"}\n`)
	// The two paths that rewrite a winner after every validity gate has run announce themselves in
	// the id, so a published palette that no gate ever saw in its published arrangement is visible.
	process.stdout.write(`  winner id: ${winner.id}\n`)
	const pairs: Array<[string, string, string]> = [
		["foreground", "surface", "fg-on-surface"],
		["foreground", "background", "fg-on-background"],
		["accent", "surface", "accent-on-surface"],
		["accent", "background", "accent-on-background"],
	]
	for (const [a, b, name] of pairs) {
		const lc = apcaContrast(winner[a as typeof roles[number]].rgb, winner[b as typeof roles[number]].rgb)
		const de = perceptualDifference(winner[a as typeof roles[number]].rgb, winner[b as typeof roles[number]].rgb)
		process.stdout.write(`  ${name.padEnd(20)} APCA Lc=${lc.toFixed(4).padStart(10)}  |Lc|=${Math.abs(lc).toFixed(4).padStart(9)}  CIE76 dE=${de.toFixed(3)}\n`)
	}
	process.stdout.write("  contrast pairs recorded by the algorithm (against field samples):\n")
	for (const pair of winner.contrast.pairs) {
		process.stdout.write(`    ${pair.role.padEnd(11)} vs ${pair.fieldRole.padEnd(16)} pos=${pair.position} signedLc=${pair.signedLc.toFixed(4).padStart(10)}\n`)
	}
}
