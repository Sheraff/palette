# Parameter honesty — census of the v3 source tree

**Generated file. Do not edit by hand** — regenerate with `node --experimental-strip-types src/honesty/cli.ts` from `research/v3`.

Measured at **2026-08-04T08:49:55.653Z**. Body hash `5205668f73bac742`.

Parameter honesty is the second of v3's three success criteria (`V3_PLAN.md` §1). It exists because v2-3 carried roughly 900 tunable sites against 11 human-anchored values — quantified overfitting. This page counts the first number and the provenance behind it. It does **not** measure the third number, the reviewed-vs-unseen perturbation-stability ratio; that needs a pipeline and belongs at the Phase 2 entry condition.

## Headline

- **Tunable sites: 5322**
- **Documented: 722 (13.6%)** — carries a provenance tag or a resolved decision record.
- **Anchored: 458 (8.6%)** — the story is `[REVIEWED]`, `[MEASURED]`, or a decision record. Weak tags (`[n=1]`, `[INHERITED]`, `[HELD]`) do not count here.
- **Untagged: 4600** — no provenance of any kind. This is the dishonesty measure.

Scanned 207 files, 89937 lines, 8632 numeric literals, of which 3310 were excluded by a named rule (listed below, none silent).

**Read the fraction as a lower bound.** Exclusion rules are deliberately narrow: when it is unclear whether a number is structural or tunable it is counted, which inflates the denominator and pushes the fraction down. The tree is at least this honest, never less.

## Corpus

| language | files | lines | parser fidelity |
|---|---:|---:|---|
| py | 95 | 37931 | lexical |
| ts | 112 | 52006 | ast |

## Provenance of the tunable sites

| tag | count | anchor strength |
|---|---:|---|
| `[REVIEWED]` | 277 | anchored |
| `[MEASURED]` | 181 | anchored |
| `[FITTED]` | 0 | anchored |
| `[n=1]` | 2 | weak |
| `[INHERITED]` | 115 | weak |
| `[UNCALIBRATED]` | 133 | unanchored |
| `[HELD]` | 14 | weak |
| decision record, resolved | 0 | anchored |
| decision record, dangling | 0 | unanchored |
| **untagged** | **4600** | unanchored |

Decision citations resolve to 2 machine-recheckable records (non-empty `fundedBy`) and 0 reviewer-conversational ones (empty `fundedBy`, which `CONVENTIONS.md` calls the honest form for a verbal ruling). Both are human-anchored; only the first can ever be re-verified.

**How the tags were attributed:** 603 from the site's own doc comment, 1 from a trailing same-line comment, 118 inherited from an adjacent declaration's doc block. That last number is the instrument's weakest inference — discount it if you are being strict.

## Per working area

One row per top-level directory under a scan root — the granularity `CONVENTIONS.md` assigns ownership at, so each row has exactly one owner. **Gate** says what a growth in `untagged` means: `GATED` areas fail the local growth test (`tests/honesty-area-growth.test.ts`) when the count rises, `INFORMATIONAL` areas are reported and never fail anything. Phase 0 sets every area informational — the machinery is live, the gating is opt-in, one word per area in `src/honesty/areas.ts`.

