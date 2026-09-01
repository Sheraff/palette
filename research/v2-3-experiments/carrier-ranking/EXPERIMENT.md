# Carrier ranking — why an endorsed carrier that is *on the slate* still loses

> **Round 2 continues in [`ROUND-2.md`](./ROUND-2.md)** — the two cases batch 28 made
> verdict-mandated (`0cd48f` teal, `03e50500` band-name gold), the contrast-scale finding and why it
> is not the lever, and the report-only answer on the `slim` vibe discriminator. Round 2 ships no
> behaviour change.
>
> **Round 3 continues in [`ROUND-3.md`](./ROUND-3.md)** — the stage that overrides the ranking
> isolated (`dominates()`, 18 of 141 artworks, and it discards the endorsed palette on three
> `strong` ones including `slim`), the `skap` rule for ordinary coverage implemented and measured
> (ships **off**, four real review pairs), and the Lc-90 adequacy-band elicitation. Round 3 ships no
> behaviour change either.
>
> **Round 4 continues in [`ROUND-4.md`](./ROUND-4.md)** — the coverage domination guard, measured
> and **not built**: it cannot reach `0cd48f` for a structural reason, and no monotone coverage rule
> separates the wrongly-discarded maximisers from the correctly-discarded ones, because `0d5cdb`'s
> rejected grey is more extreme on every feature than `havana`'s endorsed palette. No valley, no
> mechanism.
>
> **Correction that applies to rounds 1–2:** where those rounds quote a candidate's "rank", that is
> its position in the `compare` order (`evaluations[0]`), **not** its distance from winning. The
> winner is `frontier[0]`, the top *Pareto member*. See ROUND-3 §J1.

Arm branch `worktree-agent-a02241df33f1b2a0d`, from trunk `d11ac6c`.
(The worktree checked out at the stale `bb979dc` and was reset to `d11ac6c` before any work.)

**Corpus custody.** Every artwork measurement in this document was taken from the **shared checkout**
`/Users/Flo/GitHub/palette/` — `images/` for the 34 review fixtures, the hex roots `00/`…`14/` for
the 37 off-panel manifest entries and every verdict-carrying artwork. `corpus.ts` (taken verbatim
from the slot-economics arm) pins that root as a literal and never derives it from
`import.meta.dirname`. The single exception is the 34 `-scrambled` decoys, read from this worktree's
own `images/` **because that is what they are** — the guardrail set, not artwork. Full resolution
throughout, `VIPS_CONCURRENCY=1`, at most two extraction processes at a time, no corpus-scale sweep
beyond the two verification dumps.

**Ground truth** was mined at arm start from the live warehouse
`/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl` (192 records, 100 image keys);
the latest record per artwork is the one used everywhere below. Digest: `data/verdicts-latest.json`
(79 `strong`, 19 `acceptable`, 1 `weak-fallback`, 1 batch-level).

---

## 0. Headline

The inherited diagnosis holds and sharpens. On all three target artworks the endorsed carrier is
**already on the slate**, and on two of them the endorsed *arrangement* is already ranked in the top
twenty of a thousand-plus candidates. What was missing was never availability.

| | mechanism | shipped | result |
|---|---|---|---|
| **M1** | `TEXT_DEMOTION_EVIDENCE = "strongest-claim"` — "better text" means *the artwork's* text, not merely better than the foreground this candidate happened to choose | **ON** | `0d5cdb` publishes the **gold foreground**, reproducing the batch-19 palette review graded `strong` **and preferred over the grey it replaces**; `krafty` byte-preserved |
| **M1′** | `TEXT_DEMOTION_EVIDENCE = "claimed"` — the first design: fire only where the classifier's `requiredRole` says `"foreground"` | **OFF** | designed, implemented, **and refuted by its own verification** — it reverses `krafty`, the case the guard exists for. §4.3 |
| **M2** | `FOREGROUND_MARK_ADMISSION = "mark-bearing"` — the foreground earns identity *authority* when the artwork's evidence says it holds a mark | **OFF** | measured and rejected: it pays a chromatic foreground indiscriminately and moves `0cd48f` onto an unreviewed green-text arrangement |
| **M3** | `GamutCoverageScope = "mark-bearing"` — the same predicate, at the coverage axis whose own comment records this arm's case as its counter-evidence | **OFF** | measured and rejected for a reason worth recording: acted on, the coverage axis **endorses the navy foreground the reviewer complained about** |

Four findings I consider the substance of this arm:

1. **`0cd48f`'s endorsed teal arrangement is rank 15 of 1045 with `identityCoverage` = 1.0000** — a
   perfect score, one of only two candidates on the artwork that cover every identity obligation
   (and both are the endorsed teal-text/green-accent structure). It loses
   by 0.0276 of `relationUtility`, and **76 % of that deficit is one axis**: `foregroundPath`, where
   the navy scores a saturated 1.0000 against the teal's 0.7209 at weight 0.15. Identity is already
   paying its maximum; nothing inside the identity machinery can reach this. §3.
2. **`0d5cdb`'s gold loses on identity, not on quality — and the reverse was true.** The gold
   arrangement's `qualityUtility` is **higher** than the grey's (0.79185 vs 0.78811). The entire
   0.0473 gap is identity, and 0.0229 of it is one guard, `demotesBetterText`, withholding the *red
   accent's* authority — the same colour, in the same role, in both arrangements — on behalf of a
   family that is **not that artwork's strongest text claim and is not in the palette at all**. §4.
