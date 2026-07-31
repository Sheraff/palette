# v2-3 evaluation harness

Corpus running, winner diffing, blinded batch assembly, and the human review UI for the v2-3 track.
Nothing here touches `research/v2-2/` or `research/v2-3/`; the algorithms are imported through their
public `index.ts` only. Plain Node with `--experimental-strip-types`, no new dependencies.

All commands are run from the repository root.

## 1. Run the corpus

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/run-corpus.ts \
  [--algo v2-2|v2-3|both] [--images <glob-or-list>] [--label <string>] [--force]
```

- `--algo` defaults to `both`.
- `--images` defaults to every image in `images/`. It is a comma-separated list; each entry is either
  a path relative to the repository root (anything containing `/`), or a match against `images/`
  basenames — exact name, name without extension, or a `*` / `?` glob. Examples:
  `--images birdsofprey.jpg,meteora.jpg`, `--images "pure*"`, `--images images/franz.jpg`.
- `--label` names the result set. It defaults to the algorithm's `algorithmIdentity` (`v2-2` / `v2-3`)
  and requires a single `--algo`. Use it when the meaning of `v2-3` changes: `--algo v2-3 --label v2-3-transition-fix`
  keeps the old and new results side by side.
- `--force` re-extracts even when the cache is valid.

Results are cached at `research/v2-3-eval/data/results/<label>/<basename>.json`:

```json
{
  "schemaVersion": 1,
  "label": "v2-3",
  "algorithm": "v2-3",
  "algorithmIdentity": "v2-3",
  "image": "birdsofprey.jpg",
  "imagePath": "images/birdsofprey.jpg",
  "sourceSha256": "26b991…",
  "byteCount": 136233,
  "extraction": { "…": "the complete PaletteExtraction returned by the algorithm" }
}
```

A cached entry is reused when its `sourceSha256`, `label`, and `algorithmIdentity` all still match, so
reruns are no-ops. Nothing time-dependent is written: the same image and algorithm always produce a
byte-identical file. Processing is sequential (~5 s per full-resolution image); progress is printed per image.

## 2. Diff two result sets

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/diff-report.ts \
  --a <label> --b <label> [--images <glob-or-list>] [--json <path>]
```

Prints one row per changed field for every image whose displayed winner differs — the four role hexes,
the gradient flag (`flat` / `gradient`), and the source-supported midpoint hex (`none` when absent) —
followed by `N image(s) compared, M differ`. Images present in only one set are reported as `missing`;
images extracted from different bytes in each set raise a warning. `--json` writes the same information
machine-readably (`differences[].changed` lists the changed field names).

## 3. Assemble a blinded review batch

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/make-batch.ts \
  --name <batch> --a <label> --b <label> --cases <basename,basename,...>
```

To compare **a different label pair per item** in one batch, use a spec file instead:

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/make-batch.ts \
  --name <batch> --spec <path-to-json>
```

```json
[
  { "image": "loups.jpg",   "a": "track-b-h3", "b": "track-b-h1h3" },
  { "image": "placebo.jpg", "a": "v2-2",       "b": "track-b" }
]
```

(An object with an `items` array is also accepted.) `--spec` and `--a`/`--b`/`--cases` are mutually
exclusive; everything else — blinding, size limits, output files — behaves identically.

Writes two files:

- `research/v2-3-eval/data/batches/<batch>.json` — the reviewer-facing spec. Per item:
  `{ image, imagePath, sourceSha256, byteCount, A, B }` where `A` and `B` are palettes
  (`background`, `surface`, `foreground`, `accent`, `gradient`, `collapse`, `midpoint`, `width`, `height`).
  The algorithm identity is deliberately absent from this file.
- `research/v2-3-eval/data/batches/<batch>.key.json` — the un-blinding key. Each `sides[i]` entry carries
  `{ image, sourceSha256, labels: [a, b], A: label, B: label }`; the batch-level `labels` is the `--a`/`--b`
  pair for a single-pair batch and the sorted distinct labels for a mixed one. The review server reads this
  file and never serves it. Keys written before per-item pairs existed have no `sides[i].labels`; the server
  falls back to the batch-level `labels` for them, so older batches keep serving and keep producing the same
  records.

