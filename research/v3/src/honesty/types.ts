/**
 * Shared vocabulary for the parameter-honesty instrument.
 *
 * The instrument answers one question: **how many numbers in `research/v3/src` and
 * `research/v3/oracle` could be changed to change the system's behaviour, and how many of those
 * carry a provenance story?** `V3_PLAN.md` §1 makes parameter honesty one of v3's three success
 * criteria, defined against v2-3's ~900 tunable sites justified by 11 human anchors. Nothing
 * measured it until this file existed.
 *
 * The pipeline is deliberately split in three so that policy lives in exactly one place:
 *
 *   1. **Scanners** (`scan-ts.ts`, `scan-py.ts`) are purely syntactic. They find numeric literals
 *      and describe *where they sit* via {@link ContextFlag}s. A scanner never decides whether
 *      something is a tunable.
 *   2. **Policy** (`classify.ts`) turns flags + value into an exclusion verdict and a provenance
 *      verdict. Every rule is named, every exclusion is counted and listed. One file, one test.
 *   3. **Report** (`report.ts`) emits deterministic JSON + Markdown.
 *
 * This split is what makes the exclusions auditable: a reader who disagrees with the instrument
 * argues with `classify.ts` alone, and `honesty-classify.test.ts` pins every rule by example.
 */

/** The provenance markers `CONVENTIONS.md` requires on every named constant. */
export const PROVENANCE_TAGS = [
	"REVIEWED",
	"MEASURED",
	"n=1",
	"INHERITED",
	"UNCALIBRATED",
	"HELD",
] as const

export type ProvenanceTag = (typeof PROVENANCE_TAGS)[number]

/**
 * How strongly a tag anchors a value to something outside the author's judgment.
 *
 * `[REVIEWED]` and `[MEASURED]` are anchors: a human ruled, or data said so. `[n=1]`,
 * `[INHERITED]` and `[HELD]` are weak — real provenance, but the value is one observation, a
 * carry-over from v2-3, or a placeholder. `[UNCALIBRATED]` is the author admitting there is no
 * anchor at all, which is honest labelling of an unanchored value, not an anchor.
 *
 * `[UNCALIBRATED]` scoring as unanchored is the one judgment call in this mapping. It is
 * deliberate: an instrument that let `[UNCALIBRATED]` count toward the headline would report a
 * system as honest for admitting it is untuned, and the headline is meant to fall when that
 * happens. Both numbers are published so a reader can re-slice.
 */
export const TAG_ANCHOR_STRENGTH: Record<ProvenanceTag, "anchored" | "weak" | "unanchored"> = {
	REVIEWED: "anchored",
	MEASURED: "anchored",
	"n=1": "weak",
	INHERITED: "weak",
	HELD: "weak",
	UNCALIBRATED: "unanchored",
}

/**
 * Syntactic facts a scanner reports about where a literal sits. Flags are evidence, not verdicts:
 * `classify.ts` decides what they mean. Some drive exclusions, some drive the suspicion ranking,
 * and a few do both.
 */
export type ContextFlag =
	/** Literal is a subscript: `xs[0]`, `argv[2]`, `groups[i + 1]`. */
	| "index-access"
	/** Literal is in a `for` header — initializer, condition, or update. */
	| "loop-header"
	/** Literal initializes a mutable accumulator: `let n = 0`, `total = 0`. */
	| "accumulator-init"
	/** Argument to `process.exit` / `sys.exit`, or assigned to `process.exitCode`. */
	| "exit-code"
	/** Argument to a formatting call: `toFixed`, `toPrecision`, `padStart`, `padEnd`, `repeat`, `round` inside an f-string, `toString(radix)`. */
	| "display-format"
	/** Literal appears inside a template literal / f-string / string concatenation used for output. */
	| "display-interpolation"
	/** Operand of `*` or `/` against a unit constant (1000 ms, 60 s, 255 8-bit, 1024 bytes). */
	| "unit-conversion"
	/** `0` / `1` acting as clamp bounds in `Math.max(0, Math.min(1, x))` or `np.clip(x, 0, 1)`. */
	| "unit-clamp"
	/** A constant fixed by the sRGB or OKLab specification — the exemption `src/contract/constants.ts` declares in its header. */
	| "colorimetric-spec"
	/** HTTP status code in a server response. */
	| "http-status"
	/** Part of a version identifier or schema version. */
	| "version-literal"
	/** The file is a fixture / test-support module: its numbers are data under test, not policy. */
	| "fixture-module"
	/** Literal is an operand of a comparison (`<`, `>`, `<=`, `>=`, `===`, `!==`) — the classic threshold shape. */
	| "comparison-operand"
	/** Literal initializes a named constant (`const X = …`, module-level `X = …` in Python). */
	| "named-constant"
	/** The constant's name is SCREAMING_SNAKE_CASE — the repo's marker for a policy knob. */
	| "screaming-case-name"
	/** Literal is a default value for a function parameter or a CLI flag default. */
	| "parameter-default"
	/** Non-integer literal. */
	| "float"
	/** Literal written in exponential form (`1e-6`) — almost always an epsilon or a tolerance. */
	| "exponential"
	/** Literal is negative (the scanner folds unary minus into the site). */
	| "negative"
	/** Literal sits inside an array or tuple of three or more numbers — a matrix row, a colour, a weight vector. */
	| "in-numeric-sequence"
	/** Literal is an argument to a call (with `enclosing.name` naming the callee). */
	| "call-argument"