3. **`03e50500`'s orange-gold is generated, and is only ever a foreground.** family-6837 publishes
   `#b67e1f` in **90 candidates, 72 of them with a distinct accent** — and in **zero** candidates as
   a distinct accent beside another foreground. The reviewer's requested role does not exist on the
   slate, so this half is a generation gap, not a ranking one. §5.
4. **The gamut-coverage axis's recorded counter-evidence does not survive being acted on.** Its
   comment cites, verbatim, the batch-19 complaint about *this arm's* `0cd48f` ("the foreground is
   very close to a black when the artwork has many colors") as the reason to doubt excluding the
   foreground. Extended to a mark-bearing foreground, coverage on that very artwork rises **more for
   the navy (0.3911 → 0.6003) than for the teal (0.4091 → 0.5786)**. The axis, asked honestly, sides
   against the complaint. §6.2.

---

## 1. Method

`replay.ts` re-runs the exact internal sequence `extractPaletteDetails` runs — including the
zero-coverage reference pass that sets `fieldGuard` — and exposes every candidate's full evaluation
instead of only the published winner. Six probes read it:

- `probe-rank.ts` — the top of the ranking and the best-ranked candidate matching a target role hex,
  with every axis and its weighted contribution.
- `probe-slate.ts` — every distinct (family, hex) the slate offers in one role, with chroma, hue,
  best rank, and ΔE to a named target. Answers "is the carrier generated, and where does it rank".
- `probe-identity.ts` — obligations, their directions and chroma, and the role requirement each
  obligation family carries under a candidate's own field hypothesis.
- `probe-scan.ts` — every candidate matching a role/family/hex filter, so "does this arrangement
  exist at all" is answered by enumeration rather than by a nearest-match search.
- `probe-claims.ts` — how often the role classifier actually claims a family is the artwork's text.
- `probe-cases.ts` / `dump-winners.ts` — the three cases and the 141-artwork verification set, for
  before/after diffing.

`configure.ts` flips the settings in the runtime source, so every before/after in this
document is an A/B over the real pipeline. `--admission blanket --demotion raw-score --scope
field-and-accent` is trunk `d11ac6c` exactly, and reproduces it digit for digit (§7).

**ΔE throughout is CIELab**, on the runtime's own `perceptualDifference` ruler — the same ruler
`distinctness.sameColor` (3.3) is expressed in, and the same one the prior arms reported.

---

## 2. What the slate actually holds (generation, settled first)

Per the inherited lesson, generation was traced before any ranking claim was made.

| artwork | endorsed carrier | on the slate? | nearest slate colour | ΔE | best rank of an arrangement in that direction |
|---|---|---|---|---|---|
| `0cd48f` | fg teal `#2b848c` (batch-27 **strong**) | direction yes, colour no | `#a7dbd9` (family-9438) | 34.68 | **15** / 1045 (as `#a7dbd9`) |
| `0cd48f` | fg teal `#8ecfd1` (batch-26 correction) | **yes** | `#9fdfe1`, `#a7dbd9` | **5.77**, 6.48 | **15** / 1045 (as `#a7dbd9`) |
| `0cd48f` | fg teal `#71dad3` (batch-27 "works well too") | direction yes | `#9fdfe1`, `#5fbea8` | 13.18 | 129 (as `#9fdfe1`, dark field only) |
| `0d5cdb` | fg gold `#f1b73c` (batch-27 **strong**) | **yes** | `#e4b144` (family-8602) | **7.21** | **6** / 1054 |
| `0d5cdb` | fg gold `#f0bb47` (batch-27 **strong**) | **yes** | `#e4b144` | **4.74** | 6 |
| `0d5cdb` | fg gold `#f7de67` (batch-19 **strong**) | **exactly** | `#f7de67` (family-9904) | **0.00** | **5** / 1054 |
| `03e50500` | accent orange-gold | **as a foreground only** | `#b67e1f` (family-6837) | — | 270 as fg; **no candidate has it as a distinct accent** |

Two things follow immediately.

**The `0d5cdb` gold is not one colour, it is a direction with three endorsed samples, and the slate
holds an exact member of it.** `#f7de67` is the foreground of the palette batch-19 graded `strong`
and *preferred outright over the grey trunk publishes*. Its hue is 97.6° against `#f1b73c`'s 82.0° —
15.6° apart, inside `identityDirectionHueDegrees` (40°), so by this codebase's own definition the two
are **one identity direction**. The grey `#c7c6c1` is ΔE 65.07 from `#f1b73c` and chroma 0.0070.

**`0cd48f`'s reviewer-preferred `#2b848c` is not reachable and this is honest to say.** The white
field's only teal foreground is family-9438's `#a7dbd9` (chroma 0.0536). `#9fdfe1` (chroma 0.0646)
exists but only under *dark* field variants — the field-conditional foreground ranking picks a
different single representative per field. What is reachable is the batch-26 correction `#8ecfd1`, at
ΔE 5.77–6.48, and it is what rank 15 publishes.

---

## 3. `0cd48f` — the teal is rank 15 with a perfect identity score

