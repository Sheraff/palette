/**
 * Runs the parameter-honesty census and writes the report.
 *
 *   cd research/v3
 *   node --experimental-strip-types src/honesty/cli.ts            # write both outputs
 *   node --experimental-strip-types src/honesty/cli.ts --check    # exit 1 if the body hash moved
 *   node --experimental-strip-types src/honesty/cli.ts --quiet
 *
 * Outputs `data/honesty/honesty-report.json` and `data/honesty/HONESTY.md`.
 *
 * `--check` is for a future CI hook: it regenerates in memory and compares `bodyHash` against the
 * committed report without writing. It answers "did anyone add a tunable site without regenerating
 * this?" — not "did honesty get worse", which is a judgment for a reader.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { scanTypeScriptFile } from "./scan-ts.ts"
import { scanPythonFile } from "./scan-py.ts"
import { buildDecisionIndex } from "./classify.ts"
import { buildReport, renderMarkdown, type HonestyReport } from "./report.ts"
import { writeHeader } from "../provenance/header.ts"
import type { ScannedFile } from "./types.ts"

/** `research/v3`, derived from this file's location so the tool works from any cwd. */
export const V3_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

/**
 * The two trees the honesty criterion covers.
 *
 * `[REVIEWED]` — the instrument's scope as briefed: `research/v3/src` and `research/v3/oracle`.
 * `tests/` is deliberately outside it. Test constants are assertions about behaviour, not the
 * behaviour itself, and counting them would let a workstream improve its score by deleting tests.
 */
export const SCAN_ROOTS = ["src", "oracle"] as const

/**
 * Directory names never descended into.
 *
 * `[REVIEWED]` — four Python virtualenvs live one level under `oracle/` (each tool's own `.venv`)
 * and hold tens of thousands of third-party files. Vendored dependencies are not this project's
 * parameters; nobody here can tag them and nobody should try.
 */
const SKIP_DIRECTORIES = new Set([
	".venv",
	"venv",
	"site-packages",
	"node_modules",
	"__pycache__",
	".git",
	".mypy_cache",
	".pytest_cache",
	".ruff_cache",
])

/** File-level skips, each with the reason that goes in the report. */
function skipReason(relPath: string): string | null {
	if (relPath.endsWith(".d.ts")) {
		return "type-declaration file (no runtime behaviour to tune)"
	}
	return null
}

interface Discovered {
	scanned: ScannedFile[]
	skipped: { file: string; reason: string }[]
}

/** Walks the roots and scans every `.ts` / `.py` file that survives the skip rules. */
export function discoverAndScan(root: string, roots: readonly string[]): Discovered {
	const scanned: ScannedFile[] = []
	const skipped: { file: string; reason: string }[] = []

	const walk = (dir: string): void => {
		let entries: string[]
		try {
			entries = readdirSync(dir).sort()
		} catch {
			return
		}
		for (const entry of entries) {
			const abs = join(dir, entry)
			let info
			try {
				info = statSync(abs)
			} catch {
				continue
			}
			if (info.isDirectory()) {
				if (SKIP_DIRECTORIES.has(entry)) continue
				walk(abs)
				continue
			}
			if (!info.isFile()) continue

			const rel = relative(root, abs).split(sep).join("/")
			const isTs = entry.endsWith(".ts")
			const isPy = entry.endsWith(".py")
			if (!isTs && !isPy) continue

			const reason = skipReason(rel)
			if (reason) {
				skipped.push({ file: rel, reason })
				continue
			}

			scanned.push(isTs ? scanTypeScriptFile(abs, rel) : scanPythonFile(abs, rel))
		}
	}

	for (const r of roots) walk(join(root, r))
	// Discovery order is already sorted per directory; sort again so the report never depends on
	// filesystem enumeration order across platforms.
	scanned.sort((a, b) => a.file.localeCompare(b.file))
	skipped.sort((a, b) => a.file.localeCompare(b.file))
	return { scanned, skipped }
}

