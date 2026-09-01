/**
 * Python scanner for the parameter-honesty instrument.
 *
 * This is a hand-rolled **lexer**, not a parser: there is no Python AST available to a pure-Node
 * instrument, and shelling out to `python3` would make the metric depend on whatever interpreter
 * happens to be installed. So the fidelity this file reports is {@link ParserFidelity} `"lexical"`,
 * and the report publishes that distinction next to the TypeScript scanner's `"ast"`.
 *
 * What "lexical" buys us, and what it costs:
 *
 * - **Buys**: exact skipping of everything that is not code. Comments, all eight string forms, the
 *   literal text of f-strings and their format specs are tokenised correctly, so no number that is
 *   merely *printed* is ever counted as a tunable. This is the part that could silently corrupt the
 *   metric, and it is the part that is exact.
 * - **Costs**: every {@link ContextFlag} is a token-neighbourhood heuristic. Where a heuristic
 *   cannot be made reliable it is left unset rather than guessed — see the "KNOWN LIMITS" block at
 *   the bottom of this file, which the report quotes verbatim.
 *
 * The scanner never decides whether a literal is a tunable. It reports where the literal sits and
 * what comments could carry its provenance; `classify.ts` owns every verdict.
 */

import { readFileSync } from "node:fs"
import type { Candidate, CommentBlock, ContextFlag, ScannedFile } from "./types.ts"

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

interface Tok {
	kind: "num" | "name" | "op" | "str" | "comment" | "nl"
	/** Source text of the token. For strings this is the full literal including prefix and quotes. */
	text: string
	/** 1-based. */
	line: number
	/** 1-based. */
	col: number
	/** Numeric value for `num` tokens. Never `NaN` (non-finite literals are dropped, not emitted). */
	value?: number
	/** `num` emitted from inside an f-string `{…}` substitution — i.e. code, not display text. */
	interpolated?: boolean
}

/** Hard keywords. Used to tell `foo(` (a call) from `return (` (a tuple), and `xs[` from `in [`. */
const KEYWORDS = new Set([
	"False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
	"def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import",
	"in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while",
	"with", "yield",
])
// `match` / `case` are deliberately absent: they are soft keywords, and treating them as keywords
// would stop `re.match(pattern, 3)` from being recognised as a call.

/** Every string prefix Python accepts, lowercased. Checked case-insensitively. */
const STRING_PREFIXES = new Set(["", "r", "b", "u", "f", "br", "rb", "fr", "rf"])

/** Multi-character operators, longest first so the greedy match is correct. */
const MULTI_OPS = [
	"**=", "//=", ">>=", "<<=", "...",
	"!=", "==", "<=", ">=", "->", ":=", "//", "**", "<<", ">>",
	"+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "@=",
]

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9"
const isDigitOrUnderscore = (c: string | undefined): boolean => isDigit(c) || c === "_"
const isIdentStart = (c: string | undefined): boolean =>
	c !== undefined && (/[A-Za-z_]/.test(c) || c.charCodeAt(0) > 127)
const isIdentPart = (c: string | undefined): boolean =>
	c !== undefined && (/[A-Za-z0-9_]/.test(c) || c.charCodeAt(0) > 127)

class PyLexer {
	src: string
	i = 0
	line = 1
	col = 1
	tokens: Tok[] = []
	/** Depth of f-string substitution nesting. `> 0` means "the tokens we emit are interpolated". */
	fdepth = 0

	constructor(src: string) {
		this.src = src
	}

	advance(n = 1): void {
		for (let k = 0; k < n && this.i < this.src.length; k++) {
			if (this.src[this.i] === "\n") {
				this.line++
				this.col = 1
			} else {
				this.col++
			}
			this.i++
		}
	}

	push(kind: Tok["kind"], text: string, line: number, col: number, extra?: Partial<Tok>): Tok {
		const tok: Tok = { kind, text, line, col, ...extra }
		// Newlines inside an f-string substitution are not statement terminators: a triple-quoted
		// f-string can carry a multi-line expression, and emitting a `nl` there would split one
		// logical line in two.
		if (kind === "nl" && this.fdepth > 0) return tok
		this.tokens.push(tok)
		return tok
	}

	run(): Tok[] {
		while (this.i < this.src.length) {
			if (!this.scanOne()) break
		}
		return this.tokens
	}

