# Track H — polarity-aware neutral obligations

Base commit: `83ee25b` (trunk `trunk-b8`: v2-2 + D + C + A + B + E + B2 midpoint
distinctness and render-truthful accent scale).

Implements Track G's diagnosis: the white-text-foreground failure class is an
**identity-obligation** class, and near-white / near-black families are being
treated as one undifferentiated "neutral" kind when they are *opposite
foreground claims*.

**Outcome: one mechanism, two rules, one changed case.** `07/…07cc8b`'s
foreground becomes the artwork's white — the reviewed request. Every other case
in a 103-case sweep is byte-identical to trunk, including the `09/…fdddff2`
guardrail and every artwork carrying a verdict. `01/…015083` is *repaired but
not flipped*, and the reason is a measurement that also corrected the brief's
premise; see "Case 1" below.

## Corpus statement

Every measurement here was taken on the **unscrambled** corpus read from the
shared checkout `/Users/Flo/GitHub/palette` via `PALETTE_IMAGES_ROOT`. The
worktree's own `images/` holds only `-scrambled` decoys and was never read as an
artwork (the decoys are in the sweep set, but as decoys).

Sweep set: **103 cases** — Track G's 102 (the 34 review fixtures plus three more
`images/` artworks, their `-scrambled` decoys, and the cached off-panel artworks
from `00/`–`11/`) plus `10/ab67616d00001e02001061a3c7a084a0af56580d`, which
appears in the cached label union but not in G's list. The set is the union of
every label directory under `research/v2-3-eval/data/results/`.

The baseline is not asserted, it is **verified**: `verify-cache.ts` compares the
`trunk-b8` sweep against the orchestrator's own cached label and reports
**71/71 identical**. The remaining 32 cases are cached only under labels that
predate this trunk, so they are baselined from the fresh `trunk-b8` sweep.

## The defect, measured

`inspect-polarity.ts` dumps the obligation shortlist annotated with each
family's `foregroundPolarityObservation` — a per-family, field-independent
quantity the evidence already carries. `polarity` is the weighted mean of each
retained region's `boundaryLightnessPolarity` (the signed lightness step across
the region's own boundary): **negative = this family is the lighter side of its
own edges (light mark on darker ground), positive = the darker side**. Exactly
the light-text-versus-dark-text question.

### `01/…015083` — the snow-white is quota-omitted, and the omission is polarity-blind

```
prio family        L      C      neu | bestSigAcc lvl | polarity conf | pop%
p0   family-2865   0.268 0.015 NEU |  0.9424  23 |  1.000 1.000 |  4.22%   near-black
p1   family-5551   0.504 0.125     |  0.9070  22 |  0.752 1.000 |  3.64%   plum
p2   family-3769   0.329 0.057 NEU |  0.8852  22 |  0.709 0.918 |  0.93%
 .   family-10783  0.992 0.002 NEU |  0.8568  21 | -1.000 1.000 |  5.81%   snow white  <- omitted
p3   family-4651   0.417 0.062     |  0.8634  21 |  0.254 0.806 |  1.00%
```

This confirms G's inferred claim directly, which they flagged as uninstrumented:
`family-10783` is omitted by the **neutral quota**, and the two neutrals that
filled it (`+1.000`, `+0.709`) are *both dark marks on lighter ground* while the
omitted family is the one light mark in the set. The quota spent both slots on
one polarity and then refused the other one.

### `07/…07cc8b` — both are obligations, and the ordering key measures neither

```
p0   family-2865   0.265 0.003 NEU |  0.9243  23 |  0.711 1.000 |  4.41%  702 comps
p1   family-10804  0.988 0.001 NEU |  0.9012  22 | -1.000 1.000 |  6.79%   32 comps
p2   family-7783   0.690 0.174     |  0.6727  16 |  0.925 0.407 |  0.17%   marmalade
```

Reproduces G exactly. The ordering key is
`evidenceLevel(bestRegion.signatureAccent.score)`: 23 for the near-black, 22 for
the white, so `priorityWeight` is 1 against 0.5 and the coverage arithmetic
(denominator `1 + 0.5 × 0.8 = 1.4`) hands the foreground to the near-black at
`0.714` against `0.357`. The field-conditional classifier calls the white
`decisive-foreground` at `0.954` against the near-black's `0.924`, and it is a
clean 32-component graphic against 702.

