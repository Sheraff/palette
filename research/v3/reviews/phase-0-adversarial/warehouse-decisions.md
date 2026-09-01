# Adversarial review — the ground-truth ledger

**Scope:** `research/v3/src/warehouse/` (records, warehouse, cli, tests),
`research/v3/data/warehouse/warehouse.jsonl`, `research/v3/data/decisions/decisions.json`.
**Date:** 2026-08-03. **Method:** every number below was re-derived from the raw JSONL with
`jq`/`shasum` or from a temp copy under `/Users/Flo/.claude/jobs/e3ef7e22/tmp`, then compared
against what the code reports. No file in the repo was modified except this one.

Items already on `PHASE_0_LOOSE_ENDS.md` are not re-reported. Nothing here is on it.

---

## Summary

| # | Severity | Claim | Status |
|---|---|---|---|
| F1 | **critical** | `warehouse status` reports 290 phantom pending items across two fully-answered released batches | CONFIRMED |
| F2 | **critical** | `resolve()` applies amendment patches with no field allowlist — a stored amendment can rewrite artwork identity, itemId and palette hash at query time | CONFIRMED |
| F3 | major | `recheck` is blind to supersession; 6 live `fundedBy` ids are already superseded and `flagged=0` | CONFIRMED |
| F4 | major | A decision citing already-retracted evidence is never flagged; "a retracted record must fund nothing" has no enforcement | CONFIRMED |
| F5 | major | 2 of 9 recorded `fundedByArtifacts.sha256` are stale; nothing recomputes them | CONFIRMED |
| F6 | major | 10 demo records live in the ground-truth ledger — including 100% of its verdicts | CONFIRMED |
| F7 | minor | `query --item` can never match an oracle label, though the batch publishes per-question item ids | CONFIRMED |
| F8 | minor | `--raw --no-retracted` silently ignores the retraction filter | CONFIRMED |
| F9 | minor | `data/decisions/README.md` is stale and `fundedByArtifacts` carries two incompatible shapes | CONFIRMED |

What held up under attack is listed at the end — it is most of the module.

---

## F1 — CRITICAL. `warehouse status` reports 290 pending items that do not exist

`warehouse.ts:577` counts an oracle round's reviewed items by `record.imageId`:

```ts
if (!entry.retracted && !superseded.has(entry.original.id))
    reviewedItems.get(batchId)!.add(record.imageId)
```

The comment two lines above justifies it: *"For these rounds the image id **is** the batch's item
id (the review server writes the item id into `imageId`)"* (`warehouse.ts:322-323`, repeated at
`warehouse.ts:571-577`).

**That claim is false for every multi-question batch.** Hand-counted from the JSONL:

| batch | records | distinct imageId | distinct questionKey | declared itemCount | released item ids | `status` reviewed / pending |
|---|---|---|---|---|---|---|
| oracle-probe-gold-1 | 180 | **30** | 6 | **180** | 180 (`pg-bg_visible-06c5954c94eb`, …) | **30 / 150** |
| bcde-validation-1 | 163 | **20** | 8 | **160** | 160 (`bv-grain_or_noise-6e3ed0aa2c70`, …) | **20 / 140** |
| bracketing-round-1 | 72 | 72 | 2 | 72 | 72 | 72 / 0 |
| bracketing-round-2 | 84 | 80 | 1 | 80 | 80 | 80 / 0 |
| oracle-premise-disambiguation-1 | 32 | 30 | 1 | 30 | 30 | 30 / 0 |
| sam-mask-quality-1 | 60 | 60 | 8 | 60 | 60 | 60 / 0 |
| sam-mask-quality-2-v2-ratification | 40 | 40 | 4 | 40 | 40 | 40 / 0 |

`itemCount` for the two multi-question batches is images × questions, and the item ids the
`batch-complete` record publishes are per (question, image) — `pg-<questionKey>-<hash>`. But
**703 of 703 `oracle-label` records carry no `itemId` field at all** (verified: `has("itemId")`
is false on every one), so the reviewed set can only ever key off the image and tops out at 30
and 20.

Both batches are fully answered and released:

- `oracle-probe-gold-1`: 180 records, zero duplicate `(batch, image, question)` keys, `batch-complete`
  with `releasedItemIds.length == 180, distinct == 180`. **180/180 answered. `status` says 150 pending.**
