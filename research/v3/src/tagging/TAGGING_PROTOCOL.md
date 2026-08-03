# V3 tagging protocol

**Status:** working, written 2026-08-03 alongside the vocabulary.
**Owns:** `research/v3/src/tagging/`, `research/v3/data/tagging/`.
**Reads:** `REVIEW_UI.md` §4 (free text is the primary channel), `PHASE_0_DECISIONS.md` §4
(pathology census), `CONVENTIONS.md`.

---

## 1. What this is, and what it is not

The reviewer writes free text. That text is the primary and only required channel, and it is
**authoritative**. Nothing in this pipeline edits it, summarizes it in place, or replaces it.

What this pipeline adds is an **index**: a tagging agent reads each piece of free text and
files a *derived* note record carrying tags from a fixed, symmetric vocabulary. The index
exists so that questions like "show me every gradient objection" can be answered by a query
instead of by re-reading two hundred comments.

Three consequences follow, and they are the whole epistemics of this workstream:

1. **Tags are droppable.** Every derived record can be retracted and rebuilt from the raw
   text at any time. Nothing downstream may treat a tag as evidence in its own right — a
   decision cites the *verdict* it was funded by, never the tag that helped find it.
2. **Tags are re-derivable.** The vocabulary version is stamped on every derived record
   (`derived.agentVersion`). When the vocabulary moves, `export-untagged.ts` re-offers every
   source automatically. Same when the reviewer amends a comment: the amended text is
   different text and owes a fresh mapping.
3. **A wrong tag is cheap; a missing one is not.** Being unable to *express* something is the
   expensive failure — that is the v2-3 lesson this whole design is built around. Hence the
   binding rule below.

## 2. The binding rule: SYMMETRIC-VOCABULARY

> For every expressible complaint, its opposite must exist.

v2-3's review UI had no way to record a gradient objection. All 14 gradient notes in the
warehouse therefore asked for *more* gradient, and three arms were misdirected by evidence
that only pointed one way (`ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md` §8.7). A one-way tag
vocabulary would reproduce that failure at the index layer, where it would be harder to spot
because the raw text would look fine.

So symmetry is enforced mechanically, not by review discipline. In
`research/v3/data/tagging/vocabulary.json` every tag names exactly one `opposite`; the
linter (`lintVocabulary` in `vocabulary.ts`) asserts that the relation is an **involution
within one axis** — the opposite exists, names this tag back, is not the tag itself, and sits
on the same axis — and that every axis holds an even number of tags. `loadVocabulary` runs the
linter on every read, so no tool in this workstream can operate against a broken vocabulary.

Symmetry pays for itself twice: it makes the missing half of a complaint class impossible to
ship, and it gives the importer a contradiction check for free (a comment tagged both
`coverage/too-dark` and `coverage/too-light` is a mis-mapping, and is refused).

The current vocabulary: **66 tags, 33 opposed pairs, 8 axes** — `gradient`, `coverage`,
`role`, `contrast`, `collapse`, `identity`, `provenance`, `meta`. Human-readable list:
`research/v3/data/tagging/TAGS.md` (generated from the JSON; run `build-tags-md.ts` after
editing it).

## 3. Running a pass

A tagging pass is three commands. It is safe to run at any time, including mid-batch — an
untagged comment simply resurfaces on the next pass.

### Step 1 — export

```
node --experimental-strip-types research/v3/src/tagging/export-untagged.ts \
  --file research/v3/data/warehouse/warehouse.jsonl \
  --out  research/v3/data/tagging/work/pass-<n>.json
```

Writes a work file listing every piece of reviewer free text that has no current derived
record. What is deliberately excluded: empty comments, retracted records, superseded
pre-release drafts (an item edited three times before release is one comment, not three), and
derived records themselves. What is deliberately included: sources whose text has been
amended since they were tagged, and sources tagged against an older vocabulary version.

The exporter prints a one-line summary to stderr — `entries`, `considered`,
`already-tagged`, `stale-version`, `stale-amended`. Read it: a jump in `stale-version` means
the vocabulary moved and the whole index is being rebuilt, which is fine but not free.