Blinding is deterministic, content-derived, and applied **per item**: an even first byte of that image's
sha256 puts the item's own `a` label on side A, an odd one puts its `b` label on side A. Re-running the
command reproduces the same assignment. Batch size is enforced at **4–10 items**; anything else is an error,
because the human reviewer must never receive more than 10 at a time.

Note that the batch *name* is visible to the reviewer (it is shown in the UI header), so avoid encoding the
compared labels in it if that would give the blinding away.

## 4. Review

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts <batch-name> [--port 3005]
```

Opens http://127.0.0.1:3005/. The front-end is built on the existing review apps: the blinded A/B item layout,
monochrome chrome, and assessment block come from `research/album-artwork-palette-v2-0.7.7-quick-review/`, and
the treatment mock, role legend, named colors, and gradient-midpoint custody row come from
`research/album-artwork-palette-v2-phase-3-showcase/`. Per item the page renders each palette as a complete UI
mock with the artwork embedded inside the field (borderless, no shadow): the field is the flat `background`, or
`linear-gradient(135deg in oklab, background 0%, midpoint 50%, surface 100%)` when a source-supported midpoint
exists, with a foreground text sample, a surface card, and an accent element, plus a role legend.

**Every color displayed anywhere in the UI carries its nearest name** from the repository's `colornames-oklab`
wrapper (`research/src/color-name.ts`, `namePalette` → `nearestName`, the same convention the showcase and
quick-review apps use). Names are computed server-side, are presentation-only, and are not recorded in verdicts.

**Identical pairs are not presented as comparisons.** When both labels produced exactly the same displayed
treatment (all four role hexes, gradient flag, both collapse flags, midpoint), the item renders as a single
palette panel labeled "Single palette / identical on both sides" with no preference control, and the reviewer
only gives the absolute verdict, corrections, tags, and notes. Identity is detected at render time from the
palettes themselves; the batch and key formats are unchanged. The server rejects any side preference submitted
for such an item, and marks its warehouse record `"comparison": "identical"`.

Collected per item:

- **preference** — `A`, `B`, or `equal` (forced to `equal` and not asked for identical pairs);
- **verdict** — absolute judgement of the preferred side: `strong`, `acceptable`, `weak-fallback`, `unacceptable`
  (when the preference is `equal` it applies to both sides);
- **corrections** — *the corrected palette: what the four role colors should have been.* This is asked on every
  item, directly under the verdict, because it is the only answer that distinguishes a candidate we never built
  from one we built and mis-ranked. The reviewer clicks named swatch chips; **Start from A / Start from B** fills
  all four roles from a treatment on screen so only the disputed roles have to be re-clicked, and **Clear all**
  empties them. A live summary shows the palette being assembled and whether it is `skipped`, partial, or
  `complete`. It stays skippable — submission is gated on preference and verdict only — but a partial answer is
  still usable: the metrics compare only the roles that were actually set. Each chip shows the color, its name,
  and its hex; there is no hex input, and the server rejects any correction that is not one of the swatches it
  served. Chips come from the image itself (solid border) plus the palette colors proposed by either option
  (dashed border). See *Swatch sampling* below.
- **tags** — optional multi-select: `wrong-role`, `incomplete-identity`, `contrast`, `missing-gradient`,
  `extraneous-gradient`, `wrong-midpoint`, `other`;
- **notes** — freeform text.

Submitting posts the whole batch; the server un-blinds it with the key file and appends one record per item to
the warehouse.

### Swatch sampling

`src/swatches.ts` builds the correction chips. It is deterministic, and every image swatch is an **exact pixel
value** taken from the artwork — never a cluster mean, which would offer the reviewer a color the artwork does
not contain.

- **Native resolution.** Pixels are counted at the image's own resolution (fitted down only above 4,000,000
  pixels). Downscaling blends thin strokes into their background, which is what previously turned bright red
  cover text into a muddy averaged red.
- **Population pass** (14 swatches): colors grouped into 4-bit-per-channel clusters, taken by population, each
  represented by the most common exact color inside its cluster, greedily spread apart in OKLab.
- **Salience pass** (8 swatches): the remaining clusters scored by `chroma × OKLab distance to everything already
  chosen`, so small but vivid and perceptually isolated elements — logo text, credits, outlines — get picked even
  though their population is tiny. A cluster is only eligible above a minimum representativity (0.02% of the
  image and at least 48 pixels), so a stray pixel or a JPEG aberration can never become a swatch.
- Everything is deduped perceptually in OKLab, so the strip stays around 22 image swatches plus the palette
  colors under review.

`review-app/index.html`, `styles.css`, and `app.js` are read into memory once at startup, so a running server
keeps serving the front-end it started with: **restart `serve-review.ts` after editing anything in `review-app/`.**

## 5. Export the candidate domain

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/export-candidates.ts \
  [--images <glob-or-list> | --from-warehouse] [--label <name>] [--force]
```