	/** Consumes exactly one token (or one run of insignificant characters). */
	scanOne(): boolean {
		const src = this.src
		const c = src[this.i]
		if (c === undefined) return false

		if (c === "\n") {
			this.push("nl", "\n", this.line, this.col)
			this.advance()
			return true
		}
		if (c === "\r" || c === " " || c === "\t" || c === "\f" || c === "\v") {
			this.advance()
			return true
		}
		if (c === "\\") {
			// Explicit line continuation: backslash immediately before a newline joins the lines,
			// so no `nl` token is emitted. A stray backslash elsewhere is a syntax error; skip it.
			let j = this.i + 1
			if (src[j] === "\r") j++
			if (src[j] === "\n") {
				this.advance(j - this.i + 1)
				return true
			}
			this.advance()
			return true
		}
		if (c === "#") {
			const line = this.line
			const col = this.col
			const start = this.i
			while (this.i < src.length && src[this.i] !== "\n") this.advance()
			this.push("comment", src.slice(start, this.i).trimEnd(), line, col)
			return true
		}
		if (c === '"' || c === "'") {
			this.scanString("", false, false)
			return true
		}
		if (isIdentStart(c)) {
			const line = this.line
			const col = this.col
			const start = this.i
			while (isIdentPart(src[this.i])) this.advance()
			const word = src.slice(start, this.i)
			const next = src[this.i]
			if ((next === '"' || next === "'") && STRING_PREFIXES.has(word.toLowerCase())) {
				const lower = word.toLowerCase()
				this.scanString(word, lower.includes("r"), lower.includes("f"), line, col)
				return true
			}
			this.push("name", word, line, col)
			return true
		}
		if (isDigit(c) || (c === "." && isDigit(src[this.i + 1]))) {
			// A digit preceded by an identifier character is part of that identifier (`sha256`,
			// `x2`, `v3_thing`). The greedy identifier scan above already consumed those, so
			// reaching here with an identifier character behind us means something went wrong;
			// treat it as identifier continuation rather than emit a phantom literal.
			if (this.i > 0 && isIdentPart(src[this.i - 1])) {
				while (isIdentPart(src[this.i])) this.advance()
				return true
			}
			this.scanNumber()
			return true
		}
		// Operators and punctuation.
		const line = this.line
		const col = this.col
		for (const op of MULTI_OPS) {
			if (src.startsWith(op, this.i)) {
				this.advance(op.length)
				this.push("op", op, line, col)
				return true
			}
		}
		this.advance()
		this.push("op", c, line, col)
		return true
	}

	scanNumber(): void {
		const src = this.src
		const line = this.line
		const col = this.col
		const start = this.i
		let imaginary = false

		const radixMarker = src[this.i] === "0" ? (src[this.i + 1] ?? "").toLowerCase() : ""
		if (radixMarker === "x" || radixMarker === "o" || radixMarker === "b") {
			const digits =
				radixMarker === "x" ? /[0-9a-fA-F_]/ : radixMarker === "o" ? /[0-7_]/ : /[01_]/
			this.advance(2)
			while (this.i < src.length && digits.test(src[this.i]!)) this.advance()
		} else {
			while (isDigitOrUnderscore(src[this.i])) this.advance()
			if (src[this.i] === ".") {
				this.advance()
				while (isDigitOrUnderscore(src[this.i])) this.advance()
			}
			const e = src[this.i]
			if (
				(e === "e" || e === "E") &&
				(isDigit(src[this.i + 1]) ||
					((src[this.i + 1] === "+" || src[this.i + 1] === "-") && isDigit(src[this.i + 2])))
			) {
				this.advance()
				if (src[this.i] === "+" || src[this.i] === "-") this.advance()
				while (isDigitOrUnderscore(src[this.i])) this.advance()
			}
			if (src[this.i] === "j" || src[this.i] === "J") {
				imaginary = true
				this.advance()
			}
		}

		const text = src.slice(start, this.i)
		// Imaginary literals have no real-valued `value`, and `Candidate.value` promises a number.
		// They are dropped entirely rather than mis-reported; none exist in this corpus.
		if (imaginary) return
		const value = Number(text.replace(/_/g, ""))
		if (!Number.isFinite(value)) return
		this.push("num", text, line, col, { value, interpolated: this.fdepth > 0 })
	}

	/**
	 * Scans one string literal. The token carries the full literal text (prefix, quotes and all).
	 * For an f-string the token is emitted *first* and the tokens of its `{…}` substitutions follow,
	 * which keeps substitution brackets in the enclosing statement's bracket stack where they belong.
	 */
	scanString(prefix: string, raw: boolean, isF: boolean, atLine?: number, atCol?: number): void {
		const src = this.src
		const line = atLine ?? this.line
		const col = atCol ?? this.col
		const start = this.i - prefix.length
		const q = src[this.i]!
		const quote = src.startsWith(q + q + q, this.i) ? q + q + q : q
		const triple = quote.length === 3
		this.advance(quote.length)
		const tok = this.push("str", "", line, col)

		while (this.i < src.length) {
			const c = src[this.i]
			if (c === "\\") {
				// Python's real raw-string rule: in a raw string the backslash is KEPT in the value
				// (it does not introduce an escape), but it STILL prevents the next character from
				// closing the string — `r"\""` is one complete string whose value is `\"`. So as far
				// as *termination* goes raw and non-raw behave identically, which is why this branch
				// deliberately does not consult `raw`.
				this.advance(2)
				continue
			}
			if (!triple && c === "\n") break // unterminated single-quoted string; be forgiving
			if (src.startsWith(quote, this.i)) {
				this.advance(quote.length)
				break
			}
			if (isF && c === "{") {
				if (src[this.i + 1] === "{") {
					this.advance(2)
					continue
				}
				this.advance()
				this.scanSubstitution()
				continue
			}
			if (isF && c === "}") {
				this.advance(src[this.i + 1] === "}" ? 2 : 1)
				continue
			}
			this.advance()
		}
		tok.text = src.slice(start, this.i)
	}