## Mechanism

One idea — *for a near-neutral family, lightness polarity is the identity
direction* — applied at the two places the obligation system was polarity-blind.
Both live in `buildIdentityObligationSelection` (`palette-core.ts`); the new
policy constant is `identity.decisiveForegroundPolarity` (`policy.ts`). The
measure is `|polarity| × confidence`, the same reliability-times-direction
product `polarityAgreement` already uses.

**Rule 1 — the quota counts polarity.** A near-neutral candidate is let past a
full `maximumNeutralObligations` quota only when its own polarity claim *and
every already-selected neutral's* are decisive and point the opposite way. This
is self-limiting by construction: once both directions are represented, no
further neutral can oppose them all, so the quota still bites exactly on the
neutral-heavy artworks Track C wrote it for.

**Rule 2 — opposite-polarity neutrals are ordered by polarity.** Where the
selected obligations contain near-neutrals of decisively opposite polarity, those
members are re-ordered *among the slots they already hold* by how decisive their
claim is. Nothing enters or leaves the set; nothing is promoted past a family
that is not its polarity opposite.

Rule 2's justification is narrow and specific: the shortlist's ordering key is an
**accent**-flavoured score of a **single region**, and the question two opposing
neutrals raise is which of them the artwork sets its *text* in, measured across
the *whole family*. G falsified the "wrong flavour" hypothesis on its own —
swapping in the foreground-flavoured best-region score agrees with the accent one
(23 vs 21) — and G is right: the flavour is not the problem, the *single region*
is. Polarity is the family-wide measure of exactly the claim at issue.

**Banding.** Overturning region evidence must be earned by a material
difference, never by a last decimal. Claims are banded at
`ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence` (0.04, the resolution the rest of
the shortlist is ranked at) and within a band the region evidence's order stands.
This is not cosmetic — see "What banding cost, and why it is right" below.