The algorithms publish only their winner, so measuring recall means replaying the internal candidate
construction. This script imports `research/v2-3/src/internal/*` **directly and read-only** and repeats exactly
the sequence `extractPaletteDetails` runs — seed domain, common base, transition normalization, supplemental
treatments, materialization, role evidence, `scorePaletteCandidates` — then also calls `extractPaletteDetails`
to record the published winner. Nothing under `research/v2-3/` is modified; its architecture test constrains
imports *inside* that folder, and this tooling lives outside it.

`--from-warehouse` selects every image that appears in the warehouse, resolving paths from the batch files
(reviewed artwork is not always in `images/`). Output goes to `data/candidates/<label>/<image>.json`, cached on
the image sha256 like `run-corpus.ts`:

```json
{
  "candidateCount": 1500,
  "publishedWinnerKey": "#6c8a8a:#86a5aa:#fbfdfa:#c91611:gradient",
  "topRankedKey": "…",
  "candidates": [{ "rank": 1, "key": "bg:surface:fg:accent:gradient|flat", "pareto": true, "qualityUtility": 0.83, "relationUtility": 0.88 }]
}
```

The canonical `key` carries all four role hexes and the gradient flag, which is everything the metrics need.

## 6. Recall vs ranking — `eval-metrics.ts`

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/eval-metrics.ts \
  [--candidates <label>] [--epsilon 0.04] [--source all|corrections|endorsed] [--verbose] [--json <path>]
```

The point of this tool is that **a missing candidate and a mis-ranked candidate are different bugs** and were
previously debugged as the same one. For every human answer in the warehouse it reports:

- **oracle over candidates (RECALL)** — the lowest cost achievable by *any* candidate in the ≤1500 domain. If
  this is above epsilon, no amount of scoring work can fix the case: the answer was never built.
- **our published ranking (RANKING)** — the cost of the treatment we actually publish. If the oracle is within
  epsilon and this is not, the answer existed and we ranked something else first; `@rank` and `1st ok` show
  where it sat.
- **human-agreement ceiling** — mean cost between two *independent* human answers for the same image. We cannot
  agree with "the" human answer more closely than humans agree with each other, so this bounds both numbers
  above. (Lin & Hanrahan measured humans agreeing on about 2 of 5 swatches, so expect it to be well below
  perfect.)

Cost is OKLab Euclidean, averaged per role, using **min-cost bipartite matching** between the two palettes —
roles are a labelling humans disagree about, so the palettes are matched as sets (with four colors per side the
assignment problem is 24 permutations, enumerated exactly). 1 JND ≈ 0.02, so the default epsilon of 0.04 is
about 2 JND per role; the tier table also reports 1 and 3 JND.

Two classes of human answer are read, never mixed silently:

- `correction` — an explicitly corrected palette (the strong evidence; partial answers compare only the roles
  that were set).
- `endorsed` — a palette the reviewer graded `strong`, used as a proxy so the tool produces numbers before
  enough corrections accumulate. A record's correction always supersedes its endorsed palette.

## 7. Bradley-Terry scores — `bradley-terry.ts`

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/bradley-terry.ts \
  [--anchor <label>] [--bootstrap 2000] [--prior 1] [--json <path>]
```

