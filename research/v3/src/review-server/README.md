# v3 review server (Phase 0 skeleton)

A standing local server that owns the review queue. The orchestrator pushes batches to it; the
reviewer works through them whenever convenient; an explicit **release** closes a batch and appends
the `batch-complete` record that the orchestrator's watcher waits for. Design source:
`research/v3/REVIEW_UI.md` (all of it) and `research/v3/PHASE_0_DECISIONS.md` §2.

## Start it

```
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/review-server/server.ts
```

Then open <http://127.0.0.1:3010/>. It binds to `127.0.0.1` only.

| flag | default | meaning |
|---|---|---|
| `--port <n>` | `3010` | TCP port |
| `--warehouse <path>` | `research/v3/data/warehouse/warehouse.jsonl` | the warehouse JSONL (same default the query CLI reads) |
| `--batches <path>` | `research/v3/data/review-server/batches.jsonl` | the batch log (server-side state, see below) |
| `--reviewer <id>` | `flo` | `author.id` on every record |
| `--no-demo` | off | do not seed the demo fixture batch |
| `--no-bracketing` | off | do not seed the colour-bracketing round |
| `--no-oracle` | off | do not seed the oracle-validation round |

On start the server replays both files, so a restart is invisible: the queue, every verdict and
every release come back. It can be killed at any moment; at most the record in flight is lost.

Run the tests with:

```
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/review-server-*.test.ts
```

## Two files, and why the batch log is not the warehouse

- **The warehouse** holds everything the reviewer judges. The server does not write it: it builds
  records and calls `append()` from `research/v3/src/warehouse/`, which owns the record shapes, the
  schema version, validation and the per-record fsync.
- **The batch log** (`batches.jsonl`) is the server's own state: one line per pushed batch with the
  materialized items, the **variant ids the blinding hides**, and the **per-batch blinding salt**.
  It is never served, and it is the only thing standing between a reader and the side order. Do not
  open it while a batch is under review; reading it unblinds you. It should not be committed —
  `research/v3/data/review-server/` wants a `.gitignore` entry (orchestrator call).

## Endpoints