	/**
	 * Scans an f-string `{…}` substitution: everything up to the matching `}`, the `!r`/`!s`/`!a`
	 * conversion, or the `:` that starts a format spec. The expression is real code, so it is
	 * tokenised normally and any numbers in it are emitted with `interpolated: true`.
	 *
	 * Nested quotes inside the braces (`f"{d["k"]}"`, legal from Python 3.12) fall out of this
	 * naturally because the inner quote is scanned as a fresh string. LIMIT: only one level of
	 * *format-spec* nesting is walked (`f"{x:.{p}f}"` works, deeper nesting is treated as spec
	 * text), and the lexer accepts same-quote nesting that a pre-3.12 interpreter would reject —
	 * it over-accepts, which cannot invent literals, only fail to reject bad source.
	 */
	scanSubstitution(): void {
		const src = this.src
		this.fdepth++
		let depth = 0
		while (this.i < src.length) {
			const c = src[this.i]
			if (depth === 0) {
				if (c === "}") {
					this.advance()
					break
				}
				if (c === "!" && src[this.i + 1] !== "=") {
					// `!r` / `!s` / `!a` conversion; the `}` or `:` after it ends the expression.
					this.advance(2)
					continue
				}
				if (c === ":" && src[this.i + 1] !== "=") {
					this.advance()
					this.scanFormatSpec()
					break
				}
			}
			if (c === "(" || c === "[" || c === "{") depth++
			else if (c === ")" || c === "]" || c === "}") depth--
			if (!this.scanOne()) break
		}
		this.fdepth--
	}

	/**
	 * Consumes an f-string format spec (`f"{x:.2f}"`). The `2` there is display formatting, not a
	 * code literal, so nothing in here is emitted — except a nested `{…}` replacement, which is
	 * code (`f"{x:.{prec}f}"`).
	 */
	scanFormatSpec(): void {
		const src = this.src
		while (this.i < src.length) {
			const c = src[this.i]
			if (c === "}") {
				this.advance()
				return
			}
			if (c === "{") {
				this.advance()
				this.scanSubstitution()
				continue
			}
			this.advance()
		}
	}
}

// ---------------------------------------------------------------------------
// Statements and scopes
// ---------------------------------------------------------------------------

interface Scope {
	kind: "def" | "class"
	name: string
	indent: number
	awaitingDocstring: boolean
	docstring: string | null
}

interface Statement {
	/** Significant tokens (no comments, no newlines). */
	toks: Tok[]
	startLine: number
	endLine: number
	indent: number
	/** Enclosing scopes, innermost last. Held by reference so docstrings resolve after the walk. */
	scopes: Scope[]
	/** True when the first token chain is `name(.name)*` followed by `=` or `: T =`. */
	targetName: string | null
	/** Index in `toks` of the top-level `=` of an assignment, or `-1`. */
	eqIndex: number
	/** Index in `toks` of a `%` whose left operand is a string literal, or `-1`. */
	percentFormatIndex: number
	isDef: boolean
	isLoopHeader: boolean
	isReturn: boolean
	isPrintCall: boolean
}

/** Expands tabs to the next multiple of 8, as Python's tokenizer does, to get a comparable indent. */
function indentOf(lineText: string): number {
	let n = 0
	for (const ch of lineText) {
		if (ch === " ") n++
		else if (ch === "\t") n += 8 - (n % 8)
		else break
	}
	return n
}

function isNonKeywordName(tok: Tok | undefined): boolean {
	return tok !== undefined && tok.kind === "name" && !KEYWORDS.has(tok.text)
}

/** True when a `(` or `[` at this position opens a call / subscript rather than a tuple / list. */
function opensAccess(prev: Tok | undefined): boolean {
	if (prev === undefined) return false
	if (isNonKeywordName(prev)) return true
	return prev.kind === "op" && (prev.text === ")" || prev.text === "]")
}

