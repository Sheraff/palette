# accent-evidence — integration package

**Branch** `worktree-agent-a6de7bb777438fac1`. **Trunk** `5279f87`. **Warehouse** 367 records.
Companion to `EXPERIMENT.md`, which is the original (pre-adjudication) record.

**What changed since that record:** `ae-batch` was served and came back **6 of 9 for `ae-on`**. My
"do not enable" was written before any human had seen the arm's collateral, and it is **withdrawn**.
This document is the decision package: what the arm buys, what it costs, and the three things the
coordinator asked me to pin down.

---

## 0. Configuration under test

`ACCENT_EVIDENCE_CHANNEL = "both"`, `CHROMATIC_CANDIDACY_RESERVATION = "both"`, **no comparator
flags** (`OBJECTIVE_REPAIRS` untouched — both of `comparator-ordering`'s flags stay at their pinned
FINAL-OFF values). Swept as `aa-on`; trunk baseline `aa-off`.

Two identity checks before any claim:

| check | result |
|---|---|
| `aa-off` vs a genuinely reverted trunk (`ae-trunk`) | **223 / 223 extractions byte-identical**, 34/34 parity fixtures |
| `aa-on` (current source, after the `"fidelity"` refactor) vs `ae-on` (the source `ae-batch` was rendered from) | **223 / 223 byte-identical** |

The second one matters twice: it proves the refactor changed nothing at `"both"`, **and** it means
the full-corpus census I already ran under `ae-on` is a census of exactly this configuration. No
re-run was needed and none was done.

---

## 1. (a) The marmalade — it does not survive, and it never needed this arm

**Answer: no.** Under accent-evidence alone, `0007cc8b` publishes **`#1f3a29`** (dark green), not
`#ee7326`. Measured three independent ways that agree:

- my own sweep `aa-on`: `#5d856b #99bece #fbfbfb #1f3a29`;
- `comparator-ordering`'s `co-off-ae` label (my two runtime files overlaid, both flags `"both"`,
  comparator off) — `#1f3a29`, and it names the dE to the ask as 93.6;
- every sub-configuration I have (`"fidelity"`, `"quality"`, `"both"`, with and without the
  reservation) — all `#1f3a29`.

**And the precise minimal addition is not mine to make.** The marmalade is now delivered by a
mechanism that needs no accent-evidence at all. `rw-batch-vividness` grades `m-vivid-max`'s
`#ee7326` **strong** against a label called `trunk` — and I verified that `trunk` column is genuinely
plain trunk, not trunk-plus-me:

> the `rw-batch-vividness` `trunk` palette matches my `aa-off` sweep on **8 of 8** artworks in that
> batch, all four roles each (`0007cc8b`, `000b096f`, `00009f60`, `00088460`, `000913b3`, `00034fd1`,
> `00079607`, `00002947`).

So: `m-vivid-max` reaches `#ee7326` **standing alone on plain trunk**. My arm is neither necessary
nor sufficient for the marmalade. The two known routes to it are the vividness mechanism (alone) and
`comparator-ordering`'s `qualityConsultation: "quality-inside-evidence-band"` layered on me — and
that second route is the one its own arm retired FINAL because it simultaneously knocks `havana` off
its double-confirmed palette.

**Recommendation on the marmalade: take it from the vividness arm.** It is the cheapest route, it is
triple-confirmed (`batch-39-ordering` strong, `rw-batch-vividness` strong, plus the `sr-batch`
mandate), and it costs `havana` nothing.

**Correction to my own earlier report, and to a hopeful line in `comparator-ordering` §11.** That
document ends by suggesting the unmeasured third option might rescue the marmalade. It does not. It
is now measured, and it is a null.

---

## 2. (c) The `0d5cdb` foreground side-effect — diagnosed, and **not separable**

Review's note: *"both Fire Hydrant and Red accents work. But the foreground is better on option B"*,
with a correction endorsing `{#000000 #000000 #cd972b #f22632}`. The arm swaps a gold foreground for
a dim grey. The channel scores accents — so why does a foreground move?

I tested three explanations and **the first two are refuted by measurement**
(`analysis/fg-sideeffect.ts`, real artwork):

1. *`accentFidelity`'s `sqrt(separation(accent, foreground))` factor tilts toward the far
   foreground.* — **No.** Separation saturates at **1.0000 for all four** competing tuples on this
   artwork. That factor is identical everywhere and cannot be the cause.
