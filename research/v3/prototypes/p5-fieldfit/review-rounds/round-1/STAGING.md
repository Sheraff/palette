# P5 round 1 — staging record

Written by the staging worker, 2026-08-04, in the worktree `.worktrees/p5-fieldfit`
(branch `proto/p5-fieldfit`). Nothing here was committed; nothing was pushed to the server.
This file, `items.json`, `render-data.json` and the appended section of `ROUND.md` are the whole
output.

---

## 1. The run these palettes come from

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/demo-20.txt
```

- **Run file:** `research/v3/data/devloop/runs/p5-fieldfit-demo-20-20260804T174914272Z.jsonl`
- **Result:** 20 ok · 0 failed · 20 cache hits · 0 computed · 129 ms
- **`codeVersion`** (run header): `6eacf7ab745026d7efbbcddc7f5ad22b6c6463da3b51c1cc9c9d045018467da1`
- **`preprocessingVersion`** on every row: `sharp-0.33.5/srgb/no-resample`
- **`algorithmVersion`** on every row: `p5-fieldfit-0.1.0`

**Every colour in `items.json` is copied verbatim from this file's `palette.roles[*].hex` and
`palette.gradient.stops[*].color.hex`.** Nothing was recomputed, re-quantised or re-rounded. The
collapse flags are the run's own `palette.collapse.{surfaceCollapsed,accentCollapsed}`.

### `dirty: false`, and why

The orchestrator's late instruction: use `gitCommit: "3e2d826"`, and set `dirty` from whether the
**algorithm** files were uncommitted at run time. Measured, not assumed:

- `git diff --stat 3e2d826 -- research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**.
- `git status --porcelain research/v3/prototypes/p5-fieldfit/` → **empty**.
- Whole-worktree `git status --porcelain` → one line, `?? research/v3/data/robustness/reports/p5-fieldfit.json`
  — a report output, not algorithm code.
- `HEAD` is `35905c9` ("close owed-commit ledger"), whose only change over `3e2d826` is the ledger.

So the algorithm the run executed is byte-identical to `3e2d826` and **`dirty: false` is the honest
value**. This overrides the original brief's `gitCommit: "3df30d9"` / `dirty: true`: `3df30d9` is the
commit *before* the explained-fraction detector and the two-block rescue landed, so it would have
named the wrong algorithm outright.

---

## 2. The eight items

Order in `items.json` is ROUND.md's table order. `itemId` is the **full 40-hex filename stem** (see
§5, caveat A). `imagePath` is repo-relative and every one resolves under `/Users/Flo/GitHub/palette/`.

| # | itemId | ROUND.md row / provenance |
|---|---|---|
| 1 | `ab67616d00001e0200000bb3dc49110c4aab8aa7` | row 1 — `0c4aab8aa7`, clean fitted gradient (near-white ramp `#ececec`→`#f5f5f5`); mechanism core |
| 2 | `ab67616d00001e02000023e98b7381eaed77a9cb` | row 2 — `eaed77a9cb`, explF just above the field floor, now a ramp `#222335`→`#474b56`; the noField threshold from the kept side |
| 3 | `ab67616d00001e020000269ead63cf2376a6b67d` | row 3 — `2376a6b67d`, two-block rescue on the yellow/red block cover (`#fad107` / `#f81107`, flat, surface not collapsed) |
| 4 | `ab67616d00001e0200000ee5a62175fc8d58e0af` | row 4 — `fc8d58e0af`, suspected false-positive rescue; the two blocks `#545d58` / `#4b544f` are exactly the pair the row names |
| 5 | `ab67616d00001e02000022e7e9d11c908479200b` | row 5 — `908479200b`, declared retreat on a photograph (flat `#231f20`, `surfaceCollapsed: true`) |
| 6 | `ab67616d00001e020000099e97d17d28279e9184` | row 6 — `28279e9184`, declared retreat at the light pole (flat `#cccecd`, `surfaceCollapsed: true`) |
| 7 | `ab67616d00001e02000000d8bc25fbca2eff2a4a` | row 7 — `ca2eff2a4a`, order-0 flat black cover, foreground `#ffffff` |
| 8 | `00007e976f2fb1819d1ec7e0cc2869f39d397ba3` | row 8 — **`f39d397ba3`, chosen at staging**, see below |

Every one of the seven named covers resolved to exactly one row of the run; the 10-char tokens in
ROUND.md are the last ten characters of the filename stem, and all twenty are distinct in this set.

### Item 8 selection

`prototypes/p5-fieldfit/scorecard-run.ts` on the run file (default options) reports **7 covers
failing `I3.foreground-accent-not-separated`** — the only failing code in the set (I3: 13 pass, 7
fail; I4: 20 pass; I1 not-exercised ×20; I2 and I5 deferred ×20; 0 refusals).

