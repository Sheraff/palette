# Track J — chromatic marks to accent

Base commit: `ff59722` (trunk after Track H's polarity-aware neutral obligations
were integrated), merged into this worktree as `7103fbd`.

The brief: six artworks where human review has named a chromatic mark it wants as
the accent, and the mark never wins the slot. Track G's finding 3 framed the gap
as "these marks reach obligations but never win the accent SLOT", and asked which
of four things is responsible — (a) obligation priority, (b) accent-shortlist
ranking, (c) identity authority, (d) candidate availability.

**The headline is that the class is not one class, and one of its members is not
an accent problem at all.** Measured per case, the six split three ways, and the
split includes a cause the four options do not contain.

## Corpus statement

All measurements on the **unscrambled** corpus, read from the shared checkout
`/Users/Flo/GitHub/palette` via `PALETTE_IMAGES_ROOT`. Sweep set **109 cases**:
Track H's 103 plus the six batch-15 fresh artworks that appear in `trunk-h5` but
were in no earlier label. Baseline verified against *both* current cached labels:
`101/101` identical to `trunk-h5` and `71/71` identical to `trunk-b8`.

**Verdict-source caveat, and it matters.** The `verdicts.jsonl` committed on trunk
stops at `review-14-b2`. The batch-15 verdicts the brief quotes — including both
correction records this track is aimed at — exist **only in the shared checkout's
working copy**, uncommitted. I read them from there
(`/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl`, 104 records).
Anything downstream that mines the committed file will not see them.

The two correction records, quoted exactly:

- `07/…07cc8b` — verdict **strong** on my own Track H output, note: *"the only
  remaining issue with that palette is that the accent should be the color of the
  orange album title, which is pretty close to marmalade orange"*, correction
  `accent: #f06d13`.
- `08/…087b13` — verdict **acceptable**, note: *"This palette could be stronger
  using the red accents instead of the caramel cream skin color"*, correction
  `accent: #ff4e2a`.

## The measurement

`inspect-accent-gap.ts` replays the real candidate pipeline (no score is
re-implemented), finds the family nearest the wanted colour, and answers the four
questions in an order that makes them mutually exclusive: is it in the signature
lane and does it have a source representative; is it an obligation; does **any**
scored treatment carry it as the accent; and if so how far behind the winner is
the best one, on which axes.

| case | wanted | family | mark | sig lane | obligation | treatments w/ it as accent | best rank | rel gap | **cause** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `07/…07cc8b` | `#f06d13` | `family-7783` | **0.716** | 14/16 | **p2** | **276**/1500 | 20 | 0.0294 | **(e) gradient zero-crossing** |
| `08/…087b13` | `#ff4e2a` | `family-7362` | 0.103 | **2/16** | **p3** | **298**/1500 | 8 | 0.0471 | **(a) obligation priority** |
| `11/…2b222b02` | `#c35151` | `family-6458` | 0.403 | **NO** | NO | **0** | — | — | **(d) not in the signature lane** |
| `03/…89643a` | `#c8a13c` | `family-7741` | 0.000 | **NO** | NO | **0** | — | — | **(d) resolution** |
| `04/…04ccf0` | `#b5652a` | `family-6858` | 0.000 | 15/16 | NO | 13 | 897 | 0.1267 | **(d) three components, no mark** |
| `01/…018a1e` | "Mothy orange" | nearest is 0.110 away | 0.005 | 6/16 | NO | 49 | 200 | 0.0965 | **(d) the colour is not a family** |
| `05/…5e5a5ff6` | `#ee231f` | `family-6942` | 0.819 | 10/16 | p2 | 275 | **4** | **0.0000** | already correct — guardrail |

So Track G's framing holds for two cases and is wrong for four: **on four of the
six the mark never reaches an obligation and on three of those it never reaches
the accent shortlist at all.** (b) and (c) are responsible for none of them —
obligation families already get priority retention in the accent shortlist
(`retainRoleFamilyDirections` seeds the retained list from the obligation ids
before ranking), and where the mark is an obligation, hundreds of treatments
carry it.