- `bcde-validation-1`: 163 records, 3 duplicate keys (superseded re-answers), so 160 standing,
  `releasedItemIds.length == 160`. **160/160 answered. `status` says 140 pending.**

**Why this is the worst finding here.** The brief for this module is that agents trust the CLI
instead of reading the file. An agent asking "is the oracle validation round done?" is told 290
human answers are outstanding on two rounds that are finished, released, analysed, and already
cited by `d-2026-08-03-oracle-question-set-freeze`. The failure is silent, permanent (no future
answer can close it — there are only 30 and 20 images), and points the expensive way: it invents
reviewer work rather than hiding it.

Note the second-order hazard: `pending` is meaningless across batches because the corpus uses two
incompatible `itemCount` conventions — images (5 batches) and images×questions (2 batches) — with
nothing in the record distinguishing them.

## F2 — CRITICAL. Amendment patches are allowlist-checked at one door only

`records.ts:113-136` states the guarantee plainly:

> An amendment expresses a second thought about a *judgment*. It may never change what the record
> was *about* — identity, provenance, and the palettes that were actually shown are frozen at
> append time. … letting an amendment rewrite a content hash would destroy that guarantee.

`AMENDABLE_FIELDS` is enforced by `assertAmendablePatch`, which is called from exactly one place:
`warehouse.ts:114`, inside `verifyAmendment`, which `append()` skips when
`verifyAmendmentTarget: false` (`warehouse.ts:81`).

`resolve()` re-applies patches with no check whatsoever (`warehouse.ts:258`):

```ts
current = { ...current, ...amendment.patch } as WarehouseRecord
```

and `validateRecord`'s amendment branch only requires `patch` to be an object (`records.ts:645-651`).

**Demonstrated.** A single line appended by hand to a temp warehouse — the record validates, the
schema version is right, nothing throws:

```json
{"id":"am-bad-0002","type":"amendment","ts":"2026-08-03T05:00:00.000Z","schema":"v3.0",
 "author":{"kind":"agent","id":"x"},"targetId":"<verdict id>",
 "patch":{"artwork":{"path":"/tmp/OTHER.jpg","sha256":"bbbb…"},
          "sideA":{"paletteHash":"FORGED","fingerprint":{…},"variantId":"A"},
          "itemId":"i-FORGED"},
 "retract":false,"reason":"forge identity"}
```

Result through `readAll` → `resolve`:

```
artwork.path = /tmp/OTHER.jpg   itemId = i-FORGED   sideA.paletteHash = FORGED
```

The verdict is now, at query time, about a different artwork and a different palette than the one
the reviewer was shown.

**This is not only an attack story.** The warehouse is a plain append-only file written by at
least four tools (`src/warehouse/cli.ts`, the review server via `warehouse.ts append()`,
`src/tagging/import-tags.ts`, `data/tagging/port-reviewer-notes.ts`), edited by agents, and merged
in git. A bulk replay with `validate: false` / `verifyAmendmentTarget: false` — the documented
escape hatch at `warehouse.ts:44-50` — writes unchecked patches through the normal API. There is
**no fsck**: `status` reports `orphan-amendments` (`cli.ts:309`) and nothing else, so a
non-amendable patch is invisible to every command in the CLI.

Cheap fix in the same shape as the orphan check: run `assertAmendablePatch` inside `resolve()`
(or a `warehouse verify` command) against the resolved root's type, and surface violations on
`status` next to `orphan-amendments`.

## F3 — MAJOR. `recheck` cannot see the reviewer changing their mind

`recheckFundedBy` (`warehouse.ts:426-464`) flags **amended** and **missing** evidence. It never
consults supersession — the warehouse's own, separately implemented notion of "a later record on
the same item replaced this one" (`warehouse.ts:299-335`).