Every round produces preferences against whatever label it happened to face, so raw win counts are not
comparable across rounds. Bradley-Terry fits one latent quality per label over all pairwise preferences at once,
which makes two labels comparable even when they never met, as long as the comparison graph connects them.

- Fitted by minorization-maximization (Hunter 2004) to a fixed point, with a weak conjugate prior (`--prior`
  virtual comparisons against a reference of strength 1) so an undefeated or winless label stays finite.
- Ties (`preference: equal` on a real A/B item) count as half a win each way. `identical` records are excluded —
  they are not comparisons.
- Scores are log-odds, anchored at `v2-2` (score 0) by default: +0.69 means roughly 2:1 preferred over the
  anchor. `P(beat anchor)` is the same number as a probability.
- 95% intervals come from a seeded bootstrap over whole records, so the output is deterministic. Labels with
  fewer than three records are flagged: read their intervals, not their scores.

## Warehouse schema — `research/v2-3-eval/data/verdicts.jsonl`

Append-only JSON Lines, one record per reviewed item. Each record is self-contained: it can be mined without
the batch, key, or result files that produced it.

| field | type | meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | record format version |
| `recordedAt` | ISO 8601 string | submission time |
| `batch` | string | batch name |
| `image` | string | image basename in `images/` |
| `imageSha256` | hex string | sha256 of the exact reviewed bytes |
| `labels` | `[string, string]` | the two result labels compared **by this item**. A batch may mix pairs, so always read this per record rather than assuming one pair per batch. For single-pair batches (including every batch written before per-item pairs existed) this is exactly the batch's pair, so existing records mine unchanged. |
| `blindSides` | `{ A: label, B: label }` | which label was shown on which side |
| `palettes` | `{ [label]: palette }` | both palettes, keyed by their **true** label |
| `comparison` | `"ab" \| "identical"` | `"ab"`: the two labels differed and the reviewer compared them. `"identical"`: both labels produced the same displayed treatment, only one palette was shown, and no preference was asked. **Never mine an `"identical"` record as a genuine preference for equality.** |
| `preference` | `{ side: "A" \| "B" \| null, label: string \| null }` | `null` when the reviewer answered `equal`, and always `null` when `comparison` is `"identical"` |
| `verdict` | `"strong" \| "acceptable" \| "weak-fallback" \| "unacceptable"` | absolute judgement |
| `verdictApplies` | array of labels | the preferred label, or both labels when the preference was `equal` |
| `corrections` | `{ [role]: hex }` | the corrected palette — what the reviewer says the roles should have been. May be empty (skipped) or partial; a complete answer has all four roles. Every hex is one of the swatches the server offered for that image. |
| `tags` | array of strings | deduplicated and sorted |
| `notes` | string | freeform, may be empty |

A `palette` is `{ background, surface, foreground, accent, gradient, collapse, midpoint, width, height }`,
each role being `{ rgb, oklab, hex, generated }` and `midpoint` a hex string or `null`.

The file is also where hand-recorded human evidence lands — for example a `"comparison": "correction-only"`
record carrying a corrected role from a conversation, with a single label, no preference, and a `null` verdict.
`src/warehouse.ts` is the reader every mining tool uses: it normalizes optional fields so such records parse
without special-casing, and keeps each record's line number for traceability. Treat the shape as *observed*
rather than guaranteed, and never assume `comparison` is only `ab`/`identical`.

## Typecheck

```sh
node_modules/.bin/tsc -p research/v2-3-eval/tsconfig.json
```

The local `tsconfig.json` mirrors the algorithm folders' settings and additionally pulls in their
`apca-w3.d.ts` ambient declarations (which the imported algorithm sources need). It changes nothing outside
this folder.