| area | gate | workstream | files | tunable | documented | untagged | documented % |
|---|---|---|---:|---:|---:|---:|---:|
| `oracle/bakeoff` | INFORMATIONAL | oracle — bakeoff | 7 | 89 | 17 | 72 | 19.1% |
| `oracle/embeddings` | INFORMATIONAL | embeddings | 15 | 366 | 62 | 304 | 16.9% |
| `oracle/ladder` | INFORMATIONAL | oracle — ladder | 7 | 368 | 88 | 280 | 23.9% |
| `oracle/premise` | INFORMATIONAL | oracle — premise | 20 | 675 | 59 | 616 | 8.7% |
| `oracle/sam` | INFORMATIONAL | oracle — SAM | 54 | 1423 | 172 | 1251 | 12.1% |
| `src/adjudication` | INFORMATIONAL | adjudication | 7 | 74 | 0 | 74 | 0.0% |
| `src/calibration-consequence` | INFORMATIONAL | calibration consequence | 5 | 96 | 18 | 78 | 18.8% |
| `src/contract` | INFORMATIONAL | contract schema + gates | 10 | 293 | 48 | 245 | 16.4% |
| `src/coverage-set` | INFORMATIONAL | coverage set | 5 | 163 | 26 | 137 | 16.0% |
| `src/devloop` | INFORMATIONAL | dev loop / code version (no CONVENTIONS row) | 9 | 107 | 21 | 86 | 19.6% |
| `src/holdout` | INFORMATIONAL | holdout freeze | 1 | 80 | 21 | 59 | 26.3% |
| `src/honesty` | INFORMATIONAL | parameter honesty | 8 | 235 | 34 | 201 | 14.5% |
| `src/legacy` | INFORMATIONAL | legacy distillation | 1 | 45 | 4 | 41 | 8.9% |
| `src/provenance` | INFORMATIONAL | result fingerprints | 2 | 3 | 0 | 3 | 0.0% |
| `src/review-server` | INFORMATIONAL | review server | 26 | 819 | 81 | 738 | 9.9% |
| `src/robustness` | INFORMATIONAL | robustness comparison (no CONVENTIONS row) | 9 | 67 | 16 | 51 | 23.9% |
| `src/stats` | INFORMATIONAL | shared statistics (no CONVENTIONS row) | 12 | 328 | 45 | 283 | 13.7% |
| `src/tagging` | INFORMATIONAL | tagging | 5 | 43 | 0 | 43 | 0.0% |
| `src/warehouse` | INFORMATIONAL | warehouse + query CLI | 4 | 48 | 10 | 38 | 20.8% |

## Exclusions — every rule, every count

No literal is dropped silently. A site records exactly one rule, so these sum to the excluded total.

| rule | count | why this is not a tunable |
|---|---:|---|
| `fixture-module` | 128 | The file is a fixture or test-support module. Its numbers are data under test, not policy the system runs on; they are pinned deliberately and changing one is a test edit, not a retuning. |
| `colorimetric-spec` | 54 | A constant fixed by the sRGB or OKLab specification (0.04045, 12.92, 1.055, 2.4, 0.0031308, and the OKLab matrices). There is nothing to calibrate and no provenance question to answer. This is the one exemption src/contract/constants.ts declares in its own header, and contract-color.test.ts verifies the conversions against colorjs.io rather than against a chosen value. |
| `version-literal` | 4 | Part of a version or schema-version identifier. It labels a thing rather than shaping behaviour; CONVENTIONS tags these [HELD] precisely because they are identifiers, not measurements. |
| `exit-code` | 22 | A process exit code. It is an operating-system protocol value, not a parameter of the algorithm. |
| `http-status` | 29 | An HTTP status code. Fixed by RFC 9110; the choice of which status to send is logic, but the number itself is not tunable. Covers the review server's own respond(res, status, ...) helper as well as the writeHead/statusCode shapes the scanner recognises directly. |
| `emptiness-comparison` | 358 | A 0 or 1 compared against a collection's length/size/shape — 'is it empty?', not a magnitude threshold. Listed before the comparison protection, which would otherwise rescue every `xs.length > 0`. |
| `not-found-sentinel` | 0 | A -1 compared against the result of indexOf/findIndex/.index() — the language's not-found sentinel, not a bound anyone chose. |
| `index-access` | 1083 | An integer subscript: xs[0], argv[2]. It selects a position in a structure. The structure's shape may be a design choice, but the index is not a value anyone tunes. |
| `loop-header` | 236 | An integer in a for/while header — the counter's origin, bound, or step. Iteration mechanics, not policy. |
| `accumulator-init` | 262 | A 0 or 1 initializing a mutable accumulator (`let n = 0`). The arithmetic identity a running total starts from. Restricted to 0 and 1 on purpose: `let threshold = 0.7` is a mutable knob and stays counted. |
| `counter-increment` | 334 | A 1 in a compound assignment that steps a counter (n += 1, n -= 1). Nobody tunes an increment; it is the arithmetic of counting. Matched on the source line rather than a scanner flag, so it is restricted to the literal 1 to keep the match unambiguous. |
| `unit-conversion` | 51 | A multiply or divide by a unit constant — ms per second, seconds per minute, the 8-bit channel maximum, bytes per KiB. An identity of the units, not a choice. |
| `unit-clamp` | 129 | A 0 or 1 acting as the bound of a clamp into the unit interval. The range is the quantity's definition, not a tuned limit. |
| `display-format` | 325 | A digit count or width for output formatting: toFixed(2), padStart(3), a round() feeding a print. It changes what a human reads, never what the system computes. |
| `display-interpolation` | 257 | A literal inside a template literal, f-string, or print — text assembly. Note this rule is narrow: a comparison inside an interpolation keeps its protection and stays counted. |
| `slice-origin` | 38 | A 0 as the start argument of slice/substring/splice — 'from the beginning'. The LENGTH argument of the same call is not excluded: a hash prefix length is a real choice. |

