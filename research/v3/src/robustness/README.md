# The robustness harness

**Status: built and measuring, as of 2026-08-04.** Status claims about this code cite this README.

One question: **does a candidate give the same palette to the same artwork twice?** Not "is the
palette good" — that is adjudication's question, and this instrument is deliberately blind to it.

v2-3 answered badly, and only found out at the end: **72.8%** agreement when the same pixels were
re-encoded, and a **±1 LSB dither — visually nothing — moved every one of 114 test palettes**. Those
were architectural facts about the system, discovered after it was built. This harness exists so v3
has the number from day one of Phase 1.

It is the instrument behind the reviewer's **TB-05** (robustness, tier HIGH, "blocks Phase 2 entry")
and **TB-06** (the reviewed-vs-unseen stability ratio), and it closes the measurement half of
`PHASE_0_LOOSE_ENDS.md` row **B30** — success criterion 2's third number, which was "tracked
nowhere".

## Running it

```sh
cd research/v3

# The whole thing: both samples, one report. ~20 s for 600 trials with a cheap candidate.
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate src/devloop/candidates/toy-median-offsets.ts

# Generate the perturbed images (gitignored; ~10 s, byte-identical every time)
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts --materialize

# Re-freeze a sample, or check the committed one still reproduces
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-pair-set.ts [--verify]
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts [--verify]

NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/robustness-*.test.ts
```

Useful flags on `check.ts`: `--limit n` (smoke test), `--skip-pairs` / `--skip-perturbations`,
`--bar-mode pooled|fixed|exact-hex` (diagnosis only — every headline number is `regional`),
`--emit-diff-set <path>` (writes the disagreeing images as a dev-loop set file), `--out <path>`,
`--frozen-labels`, `--concurrency n`.

## What it runs

| | what | size |
|---|---|---|
| `data/robustness/pair-set-1.json` | **rendition pairs** — the same artwork present twice in the corpus under two ids, from the near-duplicate census at cosine ≥ 0.95 | 200 pairs |
| `data/robustness/perturbation-set-1.json` | **perturbation covers** × 4 arms | 100 covers, 400 trials |

The four arms:

| arm | what it does | why |
|---|---|---|
| `jpeg-q92` | JPEG re-encode, quality 92, chroma 4:4:4, same size | **the v2-3 anchor** — the exact setting behind 72.8% |
| `jpeg-q85`, `jpeg-q75` | the same, lower quality | turns one point into a gradient: does agreement decay, or fall off a cliff? |
| `dither-lsb1` | ±1 LSB checkerboard on the blue channel, both sides lossless PNG | v2-3's smallest possible perturbation — it moved 114 of 114 |

Both perturbations are reproduced **from their documented definitions, written fresh**; the v2-3
code (`research/v2-3-experiments/resolution-pairs/`, commit `56506d0`) is not in the working tree and
was not copied. The definitions are reproduced so the numbers are comparable — v2-3's own warning
carries over: *"A different dither would give a different number; the qualitative result (0 of 114
unchanged) is what matters and would not survive being quoted as a precise sensitivity."*

## Ten decisions worth knowing

1. **"Same palette" is the contract's regional same-colour bar, per role.** `comparePalettes` uses
   `barFor` imported from `adjudication/match.ts`, not a lookalike — so "within the bar" cannot come
   to mean two things in two instruments. v2-3 used a mean-OKLab-distance ε of 0.04 instead, so its
   numbers and these compare in magnitude and direction, not decimal places.
2. **Holdout exclusion goes through `holdout.json`, never the census's `side` field.** The census's
   sides were computed against holdout 1.0.0 and are superseded: 23.05% of music-artworks endpoints
   carry a wrong label. The 413 held-out artworks plus the overlay's 12 quarantined ones are joined
   by id.
3. **The sample is of artwork pairs, not file pairs.** Two artworks can appear in the census as
   several file-level pairs (`.jpg` vs `.jpg`, `_147x147.avif` vs `_482x482.avif`). The first draft
   sampled file pairs and drew 200 rows holding only 165 distinct artwork pairs — double-counting,
   and over-weighting whichever artworks carry the most derived renditions, which is a property of
   the CDN. 3,374 file-level pairs collapse to **1,143** artwork pairs.
4. **Each endpoint is the artwork's canonical rendition** (`isBetterRendition`), the same choice the
   holdout freeze and coverage set make — so all three point at the same files.
5. **Both samples use the same album-artwork candidate filter** (`musicArtworkDropReason`: square,
   long edge > 150 px, no real transparency). Transparency is not tidiness: the contract *refuses*
   transparent input, so such a pair can only ever error. Two were in the first committed draw and
   showed up as permanent errored trials.
6. **The reviewed stratum is taken whole, not sampled.** Only **10** eligible artwork pairs touch an
   artwork the reviewer has graded, and none touch two. Taking all 10 is the most the corpus offers.
7. **Membership is frozen; the label is live.** The warehouse is append-only, so a reviewedness label
   frozen with the sample would go stale in the direction that flatters the ratio. `check.ts`
   recomputes it from today's warehouse and reports how many members were relabelled since the draw.
   `--frozen-labels` reproduces a historical report.
