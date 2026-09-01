# Track W — resolution-relative region evidence, and the foreground stack

Base commit: `979c245` (`research/palette-0.9-checkpoint` tip).

**Outcome: a measured negative on the assigned mechanism, and one unassigned positive.**

The resolution-relative `resolved` was built, verified byte-identical at its default,
and swept. It perturbs 17.1 % of the corpus, moves **0 of the 6 must-flip cases**, and
**breaks 1 of the 4 must-hold cases on its own**. Composed onto the foreground stack it
adds **12.8 points of blast radius and changes no acceptance outcome whatsoever**. It is
measured, reported, and **not recommended**.

The positive came out of the composition work: replacing Track T's chroma-based reading
of the incumbent asymmetry with an **obligation-rank** bound recovers `birdsofprey`
(frozen **strong** ×4) and cuts Track O's blast radius from 30.7 % to 23.6 % while
keeping **6/6 must-flip**. It uses no new policy constant.

## Corpus statement

Every measurement is on the **unscrambled** corpus, read from the shared checkout
`/Users/Flo/GitHub/palette` via `PALETTE_IMAGES_ROOT` (charter, "Corpus trap"). The
worktree's own `images/` holds only `-scrambled` decoys; those decoys are *in* the sweep
set, as decoys, and are never read as artworks.

**Verification set: 140 cases** — the 34 review fixtures, their `-scrambled` decoys, the
37-entry `research/v2-3-eval/data/offpanel-manifest.txt`, and every artwork carrying a
verdict in the live warehouse. `build-cases.ts` derives it. All 13 acceptance-list
artworks are present.

Verdicts are mined from the **live** `research/v2-3-eval/data/verdicts.jsonl` in the
shared checkout: **161 records**, latest batch `review-23-fg-movers`. Batches 20 and 23
are treated as authoritative over older briefs (recency rule), which is what reverses
`05/…0005a918`'s and `13/…13bebcae`'s frozen **strong** verdicts.

Machine budget respected: 3 workers, `VIPS_CONCURRENCY=1`, one result file per job under
`data/<label>/` so a sweep can be killed and resumed. A full 140-case sweep costs ~90 s.

## 1. The mechanism, and why the default is provably inert

`resolved` opens every region observation, at two sites
(`componentRolePreliminary` and `buildRegionObservations`):

```ts
const resolved = clamp(Math.log2(component.population + 1) / 8)
```

`8` is `log2(256)`: a component saturates as "fully resolved" at **255 pixels, absolute**.
Track E measured the consequence — the same glyph scores `resolved` 0.465 at 350 px and
0.857 at 1400 px. The corpus spans 300² to 1400², a **21.8× range in pixel count**, so
this is a systematic bias in favour of large files, not a corner case.

The reformulation makes the saturation population track the artwork's own size:

```ts
reference = resolvedReferencePopulation × (pixelCount / resolvedReferencePixelCount) ^ exponent
```

- **`exponent = 0`** — constant reference. The historical behaviour, and the default.
- **`exponent = 1`** — the reference tracks **area**. A component's population scales with
  area under uniform rescaling, so this is the setting at which `resolved` becomes
  invariant to the resolution the file arrived at. It is *derived*, not fitted — there was
  no threshold search.

`resolvedReferencePixelCount = 409_600` (640²) comes from the **corpus distribution**, not
from any case: it is simultaneously the p50 and the mode (56 of 140) of artwork sizes.

**The default is inert by construction, not by floating-point luck.** `resolvedDenominator`
takes an early return on the literal `8` when the exponent is `0`, rather than trusting
`Math.log2(256)` to land exactly on 8. Verified: at the default the sweep reproduces
**34/34 frozen parity fixtures** exactly (`check-parity.ts`).

The component floor got the same treatment. `markSupportOf` uses
`max(minimumComponentPopulation, minimumComponentFraction × pixelCount)` = `max(12, 0.00002·P)`
— a **noise** floor and a **representativity** floor. `componentFloorExponent` scales the
first arm; `0` is the default.

## 2. Solo blast radius, and an exact structural confirmation

`exponent = 1`, alone, against `trunk-979c245`:

| | |
| --- | --- |
| cases changed | **24 of 140 (17.1 %)** |
| must-flip moved | **0 of 6** |
| must-hold broken | **1 of 4** (`04/…04ccf0ae` MÚSICA, frozen **strong**) |

The change is not diffuse — it is exactly where the mechanism says it must be:

