<!-- Phase 1 author packet — provenance
     source: research/v3/src/adjudication/README.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
-->

# Auto-adjudication — a candidate palette run against standing reviewer evidence

Takes a run of candidate palettes and reports, per file and in aggregate, where the run **agrees with
a palette the reviewer endorsed**, where it **reproduces a palette the reviewer rejected**, where the
evidence **contradicts itself**, and whether the candidate's colour set could have produced the
endorsed palette **at all** — split by era, gating nothing.

`V3_PLAN.md`:52–56 calls this the engine of early v3 velocity: *"destination adjudication runs against
the old warehouse before any human review — a large fraction of early v3 iteration can be
auto-adjudicated."* Reviewer bandwidth is the campaign's binding constraint (`V3_PLAN.md`:257), so
every iteration this absorbs is reviewer time saved. The gap scan
(`reviews/toolbox-review/gap-scan.md` item A) found the evidence corpus built and this consumer
missing — *and untracked*, which is why it existed in no ledger and no status check would ever have
surfaced it.

---

## The three principles

Reviewer's rulings, 2026-08-04, verbatim. They are the design, not a preamble to it — each one is
implemented as a shape in `types.ts` that is hard to violate, and each is asserted in the tests.

> ### 1. "There can be many valid palettes"
>
> Matching an endorsement is a **WIN** signal. Differing from one is **NO SIGNAL** — never a penalty.
> Only matching a known-bad is a **LOSS** signal.

Implemented as: `MatchSignal` has exactly three values and no "miss". **No function in this module
returns a score**, and no field in the report is a rate over endorsements — a rate would price
"differed", and differing costs nothing. A candidate that matches none of an artwork's 6 endorsements
reads as `differs`, sits in the no-signal column, and subtracts from nothing. The tests assert the
report contains no field named `score`, `penalty`, `accuracy` or `reward`.

> ### 2. "I can contradict myself"
>
> Where the evidence corpus itself conflicts, surface the conflict per item, never average it away.
> Recency wins for standing; the conflict is still reported.

Implemented as: `Conflict` is a per-item record carrying the **full grade history** of every entry
involved. The aggregate carries the conflict *list* and counts by kind — deliberately **not** a
conflict rate. Five kinds are detected:

| kind | what it is |
|---|---|
| `tier-overlap` | the same file and the same exact palette sits in two tiers at once (31 such keys in the legacy corpus) |
| `strong-graded-acceptable` | a baseline-tier entry whose standing grade is `strong` (9 in the legacy corpus) |
| `grade-history-conflict` | the matched entry was graded differently at different times; recency picked standing, the disagreement stands |
| `candidate-matches-both-tiers` | one candidate palette is within the bar of both a good-tier and a known-bad entry for the same file |
| `identical-timestamp-contested` | conflicting grades at an identical timestamp — the one case recency cannot break (none exist today) |

That last one is worth dwelling on. The good tiers and known-bad are exactly disjoint by role
signature, so this can only happen **under the bar** — two near-identical palettes the reviewer
graded differently. The tool does not pick a winner. The loss outranks the win in the single
`outcome` label (a stated precedence, not a judgement), both matches stay in their arrays, and the
pair is raised as a conflict.

> ### 3. "We are rewriting from scratch and old truths might be invalid now"
>
> Every v2-3-era verdict enters as a **dated prior** with a regime tag. Match / loss / no-signal are
> reported per era separately. **Nothing from the old regime gates anything** — it informs.

Implemented as: every entry carries `provenance.era`, `provenance.recordedAt` and (with `--as-of`) an
`ageDays`. Results split by era at every level — per candidate (`byEra`) and in aggregate. The report
carries the literal field `gating: "none"`, and **the CLI exits 0 even when the run reproduces
known-bad palettes**. A caller who wants a gate has to read the report and decide, in the open.

The honest state of the v3 era today: **zero standing palette verdicts.** The warehouse holds 8
verdict records and all 8 are demo fixtures, which this tool excludes by default and counts out loud
(`src/warehouse/records.ts` says why: counting them is how "how many verdicts exist in v3" gets
answered `8` when the honest answer is `0`). So every prior available today is v2-3 — old contract,
old algorithm, old review UI — and the report says so on its face rather than letting a v2-3 win read
as a current one.

---

## Match semantics, stated honestly

A candidate **matches** an entry when **every compared role colour is the same colour**.

