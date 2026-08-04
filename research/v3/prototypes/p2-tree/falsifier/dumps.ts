/**
 * Reading the pipelines' node dumps.
 *
 * The format is `SPEC.md` §"Shared interface" 2: one JSON object per line,
 * `{imagePath, pipeline, width, height, nodes: [{id, parent, areaFraction, depth, repr: "#rrggbb",
 * …pipeline-specific attrs}]}`, retained (post-filter) nodes only.
 *
 * This reader is deliberately **permissive about the pipeline-specific half and strict about the
 * three fields the falsifier reads** (`imagePath`, `pipeline`, `nodes[].repr`). A dump that carries
 * extra attributes is fine; a dump missing a repr is a parse error with its line number, never a
 * dropped node — a dropped node is a colour that quietly became unreachable.
 */

import { globSync, readFileSync } from "node:fs"
import { colorFromHex } from "../../../src/contract/color.ts"
import type { PaletteColor } from "../../../src/contract/types.ts"

export type DumpNode = Readonly<{
	id: string | number
	repr: PaletteColor
	areaFraction: number | null
	depth: number | null
	parent: string | number | null
}>

export type DumpLine = Readonly<{
	/** Dump file the line came from, as the caller wrote it. */
	source: string
	/** 1-based line number within that file. */
	line: number
	imagePath: string
	pipeline: string
	width: number | null
	height: number | null
	nodes: readonly DumpNode[]
	/**
	 * Area floor this pipeline declared for node retention, if any. Read from
	 * `areaFloor`, `constants.areaFloor` or `constants.AREA_FLOOR` — three spellings because no
	 * dump existed when this was written and the SPEC does not fix a field name for it.
	 */
	declaredAreaFloor: number | null
}>

export type DumpParseError = Readonly<{
	source: string
	line: number
	reason: string
	/** First 160 characters of the offending line, for whoever fixes the emitter. */
	excerpt: string
}>

export type DumpReadResult = Readonly<{
	files: readonly string[]
	lines: readonly DumpLine[]
	errors: readonly DumpParseError[]
	/** Lines dropped because `--limit` was reached. Reported so a truncated run says so. */
	skippedByLimit: number
}>

/**
 * Expand the `--dumps` arguments.
 *
 * A pattern containing a glob metacharacter goes to `node:fs`'s `globSync`; anything else is taken
 * literally, so a path with a bracket in it still works. Results are sorted — `globSync`'s order is
 * filesystem order, and this harness's output must not depend on it.
 */
export function expandDumpArgs(patterns: readonly string[]): string[] {
	const found = new Set<string>()
	for (const pattern of patterns) {
		if (/[*?[\]{}]/.test(pattern)) {
			for (const hit of globSync(pattern)) found.add(hit)
		} else {
			found.add(pattern)
		}
	}
	return [...found].sort()
}

function readAreaFloor(raw: Record<string, unknown>): number | null {
	const constants = (raw.constants ?? {}) as Record<string, unknown>
	for (const value of [raw.areaFloor, constants.areaFloor, constants.AREA_FLOOR]) {
		if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1) return value
	}
	return null
}

/** Parse one JSONL line. Returns the line or the reason it was refused. */
export function parseDumpLine(source: string, line: number, text: string): DumpLine | DumpParseError {
	const excerpt = text.slice(0, 160)
	let raw: Record<string, unknown>
	try {
		raw = JSON.parse(text) as Record<string, unknown>
	} catch (error) {
		return { source, line, reason: `not JSON: ${(error as Error).message}`, excerpt }
	}
	if (typeof raw.imagePath !== "string" || raw.imagePath.length === 0) {
		return { source, line, reason: "missing `imagePath`", excerpt }
	}
	if (typeof raw.pipeline !== "string" || raw.pipeline.length === 0) {
		return { source, line, reason: "missing `pipeline`", excerpt }
	}
	if (!Array.isArray(raw.nodes)) {
		return { source, line, reason: "missing `nodes` array", excerpt }
	}

	const nodes: DumpNode[] = []
	for (const [index, entry] of (raw.nodes as unknown[]).entries()) {
		const node = entry as Record<string, unknown>
		if (typeof node?.repr !== "string") {
			return { source, line, reason: `node ${index} has no string \`repr\``, excerpt }
		}
		let repr: PaletteColor
		try {
			repr = colorFromHex(node.repr)
		} catch (error) {
			return { source, line, reason: `node ${index} repr ${node.repr}: ${(error as Error).message}`, excerpt }
		}
		nodes.push({
			id: (node.id as string | number | undefined) ?? index,
			repr,
			areaFraction: typeof node.areaFraction === "number" ? node.areaFraction : null,
			depth: typeof node.depth === "number" ? node.depth : null,
			parent: (node.parent as string | number | null | undefined) ?? null,
		})
	}

	return {
		source,
		line,
		imagePath: raw.imagePath,
		pipeline: raw.pipeline,
		width: typeof raw.width === "number" ? raw.width : null,
		height: typeof raw.height === "number" ? raw.height : null,
		nodes,
		declaredAreaFloor: readAreaFloor(raw),
	}
}

/**
 * Read every dump file, in sorted file order, in line order.
 *
 * `limit` caps the number of **successfully parsed lines** processed; the count of lines it cut is
 * reported rather than left to be inferred from a short table.
 */
export function readDumps(patterns: readonly string[], limit: number | null): DumpReadResult {
	const files = expandDumpArgs(patterns)
	const lines: DumpLine[] = []
	const errors: DumpParseError[] = []
	let skippedByLimit = 0

	for (const file of files) {
		let text: string
		try {
			text = readFileSync(file, "utf8")
		} catch (error) {
			errors.push({ source: file, line: 0, reason: `unreadable: ${(error as Error).message}`, excerpt: "" })
			continue
		}
		const rows = text.split("\n")
		for (const [index, row] of rows.entries()) {
			if (row.trim().length === 0) continue
			const parsed = parseDumpLine(file, index + 1, row)
			if ("reason" in parsed) {
				errors.push(parsed)
				continue
			}
			if (limit !== null && lines.length >= limit) {
				skippedByLimit += 1
				continue
			}
			lines.push(parsed)
		}
	}

	return { files, lines, errors, skippedByLimit }
}
