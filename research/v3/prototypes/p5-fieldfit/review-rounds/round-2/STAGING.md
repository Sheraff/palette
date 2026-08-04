# P5 round 2 — staging record

Written by the staging worker, 2026-08-04, in the worktree `.worktrees/p5-fieldfit`
(branch `proto/p5-fieldfit`). Nothing here was committed; nothing was pushed to the server.
`items.json`, `render-data.json`, `select-fresh-covers.mjs`, this file, and the two-line set file
`research/v3/data/devloop/sets/p5-round2-fresh.txt` are the whole output (plus the two dev-loop run
files the instrument wrote itself).

Format, validation battery and installer caveats follow `round-1/STAGING.md` deliberately: this is
the same payload shape, re-cut against `p5-fieldfit-0.3.0`.

---

## 1. The runs these palettes come from

**Items 1–6 — fresh demo-20 run.**

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/demo-20.txt
```

- **Run file:** `research/v3/data/devloop/runs/p5-fieldfit-demo-20-20260804T212150824Z.jsonl`
- **Result:** 20 ok · 0 failed · 20 cache hits · 0 computed · 142 ms
- **`codeVersion`** (run header): `c4acef08d0f0b203b10b6dbed54b1aacd73213665fb6108bd6745434b82532f7`
- **`setHash`:** `c364706ce35fde8ffad818f3427377ac182e1da9639e88d419e93863221b41e7`

**Items 7–8 — the fresh two-cover run.**

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/p5-round2-fresh.txt
```

- **Run file:** `research/v3/data/devloop/runs/p5-fieldfit-p5-round2-fresh-20260804T212647066Z.jsonl`
- **Result:** 2 ok · 0 failed · 0 cache hits · **2 computed** · 398 ms
- **`codeVersion`** (run header): `c4acef08d0f0b203b10b6dbed54b1aacd73213665fb6108bd6745434b82532f7`
  — **identical to the demo-20 run's**, so both halves of the payload were produced by the same
  candidate bytes.
- **`setHash`:** `b2544509196a50a859b5aab3a20b80de10a75994174f3e35b4e501bd7e280351`

Both runs: `algorithmVersion` `p5-fieldfit-0.3.0`, `preprocessingVersion`
`sharp-0.33.5/srgb/no-resample`, node v25.8.1, `colornames-oklab@0.6.0`.

The demo-20 run reports 20 cache hits and 0 computed — the cache is keyed on `codeVersion` +
input content hash, and v0.3.0 had already been run over demo-20 in this worktree. The rows are
still v0.3.0 rows (`metadata.algorithmVersion` on every one says so); nothing from v0.1.0 or v0.2.0
can reach them. The two fresh covers were genuinely computed.

**Every colour in `items.json` is copied verbatim from a run row's `palette.roles[*].hex` and
`palette.gradient.stops[*].color.hex`.** Nothing was recomputed, re-quantised or re-rounded. The
collapse flags are the run's own `palette.collapse.{surfaceCollapsed,accentCollapsed}`.

### `dirty: false`, measured

- `git diff --stat d72387f -- research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**.
- `git status --porcelain research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**.
- Whole-worktree `git status --porcelain` at staging time → three untracked lines, none of them
  algorithm code: `data/robustness/reports/p5-fieldfit.json`, `review-rounds/round-2/ROUND.md`, and
  the set file this staging wrote.

**Concurrent edit in this worktree, flagged.** Between the two dev-loop runs and the end of staging,
`research/v3/prototypes/p5-fieldfit/SPEC.md` became modified (7 insertions, 1 deletion) — not by this
worker. It is documentation, not algorithm code: the `src` + `candidate.ts` diff against `d72387f`
and the porcelain over those paths were both re-checked afterwards and are still empty, so
`dirty: false` is unaffected. But **someone else is writing in this worktree**, and a re-run of the
dev loop is only guaranteed to reproduce these palettes while `candidate.ts` and `src/` stay
untouched.

**Note the moving HEAD.** `HEAD` was `d72387f` when this round was briefed and is now `68cd05f`
("honesty: give prototypes/<slug> an owner…"). `git diff --name-only d72387f HEAD` touches only
`data/honesty/HONESTY.md`, `data/honesty/honesty-report.json`, `src/honesty/areas.ts` — no
prototype code. So the algorithm that produced these palettes is byte-identical to `d72387f` and
`gitCommit: "d72387f"` / `dirty: false` is the honest pair.

---

## 2. The eight items

Order in `items.json` is ROUND.md's table order. `itemId` is the **full 40-hex filename stem** (see
§5, caveat A). `imagePath` is repo-relative and every one resolves under `/Users/Flo/GitHub/palette/`.

