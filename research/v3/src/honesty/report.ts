/**
 * Aggregation and rendering for the parameter-honesty instrument.
 *
 * **Determinism.** Everything a reader would diff lives under `body`, which contains no timestamp
 * and no absolute path, and whose arrays are sorted by explicit keys rather than by discovery
 * order. `meta` carries the timestamp and the machine-specific bits and is excluded from
 * `bodyHash`. Two runs over an unchanged tree produce an identical `bodyHash` — which is what lets
 * this metric be tracked over time and what stops a re-run from showing up as a diff.
 *
 * `CONVENTIONS.md` says a quoted count carries the timestamp it was measured at. The generated
 * Markdown does exactly that in its header, while the JSON body stays timestamp-free so the
 * numbers themselves can be compared across runs.
 */

import { createHash } from "node:crypto"
import type { ExclusionRule, ProvenanceTag, ScannedFile, Site } from "./types.ts"
import { PROVENANCE_TAGS, TAG_ANCHOR_STRENGTH } from "./types.ts"
import { EXCLUSION_RULES, classify, type DecisionIndex } from "./classify.ts"
import { areaOf, gateFor, type AreaGate } from "./areas.ts"

/** A tunable site with no provenance, as it appears in the backlog list. */
export interface UntaggedEntry {
	file: string
	line: number
	column: number
	value: number
	text: string
	name: string | null
	functionName: string | null
	snippet: string
	suspicion: number
	flags: string[]
}

/**
 * One working area's slice of the census.
 *
 * `untagged` is the number the growth rule watches, and it is deliberately the same quantity
 * `byFile` reports: tunable sites carrying no provenance *or* a dangling decision citation. A
 * dangling citation reads as provenance and is not, so counting it as documented here would let an
 * area improve its gated number by citing decision ids that do not exist.
 */
export interface AreaRow {
	area: string
	gate: AreaGate
	/** False when the area is not listed in `areas.ts` — a directory nobody has classified yet. */
	configured: boolean
	workstream: string
	files: number
	tunableSites: number
	tagged: number
	decisionTraced: number
	documented: number
	untagged: number
	anchored: number
	documentedFraction: number
	anchoredFraction: number
}

export interface HonestyBody {
	corpus: {
		files: number
		lines: number
		byLanguage: Record<string, { files: number; lines: number; fidelity: string }>
	}
	totals: {
		candidates: number
		excluded: number
		tunableSites: number
		tagged: number
		decisionTraced: number
		decisionDangling: number
		untagged: number
	}
	headline: {
		/** (tagged + decision-traced) / tunableSites — the fraction with any provenance story. */
		documentedFraction: number
		/** Sites whose story is [REVIEWED], [MEASURED], or a resolved decision record. */
		anchoredFraction: number
	}
	byTag: Record<string, number>
	byAnchorStrength: { anchored: number; weak: number; unanchored: number }
	tagAttribution: Record<string, number>
	decisionCitations: {
		recheckable: number
		conversational: number
		dangling: { file: string; line: number; decisionId: string }[]
	}
	exclusions: (ExclusionRule & { count: number })[]
	/**
	 * Files under the roots that were not scanned at all, each with a reason. Listed for the same
	 * reason the literal-level exclusions are: a file-level skip is the easiest place to hide a
	 * pile of untagged constants.
	 */
	skippedFiles: { file: string; reason: string }[]
	/**
	 * Per working area, sorted by area name. The unit a workstream can act on, and the unit the
	 * growth rule in `growth.ts` compares across runs.
	 */
	byArea: AreaRow[]
	byFile: { file: string; tunableSites: number; documented: number; untagged: number }[]
	worstOffenders: UntaggedEntry[]
	untagged: UntaggedEntry[]
	limitations: string[]
}

export interface HonestyReport {
	meta: {
		what: string
		generatedAt: string
		roots: string[]
		note: string
	}
	bodyHash: string
	body: HonestyBody
}

/** Recursively key-sorted JSON, so the hash depends on content and never on insertion order. */
function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize)
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {}
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = canonicalize((value as Record<string, unknown>)[key])
		}
		return out
	}
	return value
}

export function hashBody(body: HonestyBody): string {
	return createHash("sha256").update(JSON.stringify(canonicalize(body))).digest("hex")
}

