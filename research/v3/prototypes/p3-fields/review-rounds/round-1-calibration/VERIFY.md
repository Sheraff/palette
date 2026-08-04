# VERIFY — round 1, staging checklist

Run by this worker before handing the round over. Scripts are in this directory; every result below
is reproducible by running them.

```
node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/verify.ts
node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/verify-pinned-code.ts
```

Both exit 0. **All checks pass — 8 items, 0 failures, 0 swaps.**

---

## 1 — Every `imagePath` resolves in the MAIN checkout

`items.jsonl` carries repo-relative paths (`00/<file>.jpg`). The run executed inside
`.worktrees/p3-fields`, whose corpus shards are symlinks back to the main checkout, so the run rows'
absolute paths carry a `.worktrees/p3-fields/` prefix that means nothing to a consumer.
`build.ts::repoRelative` strips it back to the shard-relative form.

Checked against `/Users/Flo/GitHub/palette/<imagePath>` — the main checkout directly, not the
worktree's symlink.

## 2 — Every hex is an exact pixel of its image, at native resolution

The contract's central rule, and the one worth re-deriving rather than trusting: the palette is
verified against an **independent decode**, not against the pipeline's own. `verify.ts::pixelSet`
decodes with `sharp` at native resolution (no `resize`, so no resample), converts to sRGB, excludes
`alpha < 255` pixels, and builds the set of every distinct `#rrggbb` the image actually contains.
Every published hex — four roles plus every gradient stop — must be in that set.

| itemId | hexes checked | exact pixel |
| --- | --- | --- |
| `item-00` | 4 | yes |
| `item-02` | 6 (4 roles + 2 stops) | yes |
| `item-05` | 4 | yes |
| `item-07` | 4 | yes |
| `item-11` | 6 (4 roles + 2 stops) | yes |
| `item-12` | 4 | yes |
| `item-14` | 4 | yes |
| `item-19` | 4 | yes |

36 published colours, 36 found as literal pixels.

## 3 — Gradient endpoints are the field roles

First stop `==` background, last stop `==` surface, by exact hex equality (the reviewer's ruling of
2026-08-04, and `GradientSpec`'s stated invariant).

| itemId | first stop / background | last stop / surface |
| --- | --- | --- |
| `item-02` | `#ffffff` / `#ffffff` | `#dedede` / `#dedede` |
| `item-11` | `#01090c` / `#01090c` | `#1b2024` / `#1b2024` |

The other six items publish no gradient (`null`) — not applicable, not skipped.

## 4 — Collapse flags consistent

Checked **in both directions**, so a flag set without the equality fails as loudly as an equality
without the flag: `surfaceCollapsed` iff `surface === background`; `accentCollapsed` iff
`accent === foreground`. Exact hex equality, which is how invariant 3 defines a sanctioned collapse.

One flag is set across the eight: `item-12`, `surfaceCollapsed: true`, with surface and background
both `#ffffff`. Seven items have both flags false and no role-pair equal. No item asserts a collapse
it does not have, and no item has an equality it does not declare.

## 5 — The run is a statement about `cb760d7`, not about somebody's edits

Not on the original checklist; found while checking the fingerprint, and it decides whether
`gitCommit: cb760d7, dirty: false` is true.

The worktree's `prototypes/p3-fields/src/` was **dirty** at staging time — a parallel worker was
mid-edit in `constants.ts`, `field-roles.ts`, `fields.ts`, `foreground.ts`, `pipeline.ts`, plus a new
untracked `diagnostics.ts`. The run therefore executed working-tree code. Reading the diff suggests
the edits are additive instrumentation (extra returned intermediates; a dev-only `P3_EDGE_RANK`
override that returns the shipped `EDGE_RANK` when the variable is unset) — but "suggests" is not a
verification.

So it was run. `_pinned-cb760d7/` holds `git show cb760d7:…/src/*.ts` with one mechanical rewrite —
the `../../../src/` import prefix re-depthed to `../../../../../src/`, because the copy sits five
levels below `research/v3` instead of three, and nothing else. (`research/v3/src/` is itself clean at
`cb760d7`, so the re-pointed imports are the same modules the run used.) `verify-pinned-code.ts`
re-extracts all twenty covers through the pinned pipeline and compares roles, gradient and collapse.

> `all 20 rows reproduce under pinned cb760d7 — working-tree edits are output-neutral`

The fingerprint is honest as written. **Caveat for the orchestrator:** this holds for the edits as
they stood at staging time. If the parallel worker's changes land differently, re-run
`verify-pinned-code.ts` before pushing.

## 6 — The side-car renders the item it belongs to

A staging mistake that would silently show the reviewer the wrong colours, so it is checked rather
than assumed. Every `sidecar.data.json` entry's four role hexes equal its `items.jsonl` counterpart's.
8/8.

The side-car is built by `src/devloop/side.ts::sideFromPalette` — reused, not reimplemented. That
routes names through `review-server/color.ts` (the one `colornames-oklab` call site,
`CONVENTIONS.md`'s rule that human-facing colour is always named alongside the hex) and the field CSS
and display positions through `review-server/gradient.ts` (the pinned `[REVIEWED]` display mapping).
A dev viewer that composed its own ramp would show something no reviewer will ever see — up to 0.153
OKLab mid-segment if the interpolation space alone is wrong.

## 7 — Blinding

`sidecar.data.json` holds only `roles`, `gradient`, `fieldCss` per item. Grepped case-insensitively
for `p3`, `arm-d`, `rank`, `field`, `prototype`, `ink`, `luminance`, `regime`, `mechanism`, `0.2.0` —
**no matches**. No prototype name, no arm label, no mechanism text.

The true name (`variantId: "p3-fields-0.2.0"`) lives in `items.jsonl`, which is the orchestrator's
file and is never served — the same convention `fixtures/demo-calibration.json` states.

## 8 — Scorecard claim re-derived

Not taken from the report. `validatePalette` (from `src/contract/invariants.ts`) over all twenty run
rows: **19 pass, 1 fail**. The failure is index 01, with `I3.pair-not-distinct` ×2 and
`I4.below-contrast-floor` ×2 — the all-black monochrome, excluded from the round. All eight shipped
items are among the 19 passes.

This also settles the numbering: the orchestrator's `#01` (all-black, foreground = background) and
`#14` (near-neutral high contrast) are both the run's **zero-based** `index`, and the item ids follow
it.

---

## Files in this round

| file | what it is |
| --- | --- |
| `items.jsonl` | the 8 items — hexes copied verbatim from the run rows |
| `sidecar.data.json` | blinded render side-car, keyed by itemId |
| `ROUND.md` | the round's question, kind, class table and outcome branches |
| `VERIFY.md` | this file |
| `run-demo-20-0.2.0.jsonl` | the source run: candidate `p3-fields-0.2.0`, set `demo-20`, 20 ok / 0 failed |
| `build.ts` | builds `items.jsonl` + `sidecar.data.json` from the run |
| `verify.ts` | checks 1–4 and 6 |
| `verify-pinned-code.ts` | check 5 |
| `contact-sheet.mjs`, `contact-sheet.jpg` | the labelled sheet the by-eye classification was made from |
| `_pinned-cb760d7/` | `cb760d7`'s `src/`, import prefix re-depthed; input to check 5 |
