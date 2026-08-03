# V3 decision records

**Created 2026-08-03.** The first six records were written **retroactively** — those decisions
were made between 2026-08-02 and 2026-08-03, this file was not. Every record says so via
`recordedAt`.

**Counts in this document are as of 2026-08-03 and are re-derived, not remembered.** The file
holds **35 decisions** — 15 written on 2026-08-03, plus **20 appended the same evening** from the
Phase 0 adversarial review's six fix arms and three reviewer rulings. **7** of them carry
`fundedBy`. Every count below that predates that append is marked; re-derive before quoting
anything:

```sh
jq '.decisions|length' research/v3/data/decisions/decisions.json
jq '[.decisions[].fundedBy[]] | length, (unique|length)' research/v3/data/decisions/decisions.json
```

A decision record is the answer to "why is the system like this, and what would have to change
for it to be otherwise". It is not a changelog entry and not a design document. One record per
**standing** decision — something later work is entitled to assume without re-deriving.

## Why the file exists

v2-3's standing decisions lived in prose, in six documents, in the tense of whoever wrote them
last. Two consequences, both measured rather than feared:

- **A decision could be superseded without its consumers noticing.** The legacy-fixture
  contested-pairs policy was decided twice on the same day (orchestrator: warn-never-block;
  reviewer: recency), and the fixtures were built once under each. Only a comment in a README
  records that both happened.
- **A decision could outlive its evidence.** If a reviewer amends, retracts or simply
  **re-answers** an item, every decision that record funded is now standing on something that
  moved. Nobody can find those decisions by reading.

The second problem is the one the warehouse can solve mechanically, which is why `fundedBy` is a
list of **warehouse record ids** and not a list of prose citations.

## Schema

```jsonc
{
  "id":        "d-<yyyy-mm-dd>-<slug>",  // stable, never reused, never renumbered
  "ts":        "ISO-8601",               // when the DECISION was made, not when written down
  "kind":      "<free label, see the vocabulary below>",
  "decision":  "what was decided, in plain language, stated so a reader who
                disagrees knows exactly what they are disagreeing with",
  "scope":     "what it binds and — as important — what it does NOT bind",
  "fundedBy":  ["<warehouse record id>", ...],   // see below
  "recordedAt": "yyyy-mm-dd",

  // optional, and in practice always present:
  "fundedByArtifacts": [ … ],     // object or bare string — see below
  "fundingCaveats":    [ "…" ],   // see "The honest part" below
  "supersedes":        "<decision id>"           // when one replaces another
}
```

The file is `decisions.json`, shaped
`{ "what": …, "recordedAt": …, "consumedBy": …, "decisions": [ … ] }`. Extra fields are ignored by
every consumer, so a record may carry more than the schema names.

**`supersedes` is in use as of 2026-08-03.** Two chains exist:
`d-2026-08-03-embedding-canonical-model-rationale` → `d-2026-08-02-embedding-canonical-model`
(same choice, restated grounds — the superseded record cited a statistic that did not support it),
and `d-2026-08-03-sam-per-group-score-thresholds` → `d-2026-08-03-sam-calibrated-score-threshold`
(the pooled cut, replaced by per-group cuts on a re-analysis of the same 60 judgments). Note what
the second one shows: a superseding record does **not** imply new evidence. Read the chain, not
the latest record alone — the superseded record is why artifacts on disk look the way they do.

Three SAM records still describe one instrument in three successive states
(`-sam-prompt-set-replacement` → `-sam-concept-set-v2` → `-sam-concept-set-v2.1-barcode`) with
**no `supersedes` linking them**. They are append-only history and must not be edited to add it;
the chain is stated here instead, and the earliest of the three carries caveats about `config.py`
that the code has since fixed.

### `kind` is a free label, and here is what is actually in it

`kind` is not validated by any tool: `warehouse recheck` prints it and nothing else reads it. It
is a label for humans grepping the file, so the list below is a **description, not a
constraint** — but reach for an existing value before inventing one.

In use on 2026-08-03 **across the first 15 records** — the 20 appended that evening reuse these
labels and invent none, so the vocabulary is unchanged and only the counts below have moved.
Re-derive with `jq -r '.decisions[].kind' … | sort | uniq -c`:

| kind | records | means |
|---|---|---|
| `instrument-selection` | 3 | which instrument we will use |
| `instrument-design` | 3 | how an instrument we are building is shaped |
| `corpus-policy` | 3 | what is in or out of the corpus |
| `instrument-freeze` | 1 | an instrument is frozen; changing it invalidates what it measured |
| `metric-freeze` | 1 | a metric or bar is frozen |
| `fixture-policy` | 1 | how fixtures are built |
| `instrument` | 1 | (a looser spelling of `instrument-design`; prefer that) |
| `question-set-ruling` | 1 | a ruling on the oracle question set |
| `process` | 1 | how the work itself is run |

`contract` and `integration` appeared in an earlier draft of this document and are used by no
record.

### `fundedByArtifacts` carries two shapes, and both are accepted

A file reference is either a **bare string** (a repo-relative path) or an **object**:

```jsonc
"fundedByArtifacts": [
  "research/v3/data/legacy/known-bad.json",              // 15 entries look like this
  { "ref":    "research/v3/data/legacy/known-bad.json",  // 16 look like this, 9 of them with sha256
    "sha256": "…",       // optional; a note of what the file said, NOT a checked seal
    "what":   "what this artifact contributes" }
]
```

**The object form is canonical** — write that for anything new; the string form is the same
reference with `what` left unsaid. A consumer must accept both:
`typeof entry === 'string' ? entry : entry.ref`. (A reader written to the object form alone
crashes on `entry.ref`; that has already happened once, in the 2026-08-03 adversarial review.)

**`sha256` is not a freeze seal.** No tool recomputes it. Measured 2026-08-03: of the 9 recorded
hashes, **2 no longer match the file on disk** — both from ordinary housekeeping that changed
only prose and regenerated counters, neither changing a number any decision rests on. Read a
recorded `sha256` as "this is the version I read", and re-hash before relying on it.

### `fundedBy` is warehouse record ids, and only warehouse record ids

**`warehouse recheck --decisions` consumes this shape.** It reads each record's `fundedBy`,
resolves each id against the warehouse, and reports four ways the evidence can have moved:

- **stale** — the record was amended *after* the decision's `ts` (a decision with no `ts` is
  flagged by any amendment at all, since it was funded by whatever the evidence said originally);
- **retracted** — the record is withdrawn, *whenever* it was withdrawn. A retraction that
  predates the decision still counts: citing evidence that was already gone is worse than citing
  evidence that moved afterwards, not better;
- **superseded** — the reviewer re-answered the item, so the cited record is a draft and a
  different record carries their position. The output names the replacement
  (`superseded-ids=<old>-><new>`). This is the channel the reviewer actually uses: every
  amendment in the warehouse so far is an agent-authored retraction of a derived note, and there
  are **zero** reviewer amendments;