function toEntry(site: Site): UntaggedEntry {
	return {
		file: site.file,
		line: site.line,
		column: site.column,
		value: site.value,
		text: site.text,
		name: site.enclosing.name,
		functionName: site.enclosing.functionName,
		snippet: site.snippet,
		suspicion: site.suspicion,
		flags: [...site.flags].sort(),
	}
}

/** Sorts the backlog: most suspicious first, then by position so ties are stable. */
function backlogOrder(a: UntaggedEntry, b: UntaggedEntry): number {
	return (
		b.suspicion - a.suspicion ||
		a.file.localeCompare(b.file) ||
		a.line - b.line ||
		a.column - b.column
	)
}

/**
 * Known blind spots, published with the numbers rather than in a separate document.
 *
 * An instrument that measures honesty and hides its own limits would be self-refuting. Scanner
 * agents contribute the language-specific entries; the structural ones are inherent to counting
 * numeric literals at all.
 */
export const STANDING_LIMITATIONS: readonly string[] = [
	"Only numeric literals are counted. A tunable expressed as a string ('high' | 'low'), a boolean policy switch, or a choice of algorithm is invisible to this instrument — v2-3's worst free parameters included several of those.",
	"Provenance is judged by proximity, not by meaning. A tag in an adjacent comment counts even if it documents the constant next door, and a correct provenance story written three lines away does not count. The tagAttribution block shows how much of the total rests on the weakest of those inferences (shared-doc-block).",
	"The Python half is a lexical scan, not an AST parse: it can misread syntax a real parser would not. The TypeScript half uses the TypeScript compiler's own AST. Per-language fidelity is published in the corpus block so the two are never silently pooled.",
	"[FITTED] is read as a label, never verified as a statistic. The tag is defined to cite n and the fitting artifact, but this instrument does not check that the citation is present, that the artifact exists, that n is adequate, or that the fit was ever tested against a holdout. A [FITTED] tag on a constant fitted to eleven points scores exactly as anchored as one fitted to nine hundred. The count is published separately in byTag so a reader can audit those sites specifically rather than take the anchored total on trust.",
	"A site counted once may be one of several places the same value is written. Duplicated magic numbers inflate the count; a single named constant used in twelve places counts once, which is the incentive the metric should create.",
	"The reviewed-vs-unseen perturbation-stability ratio — the third parameter-honesty number, and v2-3's 1.61x overfitting alarm — is NOT measured here. It needs a pipeline that emits palettes and belongs with the perturbation gates at the Phase 2 entry condition.",
	"Known false-positive class, left in deliberately: colorimetric constants fixed by specification are only recognised when they are the sRGB transfer values or sit inside a matrix-shaped array literal. The OKLab coefficients written as arithmetic chains in src/contract/color.ts, and the CIE D65 white point, are therefore counted as untagged tunables. Filter body.untagged on those files for the current size. They are left counted rather than exempted by a widened heuristic, because broadening an exclusion is the one edit that improves this score without improving the code.",
	"Python flag limits (from scan-py.ts's KNOWN LIMITS block): the lexer cannot tell an accumulator (total = 0) from a knob (threshold = 0.5), which is why the accumulator-init exclusion refuses to fire unless the value is 0 or 1; unit-clamp also catches Python's general min/max reducers such as max(len(xs), 1), which are non-tunables too but not clamps; round()-based display formatting is only recognised when the same physical line prints; and sequences built by comprehension are invisible to in-numeric-sequence.",
	"Python syntax knowingly mishandled by the lexical scan: semicolon-separated statements and one-line compounds (if x: y = 1) read as a single logical line; imaginary literals (3j) are dropped entirely; format-spec nesting is walked one level; and the module docstring is never offered as a provenance comment, matching where this repo's Python tags actually live.",
	"A tunable site is not the same unit as a free parameter. This tree is mostly Phase 0 instrumentation — review servers, analysis scripts, oracle runners — whereas v2-3's ~900 sites were the palette pipeline itself. The two counts are not comparable, and the number to watch is this one's trend as Phase 1 code lands, not its distance from 900.",
]

