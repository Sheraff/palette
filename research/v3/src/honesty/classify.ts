/**
 * Policy for the parameter-honesty instrument: which numeric literals count as tunable sites, and
 * what provenance each one carries.
 *
 * This is the file to argue with. The scanners are syntax; everything judgmental lives here, every
 * rule is named, and `tests/honesty-classify.test.ts` pins each one by example.
 *
 * **Direction of error — the instrument's central honesty property.** Exclusion rules are
 * deliberately narrow. When it is unclear whether a literal is structural or tunable, it is
 * COUNTED. That inflates the denominator with some false positives, which pushes the headline
 * fraction DOWN. The metric is therefore a *lower bound* on parameter honesty: the real system is
 * at least this honest, never less. An instrument that erred the other way could be gamed by
 * broadening an exclusion, and would report a system as clean by looking away.
 *
 * **Protection.** Two flags make a literal immune to the context-shaped exclusions: it is an
 * operand of a comparison (the literal shape of a threshold), or it names a SCREAMING_CASE
 * constant (this repo's marker for a policy knob). Structural exclusions that do not depend on
 * context — fixture modules, colorimetric spec constants, version identifiers — still apply,
 * because those are about *what the number is*, not about where it happens to sit.
 */

import type {
	Candidate,
	ContextFlag,
	ExclusionRule,
	Provenance,
	ProvenanceTag,
	Site,
} from "./types.ts"
import { PROVENANCE_TAGS } from "./types.ts"

/**
 * Flags that defeat the context-shaped exclusions below.
 *
 * `[REVIEWED]` — the two shapes this campaign treats as self-evidently tunable: a comparison
 * operand is a threshold by construction, and `CONVENTIONS.md` makes a named SCREAMING_CASE
 * constant the repo's declared form for a policy value. If either is present, a literal has to be
 * argued out of the count by something structural, not by where it sits.
 */
const PROTECTIVE_FLAGS: readonly ContextFlag[] = ["comparison-operand", "screaming-case-name"]

/**
 * Values that are unit conversions rather than choices — milliseconds per second, seconds per
 * minute, the 8-bit and 16-bit channel maxima, bytes per kibibyte.
 *
 * `[REVIEWED]` — arithmetic identities of the units involved. Changing 255 to 250 does not tune a
 * system, it breaks it. The scanners set `unit-conversion` only when such a value is an operand of
 * `*` or `/`; this list is duplicated here so the rule is legible in the policy file too.
 */
const UNIT_CONVERSION_VALUES = new Set([1000, 1e3, 1e6, 1e9, 60, 3600, 24, 255, 1024, 65535])

/**
 * Round numbers that carry no evidence of tuning.
 *
 * `[REVIEWED]` — used only to rank the untagged backlog, never to exclude anything. A threshold of
 * `0.5` is a coin flip or a midpoint and reads as a default; `0.37` reads as something someone
 * moved until the tests passed. This orders a worklist and is not a measurement.
 */
const ROUND_VALUES = new Set([0, 0.25, 0.5, 0.75, 1, 2, 3, 10, 100])

function has(candidate: Candidate, flag: ContextFlag): boolean {
	return candidate.flags.includes(flag)
}

function isProtected(candidate: Candidate): boolean {
	return PROTECTIVE_FLAGS.some((flag) => candidate.flags.includes(flag))
}

