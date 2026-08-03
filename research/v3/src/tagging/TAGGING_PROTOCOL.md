# V3 tagging protocol

**Status:** working, written 2026-08-03 alongside the vocabulary; extended the same day to
vocabulary v2 (axis kinds, scope, and the four instrument/criterion axes) after the v1 smoke
pass mapped 13 of 13 reviewer observations to zero tags.
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

The current vocabulary (2.1.0): **103 tags across 12 axes — 48 opposed judgment pairs (96 tags)
and 7 descriptive observations.** Judgment axes: `gradient`, `coverage`, `role`, `contrast`,
`collapse`, `identity`, `provenance`, `meta`, `instrument-fitness`, `concept`, `criterion`.
Descriptive axis: `instrument-behavior`. Human-readable list:
`research/v3/data/tagging/TAGS.md` (generated from the JSON; run `build-tags-md.ts` after
editing it).

## 2a. Where the rule binds: judgment axes and descriptive axes (v2)

The v1 smoke pass mapped 13 reviewer observations to **zero** tags. Every one of them was about
an instrument or about a criterion, and v1 was entirely about published palettes. Closing that
gap forced the design decision this section records, because one of the four missing classes
cannot be made symmetric without lying:

> "For krafty, DINOv2 focused on the layout and flowers, while DINOv3 seems to have focused more
> on the strong typography."

That has no opposite. It is not a complaint; it describes what an instrument did. Inventing a
negation for it would produce a tag nobody would ever file — a worse instrument defect than the
gap it patches, because the vocabulary would then *look* symmetric while carrying dead tags.

So the involution rule is **scoped, not weakened**. Every axis declares a `kind`:

- **`judgment`** — the tag asserts something should have been otherwise. The involution rule
  applies **unchanged**: one `opposite`, mutual, on the same axis, never itself, and an even
  number of tags on the axis. Every complaint the reviewer can express — about a palette, an
  instrument, a label, or a criterion — lives on a judgment axis. Nothing here is relaxed, and
  the new axes `instrument-fitness`, `concept` and `criterion` are all judgment axes precisely
  so that complaints about instruments and about the question set inherit the anti-bias rule.
- **`descriptive`** — the tag records what an instrument was observed to do, with no claim that
  it should have been otherwise. `opposite` is null. In its place, a law of the same shape minus
  self-inversion:
  1. **Totality** — every descriptive tag names at least one `counterpart`: the observation you
     would have filed had the instrument done the other thing. Same axis, never itself.
  2. **Surjectivity** — every descriptive tag must itself be named as some other tag's
     counterpart. Without this you can say "it matched by artist rather than by image" and have
     no way to say the reverse — one-way recording, the exact v2-3 failure in new clothes.
  3. **Valence coverage** — every descriptive tag declares `valence` (`positive` / `neutral` /
     `negative`), and every descriptive axis must carry at least one positive and at least one
     negative tag. An axis that can only record an instrument misbehaving is a one-way
     instrument.

An involution is a total, surjective, self-inverse map on a set of tags. Descriptive axes keep
totality and surjectivity and drop only self-inversion (and with it injectivity — one counterpart
may serve several tags). **That is the entire exemption**, it is stated in the vocabulary file
itself (`symmetryScoping`), and `lintVocabulary` enforces it — it is not left to review
discipline. Two further guards keep the exemption from spreading: a descriptive tag may not carry
an `opposite`, and a judgment tag may not carry `counterparts` or `valence`; either is a
`consistency` lint error. If a proposed tag says something *should* have been otherwise, it
belongs on a judgment axis and owes an opposite.

The contradiction check consequently fires on judgment tags only. Two descriptive observations
about one instrument ("it keys on typography", "it groups boats across styles") are not in
conflict, and refusing them would be a false alarm.

## 2b. Scope: what a statement is about (v2)

Every axis declares a `scope`, and a tag may override its axis's value. The four scopes:

| scope | covers |
| --- | --- |
| `pairwise-item` | one review item — the pair shown, or either palette in it. Meaningless away from that item. |
| `artwork` | this artwork and any palette derivable from it; survives the item it was said on. |
| `instrument` | a tool we judge with or judge through — embedding model, segmenter, VLM oracle, the review rendering, the tagging agent itself. |
| `criterion` | the definitions, labels and tests by which judgments are made. Binds no artwork and no instrument run. |