### `07/…07cc8b` — not an accent-scoring failure; the gradient forbids it

`inspect-accent-path.ts` splits `accentPath = sqrt(accentUtility ·
rolePathFraction)` into its factors and prints the accent's APCA pair per
gradient sample. On the winner's own field, foreground held fixed:

```
winner  ac=#242426   -> +31.8  +42.8  +54.8  +58.2  +62.1     path 5/5   accentPath 1.000
wanted  ac=#ee7326   -> -12.7    0.0   +7.7  +11.2  +15.0     path 4/5   accentPath 0.752
```

The marmalade **changes APCA sign across the ramp and passes through exactly
zero**. That is not a scoring artefact and not a magnitude-versus-adequacy
argument — B2's adequacy scale is already in force here (`accentScale = 9` for
gradient variants) and the accent still saturates `accentUtility` at 0.707 only
because it is *invisible on one of the five samples*. The charter names this
exact thing a defect: "APCA sign flips across gradient samples imply a
zero-contrast crossing inside the gradient — that is a defect."

**The objective is right to refuse this accent on this field.** And review agrees
about the field: batch 13 on the same artwork says *"I'm not sure we should have
a gradient between cashmere green and ghost blue. In the artwork, this is the sky
and the grass, and visually it doesn't feel like there's a gradient between both
because they are just different areas, different surfaces."*

Every treatment in the domain carrying the marmalade is a gradient, so the flat
counterfactual cannot be scored from the current candidate set. The conclusion
stands regardless: **`07/…07cc8b`'s accent cannot be fixed from the accent side,
and should not be. It is a gradient-neutrality case wearing an accent case's
clothes**, and the reviewer named the gradient two batches before naming the
accent.

### `08/…087b13` — the clean case, and the cause is obligation priority

No pathology anywhere: both the incumbent and the wanted accent hold
`accentPath = 1.000`, five live samples each, no sign change.

| treatment | rel | qual | idCov |
| --- | --- | --- | --- |
| `#020401 #311f13 #f1e8df #e7a680` (winner) | 0.9291 | 0.8598 | **0.929** |
| `#020401 #311f13 #f1e8df #f94a2f` (**the reviewed correction**) | 0.8820 | 0.8513 | **0.500** |

The quality domain is nearly a tie — **0.0085** apart. The entire 0.047 gap is
identity coverage, and identity coverage here is entirely obligation priority:

```
obligations: family-8621@p0  family-10363@p1  family-7718@p2  family-7362@p3  family-1984@p4
                              ^ caramel, weight 0.5             ^ red, weight 0.25
```

And the same disagreement Track H found on neutrals is present here on
chromatics: the red family is **signature-lane rank 2 of 16** on the family-level
`signatureRoleScore`, but obligation priority is set by
`evidenceLevel(bestRegion.signatureAccent.score)` — the best *single region* —
and that puts it at `p3`. The family-wide measure and the best-region measure
disagree, and the best-region measure decides.

This is the one case in the class where a principled fix would land, and the
place to make it is obligation *ordering*. I did not attempt it — see "What I did
not do".

### The `(d)` four — candidacy, and two of them are not scoring problems either

- `11/…2b222b02`: the red swoosh carries `markSupport = 0.403` (Track E's census
  found it) and is **not in the signature lane at all**, so it is never nominated
  and never shortlisted. This is the one `(d)` case where scoring could in
  principle reach it — the lane is ranked by `signatureRoleScore`, the same
  population-handicapped quantity this arm repairs downstream.
- `03/…89643a`: `markSupport = 0.000`. Track E predicted this exactly — the gold
  components are 3–4 px on a 300×300 thumbnail, below the 12 px stroke floor.
  **Confirmed: this is resolution-limited, as the brief asked me to report.**
  Recovering it needs pixels, not scoring.
- `04/…04ccf0`: the orange-brown line is **three components**, `markSupport = 0`.
  Three components cannot clear the mark plurality floor and should not. Its 13
  treatments all put the orange in the *foreground* with a collapsed accent,
  ranked 897th.
