# Round 3 — the pruning stage, and the `skap` rule for ordinary coverage

Continues `EXPERIMENT.md` and `ROUND-2.md`, from trunk `9983a1e`. Same corpus custody: every
artwork measurement is from the shared checkout `/Users/Flo/GitHub/palette/`, full resolution,
`VIPS_CONCURRENCY=1`, at most two extraction processes at a time.

---

## J1. The `0cd48f` publish-vs-rank divergence, isolated

**The overriding stage is `dominates()` — Pareto pruning inside `scorePaletteCandidates` — and it is
neither source eligibility nor transition promotion.**

`probe-stages.ts` runs all three rankings separately. At `FOREGROUND_CONTRAST_SCALE = 9` (the
configuration where round 2 made the endorsed teal the objective maximiser):

```
candidates 1045   source-eligible 840
full-domain   compare-order #1 : #ffffff #ffffff #a7dbd9 #bdf369  (pareto false)
full-domain   frontier[0]      : #ffffff #ffffff #71af70 #9fdfe1   [frontier size 56]
eligible      compare-order #1 : #ffffff #ffffff #a7dbd9 #bdf369  (pareto false)
eligible      frontier[0]      : #ffffff #ffffff #71af70 #9fdfe1   [frontier size 53]
PUBLISHED                      : #ffffff #ffffff #71af70 #9fdfe1
```

The endorsed teal is **compare-rank 1 in both the full domain and the eligible subset** — it is
source-eligible, it is not touched by promotion, and it maximises `relationUtility` outright. It is
excluded because `paretoMember` is **false**. `scorePaletteCandidates` returns
`winner = frontier[0]`, the top *Pareto member*, not `evaluations[0]`.

*(This also corrects a reporting error in rounds 1–2: I quoted "rank" from `evaluations`, which is
the `compare` order. That is not the winner. A candidate can be rank 1 and unpublishable.)*

### J1.1 What dominates it, and why that is the principled question

Eight candidates dominate the endorsed teal. The probe printed the three highest by compare order,
and **all three score lower on the objective** (the teal maximises `relationUtility` over the whole
domain, so no dominator can score higher):

| dominator | `relationUtility` | `identityCoverage` | strictly better levels | but worse RAW on |
|---|---|---|---|---|
| target `#a7dbd9 #bdf369` | **0.82280** | **1.0000** | — | — |
| `#201f41 #b7f07d` | 0.80853 | 0.4762 | artworkIdentity, accentFidelity, accentPath | representativeness, sourceSupport |
| `#71af70 #b7f07d` | 0.80516 | 0.4286 | artworkIdentity, accentFidelity, accentPath | representativeness, sourceSupport |
| `#93bfc2 #bdf369` | 0.80389 | 0.2857 | artworkIdentity, accentFidelity | representativeness, sourceSupport |

Three things this makes precise:

1. **Domination is decided on quantized levels, not on values.** Every dominator is *worse in raw
   value* on `representativeness` and `sourceSupport` and wins only because those differences fall
   inside one `evidenceResolution` (0.04) band while three others cross a boundary.
2. **Ordinary `identityCoverage` guards nothing.** It is not in `WINNER_QUALITY_AXES`; identity
   enters `dominates` only through `identityAuthorizedGain`, and here target and dominators carry
   the **identical** 0.01143, so the `authorizedIdentity` guard is a no-op. The artwork's only
   complete-identity palette is pruned by palettes covering 29–48 % of it.
3. **This is the failure `authorizedIdentity` was written for, in the half it deliberately left
   open.** Its own comment says coverage *"neither guards domination (so an identity-superior
   treatment can be pruned off the frontier by a treatment that omits a major family)"* — and fixes
   it for the **authorized** part only, for good reasons that were reviewed. But authority requires
   `chroma >= identityDirectionChroma` (0.06), and this artwork's **priority-0** obligation is the
   teal at chroma **0.0537** — just under. A near-neutral identity direction therefore earns no
   authority *by design*, and so receives **no domination protection at all**.