| method | path | what |
|---|---|---|
| `POST` | `/api/batches` | push a batch (JSON body, see below) |
| `GET` | `/api/queue` | every batch with its progress and release state |
| `GET` | `/api/batches/:batchId` | the blinded payload the browser renders |
| `PUT` | `/api/batches/:batchId/items/:itemId/verdict` | submit or edit one verdict |
| `PUT` | `/api/batches/:batchId/items/:itemId/veto` | veto the artwork (`{active:false}` withdraws it) |
| `POST` | `/api/batches/:batchId/release` | release the batch |
| `POST` | `/api/oracle-validation` | push an oracle-validation round (body `{fixture?, fundedBy?}`; omit `fixture` for the committed one) |
| `GET` | `/api/oracle-validation/:batchId` | the by-question payload the browser renders |
| `PUT` | `/api/oracle-validation/:batchId/items/:token/answer` | record one closed-vocabulary answer |
| `GET` | `/api/oracle-review/:batchId` | the post-release adjudication payload (**404 unless released**) |
| `PUT` | `/api/oracle-review/:batchId/items/:token/note` | one optional adjudication annotation (**404 unless released**) |
| `GET` | `/media/:batchId/:itemId` | the artwork bytes, custody-checked on every request (an oracle-validation batch takes the item's **token** here, not its id) |
| `GET` | `/`, `/bracketing`, `/oracle`, `/oracle-review` (+ their `.js`, `/styles.css`) | the four pages (read from disk per request — edit them while the server stands) |

### Pushing a batch

Palettes, fingerprints and purposes are the **warehouse library's shapes verbatim**, so nothing is
translated between what is pushed and what is stored. `research/v3/src/review-server/fixtures/demo-batch.json`
is a complete worked example.

```jsonc
{
  "batchId": "arm-3-round-1",
  "purpose": "arm",                    // mechanism | arm | calibration | outlier-mine | oracle-validation | bake-off
  "fundedBy": ["v-msc4-…"],            // record ids of the evidence that motivated this batch
  "items": [{
    "itemId": "item-0",
    "imagePath": "/absolute/path/to/cover.jpg",
    "collection": "sharded-corpus",    // optional; derived from the path when absent
    "artworkId": null,                 // optional; groups renditions of one artwork
    "sides": [                          // exactly two, TRUE names — never served
      { "variantId": "trunk",
        "fingerprint": { "algorithmVersion": "…", "preprocessingVersion": "…", "gitCommit": "…", "dirty": false },
        "palette": { "background": "#…", "surface": "#…", "foreground": "#…", "accent": "#…",
                     "gradient": { "stops": [{ "color": "#…", "position": 0 }, …] },
                     "surfaceCollapsed": false, "accentCollapsed": false } },
      { "variantId": "arm-3", "fingerprint": { … }, "palette": { … } }
    ]
  }]
}
```

`fingerprint.dirty` is required and never defaulted: without it a commit hash silently means two
different things. Image dimensions are **not** taken from the push — they are read from the file
header with `sharp .metadata()` at push time, because filenames lie.

The server validates structure only. It deliberately does **not** enforce contract invariants: an
outlier-mining batch exists precisely to show the reviewer palettes that are suspected of being
wrong.

`imagePath` must live under the repository root (`imageRoots` option; localhost push is trusted,
but there is no reason for a batch to reach outside the corpus, and the allowlist keeps a malformed
push from turning the server into a read-any-file proxy). Within that root, push errors still
distinguish "cannot read" from "not a decodable image" — a small path-probing oracle, kept because
it is what makes a bad push diagnosable, and confined to the repository by the allowlist.

## The review loop

- **Blinding** — sides are shuffled per item under a **cryptographically random per-batch salt**,
  generated at push time and stored only in the batch log. The digest is
  `sha256(salt · artworkHash · paletteHashA · paletteHashB)` in pushed order.

  The salt is not decoration. The first version of this server derived the shuffle from content
  alone and reasoned that this was safe because deriving it needs the palettes — but the server
  *serves* the palettes, because the reviewer has to look at them. An adversarial verifier
  reconstructed all 120 palette hashes from browser-received JSON and unblinded 28 of 60 items with
  certainty (73.3% marginal): the true pushed order always reproduces itself, so it is always
  self-consistent, while the wrong order only coincides half the time. Two tests guard the fix —
  one replays that attack and asserts it now determines nothing, the other replays it against a
  simulated unsalted shuffle and asserts it still succeeds there, so the guard cannot pass
  vacuously.

  Note for anyone tempted to "simplify": do **not** sort the two hashes before hashing. That makes
  the digest independent of pushed order, which removes the ambiguity and gives an attacker a
  100%-certain unblinding instead of a coin flip.

  Payload hygiene still holds on top of this: no variant id, no fingerprint, no palette hash, no
  salt in any served response, asserted over every endpoint including the image bytes.
- **Both sides are graded**, then a preference — the v2-3 gap this fixes. Grades and preference come
  from the warehouse vocabulary (`strong | acceptable | weak | unacceptable`, `a | b | no-preference`).
- **Free text is the primary channel.** It is never forced: release reports which items carry no
  comment and releases anyway (a comment demanded is a comment corrupted).
- **A confound flag requires its note** — "re-run after the defect is fixed" needs to know which
  defect. This is the one input the server refuses to accept half-finished.
- **Editing before release is free.** Every save appends a new verdict record; the last one is the
  reviewer's position and the warehouse's `supersededVerdictIds()` keeps the earlier drafts from
  being counted twice. Saves happen on every grade/preference click and, for text, 1.2 s after the
  last keystroke or on blur — so a crash costs at most one sentence. **There is no pre-submit
  summary screen** by design.
- **Release** is an explicit button. It refuses while any item is neither graded nor vetoed, then
  appends `batch-complete` (last, after all its evidence) and closes the batch. Its response hands
  back `fundingRecordIds` — the record ids a downstream decision should cite as `fundedBy`.
- **A veto** is an artwork judgement, not a palette one, and counts as "judged" for release.
  Withdrawing one appends a retracting amendment; nothing is ever deleted.

## The page

Vanilla JS and CSS, no build step, no dependencies, served statically.

Review chrome is **strictly black and white**: black background, flat, no shadows, no gradients, no
greys. Selection is shown by inverting. The only colors on screen are the palettes themselves — the
mock player UI and the swatches under it, each labelled with its hex **and** its
`colornames-oklab` name.

### Mock player layout — revision 2 (2026-08-03)

**The mock is part of the output contract**: a verdict is about the exact rendering the reviewer
judged, so the layout is versioned and dated here. Revision 1 was superseded on the reviewer's own
report — they are the design authority on this surface — and **no verdict exists against revision 1
beyond the demo fixture**, so nothing needed rescoping. Any future change to this layout must be
recorded the same way, because from here on verdicts will be scoped to revision 2.

Their four findings, verbatim, and what each changed:

| finding | change |
|---|---|
| *"the artwork takes too much space, i can barely see the background/gradient i'm supposed to review"* | the artwork is a **96 px thumbnail** in the middle region, no longer a full-width row. It is context; the palette is the subject. |
| *"all the content is at the bottom, so in case of a gradient, almost nothing is on top of the background color"* | content is spread over **three regions across a 420 px-min frame**, `space-between`: **top** — album title + artist in foreground directly on the field, plus accent icons; **middle** — thumbnail beside the surface card; **bottom** — accent transport icons, an "up next" caption in foreground on the field, and a rail. Both ends of a gradient now carry text and accent. |
| *"the accent color is only used on top of a surface colored area, so i won't be able to see it in other contexts"* | accent appears in **four contexts**: on the field at the top of the ramp, on the field at the bottom, on the surface card, and as the fill of a **background-coloured rail** (twice). Those are exactly the relationships the contract's accent floors are checked against — background, surface, and the stops. |
| *"the swatches ... takes too much space, put it below the mock ui, not next to it"* | `.side-body` is a column: mock first, then a **compact wrapping swatch row** underneath. |

Unchanged and not negotiable: the artwork is **borderless** on the field, there are **no shadows**
anywhere, chrome outside the mock stays black and white, every colour is named via
`colornames-oklab`, and the `[REVIEWED]` gradient display mapping is untouched — the page pastes the
server's `fieldCss` and never composes it.

`review-server-mock-layout.test.ts` drives the real `app.js` against the real server and asserts one
test per finding, plus the invariants above.

Gradients render as the pinned preview renderer's output, produced server-side and pasted by the
browser: `linear-gradient(135deg in oklab, …)` with `display_pos = reserve + published_pos × (1 −
reserve)`, `reserve` 35 % for 2 stops and 10 % for 3+ (`[REVIEWED]`, carried from v2-3). Published
positions are shown next to the display positions, so the reviewer can see what was fitted and what
was staged.

Keyboard: `← →` / `j k` move between items · `1–4` grade A · `6–9` grade B · `a b n` preference ·
`c` comment · `x` confound · `v` veto · `Esc` leaves the text field. Shortcuts are off while
typing. `?batch=<id>` and `?item=<itemId>` open a specific comparison.

## The colour-bracketing round

A second review mode, sharing the same queue, batch log, release flow and warehouse. It measures
what `PHASE_0_DECISIONS.md` §3 leaves `[UNCALIBRATED]`: the same-colour bar.

**For the reviewer:** <http://127.0.0.1:3010/bracketing> — seeded automatically on start. The page
opens the **newest unreleased** round, so once round 2 is in the queue that is what it lands on.
Keyboard only: **y** yes · **n** no · **u** undo one · **r** release when finished. It auto-advances,
resumes wherever you stopped, and is meant for ten-minute chunks. 72 items.

**The criterion is on screen for every item**, and it is served from the fixture rather than written
into the page, so the words the reviewer read are the words recorded beside the answers. Part 1 asks
*"Same color?"* under: *answer whether they register as the same color — not whether you can detect
any difference at the seam; if you have to hunt along the boundary to find it, they're the same
color; if they'd read as two different colors in a UI, they're different.* Part 2 asks *"Can you
clearly see the shapes?"* under: *would these icons work as UI elements? If you have to hunt for
them or they strain, answer no.*

**Rounds are passes, not pairs.** The fixture's `batchId` names the pairs; the batch id in the queue
names the pass over them. The first pass (`bracketing-round-1`) was abandoned mid-session because it
was being answered on a detection criterion, so the same pairs were re-pushed as
`bracketing-round-1-clarified` (`BRACKETING_ACTIVE_BATCH_ID`) with fresh tokens and a clean start at
item 1. The abandoned answers stay in the warehouse — the log is append-only and they are evidence
about what happened — and **the analysis fits exactly one batch id**, defaulting to the active one.
Pooling the two would have moved the threshold by a factor of three with nothing in the output
looking wrong; a test asserts it cannot happen. Analyse an older pass with `--batch <id>`, which
also prints a warning that the fixture's criterion line may not be the one that pass was answered
under.

- **Part 1, 60 items — "same colour?"** Two large flat fields, a thin black divider, nothing else on
  screen. 4 quadrants (dark/light × neutral/saturated, boundaries at OKLab lightness 0.55 and chroma
  0.05, both `[MEASURED]` against sRGB anchors in `bracketing.ts`) × 12 log-spaced distances from
  0.004 to 0.036, bracketing the 0.012 prior by a factor of three each way. Plus, per quadrant, one
  identical pair (a control: it must be called "same") and two silent repeats of mid-ladder rungs
  (the reviewer's own noise floor — a threshold cannot be sharper than that).
- **Part 2, 12 items — "can you clearly see the shapes?"** Accent-coloured circle, triangle and ring
  on a field colour, at **equal APCA luminance**, with the colour distance varying over a decade.
  This is §4 invariant 4's open question: whether a chromatic accent stays visible when the
  luminance signal is gone, and therefore whether the accent floor belongs in colour distance rather
  than in a luminance epsilon. Two controls: one plainly visible pair, one identical pair.

**Equal luminance is defined by APCA's Y, not by a raw-contrast bound.** The brief asked for
|raw APCA| < 0.5; that is not a definition of equal luminance, because two *identical* colours
already read up to 1.9815 raw (`APCA_RAW_IDENTICAL_CEILING` — APCA's reverse branch raises
background and text to different exponents). Requiring < 0.5 would have selected pairs at the
extreme ends of the luminance range where that residue happens to be small, not equal-luminance
pairs. Matching Y instead gives the property the round needs: pairs that share a Y have |raw| ≤
1.9815 by construction, whatever their chroma. Achieved |ΔY| and |raw| are recorded per item.

**The fixture is committed and deterministic.** `research/v3/data/calibration/bracketing-round-1.json`
holds every pair's exact sRGB values, achieved OKLab distance, chroma distance, raw APCA, Lc, ΔY,
quadrant, role and serve order. Regenerate with:

```
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/review-server/bracketing.ts --write
```

A test asserts the committed file is byte-identical to what the generator produces. The recorded
distance is always the **achieved** distance between the two 8-bit colours shown, never the ladder
target — rounding to the sRGB grid moves it, and below about 0.005 the grid is the limit in the dark
quadrants (one channel step at grey 8 is already 0.0054).

**What the browser is given: two hex values and an opaque token.** Not the distance, not the
quadrant, not the role, and not the real item id — `p1-dark-neutral-04` would announce the stratum
and the rung, and `…-control-0` / `…-repeat-1` would announce exactly the items whose value depends
on the reviewer not recognising them. Tokens are random per batch and live in the batch log.

**Answers are `oracle-label` records** (REVIEW_UI.md §6), which is the right type — one human answer
to one closed-vocabulary question, carried with its stratum. Two fields are used off-label and it is
worth knowing: `imageId` holds the **pair id** (there is no image), and `stratum` holds the OKLab
quadrant rather than an embedding cluster. `labelSchemaVersion` is `color-bracketing-1`, so these
rows can never be mistaken for the VLM oracle's own labels. Undo appends a new answer that
supersedes the old one; nothing is deleted.

**Analysis** — runs on whatever has been answered so far, including nothing:

```
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/review-server/analyze-bracketing.ts
```

Fits a 2-parameter logistic against log distance per quadrant and pooled, and reports the 50%
threshold with a confidence interval, whether one threshold survives all four quadrants, repeat
consistency, control correctness, and part 2's visibility threshold. Writes
`research/v3/data/calibration/bracketing-round-1-analysis.json` and prints a plain-language summary.

### Round 2 — the refinement round

`bracketing-round-2`, **80 pairs, part 1 only** (round 1 already answered the accent question, and
re-asking it would spend a fifth of the reviewer's time re-measuring a settled number). Same page,
same keys, same criterion string verbatim — which is what makes the two rounds poolable. Round 1 is
left released and byte-identical; a test asserts its fixture still is.

```
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/review-server/bracketing.ts --round 2 [--write]
```

What round 1 left, and what round 2 does with it:

- **Adaptive ladders (48 pairs).** Round 1 spread 12 rungs over a factor of nine to find the bar at
  all. Round 2 puts **10 log-spaced rungs inside each quadrant's 95% interval** — dark-neutral
  0.00575–0.01335, dark-saturated 0.01274–0.02443, light-neutral 0.01116–0.02380, light-saturated
  0.01153–0.06265 (`ROUND_1_INTERVALS`, `[MEASURED]` from the committed round-1 analysis; a test
  asserts they have not drifted from it). Outside those intervals every answer is already predicted
  with near-certainty and buys nothing.
- **Light-saturated split by hue (its 18 of those 48).** Its interval spans 5.4×, by far the widest,
  and one live explanation is that "light and saturated" is not one population. Three equal thirds
  of the OKLab hue circle — **0–120°** (pink-red → yellow-green), **120–240°** (green → blue),
  **240–360°** (blue → magenta) — each with its own six-rung ladder over the same interval, and both
  colours of a pair required to sit in the same third. The analysis fits a bar per third and says
  whether the width is hue heterogeneity or noise.
- **Direction probe (12 pairs).** Round 1 drew every partner in a random direction, so it can only
  speak about the *magnitude* of a difference. Twelve pairs at one matched distance (**0.015**, next
  to round 1's pooled 0.01582) differ along **pure lightness / pure chroma / pure hue**, one per
  (direction × quadrant). Each is constructed on its axis exactly before 8-bit rounding and then
  re-measured: the fixture records the achieved decomposition and its `purity`, and a test requires
  the intended axis to hold at least 70% of the squared difference (achieved: ≥ 0.99). A pure-hue
  difference is a rotation, so it cannot reach 0.015 below chroma 0.0075 — probe bases are therefore
  sampled at chroma ≥ 0.02 in every quadrant, including the neutral ones. The probe says nothing
  about two near-greys, and that limit is recorded in the fixture.
- **Repeats doubled to 16, controls kept at 4.** Round 1 measured 63% repeat consistency (5 of 8) —
  the reviewer's own noise floor, and the ceiling on how sharp any threshold can be. Eight repeats
  put that at roughly ±30 points; sixteen roughly halves it. They are drawn from the rungs nearest
  each quadrant's round-1 threshold, and light-saturated's four are spread one per hue third.
- **The 8-bit floor is measured, not assumed.** The fixture records, per quadrant, the distance to
  the nearest single-channel neighbour over 400 sampled bases (`expressibilityFloor`). Dark-neutral
  is the tight one: a grid step there is 0.00150 against a smallest rung of 0.00605, so rungs at the
  bottom of that ladder are quantised to about ±0.00075 — 12% of the rung. Every distance recorded
  anywhere is the **achieved** one, measured on the two colours actually shown.

**Analysis:**

```
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/review-server/analyze-bracketing.ts --round 2
```

Writes `research/v3/data/calibration/bracketing-round-2-analysis.json` and prints: **(a)** round 2
fitted alone, **(b)** rounds 1+2 pooled per quadrant with the point counts each round contributed,
**(c)** the hue split and the direction probe reported separately, and **(d)**
one-threshold-survives recomputed on the pooled fit. Round-1 light-saturated pairs are assigned a
hue third after the fact when both their colours agree on one, and dropped as `mixed` when they
straddle a boundary — a coin flip is not data.

**Pooling is checked, not assumed.** The two rounds are combined only when their `criterion` strings
match; when they do not, round 1 contributes zero points and the output says `NOT POOLED` in
capitals. That is the abandoned first pass's lesson, enforced. The direction-probe pairs are
excluded from every threshold fit in both rounds: they sit at one distance by design, and fitting
them would pile a third of the points onto a single x value.

Four pairs per direction is a probe, not a measurement — one flipped answer moves a rate by 25
points — and the verdict sentence says so whichever way it comes out.

## The oracle-validation round

The third mode, sharing the same queue, batch log, release flow and warehouse. It is the human
labeling pass that validates the VLM oracle (`REVIEW_UI.md` §6).

**For the reviewer:** <http://127.0.0.1:3010/oracle> — seeded automatically on start. One artwork,
one question, one closed vocabulary, and the answer mapping on screen at all times. Keyboard only:
**1**–**6** (whatever the fixture bound; `y`/`n` for a boolean question) · **u** undo one · **r**
release when finished. It auto-advances, resumes wherever you stopped, and is meant for ten-minute
chunks. 30 items.

**By-question passes, not by-item forms.** An item is (artwork, question, vocabulary). Every artwork
is asked question 1, then every artwork is asked question 2 — the serve order never interleaves them
and a test asserts it cannot. One criterion stays in the reviewer's head for a whole pass, which is
what makes §6's five-second answer possible; a form per artwork pays a context switch on every item.
The first batch has one question, so the whole round is one pass.

**The wording is served from the fixture**, never written into the page — the same rule the
bracketing round had to learn the hard way. The question, the standing instruction and every answer's
gloss travel with the answers.

**Answers are `oracle-label` records with the oracle's own provenance columns.** Same
`labelSchemaVersion` (`group-a.v1`, the VLM's `schema_version`), same `questionKey`, same answer
vocabulary — that is the point, the rows are meant to be compared field for field. What separates the
human rows from the VLM's is `author.kind === "human"` and the batch purpose, never the schema; the
analysis filters on authorship and a test asserts a machine-authored row in the same batch is ignored.
Each record carries full artwork identity (path + sha256 + header dimensions) and the stratum.

Answers are keyed by `(batch, question, imageId)` rather than by item id, because one artwork can be
asked several questions in the same batch. A fixture that asks one artwork the same question twice is
refused.

### Batch 1 — the premise-test disambiguation round

`oracle-premise-disambiguation-1`, 30 artworks, one question: **`ground_type`**, in the exact
vocabulary the VLM answered (`flat_field | shaded_field | multiple_distinct_fields | full_scene |
pattern_or_texture | none_discernible`), with the option glosses copied from the oracle's own prompt
so neither rater is answering a slightly different question. The standing instruction is *"A gradient
means continuous shading within one physical surface — shadows on the same surface. The sky and the
grass are different areas, not a gradient."*

**Who is in it.** Every artwork the premise test bucketed `contradiction_hard` or
`contradiction_soft` under **either** prompt variant, deduplicated across variants: 19 under A, 20
under B, overlapping on 9 → 30 distinct artworks. Artworks whose own accepted palettes disagreed
about the gradient boolean (5 of them) are excluded, matching the premise analysis's primary
population — there is nothing to disambiguate when the published side does not agree with itself.
Each artwork is served at its **eval-set rendition**, and the fixture records which
(`rendition.source`, `sourceEntryId`, `longEdgePx`); the record's dimensions come from the file header
at push time, and the push refuses if the bytes no longer hash to what the fixture was built against.

**The fixture is committed and deterministic**:
`research/v3/data/oracle-validation/premise-disambiguation-1.json`. Regenerate with:

```
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/review-server/oracle-validation.ts --write
```

It is derived from `research/v3/data/oracle-premise/premise-run-1.jsonl` and `eval-set.json`. The
premise test's own maps (`GRADIENT_MAP`, `P6_BUCKETS`, `tier_of`) are mirrored into
`oracle-validation.ts` as `[INHERITED]` constants rather than imported across a language boundary; a
test re-derives every bucket from them and asserts the totals equal the ones published in
`premise-run-1.agreement.json`, so the copy cannot drift from the original. **No code under
`research/v3/oracle/premise/` is touched** — its outputs are read, never written.

**What the browser is given: an image, a question, and an opaque token.** Not the oracle's answer,
not the published gradient boolean, not the item's contradiction bucket, not the selection counts,
not the content hash (it is the join key to both truth sources), and not the real item id. The
fixture itself carries no per-item truth either: the analysis re-derives all of it from the source
files by content hash. This batch decides the premise verdict; a payload that leaked either side
would replace the measurement with a measurement of the reviewer's agreeableness.

**Analysis** — runs on whatever has been answered so far, including nothing:

```
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/src/review-server/analyze-oracle-validation.ts [--warehouse <path>] [--batch <id>]
```

A three-way join by content hash: the reviewer's answers, the VLM's `ground_type` per prompt variant,
and the accepted palette's gradient flag. Per artwork it reports the reviewer's `ground_type`, the
binary that label maps to, who agreed (`oracle | flag | both | neither` counting both variants, plus
the sharp `contradictionVerdict` on the contradicting variants only, where the two sides point
opposite ways by construction). Totals include exact ground-type agreement per variant, binary
agreement per variant and against the flag, and a breakdown by resolution tier. It writes
`research/v3/data/oracle-validation/premise-disambiguation-1-analysis.json` and prints plain
sentences plus one line per artwork — this number decides the oracle-premise verdict, so it is
written to be read, not only parsed.

Scoping is per batch id, for the reason the bracketing analysis learned: a second pass over the same
artworks is different data and pooling them would move the number with nothing looking wrong.

### The adjudication view (post-release)

<http://127.0.0.1:3010/oracle-review> — a **read-only** browse of a *finished* round, built after the
reviewer's own report on the answering pass: *"I wasn't very confident in my answers, I feel like the
line can be pretty blurry between these different tags."* That is a different question from the one
the round asked, and it needs a different view: for each item, the artwork **large**, then side by
side the reviewer's own answer, oracle variant A, oracle variant B, the accepted-palette flag
(gradient/flat) and the computed `sidedWith` outcome — grouped into **sided-with-oracle /
sided-with-flag / neither**.

**Released batches only, asserted on both endpoints.** An open round has no adjudication view at all
— not an empty one — because this payload *is* the answering pass's answer key, and serving it mid-
round would unblind live judging. `GET /api/oracle-review/:batchId` and the note endpoint both 404
while a batch is unreleased, and answering every item is not releasing: the guard is the
`batch-complete` record, nothing else.

**One optional keystroke per item.** `d` — *the oracle's answer is also defensible here* · `m` — *the
oracle misread this* · `s`/`j`/`k` move without recording. Entirely optional per item, no release, no
completeness check; the record is appended the moment the key is pressed. That turns casual browsing
into queryable evidence about **where the ontology is blurry versus where the VLM actually misreads**
— which is exactly the distinction the reviewer's remark leaves open, and which no agreement number
can separate.

Annotations are `note` records, **never `oracle-label`**: this is an opinion *about* an answer, not a
second answer, and folding the two together would corrupt every agreement number computed from the
labels. Tags are `["adjudication-browse", "oracle-defensible" | "oracle-misread"]` — an exactly
symmetric pair, per §4's symmetric-vocabulary rule, because a page that could only record "the oracle
misread this" would be measuring willingness to complain. `derived` stays null (that field is for a
tagging agent's re-derivable records; a keystroke from the reviewer is raw evidence itself), and the
note joins back to the reviewer's own answer through `batch` + `itemId`. Re-annotating appends a
second note and the later one is the reviewer's position — nothing is deleted.

Query them with the warehouse CLI on the `adjudication-browse` tag.

### Tests, including the page itself

`review-server-oracle-validation.test.ts` covers the fixture, the serving, the records, resume,
release and the analysis. `review-server-oracle-review.test.ts` covers the adjudication view: the
released-only guard on both endpoints, the grouping, the note record's shape, the symmetric
vocabulary, re-annotation, and the page driven by keystrokes. `review-server-oracle-ui.test.ts` drives **the real `review-ui/oracle.js`**
over HTTP against the real server by dispatching key events into the handler the page registered:
every number key writes its own answer for the artwork that was on screen, `u` steps back and
replaces, an unbound key does nothing, reopening resumes at the first unanswered item, and `r`
releases. A mapping that is off by one is invisible in every server-side test and fatal to the data.
The repository installs no browser driver (and `CONVENTIONS.md` forbids adding one), so the test
provides the handful of DOM calls the page makes — element creation, text, children, one keydown
listener, `location`, `fetch` — and everything above that line is genuine. Layout and CSS are not
covered; those are judged by the reviewer opening the page.

## What works, and what is stubbed

Working end to end: push, queue, blinded rendering with mock UI and named swatches, gradient
display mapping, dual grades + preference + comment + confound, artwork veto and its withdrawal,
free editing before release, release, custody-checked image serving, restart recovery, the
colour-bracketing round (rounds 1 and 2) and the oracle-validation round (generation, serving,
keyboard answering, undo, release, analysis). Both keyboard-only pages are driven end to end by real
keystrokes in their own tests.

Not built in this skeleton:

- **Palette composer / `endorsed-sample`.** When it is built: an endorsement is **immutable
  evidence**. Editing a composed palette submits a **new** `endorsed-sample` record — never an
  amendment carrying palette changes (the warehouse throws on that). Only `comment` is amendable;
  a mistaken endorsement is withdrawn with an empty-patch amendment and `retract: true`.
- **Post-release amendments** ("amend previous batch"). The server refuses post-release edits with
  409 today; the amendment machinery it would use already exists in the warehouse library.
- **Calibration mode** (`mode: "absolute"`, REVIEW_UI.md §5) — a separate UI over the same warehouse.
- **Coverage-aware sequential stopping** for oracle validation (REVIEW_UI.md §6): per-stratum
  stopping rules, space-spanning serve order and neighbourhood expansion all need the SigLIP
  embeddings, which are another workstream's. The mode records `stratum` on every row so the rule can
  be applied later; the first batch is a fixed, fully enumerated set (every contradiction), so it has
  nothing to stop early on.
- **Note-only records and tags.** The tagging agent reads comments afterwards and files derived
  records; nothing here does that yet.
- **The completion watcher.** Meant to be a shell loop outside any model's context, tailing the
  warehouse for `batch-complete`.
- Multi-reviewer use, auth, LAN exposure. Localhost, one reviewer, no timing.