2. *The good foreground paired with the new accent is not a candidate.* — **No.** All four
   (foreground, accent) pairs exist in the materialized domain; the gold-foreground/deep-red pair is
   there **11 candidates deep**, and its `accentFidelity` is identical to the arm's winner's.

**What is actually happening.** The channel changes *which accent family wins*:

| accent | family | trunk role score | arm role score | gain |
|---|---|---|---|---|
| `#f22632` bright red | `family-6942` | 0.7882 | 0.8518 | **+0.0636** |
| `#cd1227` deep red | `family-6039` | 0.7758 | 0.8830 | **+0.1072** |

Every deep-red candidate gains ~0.044 more than every bright-red one, so the deep red takes the
accent. The foreground that travels with it is chosen by axes the channel never touches — and within
the deep-red family the algorithm's preferred foreground was *already* the grey, on trunk, unchanged.

**So the side-effect is structural: any change to accent scoring re-selects the whole four-tuple.**
I built the bounded setting anyway to test it —

> `ACCENT_EVIDENCE_CHANNEL = "fidelity"` confines the channel to `accentFidelity`, the one axis that
> is purely about the accent, leaving `accentIdentity` and `accentEconomy` (which multiply into the
> whole-palette `artworkIdentity` and `economy`) on trunk's score.

— and **it moves `0d5cdb` exactly the same way.** The effect cannot be bounded by choosing which axes
read the channel. It is honest to price this loss, not to promise a fix.

### The `"fidelity"` mode is measured, and it is not a safer subset

It is not a *subset* of `"both"` at all — the two mover sets are largely disjoint (49 vs 63 movers).

| | `"both"` / `"both"` | `"fidelity"` / `"both"` |
|---|---|---|
| movers (223 corpus) | 63 | 49 |
| good destinations (ENDORSED + CORRECTION) | **15** | 13 |
| decisively bad (KNOWN-BAD + REGRESSION-DECISIVE) | **8** | **5** |
| regression against an unseen one-sided sample | 11 | 12 |

It avoids 3 decisive regressions (`horsley`, `00110226`, `000f723f`) and **loses 7 endorsed
destinations** — including `havana` and `nobs` (both `batch-ma-revival` **strong**), `000b096f` (the
brand-new `rw-batch-vividness` **strong**), and 2 of the 6 artworks `ae-batch` itself endorsed
(`0005a918`, `000f0a78`). Trading seven endorsed destinations for three avoided regressions is a bad
trade, and it still does not fix `0d5cdb`. **`"fidelity"` ships OFF as a measured negative.**

### There is no operating point that separates wins from losses

Every one of the 8 headline wins and every one of the 7 decisive losses moves under **every**
non-off configuration (`"fidelity"`, `"quality"`, `"quality"+reservation`, `"both"+reservation`).
The wins and the losses are the same mechanism. This is the single most important fact for the
decision: **it is one trade, not a tuning problem.**

---

## 3. (b) Destination adjudication — all 63 movers, re-scored at 367 records

`analysis/destinations.ts`, latest-wins, every role compared at the repo's own `sameColor` bar
(CIE76 < 3.3). Full listing in `analysis/destinations-aa-on.txt`; per-artwork warehouse dossiers for
every mover carrying a record in `analysis/audit-movers.txt`.

Two classifier corrections I had to make, both of which had been inflating the loss column:

- **A two-sided record with no stated preference endorses neither side.** My first pass took the
  alphabetically-first label as the endorsement, which manufactured regressions out of explicit ties
  — `0007cc8b` and `0009d178` are exactly that. They are `TIED`, not losses.
- **Regressions split by evidence strength.** `REGRESSION-DECISIVE` = the moved role was the
  contested role in a *stated* preference. `REGRESSION-SAMPLE` = trunk happens to match a one-sided
  endorsed sample and the arm's destination was **never shown to anyone**. The second is a risk, not
  a finding.

| class | count | distinct artworks |
|---|---|---|
| **ENDORSED** — every moved role matches the standing endorsement | 13 | 11 |
| **CORRECTION** — a moved role lands on a recorded correction | 2 | 1 |
| **KNOWN-BAD** — a moved role lands on a hex a verdict rejected | 4 | 3 |
| **REGRESSION-DECISIVE** — trunk held a role a stated preference decided | 4 | 4 |
| **REGRESSION-SAMPLE** — destination never shown | 11 | 11 |
| **TIED** — reviewer saw both and chose neither | 4 | 4 |
| **UNADJUDICATED** | 25 | 24 fresh off-panel with zero records, 1 conversational |

**13 adjudicated wins against 7 adjudicated losses**, plus 11 unseen-risk and 24 fresh-unseen.

