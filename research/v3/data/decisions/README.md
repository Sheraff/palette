# V3 decision records

**Created 2026-08-03.** The first six records are written **retroactively** — the decisions were
made between 2026-08-02 and 2026-08-03, this file was not. Every record says so via `recordedAt`.

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
- **A decision could outlive its evidence.** If a reviewer amends or retracts a verdict, every
  decision that verdict funded is now standing on something that moved. Nobody can find those
  decisions by reading.

The second problem is the one the warehouse can solve mechanically, which is why `fundedBy` is a
list of **warehouse record ids** and not a list of prose citations.

## Schema

```jsonc
{
  "id":        "d-<yyyy-mm-dd>-<slug>",  // stable, never reused, never renumbered
  "ts":        "ISO-8601",               // when the DECISION was made, not when written down
  "kind":      "instrument-selection | instrument-freeze | metric-freeze |
                corpus-policy | fixture-policy | contract | integration",
  "decision":  "what was decided, in plain language, stated so a reader who
                disagrees knows exactly what they are disagreeing with",
  "scope":     "what it binds and — as important — what it does NOT bind",
  "fundedBy":  ["<warehouse record id>", ...],   // see below
  "recordedAt": "yyyy-mm-dd",

  // optional, and in practice always present:
  "fundedByArtifacts": [ { "ref": "repo-relative path",
                           "sha256": "…",        // when the artifact is frozen
                           "what": "what this artifact contributes" } ],
  "fundingCaveats":    [ "…" ],   // see "The honest part" below
  "supersedes":        "<decision id>"           // when one replaces another
}
```

The file is `decisions.json`, shaped `{ …, "decisions": [ … ] }`. Extra fields are ignored by
every consumer, so a record may carry more than the schema names.

### `fundedBy` is warehouse record ids, and only warehouse record ids

**`warehouse recheck --decisions` consumes this shape.** It reads each record's `fundedBy`,
resolves each id against the warehouse, and reports:

- **stale** — the record was amended *after* the decision's `ts` (a decision with no `ts` is
  flagged by any amendment at all, since it was funded by whatever the evidence said originally);
- **missing** — the id is not in the warehouse.

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/warehouse/cli.ts recheck --decisions research/v3/data/decisions/decisions.json
```

Exit 0 and `flagged=0` means every decision here still stands on evidence that has not moved.
**Run it before any integration and before any adversarial review.**

Because `missing` is a real signal, `fundedBy` must never be used for prose or for file paths —
those would show up as missing evidence forever and train everyone to ignore the output. File
references go in `fundedByArtifacts`, which no tool checks and which is therefore honest about
being unchecked.

Where a decision rests on a whole review batch, `fundedBy` lists **every record id in that
batch**, not the batch id (the recheck resolves record ids). Verbose on disk, but it means an
amendment to any single answer flags the decision that was fitted to it. The six records here
cite 368 warehouse record ids between them.

## The honest part

Four of the first six decisions have an **empty `fundedBy`**. This is not an oversight and must
not be quietly filled in:

| decision | funded by warehouse records? |
|---|---|
| `d-2026-08-03-same-color-bar-freeze` | yes — 156 reviewer answers |
| `d-2026-08-03-oracle-question-set-freeze` | yes — 212 reviewer answers |
| canonical embedding model | **no** — reviewer's gallery observations were relayed conversationally |
| holdout v2 redraw | **no** — reviewer authorisation was conversational |
| legacy contested-pairs recency | **no** — reviewer ruling was conversational |
| SAM prompt-set replacement | **no** — orchestrator decision on n=10; no reviewer has seen a mask |

Those four are load-bearing decisions that `recheck` can never flag, however the reviewer later
revises the judgement behind them. Recording the gap is the point of the field being empty rather
than absent.

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
