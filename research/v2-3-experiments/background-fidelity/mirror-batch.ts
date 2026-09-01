/**
 * Mirror REAL extractions for the review batch into the eval results tree.
 *
 * One label per invocation, and the label must agree with the `BACKGROUND_FIDELITY` switch the
 * runtime is actually compiled with — `bf-off` may only be produced with the switch `"off"` and
 * `bf-on` only with `"on"`. That assertion is the whole point: it makes it impossible to ship a
 * batch whose two sides were not really produced by the two configurations they claim.
 *
 * Both sides are real published extractions of the real artwork. Nothing is synthesized, no flag
 * is flipped after the fact.
 *
 *   node --experimental-strip-types mirror-batch.ts <bf-off|bf-on> <listFile>
 */
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"
import { BACKGROUND_FIDELITY } from "../../v2-3/src/internal/palette-core.ts"

const RESULTS = "/Users/Flo/GitHub/palette/.claude/worktrees/agent-a44447f854afa671b/research/v2-3-eval/data/results"
const REPO = "/Users/Flo/GitHub/palette"

const [label, listFile] = process.argv.slice(2)
if (label !== "bf-off" && label !== "bf-on") throw new Error("usage: mirror-batch.ts <bf-off|bf-on> <listFile>")
const expected = label === "bf-on" ? "on" : "off"
if (BACKGROUND_FIDELITY !== expected) {
	throw new Error(
		`label ${label} requires BACKGROUND_FIDELITY === "${expected}", but the runtime is compiled with ` +
		`"${BACKGROUND_FIDELITY}". Flip the switch in research/v2-3/src/internal/palette-core.ts and re-run.`,
	)
}

const outDir = path.join(RESULTS, label)
fs.mkdirSync(outDir, { recursive: true })
const jobs = fs.readFileSync(listFile, "utf8").trim().split("\n").filter(Boolean)
for (const imagePath of jobs) {
	const bytes = fs.readFileSync(imagePath)
	const image = path.basename(imagePath)
	const extraction = await extractPaletteFromBytes(imagePath)
	const record = {
		schemaVersion: 1 as const,
		label,
		algorithm: "albumArtworkPaletteV2" as const,
		algorithmIdentity: extraction.algorithm,
		image,
		imagePath: path.relative(REPO, imagePath),
		sourceSha256: createHash("sha256").update(bytes).digest("hex"),
		byteCount: bytes.byteLength,
		extraction,
	}
	fs.writeFileSync(path.join(outDir, `${image}.json`), `${JSON.stringify(record, null, 2)}\n`)
	const w = extraction.winner
	console.log(`${label} ${image.padEnd(46)} ${w.background.hex} ${w.surface.hex} ${w.foreground.hex} ${w.accent.hex} ${w.gradient ? "grad" : "flat"}`)
}
console.log(`${label}: ${jobs.length} mirrored into ${outDir}`)