/**
 * Where a comment sits relative to the literal it might document.
 *
 * `trailing` — same line as the governing statement.
 * `leading` — the statement's own doc block (JSDoc, `#` block, or a Python docstring).
 * `shared-doc-block` — the doc block of an *adjacent preceding* declaration, inherited because the
 * real code shares one comment across consecutive constants (`MIN_GRADIENT_STOPS` /
 * `MAX_GRADIENT_STOPS` in `src/contract/constants.ts`). This is an inference, not a fact: the
 * report counts these separately so a reader can discount them.
 */
export type CommentSource = "trailing" | "leading" | "shared-doc-block"

export interface CommentBlock {
	source: CommentSource
	/** Raw comment text, delimiters and `*` prefixes included. `classify.ts` only greps it. */
	text: string
}

/**
 * A numeric literal as found by a scanner, before any policy is applied.
 *
 * `line` and `column` are 1-based so they paste into an editor. `file` is POSIX-relative to
 * `research/v3` so the report is portable and diffable across machines.
 */
export interface Candidate {
	/** POSIX path relative to `research/v3`, e.g. `src/contract/constants.ts`. */
	file: string
	/** 1-based. */
	line: number
	/** 1-based. */
	column: number
	/** Numeric value, with any folded unary minus applied. `NaN` never appears. */
	value: number
	/** The literal exactly as written (`0.04045`, `1e-6`, `0x10`), sans folded sign. */
	text: string
	language: "ts" | "py"
	enclosing: {
		/**
		 * What syntactic slot the literal fills. `const` / `let` / `var` / `property` /
		 * `parameter-default` / `call-argument` / `return` / `assignment` / `expression`.
		 */
		kind: string
		/** Name of the constant, property, or callee when there is one. */
		name: string | null
		/** Enclosing function or method name, when there is one. */
		functionName: string | null
	}
	/** The source line, trimmed and capped at 200 chars, for the report's offender table. */
	snippet: string
	/**
	 * Comment text that could carry this site's provenance tag, nearest first. `classify.ts`
	 * searches these in order and stops at the first tag, then records which one supplied it —
	 * so the report can show how many tags are attributed by the generous `shared-doc-block`
	 * rule, which is this instrument's own weakest inference.
	 */
	comments: CommentBlock[]
	flags: ContextFlag[]
}

/**
 * How the scanner reached its candidates. Recorded per file and summarised in the report, because
 * a lexical scan can be fooled in ways an AST scan cannot, and a reader is entitled to know which
 * half of the corpus carries which risk.
 */
export type ParserFidelity = "ast" | "lexical"

export interface ScannedFile {
	file: string
	language: "ts" | "py"
	fidelity: ParserFidelity
	/** Total physical lines, for the report's density figures. */
	lines: number
	candidates: Candidate[]
}

/** A named exclusion rule. Every excluded site names exactly one. */
export interface ExclusionRule {
	id: string
	/** One plain sentence: what this drops, and why that is not a tunable. */
	rationale: string
}

export type ProvenanceKind =
	/** An adjacent comment carries a `CONVENTIONS.md` tag. */
	| "tagged"
	/** An adjacent comment cites a decision record id that exists in `data/decisions/decisions.json`. */
	| "decision-traced"
	/** An adjacent comment cites a decision record id that does **not** resolve. A dangling citation is worse than silence: it looks like provenance and is not. */
	| "decision-dangling"
	/** Nothing. This is the dishonesty measure. */
	| "untagged"

export interface Provenance {
	kind: ProvenanceKind
	tag: ProvenanceTag | null
	/** Decision record id, when cited. */
	decisionId: string | null
	/**
	 * For a resolved decision: `recheckable` when its `fundedBy` names warehouse records a tool can
	 * re-verify, `conversational` when `fundedBy` is empty — the honest record of a ruling no
	 * machine can ever re-check (`CONVENTIONS.md`). Both are human-anchored; only one is auditable.
	 */
	decisionFunding: "recheckable" | "conversational" | null
	/** Which comment in `Candidate.comments` supplied the tag; `null` when untagged. */
	source: CommentSource | null
}

/** A candidate after policy: either excluded, or a counted tunable site with a provenance verdict. */
export interface Site extends Candidate {
	/** Non-null means this is not counted as a tunable. */
	excludedBy: string | null
	provenance: Provenance
	/**
	 * Ranking heuristic for the untagged backlog — higher means a reader should look sooner.
	 * Documented and pinned in `classify.ts`; it orders a worklist, it is not a measurement.
	 */
	suspicion: number
}