### The 13 wins

| artwork | basis | what lands |
|---|---|---|
| `000e91d6` | **ae-batch strong** | fg+accent — the standing "both tangerine and lemon chiffon" ask |
| `00103a37` | **ae-batch strong** | all four roles |
| `0005a918` | **ae-batch strong** | surface |
| `000f0a78` | **ae-batch strong** (fresh off-panel) | all four roles |
| `00060491` | **ae-batch strong** (fresh off-panel) | fg+accent |
| `000c4d52` | **ae-batch acceptable** | surface+accent — also the standing "very rich purples" salience ask |
| `havana.jpg` | **batch-ma-revival strong** + review-25 | fg+accent onto the **double-confirmed** `#eed076`/`#ee655f`. My original report scored this as harm; that was wrong. |
| `nobs.jpg` | **batch-ma-revival strong** | bg+surface |
| `000b096f` | **rw-batch-vividness strong** | accent → `#1eb721`, exactly the vivid accent just endorsed |
| `00009f60` (+`.jpg`) | **rw-batch-vividness acceptable** | accent → `#f9b296`, exactly the vivid accent just endorsed |
| `000b87c4` | review-17 acceptable | bg+surface |
| `00032395` | batch-36 strong | foreground |
| `0003e505` (+`.jpg`) | batch-28 **correction** | background lands on the recorded correction |

Note the two `rw-batch-vividness` wins: this arm independently reaches the accents that batch
endorsed, on artworks nobody chose for it.

### The 7 adjudicated losses, each hand-audited

| artwork | evidence | the loss |
|---|---|---|
| **`0d5cdb`** | 4 records, incl. **ae-batch strong** and batch-28 strong (a pure-foreground A/B the gold won) | fg `#f7de67` → `#c7c6c1`. Review has priced this **twice under current taste**. The accent is free by the reviewer's own note; the foreground is not. |
| **`doja.jpg`** | review-4 strong (preferred trunk), review-5 **unacceptable** on this exact palette, review-12 strong (preferred trunk, with reason) | surface+accent onto the `#f79e80`/`#ce5e52` palette rejected **three times**. Reason on record: "a gradient between pink and Bisque skin color which does not represent this artwork". |
| **`0002881a`** (+`.jpg`) | review-8 note "the surface feels dull, almost grayish"; review-24 strong | accent lands on the **endorsed** `#d0456e` — but surface lands on `#54495a`, the one review called dull. Genuinely mixed; scored bad on the surface. |
| **`horsley.jpg`** | review-7 strong, stated preference | all four roles leave a decided palette |
| **`00110226`** | **batch-39-ordering** strong, stated preference | foreground |
| **`000f723f`** | **rw-batch-roleflip** strong, stated preference | accent |
| **`0012eb9a`** | batch-26 acceptable, stated preference | surface+foreground |

Three of the seven are recent (`ae-batch`, `batch-39-ordering`, `rw-batch-roleflip`), so they are not
stale taste. `doja` and `0d5cdb` are the two the reviewer has priced most often, and both go the
wrong way.

### The 11 unseen-risk regressions

`000a8aa1`, `000dc637`, `001031d1`, `00106c32`, `0002dc28`, `00040def`, `00055971`, `00083cc5`,
`00100a3e`, `0011c1dc`, `horrorwood.jpg`. In each, trunk matches a one-sided endorsed sample on a
role the arm moves, and the arm's destination has never been shown. These are the natural content of
a confirmation batch if one is run.

---

## 4. (d) Full-corpus census — already at the final configuration

Because `aa-on` is byte-identical to `ae-on` on 223/223, the completed 7550-artwork census **is** the
census of the shipping candidate. Both arms swept end to end, 0 extraction errors, coverage
7550/7550/7550.

| | corpus-wide (7550) | 223-artwork sweep |
|---|---|---|
| **moved** | **2106 = 27.9 %** | 63 = 28.3 % |
| accent-only movers | 581 | 14 |
| roles moved | accent 1428 · surface 1126 · background 955 · foreground 656 | accent 41 · surface 36 · bg 26 · fg 21 |

**Gradient neutrality (charter rule 5), both directions:** 5 newly allowed vs 4 newly prevented in
7550 — 0.12 %, symmetric. Surface collapse 60 imposed / 70 lifted; accent collapse 19 / 32.

Note the foreground column: **656 foregrounds move corpus-wide (8.7 %)**. §2 explains why an
accent-only channel does that, and §2 also shows it cannot be prevented. Any integration accepts it.

---