| artwork size | changed |
| --- | --- |
| below 640² (reference **falls**) | 18 / 51 (35.3 %) |
| **exactly 640² (reference unchanged)** | **0 / 56 (0.0 %)** |
| above 640² (reference **rises**) | 6 / 33 (18.2 %) |

**0 of 56 at the reference resolution** is a prediction the formulation makes before any
sweep, and it holds exactly. The implementation does what it claims; the claim is simply
not worth what it costs.

MÚSICA's white caption foreground `#d1e4d0` moves to a leaf green `#1b430e`. Boosting
small-component evidence at 300² lifts the *leaf texture* — droplets and speckles — not
the letter-spaced caption, whose glyphs are 1–2 px strokes.

## 3. The component floor: a second measured negative, and a defended constant

`componentFloorExponent = 1`, alone:

| | |
| --- | --- |
| cases changed | **2 of 140 (1.4 %)** |
| must-flip moved | **0 of 6** |
| must-hold broken | **1 of 4** (MÚSICA again, to `#082e05`) |

Track T's diagnosis was that MÚSICA's caption is invisible to evidence because "every
glyph is below the 12 px representativity floor". Relaxing that floor at 300 px **does not
recover the caption — it makes the case worse**, and buys nothing anywhere else.

The reason is that `max(12, 0.00002·P)` is not one floor but two, and they are correctly
formulated already: the fractional arm is a *representativity* floor and is scale-relative;
the `12` is a *noise* floor, and compression noise is a pixel-level phenomenon that
genuinely **does not** scale with image size. Making it relative admits JPEG artefacts at
300² without ever reaching the caption. **The absolute 12 is right, and this measures it
rather than assuming it.** I recommend leaving `componentFloorExponent` at `0` permanently
and treating the question as closed.

## 4. The composed stack, per stage

All against `trunk-979c245`, all 140 cases:

| stage | changed | must-flip | must-hold |
| --- | --- | --- | --- |
| trunk | — | 0/6 | **4/4** |
| relative `resolved` solo (e=1) | 24 (17.1 %) | 0/6 | 3/4 |
| relative floor solo (e=1) | 2 (1.4 %) | 0/6 | 3/4 |
| **O display-text rule** | 43 (30.7 %) | **6/6** | 0/4 |
| O + incumbent-**chroma** asymmetry | 37 (26.4 %) | **6/6** | 1/4 |
| **O + obligation-rank asymmetry** | **33 (23.6 %)** | **6/6** | **1/4** |
| O + rank + relative `resolved` | 51 (36.4 %) | **6/6** | 1/4 |

Track O's rule reproduces on my independently-built case set exactly as their record
reports (6/6 flip, all four holds broken), which cross-validates both harnesses.

**The last row is the arm's verdict on its own mechanism.** Adding the relative `resolved`
to the best stack changes **no acceptance outcome at all** and costs **+12.8 points** of
blast radius (33 → 51 cases). It is pure cost on this corpus.

## 5. The unassigned positive: rank, not chroma

Track T's §7.4 recommended the **incumbent-chroma asymmetry** — "a chromatic incumbent
with standing identity evidence is never displaced" — on the observation that all six
endorsed flips displace a near-neutral while `infected`'s protected `#49b7f6` is the only
chromatic incumbent in the set. I implemented it (plumbing each obligation's prototype
chroma through to the identity objective) and it is **real but weaker than the correct
rule**: it recovers `birdsofprey` and not `johns`.

Instrumenting the obligation lists shows why, and shows the right axis:

| artwork | family taking the foreground | family displaced | verdict |
| --- | --- | --- | --- |
| `johns` | red sun disc, **p4**, chroma 0.199, fgEv 0.953 | white wordmark, **p0**, chroma 0.0085, fgEv 0.928 | **HOLD** |
| HOPE `0a/…0a392cb5` | yellow title, **p0** | white, p1 | **FLIP** |
| `infected` | red title, **p0**, chroma 0.1835, fgEv 0.920 | blue, **p1**, chroma 0.1850, fgEv 0.804 | **HOLD** |

`johns` is decisive against the chroma reading: the family it displaces is **achromatic**
— exactly the class the display-text grant exists to displace — so no chroma test can
protect it. What protects it is that the white wordmark is the artwork's **top** identity
obligation and the red that displaces it is **p4**.

So the bound is not a colour test at all:

> The display-text grant may not be used to outrank the artwork's own identity ordering.
> A family may take the foreground over anything it already outranks, and over nothing it
> does not.