| # | itemId | imagePath | ROUND.md row / provenance |
|---|---|---|---|
| 1 | `ab67616d00001e0200000bb3dc49110c4aab8aa7` | `00/…0c4aab8aa7.jpg` | row 1 — `0c4aab8aa7`, the fg-legibility ruling's own motivating cover |
| 2 | `ab67616d00001e020000269ead63cf2376a6b67d` | `00/…2376a6b67d.jpg` | row 2 — `2376a6b67d`, the criterion question (dark-olive accent vs. hedged white) |
| 3 | `ab67616d00001e02000022e7e9d11c908479200b` | `00/…908479200b.jpg` | row 3 — `908479200b`, richness/retreat posture |
| 4 | `ab67616d00001e020000099e97d17d28279e9184` | `00/…28279e9184.jpg` | row 4 — `28279e9184`, the reviewer's named pink |
| 5 | `ab67616d00001e0200001a9be12b7116a8247378` | `00/…16a8247378.jpg` | row 5 — `16a8247378`, accent-floor ruling |
| 6 | `ab67616d00001e0200000ee5a62175fc8d58e0af` | `00/…fc8d58e0af.jpg` | row 6 — `fc8d58e0af`, named-prediction check (brown/green) |
| 7 | `ab67616d0000b2730014816eee85382bf569f953` | `14/ab67616d0000b2730014816eee85382bf569f953` | row 7 — **fresh, chosen at staging**, §3 |
| 8 | `ab67616d00001e0200083d2741c5ebb948ee7f1b` | `08/ab67616d00001e0200083d2741c5ebb948ee7f1b` | row 8 — **fresh, chosen at staging**, §3 |

Each of the six ROUND.md tokens matched exactly one row of the demo-20 run (the tokens are the last
ten characters of the filename stem, and all twenty stems are distinct in that set).

The six demo-20 palettes match every colour ROUND.md's table predicts for them: item 1's foreground
is `#000000`, item 2's accent is `#453907`, item 3's is `#9c6167`, item 4's is `#ff00a0`, item 5's is
`#594841`. That is a check on the run, not a judgement on the palettes.

**Items 7 and 8 carry no filename extension** — both corpus files are extensionless on disk
(`file(1)` reports baseline JPEG, 640×640 and 300×300). `sharp` reads the header, not the name, so
decode is unaffected; an installer that assumes `.jpg` will break. See §5, caveat I.

---

## 3. Items 7 and 8 — the selection

### Pool

**`data/coverage-set/coverage-set-1.json`, all 220 artworks.** Never `data/holdout/`: the
coverage-set build rule already removes the frozen holdout (`heldOutArtworksRemoved: 413`), and the
census re-checked every candidate against `data/holdout/holdout.json` (ids **and** file paths) as a
belt-and-braces exclusion — **0 hits**, as expected.

`gold30-variant-agreement.json` was **not** usable as a pool: it is per-variant aggregate scoring and
carries no per-item artwork ids (its gold ids live in
`data/oracle-validation/premise-disambiguation-1-analysis.json`). Coverage-set-1 was used instead,
which ROUND.md allows.

Further exclusions, applied before any statistic was read:

- demo-20 artworks, matched on the trailing 24 hex of the Spotify-style stem so that a *different
  rendition of the same artwork* is excluded too — **0 hits** (coverage-set-1 and demo-20 do not
  overlap).
- 2 artworks whose files are not reachable from this worktree: `images/greenday.jpg`,
  `images/slim.jpg` (the `images` enrichment collection has no symlink here). Both are enrichment
  rows, neither is a shard cover.

**218 artworks censused.**

### The census (input only)

`select-fresh-covers.mjs`, kept beside this file, is the exact program. It decodes each candidate
at 64×64 (`sharp`, `fit: "fill"`, sRGB, raw), converts to OKLab and reports, per image:

- `fieldMedianL` / `fieldMedianC` — median over 16×16 blocks of each block's **median** L and
  chroma. The block median rejects overlay text and small marks, so these read the *field*, not what
  is printed on it.
- `fieldPlaneR2` — R² of a least-squares plane fitted to the 256 block-median lightnesses. The
  "is the field a ramp" statistic.
- `fieldPlaneAmplitude` — peak-to-peak of that fitted plane across the frame, in OKLab L.
- `vividFrac` — share of pixels with OKLab chroma ≥ 0.12.
- `flatFrac` — share of pixels whose 4-neighbourhood is perceptually identical (max |ΔL|, |ΔC| <
  0.01). Vector/illustrated covers are mostly flat fill; continuous-tone photographs are not.
