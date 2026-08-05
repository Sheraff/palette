# P2 round 3b — two accent trade-offs, priced

**Kind:** pairwise, blinded. **Items:** 2 covers, two sides each, on the real mock player. **Answers
per item:** the four role grades for each side, then a preference, then an optional veto and a free
note. **Staged 2026-08-05** by the round-3 staging worker; the main orchestrator installs it. Files:
`build.ts`, `items.json`, `mapping.private.json`, `validate.ts`, `out/demo-20.jsonl`, this document.

> **This document and `mapping.private.json` are not servable.** They hold the decode: which side is
> the published palette, which ordering elected the other accent, and every measurement behind both.
> `validate.ts` scans `items.json`'s raw bytes and fails on any of it.

## Why these two items are on demo-20 when round 3a is not

`DECISIONS.md` D3 draws P2's rounds beyond demo-20 from round 3 on — *"demo-20 items only where a
specific prior verdict is being re-tested (e.g. D1's accent pairwise item)"*. Both items are that
exception, and D1 names the first one outright. Round 3a (`../round-3-quality/`) carries the fresh
covers; this batch carries the two decisions that were taken without a price and recorded as owing
one. Neither item grades the candidate. Each asks what one ordering key is worth.

**Both sides of both items are one substitution apart.** Background, surface, foreground and the
gradient are byte-identical across the sides; only the accent moves, and both accents are colours the
pipeline itself produced — entries of the parse's own `accentCandidates`, i.e. representatives of
retained nodes, and therefore exact triples of the artwork. `validate.ts` re-checks that against the
image bytes and fails the fixture if any published colour is not in the file.

## Item T1 — D1's exchange rate: identity against readability

**Cover** `00/ab67616d00001e0200000f92552b0935b967964d.jpg` (itemId `…35b967964d`), the cover D1
names, and the only one on which chroma-first and APCA-first elect different accents.

| side | accent | chroma from field | min \|raw APCA\| over the rendered field | the order that elects it |
|---|---|---|---|---|
| **v1** (published today) | **`#d25068`** coral | **0.169** | 51.3 | chroma from the field, descending — arm-b′ §2.6, D1's ruling |
| **v2** | **`#6a723f`** olive | 0.052 | **59.1** | minimum \|raw APCA\| over the rendered field, descending — W-F's rewrite |

Everything else, both sides: `background #dfe0d0 · surface #f3f3f3 · foreground #edbab9`, no
gradient. The two accents are **0.210** apart in OKLab, roughly nine same-colour bars — this item
cannot fail for want of a visible difference.

D1 ruled chroma-first **provisionally**: *"the exchange rate itself is round material, not a number
to invent… until that verdict, contrast-first accent ranking is not to be re-introduced."* The
ruling's only evidence is the reviewer's round-1 note on this cover naming *"the vivid red-orange"*
the alpha side missed — a note about identity, written while grading a different palette. This item
puts the same reviewer's identity preference against the readability cost of honouring it, on the
one cover where the cost is real.

## Item T2 — W-H's salience cut: is a calibration campaign worth funding?

**Cover** `00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg` (itemId `…f39d397ba3`).

| side | accent | D3 stability level | MSER growth | chroma from field | min \|raw APCA\| |
|---|---|---|---|---|---|
| **v1** (published today) | **`#ccb2a5`** | **1** — "incidental" | 0.438 | 0.204 | 28.6 |
| **v2** | **`#e7c0c1`** | **0** — "salient" | 0.017 | 0.195 | 39.1 |

Everything else, both sides: `background #f72c01 · surface #e70219 · foreground #efdfd2`, no
gradient. The two accents are **0.064** apart in OKLab against a same-colour bar of 0.016 — visible,
but this is the round's near case and the reviewer may say so.

`tos/integration-NOTES.md` §5 states the need in as many words: D3's salience level was applied to
the foreground and **deviated on the accent**, because every threshold-free split the integration
worker could construct demoted exactly the colour D1 names — and *"a round item that shows one cover
twice, with and without the level on the accent, is the cheapest way to price it."* This is that
item. What it prices is not a threshold; it is whether **anyone should spend a calibration campaign
finding one**.

Two facts to read the answer against, both recorded before the round:

- **12 of 20 demo-20 covers** would publish a different accent if the level ranked it. This is not a
  corner case; it is more than half the set.
- T2's cover is the **first by sorted repo-relative path** among those 12 — not the largest
  disagreement (which is 0.600, on `…269ead63cf`) and not the prettiest. The scan had no other
  filter, and `build.ts` asserts rather than selects on the two properties that make the item honest:
  that side v1 IS the palette the candidate publishes, and that the two accents are further apart
  than their own same-colour bar.
- The level-first accent sits **0.078** from the foreground against the contract's 0.0744
  foreground/accent separation — it clears the floor by 0.004. On D7's own principle that is a thin
  margin, and it is on the side the salience level would elect.

Round 1 graded this cover's tree-of-shapes palette **ACCEPTABLE** (*"a little flat; bg imposing"*),
so a drop on either side here is legible against a standing grade.

## What each outcome does

**Declared before the round is released.**

### T1

| outcome | what it changes |
|---|---|
| **`#d25068` (coral, v1) preferred** | D1's ruling stops being provisional. Chroma-first is what integration keeps; the APCA-first accent path stays deleted; the contract's own floors remain the only readability guard on the accent, and no exchange-rate constant is written |
| **`#6a723f` (olive, v2) preferred** | D1 is overturned by its own escape clause. Readability leads the accent order, W-F's rewrite is reinstated at integration, and `lanes/tests/accent-acceptance.test.ts` — which asserts the coral publishes — is rewritten to the new ruling rather than deleted |
| **both sides at ≤ 2, no preference** | the ordering is not the defect; the accent *pool* is. Work moves to candidate generation — D8's targeted floor check (are reviewer-named marks sitting under `MIN_NODE_AREA_FRACTION`?) — and neither order is written down as settled |
| **veto on either side** | the vetoed accent's ordering key is disqualified for this cover class outright, which is a stronger result than a preference and is recorded as such |

### T2

| outcome | what it changes |
|---|---|
| **`#ccb2a5` (level 1, v1) preferred** | the salience level must **not** rank the accent. integration-NOTES §5's deviation is confirmed by the judge, the owed MSER-growth calibration is **not funded**, and the level stays a reported quantity on the accent side |
| **`#e7c0c1` (level 0, v2) preferred** | stability does carry accent identity. A calibrated growth cut is worth a campaign; until it lands, the pool's lower-median split is the interim ordering, and D1 is re-opened because the same split demotes the coral |
| **"can't tell" / no preference / both graded the same** | the level is not perceptually load-bearing at this separation. No campaign either way; D4's demoted-**identity**-colour direction needs a larger-separation item (the 0.600 cover) before it is asked again |
| **either side's accent called absent from the artwork** | the finding is about the representative rule, not the ordering — both accents are exact triples of this image, so a "not in the artwork" note would price the bar-density representative rule instead |

## Blinding

`items.json` carries the blinded labels `p2-tree-round3b-v1` / `-v2` and blinded algorithm versions
`p2-tree-round3b-0.3.0-v1` / `-v2`. `v1` is the published palette and `v2` the counterfactual in
both items, but nothing in the servable file says so and the **side order alternates by item index
parity** — item 1 leads with v1, item 2 with v2 — so neither the label nor the position carries the
answer. `validate.ts` fails on any candidate id, pipeline name, integration label, ordering key
(`chroma`, `apca`), salience word (`salien|stability|growth|mser`) or field verdict in the raw bytes.
The true names and every measurement are in `mapping.private.json`.

> `mapping.private.json` is the decode key. It must never be copied into a batch fixture, a media
> directory, or anything the review server can reach.

## Provenance

- `out/demo-20.jsonl` — the merged candidate over `data/devloop/sets/demo-20.txt`, written by
  `../round-3-quality/probe.ts`, which returns the palette **and its own parse** from a single
  pipeline call. 20 rows, **0 failed**, `p2-tos-0.3.0-cycle-2-merged`, preprocessing
  `sharp-0.33.5/srgb/no-resample`.
- Both counterfactual accents are recomputed by `build.ts` from that file's `accentCandidates`
  arrays; no hex in `items.json` is typed by hand, and `build.ts` throws if the chroma-first election
  it reconstructs is not the accent the candidate actually published.
- `gitCommit` / `dirty` from HEAD at build time. HEAD moves under this worktree while the round is
  staged, so the determinism claim is *at a fixed HEAD* and `validate.ts` fails a rebuild that
  disagrees. Rebuild and re-validate immediately before shipping.

## Reproducing

```sh
# from ../round-3-quality, which owns the probe:
node --experimental-strip-types probe.ts \
  --set ../../../../data/devloop/sets/demo-20.txt --out ../round-3-tradeoffs/out/demo-20.jsonl
# then here:
node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
node --experimental-strip-types validate.ts  # exit 0 or it does not ship
```

`validate.ts` asserts: the item count the salience scan implies (2, or 1 if no demo-20 cover's accent
moved under the level); unique itemIds that are the slug of their own basename; two sides per item
with different variantIds; side order alternating by item index parity; every colour a lowercase
`#rrggbb`; gradient endpoint identity; collapse flags equal to hex equality; **every distinct
published role pair ≥ 0.02 OKLab (D7)**; **both accents clearing the contract's own
`FOREGROUND_ACCENT_SEPARATION_DISTANCE`** — a counterfactual the contract would have refused is not a
counterfactual; **exactly one role differing between the sides**; no blinding leak in the raw bytes;
**every published colour an exact triple of the artwork, decoded by this file's own `sharp` call**;
`mapping.private.json` agreeing with the artifact; and a deterministic rebuild, byte-compared twice.
