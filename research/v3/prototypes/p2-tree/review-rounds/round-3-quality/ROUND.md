# P2 round 3a — quality on fresh covers

**Kind:** calibration (absolute grading). **Items:** 6 covers, one palette each, on the real mock
player. **Answers per item:** the four role grades (1–4), then an optional veto and a free note. **No
comparison, and one candidate only** — there is nothing to prefer, which is the point: round 1 asked
which of two crude readings was better and got a preference between two mostly-unacceptable ones.
**Staged 2026-08-05** by the round-3 staging worker; the main orchestrator installs it. Files:
`pool.ts`, `probe.ts`, `build.ts`, `items.json`, `mapping.private.json`, `validate.ts`, this document.

> **This document and `mapping.private.json` are not servable.** Everything the fixture deliberately
> does not carry lives here: the candidate's name, its algorithm version, the field verdict per
> cover, the class labels and the margin audit. `validate.ts` scans `items.json`'s raw bytes and
> fails on any of it. Round 1's arrangement, unchanged — nothing was dropped, it was moved.

## The question

**Is this palette acceptable for this artwork — and where it is not, which role fails?**

Asked now because cycle 2 rebuilt the role stage against the failure class round 1 named (foreground
readability, 7 of 10 unacceptables) and every number defending that rebuild was measured on the same
twenty covers the rebuild was written against. `DECISIONS.md` D3 records that a fresh-cover
overfitting flag fired campaign-wide and binds P2 rounds from round 3 on to draw beyond demo-20.
These six covers have never been graded, never been tuned against, and never been in a falsifier run.

## The pool, and what was removed from it

| | covers |
|---|---|
| `data/coverage-set/coverage-set-1.json` | 220 |
| − in `data/devloop/sets/demo-20.txt` (every run, both prior rounds, the whole cycle-2 rebuild) | 0 overlap |
| − in `falsifier/out/endorsed-173.txt` (the reachability corpus) | 19 |
| **fresh pool** | **201** |
| ran (first 40 by sorted repo-relative path) | **40 — 40 ok, 0 failed** |

`pool.ts` writes the run set to `fresh-40.txt`; `probe.ts` runs the candidate over it and writes
`out/fresh-40.jsonl`, one row per cover carrying the published palette **and the parse it came out
of**, from a single pipeline call. That last detail is round 1's caveat repaired: round 1's class
labels came from a node dump written at a different code version than the run supplying its hexes,
and the two disagreed on 4 of 20 covers. Here a class label cannot disagree with the hex beside it.

## Items

A **class** is the published shape of the reading: `verdict | gradient? | surfaceCollapsed |
accentCollapsed`. The 40 fresh runs fall into 7 of them; 6 items cover 6.

| # | itemId (suffix) | class | published | margin (closest distinct pair) | published surface is an enclosure-shaped node |
|---|---|---|---|---|---|
| 1 | `…39b7dbc802fd` | unreadable, flat | `#e66f6b` / `#a47d7e` / `#fcfefd` / `#999fbf` | 0.109 surface/accent | **yes** |
| 2 | `…7960ad020c7a` | partitioned, flat | `#131919` / `#182023` / `#fcffff` / `#492ab3` | **0.030** background/surface | **yes** |
| 3 | `…c54a1d85db99` | unreadable, surface collapsed | `#58780b` / = / `#e5d7ce` / `#106afc` | 0.339 background/accent | no |
| 4 | `…0155369bb7b9` | laminar, **gradient** | `#9f3327` → `#000000` / `#b03f1d` / `#1e5c99` | 0.047 background/foreground | **yes** |
| 5 | `…f57bc46a3680` | flat, surface collapsed | `#b7f38f` / = / `#b9e0b1` / `#9ead9a` | 0.076 background/foreground | no |
| 6 | `…d5fd547eb7f3` | laminar, **gradient**, accent collapsed | `#646464` → `#fafafa` / `#515151` / = | 0.068 background/foreground | **yes** |

Roles are printed `background / surface / foreground / accent`; `=` marks a sanctioned collapse.

