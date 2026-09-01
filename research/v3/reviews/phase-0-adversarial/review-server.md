# Phase 0 adversarial review — the review instrument

**Scope.** `research/v3/src/review-server/` (server.ts, blinding.ts, verify-live.ts, watch-batch.ts,
serverctl.sh, oracle-validation.ts, analyze-bcde-validation.ts, test-support.ts, all
`tests/review-server-*.test.ts`), `research/v3/review-ui/`, `research/v3/data/oracle-validation/`.

**Method.** Read-only against the reviewer's live server on 3010 (GETs only; nothing pushed, nothing
killed). All destructive and experimental probing ran against a private instance on port 3055 with
its own scratch warehouse and batch log under `/Users/Flo/.claude/jobs/e3ef7e22/tmp`. No repo file
outside this one was modified. Two independent re-derivations (round data; analysis joins) were run
as separate agents and their headline claims were re-verified here before being written down.

**Known items not re-reported.** A7 (symlink/realpath gap) is genuinely closed — verified by
experiment, see §7. B16/B17 (unbuilt features) are respected as parked.

---

## Critical

### CR-1. The blinding is 100% defeatable from the served payload, and the salt cannot help. CONFIRMED.

`src/review-server/blinding.ts:16-21` states the defence's completeness claim:

> "Without it the digest cannot be evaluated at all, and **both pushed orders stay exactly equally
> plausible from served data**."

That is false. The salt closed the *hash-reconstruction* channel (the 53.2% attack). It does not
close the **content channel**, because the payload must serve each side's palette in full for the
reviewer to judge it — `blindSidePayload` (`src/review-server/batch.ts:393-410`) serves `roles[].hex`,
`surfaceCollapsed`, `accentCollapsed`, `gradient.stops[]` with true `publishedPosition`, and
`fieldCss`. Whenever the two arms differ *systematically* in any of those, the arms are
self-identifying and the shuffle is decoration.

**Demonstrated, not argued.** I pushed a 24-item two-arm batch to my own instance —
`arm-alpha` always flat, `arm-beta` always a 2-stop gradient, which is precisely the shape of the
Phase 2 paradigm bake-off that `REVIEW_UI.md` §2 says this UI will carry unchanged:

```
items: 24   shuffle actually swapped 14 of 24 (the salt is working)
ATTACK ACCURACY from served payload alone: 24/24 = 100.0%
```

The attack rule was one line: *the side whose `gradient` is non-null is `arm-beta`*. No hashing, no
salt, no batch log. Reproduction: `/Users/Flo/.claude/jobs/e3ef7e22/tmp/attack2.ts`.

Other served fields carry the same risk and are equally unguarded: `stops.length`, the two collapse
flags, the `linear-gradient(...)` geometry token inside `fieldCss`, and the **float representation of
`publishedPosition`** — positions are validated for range and monotonicity (`batch.ts:81-92`) but
never rounded or canonicalized, so `0.35` vs `0.35000000000000003` from two different code paths
would survive into the payload verbatim.

**Why this has not bitten yet, and why that is not reassuring.** The only pairwise batch that has
ever existed in this warehouse is `demo-batch-0001` (3 items, a fixture, six distinct variant ids).
The instrument has never carried a real arm comparison. So the content channel is not merely
unmeasured — it is *unmeasurable* from anything in the repo today, and it will first apply on the
round that matters most.

**What is actually needed** (none of it exists): a push-time check that the two arms are not
separable by any served field across the batch; a canonical numeric form for stop positions; and an
honest amendment of the `blinding.ts` claim to say what the salt does and does not do. Note that the
`REVIEW_UI.md` §2 line "sides shuffled per item by content hash" is the whole specification of
blinding — the spec itself never contemplated content-level identity.

### CR-2. The bcde round's human answers break the pre-registered contradiction ceiling by 4x, and nothing reports it. CONFIRMED.

`oracle/premise/PREMISE_NEXT.md:1047` pre-registers **"total contradiction rate ≤ 10% of ok rows"**
for the gate-consistency table. Recomputed from raw warehouse records for `bcde-validation-1`
(20 artworks, all four gate pairs served in the same round):

