/**
 * The auto-adjudication CLI.
 *
 *   cd research/v3
 *   node --experimental-strip-types src/adjudication/cli.ts run <candidates.jsonl>
 *   node --experimental-strip-types src/adjudication/cli.ts corpus
 *   node --experimental-strip-types src/adjudication/cli.ts explain <candidates.jsonl> --artwork <sha|path>
 *
 * **Exit status is 0 whenever adjudication completed**, including when the run matched known-bad
 * palettes. That is principle 3 wired into the process contract: nothing here gates. A non-zero exit
 * means the tool could not do its job — bad arguments, unreadable file — never that the candidate
 * did badly. A caller who wants a gate has to read the report and decide, in the open.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { ROLE_NAMES } from "../contract/index.ts"
import type { RoleName } from "../contract/index.ts"
import { adjudicateRun, compareRuns, PRINCIPLES, readCandidateRun } from "./adjudicate.ts"
import type { AdjudicateOptions } from "./adjudicate.ts"
import { DEFAULT_LEGACY_DIR, DEFAULT_WAREHOUSE_FILE, loadEvidence } from "./evidence.ts"
import { DEFAULT_MATCH_OPTIONS } from "./match.ts"
import { renderJson, renderText } from "./report.ts"
import type { BarMode, EvidenceEra, MatchOptions, PartialEntryPolicy } from "./types.ts"

const USAGE = `auto-adjudication — a candidate palette run against standing reviewer evidence

  run <candidates.jsonl>        adjudicate a run (the default command)
  corpus                        census of the evidence corpus and its own contradictions
  explain <candidates.jsonl>    full per-entry detail for one artwork (needs --artwork)

Options
  --format text|json            default text
  --out <path>                  write instead of printing
  --bar regional|pooled|exact-hex|<number>
                                same-colour bar. Default regional — the calibrated, frozen one.
  --roles background,surface,foreground,accent
  --partial-entries compare-present|skip
                                how to treat evidence entries missing some roles. Default compare-present.
  --era v2-3,v3                 which regimes to load. Default both.
  --as-of YYYY-MM-DD            reference date for prior ages. Omitted, ages are not computed.
  --near-misses <n>             nearest non-matching entries kept per candidate. Default 3.
  --no-reachability             skip the reachability assessment
  --baseline <run.jsonl>        also report movement to/from known-bad against this run
  --artwork <sha256|path>       explain only
  --legacy-dir <dir>            default research/v3/data/legacy
  --warehouse <file>            default research/v3/data/warehouse/warehouse.jsonl
  --include-demo-fixtures       count the warehouse's demo-fixture records as evidence (they are not)
  --verbose                     per-candidate detail for every candidate
  --help

Exit status is 0 whenever adjudication completed. This tool does not gate.`

type Parsed = {
	command: "run" | "corpus" | "explain"
	input: string | null
	format: "text" | "json"
	out: string | null
	match: MatchOptions
	eras: EvidenceEra[]
	asOf: string | null
	nearMisses: number
	reachability: boolean
	baseline: string | null
	artwork: string | null
	legacyDir: string
	warehouse: string
	includeDemoFixtures: boolean
	verbose: boolean
}

export class UsageError extends Error {
	override readonly name = "UsageError"
}

export function parseArgs(argv: readonly string[]): Parsed {
	const parsed: Parsed = {
		command: "run",
		input: null,
		format: "text",
		out: null,
		match: { ...DEFAULT_MATCH_OPTIONS },
		eras: ["v2-3", "v3"],
		asOf: null,
		nearMisses: 3,
		reachability: true,
		baseline: null,
		artwork: null,
		legacyDir: DEFAULT_LEGACY_DIR,
		warehouse: DEFAULT_WAREHOUSE_FILE,
		includeDemoFixtures: false,
		verbose: false,
	}

	const positional: string[] = []
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]!
		const next = (): string => {
			const value = argv[index + 1]
			if (value === undefined) throw new UsageError(`${arg} needs a value`)
			index += 1
			return value
		}
		switch (arg) {
			case "--help":
			case "-h":
				throw new UsageError("")
			case "--format": {
				const value = next()
				if (value !== "text" && value !== "json") throw new UsageError("--format must be text or json")
				parsed.format = value
				break
			}
			case "--out":
				parsed.out = next()
				break
			case "--bar": {
				const value = next()
				if (value === "regional" || value === "pooled" || value === "exact-hex") {
					parsed.match = { ...parsed.match, barMode: value as BarMode }
				} else {
					const bar = Number(value)
					if (!Number.isFinite(bar) || bar <= 0) throw new UsageError(`--bar: not a positive number: ${value}`)
					parsed.match = { ...parsed.match, barMode: "fixed", fixedBar: bar }
				}
				break
			}
			case "--roles": {
				const roles = next().split(",").map((role) => role.trim()).filter(Boolean)
				for (const role of roles) {
					if (!ROLE_NAMES.includes(role as RoleName)) throw new UsageError(`--roles: unknown role ${role}`)
				}
				parsed.match = { ...parsed.match, roles: roles as RoleName[] }
				break
			}
			case "--partial-entries": {
				const value = next()
				if (value !== "compare-present" && value !== "skip") {
					throw new UsageError("--partial-entries must be compare-present or skip")
				}
				parsed.match = { ...parsed.match, partialEntries: value as PartialEntryPolicy }
				break
			}
			case "--era": {
				const eras = next().split(",").map((era) => era.trim()).filter(Boolean)
				for (const era of eras) {
					if (era !== "v2-3" && era !== "v3") throw new UsageError(`--era: unknown era ${era}`)
				}
				parsed.eras = eras as EvidenceEra[]
				break
			}
			case "--as-of":
				parsed.asOf = next()
				break
			case "--near-misses": {
				const value = Number(next())
				if (!Number.isInteger(value) || value < 0) throw new UsageError("--near-misses must be a non-negative integer")
				parsed.nearMisses = value
				break
			}
			case "--no-reachability":
				parsed.reachability = false
				break
			case "--baseline":
				parsed.baseline = next()
				break
			case "--artwork":
				parsed.artwork = next()
				break
			case "--legacy-dir":
				parsed.legacyDir = resolve(next())
				break
			case "--warehouse":
				parsed.warehouse = resolve(next())
				break
			case "--include-demo-fixtures":
				parsed.includeDemoFixtures = true
				break
			case "--verbose":
				parsed.verbose = true
				break
			default:
				if (arg.startsWith("-")) throw new UsageError(`unknown option ${arg}`)
				positional.push(arg)
		}
	}

	if (positional[0] === "run" || positional[0] === "corpus" || positional[0] === "explain") {
		parsed.command = positional.shift() as Parsed["command"]
	}
	parsed.input = positional[0] ?? null
	if (parsed.command !== "corpus" && !parsed.input) throw new UsageError("a candidate run file is required")
	if (parsed.command === "explain" && !parsed.artwork) throw new UsageError("explain needs --artwork <sha256|path>")
	return parsed
}

/** Census of the evidence corpus itself — what standing priors exist, and where they disagree. */
export function renderCorpus(parsed: Parsed): string {
	const corpus = loadEvidence({
		legacyDir: parsed.legacyDir,
		warehouseFile: parsed.warehouse,
		eras: parsed.eras,
		asOf: parsed.asOf,
		includeDemoFixtures: parsed.includeDemoFixtures,
	})
	const lines: string[] = []
	lines.push("EVIDENCE CORPUS — standing priors available to adjudication")
	lines.push("=".repeat(78))
	lines.push("")
	for (let index = 0; index < PRINCIPLES.length; index += 1) lines.push(`  ${index + 1}. ${PRINCIPLES[index]}`)
	lines.push("")
	for (const source of corpus.sources) {
		lines.push(
			`  ${source.era.padEnd(5)} ${source.tier.padEnd(11)} ${String(source.entryCount).padStart(5)} entries  ` +
				`${source.path}`,
		)
	}
	lines.push("")
	lines.push(`  total entries: ${corpus.entries.length}`)
	lines.push(`  distinct files with evidence: ${corpus.byArtwork.size}`)
	if (parsed.eras.includes("v3")) {
		lines.push(
			`  warehouse demo-fixture records excluded: ${corpus.excludedDemoFixtures}` +
				(parsed.includeDemoFixtures ? " (INCLUDED by --include-demo-fixtures — they are not evidence)" : ""),
		)
	}
	const eraCounts = new Map<string, number>()
	for (const entry of corpus.entries) eraCounts.set(entry.provenance.era, (eraCounts.get(entry.provenance.era) ?? 0) + 1)
	for (const era of [...eraCounts.keys()].sort()) {
		lines.push(`  era ${era}: ${eraCounts.get(era)} entries`)
	}
	if ((eraCounts.get("v3") ?? 0) === 0 && parsed.eras.includes("v3")) {
		lines.push("")
		lines.push("  The current regime has NO standing palette verdicts yet. Every prior below is v2-3 —")
		lines.push("  old contract, old algorithm, old review UI. Read them as dated priors (principle 3).")
	}
	lines.push("")
	const byKind = new Map<string, number>()
	for (const conflict of corpus.corpusConflicts) byKind.set(conflict.kind, (byKind.get(conflict.kind) ?? 0) + 1)
	lines.push(`CONTRADICTIONS INTRINSIC TO THE CORPUS (${corpus.corpusConflicts.length})`)
	for (const kind of [...byKind.keys()].sort()) lines.push(`  ${kind.padEnd(30)} ${byKind.get(kind)}`)
	lines.push("")
	for (const conflict of corpus.corpusConflicts.slice(0, 40)) {
		lines.push(`  [${conflict.kind}] ${conflict.artworkPath ?? ""} — ${conflict.entryIds.join(", ")}`)
		lines.push(`    ${conflict.detail}`)
	}
	if (corpus.corpusConflicts.length > 40) lines.push(`  … and ${corpus.corpusConflicts.length - 40} more`)
	lines.push("")
	return lines.join("\n")
}

