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
- **corrections** — optional per-role color chosen by clicking a named swatch chip. Each chip shows the color,
  its name, and its hex; there is no hex input, and the server rejects any correction that is not one of the
  swatches it served. Chips come from the image itself (solid border) plus the palette colors proposed by either
  option (dashed border). See *Swatch sampling* below.
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
| `corrections` | `{ [role]: hex }` | optional; roles are `background`/`surface`/`foreground`/`accent` |
| `tags` | array of strings | deduplicated and sorted |
| `notes` | string | freeform, may be empty |

A `palette` is `{ background, surface, foreground, accent, gradient, collapse, midpoint, width, height }`,
each role being `{ rgb, oklab, hex, generated }` and `midpoint` a hex string or `null`.

## Typecheck

```sh
node_modules/.bin/tsc -p research/v2-3-eval/tsconfig.json
```

The local `tsconfig.json` mirrors the algorithm folders' settings and additionally pulls in their
`apca-w3.d.ts` ambient declarations (which the imported algorithm sources need). It changes nothing outside
this folder.