| rule | violation | n |
|---|---|---|
| #9 | `has_dominant_subject == none` but `subject_kind != not_applicable` | 5 |
| #4 | `has_dominant_subject == none` but `subject_area_band != not_applicable` | 1 |
| #5 | `has_signature_color == no` but `signature_carrier != not_applicable` | 1 |
| #6 | `has_signature_color == yes` but `signature_carrier == not_applicable` | 2 |

**9 contradictions across 8 distinct artworks = 40% of rows**, against a ceiling of 10%. Corroborating
detail: `subject_kind`'s distribution contains **zero** `not_applicable` despite five occasions where
its gate said `none` — the abstention value never fired where it had five chances.

`data/oracle-validation/bcde-validation-1-analysis.json` computes **no** gate-consistency section at
all; the word "contradiction" appears only inside prose `whyAsked` strings. §15.6-(3) names #9 as
"the one that matters most for the SAM handoff" and #6 as "the single most decision-relevant
contradiction in the set". This is the human reference standard against which the VLM is to be
judged, and it is internally inconsistent by four times the bar set for the machine. Whatever the
right reading is — question ambiguity, gate-pair wording, reviewer fatigue at ~2.9 s median per
answer — it must be on the record before any model is graded against these rows.

> **CAVEAT ADDED 2026-08-04 — the fatigue reading is withdrawn, and the timing it rests on may not be
> used.** Reviewer ruling: answer timestamps mean nothing and are used for nothing — *"breaks make
> times meaningless"*. A gap between two answers is not a thinking time; the reviewer gets up, does
> something else and comes back, and no record distinguishes that from deliberation. So *"reviewer
> fatigue at ~2.9 s median per answer"* is not an available hypothesis, here or anywhere.
> **The finding this paragraph opens is unaffected**, and so is its demand: the 45% contradiction
> rate was real and did need a reading before anything was graded against these rows. **It got one,
> and it does not use timing** — the contradictions are an *elicitation-mode effect* (independent
> 45% against joint 0% on `bcde-gate-reconciliation-1`), recorded as
> `d-2026-08-03-gate-contradictions-are-elicitation-mode-effects` and closed as ledger row **L-b**.
> The timing reading was already superseded on the merits before it was forbidden on policy.
> Left in place rather than rewritten: see `d-2026-08-04-answer-timestamps-are-not-evidence`.

### CR-3. `analyze-bcde-validation.ts`'s own pre-registered scoping claim is false of every statistic it emits. CONFIRMED.

`src/review-server/analyze-bcde-validation.ts:336-340` emits into `scoping[1]` the claim that the two
join grades (2 byte-identical artworks, 1 other-rendition artwork) **are never pooled**. Every
statistic in the file pools them into one n=3: `:446, :452, :459, :469-474, :480-482, :524-529, :534`.
No grade-split statistic exists anywhere in the output; the grades appear only in `joinCounts` and the
per-artwork `joinGrade`.

It bites on exactly the two questions the note itself flags:

| question | pooled | exact-bytes only | rendition row only |
|---|---|---|---|
| `overlays` | 2 agree / 1 disagree | **2 / 0** | 0 / 1 |
| `text_dominance` | 1 / 2 | **1 / 1** | 0 / 1 |
| `grain_or_noise` | 3 / 0 | 2 / 0 | 1 / 0 |

The `text_dominance` cross-rendition disagreement is `minor` (human, 640 px file) vs
`present_secondary` (model, `processed_long_edge_px: 300`). A rendition difference is being pooled
into a headline as model error. And `grain_or_noise` — which the note singles out as something that
"can legitimately differ between renditions" — is pooled anyway.

---

## Major

### MA-1. `verify-live` passes with 0 failures while 4 of 5 released oracle rounds have a dead adjudication link. CONFIRMED, live, now.

`verify-live.ts` crawls `/api/dashboard` and, per batch, only `entry.payload`. It fetches the
`afterRelease` **page** but never the JSON that page loads. Measured against the live 3010 server:

```
verify-live -> ok: true   failures: 0   visited: 52
API URLs visited: /api/dashboard, /api/batches/:id, /api/calibration/:id,
                  /api/bracketing/:id, /api/oracle-validation/:id
oracle-review data endpoint visited? false
```