/** Strips a Python string literal down to its content, for use as a dict key name. */
function stringContent(text: string): string {
	const m = /^[A-Za-z]{0,2}('''|"""|'|")([\s\S]*)\1$/.exec(text)
	return m ? m[2]! : text
}

function buildStatements(tokens: Tok[], lines: string[]): Statement[] {
	const statements: Statement[] = []
	const scopeStack: Scope[] = []
	let current: Tok[] = []
	let depth = 0

	const flush = (): void => {
		if (current.length === 0) return
		const toks = current
		current = []
		const startLine = toks[0]!.line
		const endLine = toks[toks.length - 1]!.line
		const indent = indentOf(lines[startLine - 1] ?? "")

		// Scope bookkeeping happens in statement order so `functionName` tracks the indent stack.
		while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1]!.indent >= indent) {
			scopeStack.pop()
		}
		const enclosing = scopeStack[scopeStack.length - 1]
		if (enclosing?.awaitingDocstring) {
			enclosing.awaitingDocstring = false
			// A scope's docstring is its first body statement, when that statement is nothing but
			// string literals (implicit concatenation included).
			if (toks.every((t) => t.kind === "str")) {
				enclosing.docstring = toks.map((t) => t.text).join("")
			}
		}

		let head = 0
		if (toks[head]?.kind === "name" && toks[head]!.text === "async") head++
		const headWord = toks[head]?.kind === "name" ? toks[head]!.text : ""
		const isDef = headWord === "def"
		if ((isDef || headWord === "class") && toks[head + 1]?.kind === "name") {
			const scope: Scope = {
				kind: isDef ? "def" : "class",
				name: toks[head + 1]!.text,
				indent,
				awaitingDocstring: true,
				docstring: null,
			}
			scopeStack.push(scope)
		}

		// Assignment shape: `name(.name)* [: T] = …` at bracket depth 0.
		let eqIndex = -1
		let d = 0
		for (let k = 0; k < toks.length; k++) {
			const t = toks[k]!
			if (t.kind !== "op") continue
			if (t.text === "(" || t.text === "[" || t.text === "{") d++
			else if (t.text === ")" || t.text === "]" || t.text === "}") d--
			else if (t.text === "=" && d === 0) {
				eqIndex = k
				break
			}
		}
		let targetName: string | null = null
		if (eqIndex > 0) {
			const parts: string[] = []
			let k = 0
			while (k < eqIndex) {
				const t = toks[k]!
				if (t.kind !== "name") break
				parts.push(t.text)
				k++
				if (toks[k]?.kind === "op" && toks[k]!.text === ".") {
					k++
					continue
				}
				break
			}
			// Either the chain runs straight into `=`, or an annotation (`: T`) sits between.
			if (parts.length > 0) {
				if (k === eqIndex) targetName = parts.join(".")
				else if (toks[k]?.kind === "op" && toks[k]!.text === ":") targetName = parts.join(".")
			}
		}

		let percentFormatIndex = -1
		for (let k = 1; k < toks.length; k++) {
			const t = toks[k]!
			if (t.kind === "op" && t.text === "%" && toks[k - 1]!.kind === "str") {
				percentFormatIndex = k
				break
			}
		}

		const first = toks[0]!
		statements.push({
			toks,
			startLine,
			endLine,
			indent,
			scopes: scopeStack.slice(),
			targetName,
			eqIndex,
			percentFormatIndex,
			isDef,
			isLoopHeader:
				first.kind === "name" &&
				(first.text === "for" ||
					first.text === "while" ||
					(first.text === "async" && toks[1]?.text === "for")),
			isReturn: first.kind === "name" && first.text === "return",
			isPrintCall:
				first.kind === "name" && first.text === "print" && toks[1]?.text === "(",
		})
	}

	for (const tok of tokens) {
		if (tok.kind === "comment") continue
		if (tok.kind === "nl") {
			if (depth === 0) flush()
			continue
		}
		if (tok.kind === "op") {
			if (tok.text === "(" || tok.text === "[" || tok.text === "{") depth++
			else if (tok.text === ")" || tok.text === "]" || tok.text === "}") depth = Math.max(0, depth - 1)
		}
		current.push(tok)
	}
	flush()
	return statements
}

// ---------------------------------------------------------------------------
// Flag vocabularies
// ---------------------------------------------------------------------------

/** Denominators that convert units rather than tune behaviour. */
const UNIT_VALUES = new Set([1000, 1e3, 1e6, 1e9, 60, 3600, 24, 255, 1024, 65535])

/** sRGB transfer-function constants — fixed by the specification, not by anyone's judgment. */
const COLORIMETRIC_VALUES = new Set([0.04045, 12.92, 1.055, 2.4, 0.0031308])

const CLAMP_CALLEES = new Set(["min", "max", "clip", "clamp"])
const EXIT_CALLEES = new Set(["exit", "_exit", "SystemExit"])
/** Calls whose numeric arguments format text for a human rather than steer computation. */
const DISPLAY_CALLEES = new Set(["format", "ljust", "rjust", "center", "zfill"])
const COMPARISON_OPS = new Set(["<", ">", "<=", ">=", "==", "!="])
const MULDIV_OPS = new Set(["*", "/", "//"])

interface Bracket {
	char: "(" | "[" | "{"
	/** `(` that follows a name/`)`/`]` — a call, not a tuple. */
	isCall: boolean
	/** `[` that follows a name/`)`/`]` — a subscript, not a list display. */
	isSubscript: boolean
	/** Dotted callee text for a call bracket. */
	callee: string | null
	/** Last dotted segment of `callee` (`np.clip` -> `clip`). */
	calleeLast: string | null
	/** The parameter list of the `def` this statement opens — shaped like a call, but it is not one. */
	isDefParams: boolean
	/** Commas seen directly at this depth, i.e. the index of the argument currently being scanned. */
	commas: number
	/** Indices into the file's candidate array for literals sitting directly at this depth. */
	members: number[]
}

// ---------------------------------------------------------------------------
// Comment attachment
// ---------------------------------------------------------------------------

/** The contiguous run of whole-line `#` comments immediately above `lineNo` (1-based). */
function leadingCommentBlock(lines: string[], lineNo: number): string[] {
	const out: string[] = []
	for (let n = lineNo - 1; n >= 1; n--) {
		const text = (lines[n - 1] ?? "").trim()
		if (!text.startsWith("#")) break
		out.unshift(text)
	}
	return out
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scans Python source for numeric literals.
 *
 * @param source Full file text.
 * @param relPath POSIX path relative to `research/v3`, used verbatim as `Candidate.file`.
 */
export function scanPythonSource(source: string, relPath: string): ScannedFile {
	const lines = source.split(/\r?\n/)
	const physicalLines = source === "" ? 0 : source.replace(/\r?\n$/, "").split(/\r?\n/).length
	const tokens = new PyLexer(source).run()

	// Trailing comments, keyed by physical line. A `#` inside a string never reaches this map
	// because the lexer consumed it as string content.
	const commentByLine = new Map<number, Tok>()
	for (const tok of tokens) {
		if (tok.kind === "comment" && !commentByLine.has(tok.line)) commentByLine.set(tok.line, tok)
	}
	const isWholeLineComment = (lineNo: number): boolean =>
		(lines[lineNo - 1] ?? "").trim().startsWith("#")

	const statements = buildStatements(tokens, lines)
	const basename = relPath.split("/").pop() ?? relPath
	const fixtureModule = basename === "conftest.py" || /fixture/i.test(basename)

	const candidates: Candidate[] = []

	for (let s = 0; s < statements.length; s++) {
		const stmt = statements[s]!
		const toks = stmt.toks
		const stack: Bracket[] = []

		// Statement-level comment attachment, computed once and shared by every literal in it.
		const stmtLeading = leadingCommentBlock(lines, stmt.startLine)
		const stmtTrailing =
			!isWholeLineComment(stmt.startLine) && commentByLine.has(stmt.startLine)
				? commentByLine.get(stmt.startLine)!.text
				: null
		const sharedBlock = ((): string[] => {
			// Shared-block rule: an undocumented assignment that sits directly under a documented
			// one inherits that block, walking back at most three adjacent assignments. This is how
			// `A = …` / `B = …` / `C = …` under one `# [MEASURED] …` header reads to a human.
			if (stmtLeading.length > 0 || stmtTrailing !== null) return []
			let prevIndex = s - 1
			for (let step = 0; step < 3 && prevIndex >= 0; step++, prevIndex--) {
				const prev = statements[prevIndex]!
				if (prev.endLine !== statements[prevIndex + 1]!.startLine - 1) break
				if (prev.eqIndex < 0) break
				const block = leadingCommentBlock(lines, prev.startLine)
				if (block.length > 0) return block
			}
			return []
		})()

		for (let k = 0; k < toks.length; k++) {
			const tok = toks[k]!

			if (tok.kind === "op") {
				if (tok.text === "(" || tok.text === "[" || tok.text === "{") {
					const prev = toks[k - 1]
					const access = opensAccess(prev)
					// `def f(…)` looks exactly like a call to a lexer. It is the parameter list, so it
					// is neither a call nor a numeric sequence.
					const isDefParams = stmt.isDef && tok.text === "(" && stack.length === 0
					let callee: string | null = null
					if (tok.text === "(" && access && !isDefParams && isNonKeywordName(prev)) {
						const parts: string[] = []
						let j = k - 1
						while (j >= 0 && toks[j]!.kind === "name") {
							parts.unshift(toks[j]!.text)
							if (toks[j - 1]?.kind === "op" && toks[j - 1]!.text === ".") j -= 2
							else break
						}
						callee = parts.join(".")
					}
					stack.push({
						char: tok.text as Bracket["char"],
						isCall: tok.text === "(" && access && !isDefParams,
						isSubscript: tok.text === "[" && access,
						callee,
						calleeLast: callee === null ? null : callee.split(".").pop()!,
						isDefParams,
						commas: 0,
						members: [],
					})
					continue
				}
				if (tok.text === ")" || tok.text === "]" || tok.text === "}") {
					const closed = stack.pop()
					if (closed !== undefined) {
						// A list display or a tuple holding three or more numbers is a matrix row, a
						// colour, or a weight vector. Call arguments and subscripts are excluded:
						// `range(0, 10, 2)` is not a numeric sequence in that sense.
						const eligible =
							(closed.char === "[" && !closed.isSubscript) ||
							(closed.char === "(" && !closed.isCall && !closed.isDefParams)
						if (eligible && closed.members.length >= 3) {
							for (const idx of closed.members) {
								candidates[idx]!.flags.push("in-numeric-sequence")
							}
						}
					}
					continue
				}
				if (tok.text === "," && stack.length > 0) {
					stack[stack.length - 1]!.commas++
					continue
				}
				continue
			}

			if (tok.kind !== "num") continue

			// --- unary minus folding -------------------------------------------------------
			// `-` is unary only when what precedes it cannot end an expression. `a - 1` keeps a
			// positive site; `x = -1`, `f(-1)`, `[-1]`, `return -1` and a line-initial `-1` fold.
			let negative = false
			const minus = toks[k - 1]
			if (minus?.kind === "op" && minus.text === "-") {
				const before = toks[k - 2]
				if (before === undefined) negative = true
				else if (before.kind === "op") negative = !(before.text === ")" || before.text === "]" || before.text === "}")
				else if (before.kind === "name") negative = KEYWORDS.has(before.text)
				// An f-string's `str` token is emitted just before the tokens of its substitutions,
				// so a `str` sitting behind the `-` of an interpolated literal (`f"{-11}"`) is that
				// artifact, not an operand. For a non-interpolated literal a preceding string really
				// is an operand (`"a" - 1`), so only the interpolated case folds.
				else if (before.kind === "str") negative = tok.interpolated === true
				else negative = false
			}

			const value = negative ? -tok.value! : tok.value!
			const top = stack[stack.length - 1]
			const flags: ContextFlag[] = []
			const add = (f: ContextFlag): void => {
				if (!flags.includes(f)) flags.push(f)
			}

			if (!Number.isInteger(value)) add("float")
			// `e` only means an exponent in a decimal literal; in `0x1e` it is a hex digit.
			if (/[eE]/.test(tok.text) && !/^0[xX]/.test(tok.text)) add("exponential")
			if (negative) add("negative")
			if (fixtureModule) add("fixture-module")
			if (COLORIMETRIC_VALUES.has(Math.abs(value))) add("colorimetric-spec")

			// Neighbouring tokens. The folded `-` is skipped so `x < -1` still reads as a comparison.
			const prevSig = negative ? toks[k - 2] : toks[k - 1]
			const nextSig = toks[k + 1]
			if (
				(prevSig?.kind === "op" && COMPARISON_OPS.has(prevSig.text)) ||
				(nextSig?.kind === "op" && COMPARISON_OPS.has(nextSig.text))
			) {
				add("comparison-operand")
			}
			if (
				UNIT_VALUES.has(Math.abs(value)) &&
				((prevSig?.kind === "op" && MULDIV_OPS.has(prevSig.text)) ||
					(nextSig?.kind === "op" && MULDIV_OPS.has(nextSig.text)))
			) {
				add("unit-conversion")
			}

			if (stmt.isLoopHeader) add("loop-header")
			if (tok.interpolated || stmt.isPrintCall || top?.calleeLast === "print") {
				add("display-interpolation")
			}

			// --- display formatting --------------------------------------------------------
			if (top?.isCall && top.calleeLast !== null && DISPLAY_CALLEES.has(top.calleeLast)) {
				add("display-format")
			}
			if (top?.isCall && top.calleeLast === "round" && top.commas === 1) {
				// IMPRECISE BY CONSTRUCTION: `round(x, 2)` is a display concern only when the result
				// is shown. With no AST we cannot follow the value, so the flag is set only when the
				// literal's own physical line also mentions `print`, an f-string, or `.format`.
				// Deliberately the LINE and not the whole statement: a `round(…, 4)` buried in a
				// multi-line dict that happens to contain an f-string elsewhere is not display code,
				// and this flag drives an exclusion, so a false positive erases a real tunable.
				if (/print|f"|f'|\.format/.test(lines[tok.line - 1] ?? "")) add("display-format")
			}
			if (stmt.percentFormatIndex >= 0 && k > stmt.percentFormatIndex) add("display-format")

			if (top?.isCall && top.calleeLast !== null && CLAMP_CALLEES.has(top.calleeLast)) {
				if (value === 0 || value === 1) add("unit-clamp")
			}
			if (top?.isCall && top.calleeLast !== null && EXIT_CALLEES.has(top.calleeLast)) {
				add("exit-code")
			}
			if (top?.char === "[" && top.isSubscript) add("index-access")

			if (
				Number.isInteger(value) &&
				value >= 100 &&
				value <= 599 &&
				// Same reasoning as `round` above: the literal's own line, not the whole statement.
				// `str(exc)[:500]` inside a dict that mentions `status` three lines up is a slice.
				/send_response|status|HTTPStatus/.test(lines[tok.line - 1] ?? "")
			) {
				add("http-status")
			}

			// --- syntactic slot ------------------------------------------------------------
			let kind = "expression"
			let name: string | null = null

			// Parameter default: inside the parameter list of the `def` this statement opens, with
			// an `=` between the parameter name and this literal at the same bracket depth.
			let paramName: string | null = null
			if (stmt.isDef && stack.length === 1 && top?.char === "(") {
				let j = negative ? k - 2 : k - 1
				let sawEq = false
				let depth = 0
				for (; j >= 0; j--) {
					const t = toks[j]!
					if (t.kind === "op") {
						if (t.text === ")" || t.text === "]" || t.text === "}") depth++
						else if (t.text === "(" || t.text === "[" || t.text === "{") {
							if (depth === 0) break
							depth--
						} else if (depth === 0 && t.text === ",") break
						else if (depth === 0 && t.text === "=") sawEq = true
					}
				}
				if (sawEq) {
					// The parameter name is the first name after the comma / open paren.
					for (let m = j + 1; m < k; m++) {
						if (toks[m]!.kind === "name") {
							paramName = toks[m]!.text
							break
						}
						if (toks[m]!.kind === "op" && toks[m]!.text === "=") break
					}
					add("parameter-default")
				}
			}
			// A CLI flag default is the same idea wearing a keyword argument: `add_argument("--k",
			// default=10)`. Restricted to the argparse/optparse registration calls on purpose —
			// `max(xs, default=0)` also spells `default=` and is a fallback, not a flag default.
			if (
				paramName === null &&
				top?.isCall &&
				(top.calleeLast === "add_argument" || top.calleeLast === "add_option") &&
				(negative ? toks[k - 2] : toks[k - 1])?.text === "=" &&
				(negative ? toks[k - 3] : toks[k - 2])?.kind === "name" &&
				(negative ? toks[k - 3] : toks[k - 2])!.text === "default"
			) {
				add("parameter-default")
			}

			// Dict value: `{ …, "key": <literal> }`.
			let dictKey: string | null = null
			if (top?.char === "{") {
				const colon = negative ? toks[k - 2] : toks[k - 1]
				const key = negative ? toks[k - 3] : toks[k - 2]
				if (colon?.kind === "op" && colon.text === ":" && key !== undefined) {
					if (key.kind === "str") dictKey = stringContent(key.text)
					else if (key.kind === "name") dictKey = key.text
				}
			}

			// Assignment right-hand side, at statement depth.
			const isAssignRhs =
				stack.length === 0 && stmt.eqIndex >= 0 && k > stmt.eqIndex && stmt.targetName !== null

			if (paramName !== null || (flags.includes("parameter-default") && dictKey === null && !isAssignRhs)) {
				kind = "parameter-default"
				name = paramName ?? top?.callee ?? null
			} else if (dictKey !== null) {
				kind = "property"
				name = dictKey
				add("named-constant")
			} else if (isAssignRhs) {
				const lastSegment = stmt.targetName!.split(".").pop()!
				const screaming = /^[A-Z][A-Z0-9_]*$/.test(lastSegment)
				kind = stmt.indent === 0 && screaming ? "const" : "let"
				name = stmt.targetName
				add("named-constant")
				if (screaming) add("screaming-case-name")
				// Accumulator: a bare local `name = <literal>` inside an indented block. Module-level
				// SCREAMING_CASE is a named constant, not a running total.
				const rhsStart = negative ? k - 1 : k
				if (
					stmt.indent > 0 &&
					!screaming &&
					rhsStart === stmt.eqIndex + 1 &&
					k === toks.length - 1
				) {
					add("accumulator-init")
				}
			} else if (top?.isCall) {
				kind = "call-argument"
				name = top.callee
			} else if (stmt.isReturn) {
				kind = "return"
			}

			if (top?.isCall) {
				add("call-argument")
				if (name === null) name = top.callee
			}
			if (dictKey !== null && /^[A-Z][A-Z0-9_]*$/.test(dictKey)) add("screaming-case-name")
			if (name !== null && /version/i.test(name)) add("version-literal")

			// --- comments ------------------------------------------------------------------
			// Nearest first: trailing, then the statement's own `#` block, then the enclosing
			// docstrings, then — only when the statement documents nothing itself — the inherited
			// block of an adjacent preceding assignment, tagged `shared-doc-block` so the report can
			// show how much provenance rests on that inference.
			const comments: CommentBlock[] = []
			const ownTrailing =
				!isWholeLineComment(tok.line) && commentByLine.has(tok.line)
					? commentByLine.get(tok.line)!.text
					: null
			if (ownTrailing !== null) comments.push({ source: "trailing", text: ownTrailing })
			if (stmtTrailing !== null && stmtTrailing !== ownTrailing) {
				comments.push({ source: "trailing", text: stmtTrailing })
			}

			// The block directly above the literal's own line wins over the block above the
			// statement head: in a multi-line dict the nearby block is the one that describes it.
			const literalLeading = leadingCommentBlock(lines, tok.line)
			const leading =
				literalLeading.length > 0
					? literalLeading
					: tok.line !== stmt.startLine && stmtLeading.length > 0
						? stmtLeading
						: tok.line === stmt.startLine
							? stmtLeading
							: []
			for (const text of leading) comments.push({ source: "leading", text })

			// A docstring is the statement's own documentation context, not an inference across
			// declarations, so it is `leading` too.
			for (let d = stmt.scopes.length - 1; d >= 0; d--) {
				const doc = stmt.scopes[d]!.docstring
				if (doc !== null) comments.push({ source: "leading", text: doc })
			}
			if (ownTrailing === null && stmtTrailing === null && leading.length === 0) {
				for (const text of sharedBlock) comments.push({ source: "shared-doc-block", text })
			}

			let functionName: string | null = null
			for (let d = stmt.scopes.length - 1; d >= 0; d--) {
				if (stmt.scopes[d]!.kind === "def") {
					functionName = stmt.scopes[d]!.name
					break
				}
			}

			const index = candidates.length
			candidates.push({
				file: relPath,
				line: tok.line,
				// Column points at the digits, not at a folded `-`, so (line, column, text) always
				// identifies the literal exactly as written at that position.
				column: tok.col,
				value,
				text: tok.text,
				language: "py",
				enclosing: { kind, name, functionName },
				snippet: (lines[tok.line - 1] ?? "").trim().slice(0, 200),
				comments,
				flags,
			})
			if (top !== undefined) top.members.push(index)
		}
	}

	return {
		file: relPath,
		language: "py",
		fidelity: "lexical",
		lines: physicalLines,
		candidates,
	}
}

/** Reads `absPath` and scans it, recording `relPath` (POSIX, relative to `research/v3`). */
export function scanPythonFile(absPath: string, relPath: string): ScannedFile {
	return scanPythonSource(readFileSync(absPath, "utf8"), relPath)
}

/*
 * KNOWN LIMITS — quoted verbatim by the report's limitations section.
 *
 * Flags this scanner does NOT attempt, or sets only partially:
 *  - `display-format` from a `round(x, n)` is set only when the literal's own physical line also
 *    mentions `print`, an f-string, or `.format`. Without dataflow there is no way to know where a
 *    rounded value goes, so `payload["rate"] = round(x, 4)` is left unflagged. The two flags scoped
 *    to a physical line rather than a logical statement (this one and `http-status`) are scoped
 *    that way on purpose: both drive exclusions, and a whole multi-line dict is far too generous a
 *    neighbourhood — it was measured producing 4/4 false `http-status` hits before the change.
 *  - `accumulator-init` is really "a bare local assignment of a literal at an indented level". A
 *    lexer cannot distinguish `total = 0` from `threshold = 0.5`; both get the flag, so policy
 *    should combine it with the value before excluding anything on its strength.
 *  - `unit-clamp` follows the brief literally: value 0 or 1 anywhere in a `min` / `max` / `clip` /
 *    `clamp` call. Python's `min`/`max` are general reducers, so `max(len(xs), 1)` (a divide-by-zero
 *    guard) and `max(xs, default=0)` (an empty-sequence fallback) also land here. Neither is a
 *    tunable, so the flag is still doing useful work — it is just not only about [0,1] clamping.
 *  - `exit-code` misses `raise SystemExit` without parentheses and `os._exit` reached through an
 *    alias. In this corpus every other `SystemExit` wraps `main()`, so there is nothing to miss.
 *  - `http-status` needs `status`, `send_response` or `HTTPStatus` on the literal's own line.
 *  - `unit-conversion` looks only at the immediately adjacent `*` / `/` token, so
 *    `x * (1000 + k)` is missed.
 *  - `version-literal` reads the assignment target or dict key only; a version passed positionally
 *    into a call is missed. It fires zero times on the oracle corpus, where revisions are strings.
 *  - `in-numeric-sequence` counts only literals at the same bracket depth in a non-call `(…)` or a
 *    non-subscript `[…]`. A sequence built by comprehension or spread is invisible, and a literal
 *    nested one bracket deeper than the sequence is attributed to the inner bracket only.
 *  - `parameter-default` covers `def` signatures and `add_argument`/`add_option` `default=` keyword
 *    arguments. Any other CLI library's flag defaults read as plain call arguments.
 *  - `named-constant` on a class-level `LIMIT = 99` reports `enclosing.kind` as `let`, because
 *    `const` is reserved for module level; the `screaming-case-name` flag is still set.
 *
 * Python syntax knowingly mishandled:
 *  - Semicolon-separated statements (`a = 1; b = 2`) are treated as ONE logical line, so
 *    assignment-target attribution follows the first statement.
 *  - A one-line compound (`if x: y = 1`) likewise reads as one statement headed by `if`.
 *  - Imaginary literals (`3j`) are dropped entirely; `Candidate.value` has no complex form.
 *  - Format-spec nesting is walked one level (`f"{x:.{p}f}"`); deeper nesting reads as spec text.
 *  - Same-quote nesting inside f-string braces is accepted (Python 3.12+ rule) even for files that
 *    target older interpreters — the lexer over-accepts, which cannot invent literals.
 *  - `lambda` parameter defaults are not flagged `parameter-default`.
 *  - Tuple-unpacking assignments (`a, b = 1, 2`) get no `named-constant`; the target is ambiguous.
 *  - The module-level docstring is never offered as a comment. Only function and class docstrings
 *    are, matching where this repo's Python provenance tags actually live.
 */
