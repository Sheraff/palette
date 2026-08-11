# P3 — measurement baseline, 0.4.1

`candidateId` **p3-fields-0.4.1**, measured 2026-08-11 by W17. **Nothing here gates anything.** It
records what the standing instruments say about the candidate at commit `9504846`, the exact command
lines that produced each number, and how each number moved against **both absolute baselines** —
0.1.0 (`BASELINE.md`) and 0.3.0 (`BASELINE-0.3.0.md`), same worktree, same instrument, same sets.

Three readings plus one attribution:

1. **Robustness** — full 200 rendition pairs + 400 perturbation trials, no `--limit`.
2. **Adjudication** — the 197 evidence-bearing artworks. A dev aid; gates nothing; directional only.
3. **Foreground-shift attribution** — the two shifts W16b left unattributed against the
   0.4.0-eligibility control, run down to the first diverging pipeline stage.
4. Coverage-220 is re-run here because §3 needs it; its numbers are recorded in §4 for completeness.

---

## Candidate git state

| | |
|---|---|
| worktree | `/Users/Flo/GitHub/palette/.worktrees/p3-fields` |
| branch | `proto/p3-fields` |
| HEAD | `9504846deb58feda6d34ee514f29cb9d9686c1de` — *p3-fields 0.4.1: coherence eligibility default; margin-rank refuted and amended (W16 + W16b)* |
| **working tree** | **clean with respect to `src/`** — every measured byte is committed at `9504846`. W17 modified no file under `src/`. |
| candidate `codeVersion` | `715a729dfa69b7331b69b8dab687f3b97e4cb33b7e1e112ff2bd8bc6f918ee4f` (dev-loop content hash of the module graph; 0.3.0's was `1cc28c1e…`, 0.1.0's `aeb70ab0…`) |
| node | v25.8.1 · sharp 0.33.5 / sharp-modern 0.35.3 · apca-w3 0.1.9 · colorjs.io 0.5.2 · colornames-oklab 0.6.0 · typescript 5.6.2 |

`check.ts` still writes no git fingerprint of its own; the line above is recorded by hand.

**Environment.** The corpus symlinks W4 created for the 0.1.0 pass (`{00..15}`, `music-artworks`,
`images/*` → the main checkout) are still in place and are the reason every path resolves.

**The comparison is apples to apples.** All three runs read the same three inputs, byte for byte —
re-hashed by hand this pass and unchanged since 0.1.0:

| input | sha256 |
|---|---|
| `data/robustness/pair-set-1.json` | `a1a5a83b4274c027…` |
| `data/robustness/perturbation-set-1.json` | `31c58f039e9b12e2…` |
| `data/warehouse/warehouse.jsonl` | `dbe648cc382bd63c…` |

Reviewedness labels in all three: live warehouse, 113 reviewed artworks, 0 relabelled since the draw.

---

## 1. Robustness — the full run

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --out prototypes/p3-fields/measurements/robustness-p3-fields-0.4.1.json \
  --emit-diff-set prototypes/p3-fields/measurements/robustness-disagreeing-images-0.4.1.txt