8. **Errors are their own bucket, never a denominator.** A trial the candidate could not complete is
   not evidence it agreed or disagreed with itself. Folding failures into "agreed" would let a crashy
   candidate buy a good number by failing more often.
9. **Every rate carries a Wilson interval.** The reviewed pair stratum is n = 10; without an interval
   a reader would compare it to n = 190 as though they were the same measurement.
10. **The stability ratio is reported per basis, never blended.** The perturbation set is 50/50
    reviewed/unseen by construction; the pair set is 10-vs-190 because that is all there is.
    Averaging them would launder an imbalanced estimate into the headline.

## Reading the output

**Agreement is not quality.** A candidate returning the same four colours for every image on earth
scores 100% here. Read it next to adjudication, never instead of it.

The baselines: re-encode **72.8%**, dither **0 of 114** unchanged, reviewed-vs-unseen ratio **1.61×**
(healthy ≈ 1.0).

### Demo run — the dev loop's toy candidate, 2026-08-04

`toy-median-offsets` is median colour plus fixed offsets and **is not a palette algorithm**; it
exists so the loop can be tested. Its numbers are here to show the harness runs end to end, and for
no other purpose. 600 trials, 20.5 s wall, 0 errors.

| | agreement |
|---|---|
| overall | 52.0% (312/600) |
| rendition pairs | 27.5% [21.8–34.1] |
| `jpeg-q92` | 69.0% [59.4–77.2] |
| `jpeg-q85` | 51.0% |
| `jpeg-q75` | 45.0% |
| `dither-lsb1` | 92.0% |
| reviewed vs unseen (perturbation) | **1.040×** — 65.5% vs 63.0% |
| reviewed vs unseen (pairs) | 0.352× — **underpowered**, n = 10 vs 190 |

Role instability: accent **41.0%**, foreground 16.5%, background 15.0%, surface 14.2%.

Three things in that table are worth reading even though the candidate is a toy. JPEG agreement
decays monotonically with quality, which is what an instrument that is measuring something real
should do. The `jpeg-q92` arm lands at 69.0% against v2-3's 72.8% on the identical setting. And the
accent role is much the most unstable, which is where v2-3's trouble lived too.

The toy survives the dither far better than v2-3 did (92% vs 0 of 114) — a median is robust to a
±1 LSB checkerboard almost by construction. That is a fact about medians, not a good sign for the
toy, and precisely the kind of thing this harness is for: the same candidate scores 27.5% on real
rendition pairs.

## Merge point with the dev loop

`src/devloop/` owns the candidate interface. This module re-exports it:

```ts
export type { CandidatePalette, CandidateModule } from "../devloop/types.ts"
```

A candidate is `(imagePath: string) => Promise<Palette>`, in a module exporting `candidateId` and
`paletteOf`. An earlier draft of `types.ts` here defined its own `{path, contentHash}` variant; it was
withdrawn rather than reconciled, because two spellings of the candidate contract is exactly the
drift the re-export prevents.

**This module imports `devloop/types.ts` and nothing else from the bundle.** The runner, worker pool
and content-addressed cache were in flux while this was written, and a robustness harness that cannot
run because a cache API moved is worse than one that recomputes. Reusing `devloop/cache.ts` — keyed
on `(input hash, computation id, code version)`, exactly right for this — is the obvious optimisation
once the bundle settles. Today the harness memoises palettes per run only, which already covers the
three JPEG arms sharing one baseline.

## Known limits

- **The reviewed pair stratum is n = 10 and cannot be grown by sampling harder** — the corpus holds
  no more. The perturbation set's 50/50 split is the reportable reviewed-vs-unseen number; the pair
  set's is reported, flagged `underpowered`, and should not be quoted alone.
- **`unseen|sharded|0.95-0.98` drew 1 of 6.** Proportional allocation gives tiny cells tiny counts.
- **Only the four contract roles are compared.** Collapse-flag and gradient-presence agreement are
  reported alongside the verdict but deliberately not folded into it, because the reviewer's
  definition of "same palette" is about colour.
- **A same-buffer determinism canary is not built here.** Per-run palette memoisation means the same
  file compared twice in one report cannot disagree with itself, so this harness cannot see candidate
  nondeterminism. That is the *repeated-extraction canary*, a separate instrument
  (`V3_PLAN.md` §6 row 4), and it is still unbuilt.
- **Relabel invariance** — the third perturbation gate, which moved 55.85% of v2-3's corpus — is also
  not built here.

## Files

| file | what |
|---|---|
| `types.ts` | the vocabulary, and the dev-loop re-export |
| `pair-set.ts` / `build-pair-set.ts` | draw and freeze the rendition-pair sample |
| `perturbation-set.ts` / `build-perturbation-set.ts` | draw and freeze the cover sample; materialise the cache |
| `perturb.ts` | the arms: JPEG re-encode and the ±1 LSB dither |
| `compare.ts` | palette vs palette, per role, on the contract's bar |
| `stats.ts` | Wilson intervals and rate construction |
| `check.ts` | the harness |

Tests: `tests/robustness-{compare,pair-set,perturb,harness}.test.ts` — **50 tests**. The seeded draws
are golden-compared over hermetic fixtures; the committed set files are checked for invariants only,
because their size depends on the corpus
(`d-2026-08-03-corpus-size-dependent-diagnostics-never-golden-compared`).