Latest verdict, batch-27 `sq-a`/`sq-b`: **strong**, applying to `sq-a`
`{#ffffff #ffffff #2b848c #b7f07d}`, note *"Option B is slightly stronger, but option A works well
too"* (`sq-b` = `#71dad3`). Trunk publishes `{#ffffff #ffffff #201f41 #b7f07d}` — batch-26
`acceptable`, with correction foreground `#8ecfd1`.

The artwork raises four identity obligations (`data/identity-0cd48f-trunk.json`):

| obligation | priority | chroma | hue | what it is |
|---|---|---|---|---|
| family-9438 | **0** | **0.0537** | 196.4° | the teal |
| family-9862 | 1 | 0.1604 | 130.0° | the green `#b7f07d` |
| family-2864 | 2 | 0.0645 | 284.6° | the navy `#201f41` |
| family-7655 | 3 | 0.1053 | 141.2° | a second green |

| rank | palette | `relationUtility` | `qualityUtility` | identity coverage | authorized | gamut |
|---|---|---|---|---|---|---|
| **1** | `#ffffff #ffffff #201f41 #b7f07d` | 0.80853 | 0.77329 | 0.4762 | 0.01143 | 0.3911 |
| 2 | `#ffffff #ffffff #201f41 #a7dbd9` | 0.80518 | 0.76709 | 0.7619 | 0.00000 | 0.1695 |
| **15** | `#ffffff #ffffff #a7dbd9 #bdf369` | 0.78093 | 0.71950 | **1.0000** | 0.01143 | 0.4091 |
| 28 | `#ffffff #ffffff #a7dbd9 #201f41` | 0.77576 | 0.73052 | 0.9048 | 0.00000 | 0.2091 |

Rank 15 is the endorsed *structure*: the teal in the text role, the green in the accent — the same
pairing both batch-27 options use. Exactly **two** of the 1045 candidates reach
`identityCoverage` = 1.0000 (`probe-fullcoverage.ts`), and **both** are that structure: rank 15 and
`#ffffff #e1eff2 #a7dbd9 #bdf369` at rank 113. The published winner drops the artwork's
**priority-0** obligation entirely.

(Ranks in this section are trunk's. M1 does not change any of these `relationUtility` values on this
artwork — none of its obligations is the one the misdirected veto was firing on — but it lifts other
candidates past rank 15, which becomes **rank 18** under the shipped configuration. The winner and
the gap are unchanged.)

Attribution of the 0.02760 gap, rank 1 minus rank 15, weight × axis delta:

| term | rank 1 | rank 15 | weighted Δ | share |
|---|---|---|---|---|
| `foregroundPath` | 1.0000 | 0.7209 | **+0.04187** | **76 %** of the deficit |
| `artworkIdentity` (wave-1) | 0.8211 | 0.7225 | +0.01085 | 20 % |
| `accentFidelity` | 0.7915 | 0.7218 | +0.00418 | |
| `representativeness` | 0.7231 | 0.7429 | −0.00198 | |
| `sourceSupport` | 0.6465 | 0.6630 | −0.00165 | |
| gamut (weight 0.05) | 0.3911 | 0.4091 | −0.00090 | |
| **identity gain** | 0.03524 | 0.06143 | **−0.02619** | |
| **total** | | | **+0.02760** | |

**Diagnosis.** Identity is already at its ceiling: rank 15 covers *everything*, which is worth
`maximumIdentityGain` = 0.05 in total, and it still loses. `foregroundPath` alone outweighs the whole
identity budget on this artwork, and the navy is **saturated** there (`clamp` is binding — its raw
foreground utility exceeds 1). No lever inside the identity or coverage machinery reaches 0.0276,
because the identity machinery has already given rank 15 everything it has to give.

The remaining sources are both things this charter forbids an arm to do unreviewed: raising
`maximumIdentityGain` (a reviewed weight), or discounting `foregroundPath` (charter constraint 2 —
APCA is deliberately low, and a chromatic-foreground discount on the path axis is an
accessibility-shaped change in the opposite direction). **I record this as measured and not
actioned**, and propose the pair for review as-is: rank 15 is a real, reachable, byte-exact
arrangement that the reviewer can be asked about directly.

---

## 4. `0d5cdb` — the gold loses on identity while winning on quality

Latest verdicts: batch-27 `sq-a`/`sq-b` **strong** for both `{#000000 #000000 #f1b73c #cd1227}` and
`{#000000 #000000 #f0bb47 #cd1227}`; batch-27 `as-on`/`as-off` `acceptable` with correction
foreground `#cd972b`; batch-25 `acceptable` with correction foreground `#f1b73c` and the note *"The
Dim grey feels too neutral for this artwork, it is not the focus of it. The gold and red are the
important ones."*; batch-19 **strong** for `{#000000 #000000 #f7de67 #f22632}`, *preferred over* the
grey. Trunk publishes `{#000000 #000000 #c7c6c1 #f22632}`.

Obligations: family-6039 (p0, chroma 0.2064, the red), **family-9019 (p1, chroma 0.0062, the grey)**,
family-2005 (p2, 0.0663), family-4694 (p3, 0.1657), family-661 (p4, 0.0035).

| rank | palette | `relationUtility` | `qualityUtility` | coverage | authorized |
|---|---|---|---|---|---|
| **1** | `#000000 #000000 #c7c6c1 #f22632` | 0.85740 | 0.78811 | 0.9286 | **0.02286** |
| 5 | `#000000 #000000 #f7de67 #f22632` | 0.82042 | **0.79185** | 0.5714 | **0.00000** |
| 6 | `#000000 #000000 #e4b144 #f22632` | 0.81008 | 0.78151 | 0.5714 | 0.00000 |