```

600 trials, **no `--limit`**, default concurrency 4, bar mode `regional`, all four roles,
**0 errored trials**, 1758.5 s wall. Console: `robustness-console-0.4.1.txt`.

### Agreement, against both absolute baselines

| group | 0.1.0 | 0.3.0 | **0.4.1** | 95% Wilson (0.4.1) | n | Δ vs 0.1.0 | Δ vs 0.3.0 |
|---|---|---|---|---|---|---|---|
| **overall** | 18.2% | 16.8% | **16.0%** | 13.3–19.1 | 96/600 | **−2.2 pp** | **−0.8 pp** |
| rendition pairs | 14.5% | 9.0% | **9.0%** | 5.8–13.8 | 18/200 | **−5.5 pp** | **0.0 pp** |
| `jpeg-q92` | 28.0% | 34.0% | **28.0%** | 20.1–37.5 | 28/100 | 0.0 pp | **−6.0 pp** |
| `jpeg-q85` | 17.0% | 14.0% | **13.0%** | 7.8–21.0 | 13/100 | −4.0 pp | −1.0 pp |
| `jpeg-q75` | 17.0% | 13.0% | **18.0%** | 11.7–26.7 | 18/100 | +1.0 pp | **+5.0 pp** |
| `dither-lsb1` | 18.0% | 22.0% | **19.0%** | 12.5–27.8 | 19/100 | +1.0 pp | −3.0 pp |

**No arm's 95 % interval excludes either baseline's point estimate**, on any row, in either direction.
Every number in this table is a direction, not a demonstration; the pattern is the finding.

Three things are worth stating plainly, because the headline hides them.

- **Overall agreement is now the lowest of the three measured versions (16.0 %).** The three-version
  trend is monotone down: 18.2 → 16.8 → 16.0. The 0.4.1 step is 0.8 pp and well inside the interval,
  so it is not a demonstrated regression; it is also not an improvement, and the campaign has now spent
  two versions without moving this number in the wanted direction.
- **The rendition-pair arm did not move at all: 9.0 % at both 0.3.0 and 0.4.1, 18 agreements of 200 in
  both, and 182 disagreeing trials in both.** The arm closest to a real deployment question is exactly
  where 0.4.1 changed nothing. The 18 are not the *same* 18 — the reviewed/unseen split moved from
  0/10 + 18/190 to 1/10 + 17/190 — so this is a coincidence of totals, not a frozen arm.
- **0.3.0's q92 gain is given back in full** (34.0 → 28.0, exactly the 0.1.0 value) and **0.3.0's q75
  gain is given back with interest** (13.0 → 18.0, now above 0.1.0's 17.0). The two arms 0.3.0 moved
  furthest are the two 0.4.1 moves furthest back.

### Reviewed vs unseen (overfit ratio)

| basis | 0.1.0 | 0.3.0 | **0.4.1** | reviewed | unseen |
|---|---|---|---|---|---|
| **perturbation** (50/50 by construction — the reportable one) | 1.286× | 1.128× | **1.294×** | 22.0% [16.8–28.2] (44/200) | 17.0% [12.4–22.8] (34/200) |
| rendition-pair | 0.679× **UNDERPOWERED** | 0.000× **UNDERPOWERED** | **1.118× UNDERPOWERED** | 10.0% [1.8–40.4] (1/10) | 8.9% [5.7–13.9] (17/190) |

Healthy is ≈ 1.0; v2-3 measured 1.61×. **The perturbation ratio gave back 0.3.0's entire move toward
1.0 and is now marginally worse than 0.1.0's** (1.286 → 1.128 → 1.294). The mechanism is visible in
the cells: the *reviewed* rate is frozen at 22.0 % (44/200) across 0.3.0 and 0.4.1, and the whole
change is the **unseen** rate falling 19.5 % → 17.0 %. The intervals overlap heavily and this is not
evidence of overfitting on its own — but the direction is the wrong one and the reviewed cell not
moving at all while the unseen cell moves is the shape that would show up if it were.

The rendition-pair basis still carries no information: its reviewed cell is **10 trials**, now with a
single agreement. `1.118×` is one trial's worth of arithmetic and must not be read as a number
(instrument note 8).

### Role instability (share of the 600 comparisons where the role moved)

| role | 0.1.0 | 0.3.0 | **0.4.1** | Δ vs 0.1.0 | Δ vs 0.3.0 |
|---|---|---|---|---|---|
| background | 31.2% | 24.2% | **23.5% (141/600)** | −7.7 pp | −0.7 pp |
| surface | 51.0% | 45.0% | **45.2% (271/600)** | −5.8 pp | +0.2 pp |
| **foreground** | 54.8% | 54.2% | **58.5% (351/600)** | **+3.7 pp** | **+4.3 pp** |
| accent | 63.5% | 69.5% | **68.3% (410/600)** | +4.8 pp | −1.2 pp |

**The accent watch is answered, and it hands the problem to the foreground.** Accent was the role the
brief flagged (69.5 % at 0.3.0); it improved by 1.2 pp, which is inside the noise and does not clear
it — accent is still the worst-moving role in the system and still the worst-moving role in 227 of the
504 disagreements. Meanwhile **foreground rose 4.3 pp, the largest single-role move in the table, and
by a wide margin the largest move in either direction.** Background and surface are unchanged from
0.3.0.

The foreground deterioration is corroborated by two independent cuts of the same trials:

| | 0.3.0 | 0.4.1 |
|---|---|---|
| trials where **foreground alone** disagrees | 36 | **48** |
| trials where foreground is the **worst-moving** role | 124 | **157** |
| trials where accent alone disagrees | 85 | **75** |
| trials where accent is the worst-moving role | 250 | **227** |

Both accent cuts fall and both foreground cuts rise. Given §3 — where the one thing that moved a
published foreground was an *accent* re-election carried through a standing role swap — the natural
hypothesis is that 0.4.1 moved instability from the accent search into the foreground slot through the
swap rather than removing it. **This pass did not test that**, and it should be the next falsifier.

### Whole-palette flips

| roles that moved | 0.1.0 | 0.3.0 | **0.4.1** |
|---|---|---|---|
| 1 | 126 | 142 | **142** |
| 2 | 132 | 144 | **143** |
| 3 | 119 | 125 | **131** |
| **4 (all-four flip)** | **114** | **88** | **88** |
| total disagreeing trials | 491 | 499 | **504** |

**All-four flips held exactly at 88.** 0.3.0's clearest win — the 23 % cut in whole-palette inversions
— is fully preserved at 0.4.1 and neither extended nor eroded. The five extra disagreeing trials all
land in the three-role bucket (125 → 131).

All-four flips by arm: rendition-pair 54, q75 11, dither 11, q85 8, q92 4
(0.3.0: rendition-pair 54, dither 13, q75 10, q85 8, q92 3; 0.1.0 total 114).
**The rendition-pair contribution is identical at 54** — as is that arm's whole disagreement count
(182). Whatever 0.4.1 changed, it did not reach the rendition-pair arm.

Disagreeing trials by arm: rendition-pair 182 (0.3.0: 182), q92 72 (66), q85 87 (86), q75 82 (87),
dither 81 (78).

### The disagreements got bigger

| | 0.3.0 | 0.4.1 |
|---|---|---|
| disagreements under 2× the bar | 70 of 499 | **63 of 504** |
| median worst-role movement (OKLab) | 0.165 | **0.223** |

0.3.0's trade was "one more trial disagrees, but the disagreements are *smaller*". **At 0.4.1 that
trade reverses**: five more trials disagree, fewer of them are near-miss, and the median worst-role
movement rose 35 %. This is the single largest proportional move anywhere in §1 and it is not visible
in any agreement percentage, because agreement is a threshold count and this is a magnitude.

### Timing

| | 0.1.0 | 0.3.0 | 0.4.1 |
|---|---|---|---|
| wall | 1651.8 s (`--concurrency 8`) | 1745.0 s (concurrency 4) | **1758.5 s (concurrency 4)** |
| `timing.candidateMillis` | 10 755 s | 5 699 s | **5 855 s** |

**Do not read the 0.4.1 wall figure against the other two** — a second full robustness run was
contending for CPU throughout (instrument note 3). `candidateMillis` is not CPU time (note 5).

---

## 2. Adjudication — dev aid, gates nothing

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/adjudicated-197.txt \
  --workers 4 \
  --out prototypes/p3-fields/measurements/run-adjudicated-197-0.4.1.jsonl
# 197 ok · 0 failed · 0 cache hits · 197 computed · 80 510 ms

node prototypes/p3-fields/measurements/to-adjudication.mjs \
  prototypes/p3-fields/measurements/run-adjudicated-197-0.4.1.jsonl \
  prototypes/p3-fields/measurements/adjudication-input-197-0.4.1.jsonl
# rows=197 ok=197 errored=0

NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197-0.4.1.jsonl
NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197-0.4.1.jsonl \
  --format json --out prototypes/p3-fields/measurements/adjudication-197-0.4.1.json
```