- `topBinShare`, `distinctBins` — share of the most common, and count of occupied, 4-bit RGB bins.

**No palette, no diagnostic, and no candidate-algorithm call is involved.** The census imports
`sharp` and nothing from `prototypes/`. Both picks were made before either palette existed: the set
file was written, then the dev loop was run on it, then `diagnose.ts`.

### Item 7 — light-field, gradient-ish

**Rule (stated before ranking):** `fieldMedianL ≥ 0.80` **and** `fieldMedianC ≤ 0.05` **and**
`fieldPlaneR2 ≥ 0.60` **and** `fieldPlaneAmplitude ≥ 0.03`; rank survivors by `fieldPlaneR2`
descending, take rank 1.

**Survivors: exactly one.** `ab67616d0000b2730014816eee85382bf569f953` —
`fieldMedianL 0.826`, `fieldMedianC 0.044`, `fieldPlaneR2 0.703`, `fieldPlaneAmplitude 0.534`,
`vividFrac 0.000`, `distinctBins 120`.

For context, the lightness+neutrality gate alone leaves 18 candidates; the next-best plane fits are
`…951b800ff04133` (R² 0.433), `…1d9149dbe92fa0` (0.375), `…e16610224c5ca4` (0.307) — so the winner is
clear of the field by a wide margin and no tie-break was needed.

**Honest description of the artwork** (looked at *after* selection, before any palette): a
photograph of power pylons under a pale blue sky, with the title set in white across the middle. The
sky is a smooth light ramp over roughly the top two thirds; the bottom third is dry brown grass. It
is item 1's *class* (light, near-neutral, smoothly ramped field) but it is not a synthetic near-white
ramp — the plane amplitude 0.534 is real, not the ~0.03 of item 1's `#ececec→#f5f5f5`. **Flagged:**
if the round wanted specifically a *near-white low-amplitude* ramp, this pool has no such cover under
a stated rule, and the round-3 draw should widen rather than the rule be bent here.

### Item 8 — vivid-colour photograph

**First-pass rule, rejected:** `distinctBins ≥ 500 ∧ detail ≥ 0.03`, rank by `vividFrac`. Its rank-1
was `…1877c2d951961a`, which on inspection is a **flat-colour cartoon illustration**
(`flatFrac 0.283`, `topBinShare 0.372`) — the rule encoded "colourful and busy", not "photograph".
Recording the miss rather than hiding it: the rule was replaced *before* any palette was computed for
either candidate, so no output influenced the change.

**Rule used (stated before ranking):** photographic gate `flatFrac ≤ 0.20` **and**
`topBinShare ≤ 0.15` **and** `distinctBins ≥ 500`; rank survivors by `vividFrac` descending, take
rank 1.

**Pool after the gate: 17.** Rank 1: `ab67616d00001e0200083d2741c5ebb948ee7f1b` —
`vividFrac 0.472`, `meanC 0.107`, `p90C 0.183`, `flatFrac 0.021`, `topBinShare 0.040`,
`distinctBins 766`. Runners-up: `…28459646be9b20` (0.458), `…06a6a8942d6547` (0.417),
`…b5140b3658d0a1` (0.407).

**Honest description:** a photographic composite cover — two performers photographed against a
saturated orange/red field, with a Devi illustration behind and large Devanagari display type. It is
photographic in tone (flatFrac 0.021) and vivid (47% of pixels above chroma 0.12), which is what the
row asks for; it is a *composite*, not a single continuous photograph, and no stated statistic
distinguishes those two.

### `diagnose.ts` on both — for the record, NOT part of the payload

```
node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts <absolute image path>
```

(the tool resolves relative paths against `research/v3`, not the repository root, so absolute paths
were used).

**Item 7 — `ab67616d0000b2730014816eee85382bf569f953`:**

```json
{
  "size": "640×640",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": false,
    "inlierFraction": 0.67146484375,
    "fieldExplainedFraction": 0.65376708984375,
    "residualScale": 0.04061573273632675,
    "marginBars": 0.7535537318426602,
    "orientationMargin": 13.417154819803384,
    "gradient": true,
    "excursionMax": 0.0022843711207621692,
    "thirdStopAccepted": false,
    "residualExcursion": 0.0019105403612408728,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "palette": {
    "background": "#b8d8ed",
    "surface": "#a1c7de",
    "foreground": "#000000",
    "accent": "#5e433c",
    "gradient": [ { "hex": "#b8d8ed", "position": 0 }, { "hex": "#a1c7de", "position": 1 } ],
    "geometry": { "kind": "linear", "angleDegrees": 128.5993326246578 },
    "collapse": { "surfaceCollapsed": false, "accentCollapsed": false },
    "escape": null
  }
}
```

