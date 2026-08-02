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
| `GET` | `/media/:batchId/:itemId` | the artwork bytes, custody-checked on every request |
| `GET` | `/`, `/app.js`, `/styles.css` | the review page (read from disk per request — edit it while the server stands) |

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
mock player UI (artwork embedded borderless on the field, a surface-coloured card, foreground text,
accent icon shapes, no shadows) and the swatches beside it, each labelled with its hex **and** its
`colornames-oklab` name.

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

**For the reviewer:** <http://127.0.0.1:3010/bracketing> — seeded automatically on start.
Keyboard only: **y** yes · **n** no · **u** undo one · **r** release when finished. It auto-advances,
resumes wherever you stopped, and is meant for ten-minute chunks. 72 items.

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

## What works, and what is stubbed

Working end to end: push, queue, blinded rendering with mock UI and named swatches, gradient
display mapping, dual grades + preference + comment + confound, artwork veto and its withdrawal,
free editing before release, release, custody-checked image serving, restart recovery, and the
colour-bracketing round (generation, serving, keyboard answering, undo, release, analysis).

Not built in this skeleton:

- **Palette composer / `endorsed-sample`.** When it is built: an endorsement is **immutable
  evidence**. Editing a composed palette submits a **new** `endorsed-sample` record — never an
  amendment carrying palette changes (the warehouse throws on that). Only `comment` is amendable;
  a mistaken endorsement is withdrawn with an empty-patch amendment and `retract: true`.
- **Post-release amendments** ("amend previous batch"). The server refuses post-release edits with
  409 today; the amendment machinery it would use already exists in the warehouse library.
- **Calibration mode** (`mode: "absolute"`, REVIEW_UI.md §5) and **oracle validation mode**
  (by-question passes, REVIEW_UI.md §6). Both are separate UIs over the same warehouse.
- **Note-only records and tags.** The tagging agent reads comments afterwards and files derived
  records; nothing here does that yet.
- **The completion watcher.** Meant to be a shell loop outside any model's context, tailing the
  warehouse for `batch-complete`.
- Multi-reviewer use, auth, LAN exposure. Localhost, one reviewer, no timing.