Whole files skipped: 2 — 2 type-declaration file (no runtime behaviour to tune). Full list under `body.skippedFiles`.

## The ten worst untagged sites

Ranked by a documented heuristic (`suspicion` in `classify.ts`): threshold shape, named-constant shape, oddly specific floats, epsilons, parameter defaults. It orders a worklist; it is not a measurement.

| # | site | value | name | score | line |
|---:|---|---:|---|---:|---|
| 1 | `oracle/embeddings/bakeoff_census_aware.py:458` | `1e-10` | `v2v3_survives` | 10 | `v2v3_survives = bool(v2v3_ps) and max(v2v3_ps.values()) < 1e-10` |
| 2 | `oracle/embeddings/bakeoff_census_aware.py:459` | `0.0033` | `v2pe_separated` | 8 | `v2pe_separated = bool(v2pe_ps) and max(v2pe_ps.values()) < 0.0033  # Bonferroni/15` |
| 3 | `oracle/sam/pointing_wash_diagnose.py:412` | `0.1` | `proxy_usable` | 8 | `proxy_usable = 0.10 <= float(ground_proxy.mean()) <= 0.98` |
| 4 | `oracle/sam/pointing_wash_diagnose.py:412` | `0.98` | `proxy_usable` | 8 | `proxy_usable = 0.10 <= float(ground_proxy.mean()) <= 0.98` |
| 5 | `src/coverage-set/build-coverage-set.ts:950` | `0.001` | `assertNormalized` | 8 | `if (Math.abs(Math.sqrt(sum) - 1) > 1e-3) fail(`${label} row ${row} has norm ${Math.sqrt(su` |
| 6 | `src/review-server/accent-functional.ts:238` | `0.000005` | `ANCHOR_DISTANCE_TOLERANCE` | 8 | `const ANCHOR_DISTANCE_TOLERANCE = 5e-6` |
| 7 | `src/review-server/analyze-bracketing.ts:85` | `1e-12` | `FIT_SINGULAR_DETERMINANT` | 8 | `const FIT_SINGULAR_DETERMINANT = 1e-12` |
| 8 | `src/stats/binomial.ts:277` | `0.0001` | `formatP` | 8 | `if (pValue < 1e-4) return "<0.0001"` |
| 9 | `src/stats/stats.py:352` | `0.0001` | `format_p` | 8 | `return "<0.0001" if p_value < 1e-4 else f"{p_value:.4f}"` |
| 10 | `src/contract/calibration/same-color-bar-translation.ts:38` | `0.95047` | `D65_WHITE_POINT` | 7 | `const D65_WHITE_POINT = [0.95047, 1, 1.08883] as const` |

## Where the untagged sites are

Files with at least one untagged tunable site, worst first.

| file | tunable | documented | untagged |
|---|---:|---:|---:|
| `src/review-server/bracketing.ts` | 214 | 35 | 179 |
| `oracle/premise/analyze_b_unmapped_class.py` | 184 | 12 | 172 |
| `src/stats/stats.py` | 156 | 4 | 152 |
| `oracle/ladder/selftest.py` | 145 | 0 | 145 |
| `src/honesty/scan-py.ts` | 114 | 0 | 114 |
| `src/review-server/accent-functional.ts` | 97 | 0 | 97 |
| `oracle/premise/analyze_bcde.py` | 122 | 29 | 93 |
| `src/contract/calibration/same-color-bar-translation.ts` | 92 | 0 | 92 |
| `src/coverage-set/build-coverage-set.ts` | 96 | 7 | 89 |
| `oracle/sam/probe_noun_breadth.py` | 72 | 0 | 72 |
| `src/contract/belongs-study.ts` | 83 | 13 | 70 |
| `oracle/sam/pointing_wash_diagnose.py` | 65 | 0 | 65 |
| `oracle/sam/selftest.py` | 65 | 0 | 65 |
| `src/review-server/analyze-bcde-validation.ts` | 75 | 13 | 62 |
| `oracle/sam/probe_scripts_objects.py` | 59 | 0 | 59 |
| `src/holdout/freeze-holdout.ts` | 80 | 21 | 59 |
| `src/review-server/server.ts` | 59 | 0 | 59 |
| `src/review-server/analyze-bracketing.ts` | 63 | 5 | 58 |
| `oracle/embeddings/bakeoff_census_aware.py` | 57 | 1 | 56 |
| `src/review-server/oracle-validation.ts` | 59 | 3 | 56 |
| `src/calibration-consequence/near-pairs.ts` | 61 | 7 | 54 |
| `oracle/premise/selftest.py` | 53 | 0 | 53 |
| `oracle/premise/simulate_cascade.py` | 56 | 3 | 53 |
| `oracle/sam/probe_vocabulary.py` | 51 | 0 | 51 |
| `src/review-server/composer.ts` | 54 | 3 | 51 |
| `src/stats/numeric.ts` | 83 | 32 | 51 |
| `oracle/sam/analyze_residual_purity_2.py` | 50 | 0 | 50 |
| `oracle/sam/point_sheets.py` | 49 | 0 | 49 |
| `oracle/embeddings/selftest.py` | 51 | 3 | 48 |
| `oracle/ladder/build-manifest.ts` | 64 | 16 | 48 |

Full list of all 4600 untagged sites with `file:line`: `data/honesty/honesty-report.json`, key `body.untagged`.

## What this instrument cannot see

- Only numeric literals are counted. A tunable expressed as a string ('high' | 'low'), a boolean policy switch, or a choice of algorithm is invisible to this instrument — v2-3's worst free parameters included several of those.
- Provenance is judged by proximity, not by meaning. A tag in an adjacent comment counts even if it documents the constant next door, and a correct provenance story written three lines away does not count. The tagAttribution block shows how much of the total rests on the weakest of those inferences (shared-doc-block).
- The Python half is a lexical scan, not an AST parse: it can misread syntax a real parser would not. The TypeScript half uses the TypeScript compiler's own AST. Per-language fidelity is published in the corpus block so the two are never silently pooled.
- [FITTED] is read as a label, never verified as a statistic. The tag is defined to cite n and the fitting artifact, but this instrument does not check that the citation is present, that the artifact exists, that n is adequate, or that the fit was ever tested against a holdout. A [FITTED] tag on a constant fitted to eleven points scores exactly as anchored as one fitted to nine hundred. The count is published separately in byTag so a reader can audit those sites specifically rather than take the anchored total on trust.
- A site counted once may be one of several places the same value is written. Duplicated magic numbers inflate the count; a single named constant used in twelve places counts once, which is the incentive the metric should create.
- The reviewed-vs-unseen perturbation-stability ratio — the third parameter-honesty number, and v2-3's 1.61x overfitting alarm — is NOT measured here. It needs a pipeline that emits palettes and belongs with the perturbation gates at the Phase 2 entry condition.
- Known false-positive class, left in deliberately: colorimetric constants fixed by specification are only recognised when they are the sRGB transfer values or sit inside a matrix-shaped array literal. The OKLab coefficients written as arithmetic chains in src/contract/color.ts, and the CIE D65 white point, are therefore counted as untagged tunables. Filter body.untagged on those files for the current size. They are left counted rather than exempted by a widened heuristic, because broadening an exclusion is the one edit that improves this score without improving the code.
- Python flag limits (from scan-py.ts's KNOWN LIMITS block): the lexer cannot tell an accumulator (total = 0) from a knob (threshold = 0.5), which is why the accumulator-init exclusion refuses to fire unless the value is 0 or 1; unit-clamp also catches Python's general min/max reducers such as max(len(xs), 1), which are non-tunables too but not clamps; round()-based display formatting is only recognised when the same physical line prints; and sequences built by comprehension are invisible to in-numeric-sequence.
- Python syntax knowingly mishandled by the lexical scan: semicolon-separated statements and one-line compounds (if x: y = 1) read as a single logical line; imaginary literals (3j) are dropped entirely; format-spec nesting is walked one level; and the module docstring is never offered as a provenance comment, matching where this repo's Python tags actually live.
- A tunable site is not the same unit as a free parameter. This tree is mostly Phase 0 instrumentation — review servers, analysis scripts, oracle runners — whereas v2-3's ~900 sites were the palette pipeline itself. The two counts are not comparable, and the number to watch is this one's trend as Phase 1 code lands, not its distance from 900.