**Decision — the `meta` axis is `pairwise-item` scoped.** The smoke pass left this open, and it
had to be settled because `meta/both-sides-good` was being asked to carry two different claims. It
now carries exactly one: *both palettes in this pair are acceptable*. The artwork-level claim —
*this artwork supports both a valid flat palette and a valid gradient palette* — is
`criterion/both-readings-defensible`, which overrides its axis to `artwork` scope. They are
different statements with different lifetimes: the first dies with the item, the second is still
true in the next batch, and a query that conflated them would report taste disagreements as
artwork properties.

Two tags override the meta axis: `meta/tagger-unsure` and `meta/tagger-confident` are `instrument`
scoped. They are about the tagging agent — itself an instrument — and not about the pair.

Scope is **descriptive metadata, not a gate**: the importer does not refuse a tag because of the
record it lands on (a criterion ruling may perfectly well be written inside an item comment). What
it does is count them, and print a `scopes=` line next to the zero-tag rate, because a pass over
an instrument review round that files nothing but `pairwise-item` tags is the v1 failure
repeating.

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

- `scopes` — how many imported tag instances sat at each scope. Read it together with the
  zero-tag rate: a pass over a round of instrument review that files only `pairwise-item` tags
  has almost certainly forced instrument statements onto palette axes.
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
> Read the tag vocabulary at `research/v3/data/tagging/TAGS.md`. It has 103 tags across 12 axes:
> 48 opposed judgment pairs, plus 7 descriptive observation tags on the `instrument-behavior`
> axis. Every tag has a definition and an example phrase. Read the "Scope" and "judgment axes
> and descriptive axes" sections at the top before you start — they tell you which axis a
> statement belongs on.
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
>    pick the one the text is clearest about and set `"unsure": true`. This applies to judgment
>    tags only; descriptive tags (`instrument-behavior/*`) have no opposites, and two of them on
>    one entry is normal.
> 2b. **Not everything is about a palette.** A comment may be about an instrument (a model, a
>    detector, the rendering you are reading it in), about the words the question set uses, or
>    about the rule by which a call is made. Those have their own axes —
>    `instrument-behavior` (what a model was seen to do), `instrument-fitness` (whether a tool
>    or a view is good enough), `concept` (the category word against the thing found),
>    `criterion` (rulings, and cases where two answers are both defensible). Use them; do not
>    fall back on a palette axis because it is the nearest word.
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

1. Edit `research/v3/data/tagging/vocabulary.json`. **On a judgment axis, add tags in pairs.**
   The linter will refuse an odd axis, a dangling opposite, or a one-way relation; that refusal
   is the feature. On a descriptive axis, add tags with `counterparts` and a `valence`, and check
   that the new tag is *named by* something as well as naming something — the linter refuses a
   dead-end observation for the same reason it refuses a one-way complaint. A new axis must
   declare `kind` and `scope`; if you are reaching for a descriptive axis to hold something that
   is really a complaint, stop — it belongs on a judgment axis and owes an opposite (§2a).
2. Bump `version` (and `updated`). This is what makes the change detectable in the warehouse.
   Semantics of the bump: **every derived record stamped with the old version becomes stale.**
   `export-untagged.ts` re-offers all of their sources on the next pass (they arrive as
   `stale-version`), and the import that follows should be run with `--supersede`, so that
   exactly one live derived record per source remains. The old derived records stay in the log,
   retracted by amendment, as the history of what the index used to say. Bump the **major**
   component when tags are removed or change meaning, or when the file schema changes; the
   **minor** when tags or axes are only added. v1.0.0 → v2.0.0 was a major bump: axes gained
   required `kind` and `scope` fields, so a v1 file no longer parses.
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

`tagging-vocabulary.test.ts` covers the linter with one negative case per rule. Judgment axes:
dangling opposite, self-opposite, absent opposite, one-way relation, cross-axis opposite, odd
axis, duplicate id, bad id shape, undeclared axis, duplicated text. Descriptive axes: an
`opposite` where none is allowed, `counterparts`/`valence` leaking onto a judgment tag, a missing
counterpart, a self/dangling/cross-axis counterpart, a **dead-end observation nobody names**
(surjectivity), an axis that can only record one sign, a single-reading axis, and — as a positive
case — an odd descriptive axis, which must lint clean because the committed file has one. Scope:
an unknown axis kind, an undeclared axis scope, an undeclared tag override, a missing scope
declaration. Plus the pair partition, the v2-3 complaint classes in both directions, the meta
scope decision, and that `TAGS.md` matches the JSON.