Re-derived from the live file: **11 records are superseded** (my hand count — 9 duplicate
`(batch, imageId, questionKey)` keys plus 2 duplicate `(batch, itemId)` verdict keys — matches the
library's `supersededIds` exactly, a clean cross-check of that function). **6 of them are cited as
funding evidence:**

| decision | superseded ids cited |
|---|---|
| `d-2026-08-03-same-color-bar-freeze` | 4 (`o-mscxuf7w-1a2f67a2`, `o-mscxug4b-d09c31a3`, `o-mscxugtt-b8855a77`, `o-mscxuhfj-51b33d2c`) |
| `d-2026-08-03-oracle-question-set-freeze` | 2 (`o-mscwakr9-205bf25c`, `o-mscwar06-435b9291`) |

`warehouse recheck --decisions data/decisions/decisions.json` reports `flagged=0`.

**Why this matters more than the count.** Look at what amendments are actually used for in this
warehouse: all 13 are agent-authored retractions of derived tag notes ("superseded by a
re-derivation at vocabulary 2.1.0"). **Zero reviewer amendments exist.** The channel the reviewer
does use to change an answer is re-answering — which appends a new record and supersedes the old
one, invisibly to the gate. The decisions README's stated purpose is that "a decision could
outlive its evidence… Nobody can find those decisions by reading"; the mechanism built to solve
that watches the one channel the reviewer has never used and ignores the one they do.

**The science is not affected.** `analyze-bracketing.ts:293` and `analyze-probe-gold.ts:204` both
drop superseded answers before fitting, so the frozen bar and the question-set freeze rest on the
standing answers. What is wrong is the ledger's own arithmetic: `data/decisions/README.md` bills
these as "156 reviewer answers" and "212 reviewer answers"; the standing counts are **152** and
**210**.

## F4 — MAJOR. Retracted evidence funds decisions silently

`records.ts:348` — "`retract` withdraws the target entirely; a retracted record must fund nothing."
Nothing enforces it.

`recheckFundedBy` computes staleness as `entry.amendments.filter(a => a.ts > decision.ts)`
(`warehouse.ts:440`). A retraction that *predates* the decision is filtered out, and
`entry.retracted` is never read. So citing evidence that was already withdrawn when you cited it
is the one case the gate is guaranteed to miss.

**Demonstrated** on a temp warehouse: verdict retracted at `2026-08-04T00:00:00Z`, decision dated
`2026-08-05T00:00:00Z` citing it → `recheckFundedBy` returns `[]`.

Latent today (0 of the 421 unique funded ids are retracted), but pointed straight at the next
move: the 13 retracted records are `note` records, and `PHASE_0_LOOSE_ENDS.md` C5 tasks
housekeeping with putting exactly this class of ported note id into `fundedBy`. The retraction
reason on all 13 — "superseded by a re-derivation" — is precisely the situation where a stale id
gets copied forward.

## F5 — MAJOR. Recorded evidence hashes have already drifted, and nothing recomputes them

9 `fundedByArtifacts` entries record a `sha256`. I recomputed all 9. **7 match; 2 do not.** Both
drifts pinned to the commit that moved them:

**1. `research/v3/data/legacy/known-bad.json`** — cited by `d-2026-08-02-legacy-contested-pairs-recency`

```
recorded  c61dfe9f82fb28dfeb805a8fba87d4aa11b9d7b70aeb7b2ad5fee52f7f91cdbf  = blob at c498610, 2026-08-02 20:48
actual    81386caa7cd0aa5018a6543cc8e2eaa49a97fc781be4c2f09260d2eee4a1025f  = since dcef377, 2026-08-03 13:14
          ("research/v3: legacy generator carries the frozen bar — fixtures regenerated")
```

Substantive diff: **none.** 37 entries, byte-identical id set. The only change is the
`meta.matchSemantics` prose, rewritten from "The bar is UNCALIBRATED pending the reviewer
bracketing round" to "the FROZEN region-dependent `sameColorBar(pair)`". (Worth noting against
`PHASE_0_LOOSE_ENDS.md` A8, which reports the sibling `data/legacy/README.md` as still stale in
the same direction — the JSON was updated, the README was not.)

**2. `research/v3/data/oracle-validation/probe-gold-1-analysis.json`** — cited by
`d-2026-08-03-oracle-question-set-freeze` (decision `ts` 12:00)

```
recorded  0d80a6a37ef4d1a4f4a4007f7f4f1045002bfb9233f1414ae1f1b15f36f68af3  = blob at e025810, 2026-08-03 12:32
actual    346636539758e57361fe9dcfb19e610b9391edaa9d778ed102682c05f324d77f  = since cf383b1, 2026-08-03 16:24
```

The analysis the question-set freeze rests on was regenerated four hours after the freeze.
Substantive diff: `generatedAt`, and two `skipped.otherBatch` counters (398→458, 250→310) that
moved only because the warehouse grew. **No agreement number changed.**

**Both are benign in substance and that is the point.** 22% of the recorded hashes went stale
inside a single day, from ordinary housekeeping, and no tool, test, or CI step recomputes any of
them. `data/decisions/README.md` is candid that `fundedByArtifacts` "no tool checks and which is
therefore honest about being unchecked" — but writing a `sha256` into a record whose schema
comment says "when the artifact is frozen" reads as a freeze seal to every later reader. Either
check the hashes (a ten-line script; I ran one) or stop recording them.

## F6 — MAJOR. The ground-truth ledger contains demo data, and it is 100% of the verdicts

Two batches in the live warehouse are smoke-test fixtures:

```
demo-batch-0001        5 verdicts + 1 batch-complete   purpose=mechanism
demo-calibration-0001  3 verdicts + 1 batch-complete   purpose=calibration
```

All 8 records are authored `{"kind":"human","id":"flo"}`, carry real artwork paths under
`/Users/Flo/GitHub/palette/00/`, real grades, and one real-looking comment ("Some contrast issue
between the accent and the surface of side A"). **These 8 are every `verdict` record the warehouse
contains.** `warehouse status` closes with `verdicts=8` and no marker; the honest answer to "how
many reviewer verdicts exist in v3" is **zero**.

They are distinguishable only by fields the dense CLI output does not show:
`sideA.fingerprint.algorithmVersion` is `demo-fixture-alpha`/`demo-fixture-bravo` and the git
commits are the placeholders `0000…` and `1111…`. Nothing in `records.ts` marks a record as
synthetic, and no filter excludes them.

Concrete downstream exposure: the movement rule (`GRADE_RANK`, `records.ts:66`) and any Phase 1/2
grade-distribution or bake-off analysis that selects `type == "verdict"` will ingest 8 fabricated
judgments — 5 `weak`, 2 `acceptable`, 1 `unacceptable` — as reviewer ground truth. Two of them are
also superseded duplicates, so a naive count double-reports.

Not on `PHASE_0_LOOSE_ENDS.md`.

## F7 — minor. `query --item` cannot match an oracle label

`filterResolved` reads `record.itemId` (`warehouse.ts:643-646`). No `oracle-label` record has that
field (703/703). Meanwhile the `batch-complete` records publish 440 per-question item ids as the
official released set. So:

```
$ warehouse query --item pg-bg_visible-06c5954c94eb
(nothing)
```

for an item that exists, was answered, and was released by name. An agent handed an item id from a
release record and told to look it up gets silence, not an error.

## F8 — minor. `--raw --no-retracted` silently drops the retraction filter

`asEntry` hardcodes `retracted: false` (`cli.ts:196-198`), so `filterResolved`'s `excludeRetracted`
can never fire in raw mode. Measured on the live file:

```
query --raw --no-retracted --type note  →  39 lines
query       --no-retracted --type note  →  26 lines
```

13 retracted notes come back from a query that asked for no retracted records. `--type amendment`
turns raw mode on implicitly (`cli.ts:335`), so the flag combination arises without anyone typing
`--raw`.

## F9 — minor. The decisions README no longer describes the decisions file

- "The six records here cite 368 warehouse record ids between them" — actual: **15 records citing
  434 ids (421 unique)**.
- `fundedByArtifacts` carries **two incompatible shapes in the same file**: 9 objects
  `{ref, sha256, what}` and **15 bare strings**. The 15 strings all resolve on disk, but none
  carries a hash or a `what`, and a consumer written to the documented schema crashes on
  `a.ref` (mine did).
- 4 `kind` values are outside the README's enumerated vocabulary: `instrument-design` (×3),
  `process`, `instrument`, `question-set-ruling`.

None of this breaks a tool (extra fields are ignored by design), but the README is the only
specification of a file whose whole purpose is being machine-checkable.

---

## What held up

Stated because a review that only lists defects misrepresents the module.

**Append-only: confirmed, no exceptions.** The single writer is `append()` →
`openSync(file, 'a')` (`warehouse.ts:86-93`), fsync'd per record. I swept `src/`, `oracle/` and
`data/` for `writeFileSync` / `appendFileSync` / `truncate` / `renameSync` / `unlinkSync` /
`rmSync` / `createWriteStream` against the warehouse path: **no code path anywhere rewrites or
truncates `warehouse.jsonl`.** The review server's `store.ts` is a different file (the batch log),
also opened `"a"` only, with serialized appends and `datasync()`.

**CLI totals are truthful.** Hand-count vs `status`:

| | hand-counted (`jq`/`wc`) | `warehouse status` |
|---|---|---|
| records | 773 (773 lines, 0 blank, file ends in `\n`) | 773 |
| verdict / note / amendment / batch-complete / oracle-label | 8 / 39 / 13 / 10 / 703 | 8 verdicts, 13 amendments |
| schema versions | 773 × `v3.0` | — |
| orphan amendments | 0 (all 13 targets resolve to `note` records) | 0 |
| batches | 10 + `-` | 10, open=0 |

Per-batch record counts match line for line. The one number that does not survive is `pending`
(F1).

**Amendment semantics are correct.** Verified on a temp warehouse:

- depth-3 chain (`v → am1 → am2 → am3`, each amending the previous amendment) resolves to the
  newest patch — latest wins, all three collected into one chain;
- an amendment appended **last** but carrying an **older** `ts` correctly does *not* win —
  ordering is by timestamp with append order only as tiebreak (`warehouse.ts:213-216`);
- `append()` rejects an amendment whose target does not exist
  (`amendment target v-does-not-exist not found`);
- an orphan written raw is caught by `findOrphanAmendments` and dropped by `resolve()` rather
  than being applied to anything;
- cycle detection is present in both `verifyAmendment` and `findRoot`.

**`recheck --decisions` works end-to-end** (brief item 3). Against a temp copy of the live
warehouse with one amendment appended to a real funded id, and the **real** `decisions.json`:

```
decision=d-2026-08-03-same-color-bar-freeze kind=metric-freeze ts=2026-08-03T08:15:42Z
  stale=1 retracted=0 missing=0 ids=o-mscbsw4i-2c0dc45a fields=answer
total decisions=15 flagged=1        exit=1 under --fail-on-hit
```

Correct on all four timestamp cases: flags when the amendment postdates the decision, does *not*
flag when it predates it, flags every amendment when the decision has no `ts`, and reports missing
ids separately. Its blind spots are F3 and F4, not its stated job.

**`fundedBy` integrity is clean.** All **421 unique ids across 15 decisions resolve in the
warehouse — 0 missing.** Types are honest (`oracle-label` ×408, `note` ×13); no prose or file paths
have leaked into the field, which is the failure mode the README warns about. All 24
`fundedByArtifacts` refs (9 objects + 15 strings) exist on disk.

**Dual-grade and oracle-label schemas match the documents.** `records.ts` enforces
`REVIEW_UI.md` §2 verbatim: both sides graded in `pairwise`, `sideB`/`gradeB`/`preference` all
required; in `absolute` mode all three must be `null` and validation rejects them otherwise
(`records.ts:602-610`). `oracle-label` carries the `human_labels` columns §9.2 names (imageId,
labelSchemaVersion, author as reviewer, answer, ts) plus `stratum` for the per-stratum stopping
rule, and deliberately no reviewer timing, per §4. Multi-select answers are accepted as string
arrays, matching §6's "one record carrying a sorted array". The "oracle-label counts as reviewed"
rule is a warehouse design decision with its rationale in the code (`warehouse.ts:571-577`) — it is
**not** claimed by `REVIEW_UI.md` or `CONVENTIONS.md`, which say nothing about `reviewed`/`pending`
at all. The rule itself is right; its keying is F1.

**Tests:** 67/67 pass (`warehouse-cli.test.ts`, `warehouse-library.test.ts`). None of F1–F4 is
covered: there is no test with a multi-question batch, none that resolves a patch touching a
non-amendable field, none asserting supersession interacts with `recheck`, and none dating a
decision after a retraction.