**The work file never carries variant ids.** The warehouse knows which side was trunk and
which was an arm; the tagging agent does not need to and must not. Its job is to read the
human's words, not to know which arm won (`REVIEW_UI.md` §2, blinding).

### Step 2 — tag

Hand the work file to a **fresh subagent** with the prompt in §4, verbatim. Fresh matters: an
agent that has been working on an arm has an interest in what the comments say, and the whole
point of the index is that it is not an interested reading.

The subagent edits the work file in place, adding `tags` (and optionally `unsure` and `note`)
to each entry.

### Step 3 — import

```
node --experimental-strip-types research/v3/src/tagging/import-tags.ts \
  research/v3/data/tagging/work/pass-<n>.json \
  --file research/v3/data/warehouse/warehouse.jsonl \
  --ambiguous research/v3/data/tagging/work/needs-human-review.json
```

Validates the whole file before writing anything, then appends one derived note record per
filled entry. Exits non-zero if any problem was found, and names each one. Run with
`--dry-run` first if the pass was large.

Validation, in order: the vocabulary passes the symmetry linter; the work file parses; its
vocabulary version matches the current one (`--allow-vocab-drift` to override); every tag is
in the vocabulary; no entry carries a tag and its opposite; every `sourceId` exists in the
warehouse, is not retracted, and carries taggable free text; no `sourceId` appears twice.

A vocabulary-drift problem invalidates the **whole file** — nothing is written. A per-entry
problem invalidates only that entry; the rest land, and the bad entry resurfaces on the next
export.

**Idempotency.** An entry whose source already has a live derived record from the same agent
at the same vocabulary version is skipped. Re-importing the same work file appends nothing,
and the log does not grow. To redo a mapping on purpose, pass `--supersede`: existing derived
records for those sources are retracted by amendment first, so exactly one live derived record
per source remains.

### Reading the report

- `zero-tag` — entries the tagger read and mapped to nothing. Zero tags is a **real answer**,
  not a skip, and it is filed as such (otherwise the entry would resurface forever). But watch
  the rate: **a rising zero-tag fraction means the vocabulary is missing a complaint class.**
  That is this pipeline's own instrument-bias canary, and it is the main reason to look at the
  report at all.
- `ambiguous` — entries the tagger flagged `unsure`. They are imported (with
  `meta/tagger-unsure` appended to their tags, so they stay findable), *and* written out to
  the `--ambiguous` file for a human to settle. Fix them with an edited work file and
  `--supersede`.
- `problem …` lines — one per validation failure, with the source id.

## 4. The subagent prompt — verbatim

Paste this exactly, substituting the two paths. Do not add context about what the campaign is
currently testing; that is the interest the fresh agent is supposed to lack.

---

> You are a tagging agent. Your job is to index reviewer comments about generated color
> palettes so they can be queried later. You are not judging the palettes, and you are not
> summarizing the reviewer.
>
> Read the tag vocabulary at `research/v3/data/tagging/TAGS.md`. It has 66 tags in 33 opposed
> pairs across 8 axes. Every tag has a definition and an example phrase.
>
> Then open the work file at `<WORK_FILE_PATH>`. It contains a list of `entries`. For each
> entry, read `entry.text` — that is the reviewer's own words, and it is the only thing you
> are tagging. Use `entry.context` (batch, grades, artwork path, confound note) **only** to
> disambiguate the text; never tag the context.
>
> For each entry, add these fields:
>
> - `"tags"`: an array of tag ids from the vocabulary. **Zero or more.** An empty array is a
>   correct and expected answer — it means you read the comment and no vocabulary tag applies.
>   Never leave `tags` off an entry; that means "not done".
> - `"unsure": true` — only when you genuinely cannot decide which tag the text means, or
>   whether it means any. A human will look at these.
> - `"note"`: one short line saying why you chose those tags. Plain language. Optional but
>   useful — it is what gets stored as the derived record's text.
>
> Rules, in order of importance:
>
> 1. **Never invent a tag.** If the comment says something the vocabulary cannot express, use
>    an empty `tags` array and write what is missing in `note`. Do not approximate with a tag
>    that is nearly right. A missing tag is a signal we need; a wrong tag is noise we have to
>    find and undo. If you find yourself wanting a tag that does not exist, say so in `note`
>    using the words "VOCABULARY GAP:".
> 2. **Never assign both a tag and its opposite** to the same entry. The vocabulary lists each
>    tag's opposite. If the comment really does say both, it is about two different things —
>    pick the one the text is clearest about and set `"unsure": true`.
> 3. **Tag what the reviewer said, not what you infer they meant.** "This one's better" is
>    `meta/improvement`, nothing more. Do not reason from the grades or the artwork to a
>    complaint the reviewer did not write.
> 4. **A comment may carry several complaints.** Tag all of them. A comment may also carry
>    none — praise with no diagnosis is an empty array.
> 5. **Direction matters more than anything else.** The vocabulary is symmetric on purpose:
>    "needs a gradient" and "should not be a gradient" are different tags, and getting the
>    direction wrong is the single most damaging mistake you can make here. When the direction
>    is unclear, set `"unsure": true` rather than guessing.
> 6. **Do not edit anything else.** Not `text`, not `context`, not `sourceId`, not the file
>    header. Do not reorder or remove entries.
> 7. **Do not touch the warehouse**, any file under `research/v3/data/warehouse/`, or any
>    other file in the repository. The work file is the only thing you write.
>
> When you are done, write the file back to the same path as valid JSON and report: how many
> entries you tagged, how many you left empty, how many you marked unsure, and any vocabulary
> gaps you noticed.