/** True when the snippet is asking "is this collection empty?" rather than comparing a magnitude. */
function comparesAgainstSize(candidate: Candidate): boolean {
	return /\.length\b|\.size\b|\blen\(|\.count\b|\.shape\b/.test(candidate.snippet)
}

/** True when the snippet is testing a not-found sentinel rather than a numeric bound. */
function comparesAgainstNotFound(candidate: Candidate): boolean {
	return /indexOf|lastIndexOf|findIndex|\.find\(|\.index\(/.test(candidate.snippet)
}

/**
 * The exclusion rules, in application order. First match wins, and a site records exactly one
 * rule, so the report's exclusion tally sums to the number of excluded candidates.
 *
 * Order matters twice: the structural rules (1-4) run before protection is consulted, and the
 * emptiness/sentinel rules run before the generic comparison protection would otherwise save a
 * `> 0` on an array length.
 */
export const EXCLUSION_RULES: readonly (ExclusionRule & {
	applies: (candidate: Candidate) => boolean
	/** Structural rules ignore protection: they are about what the number IS. */
	structural: boolean
})[] = [
	{
		id: "fixture-module",
		rationale:
			"The file is a fixture or test-support module. Its numbers are data under test, not policy the system runs on; they are pinned deliberately and changing one is a test edit, not a retuning.",
		structural: true,
		applies: (c) => has(c, "fixture-module"),
	},
	{
		id: "colorimetric-spec",
		rationale:
			"A constant fixed by the sRGB or OKLab specification (0.04045, 12.92, 1.055, 2.4, 0.0031308, and the OKLab matrices). There is nothing to calibrate and no provenance question to answer. This is the one exemption src/contract/constants.ts declares in its own header, and contract-color.test.ts verifies the conversions against colorjs.io rather than against a chosen value.",
		structural: true,
		applies: (c) => has(c, "colorimetric-spec"),
	},
	{
		id: "version-literal",
		rationale:
			"Part of a version or schema-version identifier. It labels a thing rather than shaping behaviour; CONVENTIONS tags these [HELD] precisely because they are identifiers, not measurements.",
		structural: true,
		applies: (c) => has(c, "version-literal"),
	},
	{
		id: "exit-code",
		rationale:
			"A process exit code. It is an operating-system protocol value, not a parameter of the algorithm.",
		structural: true,
		applies: (c) => has(c, "exit-code"),
	},
	{
		id: "http-status",
		rationale:
			"An HTTP status code. Fixed by RFC 9110; the choice of which status to send is logic, but the number itself is not tunable. Covers the review server's own respond(res, status, ...) helper as well as the writeHead/statusCode shapes the scanner recognises directly.",
		structural: true,
		applies: (c) =>
			has(c, "http-status") ||
			(Number.isInteger(c.value) &&
				c.value >= 100 &&
				c.value <= 599 &&
				has(c, "call-argument") &&
				// respond, respondJson, respondText, … — the review server's response helpers.
				/^(respond([A-Z]\w*)?|writeHead|sendStatus|status)$/.test(c.enclosing.name ?? "")),
	},
	{
		id: "emptiness-comparison",
		rationale:
			"A 0 or 1 compared against a collection's length/size/shape — 'is it empty?', not a magnitude threshold. Listed before the comparison protection, which would otherwise rescue every `xs.length > 0`.",
		structural: true,
		applies: (c) =>
			has(c, "comparison-operand") &&
			(c.value === 0 || c.value === 1) &&
			Number.isInteger(c.value) &&
			comparesAgainstSize(c),
	},
	{
		id: "not-found-sentinel",
		rationale:
			"A -1 compared against the result of indexOf/findIndex/.index() — the language's not-found sentinel, not a bound anyone chose.",
		structural: true,
		applies: (c) => c.value === -1 && has(c, "comparison-operand") && comparesAgainstNotFound(c),
	},
	{
		id: "index-access",
		rationale:
			"An integer subscript: xs[0], argv[2]. It selects a position in a structure. The structure's shape may be a design choice, but the index is not a value anyone tunes.",
		structural: false,
		applies: (c) => has(c, "index-access") && Number.isInteger(c.value),
	},
	{
		id: "loop-header",
		rationale:
			"An integer in a for/while header — the counter's origin, bound, or step. Iteration mechanics, not policy.",
		structural: false,
		applies: (c) => has(c, "loop-header") && Number.isInteger(c.value),
	},
	{
		id: "accumulator-init",
		rationale:
			"A 0 or 1 initializing a mutable accumulator (`let n = 0`). The arithmetic identity a running total starts from. Restricted to 0 and 1 on purpose: `let threshold = 0.7` is a mutable knob and stays counted.",
		structural: false,
		applies: (c) => has(c, "accumulator-init") && (c.value === 0 || c.value === 1),
	},
	{
		id: "counter-increment",
		rationale:
			"A 1 in a compound assignment that steps a counter (n += 1, n -= 1). Nobody tunes an increment; it is the arithmetic of counting. Matched on the source line rather than a scanner flag, so it is restricted to the literal 1 to keep the match unambiguous.",
		structural: false,
		applies: (c) =>
			Math.abs(c.value) === 1 && /(\+\+|--|[+\-*/]=\s*1\s*$|[+\-*/]=\s*1\b)/.test(c.snippet),
	},
	{
		id: "unit-conversion",
		rationale:
			"A multiply or divide by a unit constant — ms per second, seconds per minute, the 8-bit channel maximum, bytes per KiB. An identity of the units, not a choice.",
		structural: false,
		applies: (c) => has(c, "unit-conversion") && UNIT_CONVERSION_VALUES.has(Math.abs(c.value)),
	},
	{
		id: "unit-clamp",
		rationale:
			"A 0 or 1 acting as the bound of a clamp into the unit interval. The range is the quantity's definition, not a tuned limit.",
		structural: false,
		applies: (c) => has(c, "unit-clamp") && (c.value === 0 || c.value === 1),
	},
	{
		id: "display-format",
		rationale:
			"A digit count or width for output formatting: toFixed(2), padStart(3), a round() feeding a print. It changes what a human reads, never what the system computes.",
		structural: false,
		applies: (c) => has(c, "display-format"),
	},
	{
		id: "display-interpolation",
		rationale:
			"A literal inside a template literal, f-string, or print — text assembly. Note this rule is narrow: a comparison inside an interpolation keeps its protection and stays counted.",
		structural: false,
		applies: (c) => has(c, "display-interpolation"),
	},
	{
		id: "slice-origin",
		rationale:
			"A 0 as the start argument of slice/substring/splice — 'from the beginning'. The LENGTH argument of the same call is not excluded: a hash prefix length is a real choice.",
		structural: false,
		applies: (c) =>
			c.value === 0 &&
			has(c, "call-argument") &&
			/\b(slice|substring|substr|splice)\b/.test(c.enclosing.name ?? ""),
	},
]

/** Returns the id of the first rule that excludes this candidate, or null if it is a tunable site. */
export function excludedBy(candidate: Candidate): string | null {
	const shielded = isProtected(candidate)
	for (const rule of EXCLUSION_RULES) {
		if (!rule.structural && shielded) continue
		if (rule.applies(candidate)) return rule.id
	}
	return null
}

/**
 * Matches a CONVENTIONS provenance tag anywhere in a comment.
 *
 * Written from `PROVENANCE_TAGS` so the two can never drift. `n=1` contains a regex-significant
 * character, hence the escape.
 */
const TAG_PATTERN = new RegExp(
	`\\[(${PROVENANCE_TAGS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\]`,
)

/**
 * Matches a decision record id. Ids are dated and slugged and may contain dots
 * (`d-2026-08-03-sam-concept-set-v2.1-barcode`).
 *
 * Every segment is alphanumeric and segments are joined by `-` or `.`, so the match always ENDS on
 * an alphanumeric. That matters: a citation at the end of a sentence ("per d-2026-08-03-thing.")
 * would otherwise absorb the full stop and fail to resolve, silently downgrading a correctly cited
 * site to `decision-dangling`.
 */
const DECISION_PATTERN = /\bd-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:[.-][a-z0-9]+)*/

/** Decision ids that exist, mapped to whether their `fundedBy` is machine-recheckable. */
export type DecisionIndex = Map<string, "recheckable" | "conversational">

/**
 * Builds the decision index from a parsed `data/decisions/decisions.json`.
 *
 * `fundedBy` holds warehouse record ids and nothing else, so a non-empty `fundedBy` means
 * `warehouse recheck --decisions` can re-verify the evidence. An empty `fundedBy` is the honest
 * record of a ruling the reviewer gave conversationally (`CONVENTIONS.md`) — human-anchored, but
 * no machine can ever re-check it. The instrument reports the two separately and counts both as
 * anchored.
 */
export function buildDecisionIndex(parsed: unknown): DecisionIndex {
	const index: DecisionIndex = new Map()
	const container = parsed as { decisions?: unknown } | unknown[]
	const records = Array.isArray(container)
		? container
		: Array.isArray(container?.decisions)
			? container.decisions
			: []
	for (const record of records as { id?: unknown; fundedBy?: unknown }[]) {
		if (typeof record?.id !== "string") continue
		const funded = Array.isArray(record.fundedBy) && record.fundedBy.length > 0
		index.set(record.id, funded ? "recheckable" : "conversational")
	}
	return index
}

/**
 * Reads a site's provenance out of its comments.
 *
 * Comments arrive nearest-first, so the first tag found is the most specific one. A tag beats a
 * decision citation: the tag is what CONVENTIONS actually requires, and a site carrying both is
 * tagged with a citation attached rather than merely traceable.
 */
export function provenanceOf(candidate: Candidate, decisions: DecisionIndex): Provenance {
	let decisionId: string | null = null

	for (const block of candidate.comments) {
		const tagMatch = TAG_PATTERN.exec(block.text)
		const idMatch = DECISION_PATTERN.exec(block.text)
		if (idMatch && decisionId === null) decisionId = idMatch[0]

		if (tagMatch) {
			return {
				kind: "tagged",
				tag: tagMatch[1] as ProvenanceTag,
				decisionId,
				decisionFunding: decisionId ? (decisions.get(decisionId) ?? null) : null,
				source: block.source,
			}
		}
	}

	if (decisionId !== null) {
		const funding = decisions.get(decisionId)
		const source =
			candidate.comments.find((b) => DECISION_PATTERN.test(b.text))?.source ?? null
		return funding
			? { kind: "decision-traced", tag: null, decisionId, decisionFunding: funding, source }
			: // A citation that does not resolve is worse than silence: it reads as provenance and
				// is not. Broken out so a typo'd or retracted id cannot pass as an anchor.
				{ kind: "decision-dangling", tag: null, decisionId, decisionFunding: null, source }
	}

	return { kind: "untagged", tag: null, decisionId: null, decisionFunding: null, source: null }
}

/**
 * Weights for the untagged-backlog ranking.
 *
 * `[UNCALIBRATED]` — my judgment about which shapes most often turn out to be real tuned
 * parameters, set while writing this instrument and never validated against an outcome. Nothing
 * downstream may treat the resulting score as a measurement: it orders a worklist so a reader
 * starts at the most likely real parameters, and the honesty numbers themselves do not depend on
 * it. Calibrating it would mean labelling a sample of untagged sites by hand and checking the
 * ranking against that — worth doing only if the backlog gets worked through in score order.
 */
const SUSPICION_WEIGHTS = {
	/** Operand of a comparison — a threshold by construction. */
	comparisonOperand: 3,
	/** SCREAMING_CASE name — this repo's declared shape for a policy value. */
	screamingCaseName: 3,
	/** Any other named constant. */
	namedConstant: 2,
	/** Exponent-shaped: epsilons and tolerances are almost never structural. */
	exponential: 2,
	/** A float that is not a round default — a number someone moved until it worked. */
	oddFloat: 3,
	/** A float that IS a round default (0.5, 0.25) — reads as a placeholder, not a tuning. */
	roundFloat: 1,
	/** A default a caller is invited to disagree with; provenance matters most there. */
	parameterDefault: 2,
	/** Weight vectors and blend coefficients travel in threes. */
	numericSequence: 1,
	/**
	 * Penalty for a float-precision tolerance — a tiny magnitude in an `abs(...) < eps` shape.
	 *
	 * These are still counted as tunable sites (the denominator is unaffected): someone chose 1e-9
	 * over 1e-12 and behaviour changes if you move it. But their value comes from float precision
	 * rather than from data, so they are not where overfitting hides, and without this penalty they
	 * saturate the worklist — on the first real run, all ten top-ranked untagged sites were
	 * epsilons, which buries the policy thresholds a reader actually wants to see first.
	 */
	numericalTolerance: -3,
} as const

/**
 * Magnitude below which a literal in a tolerance idiom reads as float-precision rather than policy.
 *
 * `[UNCALIBRATED]` — 1e-4 is a round cut between "numerical slop" and "a small threshold someone
 * chose". Ranking only.
 */
const TOLERANCE_MAGNITUDE = 1e-4

/**
 * The `abs(x - y) < eps` / `isclose` / norm-check family.
 *
 * Deliberately matches the *idiom* and not the *name*: a named `EPS` constant is a value someone
 * chose and published, and it deserves provenance like any other named constant. What gets
 * down-ranked is the inline float-precision comparison, where the number is dictated by the
 * representation rather than by the problem.
 */
const TOLERANCE_IDIOM = /\babs\(|Math\.abs|isclose|allclose|\bnorm\b/i

/**
 * Orders the untagged backlog. Higher means look sooner.
 *
 * Ranks a worklist; not a measurement. See {@link SUSPICION_WEIGHTS}, which is `[UNCALIBRATED]`.
 */
export function suspicionOf(candidate: Candidate): number {
	const w = SUSPICION_WEIGHTS
	let score = 0
	const magnitude = Math.abs(candidate.value)

	if (has(candidate, "comparison-operand")) score += w.comparisonOperand
	if (has(candidate, "screaming-case-name")) score += w.screamingCaseName
	else if (has(candidate, "named-constant")) score += w.namedConstant
	if (has(candidate, "exponential")) score += w.exponential
	if (has(candidate, "float")) {
		score += ROUND_VALUES.has(magnitude) ? w.roundFloat : w.oddFloat
	}
	if (has(candidate, "parameter-default")) score += w.parameterDefault
	if (has(candidate, "in-numeric-sequence")) score += w.numericSequence
	if (magnitude > 0 && magnitude < TOLERANCE_MAGNITUDE && TOLERANCE_IDIOM.test(candidate.snippet)) {
		score += w.numericalTolerance
	}

	return Math.max(0, score)
}

/** Applies exclusions, provenance, and ranking to every candidate. Pure; order-preserving. */
export function classify(candidates: readonly Candidate[], decisions: DecisionIndex): Site[] {
	return candidates.map((candidate) => ({
		...candidate,
		excludedBy: excludedBy(candidate),
		provenance: provenanceOf(candidate, decisions),
		suspicion: suspicionOf(candidate),
	}))
}
