# Phase 3 — round 2 shared cover list

Eight covers. **Both** algorithm arms are judged on exactly these, in this order.
Paths are repository-relative (root: the `palette` checkout). `covers.txt` carries
the same eight paths, one per line, **returning covers first**, then the fresh draw.

Every dimension below was read from the image header with `sharp().metadata()`,
never from a filename and never from a coverage-set or warehouse record. All eight
files were confirmed present on disk.

## Composition

| # | role | id | path | WxH |
|---|------|----|------|-----|
| 1 | returning: A `unacceptable` / B `unacceptable` | `ab67616d0000b27300094a786a28459646be9b20` | `09/ab67616d0000b27300094a786a28459646be9b20` | 640x640 |
| 2 | returning: A `unacceptable` / B `unacceptable` | `ab67616d0000b273000131a334d00155369bb7b9` | `01/ab67616d0000b273000131a334d00155369bb7b9.jpg` | 640x640 |
| 3 | returning: A `weak` / B `weak` | `ddd8a0e7961edcf8e95b771ae0d9b8c5` | `music-artworks/d/d/d/ddd8a0e7961edcf8e95b771ae0d9b8c5.jpg` | 1280x1280 |
| 4 | fresh | `ab67616d00001e020012f9db24c5203787b17bb1` | `12/ab67616d00001e020012f9db24c5203787b17bb1` | 300x300 |
| 5 | fresh | `ab67616d00001e02000485aa752a4671880731ca` | `04/ab67616d00001e02000485aa752a4671880731ca` | 300x300 |
| 6 | fresh | `ab67616d0000b273000c550197e477cd44a5744f` | `0c/ab67616d0000b273000c550197e477cd44a5744f` | 640x640 |
| 7 | fresh | `ab67616d0000b273000fe1a62d8cc2643cb2cca1` | `0f/ab67616d0000b273000fe1a62d8cc2643cb2cca1` | 640x640 |
| 8 | fresh | `21bebfd319e1d7a27648b317a5c09139` | `music-artworks/2/1/b/21bebfd319e1d7a27648b317a5c09139.png` | 1500x1500 |