---

## 5. What the derived record looks like

One `note` record per tagged entry, appended through the warehouse library:

```
type:    note
author:  { kind: "agent", id: "tagging-agent" }
batch:   copied from the source record  (so the index is queryable like the source)
itemId:  copied from the source record
artwork: copied from the source record
text:    the tagger's one-line rationale — NOT a copy of the reviewer's words
tags:    [ ...vocabulary tag ids... ]
derived: { fromRecordId: <source record id>, agent: "tagging-agent", agentVersion: <vocabulary version> }
```

`text` deliberately does not duplicate the reviewer's comment. Two copies of the same
sentence is two things to keep in sync, and the raw text is one `fromRecordId` away.

## 6. Changing the vocabulary

The vocabulary will move — v2-3's last day still surfaced two genuinely new structural
complaint classes, so expect the same here. The procedure:

1. Edit `research/v3/data/tagging/vocabulary.json`. **Add tags in pairs.** The linter will
   refuse an odd axis, a dangling opposite, or a one-way relation; that refusal is the
   feature.
2. Bump `version` (and `updated`). This is what makes the change detectable in the warehouse.
3. Run `node --experimental-strip-types research/v3/src/tagging/build-tags-md.ts` to
   regenerate `TAGS.md`, and the test suite to confirm the linter is happy.
4. Run a pass. Every existing source re-exports automatically at the new version, so the whole
   index is rebuilt against the new vocabulary. Old derived records stay in the log as history;
   pass `--supersede` if you want exactly one live record per source.

Sources for what belongs in the vocabulary: the pathology census (`PHASE_0_DECISIONS.md` §4 —
P1 off-artwork ramp, P2 indistinct ramp exposure, P3/P4 collapse and near-neutral outliers, P5
identity coverage shortfall), the v2-3 complaint classes distilled in the field guide, and the
`VOCABULARY GAP:` notes the tagging agent leaves behind. That last one is the live channel:
read it every pass.

## 7. Tests

```
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/tagging-*.test.ts
```

`tagging-vocabulary.test.ts` covers the linter (clean vocabulary, and one negative case per
rule: dangling opposite, self-opposite, one-way relation, cross-axis opposite, odd axis,
duplicate id, bad id shape, undeclared axis, duplicated text), the pair partition, the
presence of each v2-3 complaint class in both directions, and that `TAGS.md` matches the JSON.

`tagging-tools.test.ts` covers export selection rules, the export/import round trip on a
fixture warehouse, idempotency (re-import appends nothing; `--supersede` retracts and
refiles), staleness (amended text, moved vocabulary version), and every validation refusal
(out-of-vocabulary tag, contradiction, missing source, duplicate source, vocabulary drift,
derived-record-as-source), plus the CLI end to end.