**The principled question for review:** should a treatment that covers *every* identity obligation
the artwork raised be prunable by treatments that cover fewer, purely on quantized quality levels?
The current answer is yes whenever the artwork's directions are sub-chromatic. I am not proposing
the fix — widening `dominates` is exactly the change `authorizedIdentity` measured and narrowed once
already, and it needs the reviewed-strong set swept behind it.

### J1.2 It holds at trunk, and it is the reason ranking levers are the wrong layer

At trunk (`FOREGROUND_CONTRAST_SCALE = 90`) the endorsed teal is compare-rank 18 and **also
`paretoMember: false`**. So the pruning is not an artefact of round 2's scale experiment.

The consequence is the answer the coordinator asked for: **no lever that makes the scalar objective
prefer this palette can publish it.** Round 2 already produced a configuration where the teal is the
objective maximiser by the largest margin in the domain, and it still did not publish. Any fix for
`0cd48f` must act on `dominates()` — or on the quantization it prunes with — not on weights, not on
identity gain, not on the contrast scale.

### J1.3 How often the stage overrides the objective, corpus-wide

`sweep-divergence.ts` over the 141-artwork verification set at trunk `9983a1e` (the baseline dump
reproduces trunk exactly — `0d5cdb` `#f7de67`, `0cd48f` `#201f41`, `krafty` `#f7a223`, `slim`
`#37c2eb`, `03e50500` `#cfd4c0`):

| measurement | value |
|---|---|
| artworks where the objective maximiser is **pruned off the frontier** | **18 / 141 (12.8 %)** |
| mean `relationUtility` given up when it happens | 0.01429 |
| of those 18, artworks carrying a human verdict | 14 |

**This is not a `0cd48f` quirk. It happens to one artwork in eight, and it cuts both ways.**

**Domination discards the endorsed palette on three artworks, all `strong`** — in each, the pruned
objective maximiser *is* the palette review endorsed:

| artwork | endorsed = pruned objective maximiser | published instead |
|---|---|---|
| `…000e91d6` | `#383838 #1a1a1c #fbf072 #f94d37` | `#383838 #1a1a1c #e1ddda #fbf072` |
| `havana.jpg` | `#375c77 #243a51 #eed076 #ee655f` | `#375c77 #243a51 #e1824a #eed076` |
| **`slim.jpg`** | **`#01040b #140e18 #56676f #df2a33`** | `#01040b #140e18 #37c2eb #df2a33` |

**Domination saves the endorsed palette on ten of the fourteen** — including `johns.jpg`, whose
`#315a92` surface is a named batch-26/27 guardrail, and `0d5cdb`, where the pruned maximiser is the
grey `#c7c6c1` that batch 28 rejected. So the stage is load-bearing in both directions and cannot
simply be removed; that is exactly why this is a diagnosis and not a proposal.

### J1.4 `slim` is a domination artefact, not an M1 preference

The `slim.jpg` row above is the batch-28 cost the coordinator logged against M1, and it has a
different cause than I assumed when I defended it in round 1.

At trunk *with M1 shipped*, the endorsed `#56676f` arrangement **is the objective maximiser** — it
wins `relationUtility` by 0.00486, with `identityCoverage` **0.9048** — and it is published only as
`#37c2eb` (coverage **0.1905**) because `dominates()` prunes it. It is dominated by exactly two
candidates, both `#37c2eb` variants, both scoring **lower** on the objective, and both winning on
**one quantized axis: `foregroundPath`** — while being worse in *raw* value on `representativeness`.

I first guessed the mechanism and was wrong (I assumed M1 raised a competitor's authority; the two
sides carry the **identical** 0.00762). Measured instead, by re-running `slim` at the pre-M1
configuration (`--demotion raw-score --skap count-every-credit`):

| configuration | `#56676f` compare-rank | `paretoMember` | published |
|---|---|---|---|
| pre-M1 (`raw-score`) | 1 | **true** | `#56676f` — the endorsed palette |
| trunk, M1 shipped | 1 | **false** | `#37c2eb` |

The chain is exact:

1. Pre-M1, `demotesBetterText` withheld authority from the `#37c2eb` arrangement's credited accent
   obligation (family-6480, `foregroundEvidence` 0.8630, against the placed foreground family-8092's
   0.7261 + the 0.04 margin).
