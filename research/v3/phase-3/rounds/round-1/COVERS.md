# Phase 3 — round 1 shared cover list

Eight covers. All three algorithm arms are judged on exactly these, in this order.
Paths are repository-relative (root: the `palette` checkout). `covers.txt` carries
the same eight paths, one per line, probes first.

Every dimension below was read from the image header with `sharp().metadata()`,
never from a filename or from a warehouse record.

## Composition

| # | role | id | path | WxH |
|---|------|----|------|-----|
| 1 | probe:face-as-background | `ab67616d0000b27300094a786a28459646be9b20` | `09/ab67616d0000b27300094a786a28459646be9b20` | 640x640 |
| 2 | probe:face-as-background | `ab67616d00001e02000f9ddb5dfe0c2590bed1b2` | `0f/ab67616d00001e02000f9ddb5dfe0c2590bed1b2` | 300x300 |
| 3 | probe:false-gradient | `ddd8a0e7961edcf8e95b771ae0d9b8c5` | `music-artworks/d/d/d/ddd8a0e7961edcf8e95b771ae0d9b8c5.jpg` | 1280x1280 |
| 4 | probe:missed-gradient | `ab67616d00001e0200001073a73e3a949021f65e` | `00/ab67616d00001e0200001073a73e3a949021f65e.jpg` | 300x300 |
| 5 | fresh | `ab67616d00001e02000bb7843b5e4572ce89fe0c` | `0b/ab67616d00001e02000bb7843b5e4572ce89fe0c` | 300x300 |
| 6 | fresh | `ab67616d00001e020010fe367a0d2ff504efb995` | `10/ab67616d00001e020010fe367a0d2ff504efb995` | 300x300 |
| 7 | fresh | `ab67616d0000b273000131a334d00155369bb7b9` | `01/ab67616d0000b273000131a334d00155369bb7b9.jpg` | 640x640 |
| 8 | fresh | `ab67616d0000b27300096a633744f98a17e8f81f` | `09/ab67616d0000b27300096a633744f98a17e8f81f` | 640x640 |

## Probes — the complaint each one carries

The warehouse stores keystroke-incremental drafts of a verdict comment; the text
quoted below is the final, complete comment of the cited record.

### 1. `ab67616d0000b27300094a786a28459646be9b20` — probe:face-as-background

Reviewed twice, in two different absolute batches, with the same complaint class.

Batch `phase2-cal-020` (verdict `v-msolwucx-5a4aedc5`, warehouse line 1555, absolute,
2026-08-11), exact note:

> Sushi Rice beige is a very weak pick, especially if it occupies 2 "slots" (background and surface) when this artwork contains much stronger colors, and this color is the face of the character and not actually the background
> Black accent could work if all other color picks are very chromatic, but right now this is not the case and so we're losing a lot of the artwork's identity

Batch `phase2-cal-026` (verdict `v-msp1who6-06e3dd29`, warehouse line 1674, absolute), exact note:

> Capri blue foreground is a very good pick, the rest is not good.
> There are many colors in that artwork, having the surface collapsed with the background misses some of the artwork's identity
> the Sushi Rice beige is the face of the subject on this artwork, not a background
> the Mecha Metal accent is not an accent in the artwork, it might be a subtle color somewhere but there are many stronger possible picks

The probed failure: a skin-tone region of a depicted face is picked as the
background (and here also collapsed into the surface).

### 2. `ab67616d00001e02000f9ddb5dfe0c2590bed1b2` — probe:face-as-background

Batch `phase2-pair-023` (verdict `v-msp1ib2f-de9a78d4`, warehouse line 1618,
pairwise, 2026-08-11; gradeA `unacceptable`, gradeB `weak`, preference `b`),
exact note:

> side A: no green-to-brown in this artwork
> side B: pink is the color of the face of a person in this picture, it doesn't really fit as a background
> both: the main text is white in this artwork, it might be good to have the foreground be white

The probed failure: the same class as cover 1, on a different subject — a pink
facial skin tone taken for a background. This record also carries a secondary
false-gradient complaint on side A, which is not what this cover is here to probe.