**Rank 5 has the higher `qualityUtility` of the two.** The grey wins purely on identity, by 0.0693 —
exactly the figure the brief inherited. It decomposes into two parts, and one of them is a defect.

### 4.1 The defect: a role charged for the other role's choice

`demotesBetterText` withholds *authority* from a credited non-foreground placement when the treatment
left better text out of the foreground. In **both** rank 1 and rank 5 the red family-6039 sits in the
accent, at the same colour, in the same role, with the same credit. Yet:

| | placed foreground | its `foregroundEvidence` | `foregroundEvidenceOf(6039)` | demotes? | authorized gain |
|---|---|---|---|---|---|
| rank 1 | family-9019 (grey) | 0.8990 | 0.8213 | no | 0.02286 |
| rank 5 | family-9904 (gold) | 0.7111 | 0.8213 | **yes** (> 0.7111 + 0.04) | **0.00000** |

The accent did not change; its authority did. And the family that fired the guard is **not this
artwork's text**: family-9019 carries `foregroundEvidence` 0.8990 against family-6039's 0.8213, so
the strongest text claim on the artwork belongs to a third family that rank 5 does not use at all.
The rule is named `demotesBetterText`, and its comment says "moving a family out of the foreground is
a foreground claim by whatever replaces it" — but family-6039 was never in the foreground of any
competitive arrangement, and would not have been. **Being better text than the foreground a candidate
happened to choose is not the same as being the artwork's text.** The guard is charging the accent
for the foreground's choice.

**M1 (`TEXT_DEMOTION_EVIDENCE = "strongest-claim"`)** keeps the entire rule and narrows what it
protects to the claim it is about: the greatest `foregroundEvidence` among the artwork's own
obligation families under this treatment's field. At most one claim can be the artwork's text, and a
family that is not it cannot be demoted out of a role it never had. No new constant; the margin, the
score and the comparison are unchanged. The change can only ever *un*-withhold, never withhold more.

`krafty` — the case the rule exists for — is unaffected by construction and in fact:

| family | `foregroundEvidence` | strongest claim? |
|---|---|---|
| family-8623 (the golden mango) | **0.9465** | **yes** |
| family-6057 | 0.8132 | no |
| family-6960 (the pink) | 0.7828 | no |
| family-5154 | 0.7440 | no |
| family-3810 | 0.7107 | no |

so every arrangement that moves the golden mango out of the foreground still loses its authority, and
`krafty.jpg` is **byte-identical to trunk** under M1 (§7).

### 4.2 What M1 does, and what still blocks the deeper gold

| | rank of `…#f7de67 #f22632` | its `relationUtility` | grey's | gap |
|---|---|---|---|---|
| trunk | 5 | 0.82042 | 0.85740 | 0.0370 |
| **M1** | **4** | **0.84327** | 0.85740 | **0.0141** |