Meanwhile, on the same live server:

```
/api/oracle-review/sam-mask-quality-1                  404
/api/oracle-review/sam-mask-quality-2-v2-ratification  404
/api/oracle-review/oracle-probe-gold-1                 404
/api/oracle-review/bcde-validation-1                   404
/api/oracle-review/oracle-premise-disambiguation-1     200
```

The dashboard — the reviewer's single documented entry point — offers
`afterRelease: /oracle-review?batch=<id>` for all five. Four of them land on a page that renders
`could not load: …`. The page does catch the error rather than hanging on a placeholder, which is why
this is major and not critical; but this is precisely the failure class the whole
`verify-live` machine was written to make impossible, and `BatchReviewPaths.payload`'s own comment
("verify-live.ts crawls it: a page whose payload 404s is a dead link") shows the gap was simply not
generalized to `afterRelease`.

Full diff of what the UI can request against what the crawl visits — everything below is uncrawled:

- `/api/queue` — called first by `oracle-review.js:164` and `amend.js:326`. If it broke, both pages
  die and verify-live still passes.
- `/api/oracle-review/:id` — `oracle-review.js:176`.
- `/api/oracle-review/:id/items/:token/note` — `oracle-review.js:116` (write; understandably skipped).

### MA-2. `batchReviewPaths` advertises the adjudication page from `kind` alone, ignoring label schema. CONFIRMED.

`server.ts:252-253` returns `afterRelease: /oracle-review?batch=<id>` for **every**
`oracle-validation` batch. The endpoint behind it refuses anything that is not `group-a.v1`:

> `Batch bcde-validation-1 was answered under group-bcde.v1; the adjudication view joins group-a.v1
> ground_type answers against the premise run and has nothing to show here`

