/** Same artwork extracted twice in one process: the extraction JSON must hash identically. */
import { createHash } from "node:crypto"
import sharp from "sharp"
import { extractPalette } from "../../../v2-3/index.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { resolveArtwork } from "./probe.ts"

sharp.concurrency(1)
const images = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
	"ab67616d0000b273000d5cdbc67ed815efc360ad",
	"ab67616d0000b2730009d178a401f9433fdddff2",
	"ab67616d00001e02001031d1e10290f8e446bd68",
]
for (const name of images) {
	const path = resolveArtwork(name)
	if (!path) { console.log(`${name}: UNRESOLVED`); continue }
	const hashes: string[] = []
	for (let run = 0; run < 2; run++) {
		const image = await loadNativeImage(path)
		hashes.push(createHash("sha256").update(JSON.stringify(extractPalette(image))).digest("hex"))
	}
	console.log(`${name}: ${hashes[0] === hashes[1] ? "DETERMINISTIC" : `MISMATCH ${hashes[0]} ${hashes[1]}`}`)
}