function optionsFor(parsed: Parsed, inputPath: string): AdjudicateOptions {
	return {
		match: parsed.match,
		asOf: parsed.asOf,
		eras: parsed.eras,
		reachability: parsed.reachability,
		nearMisses: parsed.nearMisses,
		inputPath,
	}
}

export function runCli(argv: readonly string[]): { text: string; exitCode: number } {
	let parsed: Parsed
	try {
		parsed = parseArgs(argv)
	} catch (error) {
		if (error instanceof UsageError) {
			return { text: error.message ? `${error.message}\n\n${USAGE}` : USAGE, exitCode: error.message ? 2 : 0 }
		}
		throw error
	}

	if (parsed.command === "corpus") {
		return { text: renderCorpus(parsed), exitCode: 0 }
	}

	const corpus = loadEvidence({
		legacyDir: parsed.legacyDir,
		warehouseFile: parsed.warehouse,
		eras: parsed.eras,
		asOf: parsed.asOf,
		includeDemoFixtures: parsed.includeDemoFixtures,
	})
	const run = readCandidateRun(parsed.input!)
	const options = optionsFor(parsed, parsed.input!)

	let movement = null
	if (parsed.baseline) {
		const baselineRun = readCandidateRun(parsed.baseline)
		const baselineReport = adjudicateRun(baselineRun, corpus, optionsFor(parsed, parsed.baseline))
		movement = compareRuns(
			adjudicateRun(run, corpus, options).perCandidate,
			baselineReport.perCandidate,
			parsed.baseline,
		)
	}

	const report = adjudicateRun(run, corpus, options, movement)

	if (parsed.command === "explain") {
		const needle = parsed.artwork!
		const matching = report.perCandidate.filter(
			(verdict) => verdict.artworkSha256 === needle || verdict.artworkPath.includes(needle),
		)
		if (matching.length === 0) {
			return { text: `no candidate in ${parsed.input} matches artwork ${needle}\n`, exitCode: 2 }
		}
		const scoped = { ...report, perCandidate: matching }
		const text = parsed.format === "json" ? renderJson(scoped) : renderText(scoped, { verbose: true })
		return { text, exitCode: 0 }
	}

	const text = parsed.format === "json" ? renderJson(report) : renderText(report, { verbose: parsed.verbose })
	return { text, exitCode: 0 }
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`
if (invokedDirectly) {
	let result: { text: string; exitCode: number }
	try {
		result = runCli(process.argv.slice(2))
	} catch (error) {
		process.stderr.write(`${(error as Error).message}\n`)
		process.exit(1)
	}
	const parsedOut = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null
	if (parsedOut) {
		mkdirSync(dirname(resolve(parsedOut)), { recursive: true })
		writeFileSync(resolve(parsedOut), result.text.endsWith("\n") ? result.text : `${result.text}\n`)
		process.stdout.write(`wrote ${parsedOut}\n`)
	} else {
		process.stdout.write(result.text.endsWith("\n") ? result.text : `${result.text}\n`)
	}
	process.exit(result.exitCode)
}
