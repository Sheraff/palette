# Parameter honesty — the instrument

Counts the numbers in `research/v3/src` and `research/v3/oracle` that could be changed to change
behaviour, and how many of them carry a provenance story.

**Why it exists.** Parameter honesty is the second of v3's three success criteria (`V3_PLAN.md`
§1), defined against v2-3's roughly 900 tunable sites justified by 11 human anchors. The
*discipline* existed from day one — provenance tags, decision records, no anonymous literals. The
*measurement* did not, which the Phase 0 adversarial review ranked the worst instrument gap in the
campaign (`reviews/phase-0-adversarial/unrealized-ideas.md` §3). Without it, the criterion could
only ever be asserted.

## Running it

```sh
cd research/v3
node --experimental-strip-types src/honesty/cli.ts           # regenerate both outputs
node --experimental-strip-types src/honesty/cli.ts --check   # exit 1 if the committed report is stale
node --experimental-strip-types --test tests/honesty-*.test.ts
```

Outputs, both regenerated wholesale and both owned by this workstream:

- `data/honesty/honesty-report.json` — the full census, including every untagged site with
  `file:line` and every exclusion with its count.
- `data/honesty/HONESTY.md` — the generated human-facing page. Never hand-edit it.

Numbers are **not** quoted in this README on purpose. `CONVENTIONS.md` says a count carries the
timestamp it was measured at, or is replaced by the query that regenerates it; the command above is
that query, and `HONESTY.md` carries the timestamp.

## How it works

Three stages, deliberately separated so that all judgment lives in one file:

| stage | file | role |
|---|---|---|
| scan | `scan-ts.ts`, `scan-py.ts` | Purely syntactic. Find numeric literals, describe where they sit as `ContextFlag`s. Never decide what counts. |
| policy | `classify.ts` | Turn flags into an exclusion verdict and a provenance verdict. **This is the file to argue with.** |
| report | `report.ts`, `cli.ts` | Aggregate, rank, render. Deterministic. |

`scan-ts.ts` uses the TypeScript compiler's own AST (`typescript` is already a root devDependency),
so strings, comments, regexes and template text are excluded for free — fidelity `ast`.
`scan-py.ts` is a hand-written Python lexer, because the instrument must be pure Node and must not
depend on a system interpreter — fidelity `lexical`. The report publishes fidelity per language and
never pools the two silently.

### The three properties that make the number trustworthy

1. **It is a lower bound.** Exclusion rules are deliberately narrow. Where it is unclear whether a
   number is structural or tunable, it is **counted** — inflating the denominator and pushing the
   fraction down. The tree is at least this honest, never less. An instrument that erred the other
   way could be improved by broadening an exclusion, which is exactly the failure mode it exists to
   detect.
2. **No exclusion is silent.** Every dropped literal names one of the rules in `EXCLUSION_RULES`,
   the counts sum to the excluded total, and whole files skipped (virtualenvs, `.d.ts`) are listed
   individually. A file-level skip is the easiest place to hide a pile of untagged constants.
3. **It measures itself.** `src/honesty/` is inside the scanned tree. Exempting the instrument from
   its own metric would be the precise quiet exemption it exists to catch.

### What it counts as provenance

A site is **documented** when an adjacent comment carries a `CONVENTIONS.md` tag
(`[REVIEWED] [MEASURED] [n=1] [INHERITED] [UNCALIBRATED] [HELD]`) or cites a decision-record id that
resolves in `data/decisions/decisions.json`. It is **anchored** — the stricter number — only when
that story is `[REVIEWED]`, `[MEASURED]`, or a resolved decision. `[UNCALIBRATED]` deliberately
scores as unanchored: an instrument that let it count would report a system as honest for admitting
it is untuned.

Decision citations are split by whether `fundedBy` is non-empty (machine-recheckable) or empty
(a reviewer's conversational ruling, which `CONVENTIONS.md` calls the honest form). Both are
human-anchored; only the first can ever be re-verified. A citation that does **not** resolve is
reported as `decision-dangling` and counted with the untagged, because a broken citation reads as
provenance and is not.

## Limitations

Published with the numbers, in `HONESTY.md`, rather than hidden here — an instrument that measures
honesty and conceals its own blind spots is self-refuting. The largest: only *numeric* literals are
counted, so a tunable expressed as a string, a boolean switch, or a choice of algorithm is
invisible.

**This instrument measures two of the criterion's three numbers.** The third — the reviewed-vs-unseen
perturbation-stability ratio, v2-3's 1.61x overfitting alarm, target ~1.0 — needs a pipeline that
emits palettes and is not measured here.

## Proposed ledger items

This workstream cannot edit `V3_PLAN.md`, `PHASE_0_LOOSE_ENDS.md`, or `data/decisions/`
(housekeeping owns them). These are proposals, recorded here so they are not lost:

1. **`V3_PLAN.md` §6 status table** — add a row for parameter honesty pointing at
   `data/honesty/HONESTY.md`, marked built-and-measuring, with the explicit note that only two of
   the criterion's three numbers are covered.
2. **`V3_PLAN.md` §6, Phase 2 entry condition** — add the reviewed-vs-unseen perturbation-stability
   ratio beside the existing carve-out rows 4 and 5. It is the third honesty number and today it is
   tracked nowhere, which is how it stayed invisible through all of Phase 0.
3. **`PHASE_0_LOOSE_ENDS.md`** — one entry for the untagged backlog: owner *each workstream for its
   own paths*, revival condition *before Phase 1 code lands in that workstream's directory*,
   pointing at `body.untagged` in the JSON for the current `file:line` list. The instrument counts;
   it must not tag other workstreams' constants on their behalf.
4. **`PHASE_0_LOOSE_ENDS.md`** — one entry for any `decision-dangling` citations found, which are a
   different and sharper defect than an untagged site: someone wrote down provenance that does not
   resolve.
5. **A decision record** for the two judgment calls a future reader is entitled to inherit rather
   than re-derive: that `[UNCALIBRATED]` counts as unanchored, and that the metric is deliberately a
   lower bound. Empty `fundedBy` — no machine can re-check a definition.
6. **`CONVENTIONS.md`** — consider making `--check` a pre-commit or CI step once Phase 1 starts, so
   a new tunable site cannot land without the census being regenerated.