**Item 8 — `ab67616d00001e0200083d2741c5ebb948ee7f1b`:**

```json
{
  "size": "300×300",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": true,
    "inlierFraction": 0.9438666666666666,
    "fieldExplainedFraction": 0.08378888888888888,
    "residualScale": 0.20994370142966506,
    "marginBars": 0.9465828229835163,
    "orientationMargin": 0,
    "gradient": false,
    "excursionMax": 0,
    "thirdStopAccepted": false,
    "residualExcursion": 0,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "palette": {
    "background": "#f9fbf8",
    "surface": "#f9fbf8",
    "foreground": "#000000",
    "accent": "#f50000",
    "gradient": null,
    "geometry": null,
    "collapse": { "surfaceCollapsed": true, "accentCollapsed": false },
    "escape": null
  }
}
```

Both palettes in `items.json` are byte-identical to the run rows; `diagnose.ts` re-derives them from
the same `analyzeImage`, and the two agree.

---

## 4. What is in each file

**`items.json`** — a bare JSON **array** of 8 calibration items, each with exactly five keys:
`itemId`, `imagePath`, `variantId`, `fingerprint`, `palette`. No batch envelope: the installer
supplies `batchId`, `purpose` and `fundedBy`.

`variantId` is `"p5-fieldfit-0.3.0"` on every item; `fingerprint` is
`{algorithmVersion: "p5-fieldfit-0.3.0", preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
gitCommit: "d72387f", dirty: false}` on every item.

**`render-data.json`** — an **object keyed by `itemId`**, each value `{ roles, gradient, fieldCss }`:

- `roles` — four entries in fixed order `background, surface, foreground, accent`, each
  `{ role, hex, name, collapsed }`. `name` comes from `nameHexes()` (`src/review-server/color.ts:62`,
  the one `colornames-oklab` call site). `collapsed` is `false` for background and foreground by
  construction, and the palette's own `surfaceCollapsed` / `accentCollapsed` for the other two.
- `gradient` — the stops verbatim, or `null`.
- `fieldCss` — produced by the **pinned renderer**, `fieldCss()` at `src/review-server/gradient.ts:119`:
  the flat background hex when there is no gradient, otherwise
  `linear-gradient(135deg in oklab, <hex> 35%, <hex> 100%)`. The 35% is the 2-stop display reserve,
  not a fitted position; the true fitted positions stay in `gradient`.

**Blinding.** Neither served file contains a prototype name, a mechanism label, a version string, a
diagnostic, a before/after framing or any round metadata. `variantId` and `fingerprint` do name the
algorithm, deliberately — they are TRUE names the server keeps and never serves
(`src/review-server/README.md`, "Calibration mode"). The leak scan in §5 covers everything else.

**`select-fresh-covers.mjs`** is a staging artefact, not payload. It must not be pushed.

---

## 5. Validation

Run from `research/v3` with a throwaway `check.ts` (kept out of the repository, in the session
scratchpad). All checks passed:

```
PASS  items.json parses as an array of 8 — 8 items
PASS  8 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every itemId is a full 40-hex stem
PASS  every hex matches ^#[0-9a-f]{6}$ — 36 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 8/8 resolve
PASS  no imagePath is absolute
PASS  gradient ends are background -> surface — 2 gradient items
PASS  gradient positions in [0,1] and strictly increasing
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality
PASS  items.json items carry exactly the 5 push keys
PASS  fingerprint is uniform and names v0.3.0
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  render names are the current colornames-oklab output
PASS  fieldCss is a ramp when there is a gradient, the flat background otherwise
PASS  render entries carry exactly roles/gradient/fieldCss
PASS  no diagnostics / mechanism labels / version labels in any served field — clean
```

**Plus the dry-run through the real parser**, as round 1 did:

```
parseCalibrationBatch OK: 8 items, purpose calibration
round-trip identical: true
```

The 8 items (with `imagePath` rewritten to absolute) were fed to `parseCalibrationBatch` from
`src/review-server/batch.ts` and every palette came back byte-identical. It does **not** exercise
`pushCalibration`'s later stages (path allowlist, `sharp.metadata()` on the file header, batch-log
write), so the live push is still the real test.

**One note on the leak scan.** `"round"` cannot be used as a leak token — `background` and
`foreground` contain it. The list actually scanned is `p5`, `fieldfit`, `field-fit`, `v0.`, `0.3.0`,
`explf`, `nofield`, `round-1`, `round-2`, `round 2`, `before`, `after`, `twoblock`, `two-block`,
`retreat`, `prototype`, `calibration`, `diagnos`, case-insensitively, over all of
`render-data.json` plus every item's `itemId` / `imagePath` / `palette`. Zero hits.