The set is unchanged: the same 197 artworks carrying standing v2-3 reviewer evidence (554 entries over
`endorsements.json` 351 / `known-bad.json` 37 / `acceptable.json` 166). 197 palettes parsed, 197
carried the full contract, 0 lines refused. Bar `regional`, all four roles, era v2-3 (the v3 warehouse
still holds 0 entries).

| | 0.1.0 | 0.3.0 | **0.4.1** |
|---|---|---|---|
| **W** — endorsement matches | **3** candidates · 4 entries · 3 artworks | **1** · 1 · 1 | **1** candidate · 1 entry · 1 artwork |
| **L** — known-bad matches | **0** | **0** | **0** |
| baseline — `acceptable` matches | 0 | 0 | **0** |
| **NS** — differed | 194 | 196 | **196** |
| conflicts touched | 0 | 0 | **0** |
| reachability | not assessed (419 comparisons) | not assessed (418) | **not assessed (418)** |

> ### CAVEAT — read this before reading the table above
>
> **The legacy warehouse contradicts itself at configuration level: 27 of 128 paired comparisons are
> exact ties filed under different tiers. These counts are directional, never a score.**

### The headline is unchanged; the artwork underneath it is not

0.3.0 and 0.4.1 both read **1W / 0L / 196NS**, and the identity of the win is **different**. Joining
the two `--format json` reports on `artworkSha256` gives exactly two outcome transitions and no others:

| artwork | 0.3.0 | 0.4.1 |
|---|---|---|
| `images/franz.jpg` (endorsement `2c2861c94663ca9b`, basis all-four-roles) | differs | **endorsement-match** |
| `images/slipknot.jpg` (endorsement `5cd3c20c508accc0`, basis all-four-roles) | endorsement-match | **differs** |

195 of the 197 held their outcome. **Both transitions are pure accent moves on a previously collapsed
accent**, and nothing else in either palette changed:

| artwork | background | surface | foreground | accent |
|---|---|---|---|---|
| `franz.jpg` | `#010511` (unmoved) | `#010511` (unmoved) | `#f9ebc4` (unmoved) | `#f9ebc4` → **`#db9a26`** |
| `slipknot.jpg` | `#000000` (unmoved) | `#000000` (unmoved) | `#ffffff` (unmoved) | `#ffffff` → **`#6d6c71`** |

At 0.3.0 both artworks published `accent == foreground` (a collapsed accent). At 0.4.1 the accent
redesign de-collapses both; on `franz.jpg` the resulting `#db9a26` happens to be what the reviewer
endorsed, and on `slipknot.jpg` the resulting `#6d6c71` happens not to be. **Read as one fact rather
than two: the whole adjudication swing between 0.3.0 and 0.4.1 is the accent de-collapse, and it went
one way on one artwork and the other way on another.** With 27 of 128 paired comparisons in the
evidence being exact ties filed under different tiers, a ±1 move on a 197-artwork set is inside the
noise the caveat describes. It is not a result.

For scale: **188 of the 197 published palettes differ between 0.3.0 and 0.4.1**, and that produced a
net change of zero in W and zero in L. That ratio is the argument for the caveat, not against it.

### Contract validity on the same 197 artworks

`scorePalette` over all three run files (same set, same contract, same code path):

| | 0.1.0 | 0.3.0 | **0.4.1** |
|---|---|---|---|
| PASS | 178 / 197 | 184 / 197 | **187 / 197** |
| FAIL | 19 | 13 | **10** |

---

## 3. The two foreground shifts — attributed

**The hypothesis in the brief is refuted.** The eligibility flip did not change foreground
verification stepping; the `foreground` diagnostics stage is byte-identical on both covers. The first
diverging stage is `accent`, and the published *foreground* moved only because the role-swap
comparator had already fired and was publishing the accent search's colour in the foreground slot.

### Locating the covers

Diffing the 0.4.0-eligibility control (`substrate/run-coverage-220-eligibility.jsonl`, W13) against
0.4.1's coverage-220 gives **5 differing rows of 220** — 3 accent-only and the 2 foreground shifts:

| artwork | role | control → 0.4.1 |
|---|---|---|
| `02/ab67616d00001e020002fc520894d5fd547eb7f3.jpg` | **foreground** | `#b5b5b5` → `#b3b3b3` |
| `08/ab67616d0000b2730008b711701877c2d951961a` | **foreground** | `#ffc21c` → `#fcc522` |
| `music-artworks/d/7/a/d7a1779637a8e947b7cdca2f8a0a9aef.jpeg` | accent | `#7896ae` → `#7091a4` |
| `02/ab67616d0000b2730002a8db1fe7e7a4337515cd.jpg` | accent | `#253131` → `#2c3838` |
| `12/ab67616d0000b2730012abfbdf7f0cf35440f9c6` | accent | `#ab7105` → `#974c77` |

### The control, and that it is the right control

The 0.4.0-eligibility side was re-materialised as `fgshift-0.4.1/_pinned-de7afc2/` — `git show
de7afc2:…/src/*.ts` with the shared-contract imports re-depthed by two levels and nothing else
touched, the same pinning pattern `substrate/_pinned-fb703d2/` and `attribution/_pinned-1ec99b6/`
already use. Run with `P3_SUBSTRATE=eligibility`, it **reproduces W13's published palettes exactly on
both covers**, so the diagnostics it emits are the control's diagnostics and not an approximation of
them.

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3
M=prototypes/p3-fields/measurements

