# V3 decision records

**Created 2026-08-03.** The first six records were written **retroactively** — those decisions
were made between 2026-08-02 and 2026-08-03, this file was not. Every record says so via
`recordedAt`.

**Counts in this document are as of 2026-08-04 (late) and are re-derived, not remembered.** The file
holds **63 decisions**, of which **22** carry a non-empty `fundedBy`. **The most recent 10 were
appended in the third batched ledger pass**, and their shape is worth reading before the history
below, because it is the first pass where the *ported-note* mechanism did real work rather than
demonstrating itself: three reviewer statements — the residual-purity post-release feedback, its
escape-answer request, and the pointing round's lenience disclosure — were ported to the warehouse
**first**, and four records then cite them by id. Two of those four (the ornament policy and the
escape-answer rule) would otherwise have had an empty `fundedBy`, and their drafts said so. **Of the
ten, four are funded and six are not**, which is the expected split: the six are two conversational
reviewer rulings, three analyses of instruments rather than of answers, and one documentation-
consistency record.

**One deliberate deviation from two of those drafts is recorded in the records themselves**, and it
is a rule worth generalising: the drafts proposed citing all 50 `residual-purity-1` labels alongside
the note, and the labels are **not** cited. A labelling rule stated in prose was not *fitted* to those
answers, and this README's own reason for listing a whole batch — "an amendment to any single answer
flags the decision that was fitted to it" — does not apply. **Cite the batch when the decision was
fitted to the batch; cite the note when the decision came from the note.** The round goes in
`fundedByArtifacts` either way.