- `01/…018a1e` (the seventh case, newly named in batch 15 — *"some orangish tones
  that could make for a very good chromatic accent, pretty closely matches the
  Mothy orange"*): the nearest family to any orange is **0.110 away in OKLab** and
  is a pink (`#da8195`). The wanted colour does not survive family formation.
  This is an evidence-stage question, upstream of everything this track touches.

## The change

One rule, at three sites, all inside the quality domain.

`signatureAccentRoleScore(family)` is `signatureRoleScore` with its one
population-normalised term (`coherentSupport = largestComponentFraction / 0.002`,
25 % of the `signatureScore` half) repaired by mark evidence, via the same
`max(populationTerm, markSupport)` substitution Track E ships at its two support
sites. It is read at exactly the three places an accent's own evidence is scored:
`accentIdentity` (into `artworkIdentity`), `accentFidelity` (via
`distinctAccentFidelity`) and `accentEconomy` (into `economy`).

**Candidacy is untouched.** Lane ranking, obligation nomination and the accent
shortlist all keep reading the unrepaired `signatureRoleScore`. This is Track E's
revision-2 rule respected literally: *mark evidence repairs a handicap in fair
competition, it does not confer an entitlement*. What review rejected on
`placebo` was substituting into the obligation shortlist — manufacturing the
claim "this family must appear". Here nothing decides who competes; once a family
has won its place on its own region evidence, the quality domain stops charging
it for being small.

The handicap is real and it is charged three times over. On `07/…07cc8b`:

| family | pop | largestCompFrac | coherentSupport | markSupport | signatureRoleScore | repaired |
| --- | --- | --- | --- | --- | --- | --- |
| `family-7783` marmalade title | 0.167 % | 0.000232 | **0.116** | **0.716** | 0.5109 | 0.5933 (+0.082) |
| `family-2865` near-black | 4.407 % | 0.016545 | **1.000** | 0.027 | 0.7602 | 0.7602 |

The album title — nine qualifying marks of eleven components, the highest
`markSupport` in the artwork — is charged 0.116 where the incumbent near-black
gets 1.000 for free. Track E measured this same substitution as a no-op on its
38-case sweep, left it out rather than carry an unexercised path, and wrote in
this file that it "remains the obvious next site if evidence for it ever
appears". This is that site.

## Results

**2 of 109 cases differ. Neither is a target, and one of them is a reviewed-strong
palette being restored.**

| case | trunk `ff59722` | Track J | note |
| --- | --- | --- | --- |
| `05/…5e5a5ff6` | `#e8ebf0 #d1d4d9 #121117 #ee231f` | **`#eff3f6 #d6d7dc #121117 #ee231f`** | **restores `trunk-c5`, review-11 preferred STRONG** |
| `images/slim-scrambled.jpg` | `#01040b #140e18 #db2a30 #3b4449` | `#01040b #140e18 #3ebee3 #db2a30` | scrambled decoy only; `slim.jpg` byte-identical |

The `05` result is the one worth reading twice. That artwork is the brief's
guardrail — "accent now red `#ee231f` (reviewed strong), do not regress" — and the
accent does not regress. What moved is the *field*: trunk had drifted to
`#e8ebf0 #d1d4d9`, a pair **carrying no verdict**, while the palette review
actually marked strong and preferred in batch 11 is
`#eff3f6 #d6d7dc #121117 #ee231f`. This arm puts it back. Mechanically that is
`accentIdentity` feeding `artworkIdentity`, which feeds the field-ranking
comparison between two near-identical off-white pairs; the red accent's repaired
role score tips it back to the reviewed field.

Mined against the **full 104-record verdict file including batch 15**: verdict
palettes lost **none**; verdict palettes gained **one** (`05/…5e5a5ff6`,
`trunk-c5`, strong/preferred, review-11). Every other verdict-carrying artwork —
`placebo` `#c91611`, `slim`, `krafty`, `07/…07cc8b`'s white foreground, `disney`,
`skap`, `nobs`, `once`, `vvbrown`, `johns`, `03/…`, `11/…` — is byte-identical.

The two cases the brief asked me to log are **untouched**: `06/…06c5d727` still
`#0e0e28 #2a284d #f3f5f4 #c27f62` (the batch-15 regression against v2-2 stands,
undiagnosed) and `09/…0955ccfc` still `#131313 #131313 #fbbb4d #987734`
(uncollapsed).

**Attribution.** Zeroing the substitution term (`markSupport` contributes
nothing, so `signatureAccentRoleScore` collapses to `signatureRoleScore`)
reproduces trunk exactly on both changed cases:
`05/…` → `#e8ebf0 #d1d4d9 #121117 #ee231f`, `slim-scrambled` → `#db2a30 #3b4449`.
Both differences are attributable to this rule and nothing else.

**Determinism** (three extractions per case in-process, all fields including
gradient, collapse and midpoint): identical on `05/…`, `07/…07cc8b`,
`08/…087b13`, `placebo`, `slim`, `krafty`, `06/…`, `09/…`. `tsc` clean.
`architecture.test.ts` 2/2.

## What I did not do, and why

- **Obligation ordering for `08/…087b13`.** This is the one case the measurements
  say is winnable, and the fix is to stop letting a single best region outrank a
  family-wide measure. I declined it inside this arm for two reasons. Track C's
  round 5 measured a within-evidence-level diversity tie-break on exactly this
  class, found it did not produce a red accent on `11/…` and perturbed that case
  further, and reverted it. And the change is broad — obligation priority feeds
  every treatment's coverage on every artwork — so it needs its own arm with its
  own sweep, not a rider on this one. **It is my top recommendation for the next
  arm**, and `08` is a clean target for it: quality is a tie to 0.0085, the
  accent has no path pathology, and review has recorded the exact wanted hex.
- **`rankAccentOptions`'s `/75`** (the brief's option (b), B2's flag). I did not
  touch it because the measurements exonerate it: obligation families are seeded
  into the retained accent list *before* ranking, so on every case where the mark
  is an obligation it is retained regardless of where `/75` puts it, and on the
  cases where it is not an obligation the failure is upstream at lane membership.
  Changing it would move retention on cases whose evidence has not changed —
  the blast radius B2 explicitly avoided.
- **Lane admission for `11/…`.** The signature lane is ranked by the same
  population-handicapped `signatureRoleScore` this arm repairs. Repairing it
  *there* would be a candidacy change, which is the entitlement Track E's
  revision 2 rejected. Worth an arm; not this rule.
- **Anything for `03/…`, `04/…`, `01/…018a1e`.** Resolution, three components, and
  a colour that is not a family. None is a scoring defect.

## Also logged, no action (as asked)

- `06/…06c5d727` **regressed against v2-2** in batch 15: v2-2's `#f5c982` accent
  was **preferred strong** over trunk-h5's `#c27f62`. Both are warm; this is an
  accent-choice regression in the same neighbourhood as this class but with the
  opposite sign, so it is a useful control. **My change does not touch it**
  (see the sweep). Not diagnosed here.
- `09/…0955ccfc` wants the accent **collapsed** — *"There are really only two
  colors in that artwork"*, correction `foreground: #131313, accent: #131313`.
  Note this verdict also preferred v2-2's arrangement, which has the yellow as
  the *field* and the black as foreground, where trunk-h5 has them inverted. A
  collapse class, not an accent-colour class. **My change does not touch it.**

## Honest assessment

**Achieved**

- A per-case diagnosis that **relocates the class**. Four of the six never reach
  an obligation and three never reach the accent shortlist, so Track G's framing
  ("they reach obligations but never win the slot") describes two members, not
  six. Options (b) and (c) are exonerated by measurement, not by argument.
- `07/…07cc8b` — the case with the most human endorsement — is shown to be **not
  an accent problem**. Its marmalade accent changes APCA sign and passes through
  exactly zero on the gradient ramp; the charter calls that a defect, and review
  independently disputed the same artwork's gradient two batches earlier. Had I
  forced this accent, I would have shipped a palette whose accent vanishes
  partway down the field.
- `03/…89643a` confirmed resolution-limited, closing the item the brief asked me
  to check.
- A repair at the site Track E named and parked, respecting its rule literally,
  which restores a reviewed-strong palette and loses none.

**Not achieved**

- **No target case is fixed.** Zero of the six. The arm's entire corpus effect is
  one guardrail-adjacent restoration and one decoy.
- The strongest available lead — `08/…087b13`, where quality is a tie to 0.0085
  and the whole gap is obligation priority — I deliberately did not take, because
  it needs an arm-sized change with its own sweep. That is a real gap between
  what I diagnosed and what I delivered.

**Uncertainty**

- **The `05/…` restoration is a knock-on, not a designed outcome.** I did not set
  out to move a field, and a rule that reaches field ranking through
  `artworkIdentity` has more reach than "score the accent that is already on
  screen" suggests. It happens to land on the reviewed palette here; on an
  artwork the corpus does not contain it could land elsewhere. This is the single
  thing I would most want a reviewer to look at, and it is why item 1 below is a
  review item rather than a footnote.
- The wanted hex for `11/…` (`#c35151`), `03/…` (`#c8a13c`), `04/…` (`#b5652a`)
  and `01/…018a1e` (`#e8763c`) are **my readings** of prose notes ("a red hue…
  Bordeaux or Bruise", "gold-orange writing", "orange brown line", "Mothy
  orange") — only `07/…07cc8b` and `08/…087b13` have exact correction records.
  For `01/…018a1e` the nearest family is 0.110 away, which is far enough that my
  hex guess could be what is wrong rather than the algorithm.
- Track E measured this substitution as a no-op on 38 cases; it is a 2-case
  effect on 109. It is thinly exercised, and by the codebase's own
  "no unexercised paths" standard that is a live argument against shipping it —
  weakened, in my view, by the fact that the one case it does move it moves onto
  a recorded strong verdict.

## Proposed review items

1. **`05/…5e5a5ff6`** — trunk `#e8ebf0 #d1d4d9 #121117 #ee231f` versus Track J
   `#eff3f6 #d6d7dc #121117 #ee231f`. Same foreground, same reviewed red accent;
   two near-identical off-white field pairs. The arm's side is the palette
   review-11 marked **strong and preferred**, so this should be a confirmation —
   but it is a *field* move produced by an *accent* rule, so it is worth
   confirming rather than assuming. This is the arm's only substantive output.
2. **`07/…07cc8b` — a question, not a comparison.** The requested marmalade
   accent is measurably invisible on one of five gradient samples (`−12.7, 0.0,
   +7.7, +11.2, +15.0`). Review has already said the gradient itself is wrong for
   this artwork. Should the next arm pursue the accent, or the gradient? The
   measurements say the accent is unreachable while the gradient stands.
3. **`08/…087b13` for the next arm** — trunk `#020401 #311f13 #f1e8df #e7a680`
   versus the recorded correction `#020401 #311f13 #f1e8df #f94a2f`. Quality is a
   tie to 0.0085, no path pathology, and the whole gap is that the red is
   obligation `p3` and the caramel `p1` — decided by a best-single-region score
   while the family-wide measure ranks the red 2nd of 16. Same best-region-versus-
   family disagreement Track H found on neutrals, now on chromatics.

## Reproducing

```sh
# per-case diagnosis for the whole class
sh research/v2-3-experiments/track-j/diagnose-all.sh

# the two decisive instruments
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/inspect-accent-gap.ts <image> --want '#rrggbb'
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/inspect-accent-path.ts <image> --want '#rrggbb'
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/inspect-signature-terms.ts <image> <family-id>...

# sweeps
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/run.ts <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/diff.ts trunk-ff59722 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/verify-cache.ts trunk-ff59722 trunk-h5
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-j/determinism.ts <image...>
```
