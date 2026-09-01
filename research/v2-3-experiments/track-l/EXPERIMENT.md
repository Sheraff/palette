# Track L — best-region-vs-family obligation ordering

Base commit: `548c2d1` (trunk after Track J), merged as `b2dfff2`.

**Outcome: no algorithm change is proposed. The runtime is byte-identical to
trunk** (the only diff is a seven-line comment recording this result at the
comparator). This arm ships a census instrument, four decisive measurements, and
a closed negative on the whole design space the brief named — including a
correction to the Track J claim that motivated the arm.

## Corpus statement

Unscrambled corpus from the shared checkout via `PALETTE_IMAGES_ROOT`. Sweep set
**109 cases**: the 34 fixtures + their scrambled decoys (71) ∪ the canonical
`research/v2-3-eval/data/offpanel-manifest.txt` (37) ∪ one off-panel case Track J
covered that the manifest omits (`10/…1061a3c7`) — kept so this arm's coverage is
a superset of the previous one's rather than a swap.

Baseline verified against the current cached label: **80/80 identical to
`trunk-j`**. Against the older `trunk-h5` it differs on exactly two cases, both
of which are Track J's integrated changes (`05/…5e5a5ff6`'s field restoration and
`slim-scrambled`) — i.e. the drift is accounted for, not unexplained.

Verdicts mined from the committed `verdicts.jsonl`, now **104 records through
batch 15**.

## Measurement 1 — the disagreement is corpus-wide, not local

`ordering-census.ts` reports, per artwork, every adjacent obligation pair the two
ordering keys rank differently. The comparator is:

```
primary    evidenceLevel(bestConnectedRegion.signatureAccent.score)   ONE region, accent-flavoured
secondary  evidenceLevel(signatureRoleScore(family))                  the whole family
tertiary   connectedPopulationFraction, then family id
```

The secondary is only ever consulted inside a primary tie, so wherever the keys
disagree *across* levels the family-level measure is silent.

**45 of 109 artworks carry at least one adjacent inversion; 55 inversions in
total; 97 inversions counting all pairs, not just adjacent ones.** Simulating the
two candidate rules over the census:

| rule | artworks whose obligation order changes |
| --- | --- |
| (a) family level primary, region level tie-break | **45** |
| (b) min(region, family) primary, region tie-break | **44** |

So this is not a narrow repair with a couple of collateral cases. **Any total
order over these two keys re-prioritises the obligations of ~40 % of the
corpus**, which is the ripple the brief warned about, quantified before a line
was written.

## Measurement 2 — the target case cannot be reached by ordering at all

`08/…087b13`, the case the arm exists for:

```
p0 family-8621   C=0.094  region 0.9245 lvl 23 | family 0.8381 lvl 20
p1 family-10363  C=0.016  region 0.9257 lvl 23 | family 0.8145 lvl 20   <- the caramel
p2 family-7718   C=0.040  region 0.9242 lvl 23 | family 0.7439 lvl 18
p3 family-7362   C=0.213  region 0.9103 lvl 22 | family 0.8035 lvl 20   <- the red
p4 family-1984   C=0.022  region 0.8835 lvl 22 | family 0.7366 lvl 18
```

**The caramel leads the red on *both* keys** — region level 23 against 22, family
score 0.8145 against 0.8035. There is therefore *no* ordering rule over these two
measures, in any blend, that puts the red above the caramel. The red's ceiling
under any legitimate re-ordering is `p2`, taken from `family-7718`, whose best
region (level 23) wildly overstates a family-level 18.

Implemented and measured (variant (b), `TRACK_L_ORDERING=min`), the red does
reach `p2`:

| configuration | obligations | reviewed arrangement `#020401 #311f13 #f1e8df #f94a2f` | winner |
| --- | --- | --- | --- |
| trunk | red @`p3`, weight 0.25 | idCov **0.500**, rel 0.8820 | caramel, rel **0.9291** |
| variant (b) | red @`p2`, weight 0.333 | idCov **0.548**, rel 0.8863 | caramel, rel **0.9291** |

**The promotion buys +0.0043 of a 0.0471 gap — 9 %.** Quality is untouched
(0.8513 either way), because promotion moves coverage only.

### The ceiling probe

To close the space rather than argue about it, I forced the most chromatic family
to `p0` (`TRACK_L_ORDERING=ceiling`, a measurement probe, never a proposal). That
*does* flip the case to the reviewed correction — but read why:

```
obligations become: family-7362@p0  family-7740@p1  family-6858@p2  family-5955@p3  family-1984@p4
reviewed arrangement: idCov 0.571  rel 0.9027   <- now the winner
```

The red's own coverage is **0.571**, *lower* than the 0.929 the caramel
arrangement used to score. The flip is not the red being promoted; it is **the
caramel being evicted from the obligation set entirely**. That is a
chroma-driven candidacy change — Track E's revision-2 entitlement and Track C's
round-5 diversity tie-break, in a cruder form than either.