- **"The same colour"** is `sameColor()` from `src/contract/color.ts`: Euclidean OKLab distance —
  the one ruler — against the **region-dependent bar** calibrated on the reviewer's bracketing rounds
  1+2 and frozen 2026-08-03 (`d-2026-08-03-same-color-bar-freeze`). **Never exact hex.**
  `data/legacy/README.md` decision 2 settles this; the fixtures store exact hexes precisely so that
  any bar can be applied after the fact.
- **"Every compared role"** is not always all four. Three legacy corrections are partial (one
  three-role, two single-role) and `data/legacy/README.md` A6 forbids treating a missing role as a
  constraint. So the comparison runs over the roles the *entry* carries, and the match records
  `basis: "present-roles-only"` when that was fewer than four. A single-role entry matches a great
  many palettes; the era tally counts those as `partialBasis`, separately from `fullBasis`, rather
  than letting them inflate a win count.
- **Roles only** — never `paletteSignature`, which folds in gradient, midpoint and collapse. Those do
  not survive into the v3 contract, and the fixtures' own `gradientAdvisory` says gradient comparison
  against them is advisory at best.

Configurable, because "honestly" means "and you can check what changes if you choose differently":

| `--bar` | what it does |
|---|---|
| `regional` | **default.** The calibrated, frozen, region-dependent bar. The only live semantics. |
| `pooled` | `POOLED_SAME_COLOR_BAR` (0.01535), for corpus metrics needing one cross-run-comparable number. `data/legacy/README.md` states plainly this **is not the gate's bar**; any report using it says so. |
| `<number>` | a fixed bar, for sweeping the threshold. |
| `exact-hex` | string equality. One purpose only: reproducing hit counts computed before the bar landed, which the legacy README records as provisional. Never a live mode. |

**Non-matches are still measured.** `worstRoleBarRatio` records how far off the nearest miss was —
"missed by 1.02 bars" and "missed by 40 bars" are different facts about a candidate's behaviour. It
is telemetry, not a cost.

### Outcome precedence

One label per candidate, stated once so no caller has to guess:
`known-bad-match` > `endorsement-match` > `acceptable-match` > `differs` > `unseen`.
`differs` means comparable evidence existed and none of it matched. `unseen` means there was no
comparable evidence for this file under these options — including the case where entries exist but
were skipped by `--partial-entries skip`. The two are kept apart because "we have never looked at
this" and "we looked and you diverged" are different states, and only the `acceptable` tier lets you
tell them apart at all.

### Reachability

Could the candidate's colour set have produced the prior at all? The angle v2-3 used, and it answers a
question matching cannot. A candidate that *differs* is exercising the freedom principle 1 grants it.
A candidate whose available colour set does not **contain** the endorsed colours could not have agreed
even if it wanted to — a fact about the paradigm's **ceiling**, reported beside the match, never
folded into it, and never charged against anything. Supply `availableColors` on a run record to enable
it; without one the answer is `not-assessed`, because silence is never a pass.

---

## Input format

JSONL, one JSON object per line. Derived from the contract's types (`src/contract/types.ts`), with the
parts adjudication does not read made optional:

```jsonc
{
  "arm": "arm/proto-b",              // optional: which paradigm produced this line
  "note": "free text",               // optional
  "palette": {
    "contractVersion": "v3-contract-0.1.0",
    "roles": {                       // required. "#rrggbb", or {"hex":…}, or {"rgb":[r,g,b]}
      "background": "#101018", "surface": "#1c1c2a",
      "foreground": "#e8e6f0", "accent": "#c94f3d"
    },
    "metadata": {                    // identity is required and is never guessed
      "inputContentHash": "<sha-256 of the input file's bytes, lowercase>",
      "sourceRendition": { "path": "…", "width": 640, "height": 640, "format": "jpeg" }
    }
    // gradient / collapse / contrast: optional here. Present ⇒ counted as `contractComplete`.
  },
  "availableColors": ["#0a0a0a", "#181818", …]   // optional: enables reachability
}
```

`gradient`, `collapse` and `contrast` are optional **only for this tool**, which compares role colours
and nothing else; requiring a field it then refuses to use would block Phase 1 prototypes for no gain.
Identity is not optional: a record without a content hash cannot be joined to any prior, so it is a
**reported parse error**, never a silent skip. A run that adjudicates 40 of its 200 lines because the
emitter forgot a field should look broken, not clean.

---

## CLI

```sh
cd research/v3

# adjudicate a run
node --experimental-strip-types src/adjudication/cli.ts run <candidates.jsonl> [options]

# census the evidence corpus and its own contradictions — no candidates needed
node --experimental-strip-types src/adjudication/cli.ts corpus

# full per-entry detail for one file
node --experimental-strip-types src/adjudication/cli.ts explain <candidates.jsonl> --artwork <sha256|path>
```