`tagging-validation.test.ts` pins the v2 validation pass (§8) as a fixture: the committed work
file at `data/tagging/fixtures/v2-validation-pass.json` must stay complete, zero-tag-free,
gap-marker-free and unsure-free, must exercise all four v2 axes, must file nothing at
`pairwise-item` scope, and must still validate and import — on a copy — against the live
warehouse. When the vocabulary moves, re-run the pass and re-commit the fixture; do not hand-edit
it to make the test pass.

`tagging-tools.test.ts` covers export selection rules, the export/import round trip on a
fixture warehouse, idempotency (re-import appends nothing; `--supersede` retracts and
refiles), staleness (amended text, moved vocabulary version), and every validation refusal
(out-of-vocabulary tag, contradiction, missing source, duplicate source, vocabulary drift,
derived-record-as-source), plus the CLI end to end.

## 8. The v2 validation pass — what it measured

The v2 vocabulary was validated by re-running the pass over the same 13 reviewer observations
the v1 smoke pass had read (4 embedding-gallery notes, 6 SAM mask-review notes, 3 Appendix R
rulings — the records `data/tagging/port-reviewer-notes.ts` put in the warehouse). The pass was
run by a **fresh subagent** under the §4 prompt, not by the agent that wrote the vocabulary:
whoever drafts the tags has an interest in their being usable, which is exactly the interest the
protocol says the tagger must lack.

| | v1.0.0 (smoke) | v2.1.0 (validation) |
| --- | --- | --- |
| entries | 13 | 13 |
| zero-tag | 13 (100%) | **0 (0%)** |
| tags filed | 0 | 22 |
| `unsure` | 1 | 0 |
| `VOCABULARY GAP:` notes | 13 | 0 |
| scopes filed | — | instrument 10, criterion 11, artwork 1, pairwise-item 0 |

All four gap classes were exercised: `instrument-behavior` (5 tags), `instrument-fitness` (5),
`concept` (3), `criterion` (9). The pass imported with `--supersede`, which retracted the 13
v1.0.0 derived records by amendment, leaving exactly one live derived record per source; a
re-export afterwards offers nothing.

**The vocabulary moved once during validation, on the tagger's evidence.** The first v2 pass
(2.0.0) closed 13/13 but came back with two honest `VOCABULARY GAP:` notes, and both were right:

1. A canonical ruling normally *opens* by naming a hole in the answer options and then closes it —
   but `criterion/ruling-given` and `criterion/underdetermined` are opposites, so the two halves
   of one ruling could not be filed together. Fixed by adding the pair
   `criterion/option-set-gap ↔ criterion/option-set-sufficient`, which is about the option set
   rather than about whether the case was decided. Both directions are exercised by the two
   Appendix R rulings.
2. Two claims in the adjudication-browse note had no home: "the flag is palette-conditional, so
   it is not a fair basis for comparison" and "where I voted differently from the oracle I could
   see its point of view". Fixed by `criterion/unfair-comparison-basis ↔
   criterion/fair-comparison-basis` and `instrument-fitness/disagrees-defensibly ↔
   instrument-fitness/disagrees-indefensibly` — the second being the distinction the whole oracle
   workstream turns on.

Those six tags took the vocabulary from 2.0.0 to 2.1.0 (minor: additions only). No derived record
had been stamped 2.0.0 at that point, so nothing went stale; the second pass ran fresh at 2.1.0.

**Caveat, raised by the tagging agent and worth keeping.** These 13 texts were among the sources
the v2 axes were drafted from, and several entries match a tag's documented example phrase almost
word for word. A clean fit here shows the vocabulary *can* express these classes; it is not
independent evidence that it generalises. The zero-tag rate on the first pass over comments
nobody drafted against is the real test, and it is the number to watch (§3).

**Owed elsewhere.** The judgment/descriptive split (§2a) and the meta scope decision (§2b) are
standing decisions later work is entitled to assume, so they owe a record in
`research/v3/data/decisions/decisions.json` — a housekeeping-owned file this workstream does not
write. Their `fundedBy` is the 13 reviewer note ids listed in the fixture, which is exactly the
evidence `warehouse recheck --decisions` can re-check.