Arithmetic for the honest ceiling, holding the set fixed: with the non-accent
credit at 0.500 and the denominator at 1.4, the accent term is `weight × 0.8`, so
the red scores idCov 0.548 at `p2`, 0.643 at `p1`, and **0.929 at `p0` — an exact
tie with the caramel**. Quality then breaks the tie: 0.8513 against 0.8598, the
caramel by 0.0085. And `p0` for the red is only reachable by displacing the
foreground's own family, which lowers the non-accent credit and makes even the
tie optimistic.

**Conclusion: obligation ordering cannot deliver `08/…087b13`. Not at the
ceiling.**

## Measurement 3 — the sweep, which is the argument

Variant (b) over all 109 cases: **17 differ**, and the damage is not marginal.

| case | trunk | variant (b) | status |
| --- | --- | --- | --- |
| `images/placebo.jpg` | `#6c8a8a #86a5aa #fbfdfa #c91611` | fg → **`#111312`** | **breaks review-14 strong/preferred** |
| `images/vvbrown.jpg` | `#ffffff #ffffff #080808 …` | field/foreground inverted, collapse flips | **breaks reviewed** |
| `images/elephunk.jpg` | `#55919b #022833 #fcfdd1 #a5c7c8` | surface collapses, accent → `#022833` | **breaks review-4 strong/preferred** |
| `images/artofficial.jpg` | `… #bdc1ca #f5e20c` | fg → `#fded9f`, ac → `#f0bb37` | **breaks review-3 strong** |
| `04/…04ccf0` | `#4d8a15 #64a821 #d1e4d0 #35710f` | fg → `#35710f` | **breaks review-13 strong/preferred** |
| `04/…044a28` | `… #cc9a8f` | ac → `#ac766a` | **breaks review-15 strong** |
| `07/…075841` | `… #d7b184` | ac → `#c59356` | **breaks review-6 strong** |
| `09/…fdddff2` | `#000000 #21203f #f5f7f4 #15a6a9` | surface → `#662948` | **breaks the standing guardrail** |
| `images/disney.avif` | `… #2199d6 …` | surface → `#f68121` | reverses an arbitration already closed |
| `images/horrorwood.jpg`, `images/slim.jpg` | | foreground moves | unreviewed drift |
| 6 scrambled decoys | | field/accent shuffles | decoys |

**Eight reviewed-strong outcomes broken, the `09` guardrail broken, and the
target case not fixed.** Variant (b) is the *narrower* of the two candidate
rules; variant (a) touches one more artwork's ordering and was not swept because
(b) had already disqualified the family.

## Measurement 4 — and the credit-side alternative is refuted too

The natural next thought, once ordering is closed, is the credit side: reduce
identity credit for a near-neutral accent, so the artwork's chromatic mark stops
losing to a washed-out one. Track C's round 5 declined this by inspection because
it would have removed credit from `placebo`'s then-reviewed `#111312`. Since then
`placebo`'s reviewed accent has become the red `#c91611` (batch 14,
strong/preferred), so that specific objection has expired — and I checked whether
the mechanism is therefore now open.

**It is not.** Mining all 104 verdict records for palettes that were reviewed
*and applied*, **31 carry a low-saturation accent**, of which twelve are
near-neutral by the algorithm's own `identityDirectionChroma = 0.06` bar:

```
#242426 (07/…07cc8b, batch-15 STRONG — my own Track H swap)   #111312 (placebo, strong)
#fdfdfd (07/…075841)   #f7f7f7 (08/…088460)   #fbfbfd (slipknot)   #fafcf9 (08/…081dec)
#61625a (01/…01738a)   #0e0906 (09/…099f42)   #241f19 (03/…034fd1)   #98908d (02/…0285d1)
#99a192 (06/…0637ff)   #6a5c5b (11/…110226)
```

Penalising near-neutral accents would put all of these at risk. Track C's
objection has not expired; it has **broadened** from one artwork to twelve.

Note also that the caramel is not the near-neutral the framing assumed: the
family prototype is `C = 0.016`, but the *representative actually rendered*,
`#e7a680`, has OKLab chroma **0.0927** — it clears `identityDirectionChroma` and
earns authority (`authGain = 0.0229`). It is a genuine, if muted, chromatic
direction. The palette is not choosing a grey over a red; it is choosing a
low-chroma warm over a high-chroma warm.

## Correction to Track J

Track J (mine) reported that on `08/…087b13` "family-wide `signatureRoleScore`
ranks the red 2nd of 16". **That is the *signature lane* rank, computed over all
families including the field-owned ones that obligation nomination then filters
out. Among the obligation candidates the red is 3rd, behind the caramel on the
family measure as well as on the region measure.** The brief for this arm was
built on my sentence, and the sentence overstated the disagreement. The
disagreement is real — `family-7718` at `p2` really is carried by one region
against a family level two bands lower — but it never had the red overtaking the
caramel in it.