2. That left `#56676f` with a strictly **higher** `identityAuthorizedGain`, and the `authorizedIdentity`
   guard in `dominates()` — `if (authorized(first) < authorized(second)) return false` — used it to
   **block** `#37c2eb` from dominating.
3. M1 narrowed the guard correctly: family-6480 is *not* this artwork's strongest text claim
   (family-5490 at 0.9341 is), so the withholding was misdirected on its own terms and stopped.
4. Both sides now carry 0.00762, the block is gone, and `#37c2eb` prunes the endorsed palette on a
   single `foregroundPath` level boundary.

**So `authorizedIdentity` was accidentally protecting `slim`'s endorsed palette, and M1 removed that
protection.** The withholding was wrong for the reason M1 identified; its side effect was right.

**Consequence: if ordinary `identityCoverage` guarded domination — 0.9048 against 0.1905 — `slim`
would be protected for the right reason, and would return to the endorsed palette without reverting
M1.** That is the same fix J1.1 points at from `0cd48f`, now with a measured cost attached to *not*
doing it. I am not proposing it here: it widens `dominates`, which needs the reviewed-strong set
swept behind it, and this arm has no budget left for that sweep.

---

## J2. The `skap` rule for ordinary identity coverage

**Implemented, measured, and it ships OFF (`IDENTITY_COVERAGE_DIRECTIONS = "count-every-credit"`).**
It changes none of the three artworks that motivated it, and over the 141-artwork set it moves five
(four `strong`) on genuinely split evidence. Zero demonstrated benefit at trunk against four
verdict-carrying movers is review's call, not an arm's — and unlike round 2's questions, these are
**four real A/B pairs** (J7).