The obligation list is already a ranking of what the artwork *is*, produced by machinery
this arm did not touch. **No new policy constant**, and no threshold — it is an ordering
constraint, so there was nothing to fit.

Measured: `birdsofprey` (**strong** ×4) recovered, 6/6 must-flip kept, blast radius
30.7 % → **23.6 %**.

### Where it stops, measured rather than assumed

I extended the same bound to `placementCredit` — the other site the display-text rule
operates on, where a chromatic family earns the foreground *premium* — expecting it to
recover `johns`. It moves **0 of 140 cases**: wherever the bound denies the premium, the
grant has already denied authority. The change was reverted and the finding recorded in
the comment; the bound belongs at one site only.

That result relocates `johns`: **it is not an identity-objective failure.** Both identity
sites now refuse the red, and the red-foreground treatment still wins — on the quality
axes, `accentFidelity` and `economy`, both reading `signatureAccentRoleScore`. That is
precisely the residual Track O measured (their §"The deciding margins", 0.0088) and
precisely what their proposed review item 3 says nobody should touch without an explicit
verdict. **I have not touched it.**

## 6. `infected`: the residual, and why it is not reachable

`infected` is the one hold the rank bound cannot express, and the instrument says why
plainly. The red album title is obligation **p0**, chroma 0.1835, foreground evidence
0.920. The light blue review keeps is **p1**, chroma 0.1850, foreground evidence 0.804.

The blue is *marginally more chromatic*, *lower ranked*, and *worse text* on every
measured axis, and review (batch 23, **strong**) keeps it in the foreground anyway. So the
verdict is that a **secondary** identity direction should hold the text role over the
**primary** one. Nothing in the current evidence expresses that, and any rule that did
would be fitted to this artwork. **I am reporting it as the residual open case rather than
forcing it** — which is also what Track T concluded from the other direction.

## 7. Track T's stroke veto: not composed, and why

The brief asked for T's one-sided stroke veto in the stack. **I did not compose it**,
because T's own round-2 measurement falsifies it on the acceptance list this arm was given,
and that measurement post-dates the brief:

- On the challenger axis, a **wanted** flip (`014fb430` EL JOSI gold) sits at
  `strokeLikeShare` **0.023**, *below* three of the four must-holds (MÚSICA 0.077, `johns`
  0.116, MÚSICA-2 0.152).
- The only threshold that buys 5/6 positives and 4/4 holds is **0.154**, off a **1.03×**
  gap between 0.152 and 0.156. That is a two-decimal-place fit to two artworks — the
  mistake T's own lettering arm made twice.
- The corpus distribution (2 446 family rows, 95 artworks) is bimodal **with no valley**,
  and the upper mode is an artefact of a ratio with no support requirement.

Adopting it would have meant picking a threshold from cases rather than from a
distribution, which the campaign's discipline forbids. T's recommendation was explicit:
*"do not build the composed sweep on the stroke veto."* I followed it and recorded the
reason instead of quietly skipping the work.

## 8. Attribution of everything that moved

For the recommended stack (`w-o-rank`, 33 movers):

| | |
| --- | --- |
| changed, carries a standing verdict | **22** |
| changed, unseen artwork | 11 |
| unchanged, carries a standing verdict | **73** |