### 3. `ddd8a0e7961edcf8e95b771ae0d9b8c5` — probe:false-gradient

Batch `phase2-cal-017` (verdict `v-msocpkt1-ae64ab30`, warehouse line 1488,
absolute, 2026-08-11), exact note:

> there is no gradient in this artwork, it's very clearly all flat

The probed failure: a gradient is emitted where the artwork is flat. Note this is
the only non-sharded probe — a `music-artworks` cover at 1280x1280, so it also
exercises the arms at a resolution none of the other seven reach.

### 4. `ab67616d00001e0200001073a73e3a949021f65e` — probe:missed-gradient

Batch `phase2-pair-024` (verdict `v-msp1nbzo-85f5ee1a`, warehouse line 1643,
pairwise, 2026-08-11), exact note:

> should be a gradient
> side B: foreground is unreadable

The probed failure: the converse of cover 3 — the artwork *is* a gradient and the
palette returned a flat background. (The earlier draft of the same comment, line
1642, reads `foregound`; line 1643 is the completed text.)

## Fresh covers — how they were drawn

Source pool: `research/v3/data/coverage-set/coverage-set-1.json`, restricted to
artworks whose chosen rendition filename carries the sharded prefix under test —
55 artworks at `ab67616d00001e02` (300 px) and 111 at `ab67616d0000b273` (640 px).

Draw method, deterministic and reproducible:

1. Within each stratum, sort the pool by `artworkId` ascending.
2. One `mulberry32` stream seeded with **`0x9e3f31`** (2685233 decimal), the exact
   generator used by `src/holdout/freeze-holdout.ts` — verified bit-identical
   between the reference JS and the Python re-implementation used here
   (first six draws: 0.1183929730, 0.9120276186, 0.2632335452, 0.9351220678,
   0.5224350931, 0.2488501489).
3. Fisher-Yates shuffle each stratum from that single shared stream, 300 px
   stratum first, then 640 px — so the stream is consumed in a fixed order and a
   re-run reproduces the same eight covers.
4. Walk each shuffled stratum in order and take the first 2 artworks that pass
   every filter below.

Filters applied to each candidate, in order:

- **not reviewed** — the artwork's 40-hex id, its 24-hex sharded stem, and its
  file basename must not appear anywhere in `data/warehouse/warehouse.jsonl`
  (matched against every 32- and 40-hex token in the file, so this covers
  verdicts, notes, endorsed samples, vetoes and oracle labels alike).
- **not held out** — not in `data/holdout/holdout.json` (413 artworks), not in
  `header.nearDuplicateCensus.nonCandidateQuarantine` (12 artworks), and not a
  member of any held-out near-duplicate component.
- **no reviewed near-duplicate** — the artwork's component in
  `data/embeddings/near-dup-census.json` (union over dinov2-vitl14, pe-core-l14
  and dinov3-vitl16 at cosine >= 0.95, the same graph the holdout was frozen
  against) must contain no reviewed or held-out artwork.
- **file present on disk**, and its dimensions read from the header.

One candidate was rejected: `ab67616d0000b2730014c3a0501a86757a275520`, drawn
fourth in the 640 px stratum, already appears in the warehouse.

All four accepted covers are `role: "core"` coverage-set members, are in the
embedding universe, and are **singletons** in the near-duplicate census
(`nearDupComponentArtworks: 1`) — no image in the corpus sits within cosine 0.95
of them, so the near-duplicate filter passes vacuously rather than by comparison.

Confirmed absent from the warehouse by direct grep on the full 40-hex id and,
separately, on the 24-hex stem — 0 hits each:

```
ab67616d00001e02000bb7843b5e4572ce89fe0c   0
ab67616d00001e020010fe367a0d2ff504efb995   0
ab67616d0000b273000131a334d00155369bb7b9   0
ab67616d0000b27300096a633744f98a17e8f81f   0
```

## Caveat carried forward

The near-duplicate census is a documented **lower bound** on the real duplicate
structure of the corpus (it undercounts by ~46% against the filename ground
truth). A fresh cover could still be a near-copy of a reviewed one at a
similarity below 0.95. Nothing cheaper was available to close that gap and the
round does not depend on it being closed.