# 0.4.1 side
P3_DIAG=$PWD/data/devloop/p3-diag-fgshift-0.4.1-new \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set $M/fgshift-0.4.1/set-2-0.4.1.txt --workers 1 --no-cache \
  --out $M/fgshift-0.4.1/run-2-new-0.4.1.jsonl

# 0.4.0-eligibility control side
P3_SUBSTRATE=eligibility P3_DIAG=$PWD/data/devloop/p3-diag-fgshift-0.4.1-ctl \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate $M/fgshift-0.4.1/_pinned-de7afc2/candidate.ts \
  --set $M/fgshift-0.4.1/set-2-0.4.1.txt --workers 1 --no-cache \
  --out $M/fgshift-0.4.1/run-2-ctl-0.4.1.jsonl
```

| | W13 `eligibility` | my control | 0.4.1 coverage-220 | my 0.4.1 |
|---|---|---|---|---|
| `…0002fc52…` | `#ffffff #555555 #b5b5b5 #eeeeee` | **identical** | `#ffffff #555555 #b3b3b3 #eeeeee` | **identical** |
| `…0008b711…` | `#c80180 #c80180 #ffc21c #08090b` | **identical** | `#c80180 #c80180 #fcc522 #08090b` | **identical** |

### The first diverging stage

Walking the two diagnostics chains stage by stage, in pipeline order, the picture is the same on both
covers:

| stage | `…0002fc52…` | `…0008b711…` |
|---|---|---|
| `decode`, `fieldSet`, `ends`, `prevalence`, `gradient`, `ink`, `accentOrdering` | identical | identical |
| **`foreground`** | **identical** | **identical** |
| **`accent`** | **first divergence** | **first divergence** |
| `roleSwap` | differs (downstream) | differs (downstream) |
| `validation` | identical | identical |
| `published` | `foreground` only | `foreground` only |

`edges` also differs, but only in the `substrate` flag echo — see instrument note 1; it is a reporting
artefact and carries no behaviour.

**The `foreground` stage is identical in every field**, including the ones the hypothesis would have
had to move: both covers take `regime: "ink"` at `cursor: 0`, `stepWithinRegime: 0`, `verified: true`,
on the same pixel, with the same `supportAtChoice` — **0.2176 and 0.0212, i.e. 217× and 21× the
retired 0.1 % raw wall**. Neither foreground was ever within two orders of magnitude of being decided
by the predicate that changed, and no foreground rank was stepped on either side. **Retiring the
raw-share route changed nothing on these two artworks.**

The divergence is `accent.refinement`, and it is the new `ACCENT_LUMP_DEPARTURE_TIE_BAND = 0.1`:

| | `…0002fc52…` ctl → 0.4.1 | `…0008b711…` ctl → 0.4.1 |
|---|---|---|
| `gapRatio` | 0.29303 (unmoved) | 0.33879 (unmoved) |
| `gapRatio − LUMP_GAP_RATIO` | 0.0430 | 0.0888 |
| `lumpTieBandFired` | — → **true** | — → **true** |
| `lumpMasses` | `[512, 2818]` → `[2818, 512]` | `[9112, 474]` → `[474, 9112]` |
| `chosen` | `higher-departure-lump` → **`higher-chroma-lump-convention`** | `higher-departure-lump` → **`higher-chroma-lump-convention`** |
| accent pixel | 5413 → 6916 | 135452 → 149472 |
| accent hex | `#b5b5b5` → `#b3b3b3` | `#ffc21c` → `#fcc522` |

Both gaps clear `LUMP_GAP_RATIO = 0.25` by less than the 0.1 tie band, so the band fires, the
higher-chroma convention elects the *other* lump (the mass pair reverses order), the cascade lands on a
different pixel, and the accent colour moves. That is the whole cause.

### Why an accent change published as a foreground change