- **missing** — the id is not in the warehouse.

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/warehouse/cli.ts recheck --decisions research/v3/data/decisions/decisions.json
```

Exit 0 and `flagged=0` means every decision here still stands on evidence that has not moved.
**Run it before any integration and before any adversarial review.**

**`flagged>0` is the standing expectation, not a defect.** Before the 2026-08-03 evening append it
reported `flagged=2`: `same-color-bar-freeze` (4 superseded ids) and `oracle-question-set-freeze`
(2). Both are re-answers the reviewer made during the round, and both analyses already exclude
superseded answers — so the science is unaffected and the flag is telling the truth about the
citation lists, not about the conclusions. The two new SAM threshold records cite the full
`sam-mask-quality-1` round the same way, so the count moves with them. **Re-derive the number; do
not quote a remembered one, and do not clear a flag by editing `fundedBy`** — a fixed citation
list is a new decision record. Recorded as
`d-2026-08-03-recheck-covers-supersession-and-retraction`. The rule that makes the check worth
anything: open every flag, *then* decide whether the conclusion moved.

Because `missing` is a real signal, `fundedBy` must never be used for prose or for file paths —
those would show up as missing evidence forever and train everyone to ignore the output. File
references go in `fundedByArtifacts`, which no tool checks and which is therefore honest about
being unchecked.

Where a decision rests on a whole review batch, `fundedBy` lists **every record id in that
batch**, not the batch id (the recheck resolves record ids). Verbose on disk, but it means an
amendment to any single answer flags the decision that was fitted to it.

Because it lists every record, `fundedBy` includes drafts the reviewer later replaced. That is
not a defect — it is why `recheck` reports `superseded` — but it means **a `fundedBy` length is
not an evidence count.** As of 2026-08-03, before the evening append:

| decision | ids cited | standing (not superseded) |
|---|---|---|
| `d-2026-08-03-same-color-bar-freeze` | 156 | **152** |
| `d-2026-08-03-oracle-question-set-freeze` | 212 | **210** |
| `d-2026-08-03-tagging-symmetry-scoping` | 13 | 13 |
| `d-2026-08-03-tagging-meta-scope` | 13 | 13 |
| `d-2026-08-03-sam-concept-set-v2` | 40 | 40 |

Both analyses drop superseded answers before fitting (`analyze-bracketing.ts`,
`analyze-probe-gold.ts`), so the frozen bar and the question-set freeze rest on the standing
numbers. Quote the right-hand column.

## The honest part

**28 of the 35 decisions have an empty `fundedBy`** (10 of the original 15; 18 of the 20 appended
on 2026-08-03, the exceptions being the two SAM threshold records). This is not an oversight and
must not be quietly filled in — and the ratio got *worse*, not better, because three of the
appended records are conversational reviewer rulings, which is exactly the class the empty field
was designed to make visible:

| decision | funded by warehouse records? |
|---|---|
| `d-2026-08-03-same-color-bar-freeze` | yes — 152 standing reviewer answers |
| `d-2026-08-03-oracle-question-set-freeze` | yes — 210 standing reviewer answers |
| `d-2026-08-03-tagging-symmetry-scoping` | yes — 13 records |
| `d-2026-08-03-tagging-meta-scope` | yes — 13 records |
| `d-2026-08-03-sam-concept-set-v2` | yes — 40 records |
| canonical embedding model | **no** — reviewer's gallery observations were relayed conversationally |
| holdout v2 redraw | **no** — reviewer authorisation was conversational |
| legacy contested-pairs recency | **no** — reviewer ruling was conversational |
| SAM prompt-set replacement | **no** — orchestrator decision on n=10; no reviewer had seen a mask *when it was written*. 100 reviewer-graded masks exist now, and that record's caveats are stale — read `-sam-concept-set-v2` and the two threshold records instead |
| `d-2026-08-03-sam-calibrated-score-threshold` | yes — 60 records (`sam-mask-quality-1`) |
| `d-2026-08-03-sam-per-group-score-thresholds` | yes — the **same** 60 records, re-analysed |
| the three reviewer rulings of 2026-08-03 (holdout purpose, area-guard scope, background via residual) | **no** — all three relayed conversationally |
| …and the rest | **no** — see each record's `fundingCaveats` |

Those ten are load-bearing decisions that `recheck` can never flag, however the reviewer later
revises the judgement behind them. Recording the gap is the point of the field being empty rather
than absent.

Re-derive the split rather than trusting this table:

```sh
jq -r '.decisions[] | "\(.id)\t\(.fundedBy|length)"' research/v3/data/decisions/decisions.json
```

`fundingCaveats` carries the rest: what the evidence does *not* establish, the confounds the
source documents name openly, the sample sizes, and every place a decision reads cleaner than the
measurement that funded it. A record whose caveats list is empty should be read with suspicion.

## Rules

- **Append, never edit.** A decision that changes gets a **new** record carrying
  `supersedes`. The superseded record stays, because artifacts were built under it (the legacy
  fixtures were built once under warn-never-block and once under recency, and the counts differ:
  35 hard-gate entries then, 37 now).
- **`ts` is the decision date, not the writing date.** `recheck` compares amendment timestamps
  against it; a wrong `ts` silently disables the check.
- **State scope negatively too.** "This does not settle X" is the sentence that stops a record
  being over-read a month later.
- **Record it when the reviewer decides, not when the code lands.** A conversational ruling with
  an empty `fundedBy` is worth more than no record.