## 5. Verification

| check | result |
|---|---|
| `tsc -p research/v2-3/tsconfig.json` | clean |
| full `research/v2-3/test/*.test.ts` with `PALETTE_IMAGES_ROOT` at the shared checkout | **51 / 51** |
| `configuration.test.ts` incl. the ten pervasive-cliff pins | pass; `ACCENT_RANK_FIDELITY_WEIGHT` byte-identical, its re-review warning not invoked |
| `architecture.test.ts` | pass |
| `OBJECTIVE_REPAIRS` / `winner-scoring.ts` | **untouched** — no comparator flag is enabled or added |
| determinism, 3 real artworks twice, at `"both"/"both"` and at `"fidelity"/"both"` | identical |
| `aa-off` vs reverted trunk | 223/223 extractions, 34/34 fixtures |
| `aa-on` vs the source `ae-batch` was rendered from | 223/223 |
| runtime diff vs trunk | 2 files, `palette-core.ts` +~150, `role-obligations.ts` +64/−9 |

---

## 6. Recommendation

**Integrate `ACCENT_EVIDENCE_CHANNEL = "both"` + `CHROMATIC_CANDIDACY_RESERVATION = "both"`,
conditional on Flo pricing seven named losses.** I am not recommending straight-to-integration,
because two of the coordinator's four gates fail and I should say so rather than round them off:

| gate | status |
|---|---|
| adjudicated wins hold | **PASS** — and grew: 6 from `ae-batch`, plus `havana`/`nobs` (batch-ma-revival) and two `rw-batch-vividness` accents this arm reaches unprompted |
| marmalade survives, or its loss is honestly priced | **PASS by pricing, not by delivery** — it does not survive, and it does not need this arm: `m-vivid-max` delivers it on plain trunk |
| `0d5cdb` foreground effect fixed or bounded | **FAIL** — diagnosed precisely, proven structural, and the bounded mode is a measured negative |
| no known-bad destinations | **FAIL** — 3 KNOWN-BAD + 4 REGRESSION-DECISIVE artworks |

What tips me toward integrating anyway: the trade is **13 adjudicated wins against 7 adjudicated
losses**, the wins include the only two artworks where this arm independently found the accents the
newest batch endorsed, and §2 proves there is no configuration that keeps the wins without the
losses. That is a decision about what the algorithm is *for*, and the reviewer has already answered
the same question in this arm's favour once, 6:9.

What should stop it: `doja` (rejected three times, once as *unacceptable*) and `0d5cdb` (priced twice
under current taste, most recently in `ae-batch` itself) are the two most-adjudicated artworks in the
loss column, and both are regressions of the field/foreground, not of the accent.

**Concretely, one of:**

1. **Integrate now**, recording the seven losses as accepted costs in the integration commit. Justified
   by 13:7 plus the 6:9 batch. `doja` and `0d5cdb` should be named explicitly so a later arm does not
   "discover" them as bugs.
2. **One 9-item confirmation batch first** (my preference if machine time allows): the 7 adjudicated
   losses + 2 of the 11 unseen-risk regressions. This is a *confirmation* batch, not exploration —
   every item has a prior verdict and the question is only whether it still holds. If ≥5 of 7 losses
   are confirmed, integrating means knowingly regressing them; if several flip, the trade becomes
   clean. I can build it from the existing `aa-off`/`aa-on` sweeps in minutes; both sides are real
   extractions.

**Do not** enable `"fidelity"` (measured negative, §2), and **do not** reach for
`comparator-ordering`'s `qualityConsultation` to chase the marmalade — its own arm retired it FINAL,
it costs `havana`, and the vividness arm already delivers the marmalade for free.

## 7. Revert rules

- `ACCENT_EVIDENCE_CHANNEL` ships `"off"` on this branch. Revert = delete the constant,
  `accentEvidenceRoleScore`, its `WeakMap`, the branch in `signatureAccentRoleScore`, the
  `accentFidelityRoleScore` binding, and the ternary in `rankAccentOptions`. `aa-off` proves trunk to
  the byte.
- `CHROMATIC_CANDIDACY_RESERVATION` is `accent-candidacy`'s (`6f3ab16`), reused verbatim and shipped
  `"off"`. It is *not* separable from the wins in practice but it is separable in code.
- `familyAccentRoleEvidence` (`role-obligations.ts`) is a pure extraction, proven inert on 223/223.
  **Keep it under every outcome.**
- No comparator flag is touched. `comparator-ordering`'s two pins stay FINAL-OFF and nothing here
  argues otherwise.