---

## 6. Payload caveats an installer must act on

Caveats **A–H are carried over from `round-1/STAGING.md` §5** and re-verified against this payload;
**I** is new to this round.

**A. `itemId` is the FULL 40-hex filename stem, not the 10-char token ROUND.md uses.** Unchanged
from round 1, and unchanged deliberately: round 1 pushed (or staged) this form, and switching now
would make round-1 and round-2 feedback un-joinable on the item handle. Both forms pass `ID_PATTERN`
(`batch.ts:32`). **If the orchestrator wants the short token, decide before the push** — the item id
is the reviewer's copy-paste feedback handle (ROUND_KIT.md) and changing it afterwards orphans any
note that quoted it.

**B. `imagePath` is repo-relative and MUST be rewritten to absolute before the push.**
`parseCalibrationBatch` requires `isAbsolute(imagePath)` (`batch.ts:219`). Prefix with
`/Users/Flo/GitHub/palette/` — the **main checkout**, not the worktree; the server's `imageRoots`
allowlist is satisfied by the main checkout root, and all 8 files were verified present there.

**C. `gradient.geometry` was dropped, deliberately.** The run emits an **object**
(`{kind, angleDegrees}`); the server requires a **string** of ≤64 chars when the field is present
(`batch.ts:104`). Item 7's fitted angle is 128.6° and the pinned renderer fixes display at 135°
(`gradient.ts:33`), so nothing reaches the field either way. Flattening it to a string is a decision,
not a fix.

**D. Where the push shape was read from** — `src/review-server/README.md` "Calibration mode";
`server.ts:2462` (`POST /api/calibration` → `pushCalibration`, defined `server.ts:677`);
`batch.ts:205-242` (`parseCalibrationBatch`), `:107` (`parsePalette`), `:129-133`
(`parseFingerprint`, where `dirty` is **required and never defaulted**), `:72-105` (`parseGradient`:
2–4 stops, hex colours, positions canonicalised to 6 decimals then required strictly increasing),
`:110-117` (both collapse booleans required; the server deliberately does **not** enforce contract
invariants).

**E. `purpose` defaults to `calibration`** (`batch.ts:207`); `fundedBy` defaults to `[]`
(`batch.ts:212`) and was **not** invented here. The installer owns that list.

**F. The side-car shape is a MAP, not the `{batchId, items:[…]}` envelope the existing side-cars
use.** `render-data.json` maps `itemId → { roles, gradient, fieldCss }` — the inner `side` object of
`review-ui/accent-real-1.data.json`, hoisted. If the page rendering this round expects the
accent-real envelope, this file needs re-wrapping (a wrapper, not a rebuild). The live
`/calibration` page (`review-ui/calibration.js`) is pre-kit and builds its side from the **server
payload**, so on today's server this file may be advisory. Confirm before pushing.

**G. `render-data.json` names are the CURRENT `colornames-oklab@0.6.0` output** (the version both
run headers record). Names are presentation-only and never feed a judgement, but they were computed
here rather than server-side; a re-name under a different package version would disagree. `nameHexes`
is deliberately not `unique: true`, which is why item 3's background and surface both read "Holy
Crow" and item 8's background and surface both read "Snow" — that identity is the collapse, shown.

**H. Two items carry a gradient; six are flat.** Items 1 and 7. Both ramps are 2-stop with
`stops[0].color === background` and `stops[1].color === surface` at positions 0 and 1.

**I. NEW — item 6's two distinct field colours do not reach the rendered field.** `fc8d58e0af` is a
two-block reading: `background #545d58`, `surface #4b544f`, `surfaceCollapsed: false`, and
`gradient: null`. `fieldCss()` renders the flat background alone whenever `gradient` is `null`, so
the reviewer sees `#545d58` and the second block only appears in the role swatches. That is the
pinned renderer behaving as specified, not a staging error — but if the round wants the second block
visible on the mock, that is a REVIEW_UI change and must be decided before the push, not patched
into this file.

**J. NEW — items 7 and 8 have no filename extension.** `14/ab67616d0000b2730014816eee85382bf569f953`
and `08/ab67616d00001e0200083d2741c5ebb948ee7f1b` are extensionless files on disk. `sharp` and the
dev loop handle them; `src/devloop/serve.ts:295` falls back to `application/octet-stream` for an
unknown extension, so **a browser preview served through the dev loop may not display these two
images** even though the palettes are correct. Anything that infers a content type from the filename
needs a header sniff here.
