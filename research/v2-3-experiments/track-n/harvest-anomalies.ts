/**
 * Fresh-rotation harvest: run a sample and record anything that looks like a failure or an
 * extreme, independently of the vividness question. The `0a`–`0f` roots have never been
 * sampled, so this is the first look at 40 % of the corpus.
 *
 * Flags, all measured from the published output only:
 *   crash              the extractor threw
 *   double-collapse    surface AND accent collapsed — a two-colour palette
 *   generated-color    a role that is not source-supported
 *   all-neutral        every role below 0.03 OKLab chroma (a grey palette)
 *   near-duplicate     two distinct roles within 0.02 OKLab of each other
 *   flat-gradient      gradient claimed with endpoints closer than 0.05 OKLab
 *   extreme-field      background and surface both at the very top or bottom of lightness
 *
 * usage: harvest-anomalies.ts <out.jsonl> --list <file>
 */
import { appendFile, readFile } from "node:fs/promises"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)
const distance = (a: readonly number[], b: readonly number[]): number =>
	Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const out = process.argv[2]
let targets = process.argv.slice(3)
if (targets[0] === "--list") targets = (await readFile(targets[1], "utf8")).split("\n").map((l) => l.trim()).filter(Boolean)

let flagged = 0
for (const caseFile of targets) {
	try {
		const image = await loadNativeImage(`${ROOT}/${caseFile}`)
		const result = extractPaletteDetails(image)
		const w = result.winner
		const roles = [
			["background", w.background], ["surface", w.surface],
			["foreground", w.foreground], ["accent", w.accent],
		] as const
		const flags: string[] = []
		if (w.collapse.surface && w.collapse.accent) flags.push("double-collapse")
		for (const [name, color] of roles) if (color.generated) flags.push(`generated-color:${name}`)
		if (roles.every(([, color]) => chromaOf(color.oklab) < 0.03)) flags.push("all-neutral")
		for (let i = 0; i < roles.length; i += 1) {
			for (let j = i + 1; j < roles.length; j += 1) {
				const [firstName, first] = roles[i]
				const [secondName, second] = roles[j]
				if (first.hex === second.hex) continue
				if (distance(first.oklab, second.oklab) < 0.02) flags.push(`near-duplicate:${firstName}/${secondName}`)
			}
		}
		if (w.gradient && distance(w.background.oklab, w.surface.oklab) < 0.05) flags.push("flat-gradient")
		const lightnesses = [w.background.oklab[0], w.surface.oklab[0]]
		if (lightnesses.every((l) => l > 0.95) || lightnesses.every((l) => l < 0.06)) flags.push("extreme-field")
		if (flags.length === 0) continue
		flagged += 1
		const record = {
			image: caseFile,
			flags,
			palette: [w.background.hex, w.surface.hex, w.foreground.hex, w.accent.hex],
			gradient: w.gradient,
			collapse: [w.collapse.surface, w.collapse.accent],
			midpoint: result.midpoint.color?.hex ?? null,
			chromas: roles.map(([, color]) => Number(chromaOf(color.oklab).toFixed(4))),
		}
		await appendFile(out, `${JSON.stringify(record)}\n`)
		console.log(`FLAG ${caseFile}  ${flags.join(",")}  ${record.palette.join(" ")}`)
	} catch (error) {
		flagged += 1
		const message = error instanceof Error ? error.message : String(error)
		await appendFile(out, `${JSON.stringify({ image: caseFile, flags: ["crash"], error: message })}\n`)
		console.log(`CRASH ${caseFile}  ${message}`)
	}
}
console.log(`\n${flagged} of ${targets.length} flagged`)