Two of the seven are already rows 5 and 7 (`908479200b` d 0.04050, `ca2eff2a4a` d 0.02685), so five
were eligible. **Chosen: `f39d397ba3`, d = 0.03996** against the inherited bar 0.07444 — the
preferred candidate, and eligible. Rationale (also appended to `ROUND.md`): foreground `#f03e00` and
accent `#ed1500` are two saturated reds on a near-white flat field `#eae7e0`, which is the hardest
form of the question the row asks; a "the accent is invisible next to the foreground" note there has
nothing else to blame. Fallbacks if the artwork is vetoed: `d859a69094` (0.04562), `dd225466f4`
(0.02797), `16a8247378` (0.03909), `20cac4b472` (0.05389).

---

## 3. What is in each file

**`items.json`** — a bare JSON **array** of 8 calibration items. Each item carries exactly five
keys: `itemId`, `imagePath`, `variantId`, `fingerprint`, `palette`. No batch envelope: the installer
supplies `batchId`, `purpose` and `fundedBy`.

**`render-data.json`** — an **object keyed by `itemId`**, each value `{ roles, gradient, fieldCss }`:

- `roles` — four entries in fixed order `background, surface, foreground, accent`, each
  `{ role, hex, name, collapsed }`. `name` comes from `nameHexes()`
  (`src/review-server/color.ts:62`, the one `colornames-oklab` call site). `collapsed` is `false` for
  background and foreground by construction, and the palette's own `surfaceCollapsed` /
  `accentCollapsed` for the other two.
- `gradient` — the stops verbatim, or `null`.
- `fieldCss` — produced by the **pinned renderer**, `fieldCss()` at `src/review-server/gradient.ts:119`:
  the flat background hex when there is no gradient, otherwise
  `linear-gradient(135deg in oklab, <hex> 35%, <hex> 100%)` — the `[REVIEWED]` display mapping
  (`gradient.ts:23`, `:33`, `:113`; REVIEW_UI.md §3). The 35% is the 2-stop reserve, not a fitted
  position; the true fitted positions stay in `gradient`.