Earlier the same day the file held **48 decisions**, of which **12** were funded. The 48th was
`d-2026-08-04-embedding-canonical-model-warehouse-funded` — a **funding amendment**: it changed no
instrument and no number, and existed only because the reviewer's four embedding-gallery observations
were ported into the warehouse and could then be cited by id. It is the first record in this file
whose entire purpose was to move a decision from unfundable to re-checkable. The first 47 arrived in
four waves:
15 written on 2026-08-03, **20 appended the same evening** from the Phase 0 adversarial review's six
fix arms and three reviewer rulings, **5 more** in the consolidated post-review pass, and **7 in the
second batched ledger pass** — the ladder's capped-reference key, the census-aware re-score's
standing, two reviewer rulings (tunable sites are a Phase 1 obligation; the `d`/`m` annotations will
not be collected), the honesty census's two definitional choices, the signature_carrier
spread-value-plus-multi-select ruling, and the whole-ramp contrast floors. **All seven carry an empty
`fundedBy`**, which is the expected shape: four are conversational rulings, two are definitions no
machine can check, and one is an analysis of files rather than of reviewer answers. Every count below
that predates a later append is marked; re-derive before quoting anything:

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
  "supersedes":        "<decision id>",          // when one replaces another
  "draftedAs":         "…"        // see below — in use, and documented late
}
```

**`draftedAs` — added by the second batched ledger pass, documented here 2026-08-04, in use on 10
records.** When a source document proposed a record under a label that is *not* in the `kind`
vocabulary below — "measurement", "verdict", "round finding", "route state", "documentation
consistency" — the record is filed under an **existing** `kind` and `draftedAs` preserves what the
source called it, and where. It exists so that reusing the vocabulary is not the same as quietly
rewriting the proposal: a reader who goes back to the analysis will find a different word there, and
this field is what tells them the difference is a filing decision rather than a disagreement. It is
read by no tool. **Reach for it whenever you file a proposal under a `kind` its author did not
use** — and do that in preference to inventing a `kind`, which is the rule the next section states.

The file is `decisions.json`, shaped
`{ "what": …, "recordedAt": …, "consumedBy": …, "decisions": [ … ] }`. Extra fields are ignored by
every consumer, so a record may carry more than the schema names.

**`supersedes` is in use as of 2026-08-03.** Two chains exist, one of them now three records long:
`d-2026-08-04-embedding-canonical-model-warehouse-funded` →
`d-2026-08-03-embedding-canonical-model-rationale` → `d-2026-08-02-embedding-canonical-model`
(same choice throughout — first the grounds were restated, because the superseded record cited a
statistic that did not support it; then the citation list was corrected, because the evidence had
reached the warehouse. **Neither link changed the instrument**, which is the clearest illustration
of the rule below that superseding does not imply new evidence), and `d-2026-08-03-sam-per-group-score-thresholds` → `d-2026-08-03-sam-calibrated-score-threshold`
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

In use on 2026-08-03 **across the first 15 records** — every later append reuses these labels and
invents none, so **the vocabulary has not changed in 48 records**, which is the strongest evidence
that it is the right size. Across all **63** records the distribution is `instrument-design` 29 ·
`process` 12 · `instrument-selection` 8 · `question-set-ruling` 5 · `corpus-policy` 5 · one each of
`metric-freeze`, `instrument-freeze`, `instrument` and `fixture-policy` (measured 2026-08-04, late;
the earlier reading over 47 records was 17 · 11 · 6 · 4 · 5 and the same four singletons). Note what
the singletons are doing: **four labels have been used exactly once each and never again**, across
two days and 63 records — they are not a vocabulary, they are four records that wanted a word. Prefer
one of the top five. Re-derive with `jq -r '.decisions[].kind' … | sort | uniq -c`:

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

**It is still those same two, at 63 decisions (checked 2026-08-04, late).** Fifteen records have been
appended since that reading, ten of them in one pass, citing 807 ids of which 712 are distinct — and
**not one added a flag.** That is the expected result and it is worth stating as a *prediction* rather
than a reassurance: a new record dated today, citing evidence recorded today, cannot be stale, cannot
have been superseded, and cannot be missing. **So a fresh append that DOES add a flag is a real
signal — investigate it before committing**, because it means the record is citing something that had
already moved when it was written.

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

**41 of the 63 decisions have an empty `fundedBy`** (10 of the original 15; 18 of the 20 appended
that evening, the exceptions being the two SAM threshold records; then 2 of 5, all 7 of the second
batched ledger pass, 5 of the 5 SAM records appended 2026-08-04, and 6 of the 10 in the third batched
pass; the 2026-08-04 funding amendment is funded). This is not an oversight and must not be quietly
filled in.
**The ratio stopped getting worse on 2026-08-04, and how it stopped is the point.** It had been
sliding — from 10/15 to 36/48 empty — because the records that kept arriving were conversational
rulings and definitional choices, exactly the class the empty field exists to make visible. The third
batched pass is the first to move it the other way (41/63 empty, against 36/48), and it did not do so
by relaxing anything: **it ported three reviewer statements into the warehouse first, and then wrote
records that cite them.** That is the only mechanism that has ever converted an empty `fundedBy` into
a full one in this file, it costs a deliberate port every time, and it works only for things the
reviewer actually *said*. Nothing can fund a decision the reviewer merely made. **Two of the empties are now empty for a subtler reason worth naming**
(`d-2026-08-03-schema-v2-split-gated-pairs` and the signature_carrier ruling that completes it): the
records that would fund them are **mechanically superseded** by a later reconciliation round, so
citing them by id would make `recheck` report the decision as standing on drafts — the precise
misreading `d-2026-08-03-gate-contradictions-are-elicitation-mode-effects` exists to refute. The
citation therefore lives in `fundedByArtifacts`, and the honest consequence is that `recheck` can
never flag either record.

| decision | funded by warehouse records? |
|---|---|
| `d-2026-08-03-same-color-bar-freeze` | yes — 152 standing reviewer answers |
| `d-2026-08-03-oracle-question-set-freeze` | yes — 210 standing reviewer answers |
| `d-2026-08-03-tagging-symmetry-scoping` | yes — 13 records |
| `d-2026-08-03-tagging-meta-scope` | yes — 13 records |
| `d-2026-08-03-sam-concept-set-v2` | yes — 40 records |
| canonical embedding model | **yes, as of 2026-08-04** — 4 records (the gallery observations, ported to the warehouse 2026-08-03 and cited by `d-2026-08-04-embedding-canonical-model-warehouse-funded`). Was **no** for the two earlier records in the chain, which is why they say so; the port did not add evidence, it made the existing evidence citable |
| holdout v2 redraw | **no** — reviewer authorisation was conversational |
| legacy contested-pairs recency | **no** — reviewer ruling was conversational |
| SAM prompt-set replacement | **no** — orchestrator decision on n=10; no reviewer had seen a mask *when it was written*. 100 reviewer-graded masks exist now, and that record's caveats are stale — read `-sam-concept-set-v2` and the two threshold records instead |
| `d-2026-08-03-sam-calibrated-score-threshold` | yes — 60 records (`sam-mask-quality-1`) |
| `d-2026-08-03-sam-per-group-score-thresholds` | yes — the **same** 60 records, re-analysed |
| the three reviewer rulings of 2026-08-03 (holdout purpose, area-guard scope, background via residual) | **no** — all three relayed conversationally |
| …and the rest | **no** — see each record's `fundingCaveats` |

Every **no** row above is a load-bearing decision that `recheck` can never flag, however the reviewer
later revises the judgement behind them. Recording the gap is the point of the field being empty
rather than absent. **The table is a sample, not a census** — it names the original ten and has not
been extended row by row as the file grew to 63 records; the query below is the census. The canonical
embedding model's row is the one **no** that has since become a **yes**, and it took a deliberate
port to do it — which is the measure of how much work discharging one of these costs.
**Two more rows would have been born as **no** and were born as **yes** instead** (2026-08-04): the
text-adjacent ornament policy and the escape-answer rule, whose own drafts predicted an empty
`fundedBy` and asked for the port *first*. That is the mechanism working as designed rather than
being demonstrated — it is cheaper to port a reviewer's words before writing the record than to
amend an unfundable record afterwards, and the difference is one script run.

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