Explicitly **not** done, per the standing principles: no mark evidence enters
nomination or ordering (Track E revision-2 / batch-10); no threshold was lowered
to catch a case (`identityForegroundClaimMargin` untouched); no field-conditional
score was given weight in the winner objective (G's rejected v1/v2); the quota's
capacity, the material-distance dedup, the reserve and the bound are unchanged.

## Before / after — full 103-case sweep

| case | trunk `trunk-b8` | Track H | note |
| --- | --- | --- | --- |
| `07/…07cc8b` | `#5d856b #99bece #242426 #fbfbfb` grad `#86b1c1` | `#5d856b #99bece` **`#fbfbfb #242426`** grad `#86b1c1` | **target hit** — foreground becomes the artwork's white |
| all other 102 | — | **byte-identical** | including every `images/` fixture, every decoy, and every cached off-panel artwork |

`diff.ts trunk-b8 h4-shipped` → **1 of 103 cases differ**.
`verify-cache.ts h4-shipped trunk-b8` → **71/71 still identical** to the
orchestrator's cached label (the changed case is not among the 71).

The swap is *only* a swap. G's rejected v2 hit the same target but dragged the
field with it (`#5d856b #99bece` → `#4e745b #8daab8`) and dropped the midpoint;
this change leaves background, surface, gradient decision and midpoint exactly as
trunk had them.

**Guardrail `09/…fdddff2`: byte-identical** (`#000000 #21203f #f5f7f4 #15a6a9`),
verified in every variant run. Its near-white `family-7212` is chromatic
(C = 0.107), so it is not a neutral-quota candidate at all, and its two neutral
obligations are same-signed — the mechanism cannot reach it.

**Verdicts.** `verdict-check.ts` mines `research/v2-3-eval/data/verdicts.jsonl`
(72 records, 48 artworks) and diffs *palettes*, not labels. **No artwork carrying
a verdict changes.** `05/…5e5a5ff6`'s reviewed red accent, `placebo`'s dark
accent, `03/…89643a`, `once`, `krafty`, `skap`, `nobs`, `disney`, `vvbrown`,
`johns`, `slim`, `meteora`, `11/…2b222b02` — all byte-identical.

### Attribution (ablation)

| configuration | `01/…015083` | `07/…07cc8b` | `09/…fdddff2` |
| --- | --- | --- | --- |
| trunk | `#927f92 #fcfef9 #23232d #824892` | `… #242426 #fbfbfb` | guardrail |
| rule 1 only (quota) | trunk | trunk | guardrail |
| rule 2 only (ordering) | trunk | **white foreground** | guardrail |
| both (shipped) | trunk | **white foreground** | guardrail |
| `decisiveForegroundPolarity = 2` (off) | trunk | trunk | guardrail |

Setting the constant above 1 disables both rules and reproduces trunk exactly, so
the single changed case is attributed to the polarity mechanism and to nothing
else. `07/…07cc8b` is attributable to **rule 2 alone**.

### Threshold sensitivity

`sensitivity.sh` replays the targets and the guardrail set at five values
(`data/sensitivity.txt`).

| `decisiveForegroundPolarity` | `07/…07cc8b` | `05/…5e5a5ff6` (frozen, reviewed) | `01/…015083` under the *unbanded* ordering |
| --- | --- | --- | --- |
| 0.45 | white fg | **REGRESSION** — reviewed `#ee231f` accent reverts to grey `#86858b` | flipped |
| 0.55 | white fg | held | flipped |
| **0.6 (shipped)** | **white fg** | **held** | flipped |
| 0.7 | white fg | held | trunk |
| 0.8 | trunk | held | trunk |

The floor is real and measured: at 0.45 the mechanism starts calling
`05/…5e5a5ff6`'s `−0.544` neutral a decisive claim, a group forms, and Track C's
reviewed red accent is lost. The shipped 0.6 clears that at 0.056 and clears the
target's weaker side (`+0.711`) at 0.111. A **full 103-case sweep at 0.7** was
also run (`data/h3-threshold-070.json`): 1 of 103 differs, the same target case.
So the shipped behaviour is stable across `[0.55, 0.711]` — the target does not
sit on a knife edge, and 0.7 is available as a more conservative setting with
identical corpus behaviour.

### Determinism, typecheck, architecture

Three extractions per case in one process and a second independent process, all
fields compared including gradient, collapse flags and midpoint
(`determinism.ts`): identical on `01/…015083`, `07/…07cc8b`, `09/…fdddff2`,
`05/…5e5a5ff6`, `placebo`, `once`. `tsc -p research/v2-3/tsconfig.json` clean.
`research/v2-3/test/architecture.test.ts` passes (2/2). The 34-fixture parity
test is expected to be *unchanged* by this arm — no `images/` case moves — but it
was not run (it is the slow suite the charter says not to run repeatedly, and the
103-case sweep covers every fixture it asserts).

## Case 1 (`01/…015083`) — repaired, not flipped, and the brief's premise was off

This is the part of the brief I could not deliver, and the measurement says why.

**The premise correction.** The brief (following G's table) says the
reviewed-strong arrangement `#927f92 #615362 #fcfef9 #824892` "already has higher
quality utility (0.7260 vs 0.7117) and better foregroundPath (0.95 vs 0.81)".
Those numbers belong to a **different arrangement**. Scored on trunk:

| arrangement | relation | quality | idCov | reviewed? |
| --- | --- | --- | --- | --- |
| `#927f92 #fcfef9 #23232d #824892` (trunk winner) | **0.7731** | 0.7117 | 1.000 | **strong** (review-10, `trunk-a5`) |
| `#927f92 #615362 #fcfef9 #824892` (**the c-alt2 target**) | 0.7333 | **0.6987** | 0.464 | **strong** (review-10, `c-alt2`) |
| `#927f92 #615362 #fcfef9 #23232d` | 0.7575 | **0.7260** | 0.630 | not reviewed |
| `#927f92 #824892 #fcfef9 #23232d` | 0.7587 | 0.7079 | 0.844 | not reviewed |

`0.7260` is the third row — an arrangement no one has reviewed. The reviewed
target is the *lowest-quality* of the four and trails the incumbent by 0.0398
relation utility. And the incumbent is itself **reviewed strong** in the same
batch. So case 1 is not a failing case: it is an artwork where review recorded
**two strong verdicts**, trunk produces one of them, and the brief asked to move
it to the other on numbers that belong to neither.

**What the mechanism did achieve here.** Rule 1 puts `family-10783` into the
obligation set — the structural repair G asked for: the artwork's white is no
longer unable to earn identity credit *in any role* — and rule 2 then lifts it
from `p3` to `p2` within its band. Obligations become
`family-2865@p0, family-5551@p1, family-10783@p2, family-3769@p3`. Measured
effect on every white-foreground arrangement:

| arrangement | idCov trunk → H | relation trunk → H |
| --- | --- | --- |
| `#927f92 #824892 #fcfef9 #23232d` | 0.666 → **0.904** | 0.7497 → **0.7616** |
| `#927f92 #615362 #fcfef9 #23232d` | 0.451 → **0.690** | 0.7486 → **0.7605** |
| `#927f92 #615362 #fcfef9 #824892` (reviewed target) | 0.464 → 0.524 | 0.7333 → 0.7363 |

The reviewed target moves least of the three because its coverage is set by its
*plum* accent at `p1`, not by the white. The best white-foreground arrangement
closes from 0.0234 to **0.0115** relation utility behind the incumbent
(0.7731). Not enough.

### What banding cost, and why it is right

Without banding, rule 2 promoted `family-10783` to **`p0`** on this artwork and
case 1 *did* flip, to `#927f92 #824892 #fcfef9 #23232d` (white foreground, plum
surface, near-black accent). I measured that configuration on the full 103 cases:
**2 of 103 differ**, both target cases, guardrail intact, no verdict-carrying
palette touched. It is a tempting result and I am not shipping it, because of
this:

```
family-2865  (near-black)  claim = 0.999861001
family-10783 (snow white)  claim = -1.000000000
```

The promotion to `p0` — and therefore the whole flip — rests on **1.4 × 10⁻⁴**
between two families that are both, to any honest reading, perfectly polarised.
That is a role assignment decided by measurement noise. The codebase's own answer
to this is `evidenceLevel` at a 0.04 resolution, used everywhere else in this
shortlist precisely so that rankings are not decided at the fourth decimal, and
applying the same discipline here bands the two together and leaves the region
evidence's order standing. Under banding, the white moves `p3` → `p2` and case 1
correctly declines to flip.

I record the unbanded variant as **measured and available** (`data/h2-*.json`),
not as a recommendation. If review says case 1's white foreground is wanted, the
honest route is a mechanism that earns it, not this tie-break.

## The accent-should-be-marmalade half of `07/…07cc8b`

Reported, not forced, per the brief. **This change does not help it.** The orange
`family-7783` is still identity obligation `p2` with the artwork's highest
`markSupport` (0.716) and is still classified `decisive-accent`, and it still
never reaches the accent slot — the accent went to the near-black the foreground
vacated. This is unchanged from G's finding, and it is now the same signature on
four artworks (`07cc8b`, `05/…`, `11/…`, and G's reading of Track E's cases):
**strong chromatic marks that are correctly classified and correctly obligated
still lose the accent to neutrals.** It wants its own arm.

## Honest assessment

**Achieved**

- The reviewed request on `07/…07cc8b` — the foreground is now the artwork's
  white — at a cost of **zero** other cases in 103, where G's attempt at the same
  target cost two frozen reviewed outcomes. Field, gradient and midpoint are
  untouched, so it is a pure role swap.
- G's uninstrumented inference ("the neutral quota is the case-3 blocker") is now
  directly measured, and the polarity structure behind it is visible: the two
  neutrals that filled the quota are both dark-on-light, the omitted one is the
  artwork's only light mark.
- Attribution by ablation in both directions (each rule alone; the constant
  disabled), plus a five-point threshold sensitivity that *locates the floor by
  finding the regression* rather than asserting a margin.
- A premise error in the brief corrected with the arithmetic, before building on
  it.

**Not achieved**

- `01/…015083` does not flip. Its reviewed-strong alternative is out of reach by
  ranking (0.0398 behind, and it is the lowest-quality of the four arrangements),
  and the reachable white-foreground arrangement is still 0.0144 behind.
- The marmalade accent is untouched.
- Rule 1 (the quota exemption) **changes no winner anywhere in 103 cases**. It is
  a structural repair whose effect today is visible only in obligation sets and
  coverage numbers (it is what puts `01/…015083`'s white into the set at all, and
  it moves that artwork's white-foreground arrangements by up to 0.24 coverage —
  but not past the incumbent). By this codebase's own standard
  (`signatureRoleScore`'s comment: "left out rather than carried as an
  unexercised path") that is an argument for shipping rule 2 alone. I am
  proposing both because rule 1 is what makes the mechanism *coherent* — rule 2
  orders opposite-polarity neutrals, and rule 1 is why both of them are in the
  set to be ordered — but the orchestrator should know it is currently inert on
  winners and may prefer rule 2 alone.

**Uncertainty**

- `07/…07cc8b` has **no record in `verdicts.jsonl`**. That file's latest batch is
  `review-10`; the "reviewed weak-fallback / the foreground should be white"
  verdict the brief cites is from a later round not present in this repo state. I
  took the brief's word for it. This case therefore needs a verdict, not a
  confirmation.
- `decisiveForegroundPolarity = 0.6` is a fitted constant. I am not going to
  pretend otherwise: the valid window is bounded below at ~0.545 by a *measured*
  regression on a frozen reviewed outcome and above at 0.711 by the target, and
  0.6 sits inside it with margins of 0.056 and 0.111. It is bounded by evidence
  on both sides rather than chosen to hit one artwork, and a full sweep at 0.7
  behaves identically — but it is still a number chosen against this corpus.
- The polarity observation is measured on region *boundaries*. On artworks whose
  lettering sits on a busy or mixed ground, the observation will be less decisive
  and the mechanism will simply not fire. I did not find such a case in the sweep
  set; I also did not go looking for one off-panel.
- 32 of the 103 cases are baselined against my own trunk sweep rather than
  against a cached label of this trunk (they are cached only under older labels).
  They are all byte-identical before and after, so the risk is confined to a
  mis-baseline that would be invisible either way.

## Proposed review items

1. **`07/…07cc8b`** — trunk `#5d856b #99bece #242426 #fbfbfb` versus Track H
   `#5d856b #99bece #fbfbfb #242426`. Same four colors, foreground and accent
   swapped; field, gradient and midpoint identical. This is the arm's only output
   change and the case the brief names. It also has no recorded verdict in
   `verdicts.jsonl`, so this is the item that decides the arm.
2. **`01/…015083` — a three-way, and it settles a principle.** Review recorded
   *two* strong verdicts on this artwork and trunk produces one of them:
   `#927f92 #fcfef9 #23232d #824892` (`trunk-a5`, strong) versus
   `#927f92 #615362 #fcfef9 #824892` (`c-alt2`, strong) versus the arrangement
   neither review saw, `#927f92 #824892 #fcfef9 #23232d`, which is the one the
   objective can actually reach and which the unbanded variant produces. The
   review-9 note ("the foreground of option A is good, the snow white matches the
   artwork's text") says the white belongs in the foreground; a verdict on the
   third option says whether the objective is allowed to get there by a route the
   reviewer has not seen.
3. **The marmalade accent class** (`07cc8b` at `markSupport` 0.716, plus `05/…`
   and `11/…`) — escalated unchanged from G. Three artworks, one signature, and
   nothing on the foreground side reaches it.

## Reproducing

```sh
# baseline verification against the orchestrator's cache
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/run.ts trunk-b8
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/verify-cache.ts trunk-b8 trunk-b8

# sweeps and diffs
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/run.ts <label> [caseFilter]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/diff.ts trunk-b8 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/verdict-check.ts trunk-b8 <label>

# instruments
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/inspect-polarity.ts <image...>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/inspect-treatments.ts <image> [--fg #hex] [--top N]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/inspect-roles.ts <image>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/determinism.ts <image...>

# threshold sensitivity (rewrites the constant in place, restores it at the end)
sh research/v2-3-experiments/track-h/sensitivity.sh 0.45 0.55 0.6 0.7 0.8
```

Sweep data: `data/trunk-b8.json` (baseline), `data/h4-shipped.json` (this arm),
`data/h1-polarity-quota.json` (rule 1 alone), `data/h2-polarity-quota-and-order.json`
(unbanded ordering), `data/h3-threshold-070.json` (threshold 0.7),
`data/sensitivity.txt`. Images are read from `PALETTE_IMAGES_ROOT` (default
`/Users/Flo/GitHub/palette`) because `images/` and the numbered directories are
gitignored and hold only decoys in a worktree.