`roleSwap.applied` is **true on both covers, in the control and at 0.4.1 alike** — the swap is not what
changed. When it fires, the accent search's colour is published as `foreground` and the foreground
search's colour as `accent`. So `roleSwap.publishedForegroundHex` tracks the accent hex exactly
(`#ffc21c` → `#fcc522`, `#b5b5b5` → `#b3b3b3`), `publishedAccentHex` is unmoved (`#08090b`,
`#eeeeee`), and `published.foreground` is the only published field that moves on either artwork. Both
shifts are **one cause, two hops**: `ACCENT_LUMP_DEPARTURE_TIE_BAND` re-elects the accent lump, and a
standing role swap carries that change into the foreground slot. Neither shift touches `verify.ts`,
the eligibility retirement, or foreground stepping.

Corpus footprint of the cause, from the 220 0.4.1 diagnostics records: `lumpTieBandFired` on **31 of
220** accents, `chosen: higher-chroma-lump-convention` on the same 31. Only 2 of those 31 surface as a
published foreground shift, because only the subset that both re-elects a lump *and* sits under a fired
role swap can.

---

## 4. Coverage-220 (run for §3; recorded for completeness)

```sh
mkdir -p data/devloop/p3-diag-coverage-0.4.1
P3_DIAG=$PWD/data/devloop/p3-diag-coverage-0.4.1 \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/coverage-set-1-220.txt \
  --workers 4 --no-cache \
  --out prototypes/p3-fields/measurements/run-coverage-220-0.4.1.jsonl
# 220 ok · 0 failed · 0 cache hits · 220 computed · 129 507 ms
# runId p3-fields-0.4.1-coverage-set-1-220-20260811T064438718Z
```

220 diagnostics records written. Same 220-path set file as 0.3.0.

| | 0.3.0 | 0.4.0-control (no substrate) | 0.4.0-eligibility | **0.4.1** |
|---|---|---|---|---|
| contract PASS | 198 / 220 | 200 / 220 | 200 / 220 | **200 / 220** |
| `I4.ramp-below-contrast-floor` | 35 | 22 | 26 | **26** |
| `I4.below-contrast-floor` | 6 | 6 | 6 | **6** |
| `I3.pair-not-distinct` | 4 | 4 | 4 | **4** |
| gradient published | 86 | 86 | 86 | **86** |
| surface collapsed | 24 | 24 | 24 | **24** |
| accent collapsed | 19 | **47** | 29 | **29** |

W16b's commit-message claims reproduce: PASS 200, accent-collapse 29 (was 47 at the 0.4.0 control).
**One claim does not reproduce as stated:** W16b's `swap 32.3%`. `roleSwap.applied` is true on
**62 of 220 = 28.2%** of the set. 32.3% is recoverable only on a reduced denominator
(62 / 192 = 32.3%, or 62 / (220 − 29 accent-collapsed) = 32.5%). The rate over the whole set is 28.2%
(0.3.0 measured 36.4% over the same set). Reported as a denominator ambiguity, not a defect.

Other chain splits at 0.4.1: foreground regime **ink 114 (51.8%) · luminance 106 (48.2%) · escape 0**;
accent lump `chosen` = `whole-band` 91 · `higher-departure-lump` 67 · `higher-chroma-lump-convention`
**31** · `lower-departure-lump` 2.

---

## Instrument notes (reported, not patched)

**New at this pass.**

1. **The `P3_DIAG` chain tells a 0.4.1 reader that coherence eligibility is OFF.** `pipeline.ts:588`
   emits `edges.substrate = substrateFlags()`, and `substrateFlags()` reads `P3_SUBSTRATE`, which is
   unset in every normal 0.4.1 run. So every 0.4.1 diagnostics record carries
   `{"field":false,"eligibility":false,"prevalence":false}` **while the coherence eligibility rule is
   unconditional in `verify.ts`**. `constants.ts` documents the accept-and-ignore decision for the
   *input* flag deliberately; the *output* field was not updated to match, and it now reads as a
   statement about behaviour that is false. This is exactly the "reads as doing nothing" shape the
   `substrateFlags()` docstring says must never be hidden. Anyone diffing a 0.4.1 chain against a W13
   control chain sees this field flip and must know it is an echo, not a behaviour.
2. **Same class, same chain:** `foreground.sourcePopulationFloor: 0.001` is still emitted
   (`pipeline.ts:957`) though `SOURCE_POPULATION_FLOOR` decides nothing at 0.4.1. `verify.ts` keeps
   `rawSharePasses` as a reported-only field on purpose and says so; the foreground record does not
   carry the same disclaimer, so the number reads as a live threshold.