/**
 * Builds the report for a tree. Exported so tests can run the whole pipeline without writing.
 *
 * `withProvenance` attaches the standard result fingerprint (`src/provenance/header.ts`). Off by
 * default because it shells out to git: the CLI wants it, and a test comparing two bodies does not
 * — `meta` is excluded from `bodyHash`, so the fingerprint changes nothing a test looks at.
 */
export function runCensus(
	root: string = V3_ROOT,
	generatedAt?: string,
	withProvenance = false,
): HonestyReport {
	const { scanned, skipped } = discoverAndScan(root, SCAN_ROOTS)

	const decisionsPath = join(root, "data/decisions/decisions.json")
	let decisions = buildDecisionIndex(null)
	try {
		decisions = buildDecisionIndex(JSON.parse(readFileSync(decisionsPath, "utf8")))
	} catch {
		// No decision file is a legitimate state for a fresh tree or a test fixture. Every citation
		// then reads as dangling, which is the correct and visible outcome rather than a crash.
	}

	const at = generatedAt ?? new Date().toISOString()
	return buildReport(scanned, decisions, {
		roots: [...SCAN_ROOTS],
		generatedAt: at,
		skippedFiles: skipped,
		...(withProvenance
			? {
					provenance: writeHeader({
						what: "Parameter-honesty census over the v3 source tree.",
						generatedBy: "research/v3/src/honesty/cli.ts",
						generatedAt: at,
						// The decision ledger is the census's one external input: it decides whether a
						// cited decision id resolves or dangles, so the same tree against a different
						// ledger is a genuinely different result. The scanned source itself needs no
						// fingerprint here — bodyHash already is one.
						inputs: [{ absolute: decisionsPath, display: "research/v3/data/decisions/decisions.json" }],
					}),
				}
			: {}),
	})
}

function main(argv: string[]): void {
	const check = argv.includes("--check")
	const quiet = argv.includes("--quiet")
	const outDir = join(V3_ROOT, "data/honesty")
	const jsonPath = join(outDir, "honesty-report.json")
	const mdPath = join(outDir, "HONESTY.md")

	const report = runCensus(V3_ROOT, undefined, !check)

	if (check) {
		let previous: HonestyReport
		try {
			previous = JSON.parse(readFileSync(jsonPath, "utf8")) as HonestyReport
		} catch {
			console.error("honesty --check: no committed report at data/honesty/honesty-report.json")
			process.exitCode = 1
			return
		}
		if (previous.bodyHash !== report.bodyHash) {
			console.error(
				`honesty --check: report is stale.\n  committed ${previous.bodyHash}\n  current   ${report.bodyHash}\n  tunable sites ${previous.body.totals.tunableSites} -> ${report.body.totals.tunableSites}, untagged ${previous.body.totals.untagged} -> ${report.body.totals.untagged}\nRegenerate: node --experimental-strip-types src/honesty/cli.ts`,
			)
			process.exitCode = 1
			return
		}
		if (!quiet) console.log(`honesty --check: up to date (${report.bodyHash.slice(0, 16)})`)
		return
	}

	mkdirSync(outDir, { recursive: true })
	writeFileSync(jsonPath, `${JSON.stringify(report, null, "\t")}\n`)
	writeFileSync(mdPath, renderMarkdown(report))

	if (!quiet) {
		const t = report.body.totals
		const h = report.body.headline
		console.log(
			[
				`files            ${report.body.corpus.files}`,
				`literals         ${t.candidates}`,
				`excluded         ${t.excluded}`,
				`TUNABLE SITES    ${t.tunableSites}`,
				`  tagged         ${t.tagged}`,
				`  decision-only  ${t.decisionTraced}`,
				`  dangling cite  ${t.decisionDangling}`,
				`  UNTAGGED       ${t.untagged}`,
				`documented       ${(h.documentedFraction * 100).toFixed(1)}%`,
				`anchored         ${(h.anchoredFraction * 100).toFixed(1)}%`,
				`bodyHash         ${report.bodyHash.slice(0, 16)}`,
			].join("\n"),
		)
	}
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