Of the 22: **6** are the endorsed must-flips; **3** are the FREE cases
(`vvbrown`, `01/…01c08189` PROJETO, `06/…06eb2197`) where both sides are endorsed; **3**
are the known holds (`johns`, MÚSICA, `infected`). That leaves **10 verdict-carrying
artworks moved as collateral**, listed in full by `verdict-audit.ts` — including
`havana` (**strong**), `07/…075841f6` (**strong**), `08/…087b1314` (**strong**),
`0e/…0e229142` (**strong**) and `02/…02f9f581` (acceptable, and its move to `#c5ab20` is
the turmeric case Track O's calibration lists as *wanted*).

I judged these as collateral because they are frozen reviewed outcomes, which is the
guardrail I was given — **not** because I viewed them and decided the colours are worse.
Several may well be the same class review asked for; that is what a review batch is for.

## 9. Acceptance scorecard

| | want | recommended stack (`w-o-rank`) |
| --- | --- | --- |
| `05/…0005a918` OVER FLOW | `#f0d732` | `#f0d732` ✅ |
| `0a/…0a392cb5` HOPE | `#ffd800` | `#ffd800` ✅ |
| `09/…9d178a` BASSDRUM | `#15a6a9` | `#15a6a9` ✅ |
| `0e/…0e91d6c3` NADA | `#fbf072` | `#fbf072` ✅ |
| `01/…014fb430` EL JOSI | gold family | `#fdd891` ✅ *(same family as `#fbd17f`, Δ0.022)* |
| `13/…13bebcae` gold record | `#d5c47f` | `#d5c47f` ✅ |
| `johns` | hold `#f7f8fa` | `#ff5a62` ❌ |
| `birdsofprey` | hold `#030102` | `#030102` ✅ |
| `04/…04ccf0ae` MÚSICA | hold `#d1e4d0` | `#35710f` ❌ |
| `infected` | hold `#49b7f6` | `#e24852` ❌ |

**6/6 must-flip, 1/4 must-hold.** EL JOSI — the case flagged as known-fragile — **does
flip**, and without special handling; its foreground family is right. Its accent lands on
`#b1a6b4` rather than the endorsed red `#fd332f`, which is the candidate-generation gap
Track O already escalated (no red exists in that artwork's slate at all), not a role
failure.

## 10. Honest assessment

**Achieved**

- A parametric resolution-relative `resolved` and component floor whose default is
  **provably** the historical arithmetic (early return on the literal, 34/34 parity
  fixtures byte-identical), with the reference taken from the corpus distribution.
- A structural confirmation that the reformulation does exactly what it claims:
  **0 of 56 cases move at the reference resolution**, 35.3 % below it, 18.2 % above.
- Two decisive negatives: the relative `resolved` costs 17.1 % solo and **+12.8 points**
  composed for **zero** acceptance movement; the relative floor costs a **strong** and
  buys nothing, which *defends* the absolute `12` as correct rather than an oversight.
- One positive the brief did not ask for: the incumbent asymmetry is an **obligation-rank**
  bound, not a chroma bound. Recovers `birdsofprey` (**strong** ×4), keeps 6/6 must-flip,
  cuts Track O's blast radius by 7.1 points. No new constant.
- `johns` relocated by measurement out of the identity objective and into the quality
  axes, with the second identity site measured **inert (0/140)** and reverted.
- Track O's rule independently reproduced on a differently-built 140-case set.
- Determinism verified (3 runs × 4 artworks), typecheck clean, architecture and
  configuration tests **9/9**.

**Not achieved**

- **The assigned mechanism does not earn its place.** Nothing in the acceptance list moves
  because of it, in either direction.
- Three of four must-holds still break. `johns` needs a verdict on
  `signatureAccentRoleScore` before anyone may touch it; `infected` is not expressible;
  MÚSICA is broken by *four* independent mechanisms now and may simply be fragile.
- 23.6 % blast radius is still high, and 10 verdict-carrying artworks move as collateral.
  The stack is **not** recommended for integration as-is.
- The stroke veto was not composed (§7). That is a reasoned refusal, but it is still an
  assigned item not delivered.

**Uncertainty**

- The `exponent = 1` setting is derived from how population scales under rescaling, but
  `resolved` arguably does two jobs — "is this element compositionally deliberate"
  (relative) and "do we have enough pixels to trust it" (absolute). Exponent 1 replaces the
  second with the first rather than serving both. A product of the two was **not** tried;
  it would be a new mechanism, not a reformulation, and the acceptance set gives no
  evidence it would help.
- The rank bound is validated on the verdict-backed set plus a 140-case radius count. Its
  premise — that the obligation ordering is trustworthy — is inherited, and Track G and
  Track O have both filed nomination failures against that machinery.
- MÚSICA's `#d1e4d0` may be a knife-edge outcome rather than a robust hold: it is broken by
  the relative `resolved`, by the relative floor, by Track O's rule, and by this stack.
  That pattern is worth a human look on its own.

## Proposed review items

1. **`infected`, explicitly on the ranking.** The red title is the artwork's `p0` identity
   obligation and the blue is `p1`; the blue is *less* chromatic in the palette's own terms
   and reads worse as text on every measured axis. Batch 23 kept the blue (**strong**).
   *Is the blue right because it is the artwork's field-mate rather than its title?* If so,
   the rule the stack is missing is about field relationship, not typography — and that is
   a different arm. This is the single highest-value question for the class.
2. **MÚSICA AMBIENTE `04/…04ccf0ae` — is `#d1e4d0` robust?** Four independent mechanisms
   move it, each to a different green. Confirming the white caption is genuinely wanted
   (rather than the incumbent everyone keeps colliding with) tells the next arm whether to
   protect it or release it.
3. **The 10 collateral movers.** `havana`, `07/…075841f6`, `08/…087b1314`,
   `0e/…0e229142`, `02/…02f9f581`, `08/…08601958`, `09/…09ee6f68`, `06/…0637ffe8`,
   `08/…083a2d45`, `04/…0442caec` — sampling 5–6 decides whether 23.6 % is mostly the class
   review asked for or mostly damage. Cheapest way to decide integration of the rank bound.
4. **Unblocked and unchanged from Track O:** a verdict on the swapped HOPE palette
   authorises or refuses touching `signatureAccentRoleScore`, which is now the *only*
   remaining lever on `johns`. Track W confirms it independently: both identity sites
   already refuse the red.

## 11. Batch-25 review materials, and a correction to §8

Built at the orchestrator's request into `research/v2-3-eval/data/results/w-batch-before/` and
`w-batch-after/` in the shared checkout (its `data/results/` is gitignored), mirrored here under
`review-batch/`. Nine pairs, manifest at `review-batch/w-batch-manifest.json`. **No runtime change.**

Assembling it required re-mining the live warehouse, which had grown to **169 records** with a new
`review-24-coverage` batch. That re-mine **corrects §8 of this document**, in the rule's favour.

§8 reported "10 verdict-carrying artworks moved as collateral". Checking each mover against its own
recorded correction instead of merely against "it has a verdict":

| mover | what the record actually says | reclassified |
| --- | --- | --- |
| `02/…02f9f581` | review-19 correction asks fg `#c5ab20` ("the main text is visibly yellow gold like turmeric… use that as the foreground instead of the accent"). Rule produces `#c5ab20`. | **matches the correction exactly** |
| `09/…09ee6f68` | review-22 correction asks fg `#f8e0a0` / accent `#f8aebf` ("the main text is vanilla"). Rule produces that swap. | **matches the correction exactly** |
| `04/…0442caec` | review-8 gave **strong** to the collapsed `#0d140d/#0d140d` field; trunk emits the *non-preferred* `#11110f/#112b10`. | **restores the endorsed arrangement** |
| `07/…075841f6` | review-6 gave **strong** to *both* sides; trunk emits one, the rule emits the other. | already endorsed either way |
| `08/…083a2d45` | review-9 gave **strong** to both `v2-2` and `trunk-dca4`; the move goes between them. | already endorsed either way |
| `08/…08601958` | adjudicated by review-24 while this arm was running. | superseded — excluded |
| `08/…087b1314`, `0e/…0e229142`, `havana`, `06/…0637ffe8` | genuinely undecided | **batch-25 items 1–4** |

So of nine assessable movers, **three reproduce a recorded human correction hex-for-hex**, two are
endorsed either way, and four remain open. The honest collateral count is **four, not ten**, and the
integration question is correspondingly narrower. I got this wrong the first time by treating "carries
a verdict" as "review would object", which is the lazier of the two available checks.

Items 5–9 are separate standing questions the same data answers cheaply: MÚSICA's robustness re-ask
(§10 uncertainty), two artworks where a twice-requested accent colour turns out to be **unreachable
as a distinct accent** (every on-slate carrier collapses it onto the foreground — a candidate-generation
gap, not a ranking failure), `johns`' thrice-requested sailor blue (which *is* fully reachable and
loses by 0.0167 of `relationUtility`), and the bisection below.

## 12. Bisection: `0d/…0d5cdbc6` — two regressions, one known class

`review-19-fresh` preferred `v2-2` **strong** over `trunk-k2` on this artwork. Trunk still emits the
rejected palette today, and **none** of this arm's configurations move it — trunk, Track O's rule,
the rank bound and the relative `resolved` all produce `#000000 #000000 #c7c6c1 #cd1227`.

Replayed through the public entry point at all 18 commits touching `research/v2-3/src`
(`bisect.sh`, template: track-q):

```
c9395ac … b8cffce   #000000 #000000 #f7de67 #f22632     (v2-2 duplicate + 2 commits)
f0d7705             #000000 #000000 #f7de67 #c7c6c1     <- accent lost
4cd3dee … 979c245   #000000 #000000 #c7c6c1 #cd1227     <- foreground lost
```

**Two independent regressions, not one:**

1. **`f0d7705` — "integrate Track A winner-ranking refinements (reviewed)"** takes the accent from the
   bright red `#f22632` to the grey `#c7c6c1`.
2. **`4cd3dee` — "integrate Track C authorized identity (reviewed)"** then moves that grey into the
   **foreground**, displacing the yellow `#f7de67`, and returns a darker red `#cd1227` as accent.

**Decisive term, confirmed by toggle:** forcing `authorizedGain = 0` in `base-scoring.ts` restores the
endorsed yellow foreground (`#000000 #000000 #f7de67 #c7c6c1`). This is the **same commit and the same
term** track-q attributed its KOLIN regression to — a second instance, on a different artwork.

The scored slate makes the mechanism explicit. All four arrangements are on-slate:

| arrangement | `rel` | `qual` | identity contribution |
| --- | --- | --- | --- |
| **winner** grey fg / `#cd1227` | **0.8019** | 0.7326 | **+0.0693** |
| yellow fg / `#cd1227` | 0.7649 | 0.7363 | +0.0286 |
| grey fg / `#f22632` | 0.7576 | 0.7397 | +0.0179 |
| **endorsed v2-2** yellow fg / `#f22632` | 0.7434 | **0.7434** | **0.0000** |

**Quality prefers the endorsed palette** (0.7434 against the winner's 0.7326). The winner wins entirely
on identity, and the endorsed arrangement earns *exactly zero* identity gain — because its chromatic
foreground can earn no authority. That is Track O's site 2, reproduced arithmetically on a new artwork.

**Classification: a principled change that loses here, inside a known open class, by a route no arm
has addressed.** The class is the neutral-foreground bias (Track O's, batches 18/20). The route is not
the one Track O's display-text grant repairs: that grant is gated on `requiredRole === "foreground"`,
and the yellow never earns that label, which is why O's rule and my rank bound both leave the case
untouched. The route here is the `authorizedGain` addend — a treatment buys identity authority by
moving chromatic colour *out* of the foreground, which is the bias stated as an objective rather than
as a classifier. Track C's authorized identity is reviewed and principled; on this artwork it pays
0.0693 for precisely the arrangement review rejects.

Not a new class, then — but a **new sub-route within it**, and the one that matters, because it is
reachable by neither of the two mechanisms this saga has built. Filed as batch-25 item 9. The accent
half (`f0d7705`) is a genuinely separate defect and is not diagnosed here.

## 13. Final assessment after batch 25 — the rule parks at 10/10

Batch 25 (`review-25-decisions`, live warehouse now **179 records**) settled the positive side
completely, and it is **10/10 with nothing against**:

| | outcome |
| --- | --- |
| the six endorsed foreground flips | all six produced |
| `0e/…0e229142` | **AFTER strong** (+ correction fg `#f7e652`) |
| `havana` | **AFTER strong** |
| `08/…087b1314`, `06/…0637ffe8` | **EQUAL strong** — both sides endorsed |

Verified against the final config: all six flips land on the endorsed hex, both AFTER-strong items
land on the endorsed hex, both EQUAL items are endorsed either way.

**The verdict on the negative side is that it does not close.** Two of the three broken holds were
re-anchored by batch 25 and neither is protectable by principled means; the third is not an identity
failure at all. Itemised, because §9 gave the count without the reasons:

| hold | status under the final config | why |
| --- | --- | --- |
| `birdsofprey` | **HELD** ✅ | its black title is obligation `p0`; anything chromatic taking the foreground displaces it, so the rank bound denies the grant. This is the bound's own contribution. |
| `johns` | **breaks** ❌ | **not an identity failure.** Its white wordmark *is* `p0` and the red *is* `p4`, so the bound already denies the grant — and the flip happens anyway. |
| `04/…04ccf0ae` MÚSICA | **breaks** ❌ | **the white caption is not an obligation at all.** The bound has nothing to bind. |
| `infected` | **breaks** ❌ | the red title is `p0` and the blue review keeps is `p1`. The bound permits what the artwork's own ranking permits. |

### `johns` — measured out of the identity objective, twice

The rank bound denies the grant, so the flip must be bought elsewhere. Both remaining sites that read
the classifier's foreground verdict were bounded and swept:

| variant | cases moved vs the one-site bound |
| --- | --- |
| bound the foreground **premium** in `placementCredit` | **0 of 140** |
| bound the **role-matched target** as well | **1 of 140 — and the wrong way** |

The second variant's single move is `04/…0442caec` reverting from the collapsed field review-8
endorsed **strong** to the arrangement it rejected. So extending the bound is not neutral, it is
negative, and neither variant touches `johns`. **The bound belongs at exactly one site**, which is
where it is. `johns`' red is decided on `accentFidelity`/`economy` via `signatureAccentRoleScore` —
the lever Track O's review item 3 says nobody may touch without an explicit verdict. Not touched.

### MÚSICA — Flo's droplet hypothesis is right, and not actionable

*"maybe what the algorithm is picking up on to yield a Lawn green foreground is the shadow of the
many droplets on top of the leaf."* Measured (`probe-blend.ts`, `probe-shadow.ts`):

**The hypothesis is confirmed.** `shadowRayFrac` — OKLab distance from a family's prototype to the
nearest "field colour scaled toward black" ray, i.e. how exactly it is a *shading variant* of a
field — puts MÚSICA's foreground green at **0.0078**, essentially on the shadow ray, against
`infected`'s red title at **0.2834**, thirty-six times further. The statistic sees precisely what
the reviewer described.

**Track F's existing machinery cannot express it**, for two independent structural reasons, and
`absorbedFieldFamilyIds` is empty on all four holds:

1. `opticalBlendFamilyIds` returns early unless the two field anchors are `minimumFieldSeparation`
   = 0.3 apart. MÚSICA's anchors are `#4d8a16` and `#65a81f` — two shades of the same leaf —
   **0.0927 apart**, 3.2× below the gate. A single-hue artwork never reaches it.
2. Absorption looks for *interpolations between* the anchors. A shadow is an *extrapolation past*
   one of them: the green sits at chord position **−0.885**, outside `[interiorMargin, 1−interiorMargin]`
   by construction. Track F's geometry is the wrong geometry for shading.

**And a shading veto does not survive the corpus.** Over 442 identity obligations on 103 unscrambled
artworks the admissible threshold window is bounded below by MÚSICA's green (0.0078, must veto) and
above by **`birdsofprey`'s black title (0.0222, must spare)** — a **2.85×** window. The distribution
has **no valley**: it decays monotonically from a spike at zero (83 obligations in the first bin),
and any threshold inside the window vetoes **29–36 % of all obligations**. Near-blacks are degenerate
on this statistic — every ray toward black passes near them — and so is any family that is itself a
field anchor: HOPE's yellow, the flagship endorsed flip, scores **0.0000** because it *is* the field.

So: a principled discount exists in principle and is now specified, but it is a **new mechanism with
a corpus problem**, not a statistic the runtime already has. It is the right next arm and it is not
this arm's to ship. The trap is documented above so the next arm does not walk into it.

### `infected` — unchanged residual

Neither asymmetry protects it, and this was verified rather than assumed: the chroma variant
(`w-o-asym`) and the rank bound (`w-o-rank`) both flip it. The reason is visible in one row — the red
is `p0` at chroma 0.1835, the blue is `p1` at chroma **0.1850**. The blue is *marginally more
chromatic*, *lower ranked*, and worse text (fgEv 0.804 against 0.920), and review keeps it anyway.
The shading statistic does not help either: the red at 0.2834 passes any veto that spares
`birdsofprey`. There is no measurable property; a rule that produced this would be fitted to one
artwork.

### Verdict

**Both re-anchored holds are NOT protectable by principled means, so the rule parks.** The final
config is unchanged from §5 — Track O's display-text grant plus the single-site obligation-rank
bound — carrying **10/10 on its positive side, 1 of 4 holds, and 23.6 % blast radius on 140 cases**.
Recommended for integration only if review accepts `johns`, MÚSICA and `infected` as known open
cases; otherwise it waits on the shading arm (MÚSICA) and a field-relationship account (`infected`).

## 14. Report only — what the two remaining preferences would need

Neither is a weight nudge; the fitted-weights refusal rules those out and neither would be fixed by one.

**`johns`' sailor-blue surface (batch-25 item 8, AFTER strong, loses by 0.0167 `relationUtility`).**
This is a **collapse-arbitration** question, not a ranking-weight one. The winner is
`collapse=[true,false]` — the surface is collapsed onto the background — and the endorsed arrangement
is `collapse=[false,false]` with the same foreground and accent. `#315a92` is obligation `p3` at
**12.99 %** of pixels with standing identity evidence, so the artwork demonstrably has a second field
colour and the objective is choosing to not use it. The lever is the rule that lets a collapsed
surface skip fidelity — `WINNER_RANKING_HYPOTHESES.fieldOwnershipBeforeCollapseEconomy` substitutes a
constant for a collapsed surface's fidelity, which is exactly what makes collapse cheap. A principled
arm would make a collapsed surface *justify itself* against any second field family that carries
identity standing, rather than receiving a constant. Structural, and testable against charter rule 5's
symmetry requirement (an incorrectly released collapse is as bad as an incorrectly kept one).

**`0d/…0d5cdb`'s third arrangement (fg `#f1b73c` gold, accent `#cd1227`).** Two separate levers, and
the first one is not a ranking lever at all:

1. **`#f1b73c` is not on the slate.** `find-treatment` finds no treatment carrying it among 1054
   scored. So the endorsed gold is a **candidate-generation** gap — the same class as `0f/…0f8156`'s
   and `0c/…0cd48f`'s unreachable pinks, now three artworks. The reachable gold is `#f7de67`, which
   batch 25 rated acceptable.
2. For the *reachable* gold, the lever is the one §12 bisected: `authorizedGain`. The endorsed
   arrangement earns **exactly zero** identity gain because its chromatic foreground can earn no
   authority, while the grey-foreground winner collects **+0.0693** — and quality already prefers the
   endorsed palette (0.7434 against 0.7326). This is Track O's site 2 again, but by the
   authorized-identity route rather than the role-classifier route, so neither the display-text grant
   nor the rank bound reaches it: both are gated on `requiredRole === "foreground"`, which this yellow
   never earns. The lever is **authority symmetry on a different qualifying test** — some account of
   "this chromatic family is the artwork's subject" that does not route through the role classifier.
   No weight change would do it; the term is zero, not small.

## Reproducing

```sh
# case set (writes cases.json)
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/build-cases.ts

# configuration, sweep, collate  (3 workers, VIPS_CONCURRENCY=1, resumable)
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/set-config.ts <resolvedExp> <floorExp>
sh research/v2-3-experiments/track-w/sweep.sh <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/collate.ts <label>

# analysis
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/diff.ts trunk-979c245 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/analyze-scale.ts trunk-979c245 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/verdict-audit.ts trunk-979c245 <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/check-parity.ts <label>

# batch-25 materials (runtime must be at 979c245 for the `before` side and items 6-9)
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/build-batch.ts winners <label> <outDir> <case>...
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/build-batch.ts treatments <label> <outDir> [caseFilter]

# historical bisection of one artwork (swaps research/v2-3/src per commit, restores on exit)
sh research/v2-3-experiments/track-w/bisect.sh <imagePath>

# shading statistic (droplet hypothesis): per-artwork geometry, then the corpus distribution
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/probe-blend.ts <case>...
sh research/v2-3-experiments/track-w/shadow-sweep.sh

# instruments
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/inspect-evidence.ts <case>...
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/find-treatment.ts <image> --want bg,sf,fg,ac [--top N]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/extract-one.ts <imagePath>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/inspect-obligations.ts <case>...
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/determinism.ts <case>...
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-w/measure-resolution.ts
```

`data/<label>.json` are the collated sweeps; the per-case shard directories are gitignored.
Labels: `trunk-979c245` (baseline, = trunk), `w-resolved-e1`, `w-floor-e1`, `w-o-display`,
`w-o-asym` (chroma variant), `w-o-rank` (**the parked candidate**), `w-o-rank2` (the inert
`placementCredit` premium extension, byte-identical to `w-o-rank`), `w-rank-both` (the role-target
extension — one case, wrong way), `w-full`, `w-final` (the shipped config, byte-identical to
`w-o-rank`; it exists to prove the two reverts restored it exactly).
`data/shadow/` holds the 442-obligation shading survey.

## Runtime state on this branch

1. `policy.ts` — new `regionScale` block, **default `0`/`0` = reviewed behaviour exactly**.
2. `palette-core.ts` — `resolvedDenominator` at the two `resolved` sites, and the scaled
   noise-floor arm in `markSupportOf`.
3. `base-scoring.ts` — Track O's display-text grant (their patch, unmodified) **plus** the
   obligation-rank bound `displacesStrongerObligation`.

Items 1 and 2 are inert at their defaults (34/34 parity fixtures). Item 3 is the
behavioural change and is the only part I recommend for review.

The chroma-variant ablation (§5) required plumbing each obligation's prototype chroma into
the identity objective. Once the rank bound superseded it that plumbing was dead code, so
it was **removed**; the ablation's sweep survives as `data/w-o-asym.json`, and re-deriving
it is a three-line change. Removal verified behaviour-preserving: 0 of 140 cases move
between `w-o-rank` and `w-o-rank-clean`.