M1 recovers 0.02286 — the authority the accent was carrying all along — and **the published winner
flips to the gold**, because `selectWinner`'s obligation-coverage precedence and the
`maximumQualityLoss` = 0.12 envelope now admit it. The published palette becomes
`{#000000 #000000 #f7de67 #f22632}`, which is the batch-19 **strong** palette, byte for byte, accent
included (`#f22632` is trunk's own accent and a named batch-27 guardrail).

**What still blocks the deeper gold** (`#e4b144`, ΔE 4.74 from the endorsed `#f0bb47`) is now
measured and nameable: after M1 the residual gap is **0.0245**, and **0.0179 of it is one obligation**
— family-9019, chroma **0.0062**, priority 1, holding `w(1)/denominator = 0.5/1.4 = 35.7 %` of the
entire identity budget. A third of what this artwork's identity is worth is spent on *"the palette
shows grey"*, and the objective refuses that same neutral every other privilege it grants a
direction: `identityDirections` skips it for authority, `carriesIdentityDirection` refuses to let it
be covered by equivalence, and the obligation selector's `maximumNeutralObligations` exists because
"material distance cannot separate two greys that differ only in lightness".

I did **not** action that. Devaluing neutral obligations was designed and then rejected on
measurement before implementation: on `0cd48f` the priority-0 obligation is family-9438 at chroma
0.0537 — also a neutral by `neutralObligationChroma` — and devaluing it moves that artwork's
coverage the *wrong* way (rank 15's coverage is 71 % that obligation). One repair cannot be right on
both artworks, so it is not the generic lever the charter asks for. It is recorded here as the named
residual blocker for whoever takes it next.

### 4.3 The design I got wrong, and how the verification caught it

My first M1 was **`"claimed"`**: fire `demotesBetterText` only where the classifier's own
`requiredRole` for the family is `"foreground"`. The argument was that every other consumer treats
the classifier as confidence-scaled evidence while this one reads a raw score as ground truth, and
that `"ambiguous"` means no claim was made. It produced the same `0d5cdb` result, and the code
comment I wrote asserted it "does not weaken the krafty rule".

**That assertion was false, and the 141-artwork sweep said so** (`data/diff-m1.txt`): `"claimed"`
moved **10 of 141** artworks, **8 of them carrying `strong` verdicts**, and among them —

```
krafty.jpg   verdict strong (review-7-identity-confirm)
  before #050306 #680b3a #f7a223 #eb0a8a
  after  #050306 #680b3a #eb0a8a #f7a223
  note   "The text of the artwork is Golden Mango, so the foreground of the palette
          should also be golden mango"
```

— the exact reversal the guard was written to prevent, with the reviewer's sentence attached.

The reason is a fact about the classifier I had assumed away: on `krafty` family-8623's
`requiredRole` is `"ambiguous"` **at confidence 0.902**. It is *confidently undecided* between
foreground and accent, while its foreground *score* (0.9465) is decisively the highest on the
artwork. `requiredRole` and `foregroundEvidence` are two different outputs of one classifier, and
`demotesBetterText` reads the one that answers its question. My premise — "ambiguous means no
evidence" — confused "undecided between two roles" with "no evidence for either".

`"claimed"` is kept as a rejected option rather than deleted, so the measurement is reproducible.
`"strongest-claim"` was designed *from* this failure: it does not question the score, it questions
which family the score is protecting.

## 5. `03e50500` — (a) the gold is generated; (b) the requested role does not exist

Latest verdict, batch-27 `as-off`/`as-on`: `acceptable` for both, correction
`{bg #050a06, surface #121e10, fg #758151, accent #cfd4c0}` — a **role swap** of what `as-on`
published — and the note *"It's too bad we're not picking up the orange-gold colors in the top left
corner. This is the band's name on this artwork. It would make for a great accent."* Trunk publishes
`{#050a06 #121e10 #cfd4c0 #758151}`.

**(a) Is the orange-gold on the slate? Yes.** `data/slate-03e5-accent.json`:

| hex | family | chroma | hue | best rank |
|---|---|---|---|---|
| `#b67e1f` | family-6837 | 0.1240 | 74.8° | 270 |
| `#ac7a25` | family-6837 | 0.1152 | 76.0° | 1438 |
| `#936819` | family-5955 | 0.1053 | 77.3° | 995 |
| `#79520d` | family-5073 | 0.0937 | 75.1° | 952 |

**(b) Can any ranking lever make it the accent? No — the arrangement does not exist.**
`probe-scan.ts --accent-family family-6837` returns **12 candidates, every one of them
accent-collapsed** (`#b67e1f` in both the foreground and the accent). `--fg-family family-6837`
returns **90 candidates, 72 with a distinct accent**. So family-6837 is retained in the foreground
lane and **not in the accent lane**: the gold can be the text, never a distinct accent beside another
foreground. No re-weighting of the objective can select an arrangement the domain does not contain.
This half is a generation gap, and it is the accent lane's retention that owns it.

**The role the slate does offer is the one the reviewed precedent actually endorses.** A band name is
the artwork's display type, and the precedent the brief cites is that giant display text is the
*foreground*. `{#050a06 #21331b #b67e1f #496036}` — dark green field, band-name gold text, green
accent — is a real candidate at rank 270, rising to **160 under M1** (`relationUtility` 0.75039 →
0.76818, gaining exactly the 0.01779 of authority the same misdirected veto was withholding — the
obligation it was withheld from is not this artwork's strongest text claim either).
It remains 0.067 of `qualityUtility` behind the incumbent, and family-6837 carries the artwork's
**lowest** foreground evidence (0.5505 against the published `#cfd4c0`'s 0.8181) — the classifier
does not think the gold is the text either. **No winner change; no lever proposed.** The honest
statement is that this artwork needs the accent lane to retain family-6837 before ranking has
anything to decide.

---

## 6. The two further mechanisms that ship OFF, and why

### 6.1 M2 — foreground authority (`FOREGROUND_MARK_ADMISSION = "mark-bearing"`)

The design: `credit()` refuses the foreground entry to `credited` outright, so a foreground placement
can never earn *authority*. The stated basis — "every treatment human review has preferred carries
its chromatic identity in the field and the accent while the text stays near-neutral" — is
contradicted by the three newest strong verdicts on these two artworks alone. And the normalisation
already disagrees with the rule: `achievableIdentityCredit` prices the ceiling as "foreground and a
distinct accent", so excluding the foreground from the numerator leaves authority structurally at
about half of what its own denominator expects. On a collapsed-surface artwork only the accent can
ever be credited, which caps `authority` at 0.5 of `identityDirectionAuthorityTarget` = 2 by
construction.

The gate: a foreground is *mark-bearing* when the treatment is not simultaneously holding materially
better text in another of its roles — `demotesBetterText` asked of the role that answers it. No new
constant; the same margin, the same score.

**Measured, and rejected.** `data/cases-C-admission.json` and `data/cases-E-claimed-admission.json`:

| artwork | trunk | M2 alone | M1 + M2 |
|---|---|---|---|
| `0cd48f` | `#ffffff #ffffff #201f41 #b7f07d` | **`#ffffff #ffffff #71af70 #9fdfe1`** | **`#ffffff #ffffff #71af70 #9fdfe1`** |
| `0d5cdb` | `#000000 #000000 #c7c6c1 #f22632` | unchanged | `#000000 #000000 #f7de67 #f22632` |
| `03e50500` | `#050a06 #121e10 #cfd4c0 #758151` | unchanged | unchanged |

M2 moves `0cd48f` onto a **green** foreground with a teal accent — an arrangement no review has seen,
displacing a trunk output batch-26 graded `acceptable`, and it is not the teal foreground anyone
asked for. The reason is visible in the numbers: the navy `#201f41` has chroma 0.0645, just over
`identityDirectionChroma`, so under M2 it counts as a direction and rank 1's authority rises
0.01143 → **0.03227**. M2 pays *any* chromatic foreground, which is precisely the failure the blanket
exclusion was written for. The mark-bearing gate does not separate the cases, because on these
artworks the classifier calls almost everything ambiguous and the gate then passes almost everything.

Rank 15 gains nothing from M2 either, and the reason is a genuine finding: `#a7dbd9`'s chroma is
0.0536, **below `identityDirectionChroma`**, so `identityDirections` skips it. By the objective's own
bar, the teal the slate offers on the white field is not a chromatic direction. M2 says so honestly,
and I did not weaken the bar to make it say otherwise.

### 6.2 M3 — coverage scope (`GamutCoverageScope = "mark-bearing"`)

`gamut-coverage.ts` excludes the foreground from `"field-and-accent"` and records its own
counter-evidence in the source: *"one reviewed complaint asks for the opposite ('the foreground is
very close to a black when the artwork has many colors, so we are missing some of its identity')"*.
That complaint is the batch-19 verdict on `0cd48f` — this arm's case 1. The configuration test's own
note says `all-roles` was measured and rejected because "an adjudicated incumbent flips on a
foreground swap the reviewer had rejected". `mark-bearing` is the narrower version.

**Measured, and rejected — and the reason is the interesting part.** `data/cases-D-scope.json`:

| `0cd48f` candidate | gamut, trunk | gamut, M3 | Δ |
|---|---|---|---|
| rank 1, navy foreground | 0.3911 | **0.6003** | **+0.2092** |
| rank 15, teal foreground | 0.4091 | 0.5786 | +0.1695 |

**The navy gains more than the teal.** The navy sits at hue 284.6° and the pale teal at 193.2°, and
`0cd48f` has more chromatic mass in the violet direction than the pale teal's chroma can claim in its
own. Asked honestly, the axis whose comment cites this complaint **sides against the complaint on
the artwork the complaint came from**. Zero winners move on the 141-set, and the mechanism goes back
in the drawer with that measurement attached rather than as an untested "maybe".

### 6.3 What ships

| setting | file | shipped | restores previous behaviour at |
|---|---|---|---|
| `TEXT_DEMOTION_EVIDENCE` | `base-scoring.ts` | **`"strongest-claim"`** | `"raw-score"` (`"claimed"` is the rejected first design, §4.3) |
| `FOREGROUND_MARK_ADMISSION` | `base-scoring.ts` | `"blanket"` | — (is the previous behaviour) |
| `GAMUT_COVERAGE.scope` | `winner-scoring.ts` | `"field-and-accent"` | — (unchanged from trunk) |

`markBearingForeground` is computed unconditionally and published on the selector evaluation, so both
OFF mechanisms are one constant away from being re-measured without re-deriving the predicate. With
`TEXT_DEMOTION_EVIDENCE = "raw-score"` and `FOREGROUND_MARK_ADMISSION = "blanket"` the runtime is
trunk exactly, and §7 verifies that on 141 artworks.

---

## 7. Verification

`before` = trunk `d11ac6c` (reproduced on this branch with `--admission blanket --demotion raw-score
--scope field-and-accent`, and byte-identical to it on the three cases); `after` = this branch's
shipped defaults. The verification set is the required 141 unique artworks — 34 review fixtures +
34 `-scrambled` decoys + the 37 off-panel manifest entries + every remaining verdict-carrying
artwork, deduped by path. Rows carry all four hexes, the gradient flag, the midpoint and both
collapse flags (`dump-winners.ts`, `data/winners-*.tsv`, diff in `data/diff-m1s.txt`).

| | total | moved |
|---|---|---|
| 34 review fixtures | 34 | **1** (`slim.jpg`) |
| 34 `-scrambled` decoys | 34 | **0** |
| off-panel + verdict-carrying | 73 | 3 |
| **all** | **141** | **4** |

| check | result |
|---|---|
| typecheck `tsc -p research/v2-3/tsconfig.json` | pass |
| `architecture.test.ts` + `configuration.test.ts` (10 tests) | pass |
|  determinism — 5 artworks run twice at the shipped config, byte-compared (`data/det-a.tsv` vs `data/det-b.tsv`) | **identical** |
| the rejected `"claimed"` variant, same set (`data/diff-m1.txt`) | 10 moved, 8 `strong`, `krafty` reversed |
| `krafty.jpg` — the case the guard exists for | **byte-identical to trunk** |
| M2 and M3 at their previous values while M1 is on | 137 / 141 preserved, as above |

### 7.1 Every mover, attributed

All four carry `strong` verdicts, so each needs a defence rather than a count.

**1. `0d5cdb`** — the target. `#c7c6c1` → `#f7de67`; field, accent, gradient, collapse unchanged.
The result is the batch-19 `strong` palette byte for byte, and that batch *preferred it over the
grey it replaces*. Batch-25 called the grey "too neutral for this artwork, it is not the focus of
it". **Defence: the newest verdicts on this artwork ask for exactly this move.** Review item 1.

**2. `ab67616d…0006eb21`** — `#361a05 #220b05 #bbba8a #8a7c33` → `#361a05 #220b05 #f5b934 #8a7c33`.
The latest verdict (review-23-fg-movers) applies `strong` to **both** sides it saw:
`o2-before` = the trunk output, and `o2-after` = `#351d03 #1f0b04 #8a7c33 #f5b934`. The new palette
is `o2-before`'s field carrying `o2-after`'s two role colours, swapped. **Defence: both colours and
both readings are already graded `strong`; only the pairing is new.** Field unchanged. Review item 5.

**3. `slim.jpg`** — `#56676f` → `#37c2eb` in the foreground; field, accent, gradient and midpoint
unchanged. Its `strong` verdict is review-12-**midpoints**, and both sides of that comparison
(`trunk-f`, `trunk-b6`) carry *identical* role colours — the note is entirely about whether two
midpoints are distinguishable. **Defence: the foreground was not the question that batch asked**,
and the batch-20/23 foreground-mover batches exist because several long-standing foregrounds were
later reversed. This is the mover I am least comfortable with and it is why review item 6 exists.

**4. `ab67616d…000d457f`** — `#fd524b #f9a94a #fdfcaa #fb8257` → `#fd514d #f9a135 #fcfdef #faf43c`.
The largest move: all four roles shift, so the field hypothesis changed, not just a role. Note that
**trunk does not publish the endorsed palette here either** — review-17-vivid-series applied `strong`
to `vivid-series-vivid` = `#fd524b #f9a94a #fdfcaa #df241d`, and trunk publishes the *incumbent* the
reviewer did not endorse. **Defence: this artwork is a standing miss in both directions**, and the
new output is a third answer that has to be judged on its own. Review item 7.

---

## 8. Honest self-assessment

**What I am confident in.**
- The `0d5cdb` diagnosis is exact and reproducible: the same accent colour, in the same role, with
  the same credit, is authorized in one arrangement and not in the other, and the family on whose
  behalf the authority is withheld is neither the artwork's strongest text claim nor present in
  either palette. That is a defect by the rule's own stated purpose, not a preference.
- The `03e50500` generation finding is an enumeration, not a search: 12 candidates carry family-6837
  as the accent and all 12 are accent-collapsed. There is nothing for ranking to pick.
- The `0cd48f` attribution is arithmetic on the weighted axes and sums to the observed gap.

**What I am not confident in, and what may be wrong.**
- **I got M1 wrong once, in exactly the way that matters.** The first design shipped a code comment
  asserting it preserved `krafty`; the sweep showed it reversed `krafty`. That is a warning about
  this whole class of change: the identity guards interact through the classifier's two separate
  outputs, and reasoning about one of them is not enough. `"strongest-claim"` is a better-argued
  rule and it *does* hold `krafty` byte-exactly — but I found that by measuring, not by reasoning,
  and I would not bet on my having anticipated every other guard it touches. The 141-set diff in §7
  is the evidence, not my argument.
- **`strongest-claim` narrows the guard to one family per artwork.** By construction only the
  obligation family with the greatest `foregroundEvidence` can now withhold another role's
  authority. That is coherent ("at most one family is the artwork's text") but it is a real
  reduction in the guard's reach, and the arm that calibrated `identityForegroundClaimMargin` may
  have been relying on the broader form for cases I have not seen. Every mover in §7 is the place to
  look.
- **The max is taken over obligation families only.** A non-obligation family with stronger
  typography evidence cannot make the guard fire. I argue that is right — what the guard protects is
  an *identity* claim, and a family with no obligation has none — but the alternative (max over all
  classified families) is defensible too and I did not measure it.
- **`#f7de67` is not the gold the newest verdicts name.** Batch-27 endorsed `#f1b73c` and `#f0bb47`;
  `#f7de67` is ΔE 16.6–19.7 from those, and ΔE 0.00 from the batch-19 palette. It is the same
  identity *direction* (15.6° of hue, inside the objective's own 40°) and it is a colour review has
  graded `strong` and preferred over the grey it replaces — but a reviewer who wanted the amber may
  find the pale yellow a different answer. Review item 2 asks exactly that.
- **I did not close `0cd48f`.** The endorsed arrangement is 15th and stays 15th. I could have closed
  it by raising `maximumIdentityGain` or discounting `foregroundPath` for chromatic foregrounds;
  both are fitted moves against a reviewed weight, and the second runs into charter constraint 2
  from the wrong side. I chose to measure the gap precisely and hand it to review rather than to buy
  it. Whether that was the right call is a judgement the orchestrator should second-guess.
- **The neutral-obligation residual is real and I did not solve it.** On `0d5cdb` a chroma-0.0062
  obligation holds 35.7 % of the identity budget; on `0cd48f` a chroma-0.0537 obligation holds 71 %
  and is the one the reviewer *wants* covered. Any rule that devalues one devalues the other. I
  believe the resolution involves the obligation's *polarity* claim (the notion
  `decisiveForegroundPolarity` already encodes for exactly the "two neutrals are opposite claims"
  problem), but I did not build or measure it and I am not asserting it works.
- **M3's rejection is one artwork.** I measured the coverage scope on the three cases and the
  141-set winners, not on a per-artwork coverage distribution. "The navy gains more than the teal" is
  solid for `0cd48f`; "the axis generally sides against chromatic foregrounds" is not something this
  arm established.

---

## 9. Proposed review items

Seven A/B pairs, all reachable byte-exactly from this branch (`configure.ts` reproduces every side).
Items 1 and 5–7 are the shipped movers, each needed to confirm or revert M1. Items 2–4 are the
questions this arm measured but did **not** action, put to review so the orchestrator learns whether
the next step is worth its price.

| # | artwork | A | B | what it decides |
|---|---|---|---|---|
| **1** | `0d5cdb` | `#000000 #000000 #c7c6c1 #f22632` (trunk) | `#000000 #000000 #f7de67 #f22632` (**M1**) | The target mover. B is the batch-19 `strong` palette byte for byte; A is what batch-25 called "too neutral… not the focus of it". Confirms or reverts M1. |
| **2** | `0d5cdb` | `#000000 #000000 #f7de67 #f22632` (M1) | `#000000 #000000 #e4b144 #f22632` (rank 8, not reachable) | **Which gold.** `#e4b144` is ΔE 4.74 from the batch-27-endorsed `#f0bb47`; `#f7de67` is the batch-19 one. If B wins, the next arm has to take on the neutral-obligation weighting (§4.2). |
| **3** | `0cd48f` | `#ffffff #ffffff #201f41 #b7f07d` (trunk, batch-26 `acceptable`) | `#ffffff #ffffff #a7dbd9 #bdf369` (rank 15/18, **not shipped**) | The teal foreground the slate can actually reach — ΔE 6.48 from the batch-26 correction `#8ecfd1`, and one of only two candidates with complete identity coverage. Decides whether closing a 0.0276 gap is worth spending a reviewed weight on. |
| **4** | `03e50500` | `#050a06 #121e10 #cfd4c0 #758151` (trunk) | `#050a06 #21331b #b67e1f #496036` (rank 160, **not shipped**) | The band-name gold as **display text** rather than accent — the role the slate offers and the reviewed precedent endorses. If B is acceptable, the accent-lane widening this artwork needs may not be needed at all. |
| **5** | `…0006eb21` | `#361a05 #220b05 #bbba8a #8a7c33` (trunk) | `#361a05 #220b05 #f5b934 #8a7c33` (**M1**) | Shipped mover. review-23 graded **both** its options `strong`; B pairs that batch's two colours the other way round on the trunk field. |
| **6** | `slim.jpg` | `#01040b #140e18 #56676f #df2a33` gradient (trunk) | `#01040b #140e18 #37c2eb #df2a33` gradient (**M1**) | Shipped mover, and the one I am least sure of. Its `strong` verdict is a **midpoint** comparison whose two sides had identical role colours, so the foreground was never that batch's question. Field, accent, gradient and midpoint are unchanged; only the text colour moves. |
| **7** | `…000d457f` | `#fd524b #f9a94a #fdfcaa #fb8257` (trunk) | `#fd514d #f9a135 #fcfdef #faf43c` (**M1**) | Shipped mover, largest move (the field hypothesis changes). Note trunk publishes the side review-17 did **not** endorse — the endorsed accent there is `#df241d` — so this artwork is a standing miss either way and B has to be judged on its own. |

If item 6 or item 7 comes back negative, M1 should be reverted to `"raw-score"`; nothing else on this
branch depends on it, and the two OFF mechanisms already restore trunk exactly.

---

## 10. Batch 28 — built label sets

The seven items above were built into the harness `CachedResult` schema and mirrored into the shared
checkout at `research/v2-3-eval/data/results/` (that directory is gitignored — it is a regenerable
cache — so what this branch carries is the builder, not its output).

| label | files | what it is |
|---|---|---|
| `cr-trunk` | 6 | the A sides that are trunk `d11ac6c`. **Real extractions** via the public `extractPalette`, taken with `configure.ts --demotion raw-score`. |
| `cr-m1` | 4 | the M1 sides. **Real extractions**, `configure.ts --demotion strongest-claim`. |
| `cr-alt` | 3 | the not-shipped B sides. **Real slate arrangements** — candidates the ranker generated at ranks 8, 15 and 160 — projected through the same role projection `extractPalette` applies to a winner. |

All 13 records are midpoint-free, so **none carries a `researchRender` key**, including the two
gradient records (`slim.jpg` on both sides): their gradients are real, their midpoints are not
source-supported. `build-results.ts` refuses to emit a `slate` record for a gradient candidate,
because a gradient's midpoint comes from `applyGradientSupport`, which only runs for the published
winner — so a midpoint can never be silently dropped.

`cr-manifest.json` carries the per-item standing verdicts (latest per artwork, mined from the live
warehouse), what each item decides, the §7.1 defences verbatim for the four movers — including
slim's weak one and `000d457f`'s standing-miss context — and the revert rule: **a negative verdict on
item 6 or item 7 reverts M1 to `"raw-score"`.**

| tool | check |
|---|---|
| `validate-results.ts` | all 13 records load through the harness's own `loadResultSet`/`blindPalette`/`midpointHex`; schema, key/filename agreement, role component shapes, and no flat winner carrying `researchRender`. Custody fields (`sourceSha256`, `imagePath`, `byteCount`, dimensions) cross-checked against label sets already in the warehouse for the same six images — all agree. |
| `check-manifest.ts` | every palette and path quoted in `cr-manifest.json` re-read from the file it names: 14 side references, all consistent. |
| mirror | `diff -r` between this worktree's copies and the shared checkout's: identical. |