Arm A = `a-field-first-0.2.0`, Arm B = `b-tree-first-0.1.0-m1` — the same two arms
as round 1 (round 1's third arm is not in this round). Grades quoted above are the
round-1 grades from `../round-1/RESULTS.md` section 1.

## 1–3. Returning covers — why each one is back

Three of round 1's eight covers return. They serve two purposes at once: they
measure **drift/repeat** (does the same arm grade the same cover the same way when
the algorithm changes?) and they re-run the **probes that failed**.

### 1. `ab67616d0000b27300094a786a28459646be9b20` — round-1 cover 1

Round-1 role `probe:face-as-background`. Both arms graded it **unacceptable** —
the only cover in round 1 where both arms bottomed out and also the only one that
carried an `unacceptable` into round 1 from Phase 2. Arm A returned
bg `#8d8cc8` / sf `#8d8cc8` (collapsed) / fg `#00bcfa` / ac `#7f7ca7`, no gradient;
Arm B returned bg `#fce8cf` / sf `#fce8cf` (collapsed) / fg `#000000` / ac `#000400`,
no gradient. Arm B's `#fce8cf` is a pale beige in the same region of colour space as
the "Sushi Rice beige" the Phase 2 reviewer identified as **the face of the subject,
not a background** — hence "beige face-as-field". Both arms also still collapse the
surface into the background, which is the mechanically checkable half of the Phase 2
complaint and was verifiably **not** fixed by either arm.

Phase 2 complaint (batch `phase2-cal-026`, verdict `v-msp1who6-06e3dd29`), verbatim:

> Capri blue foreground is a very good pick, the rest is not good.
> There are many colors in that artwork, having the surface collapsed with the background misses some of the artwork's identity
> the Sushi Rice beige is the face of the subject on this artwork, not a background
> the Mecha Metal accent is not an accent in the artwork, it might be a subtle color somewhere but there are many stronger possible picks

### 2. `ab67616d0000b273000131a334d00155369bb7b9` — round-1 cover 7

Round-1 role `fresh` — it carried no probe and no prior complaint, and both arms
nonetheless graded it **unacceptable**. Arm A returned bg `#000000` / sf `#14100d` /
fg `#77543e` / ac `#77543e` (accent collapsed into foreground), no gradient; Arm B
returned bg `#c18c48` / sf `#c18c48` (collapsed) / fg `#010000` / ac `#546167`, no
gradient. The two arms disagree about the field entirely — near-black versus a warm
tan — yet both were rejected, so the cover is a live failure with no diagnosis on
record. **No reviewer text exists for it**: round 1 was graded with every
`comment: ""` (see `../round-1/RESULTS.md` section 0), so what went wrong here is
unknown and this round is the first chance to find out.

### 3. `ddd8a0e7961edcf8e95b771ae0d9b8c5` — round-1 cover 3

Round-1 role `probe:false-gradient`. Both arms graded it **weak**. Arm A returned
bg `#fdfad9` / sf `#f3bbd4` / fg `#494949` / ac `#734838`; Arm B returned
bg `#fefcd6` / sf `#f5bad6` / fg `#000204` / ac `#000000`. Both emitted
`gradient: null`, so the probed complaint itself — a gradient on a flat artwork —
**was fixed by both arms**, and the cover is nevertheless still `weak` in both. It
is the round's cleanest probe pass paired with its cleanest unexplained residual:
something other than the gradient is wrong and nothing on the record says what.
It is also the only cover above 640 px that round 1 carried.

Phase 2 complaint (batch `phase2-cal-017`, verdict `v-msocpkt1-ae64ab30`), verbatim:

> there is no gradient in this artwork, it's very clearly all flat

## 4–8. Fresh covers — how they were drawn

Source pool: `research/v3/data/coverage-set/coverage-set-1.json` (220 artworks).
Three strata, by the chosen rendition's path:

| stratum | pool | drawn |
|---|---|---|
| `ab67616d00001e02` (300 px sharded) | 55 | 2 |
| `ab67616d0000b273` (640 px sharded) | 111 | 2 |
| `music-artworks/` (the reviewer's own library) | 52 | 1 |

Draw method — the same method as round 1, with a new seed:

1. Within each stratum, sort the pool by `artworkId` ascending.
2. One `mulberry32` stream seeded with **`0x5a7e21`** (5930529 decimal), the exact
   generator used by `src/holdout/freeze-holdout.ts`. The Python re-implementation
   used here was verified bit-identical to the reference JS by reproducing round 1's
   published first-six draws for seed `0x9e3f31` exactly
   (0.1183929730, 0.9120276186, 0.2632335452, 0.9351220678, 0.5224350931,
   0.2488501489). First six draws for `0x5a7e21`: 0.5923460522, 0.6422792317,
   0.3976854985, 0.1768510023, 0.8656704151, 0.4309391670.
3. Fisher-Yates shuffle each stratum from that single shared stream, in the fixed
   order 300 px → 640 px → `music-artworks`, so the stream is consumed in a fixed
   order and a re-run reproduces the same five covers.
4. Walk each shuffled stratum in order and take the first artworks that pass every
   filter below — 2, 2 and 1 respectively.

Filters applied to each candidate, in order:

- **not a round-1 cover** — the artwork must not be any of round 1's eight, by full
  id or sharded stem.
- **not reviewed** — the artwork's 40-hex id (sharded) or 32-hex stem
  (`music-artworks`), its 24-hex sharded stem, and its file basename must not appear
  anywhere in `data/warehouse/warehouse.jsonl`. Matched by raw substring over the
  whole file and against every 32/40-hex token in it (757 distinct), so this covers
  verdicts, notes, endorsed samples, vetoes and oracle labels alike — every record
  type, not a whitelist of them.
- **not held out** — not in `data/holdout/holdout.json` (413 artworks), not in
  `header.nearDuplicateCensus.nonCandidateQuarantine.artworkIds` (12 artworks), and
  not a member of any held-out near-duplicate component.
- **no reviewed near-duplicate** — the artwork's component in
  `data/embeddings/near-dup-census.json` (union-find over the 6,386 crossing pairs at
  cosine >= 0.95 taken as the max over dinov2-vitl14, pe-core-l14 and dinov3-vitl16 —
  the same graph the holdout was frozen against) must contain no reviewed, held-out,
  or round-1 artwork.
- **file present on disk**, and its dimensions read from the header.

### The 1000 px request

`music-artworks` artworks at >= 1000 px long edge exist in `coverage-set-1` but are
nearly absent: **3 of 52** (`21bebfd319e1d7a27648b317a5c09139` 1500 px,
`2ce31cb74501ca05c417ba63b26d6a89` 1500 px, `ddd8a0e7961edcf8e95b771ae0d9b8c5`
1280 px — and that last one is round-1 cover 3, already returning as cover 3 here,
so it was ineligible). The music stratum was therefore shuffled in full and walked
taking the first passing artwork with long edge >= 1000. One was found on the first
such candidate, so **no fallback to the sub-1000 px pool was needed** and the
request is met at 1500x1500. Had the request failed, the fallback would have been
the first passing artwork at any size, and this section would say so.

### Rejections during the walk

Two candidates were drawn and rejected, both for already appearing in the warehouse:

- `ab67616d00001e020004ccf0ae91364130886c02` — drawn 2nd in the 300 px stratum.
- `ab67616d0000b27300062339a473711468f14643` — drawn 1st in the 640 px stratum.

No candidate was rejected by the near-duplicate or holdout filters.

### Verification of the five fresh covers

`grep -c` over `data/warehouse/warehouse.jsonl`, full id and stem separately — 0 hits each:

```
ab67616d00001e020012f9db24c5203787b17bb1   0      0012f9db24c5203787b17bb1   0
ab67616d00001e02000485aa752a4671880731ca   0      000485aa752a4671880731ca   0
ab67616d0000b273000c550197e477cd44a5744f   0      000c550197e477cd44a5744f   0
ab67616d0000b273000fe1a62d8cc2643cb2cca1   0      000fe1a62d8cc2643cb2cca1   0
21bebfd319e1d7a27648b317a5c09139           0
```

All five are `role: "core"` coverage-set members and are in the embedding universe.
The four sharded covers are **singletons** in the near-duplicate census
(`nearDupComponentArtworks: 1`) — no image in the corpus sits within cosine 0.95 of
them, so the near-duplicate filter passes vacuously rather than by comparison. The
`music-artworks` cover sits in a 3-artwork component with
`88be7b8e530b4618509bc2fa06c96958` and `e2a43f21b89666c613178997d35311d6`; both
siblings were checked and are neither reviewed nor held out, so that filter passes
by comparison, not vacuously.

## Caveats carried forward

1. **The near-duplicate census is a documented lower bound** on the real duplicate
   structure of the corpus (it undercounts by ~46% against the filename ground
   truth). A fresh cover could still be a near-copy of a reviewed one at a similarity
   below 0.95. Nothing cheaper was available to close that gap and the round does not
   depend on it being closed. This caveat is inherited verbatim from round 1.
2. **The holdout is `music-artworks`-only** — all 413 held-out artworks and all 12
   quarantined ones carry `music-artworks/` rendition paths. The holdout filter is
   therefore substantive for cover 8 and vacuous for covers 4-7. This is a property
   of how the holdout was frozen, not a gap in the filter, but it means the sharded
   covers are protected from prior exposure by the warehouse filter alone.
3. **Returning covers 1-3 are, by construction, exposed.** They were reviewed in
   Phase 2 and/or round 1 and appear in the warehouse. That is the point of the
   returning slice; do not read their grades as a fresh-cover signal, and do not
   let their presence in the warehouse be read as a filter failure.