### The selection rule, verbatim

1. Classes ordered by **population descending**, ties by the class's first cover's sorted path.
2. The first **6** classes are taken. The dropped 7th is `flat | flat | surface collapsed | accent
   collapsed` (population 1) — the last of three tied singletons by its cover's path. Nothing unique
   is lost: a collapsed accent is still shown, by item 6.
3. Each class's representative is its **first cover by sorted repo-relative path**, so no cover is in
   the round for how it looks.
4. **D7's margin guard** at selection: a representative whose closest distinct published role pair
   sits under 0.02 in OKLab is skipped for the next cover of the same class and the swap recorded.

Class populations, for scale: `unreadable|flat` **29**, `partitioned|flat` 4, `unreadable|surface
collapsed` 2, `laminar|gradient` 2, and three singletons. The 40 fresh covers are overwhelmingly
`unreadable` — the field verdict's own escape hatch — which is itself a finding this round does not
grade and the next cycle should not ignore.

## D7's margin audit — the reason no swap was needed

`DECISIONS.md` D7: *"the reviewer grades margins; optimizers sit on floors"*, with the merged
demo-20 margin audit scheduled with this staging so items do not walk into known complaints. Run
over all **40** fresh covers, not just the six:

- **0 of 40** have a distinct published role pair under 0.02 OKLab. **0 swaps.**
- the closest pair anywhere in the 40 is **0.0218** (`background/surface`, a cover not selected);
  the closest in this round is item 2's **0.0304**, also `background/surface`.
- 28 of 40 have `background/surface` as their closest pair (6 more have `background/foreground`) —
  the twins-must-collapse walk holds the accent well clear, and it is the *field* pair that lives
  nearest the bar.

Item 2 is therefore the round's own margin probe: 0.0304 is roughly twice the largest same-colour
bar and is being shown deliberately rather than avoided. If the reviewer reads `#131919` and
`#182023` as one colour, D7's principle has a number attached to it for the first time.

## The enclosure / polaroid case — what is and is not established

`tos/integration-NOTES.md` §5 closes with *"unverified until round 3: the polaroid case
specifically… what is not verified is that the border of a depicted frame is the node the reviewer
would name"*. What this round can carry, measured on the 40 fresh covers:

