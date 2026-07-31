/**
 * Track P probe: turn the raw AST literal dump into the sweep registry.
 *
 * Not every numeric literal is a tunable. This applies the exclusion rules below and emits
 * `data/registry.json`, the authoritative list of sites the census and the perturbation sweep act
 * on. Every exclusion is recorded with its reason so the ledger can show what was skipped and why —
 * an audit that silently drops sites is worthless.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { RawLiteral } from "./extract-constants.ts"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const raw = JSON.parse(readFileSync(resolve(trackRoot, "data/constants-raw.json"), "utf8")) as {
	literals: RawLiteral[]
}

export type RegistryEntry = RawLiteral & {
	id: string
	/** Sweep participation. */
	tunable: boolean
	excludeReason: string | null
	/** Set for literals that are a field of a frozen policy object. */
	policyField: boolean
}

/**
 * The OKLab <-> sRGB transfer matrices, the sRGB EOTF and the CIELAB white point / toe: all fixed by
 * the colour-space definitions, none of them a tunable of this algorithm. They are still recorded in
 * the registry (with this reason) so the ledger can state that they were reviewed and set aside.
 */
const COLORSPACE_ENCLOSING = new Set([
	"srgbToLinear", "linearToSrgb", "channel", "l", "m", "s", "rgbToOKLab", "oklabToRGB",
	"CIELAB_WHITE_POINT", "CIELAB_TOE_LIMIT", "CIELAB_TOE_SLOPE", "CIELAB_TOE_OFFSET",
	"cielabTransfer", "x", "y", "z", "rgbToCIELab", "rgbToHex",
])

const entries: RegistryEntry[] = []
const seen = new Map<string, number>()

for (const literal of raw.literals) {
	const base = literal.propertyKey
		? `${literal.topLevel}.${literal.propertyKey}`
		: `${literal.file.replace(/^.*\//u, "").replace(/\.ts$/u, "")}:${literal.enclosing}`
	const ordinal = (seen.get(base) ?? 0) + 1
	seen.set(base, ordinal)
	const id = `${base}#${ordinal}@${literal.line}`

	let excludeReason: string | null = null
	if (literal.structural !== null) {
		excludeReason = literal.structural
	} else if (literal.file.endsWith("color.ts") && COLORSPACE_ENCLOSING.has(literal.enclosing)) {
		excludeReason = "colorspace-transfer-constant"
	} else if (!literal.propertyKey && Number.isInteger(literal.value) && Math.abs(literal.value) <= 4) {
		// `/ 2`, `** 2`, `- 1`, arity and tuple sizes. Policy fields with small integer values
		// (`fieldReferenceFamilies: 2`, `minimumComponentCount: 3`) keep their propertyKey and survive.
		excludeReason = "small-integer-arithmetic"
	} else if (!literal.propertyKey && (literal.value === 0 || literal.value === 1)) {
		excludeReason = "arithmetic-identity"
	} else if (literal.value === 255 || literal.value === 256 || literal.value === 8 && /<<|>>|& 0xff/u.test(literal.lineText)) {
		excludeReason = "byte-encoding"
	} else if (literal.value === 100 && /percent|Percent|%/u.test(literal.lineText)) {
		excludeReason = "percent-scale"
	}

	entries.push({
		...literal,
		id,
		tunable: excludeReason === null,
		excludeReason,
		policyField: literal.propertyKey !== null,
	})
}

writeFileSync(
	resolve(trackRoot, "data/registry.json"),
	`${JSON.stringify({ schemaVersion: 1, entries }, null, "\t")}\n`,
)

const tunable = entries.filter((entry) => entry.tunable)
const reasons = new Map<string, number>()
for (const entry of entries) {
	if (entry.excludeReason) reasons.set(entry.excludeReason, (reasons.get(entry.excludeReason) ?? 0) + 1)
}
process.stdout.write(`${entries.length} literals -> ${tunable.length} tunable sites\n`)
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
	process.stdout.write(`  excluded ${String(count).padStart(5)}  ${reason}\n`)
}
const byFile = new Map<string, number>()
for (const entry of tunable) byFile.set(entry.file.replace(/^.*\//u, ""), (byFile.get(entry.file.replace(/^.*\//u, "")) ?? 0) + 1)
process.stdout.write("tunable by file:\n")
for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
	process.stdout.write(`  ${String(count).padStart(5)}  ${file}\n`)
}
process.stdout.write(`policy-object fields among tunable: ${tunable.filter((entry) => entry.policyField).length}\n`)