I should have stated which ranking I meant. This arm's first measurement is the
one that would have caught it, and it costs ten minutes to run.

## What the measurements say the real blocker is

With ordering closed and credit closed, what is left on `08/…087b13` is the
**0.0085 quality gap**, and it is not in the accent axes at all:

```
winner  fg=#f1e8df ac=#e7a680   qual 0.8598   accentFidelity 0.784  accentPath 1.000  economy 0.773
wanted  fg=#f1e8df ac=#f94a2f   qual 0.8513   (accent axes near-identical; both accents fully observable)
```

Neither accent has any path pathology. The red is not being punished for being
small — Track J's repair already removed that handicap, and `accentFidelity` is
0.780 against 0.784. The residual is spread thinly across `sourceSupport`,
`representativeness` and `economy`, all of which favour the caramel because it is
a larger, better-supported family. That is the objective preferring a
well-evidenced muted colour to a thinly-evidenced vivid one — which is a
defensible thing for it to do, and is the same trade review endorsed on `placebo`
in batch 10 before reversing it in batch 14 on a *different* artwork.

So `08/…087b13` is not an ordering defect, not a credit defect, and not a support
defect. **It is a case where review wants a 0.57 %-of-frame vivid family to beat
a 1.61 % muted one on a 0.0085 quality margin.** If that is right, the lever is
the quality weights or a chromatic-identity term in the objective — a much larger
question than this arm, and one that needs more than one artwork behind it.

## Honest assessment

**Achieved**

- The brief's design space is **closed by measurement, not by opinion**: (a) and
  (b) both re-order ~40 % of the corpus; (b)'s sweep breaks eight reviewed-strong
  outcomes and the `09` guardrail; and the ceiling probe shows even unlimited
  promotion only ties coverage before quality takes it back.
- The reason is structural and was findable in ten minutes: **the caramel leads
  the red on both keys**, so no blend of them can invert the pair.
- The credit-side alternative is refuted with twelve reviewed near-neutral
  accents, including one this same reviewer called strong in the latest batch.
- A Track J error of mine — the "2nd of 16" claim that motivated this arm — found
  and corrected.
- Runtime byte-identical to trunk; the only change is a comment at the comparator
  so the next agent finds this result before re-opening it.

**Not achieved**

- `08/…087b13` is not fixed, and on this evidence should not be fixed from the
  identity side.
- I did not sweep variant (a). (b) is strictly narrower on the census and already
  broke eight reviewed outcomes; sweeping the wider rule to watch it break more
  would have cost 25 minutes to learn nothing. That is a judgement call and it
  leaves (a) formally unmeasured on winners.

**Uncertainty**

- The ceiling probe orders by chroma, which is a crude stand-in for "maximum
  promotion". It establishes that the flip requires *evicting* the caramel; it
  does not prove no exotic ordering key exists that promotes the red without
  evicting anything. What it does prove is that no key built from the two
  measures the comparator has can do it, because the caramel leads on both.
- The 0.0085 quality margin is small enough that several unrelated changes could
  cross it incidentally. If a future arm flips `08` as a side effect, it will not
  be because it solved this class.

## Proposed review items

**None from this arm** — the output is byte-identical to trunk, so there is
nothing to compare. Three findings instead, in priority order:

1. **`08/…087b13` should be re-asked, not re-engineered.** The recorded
   correction wants `#ff4e2a` over `#e7a680`. The measurements say the objective
   prefers the caramel on a 0.0085 quality margin driven by support and
   representativeness — the red is 0.57 % of the frame against the caramel's
   1.61 %. Worth confirming with the reviewer whether the red is wanted *at that
   price*, because paying it means down-weighting well-evidenced colours
   generally, not just here.
2. **`family-7718` at `p2` is the genuine ordering artefact on this artwork** —
   region level 23, family level 18, a five-band internal disagreement. It holds a
   slot ahead of two families whose measures agree. That is worth an arm on its
   own terms (an *internal-consistency* gate on obligation nomination, not a
   re-ordering), and it is a different mechanism from anything tried here.
3. **The chromatic-marks class now has no open mechanism.** Track E closed
   support, Track J closed accent quality and named the gradient and candidacy
   sub-classes, Track L closes ordering and credit. What is left is candidate
   availability (`11/…` not in the signature lane; `03/…` resolution) and the
   quality-weight question above.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-l/ordering-census.ts [caseFilter]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-l/run.ts <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-l/diff.ts trunk-548c2d1 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-l/verdict-check.ts trunk-548c2d1 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-l/verify-cache.ts trunk-548c2d1 trunk-j
```

The ordering variants are not in the runtime. To reproduce them, restore the
`orderingLevel` switch at the `ranked.sort` comparator in
`buildIdentityObligationSelection` (see `ordering-variants.patch`) and run with
`TRACK_L_ORDERING=min|family|ceiling`. `data/trunk-548c2d1.json` is the baseline,
`data/l1-min-ordering.json` the variant-(b) sweep,
`data/ordering-census.txt` the census.