export function buildReport(
	scanned: readonly ScannedFile[],
	decisions: DecisionIndex,
	options: {
		roots: string[]
		generatedAt: string
		extraLimitations?: readonly string[]
		skippedFiles?: readonly { file: string; reason: string }[]
	},
): HonestyReport {
	const sites = classify(
		scanned.flatMap((f) => f.candidates),
		decisions,
	)

	const tunable = sites.filter((s) => s.excludedBy === null)
	const excluded = sites.filter((s) => s.excludedBy !== null)

	const byLanguage: Record<string, { files: number; lines: number; fidelity: string }> = {}
	for (const file of scanned) {
		const entry = (byLanguage[file.language] ??= {
			files: 0,
			lines: 0,
			fidelity: file.fidelity,
		})
		entry.files += 1
		entry.lines += file.lines
	}

	const byTag: Record<string, number> = {}
	for (const tag of PROVENANCE_TAGS) byTag[tag] = 0
	const byAnchorStrength = { anchored: 0, weak: 0, unanchored: 0 }
	const tagAttribution: Record<string, number> = {
		trailing: 0,
		leading: 0,
		"shared-doc-block": 0,
	}

	let tagged = 0
	let decisionTraced = 0
	let decisionDangling = 0
	let untaggedCount = 0
	let anchored = 0
	let recheckable = 0
	let conversational = 0
	const dangling: { file: string; line: number; decisionId: string }[] = []

	for (const site of tunable) {
		const p = site.provenance
		if (p.kind === "tagged") {
			tagged += 1
			byTag[p.tag as ProvenanceTag] += 1
			const strength = TAG_ANCHOR_STRENGTH[p.tag as ProvenanceTag]
			byAnchorStrength[strength] += 1
			if (strength === "anchored") anchored += 1
			if (p.source) tagAttribution[p.source] += 1
			if (p.decisionFunding === "recheckable") recheckable += 1
			else if (p.decisionFunding === "conversational") conversational += 1
		} else if (p.kind === "decision-traced") {
			decisionTraced += 1
			anchored += 1
			byAnchorStrength.anchored += 1
			if (p.source) tagAttribution[p.source] += 1
			if (p.decisionFunding === "recheckable") recheckable += 1
			else conversational += 1
		} else if (p.kind === "decision-dangling") {
			decisionDangling += 1
			byAnchorStrength.unanchored += 1
			dangling.push({ file: site.file, line: site.line, decisionId: p.decisionId as string })
		} else {
			untaggedCount += 1
			byAnchorStrength.unanchored += 1
		}
	}

	const exclusionCounts = EXCLUSION_RULES.map((rule) => ({
		id: rule.id,
		rationale: rule.rationale,
		count: excluded.filter((s) => s.excludedBy === rule.id).length,
	}))

	const fileNames = [...new Set(sites.map((s) => s.file))].sort()
	const byFile = fileNames
		.map((file) => {
			const own = tunable.filter((s) => s.file === file)
			const documented = own.filter(
				(s) => s.provenance.kind === "tagged" || s.provenance.kind === "decision-traced",
			).length
			return {
				file,
				tunableSites: own.length,
				documented,
				untagged: own.length - documented,
			}
		})
		.filter((row) => row.tunableSites > 0)

	// Per-area aggregation. Files come from the scan (so an area with zero tunable sites still shows
	// its file count rather than disappearing), counts come from the classified tunable sites.
	const areaFiles = new Map<string, number>()
	for (const file of scanned) {
		const area = areaOf(file.file)
		areaFiles.set(area, (areaFiles.get(area) ?? 0) + 1)
	}
	const areaCounts = new Map<
		string,
		{ tunableSites: number; tagged: number; decisionTraced: number; anchored: number }
	>()
	for (const site of tunable) {
		const area = areaOf(site.file)
		const row = (areaCounts.get(area) ?? { tunableSites: 0, tagged: 0, decisionTraced: 0, anchored: 0 })
		row.tunableSites += 1
		const p = site.provenance
		if (p.kind === "tagged") {
			row.tagged += 1
			if (TAG_ANCHOR_STRENGTH[p.tag as ProvenanceTag] === "anchored") row.anchored += 1
		} else if (p.kind === "decision-traced") {
			row.decisionTraced += 1
			row.anchored += 1
		}
		areaCounts.set(area, row)
	}
	const byArea: AreaRow[] = [...new Set([...areaFiles.keys(), ...areaCounts.keys()])]
		.sort()
		.map((area) => {
			const counts = areaCounts.get(area) ?? {
				tunableSites: 0,
				tagged: 0,
				decisionTraced: 0,
				anchored: 0,
			}
			const { gate, workstream, configured } = gateFor(area)
			const documentedHere = counts.tagged + counts.decisionTraced
			const denom = counts.tunableSites || 1
			return {
				area,
				gate,
				configured,
				workstream,
				files: areaFiles.get(area) ?? 0,
				tunableSites: counts.tunableSites,
				tagged: counts.tagged,
				decisionTraced: counts.decisionTraced,
				documented: documentedHere,
				untagged: counts.tunableSites - documentedHere,
				anchored: counts.anchored,
				documentedFraction: round4(documentedHere / denom),
				anchoredFraction: round4(counts.anchored / denom),
			}
		})

	const untaggedEntries = tunable
		.filter(
			(s) => s.provenance.kind === "untagged" || s.provenance.kind === "decision-dangling",
		)
		.map(toEntry)
		.sort(backlogOrder)

	const documented = tagged + decisionTraced
	const denominator = tunable.length || 1

	const body: HonestyBody = {
		corpus: {
			files: scanned.length,
			lines: scanned.reduce((n, f) => n + f.lines, 0),
			byLanguage,
		},
		totals: {
			candidates: sites.length,
			excluded: excluded.length,
			tunableSites: tunable.length,
			tagged,
			decisionTraced,
			decisionDangling,
			untagged: untaggedCount,
		},
		headline: {
			documentedFraction: round4(documented / denominator),
			anchoredFraction: round4(anchored / denominator),
		},
		byTag,
		byAnchorStrength,
		tagAttribution,
		decisionCitations: {
			recheckable,
			conversational,
			dangling: dangling.sort(
				(a, b) => a.file.localeCompare(b.file) || a.line - b.line,
			),
		},
		exclusions: exclusionCounts,
		skippedFiles: [...(options.skippedFiles ?? [])].sort((a, b2) =>
			a.file.localeCompare(b2.file),
		),
		byArea,
		byFile,
		worstOffenders: untaggedEntries.slice(0, WORST_OFFENDER_COUNT),
		untagged: untaggedEntries,
		limitations: [...STANDING_LIMITATIONS, ...(options.extraLimitations ?? [])],
	}

	return {
		meta: {
			what: "Parameter-honesty census over the v3 source tree: how many numbers could be changed to change behaviour, and how many carry provenance. V3_PLAN.md §1, success criterion 2.",
			generatedAt: options.generatedAt,
			roots: [...options.roots].sort(),
			note: "meta is excluded from bodyHash. Two runs over an unchanged tree produce an identical bodyHash.",
		},
		bodyHash: hashBody(body),
		body,
	}
}