Neither file contains a prototype name, a mechanism label, `explF`, a diagnostic, or any round
metadata, in any served field. `variantId` and `fingerprint` do name the algorithm — deliberately:
they are TRUE names the server keeps and never serves (README.md §"Calibration mode":
*"the variant id and fingerprint are still kept server-side"*). A leak scan over the served surface
(all of `render-data.json` plus each item's `itemId` / `imagePath` / `palette`) is one of the checks
below.

---

## 4. Validation

Run from `research/v3` with a throwaway `check.ts` inside this directory, **now deleted**. All
checks passed:

```
PASS  items.json parses as an array of 8 — 8 items
PASS  8 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every hex matches ^#[0-9a-f]{6}$ — 36 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 8/8 resolve
PASS  no imagePath is absolute — push-time rewrite required
PASS  gradient ends are background → surface — 2 gradient items
PASS  gradient positions in [0,1] and strictly increasing
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  fieldCss is a ramp when there is a gradient, the flat background otherwise
PASS  no diagnostics / explF / mechanism labels in any served field
PASS  items.json items carry exactly the 5 push keys
PASS  render entries carry exactly roles/gradient/fieldCss

ALL CHECKS PASS
```

**Plus a dry-run through the real parser**, which is stronger than any of the above: the 8 items
(with `imagePath` rewritten to absolute) were fed to `parseCalibrationBatch` from
`src/review-server/batch.ts` directly.

```
parseCalibrationBatch OK: 8 items, purpose calibration
round-trip identical: true
```

The parser accepted every item and the palettes it produced are byte-identical to what is in
`items.json`. It does **not** exercise `pushCalibration`'s later stages (path allowlist, `sharp
.metadata()` on the file header, batch-log write), so the live push is still the real test.

---

## 5. Payload caveats an installer must act on

**A. `itemId` is the FULL 40-hex filename stem, not the 10-char token ROUND.md uses.** This is the
shape decision I am least sure of. The brief said "use the image sha-stem" while ROUND.md names
covers as `f39d397ba3` etc.; I read "resolve … to full image ids" as meaning the full stem is the id
and the ROUND.md token is the abbreviation. If the orchestrator wanted the 10-char token, it is a
one-line change in both files (`stem` → `stem.slice(-10)`) — both forms pass `ID_PATTERN`
(`batch.ts:32`) and both are unique across the 20-cover set. **Decide this before the push**, because
the item id is the reviewer's copy-paste feedback handle (ROUND_KIT.md) and changing it afterwards
orphans any note that quoted it.

**B. `imagePath` is repo-relative and MUST be rewritten to absolute before the push.**
`parseCalibrationBatch` requires `isAbsolute(imagePath)` — `batch.ts:219`
(`require_(isAbsolute(imagePath), "item.imagePath must be an absolute path")`). Prefix with
`/Users/Flo/GitHub/palette/`, i.e. the **main checkout**, not the worktree: the checked-in demo
fixture does exactly this and documents it (`src/review-server/fixtures/demo-calibration.json`,
`"imagePathsRelativeTo": "repo-root"` + *"the seeder rewrites them to absolute paths before
pushing"*). The server also requires the real path to sit under its `imageRoots` allowlist
(README.md §"Pushing a batch"); the main checkout root is the one that satisfies it, and all 8 files
were verified present there.

**C. `gradient.geometry` was dropped, deliberately.** The run emits
`gradient.geometry = { kind: "linear", angleDegrees: … }` (an **object**), but the server requires a
**string of ≤64 chars** if the field is present — `batch.ts:104`,
`asString(geometry, "gradient.geometry", 64)`. Passing the run's object would be rejected. Nothing is
lost for rendering: the pinned renderer fixes the angle at `135deg`
(`GRADIENT_DISPLAY_ANGLE_DEGREES`, `gradient.ts:33`), so the fitted angle never reaches the field.
If the geometry is wanted, it must be flattened to a string first, and that is a decision, not a fix.

**D. Where the calibration push shape was read from — cite these to double-check against the live
server.**
- `src/review-server/README.md`, "Calibration mode — absolute grading": the documented JSON body
  (`batchId`, `purpose`, `fundedBy`, `items[]` with `itemId`, `imagePath`, optional `collection` /
  `artworkId`, `variantId`, `fingerprint`, `palette`).
- `src/review-server/server.ts:2462` — `POST /api/calibration` → `service.pushCalibration(...)`
  (defined at `server.ts:677`).
- `src/review-server/batch.ts:205-242` — `parseCalibrationBatch`, the authority. Specifically:
  `:218-219` imagePath string + absolute; `:221` `itemId` through `asId` / `ID_PATTERN` (`:32`);
  `:226` `variantId`; `:227` `palette` → `parsePalette` (`:107`); `:228` `fingerprint` →
  `parseFingerprint` (`:129`), whose `:133` makes `dirty` **required and never defaulted**.
- `src/review-server/batch.ts:72-105` — `parseGradient`: 2–4 stops (`:37-38`), hex colours, positions
  in [0,1] canonicalised to 6 decimals (`:93`) then required strictly increasing (`:96`).
- `src/review-server/batch.ts:110-113` — both collapse booleans required; `:114-117` records that the
  server deliberately does **not** enforce contract invariants, which is why item 4's suspected
  false-positive rescue and item 8's tight fg/accent pair push cleanly.

**E. `purpose` defaults to `calibration`** (`batch.ts:207`) but `fundedBy` does not default to
anything meaningful — it is `[]` unless supplied (`batch.ts:212`). The round is funded by the P5
prototype's own evidence; the installer owns that list, and I did not invent one.

**F. The side-car shape is a MAP, not the `{batchId, items:[…]}` envelope the existing side-cars
use.** `review-ui/accent-real-1.data.json` wraps its render data as
`{ batchId, items: [{ questionKey, stimulus, side: { roles, gradient, fieldCss } }] }`. The brief
asked for a file "keyed by itemId with the kit render shape", so `render-data.json` maps
`itemId → { roles, gradient, fieldCss }` — the inner `side` object, hoisted, with the envelope
removed. **If the page that renders this round expects the accent-real envelope, this file needs
re-wrapping** — the per-item values are already the right shape, so it is a wrapper, not a rebuild.
Related: the live `/calibration` page (`review-ui/calibration.js`) is **pre-kit** (ROUND_KIT.md
migration list) and builds its side from the **server payload**, not from a side-car at all — so on
today's server this file may be advisory rather than load-bearing. Confirm which before pushing.

**G. `render-data.json` names are the CURRENT `colornames-oklab@0.6.0` output** (the version the run
header records). Names are presentation-only and never feed a judgement, but they were computed here
rather than by the server, so a server-side re-naming under a different package version would
disagree with this file. `nameHexes` is deliberately not `unique: true` (`color.ts:58-61`), which is
why item 4's foreground and accent both read "Sugared Almond" and item 7's foreground and accent
both read "Snow" — that identity is the finding, not a bug in the naming.

**H. Two items carry a gradient; six are flat.** Items 1 and 2 only. Both ramps are 2-stop with
`stops[0].color === background` and `stops[1].color === surface` at positions 0 and 1, so the
composer's 2-stop convention (README.md §"The palette composer") and the 35% display reserve both
apply unchanged.