3. **Wall time this pass is not comparable to 0.3.0's.** A second full robustness run
   (`prototypes/p2-tree/tos/candidate.ts`, PID 60065, ~102 % CPU) was in flight on the same machine for
   most of this run, and the adjudication and coverage dev-loops overlapped its first minutes. Trial
   *counts* are unaffected — the harness is deterministic and reported 0 errored trials — but no wall
   or `candidateMillis` figure here should be read against 0.3.0's 1745.0 s.
4. **`git show <sha>:<dir>` writes a tree listing, not a directory.** Pinning `de7afc2`'s `src/` with a
   `basename` loop produced a file literally containing `Git tree de7afc2` where the `tools/`
   subdirectory was. Harmless once deleted; recorded because the `_pinned-*` pattern is used by three
   passes now and the next one will hit it.

**Carried forward from `BASELINE-0.3.0.md`, all still true at 0.4.1.**

5. `check.ts --concurrency` buys almost nothing for a CPU-bound candidate, and `timing.candidateMillis`
   is wall time summed across overlapping computations, not CPU time. Wall time is the comparable
   figure — subject to note 3.
6. `--emit-diff-set` mixes `data/robustness/cache/<arm>/…` artefacts into the set file, so
   `robustness-disagreeing-images-0.4.1.txt` is not usable as a dev-loop set of original artworks.
7. `check(...)` accepts `repoRoot` but `main()` exposes no `--repo-root` flag — hence the root symlinks.
8. The stability ratio is still *printed as a number* on an underpowered cell; `MIN_COMPARISONS_FOR_RATIO`
   is 30 and the guard sets a flag rather than suppressing the quotient.
9. The adjudication **text** report lists only signal-carrying candidates, so comparing two runs' lost
   wins requires `--format json` and a join. This pass joined on `artworkSha256`.

**Honoured from `INSTRUMENT_NOTES.md`.** No `--limit` was used anywhere in this pass, so every
percentage in §1 is an absolute. The candidate terminates on all 220 coverage artworks and all 600
trials, so the no-timeout deadlock risk did not arise; liveness was watched by process CPU rather than
by output mtime, because `check.ts` writes its console only at the end.

---

## Files written by this pass

Nothing in `measurements/` was overwritten; every artefact below is new.

| file | what |
|---|---|
| `robustness-p3-fields-0.4.1.json` | the full robustness report |
| `robustness-console-0.4.1.txt` | the harness's own formatted summary |
| `robustness-disagreeing-images-0.4.1.txt` | `--emit-diff-set` output (see note 6) |
| `run-adjudicated-197-0.4.1.jsonl` · `devloop-console-adjudicated-0.4.1.txt` | the dev-loop run over the 197 evidence artworks |
| `adjudication-input-197-0.4.1.jsonl` | 197 lines, the adjudication tool's input format |
| `adjudication-197-0.4.1.txt` / `.json` | the adjudication report, text and machine-readable |
| `run-coverage-220-0.4.1.jsonl` · `devloop-console-coverage-0.4.1.txt` | the dev-loop run over `coverage-set-1` |
| `fgshift-0.4.1/set-2-0.4.1.txt` | the two-artwork set for §3 |
| `fgshift-0.4.1/run-2-new-0.4.1.jsonl` · `run-2-ctl-0.4.1.jsonl` | the paired §3 runs |
| `fgshift-0.4.1/_pinned-de7afc2/*.ts` | `de7afc2`'s `src/`, imports re-depthed, nothing else touched |
| `BASELINE-0.4.1.md` | this file |

`fgshift-0.4.1/_pinned-de7afc2/` is the one group of files here whose names do not carry a `-0.4.1`
suffix: they are a verbatim `git show` of another commit's sources and renaming them would break the
`_pinned-<sha>` convention `substrate/` and `attribution/` already use. They sit inside a `-0.4.1`
directory, they collide with nothing, and they overwrite nothing.

Instrument side effects, all inside `research/v3/data/**`: 220 diagnostics records under
`data/devloop/p3-diag-coverage-0.4.1/`, 2 each under `data/devloop/p3-diag-fgshift-0.4.1-new/` and
`…-ctl/`, and the 400 perturbed images under `data/robustness/cache/` were **reused**, not
regenerated (identical `perturbationSet` sha256 to the 0.1.0 and 0.3.0 runs).

`src/` was not modified. Nothing was committed or staged.