/**
 * How many untagged sites the report highlights by name.
 *
 * `[HELD]` — a presentation choice, not a measurement. Ten is short enough to read in one pass;
 * the complete backlog is always in `body.untagged`, so nothing is hidden by this number.
 */
const WORST_OFFENDER_COUNT = 10

/**
 * How many rows the per-file table shows.
 *
 * `[HELD]` — presentation only, same reasoning as above.
 */
const FILE_TABLE_ROWS = 30

/**
 * Where a source snippet is truncated in the Markdown tables.
 *
 * `[HELD]` — fits the table without wrapping in a normal terminal. The untruncated line is in the
 * JSON.
 */
const SNIPPET_DISPLAY_WIDTH = 90

/**
 * Decimal places kept on the published fractions.
 *
 * `[HELD]` — four places is far finer than the metric's own precision; it exists so the number is
 * stable and diffable, not because it is meaningful to that resolution.
 */
const FRACTION_PRECISION = 10000

function round4(n: number): number {
	return Math.round(n * FRACTION_PRECISION) / FRACTION_PRECISION
}

function pct(fraction: number): string {
	return `${(fraction * 100).toFixed(1)}%`
}

/** Renders the human-facing HONESTY.md. Generated file — the header says so. */
export function renderMarkdown(report: HonestyReport): string {
	const b = report.body
	const t = b.totals
	const lines: string[] = []

	lines.push("# Parameter honesty — census of the v3 source tree")
	lines.push("")
	lines.push(
		"**Generated file. Do not edit by hand** — regenerate with `node --experimental-strip-types src/honesty/cli.ts` from `research/v3`.",
	)
	lines.push("")
	lines.push(`Measured at **${report.meta.generatedAt}**. Body hash \`${report.bodyHash.slice(0, 16)}\`.`)
	lines.push("")
	lines.push(
		"Parameter honesty is the second of v3's three success criteria (`V3_PLAN.md` §1). It exists because v2-3 carried roughly 900 tunable sites against 11 human-anchored values — quantified overfitting. This page counts the first number and the provenance behind it. It does **not** measure the third number, the reviewed-vs-unseen perturbation-stability ratio; that needs a pipeline and belongs at the Phase 2 entry condition.",
	)
	lines.push("")

	lines.push("## Headline")
	lines.push("")
	lines.push(`- **Tunable sites: ${t.tunableSites}**`)
	lines.push(
		`- **Documented: ${t.tagged + t.decisionTraced} (${pct(b.headline.documentedFraction)})** — carries a provenance tag or a resolved decision record.`,
	)
	lines.push(
		`- **Anchored: ${b.byAnchorStrength.anchored} (${pct(b.headline.anchoredFraction)})** — the story is \`[REVIEWED]\`, \`[MEASURED]\`, or a decision record. Weak tags (\`[n=1]\`, \`[INHERITED]\`, \`[HELD]\`) do not count here.`,
	)
	lines.push(`- **Untagged: ${t.untagged}** — no provenance of any kind. This is the dishonesty measure.`)
	if (t.decisionDangling > 0) {
		lines.push(
			`- **Dangling citations: ${t.decisionDangling}** — cite a decision id that does not resolve. Worse than silence: they read as provenance and are not.`,
		)
	}
	lines.push("")
	lines.push(
		`Scanned ${b.corpus.files} files, ${b.corpus.lines} lines, ${t.candidates} numeric literals, of which ${t.excluded} were excluded by a named rule (listed below, none silent).`,
	)
	lines.push("")
	lines.push(
		"**Read the fraction as a lower bound.** Exclusion rules are deliberately narrow: when it is unclear whether a number is structural or tunable it is counted, which inflates the denominator and pushes the fraction down. The tree is at least this honest, never less.",
	)
	lines.push("")

	lines.push("## Corpus")
	lines.push("")
	lines.push("| language | files | lines | parser fidelity |")
	lines.push("|---|---:|---:|---|")
	for (const [lang, v] of Object.entries(b.corpus.byLanguage).sort()) {
		lines.push(`| ${lang} | ${v.files} | ${v.lines} | ${v.fidelity} |`)
	}
	lines.push("")

	lines.push("## Provenance of the tunable sites")
	lines.push("")
	lines.push("| tag | count | anchor strength |")
	lines.push("|---|---:|---|")
	for (const tag of PROVENANCE_TAGS) {
		lines.push(`| \`[${tag}]\` | ${b.byTag[tag]} | ${TAG_ANCHOR_STRENGTH[tag]} |`)
	}
	lines.push(`| decision record, resolved | ${t.decisionTraced} | anchored |`)
	lines.push(`| decision record, dangling | ${t.decisionDangling} | unanchored |`)
	lines.push(`| **untagged** | **${t.untagged}** | unanchored |`)
	lines.push("")
	lines.push(
		`Decision citations resolve to ${b.decisionCitations.recheckable} machine-recheckable records (non-empty \`fundedBy\`) and ${b.decisionCitations.conversational} reviewer-conversational ones (empty \`fundedBy\`, which \`CONVENTIONS.md\` calls the honest form for a verbal ruling). Both are human-anchored; only the first can ever be re-verified.`,
	)
	lines.push("")
	lines.push(
		`**How the tags were attributed:** ${b.tagAttribution.leading} from the site's own doc comment, ${b.tagAttribution.trailing} from a trailing same-line comment, ${b.tagAttribution["shared-doc-block"]} inherited from an adjacent declaration's doc block. That last number is the instrument's weakest inference — discount it if you are being strict.`,
	)
	lines.push("")

	lines.push("## Per working area")
	lines.push("")
	lines.push(
		"One row per top-level directory under a scan root — the granularity `CONVENTIONS.md` assigns ownership at, so each row has exactly one owner. **Gate** says what a growth in `untagged` means: `GATED` areas fail the local growth test (`tests/honesty-area-growth.test.ts`) when the count rises, `INFORMATIONAL` areas are reported and never fail anything. Phase 0 sets every area informational — the machinery is live, the gating is opt-in, one word per area in `src/honesty/areas.ts`.",
	)
	lines.push("")
	lines.push("| area | gate | workstream | files | tunable | documented | untagged | documented % |")
	lines.push("|---|---|---|---:|---:|---:|---:|---:|")
	for (const row of b.byArea) {
		const area = row.configured ? `\`${row.area}\`` : `\`${row.area}\` ⚠️`
		lines.push(
			`| ${area} | ${row.gate} | ${row.workstream} | ${row.files} | ${row.tunableSites} | ${row.documented} | ${row.untagged} | ${pct(row.documentedFraction)} |`,
		)
	}
	lines.push("")
	const unconfigured = b.byArea.filter((r) => !r.configured)
	if (unconfigured.length > 0) {
		lines.push(
			`⚠️ ${unconfigured.length} area(s) are not listed in \`src/honesty/areas.ts\`: ${unconfigured
				.map((r) => `\`${r.area}\``)
				.join(", ")}. A directory appeared under a scan root without anyone deciding which workstream owns it or whether it should be gated.`,
		)
		lines.push("")
	}

	lines.push("## Exclusions — every rule, every count")
	lines.push("")
	lines.push("No literal is dropped silently. A site records exactly one rule, so these sum to the excluded total.")
	lines.push("")
	lines.push("| rule | count | why this is not a tunable |")
	lines.push("|---|---:|---|")
	for (const rule of b.exclusions) {
		lines.push(`| \`${rule.id}\` | ${rule.count} | ${rule.rationale} |`)
	}
	lines.push("")
	if (b.skippedFiles.length > 0) {
		const reasons = new Map<string, number>()
		for (const s of b.skippedFiles) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
		lines.push(
			`Whole files skipped: ${b.skippedFiles.length} — ${[...reasons]
				.sort()
				.map(([reason, n]) => `${n} ${reason}`)
				.join(", ")}. Full list under \`body.skippedFiles\`.`,
		)
		lines.push("")
	}

	lines.push("## The ten worst untagged sites")
	lines.push("")
	lines.push(
		"Ranked by a documented heuristic (`suspicion` in `classify.ts`): threshold shape, named-constant shape, oddly specific floats, epsilons, parameter defaults. It orders a worklist; it is not a measurement.",
	)
	lines.push("")
	lines.push("| # | site | value | name | score | line |")
	lines.push("|---:|---|---:|---|---:|---|")
	b.worstOffenders.forEach((e, i) => {
		const name = e.name ?? e.functionName ?? "—"
		const snippet = e.snippet.replace(/\|/g, "\\|").slice(0, SNIPPET_DISPLAY_WIDTH)
		lines.push(
			`| ${i + 1} | \`${e.file}:${e.line}\` | \`${e.value}\` | \`${name}\` | ${e.suspicion} | \`${snippet}\` |`,
		)
	})
	lines.push("")

	lines.push("## Where the untagged sites are")
	lines.push("")
	lines.push("Files with at least one untagged tunable site, worst first.")
	lines.push("")
	lines.push("| file | tunable | documented | untagged |")
	lines.push("|---|---:|---:|---:|")
	for (const row of [...b.byFile]
		.filter((r) => r.untagged > 0)
		.sort((a, b2) => b2.untagged - a.untagged || a.file.localeCompare(b2.file))
		.slice(0, FILE_TABLE_ROWS)) {
		lines.push(`| \`${row.file}\` | ${row.tunableSites} | ${row.documented} | ${row.untagged} |`)
	}
	lines.push("")
	lines.push(`Full list of all ${b.untagged.length} untagged sites with \`file:line\`: \`data/honesty/honesty-report.json\`, key \`body.untagged\`.`)
	lines.push("")

	lines.push("## What this instrument cannot see")
	lines.push("")
	for (const limitation of b.limitations) lines.push(`- ${limitation}`)
	lines.push("")

	return lines.join("\n")
}
