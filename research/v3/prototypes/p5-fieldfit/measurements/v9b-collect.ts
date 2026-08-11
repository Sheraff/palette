/**
 * W-V9b — collect the four published roles per cover from one or more devloop run files.
 *
 * Measurement-only. Used to build the v0.8.2 baseline and the v0.9.0 delta table:
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/v9b-collect.ts \
 *       <out.json> <run.jsonl…>
 *
 * The key is the cover's short id (the last 10 characters of the file's basename before the
 * extension), which is how every round document names covers.
 */

import { readFile, writeFile } from "node:fs/promises"

const [out, ...runs] = process.argv.slice(2)
if (out === undefined || runs.length === 0) {
	throw new Error("usage: v9b-collect.ts <out.json> <run.jsonl…>")
}

const palettes: Record<string, { background: string; surface: string; foreground: string; accent: string; gradient: number; escape: boolean; path: string }> = {}

for (const run of runs) {
	const text = await readFile(run, "utf8")
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		const parsed = JSON.parse(line) as {
			kind: string
			imagePath?: string
			ok?: boolean
			palette?: {
				roles: Record<"background" | "surface" | "foreground" | "accent", { hex: string }>
				gradient: { stops: unknown[] } | null
				escape: unknown
			} | null
		}
		if (parsed.kind !== "devloop-run-row" || parsed.ok !== true || !parsed.palette) continue
		const base = (parsed.imagePath ?? "").split("/").pop() ?? ""
		const id = base.replace(/\.[^.]+$/, "").slice(-10)
		palettes[id] = {
			background: parsed.palette.roles.background.hex,
			surface: parsed.palette.roles.surface.hex,
			foreground: parsed.palette.roles.foreground.hex,
			accent: parsed.palette.roles.accent.hex,
			gradient: parsed.palette.gradient === null ? 0 : parsed.palette.gradient.stops.length,
			escape: parsed.palette.escape !== null,
			path: parsed.imagePath ?? "",
		}
	}
}

await writeFile(out, `${JSON.stringify(palettes, null, 2)}\n`)
process.stdout.write(`${Object.keys(palettes).length} covers → ${out}\n`)