`identityDirections` states the rule in general terms — *"two colors of the same hue are one
direction however differently they are mixed, so a treatment cannot spend two roles on one hue and
be credited twice for it (the reviewer's `skap` note)"* — and enforces it only on the **authorized**
half. `numerator` adds every credited role's weight in full, so ordinary coverage still pays a
palette twice for one hue.

The measured instance (round 2, §R3): `0d5cdb` can publish `#000000 #000000 #92071a #f22632` — a
dark red foreground beside a red accent **1.0 degree of hue apart** (family-4694 at 23.5°,
family-6039 at 24.5°) — at `identityCoverage` **0.7143** against **0.5714** for the arrangement
batch 28 endorsed. Both carry the identical `identityAuthorizedGain` 0.02286: that is the authority
half of the rule already working, and the coverage half is what pays for the second red.

### J2.1 Design

Same test, same constant. `credit()` records each contribution instead of adding it immediately;
after both passes, contributions are considered in **descending amount** and a chromatic one within
`identityDirectionHueDegrees` of a chromatic one already kept is refused. So one direction is
credited once, at the **strongest** claim the palette makes for it. Nothing else changes — the
denominator, the priority weights, role agreement, the chromatic-foreground gate and the whole
authority path are untouched.

Two implementation details that are load-bearing rather than incidental:

- **The decision is made after both passes, not greedily inside them** — see J2.1a, which is the bug
  that forced it.
- **The numerator is summed in the original credit order**, not in the sorted order. Floating-point
  addition is not associative, so summing in the sorted order would perturb the last bits and could
  flip an `evidenceLevel` on an artwork the rule is not supposed to touch. `count-every-credit` has
  to be **bit**-identical to trunk, not merely equal.

**Neutrals are untouched in both directions**, by construction rather than by measurement:
`identityDirections` does not treat a colour below `identityDirectionChroma` as a direction at all,
so a near-neutral can neither restate another colour nor be restated by one. Two-colour collapses
and neutral-heavy artworks cannot move.

`count-every-credit` restores the previous behaviour exactly.

### J2.1a A bug I shipped into my own first draft, and the measurement that caught it

My first implementation refused restatements **greedily**, inside the credit loop, and the comment I
wrote claimed "obligations are credited in priority order, so the repeat that is refused is always
the lower-priority one". **That claim was false**, and probing `0d5cdb` caught it immediately:

| arrangement | greedy coverage | why |
|---|---|---|
| `#92071a` fg + `#cd1227` accent | 0.5714 | 6039 (p0, w 1.0) matched exactly in pass one, credited; 4694 (p3) refused — correct |
| `#92071a` fg + `#f22632` accent | **0.1429** | 4694 (**p3**, w 0.25) matched exactly in pass one, credited; **6039 (p0, w 1.0) refused** in pass two |

Pass one (the obligation's own family occupies a role) always precedes pass two (the palette shows
the obligation's colour), *regardless of priority*. So a priority-3 obligation covered exactly
displaced a priority-0 one covered by equivalence, and two arrangements showing the same single red
direction scored 4× apart.

The fix is to decide after both passes and keep the **strongest** claim per direction — which is
what "credited once" ought to mean anyway, and which removes the dependence on pass order entirely.
Ties break on credit order, so it stays deterministic. Both arrangements now score **0.5714**
(`data/scan-0d5cdb-darkred-skap2.json`).

### J2.2 Effect on the three target cases: none

| artwork | trunk published | with the rule | endorsed arrangement's rank |
|---|---|---|---|
| `0cd48f` | `#ffffff #ffffff #201f41 #b7f07d` | **unchanged** | 18 → 17 |
| `0d5cdb` | `#000000 #000000 #f7de67 #f22632` | **unchanged** | — |
| `03e50500` | `#050a06 #121e10 #cfd4c0 #758151` | **unchanged** | 160 → 154 |

(`data/cases-J-skap-final.json`, measured with the final order-independent rule.)

This is expected and worth stating plainly: **none of the three published winners spends two roles
on one hue**, so the rule cannot touch them. The ranks that move do so because *other* candidates
lost the double credit.

**It therefore does not produce the `0d5cdb` A/B pair the coordinator conditioned on.** The dark-red
arrangement only wins under round 2's rejected contrast scale; at trunk it is not the winner either
way, so there is no real pair to review and I am not manufacturing one.

### J2.3 Blast radius, 141-artwork verification set

`data/sweep-skap.tsv` against `data/sweep-trunk9983.tsv` (`data/diff-skap.txt`):

| measurement | value |
|---|---|
| preserved | **136 / 141** |
| moved | **5** |
| of which carry a `strong` verdict | **4** |
| objective maximiser pruned off the frontier | 18 before, **18 after** (the rule does not touch J1) |

Every mover, against the palette its latest verdict actually endorses:

| artwork | trunk | with the rule | reading |
|---|---|---|---|
| `…000442ca` (`strong`, review-8) | `#11110f #112b10 #cafb6e #3fcc28` | `#0d140d #0d140d #cafb6e #3fcc28` | **WIN — lands exactly on `trunk-dca4`, the endorsed side, which trunk currently misses.** The reviewer's note is *"A collapsed background interface works better for that artwork"*, and the rule collapses it. |
| `…0006eb21` (`strong`, review-23) | `#361a05 #220b05 #f5b934 #8a7c33` | `#361a05 #220b05 #bbba8a #8a7c33` | **Lands exactly on `o2-before`, one of the two sides that batch graded `strong`.** It also undoes the M1 mover batch 28 confirmed — both are endorsed palettes, so this is a swap between two reviewed-good answers, not a regression. |
| `…00056471` (`strong`, review-13) | `#131929 #18556a #9ccce0 #5c98ba` | `#131929 #131929 #9ccce0 #5c98ba` | **RISK — neither endorsed side.** Trunk publishes `trunk-h`, which is endorsed; the rule collapses the surface away, and the reviewer's note is *"the artwork does have two different backgrounds so both option A and option B are valid"*. Collapsing removes the second background the note is about. |
| `…000a8aa1` (`strong`, review-21) | `#040301 #491600 #fa8a02 #8f3908` | `#100702 #291107 #fbf809 #fa8a02` | **RISK — the field moves.** Both reviewed options share the field `#040301 #491600`; the rule changes it. The endorsed side is `r-batch-b` (`… #fa8a02 #fbf809`), which trunk also misses, so this artwork is a standing miss either way — but moving the endorsed *field* is a larger step than the rule should be taking. |
| `birdsofprey-scrambled.jpg` | `#181677 #ec3b2b …` | `#1d127b #eb3821 …` | Decoy, background pair shifts. Not artwork; recorded for completeness. |

**Two land exactly on endorsed palettes; two move off endorsed fields.** That is not a result an arm
should adjudicate, and it is why the rule ships off with four real pairs attached.

---

## J3. The Lc-90 scale and the empty adequacy band — designed-elicitation candidate

Round 2 (§R1–R2) established, and I restate here in the shape parked task #36 wants:

**The claim.** `foregroundUtility` ramps APCA contrast linearly to a bare literal **90** and feeds
`foregroundPath` at weight 0.15, the joint-largest role axis. Lc 90 is an accessibility-grade
target. Charter constraint 2 says this library deliberately does not grade for accessibility and
that review has judged Lc ≈ 9 good. The accent already answers the identical question against
`ACCENT_OBSERVABILITY_ADEQUATE_LC = 9`, whose own comment argues the general case (*"the scale is
wrong, not the blend"*) and which was applied narrowly **for blast radius, not correctness**.

**Why it cannot be settled by an arm.** The evidence has a gap, and the gap is the whole question:

| |Lc| | candidate | status |
|---|---|---|
| 102.6 | `0cd48f` `#201f41` | rejected |
| 86.7 | `0d5cdb` `#f7de67` | **endorsed** |
| 77.5–78.9 | `03e50500` `#cfd4c0` | rejected |
| 72.0 | `0d5cdb` `#c7c6c1` | rejected |
| 64.6 | `0d5cdb` `#e4b144` | **endorsed** |
| 34.5–39.2 | `03e50500` `#b67e1f` | **endorsed** |
| **24.3** | `0cd48f` `#a7dbd9` | **endorsed** — lowest endorsed |
| *(13.0 – 24.3: no reviewed evidence)* | | |
| **13.0** | `0d5cdb` `#92071a` | never reviewed; publishes at scale ≤ 12 |

Every endorsed foreground sits at **|Lc| ≥ 24.3**. The one candidate that a low scale promotes and
that looks wrong sits at **13.0**. **Between them there is no reviewed evidence at all.** Any scale
an arm picks from that band is a fitted threshold; the same value chosen by review is a reviewed
constant. That asymmetry is the entire content of the elicitation.

**The one question that resolves it:** *is a foreground at APCA |Lc| 13 acceptable?* A yes says the
foreground ramp should saturate at adequacy like the accent's, and `0d5cdb`'s dark red is not the
counterexample I took it for. A no puts the foreground's adequacy point above 13, and review naming
it is what unblocks `0cd48f` — subject to J1, which says the scale alone was never going to be
enough anyway.

**Not shipped, and no fitted threshold proposed.** The only runtime change round 2 left is the
behaviour-neutral rename of the literal to `FOREGROUND_CONTRAST_SCALE`, still 90, carrying this
argument in the source.

---

## J4. `slim` as a mark-evidence failure — parked characterization

Parked per instruction, with the measurements, for whichever arm next touches `slim`.

Batch 28 rejected `slim`'s `#37c2eb` foreground with *"option B does seem valid, so i'm not mad if
we have to keep it, but aesthetically it's not exactly the vibe of the artwork"*. Round 2 (§R5)
measured the chroma-coherence family and found **no valley** — `03e50500`'s *endorsed* gold
overshoots its artwork's mean chroma by 1.79× on an artwork 11.0 % chromatic, against `slim`'s
*rejected* 1.56× on one 13.7 % chromatic. More overshoot on a less chromatic artwork, endorsed.

What does separate `slim`'s two candidates is **mark evidence**, and by a wide margin:

| `slim` foreground | family | obligation? | `requiredRole` | `foregroundEvidence` | `identityCoverage` |
|---|---|---|---|---|---|
| `#56676f` (endorsed) | family-5490 | **yes** | **`"foreground"`** | **0.9341** | **0.9048** |
| `#37c2eb` (rejected) | family-8092 | no | `"ambiguous"` | 0.7261 | **0.1905** |

`#56676f` is the artwork's strongest text claim *and* the only **positive** foreground
classification anywhere in this arm's verdict set. `krafty` behaves identically (golden mango,
0.9465, strongest, endorsed).

**The characterization:** `slim` is the one case in the set where the algorithm had a
positively-classified text family, with near-complete identity coverage, and moved off it to a
non-obligation carrying 0.1905. That is a mark-evidence failure, and "vibe" is what it looks like
from outside.

**The honest caveat, which is why this is parked and not proposed:** mark evidence **inverts** on
the other three cases — review endorsed `0d5cdb`'s gold at 0.7111 *over* the grey at 0.8990, and
`03e50500`'s gold at 0.5505 (the artwork's *weakest* claim) *over* `#cfd4c0` at 0.8181. So
"prefer the strongest text claim" is not a rule; it is an observation that holds on the two
artworks where review kept the algorithm's foreground and fails on the three where review overrode
it. Anyone who picks this up should treat it as a hypothesis about *when* the classifier is
trustworthy, not as a scoring term.

---

## J5. Verification

Runtime diff against trunk `9983a1e` is two files: `palette-core.ts` (round 2's behaviour-neutral
rename of the `90` literal) and `base-scoring.ts` (the `skap` rule, shipped **off**). Both shipped
settings restore trunk behaviour by construction — `count-every-credit` sums the same contributions
in the same order, so it is **bit**-identical, not merely equal (J2.1).

| check | result |
|---|---|
| typecheck `tsc -p research/v2-3/tsconfig.json` | pass |
| `architecture.test.ts` + `configuration.test.ts` (10 tests) | pass |
| determinism — 6 artworks extracted twice with the rule enabled (`data/det3-a.tsv` vs `det3-b.tsv`) | **identical** |
| trunk baseline sweep reproduces `9983a1e` | spot-checked on `0d5cdb`, `0cd48f`, `03e50500`, `krafty`, `slim` — all match |
| **141-artwork sweep at the shipped defaults vs trunk** | **141 / 141 byte-identical** — winners, gradient flags, midpoints, collapse flags, pruning flags and given-up margins all match (`data/sweep-shipped.tsv`) |

A note on that last row: the shipped sweep returned **151** artworks, not 141. The verification set
is built from the *live* warehouse, and `verdicts.jsonl` gained records while this arm was running
(192 at arm start, 199 by round 3, more since), so ten newly verdict-carrying artworks entered the
set. The comparison above is keyed by artwork, not positional: all 141 artworks the trunk baseline
covers are byte-identical, none is missing, and the ten additions are simply artworks trunk was
never measured on here. Anyone re-running these numbers should expect the set to keep growing.

The two `configure.ts` settings this round adds are pinned in `configuration.test.ts` with the
measurement that decided each, per that file's convention.

---

## J6. Honest self-assessment

**What I got wrong, and what caught it.** Three times this round:

1. **I misreported "rank" for two rounds.** `evaluations[0]` is the top of the `compare` order; the
   winner is `frontier[0]`. Every "rank 15/18/160" in rounds 1–2 was the former. It does not change
   any conclusion in those rounds, but it hid J1 for two rounds, and I should have read
   `scorePaletteCandidates`' last five lines before quoting a rank as a distance-to-winning.
2. **My first `skap` implementation had an ordering bug** that scored two arrangements showing the
   same one red direction 4× apart (0.1429 vs 0.5714), and the comment I wrote asserted the opposite
   ("credited in priority order"). A probe caught it within minutes of writing it. This is the second
   round running in which a comment of mine asserted a property the measurement then refuted; I am
   evidently prone to writing the justification before running the check, and the fix is to run the
   check first.
3. **I guessed the `slim` mechanism and was wrong** (assumed M1 raised a competitor's authority; the
   two sides carry identical authority). Re-running at the pre-M1 configuration gave the actual
   chain. The guess was in a draft, not in the record — but only because I checked.

**What I am confident in.** J1 is a set of direct reads of the real pipeline: the teal is
compare-rank 1, source-eligible, `paretoMember: false`, and its dominators score lower on the
objective — those are printed values, not inferences. The 18/141 rate and the three
endorsed-palette-pruned cases come from a full sweep whose trunk baseline reproduces `9983a1e`
exactly on spot check. The `slim` chain is a controlled A/B on one constant.

**What I am not.** The `skap` rule is argued from a statement the code already makes, but its
*effect* is small and I cannot claim it fixes anything — it changes no target case, and its value is
whatever the 141-set diff shows. I did not attempt the domination fix that J1 and J1.4 both point
at, because it widens `dominates()` — the one thing `authorizedIdentity` deliberately narrowed — and
doing that without a swept reviewed-strong set would be exactly the kind of change this arm has
twice caught itself making badly. Neither mandated case is delivered, and after three rounds that is
the headline: **`0cd48f` and `03e50500` are not blocked by the objective, they are blocked by
pruning and by generation respectively**, and both blockers are outside the layer I was asked to
work in.

---

## J7. Proposed review items

Four items, and **all four are real A/B pairs** — the complete mover set of the `skap` rule on
verdict-carrying artwork. They decide one thing: whether
`IDENTITY_COVERAGE_DIRECTIONS = "one-hue-one-direction"` should be enabled. Nothing else this round
needs a review slot; J1, J3 and J4 are diagnosis, elicitation and a parked characterization.

Both sides of every pair are real extractions from this branch, one constant apart
(`configure.ts --skap count-every-credit|one-hue-one-direction`). I can build them as label sets on
request.

| # | artwork | A (trunk `9983a1e`) | B (rule enabled) | what it decides |
|---|---|---|---|---|
| 1 | `…000442ca` | `#11110f #112b10 #cafb6e #3fcc28` | `#0d140d #0d140d #cafb6e #3fcc28` | **The rule's best case.** B is `trunk-dca4`, the side review-8 graded `strong` and which trunk does **not** publish; the note is *"A collapsed background interface works better for that artwork"*. If B wins, the rule recovers a standing miss. |
| 2 | `…00056471` | `#131929 #18556a #9ccce0 #5c98ba` | `#131929 #131929 #9ccce0 #5c98ba` | **The rule's worst case.** A is endorsed (`trunk-h`); B is neither endorsed side and collapses away the second background the reviewer's note calls *"a valid interpretation"*. If B loses, the rule stays off. |
| 3 | `…0006eb21` | `#361a05 #220b05 #f5b934 #8a7c33` | `#361a05 #220b05 #bbba8a #8a7c33` | **A swap between two palettes review already graded `strong`** (`o2-after`'s colours vs `o2-before` exactly). Also undoes the M1 mover batch 28 confirmed, so a preference here is a direct comparison of the two shipped mechanisms on one artwork. |
| 4 | `…000a8aa1` | `#040301 #491600 #fa8a02 #8f3908` | `#100702 #291107 #fbf809 #fa8a02` | **The field question.** Both reviewed options share A's field; B moves it. The endorsed side (`r-batch-b`, `… #fa8a02 #fbf809`) is published by neither, so this artwork is a standing miss either way and B has to be judged on its own. |

**My read, for what it is worth:** I expect 1 and 3 to favour B and 2 to favour A, which would leave
the rule roughly even and correctly off. If 2 and 4 both favour B I was too conservative and it
should ship.

**Not asked for as review items, deliberately:** the J1 pruning question needs a swept mechanism
before it is worth a slot, and J3 is a designed-elicitation candidate for parked task #36 rather
than an A/B.

---

## J8. Batch labels built (round 4 close-out)

The four pairs above were built into the harness `CachedResult` schema on trunk `af19cf9` and
mirrored into the shared checkout at `research/v2-3-eval/data/results/` (gitignored there — a
regenerable cache — so this branch carries the builder, not its output).

| label | files | what it is |
|---|---|---|
| `sk-off` | 4 | trunk `af19cf9`, rule disabled. Real extractions; byte-identical to trunk on all four. |
| `sk-on` | 4 | rule enabled. Real extractions, one constant apart. |

All 8 records are midpoint-free, so **none carries a `researchRender` key** — including the two
gradient records (item 4 on both sides). `sk-manifest.json` carries the per-item latest verdicts,
the honest read per item, the joint-reporting caveat about a future domination guard, and the
overall read. Validated with `validate-results.ts` (custody cross-checked against existing warehouse
label sets for the same four images) and `check-manifest.ts` (8 side references consistent).