The server knows this at dashboard-build time (the fixture's `labelSchemaVersion` is in hand) and
still emits the link. `afterRelease` should be `null` when the adjudication view cannot serve the
batch — which is already the modelled case for `bracketing` (`server.ts:249-251`).

### MA-3. `watch-batch` in its "any batch" mode fires instantly on the oldest release in history. CONFIRMED.

The CLI documents no-`--batch` as *"wait for the next release of any batch"*
(`watch-batch.ts:59`). Run against the real warehouse with default flags:

```
elapsed_ms: 2
returned: {"batchId":"bracketing-round-1-clarified", "ts":"2026-08-02T21:43:58.277Z",
           "alreadyReleased":true}
```

Two milliseconds, exit 0, a release from the day before yesterday. Cause: `includeExisting` defaults
true (deliberately, and correctly, for the `--batch X` case — `watch-batch.ts:63-71`), but the same
default in any-batch mode means the first historical `batch-complete` in a 998 KB append-only log
satisfies it. The orchestrator's contract is "exit 0 ⇒ notify once", so this is a spurious
notification with no release behind it.

`--only-new` is the workaround. The reason nobody noticed: the covering test
(`tests/review-server-watch-batch.test.ts:81-87`, *"takes the next release of any batch when no batch
is named"*) passes `includeExisting: false` **and** starts from a truncated warehouse, so it exercises
neither the default nor a non-empty log.

No hang-past-a-release was found: `batch-complete` carries `batchId` at the top level as the watcher
requires, the tail read is offset-based and short-read safe, and truncation resets. One latent hang
remains: recovery keys off `size < offset` only, so a warehouse **replaced** by a same-or-larger file
(new inode) would skip records and wait forever. Nothing rewrites the warehouse today.

### MA-4. The committed test suite is RED. CONFIRMED.

`node --experimental-strip-types --test research/v3/tests/review-server-*.test.ts` →
**297 pass, 1 fail**, exit 1, on a clean tree.

```
✖ tests/review-server-probe-gold-analysis.test.ts:95
  "reproduces the committed analysis from the warehouse"
  + actual - expected
  +  otherBatch: 671   -  otherBatch: 458
  +  otherBatch: 523   -  otherBatch: 310
```

Both deltas are exactly 213. `otherBatch` (`src/review-server/analyze-probe-gold.ts:181,191`) counts
warehouse records **belonging to other batches** — a diagnostic that grows with total corpus size.
It is baked into a committed golden file that the test deep-equals, so the test is guaranteed to
re-break every time any unrelated batch is pushed. Two costs: the suite gate is currently broken, and
a known-red suite is where a real regression goes to hide. Fix is to exclude warehouse-size-dependent
diagnostics from the golden comparison, not to refresh the golden.

### MA-5. The released round is 160 answers but 163 records, with no persisted supersession marker. CONFIRMED.

`grep`-verified: 163 `oracle-label` records carry `batch.id == "bcde-validation-1"`; they cover 160
distinct `(questionKey, imageId)` keys. Three keys have two records each:

```
grain_or_noise ab67616d0000b2730005165a15d80c563a8d1ec2  x2
overlays       ab67616d0000b273000ad9116781016bd6e6c21c  x2
overlays       ab67616d0000b2730011a326091e7dd7df58b175  x2
```

All three pairs agree in value, so no answer is ambiguous *today*. The defect is structural:
`oracle-label` records carry no `supersedes`, no `revision`, no `retracted` field. The server's
`revision` counter is in-memory only (`server.ts:1469-1471`) and never written. Supersession is
reconstructed at read time by **file order** (`analyze-bcde-validation.ts:165-170`). Any consumer that
does not replicate that exact convention — the warehouse query CLI, a future join, an agent doing
arithmetic on `wc -l` — sees 163 rows with 3 phantoms. The pairwise path does this correctly
(`supersededVerdictIds`); the oracle path does not. The one back-navigation event in the log
(`warehouse.jsonl:633`, serve position 20 recorded after 21) lines up exactly with the duplicates,
so the mechanism is confirmed as reviewer step-back.

### MA-6. The sorted-multi-array guarantee has never been exercised by real data. CONFIRMED.

Only one `multi` question was served (`overlays`; `text_roles` was dropped). All 22 overlays records
have arrays of **length 1**. Across the entire warehouse, **zero** array-valued answers have ≥2
elements. Sortedness, the no-duplicate rule and the set-equality joins that depend on them are
untested by anything but unit tests. Values used: `["none"]`×14, `["label_logo"]`×5,
`["watermark"]`×1 — `parental_advisory` and `barcode_or_price` never fired. So the round validates the
multi-select *mechanism* far less than its 160-answer size suggests.

Write-time enforcement itself is sound (`server.ts:1423-1448`: shape, vocabulary, non-empty,
no-repeat, then sort) and I could not get a bad value past it. But the analyzer performs **no**
vocabulary check (`analyze-bcde-validation.ts:141-176` type-checks `string | string[]` only), so a
hand-appended warehouse row with a bogus value passes the analysis silently.

### MA-7. A reviewer refusal is silently recoded as "the reviewer agreed with neither wording". CONFIRMED.

`analyze-bcde-validation.ts:295` (type) and `:476-483` (logic). `variantSplitSubset` has no can't-tell
bucket. Manifest case: `signature_carrier`, artwork
`0e/ab67616d00001e02000e007955ee2f8b29f5b2b4` — reviewer `not_applicable`, E `text`, F `background`.
The bucket logic correctly calls this `cant_tell` for both variants, but the split subset reports
`reviewerWithNeither: 1`, which reads as a substantive human answer that missed both wordings. The
human declined to answer. This is exactly the pooling that the file's own header (`:22-25`) says the
third bucket exists to prevent.

### MA-8. The pilot-overlap join is a filename-stem id match with no content check, across three mixed id namespaces. CONFIRMED as behaviour; the result itself is right.

`analyze-bcde-validation.ts:386-392`, keys built at `:114-118`. The basis is `artworkId` **string
equality**. `pilot.byArtwork` mixes 24-hex sharded suffixes (117 images) with bare filename stems
(`"disney"`, `"doja"`, `"franz"` — 25 dev-set rows); the round mixes 24-hex (13) with 32-hex
music-artworks stems (7). `collection` is present on every fixture item and is never consulted. This
is the exact pattern `CONVENTIONS.md` forbids ("identify artworks by full path + content hash, never
by id prefix"), in the join that produces a headline.

**The 3-artwork claim is nevertheless correct** — independently verified, not taken on trust:

- sha256 recomputed from **actual file bytes** for all 20 round artworks and all 142 pilot images:
  every declared hash matches its file, 0 unresolvable paths.
- **Byte-identical pairs: exactly 2** — `04/ab67616d…0004ccf0ae91364130886c02` and
  `0e/ab67616d…000e007955ee2f8b29f5b2b4`.
- **Other rendition: 1** — round `13/ab67616d0000b273 0013bebcaee941ebcc13437c` (640×640) vs pilot
  `13/ab67616d00001e02 0013bebcaee941ebcc13437c` (300×300); normalized 16×16 luma correlation
  **0.9862**. Genuinely the same artwork.
- A full 20 × 142 perceptual sweep found no missed overlap: only those 3 pairs exceed 0.90; the
  highest non-match is 0.791.

So the id-prefix join got the right answer by luck of a perfect prefix convention, not by
verification. Worth adding: the overlap is **by construction** — `BCDE_SELECTION_RULE`
(`oracle-validation.ts:1087-1099`) deliberately pins every core artwork the pilot decoded. The
independence framing is not overstated.

### MA-9. The served per-question `instruction` line is not in variant E. CONFIRMED.

Served on all 8 questions: *"Answer this one question only. Do not try to make your answers across
questions tell one story."* `grep -c` in `oracle/premise/prompts/group-bcde.v1.variant-e.json` → **0**.
It was newly authored for this round and sits directly beside the verbatim ANSWERING block, which
reads *"Answer each question on its own. Do not try to make your answers tell one story."* The
reviewer received two anti-coherence instructions; the model received one.

The round's own claim is narrowly scoped to "every stem and every gloss", and that claim **holds
exactly** — 8/8 stems and 41/41 glosses byte-identical, vocabularies identical in values *and order*,
hotkeys exactly `1..n` in that order (no digit rebinding), question order = E's `question_order`
restricted to the 8 kept, preamble = exact `\n\n` join of all 8 `shared_blocks`. But "the served
wording is variant E's" is not true of the whole surface, and the difference is in the one place —
instruction framing — most likely to move answers.

### MA-10. `serverctl.sh` honours `REVIEW_SERVER_PORT` but its pidfile and logfile do not. CONFIRMED by reading.

`serverctl.sh:26-31`: `PORT` is overridable, `PIDFILE`/`LOGFILE` are fixed at
`data/review-server/server.{pid,log}`. Starting a second instance on another port overwrites the
pidfile of the reviewer's 3010 server. A later default-port `stop` then kills the *other* process,
reports `stopped`, and leaves the reviewer's server running and unmanaged — and `restart` will
subsequently refuse ("already answers but is not ours"). This is a live hazard for exactly the
workflow this review had to use; I started my instance by hand for this reason. Fix: scope the run
files by port.

---

## Minor

1. **Hardcoded prose counts written alongside derived ones.** `analyze-bcde-validation.ts:337-338`
   ("two on identical bytes, one at another rendition"), `:345` ("twenty reviewer labels"),
   `:594-595` ("the join is three artworks wide") — while `:550-551` derives the same fact correctly.
   The output states the join width twice, once computed and once as a string literal. CONFIRMED.
2. **A rate rendered as a count.** `analyze-bcde-validation.ts:565` prints `singletonRate` (a ratio)
   as `one value only on 1 of rows`. It means twenty; it reads as one. CONFIRMED.
3. **`skipped.retracted` counted before the batch filter** (`analyze-bcde-validation.ts:146-154`) — a
   retraction in any batch increments this round's counter. Reads 0 only because all 13 retractions
   target `note` records. CONFIRMED.
4. **`cohenKappa.raw` scores refusal-vs-refusal as agreement** (`:214-215`) while `bucketOf` calls it
   `cant_tell` (`:232`). Does not manifest — no joined row had both sides refusing. SUSPECTED.
5. **Two canonicalizations of a multi answer in one function.** `:427` joins in source order for
   `reviewerDistribution`; `:450` sorts for the kappa token; `:199` sorts for `sameAnswer`. Masked
   only because every array has length 1. SUSPECTED.
6. **Artwork dedup keeps the first item's `imageId`** (`:371-381`, lookup at `:421`); answers filed
   under a sibling `imageId` would vanish into `unanswered` with no counter. Safe today (sha256 →
   imageId is 1:1). SUSPECTED.
7. **Silent drop of a joined artwork whose pilot row lacks the question key** (`:440-441`, `:466`) —
   counts as joined in `joinCounts` but enters no bucket, no kappa pair, no subset, with no drop
   counter. 0 such rows today. SUSPECTED.
8. **Analyzer join key is `questionKey + imageId`, never checked against the fixture item set**
   (`:165`), and `imageId` is heterogeneous — 5 of 20 carry a file extension, 15 do not. 0 orphans
   today. CONFIRMED as behaviour.
9. **`PILOT_VARIANTS` hardcoded to `["E","F"]`** (`:71`) rather than derived; a third variant would be
   silently ignored. CONFIRMED.
10. **`setOverlap` is `Math.max` across E and F** (`:460`) — an undocumented best-case-across-variants
    summary on a per-artwork field. CONFIRMED.
11. **Builder and analyzer filter the same pilot file differently** — `oracle-validation.ts:1053`
    skips canaries only; `analyze-bcde-validation.ts:109-110` also skips `parse_failed` and
    `status !== "ok"`. The builder could pin an artwork the analysis then grades `none`. 0 today.
12. **E's opening paragraph was never served.** *"What the cover is about does not count. Whether it
    is attractive does not count."* is not a `shared_block`, so it is absent from the preamble. Two
    substantive scoping exclusions the model got and the reviewer did not. CONFIRMED.
13. **The byte-identical preamble is factually stale for this round.** `LISTS. Two of the thirteen
    questions take a list` was served to a reviewer answering **eight** questions with **one** list;
    `ONE PICTURE, ONE MEDIUM` references `medium`, a dropped question. Faithful to E, wrong for what
    was on screen. CONFIRMED.
14. **No per-item evidence channel was populated** — `confidence` and `ambiguityNote` are `null` on
    all 163 records. §15.9's stated product ("whether a human can answer each of these questions at
    all") has no per-item data behind it; the two answerability defects reached
    `ORACLE_QUESTION_SET.md` Appendix R through prose only. CONFIRMED.
15. **Every unclassified error becomes `400` with `error.message` verbatim** (`server.ts:2372-2375`).
    No 500 is ever emitted, and an internal fault (e.g. `ENOENT` on a moved artwork) returns a raw
    Node message that can contain absolute filesystem paths. Localhost-only, so low. SUSPECTED.
16. **`verify-live` checks one media item per batch** (`verify-live.ts:246-249`), justified as "media
    resolution is per batch — it either survived the push and any restart since, or it did not". That
    rationale is wrong: each item's `imagePath` is resolved independently at request time, so one
    moved file breaks one item and the crawl cannot see it. The choice may still be right for speed;
    the stated reason is not. CONFIRMED.
17. **`verify-live` has no fetch timeout** (`:91-103`). A server that accepts and never answers hangs
    the crawl, and `serverctl.sh start` with it.
18. **`verify-live` follows only double-quoted `src`/`href`** (`:78`), never parses CSS (`@import`,
    `url()`), and misses template-literal dynamic imports (`:87`). The current UI uses none of these,
    so all three are latent — but the crawler is the thing that is supposed to notice when the UI
    starts to.
19. **Only the root's content-type is checked** (`ROOT_NOT_HTML`, `:146`); any other page could be
    served as JSON and still pass.
20. **Oracle-validation rounds cannot contain a silent repeat.** Verified by experiment: pushing a
    fixture with the same `(questionKey, imageId)` twice is refused
    (`"… is asked grain_or_noise twice"`). Correct as a collision guard, but it means intra-round
    reviewer self-consistency can never be measured in this mode — while the probe-gold analysis
    quotes a "63% repeat-consistency floor" as a live standard. Worth a ledger line if repeats are
    ever wanted here.

---

## What held under attack

Recorded because an adversarial pass that only lists defects misrepresents the instrument.

- **Path traversal and symlink containment.** 13 traversal encodings against a live instance
  (`../`, `%2e%2e`, double-encoded, `....//`, backslash, NUL, `//`) all 404. `resolveUiFile` tested
  directly against a scratch root containing a symlink to a file outside it, a symlink to
  `/etc/passwd`, and a symlink *directory* escaping the root: all four refused, only the real file
  served. **A7 is genuinely closed.**
- **The salt is not in git and not in the warehouse.** `**/batches.jsonl` is gitignored with the
  reason stated; `grep blindingSalt data/warehouse/warehouse.jsonl` → 0. Loss of the batch log costs
  nothing for judged items, because `#side()` records `variantId` and `paletteHash` on the verdict.
- **Blinding survives restart.** Killed and restarted my instance; the per-item side assignment for a
  24-item batch was byte-identical afterwards.
- **The oracle-validation payload is unanchored.** No model answer, no join key, no selection count,
  no filename, no sha256 — items are addressed by a random 8-byte token and images by
  `/media/<batch>/<token>`. This is the one place where a leak would silently corrupt the reference
  standard, and it is clean.
- **Server-side vocabulary enforcement is real** (`server.ts:1423-1448`): shape, membership,
  non-empty, no-repeat, then sort. I could not push a bad answer.
- **Byte-for-byte wording where it is claimed**: 8/8 stems, 41/41 glosses, vocabularies in identical
  order, hotkeys `1..n`, `json_schema` enums equal to the vocabularies, E and F vocabularies
  identical and identically ordered.
- **Physical integrity of the round**: all 20 artwork files re-hashed from disk match their recorded
  sha256; byte sizes match `rendition.bytes`; all 160 `imagePath` entries resolve; stratum agreement
  163/163; 0 duplicate record ids across all 773 warehouse lines; every line parses; timestamps
  strictly monotonic across the whole warehouse; 0 labels after the `batch-complete` record.
- **The analysis arithmetic is clean.** An independent reimplementation (own amendment resolution,
  own pilot indexing, own distribution/kappa/bucket math) reproduced **every** numeric field of
  `bcde-validation-1-analysis.json` exactly — all 8 questions × (answered, unanswered,
  reviewerDistribution, multi stats, per-variant buckets, exactSetAgreement, meanJaccard, kappa,
  both subsets, joinCounts) plus `counts` and `skipped`. Zero disagreements. Every finding above
  about this file is about *what the numbers are of*, never about the numbers.
- **Kappa correctly refuses at n=3 < 10** everywhere; no coefficient is quoted.
- **Reviewer timing is plausible**: 15.73 min total, median inter-answer gap 2.91 s, min 0.83 s, no
  sub-0.5 s answers, no implausible burst.
  > **CAVEAT ADDED 2026-08-04 — this check is retired and may not be repeated.** Reviewer ruling:
  > answer timestamps mean nothing and are used for nothing (*"breaks make times meaningless"*),
  > which restores `REVIEW_UI.md` §4's standing *"No timing of the reviewer"* — a rule this line
  > broke in good faith, and the breach was flagged as unreconciled by
  > `reviews/toolbox-review/bias-audit.md` before the ruling settled it.
  > **This is the honest casualty of the ruling.** "No sub-0.5 s answers, no implausible burst" was a
  > real integrity check on whether a batch was answered by a human paying attention, and it is
  > removed with nothing in its place. The line stays as written because rewriting history to make a
  > superseded reading disappear is a worse defect than the reading was. See
  > `d-2026-08-04-answer-timestamps-are-not-evidence`.

---

## Reproduction

Scratch (nothing in the repo touched): `/Users/Flo/.claude/jobs/e3ef7e22/tmp/`

| file | what it does |
|---|---|
| `attack2.ts` | pushes the two-arm batch and measures the 24/24 unblinding (CR-1) |
| `attack.ts` | per-side feature extraction used to find the channel |
| `vl.ts` | runs `verifyLive()` and dumps the visited set (MA-1) |
| `wb.ts` | `watchForCompletion` against the real warehouse, any-batch mode (MA-3) |
| `sym2.ts` | `resolveUiFile` symlink/traversal containment |
| `dup.ts` | duplicate `(questionKey, imageId)` push — refused |
| `joinver-*.ts` | independent re-derivation of the analysis joins and the perceptual overlap sweep |
| `dataver-*.ts` | independent re-derivation of the round data, wording and vocabularies |