| option | default | meaning |
|---|---|---|
| `--format text\|json` | `text` | `json` is the machine-readable report, schema `adjudication-report-0.1.0` |
| `--out <path>` | stdout | write instead of printing |
| `--bar regional\|pooled\|exact-hex\|<number>` | `regional` | see match semantics above |
| `--roles <list>` | all four | which roles participate |
| `--partial-entries compare-present\|skip` | `compare-present` | how to treat entries missing roles |
| `--era v2-3,v3` | both | which regimes to consult |
| `--as-of YYYY-MM-DD` | unset | reference date for prior ages; unset means ages are not computed rather than guessed |
| `--near-misses <n>` | `3` | nearest non-matching entries kept per candidate |
| `--no-reachability` | on | skip the reachability assessment |
| `--baseline <run.jsonl>` | — | also report movement to/from known-bad against another run |
| `--include-demo-fixtures` | off | count the warehouse's demo-fixture records as evidence (they are not) |
| `--verbose` | off | per-candidate detail for every candidate, not only the signal-carrying ones |

**Exit status is 0 whenever adjudication completed**, including when the run reproduced known-bad
palettes. Non-zero means the tool could not do its job — bad arguments, unreadable file. That is
principle 3 wired into the process contract.

### The movement guardrail

`--baseline` adds the run-versus-run check the gap scan asked for by name: *"the tool must emit
guardrails ('never move TO known-worse') and never a fitted score."* It reports two **lists** —
files that were clean in the baseline and match a known-bad in the candidate run, and files that
moved the other way — plus the files present in only one run, so the comparison is scoped honestly.
Lists, not a score, and not a gate.

---

## Evidence sources

| era | source | what it holds |
|---|---|---|
| `v2-3` | `data/legacy/endorsements.json` | 351 entries — `strong` grades and endorsed-sample corrections |
| `v2-3` | `data/legacy/known-bad.json` | 37 entries — `weak-fallback` / `unacceptable`, all hard-gate |
| `v2-3` | `data/legacy/acceptable.json` | 166 entries — a not-rejected **baseline tier**, explicitly not endorsements |
| `v3` | `data/warehouse/warehouse.jsonl` | verdict and endorsed-sample records, demo fixtures excluded. **0 real entries today.** |

The three legacy files are **loaded as separate tiers and never concatenated** — the two good tiers
overlap each other by 31 keys, so concatenating double-counts. The overlap is raised as a conflict
rather than de-duplicated away.

The v3 loader applies the **same recency rule** the legacy distillation applied: group by (file, exact
role signature), sort the grade history by timestamp, latest grade decides the tier, superseded grades
are kept as history. It does not re-derive the legacy files' standing grades — that question the
reviewer already settled, and re-answering it here from a subset of the warehouse would be a second,
quieter answer.

---

## Files

| file | what it is |
|---|---|
| `types.ts` | the schema, and where the three principles are enforced as shapes |
| `evidence.ts` | loading and indexing both eras; corpus-intrinsic conflict detection |
| `match.ts` | the match semantics and reachability |
| `adjudicate.ts` | reading a run, joining, assembling the report, the movement check |
| `report.ts` | deterministic text and JSON rendering |
| `cli.ts` | the CLI |
| `make-demo-run.ts` | builds a synthetic run from the real corpus, for demonstration |

Tests: `tests/adjudication-semantics.test.ts` (29) and `tests/adjudication-cli.test.ts` (16), over
`tests/adjudication-fixtures/` — a hand-built corpus that is deliberately contradictory, holding the
many-valid case, the both-tiers conflict, a tier overlap, a strong-graded acceptable, a self-
disagreeing grade history, and a single-role partial correction.

**Path ownership.** This workstream owns `src/adjudication/`, `tests/adjudication-*.test.ts`,
`tests/adjudication-fixtures/` and `data/adjudication/`. It reads `data/legacy/` and
`data/warehouse/` and writes to neither. The row is not yet in `CONVENTIONS.md`'s ownership table,
which housekeeping owns.

## Determinism

Same inputs produce byte-identical output. No clock is read (which is why `--as-of` exists rather than
defaulting to today), no absolute paths appear in the report, ordering does not depend on input
order, and every collection is sorted by a stable key. `tests/adjudication-cli.test.ts` asserts it at
the CLI boundary.

## What this does not do

**No integration with any palette algorithm.** By design, per the brief: Phase 1 consumes this. The
tool takes a file of palettes and knows nothing about how they were produced. It also does not decode
images, does not compute palettes, does not write to the warehouse, and does not gate.