- **40 of 40** have at least one enclosure-shaped field node (own area under half its shape's area);
- **27 of 40** publish a surface that IS one — on fresh covers, not the 13 of 20 measured on demo-20;
- **4 of the 6 items** (1, 2, 4, 6) publish such a surface.

**What is still not established, and is not established by staging:** whether any of those four
artworks *depicts* a frame. Deciding that would mean looking at the covers and choosing on what they
show, which would replace the sorted-path rule with the staging worker's taste. The structural case
is in front of the reviewer four times; if a surface note names a border, a mount or a frame, the
reviewer has supplied the missing half and §5's caveat closes.

## D4's missed-gradient direction — uncovered, and why

D4: *"both gradient error directions are live… the missed-gradient direction needs items in a later
round drawn from covers where tos says flat/partitioned and legacy says ramp."* That item cannot be
built here: **0 of the 40 fresh covers appear in `data/legacy/{endorsements,acceptable,known-bad}
.json`**, so no legacy ramp label exists for any of them. Freshness and legacy labels are mutually
exclusive by construction — the labelled corpus is the reviewed corpus.

The direction is therefore **uncovered by evidence and present only by structure**: item 5 publishes
flat with a collapsed surface on a field whose ground chain is collinear to 1.5e-16 at coverage 0.87,
and item 2 publishes flat at laminarity 0.025. If either draws a "this should be a ramp" note, the
direction has fired without a label, and that note is the trigger to build the labelled round from
the legacy-ramp side.

## What each outcome does

Grades are read on the standing 1–4 scale (1 unacceptable, 2 weak, 3 acceptable, 4 strong).
**Declared before the round is released.**

| outcome | what it changes |
|---|---|
| **≥ 4 of 6 items at 3+** | the cycle-2 role rebuild holds off the covers it was written against; D3's fresh-cover overfitting flag does not fire for P2; cycle 3 opens on D6's owed excursion machinery rather than on the role stage |
| **≥ 4 of 6 items at ≤ 2** | the demo-20 gains (19/20 covers yielding a text group, 16/20 foregrounds from one) are overfit; cycle 3 opens with a fresh-cover diagnosis and no new mechanism is started until it lands |
| **foreground is the failing role on ≥ 3 items** | round 1's dominant failure class survived its own repair; the text detector's *recall* (D5's missing title yellow), not its ranking, is the cycle-3 target |
| **accent is the failing role on ≥ 3 items** | the accent order is the defect, and batch B's T1 becomes a decision rather than a price — read the two together |
| **surface named on any of items 1, 2, 4, 6** | integration-NOTES §5's enclosure claim is priced on a real cover; a complaint demotes the enclosure branch of the surface order, a compliment closes the §5 caveat |
| **item 2 read as background ≈ surface** | D7 gets its number: the smallest publishable margin is above 0.030, and the twins-must-collapse walk moves from the bar to a margin |
| **any "this should be a ramp" note** | D4's missed-gradient direction has fired without a label; build the labelled counter-round from the legacy-ramp side next |
| **any veto** | the vetoed item's class gets a targeted fix before that class appears in another round, and the veto is recorded against the **class**, not the item (round-1 precedent) |

## Blinding

`items.json` carries the blinded label `p2-tree-cycle2-v1` and the blinded algorithm version
`p2-tree-cycle2-0.3.0-v1`. The true `p2-tos` / `p2-tos-0.3.0-cycle-2-merged` are in
`mapping.private.json` with the run file, so nothing is lost. `validate.ts` scans the raw bytes and
fails on any candidate id, family name, pipeline name, integration label, or field-verdict token.
There are no sides to shuffle in absolute grading; what is withheld is *whose* palette it is, which
is worth withholding from a reviewer who has already graded this prototype's ancestors twice.

## Provenance

- Run: `out/fresh-40.jsonl`, written by `probe.ts` over `fresh-40.txt` at `p2-tos-0.3.0-cycle-2-merged`,
  preprocessing `sharp-0.33.5/srgb/no-resample`. 40 rows, **0 failed**. Sequential, 0.3–8.2 s per
  cover (640×640 covers dominate the tail).
- `gitCommit` and `dirty` are read from HEAD at build time and recorded per item. `dirty: true` —
  `tos/out/` and `tos/lanes/out/` are untracked.
- **HEAD moves under this worktree while the round is staged** (the orchestrator appends to
  `DECISIONS.md`). The determinism claim is therefore *at a fixed HEAD*, and `validate.ts` fails a
  rebuild that disagrees rather than tolerating the drift: rebuild and re-validate immediately before
  shipping.

## Reproducing

```sh
node --experimental-strip-types pool.ts                              # rewrites fresh-40.txt
node --experimental-strip-types probe.ts --set fresh-40.txt --out out/fresh-40.jsonl
node --experimental-strip-types build.ts                             # rewrites items.json + mapping.private.json
node --experimental-strip-types validate.ts                          # exit 0 or it does not ship
```

`validate.ts` asserts: 6 items; unique itemIds that are the slug of their own basename; one palette
per item and no `sides`; every colour a lowercase `#rrggbb`; gradient endpoint identity (`stops[0]`
IS the background, the last stop IS the surface, positions strictly increasing, no gradient beside a
collapsed surface); collapse flags equal to hex equality; **every distinct published role pair ≥ 0.02
OKLab (D7)**; no blinding leak in the raw bytes; every image on disk, repo-relative, and absent from
demo-20 and endorsed-173 (**D3 freshness, enforced, not asserted in prose**); **every published
colour an exact triple of the artwork, decoded by this file's own `sharp` call** rather than taken on
the candidate's word; and a deterministic rebuild — it runs `build.ts` twice more and byte-compares
both results against the committed files, restoring them if they disagree.
