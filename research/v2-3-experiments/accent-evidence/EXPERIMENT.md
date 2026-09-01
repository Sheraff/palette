# Accent evidence — scoring the accent role by the accent role's own description

> **SUPERSEDED IN ITS RECOMMENDATION — read `INTEGRATION.md` first.**
>
> This document was written **before** `ae-batch` was served. That batch came back **6 of 9 for
> `ae-on`**, which reverses §9's "do not enable". Two further findings also correct it:
>
> - **`havana.jpg` is a WIN, not the harm §6 calls it.** The arm moves it *onto* the palette
>   `review-25-decisions` and `batch-ma-revival` both graded strong. I scored it against a stale
>   reading of the warehouse.
> - The measurements themselves stand — the byte-identity proofs, the derivation, the 0/7 on the
>   `sr-batch` asks, the 27.9 % corpus-wide census. It is the *verdict-relative scoring* of the
>   collateral that was wrong, and `INTEGRATION.md` redoes all 63 movers against 367 records.
>
> Everything below is kept unedited as the record of what was measured and concluded at the time.

**Arm type:** derivation-first, one mechanism implemented at three sites, measured, shipped **OFF**.
**Trunk:** `a74f865`. **Branch:** `worktree-agent-a6de7bb777438fac1`.

**Headline.** The mandate was verdict-backed and the mechanism is the one the mandate describes,
derived without a single fitted constant. It does exactly what it was built to do at the level it
was built for: **the accent-path role score stops suppressing the reviewer's mark — 0/13 → 5/13 of
the standing asks now out-score their incumbent, improved on 12 of 13 (p = 0.0034, median +0.18),
median lane-rank gain 13 places.** And it still **publishes 0 of the 7 adjudicated asks**, while
moving **27.9 % of the full 7550-artwork corpus** (2106 artworks, censused end to end under both
arms) and breaking **two reviewed-`strong` guardrails**. The wall moved, and this arm's most useful
output is naming where it moved to: not accent evidence any more, but the `relationUtility` band and
the two contrast-shaped priority blocks (`accentUtility`, `accentPath`) that sit above every identity
block in the lexicographic winner comparator.

Ships `"off"`. Recommendation: **do not enable**, and do not spend a fifth arm at any accent-evidence
site — the site is now measured out.

---

## Corpus statement

Every artwork-side number here was measured on **real artwork read from the shared checkout**
(`/Users/Flo/GitHub/palette/images/` plus the 21 `<2-hex>/` bucket roots), resolved by absolute path
through `analysis/probe.ts::resolveArtwork`, which refuses any path containing `-scrambled.`. The
worktree's own `images/` holds only `-scrambled` decoys and was read by exactly one thing — the
repo's `parity.test.ts` — which was pointed at the shared checkout with `PALETTE_IMAGES_ROOT`. The
223-artwork sweep corpus (`analysis/corpus.json`, inherited) was re-validated at arm start: 223/223
paths exist, 0 contain `-scrambled`. The full-corpus census enumerates the bucket roots directly and
skips any `-scrambled` entry.

**Cache discipline.** The harness result cache is keyed on `(image bytes, label, algorithmIdentity)`
with **no code fingerprint**, so any pre-existing label can silently predate arbitrary source change.
Every sweep here ran under a label never written before: `ae-trunk`, `ae-off`, `ae-q`, `ae-ch`,
`ae-on`. No inherited result, candidate dump, or `decompose.json` was used as a baseline; the
inherited `analysis/decompose.json` from `signature-role-score` was deleted from the reasoning path
and every family statistic was re-measured at this trunk.

**Verdicts** are read **latest-wins from the live warehouse**
(`/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl`, **287 records** at arm start,
newest batch `sr-batch` at lines 279–286). Guardrails were re-mined from that file, not inherited.

---

## 1. The mandate, and a correction to the class it names

`sr-batch` put each standing ask on screen inside a complete treatment for the first time. Read from
the live warehouse:

| artwork | incumbent accent | prescribed accent | preferred | verdict |
|---|---|---|---|---|
| `0007cc8b` | `#242426` near-black | **`#f06d13`** orange | **ask** | strong |
| `000c42c6` | `#de9b06` gold | **`#fdfc0c`** yellow | **ask** | strong |
| `00102a1c` | `#d79a87` clay | **`#f4405d`** pink-red | **ask** | strong |
| `000f8156` | `#8e672c` bronze | **`#f168a0`** pink | **ask** | strong |
| `00087b13` | `#e7a680` caramel | **`#ff4e2a`** red | **ask** | acceptable |
| `000a8aa1` | `#fa8a02` orange | `#f0d202` yellow | **incumbent** | strong |
| `00028829` | `#e5b3cc` pink | `#40e1c2` turquoise | *neither* — "a strong palette would carry both" | acceptable |
| `0001c404` | `#055226` green | `#ede1bb` cream | *neither* — correction routes Woodland Green to the **surface** | weak-fallback |

So the adjudication is **5 artworks (7 warehouse asks) FOR the prescribed accent, 1 held for the
incumbent, 2 out of scope**. The brief's "6 preferred" is 5 artworks; the seventh and eighth asks are
the two nuanced ones. This report's success metric is those **7 asks over 5 artworks**.

**Class correction (re-derived, `analysis/standing-asks.ts` against the live 287 records).** The brief
carries "16 standing asks / 14 artworks". That is now stale in one place: `sr-batch` graded
`000a8aa1`'s incumbent `#fa8a02` **strong with no accent correction**, which supersedes idx 240 under
the charter's recency rule. The standing class at this trunk is **15 asks over 12 distinct artworks**;
excluding the two out-of-scope concepts (idx 209, 210) the in-scope class is **13 asks over 10
artworks**. Superseded: idx 132 (`0009d178`, batch-34), 135 (`000cd48f`, batch-28), 178 (`000d5cdb`,
batch-28), **240 (`000a8aa1`, sr-batch — new)**.

---

## 2. The derivation — four disagreements, none of them chosen by me

The accent's three quality axes (`accentIdentity`, `accentFidelity`, `accentEconomy`) and the accent
shortlist all score the accent role with `signatureScore`, whose job is to find the artwork's
**signature**: a big connected blob that recurs. The codebase already contains a score whose job is
to find the artwork's **accent** — `accentRaw` inside `classifyFieldConditionalFamilyRole`
(`role-obligations.ts`). They disagree in exactly four places, and every disagreement says the same
thing: *an accent is allowed to be small*.

| property | `signatureScore` (what the accent path uses) | `accentRaw` (what the accent role's own classifier uses) |
|---|---|---|
| **population** | `coherentSupport = largestComponentFraction / 0.002`, weight **0.25, additive** — a pure population ratio | **no additive population term at all**; support enters as the gate `(0.50 + 0.50 · support)`, and that support is 45 % region source-support + 30 % √(population × connectivity) + 15 % concentration + 10 % observation breadth |
| **region size** | — | `compactness` rewards **small** bounds: `size = 1 − boundsFraction / 0.08` |
| **recurrence** | `repeatedSupport = (repeatedComponentCount − 1)/3`, weight **0.16** | `familyRepetition` = 0.65 · observed-region repetition + 0.35 · that same count, weight 0.24 → the raw count carries **0.084** |
| **chroma** | weight **0.11** | weight **0.25** |

The foreground control is in the same function and reverses: `foregroundRaw` carries **no chroma term
whatsoever**. So "chroma matters for the accent and not for the foreground" is not this arm's opinion;
it is a Phase-3 statement the file has carried all along, and it is the same asymmetry
`accent-salience` measured from the review side (endorsed accents +3.59σ more chromatic; endorsed
foregrounds −1.67σ, i.e. *less*).

`accentRaw` is **field-independent by construction** — `compactness`, `familyRepetition`, chroma,
`observedLocalContrast`, `signatureAccent.score` and `coherentSupport` all read only the family; only
the *foreground* half of the classifier needs the field polarity. So the accent claim of a family can
be asked outside a field hypothesis without changing its meaning. That is what makes this mechanism
possible at all.

### Representativity is carried, not waived (charter rule 4)

The gate `(0.50 + 0.50 · support)` is the representativity term. A bare pixel has **no retained region
observation**, so every aggregate in `accentRaw` is zero and the claim is zero — the charter's "never
snap to a bare pixel" is structural here, not a threshold. A reviewed-endorsed lettering accent
covering **0.023 % of pixels** (the `placebo` "Fire Hydrant" red that Flo hand-tested as "works very
very well", `track-a/EXPERIMENT.md:331`, `track-x/EXPERIMENT.md:84`) has
`coherentSupport ≈ 0.116` and lands mid-gate — halved, not excluded. That is the reviewed floor's
order of magnitude, and it is the same standard `SourceSupportRecord` applies.

### Form selection — measured, not picked

`analysis/accent-decompose.ts` evaluates **eight** candidate accent-path scores on all 19 recorded
asks, real artwork, fresh extraction. Forms A–G are transplants of `accentRaw`'s weights onto
`signatureScore`'s terms in various degrees; **H** is the classifier's own score wrapped in
`signatureRoleScore`'s 0.55/0.45; **H0** is the classifier's own score, unwrapped. Scored by whether
the wanted family out-scores the family the algorithm published:

| form | mandate asks (7) | standing in-scope (13) | holds the superseded (4) |
|---|---|---|---|
| trunk (`signatureAccentRoleScore`) | 0 | 0 | 3 |
| A/B (full transplant, ±relative chroma) | 0 | 0 | 2 |
| C/D (population→gate, chroma 0.25) | 0 | 0 | 2 |
| E/F (also drop recurrence) | 2 / 3 | 2 / 3 | 2 |
| G (no population-shaped term at all) | 1 | 1 | 2 |
| H (classifier's score, 0.55/0.45 wrapper) | 2 | 3 | 2 |
| **H0 (classifier's score, no wrapper)** | **4** | **5** | **2** |

**H0 is the mechanism, and dropping the wrapper is principled, not fitted.** `signatureRoleScore`'s
0.55/0.45 split exists *because* `signatureScore` carries no accent-region term at all, so
`signatureAccentObservation` has to be added back at 0.45. `accentRaw` already carries
`signatureObservation`, at its own weight of **0.08**; re-adding it at 0.45 would weight the
classifier's own term 5.6× more than the classifier does. The measurement agrees (H vs H0 costs three
asks), but the argument does not depend on it.

---

## 3. The mechanism

Two files, two flags, both shipped `"off"`.

**`role-obligations.ts`** — `familyAccentRoleEvidence(family)` is the accent half of
`classifyFieldConditionalFamilyRole`, **lifted verbatim**; the classifier now calls it, so there is
exactly one statement of what accent evidence is and the two can never disagree. This refactor is
behaviour-neutral and §6 proves it to the byte.

**`palette-core.ts`** —

```ts
export const ACCENT_EVIDENCE_CHANNEL: "off" | "quality" | "both" = "off"

function signatureAccentRoleScore(family) {
	if (ACCENT_EVIDENCE_CHANNEL !== "off") return accentEvidenceRoleScore(family)
	…trunk's markSupport repair, untouched…
}
function accentEvidenceRoleScore(family) {           // memoised per family (WeakMap, pure)
	return clamp(familyAccentRoleEvidence(family).score)
}
```

* `"quality"` — the three winner axes that already read `signatureAccentRoleScore`
  (`accentIdentity` → `artworkIdentity`, `accentFidelity`, `accentEconomy` → `economy`). This is the
  site Track E's rule already designates as *scoring, never candidacy*.
* `"both"` — also the **accent shortlist** (`rankAccentOptions`'s `distinctAccentFidelity`). This is
  the one candidacy gate whose entire job is to rank *accents*, so scoring it by the accent role's
  own evidence is role-conditional by construction: no other role's shortlist is touched, and which
  families reach it is still decided upstream by the unrepaired `signatureRoleScore`. Review's
  standing refusal is about changing candidacy *for every role*; this is not that.

**`CHROMATIC_CANDIDACY_RESERVATION`** is **inherited verbatim from `accent-candidacy`** (branch
`worktree-agent-a5161402d51c76cf3`, commit `6f3ab16`), where it ships `"off"`, doubles the class's
reach 5 → 10 of 19, and publishes nothing on its own at a 2.2 % footprint. It is reused, not rebuilt;
the reservations are that arm's measurement and the credit is in the source comment.

**Untouched and asserted:** `ACCENT_RANK_FIDELITY_WEIGHT` (pinned cliff #4, 0.50 — no case is made to
change it here, so its re-review warning is not invoked), `FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT`,
`SIGNATURE_COHERENT_SUPPORT_SCALE`/`_WEIGHT`, `bounds.representativesPerRole`, and all ten
pervasive-cliff pins. `configuration.test.ts` 12/12.

---

## 4. What the mechanism does — the score, and the funnel

### 4a. The accent-path role score stops suppressing the class

Wanted family minus published family, `signatureAccentRoleScore` before and after, standing in-scope
asks (n = 13), real artwork, fresh extraction:

| | trunk | accent evidence channel |
|---|---|---|
| asks where the score favours the wanted family | **0 / 13** | **5 / 13** |
| median Δ (wanted − published) | −0.1672 | **−0.0236** |
| lane rank of the wanted family, median | 17 | **9** |
| improved / worsened, paired | — | **12 / 1**, exact two-sided sign **p = 0.0034**, median **+0.180** |

The one case that worsens is idx 216 (`000c42c6`, −0.149 → −0.184) — an adjudicated ask, and the only
one where the classifier's own accent verdict genuinely prefers the incumbent gold. Worth recording:
the channel is not a rubber stamp for the reviewer.

Three arms measured this suppression from three sides and none of them moved it. It is moved.

### 4b. Reach — and a methodological correction to the inherited funnel

Full-pipeline replay, `"both"` + reservation `"both"`, real artwork (`analysis/rank-trace.ts`):

| idx | artwork | best rank of a candidate carrying the ask | `accent-candidacy`'s number |
|---|---|---|---|
| 96 | `0007cc8b` | **4** | 11 |
| 102 | `00087b13` | **12** † | 15 |
| 140/164/175 | `000f8156` | **5** | 21 |
| 216 | `000c42c6` | **12** | 8 |
| 230 | `0007447d` | **20** | 45 |
| 240 | `000a8aa1` *(held)* | **71** | 941 |
| 124, 129, 130, 202, 205, 209, 210, 227 | — | **not offered at all** | — |

† `00087b13`'s published winner does not appear in the replay's eligible domain under this
reconstruction, so its axis diff is not reported; its reachability and rank are.

**Correction the next arm needs.** `accent-candidacy` reported these ranks "of ~1500 scored
candidates". The published winner is never chosen from that domain: `selectSourceEligibleWinner`
ranks only the **source-eligible** sub-domain (`filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain`
— charter rule 4's representativity gate), which is 720–1179 candidates on these artworks. Ranks
quoted against the full domain overstate both reach and distance. The table above is the eligible
domain.

Reach is **10 / 19 offered** — 6 of the 7 adjudicated asks (all but idx 205, `00102a1c`, which still
dies in the signature lane at rank 17 even under the reservation) — against 5/19 at trunk and 10/19
for `accent-candidacy`'s reservation alone. **The channel buys no reach at all; the reservation buys
all of it, and the two together do not exceed the reservation alone.** Candidacy is not this arm's
contribution and it is not where the remaining loss is.

### 4c. Publishes — the metric this arm was given

| configuration | mandate asks delivered (ΔE_CIE76 < 3.3) | standing in-scope delivered |
|---|---|---|
| `ae-off` (= trunk) | **0 / 7** | 0 / 13 |
| `"quality"` | **0 / 7** | 0 / 13 |
| `"both"` | **0 / 7** | 0 / 13 |
| `"both"` + reservation `"both"` | **0 / 7** | 0 / 13 |

Against the reviewer's whole correction corpus, all classes, all corrected roles, latest-wins:
salience **2 closer / 1 farther / 16 unchanged**, permutation 0/0/10, provenance 0/0/2, other
2/0/5 — and the single salience delivery (idx 178, `000d5cdb`) is against a **superseded** ask on a
**guardrail pinned the other way**. It is a cost, not a win.

The one honest positive on a *standing* ask: idx 202 (`000c4d52`, "a bit muted compared to the artwork
that contains very rich purples") moves accent `#b67161` → **`#aa4483`**, ΔE to the prescription 46.8
→ 19.8. It is farther in OKLab and much closer in Lab; the reviewer, not this metric, should decide.
It is item 3 of the review batch.

---

## 5. Where the wall moved to

With the wanted accent's evidence now *ahead* of the incumbent's and the candidate in the eligible
pool at rank 4–5, per-axis diff against the published winner (`analysis/rank-trace.ts`, weighted by
base weight):

| idx | ΔqualityUtility | dominant terms |
|---|---|---|
| 96 `0007cc8b` | **−0.0228** | **`accentPath` −0.0248**, accentFidelity −0.0015, economy −0.0009 |
| 140/164/175 `000f8156` | **+0.0020** | accentFidelity **+0.0037**, economy **+0.0024**, artworkIdentity **+0.0017**, representativeness −0.0013 |
| 216 `000c42c6` | −0.0113 | accentFidelity −0.0128, fieldFidelity −0.0097 |
| 230 `0007447d` | −0.0515 | fieldFidelity −0.0321, **`accentPath` −0.0255** |
| 240 `000a8aa1` *(held)* | −0.3128 | fieldFidelity −0.0922, artworkIdentity −0.0523 — comfortably held, rank 847 |

Read `000f8156`. **The candidate carrying the reviewer's pink accent now beats the published winner on
quality utility**, and it still ranks 5th and does not publish. That is not an evidence problem any
more. `compareEvaluations` (`winner-scoring.ts:1028`) compares `relationUtility` **banded** first,
then `identityAuthorizedGain`, and only then `qualityUtility`; the pink candidate's ΔrelU is −0.00053
and it loses the band before quality is ever consulted. And on `0007cc8b` and `0007447d` the largest
single deficit is `accentPath` — APCA path observability, weight 0.10 — while the priority-block order
(`policy.ts:31`) puts `accentUtility` at position 6, **above `artworkIdentity`, `representativeness`,
`coherence` and `economy`**. A small vivid mark on a field it does not contrast strongly against loses
there regardless of how well it represents the artwork.

**So the site for a fifth arm, if there is one, is the contrast-shaped half of the winner comparator
for the accent role specifically** — and that is a much more dangerous place than this one, because
charter rule 2 protects the low-contrast regime as a *parameter* and says nothing about re-ordering
priority blocks. It should not be attempted without its own verdict batch.

---

## 6. Blast radius, guardrails, attribution

223 artworks (34 parity fixtures · 108 verdict-carrying · 11 off-panel manifest · 70 fresh off-panel).

### The OFF arm is trunk

**`ae-off` vs `ae-trunk` (a genuinely reverted working tree at `a74f865`): 223 / 223 extractions
byte-identical** (sha256 of the full extraction JSON), **34 / 34 parity fixtures byte-identical**.
That result covers the `role-obligations.ts` refactor as well as the two flags: the extraction of
`familyAccentRoleEvidence` is proven behaviour-neutral on the corpus, not argued.

### The ON arm

| | `"quality"` | `"both"` | `"both"` + reservation |
|---|---|---|---|
| moved at all | 58 / 223 (26.0 %) | 59 / 223 (26.5 %) | **63 / 223 (28.3 %)** |
| materially moved (worst-role ΔE ≥ 3.3) | — | — | **55 / 223 (24.7 %)** |
| ΔE ≥ 25 (large) | — | — | **37** |
| parity fixtures moved | 8 / 34 | 8 / 34 | **8 / 34** |
| gradient decisions flipped | 0 | 0 | **0** |
| midpoint changes | 3 | 3 | 2 |
| verdict-carrying movers | 27 / 108 | 28 / 108 | **30 / 108** |

Attribution, byte-exact: `"quality"` → `"both"` moves **3 / 223** (the accent-shortlist site is nearly
inert on its own); `"both"` → `"both"+reservation` moves **11 / 223**. The channel owns the 26 %; the
shortlist and the reservation are marginal.

Parity fixtures moved: `doja`, `havana`, `horrorwood`, `horsley`, `nada`, `nobs`, `vvbrown`, `ybbb`.
`havana` is the permutation-class harm `accent-salience` predicted, live again: foreground ↔ accent
swap `#e1824a` ⇄ `#eed076`.

### Guardrails — re-mined from the live warehouse

| outcome | latest verdict | result |
|---|---|---|
| `krafty.jpg` golden mango fg | review-7 | **byte-preserved** |
| `slim.jpg` `#37c2eb` fg | fixture | **byte-preserved** |
| `johns.jpg` sailor-blue `#315a92` surface | batch-25/26 | **byte-preserved** |
| `skap.jpg`, `black.jpg` | batch-31 / reviewed collapse | **byte-preserved** |
| batch-30 strongs `00056471`, `0006eb21`, `000442ca` | batch-30 | **byte-preserved (4/4)** |
| batch-31 strongs `0010b864`, `000c3523` | batch-31 | **byte-preserved** |
| `0013bebc` | batch-32 strong | **byte-preserved** |
| **`000d5cdb`** gold `#f7de67` + red `#f22632` | **batch-28 strong** | **BROKEN** — fg → `#c7c6c1` (the dim grey the reviewer rejected in words), accent → `#cd1227`; pinned roles held 4/4 → 2/4 |
| **`nobs.jpg`** | **batch-31 strong** | **BROKEN** — bg `#f6ffff`→`#f7ffff`, surface `#f2f626`→`#f7f61f`; ΔE small but the pinned roles no longer match |
| **`0005a918`** | **batch-31 strong** | **MOVED** — surface `#123146` → `#0c5381` |
| `000a8aa1` | batch-31 field correction (supersedes batch-30) | **MOVED toward the standing verdict** — bg/surface → `#040301`/`#491600`, which is exactly batch-31's correction |

**11 byte-preserved, 4 moved, 2 of them genuine regressions against standing `strong` grades.**
Batch roll-ups: batch-30 4/4 preserved; batch-31 8 preserved / 2 broken (`nobs`, `0005a918`);
batch-32 preserved; batch-33 swap outcomes preserved; batch-34 — `0009d178` surface `#c42a42` →
`#ed3358` (strong, moved).

Every verdict-carrying mover is listed in `analysis/movers.txt` (regenerate with
`diff-arms.ts ae-off ae-on`); 30 is far more than 10, so the review batch is the verdict-relevant
subset plus a fresh off-panel sample, per the standing instruction.

### Full-corpus census — complete, 7550 / 7550 both arms

`analysis/census.ts` + `run-census.sh` swept **every one of the 7550 artworks** in the shared
checkout's 21 bucket roots, under both arms, 4 workers, `VIPS_CONCURRENCY=1`, 0 extraction errors on
either side. Coverage is 7550/7550/7550 (off / on / compared), so nothing below is extrapolated.

| | corpus-wide (7550) | 223-artwork sweep |
|---|---|---|
| **moved** | **2106 / 7550 = 27.9 %** | 63 / 223 = 28.3 % |
| accent-only movers | 581 | 14 |
| roles moved | accent 1428 · surface 1126 · background 955 · foreground 656 | accent 41 · surface 36 · background 26 · foreground 21 |

The 223-artwork estimate is accurate to 0.4 points, which is worth recording on its own: the
inherited sweep corpus is a good sampler of this kind of change.

**Gradient neutrality (charter rule 5), both directions, corpus-wide.** The 223 sweep showed 0 flips
and that was a small-sample artifact; at full scale there are 9, and they are symmetric:

| | count |
|---|---|
| gradient newly **allowed** | 5 |
| gradient newly **prevented** | 4 |
| surface collapse newly imposed / newly lifted | 60 / 70 |
| accent collapse newly imposed / newly lifted | 19 / 32 |

9 flips in 7550 (0.12 %), 5 against 4. The change is gradient-neutral in the charter's sense — it does
not lean toward allowing or preventing — and the collapse decisions are likewise near-symmetric with a
mild lean toward *fewer* collapses (more roles distinct), which is the expected direction for a term
that makes a distinct accent easier to justify.

---

## 7. Verification

| check | result |
|---|---|
| `tsc -p research/v2-3/tsconfig.json` | clean |
| full `research/v2-3/test/*.test.ts` with `PALETTE_IMAGES_ROOT` at the shared checkout | **51 / 51 pass** |
| `parity.test.ts` (34 fixtures + determinism + contrast parameter + emergency) | included above, pass |
| `architecture.test.ts` — closed imports, no fixture identity in runtime | pass *(it caught one fixture name in a comment of mine; fixed)* |
| `configuration.test.ts` incl. the ten pervasive-cliff pins | **12 / 12** |
| `ACCENT_RANK_FIDELITY_WEIGHT` (pin #4) | byte-identical, still asserted, no case made to change it |
| trunk byte-identity over the sweep corpus | **223 / 223** (re-run as `ae-off2` against the *committed* source after the one comment fix: **223 / 223**) |
| targeted fixture parity `ae-off` vs `ae-trunk` | **34 / 34** (re-run `ae-off2`: **34 / 34**) |
| full-corpus census coverage | **7550 / 7550** both arms, 0 extraction errors |
| determinism, 3 real artworks extracted twice, **flags OFF** | identical |
| determinism, same 3 artworks, **flags `"both"`/`"both"`** | identical |
| runtime diff | 2 files, `palette-core.ts` +137/−4, `role-obligations.ts` +64/−9 |

---

## 8. Honest self-assessment

**What is solid.**

- The derivation carries **no constant of mine**. Every weight in `accentEvidenceRoleScore` is
  `accentRaw`'s, unchanged since Phase 3, and the mechanism is literally a call to the classifier the
  file already had. The four-way disagreement table in §2 is quoted source, not modelling.
- `ae-off` is trunk on 223/223 and 34/34, which makes the `role-obligations.ts` refactor a proven
  no-op and every `ae-on` difference attributable to the two flags.
- **The accent-path suppression is repaired**: 0/13 → 5/13 favouring the wanted family, 12 improved
  against 1 worsened (p = 0.0034), median lane-rank gain 13. Three prior arms could not move this
  number in either direction.
- **It still publishes nothing.** 0/7 on the adjudicated set under all four configurations. That is a
  measured valley, not a shortfall of effort, and it is now the fourth independent one.
- The 5th-arm site is identified and quantified: the `relationUtility` band decides before quality is
  consulted (`000f8156` wins on quality and still ranks 5th), and `accentPath`/`accentUtility` are the
  largest deficits where quality does decide.
- The correction to the inherited funnel — that ranks must be quoted against the **source-eligible**
  sub-domain, not the ~1500 scored candidates — is verifiable and matters to any successor.

**What I am least confident about.**

- The 19-record hand classification in `analysis/salience-set.ts` is inherited from `accent-salience`
  and carries its judgement. I re-derived the *standing* subset mechanically against the live
  warehouse but did not re-classify the reasons.
- `"delivered"` is ΔE_CIE76 < 3.3 against a hand-typed hex. The batch exists because that is a proxy;
  idx 202 is the case where the proxy and the reviewer may disagree.
- The per-axis diffs in §5 come from a replay that reconstructs the scoring pipeline
  (`analysis/rank-trace.ts`, inherited from `accent-candidacy`) and does **not** reproduce the exact
  published winner on every artwork — it passes `null` for gamut scoring and repair overrides, and it
  omits transition promotion. The published winner sits at replay rank 1–4 rather than always 1. The
  *direction* of the axis deficits is trustworthy; the exact ranks are approximate, and I did not
  close that gap.
- I did not test whether `"quality"` alone at a smaller blast radius would survive review, because it
  delivers the same 0/7. If review likes the `ae-on` side of the batch, `"quality"` (26.0 %, 3 fewer
  movers, same delivery) is the cheaper thing to reconsider first.
- The census is complete (7550/7550 both arms), so its 27.9 % needs no caveat — but it compares only
  the four hexes and the gradient/collapse booleans, not the full extraction JSON, so it counts
  *published* differences and would miss an internal change that does not reach the output. For this
  mechanism that is the quantity of interest, but it is a weaker equality than the 223-artwork
  sweep's sha256-of-everything.

**What I got wrong and corrected.**

- I first wrote the mechanism with `signatureRoleScore`'s 0.55/0.45 wrapper around the classifier's
  score (form H). That double-counts `signatureAccentObservation` at 5.6× the classifier's own weight
  and costs three asks. Corrected to H0, with the argument in the source comment.
- I named a parity fixture (`placebo.jpg`) in a runtime comment. `architecture.test.ts` rejected it —
  charter rule 7 working exactly as intended. The comment now states the property, not the artwork.
- I nearly reported reach against the full ~1500-candidate domain, inheriting `accent-candidacy`'s
  framing. The published winner comes from the source-eligible sub-domain only; §4b is measured there.

**What would change my mind.** The review batch. My measurement says the mechanism does not deliver
the hexes the reviewer typed — but 30 verdict-carrying artworks moved and several move toward standing
asks. If the reviewer prefers `ae-on` on ≥ 6 of 9, the channel is worth carrying and the fifth arm has
its mandate at the comparator. If he does not, the accent-evidence site is closed for good and the
19-record correction class should stop being mined as a target set.

---

## 9. Recommendation

1. **Ship `"off"`.** 0/7 on the adjudicated asks against 27.9 % churn measured over the whole
   7550-artwork corpus, 8 parity fixtures and two broken reviewed-`strong` guardrails. No verdict argues for that trade, and the `sr-batch`
   adjudication — which does justify paying for this class — is about accents the mechanism does not
   deliver.
2. **Do not open a fifth accent-evidence arm.** Four arms have now attacked the accent's evidence at
   the fidelity term, at candidacy, inside `signatureScore`, and at the role classifier's own score.
   The last of these *fixes* the evidence and still publishes nothing. The evidence is not the
   constraint.
3. **The next site, if review authorises it, is the winner comparator's contrast half for the accent
   role** — `relationUtility`'s band, and `accentUtility`/`accentPath` outranking every identity block
   in `ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS`. That is pervasive-cliff territory and needs
   its own verdict batch before any code is written.
4. **Carry the eligible-domain correction forward.** Any arm quoting a candidate's rank "of ~1500" is
   quoting the wrong domain.
5. Keeping the two constants at `"off"` is cheap (they are scalars and cannot interact); deleting them
   is equally defensible, precedent `identityAuthority`. `familyAccentRoleEvidence` should be **kept
   regardless** — it removes a duplicated statement of the accent role's weights and is proven inert.

## 10. Revert rules

- `ACCENT_EVIDENCE_CHANNEL` ships `"off"`. Revert = delete the constant, `accentEvidenceRoleScore`,
  its `WeakMap`, the one-line branch in `signatureAccentRoleScore`, and the ternary in
  `rankAccentOptions`. `ae-off` proves the result is trunk to the byte.
- `CHROMATIC_CANDIDACY_RESERVATION` ships `"off"` and is **not this arm's to enable**: it belongs to
  `accent-candidacy` (`6f3ab16`), which recommends against it on its own evidence. Revert = delete the
  constant, `chromaticCeiling`, `chromaticAccentClaim`, `reserveChromaticSignatureSeat` and its two
  call sites.
- `familyAccentRoleEvidence` is a pure extraction with no flag. Reverting it means inlining it back
  into `classifyFieldConditionalFamilyRole`; there is no behavioural reason to.
- Neither flag may be enabled on the strength of `sr-batch` alone: that batch adjudicated *the asks*,
  and this mechanism does not produce them.

## 11. Reproducing this

```sh
E=research/v2-3-experiments/accent-evidence/analysis

# class + derivation (real artwork)
node --no-warnings --experimental-strip-types $E/standing-asks.ts
node --no-warnings --experimental-strip-types $E/accent-decompose.ts

# arms (fresh labels; 4 workers, VIPS_CONCURRENCY=1)
sh $E/run-sweep.sh ae-trunk                       # with the two runtime files at a74f865
sh $E/run-sweep.sh ae-off                         # both flags "off"
sh $E/with-arm.sh quality off  sh $E/run-sweep.sh ae-q
sh $E/with-arm.sh both    off  sh $E/run-sweep.sh ae-ch
sh $E/with-arm.sh both    both sh $E/run-sweep.sh ae-on

# verification and attribution
node ... $E/byte-identity.ts ae-off ae-trunk      # 223/223
node ... $E/fixture-parity.ts ae-off ae-trunk     # 34/34
node ... $E/diff-arms.ts ae-off ae-on
node ... $E/guardrails.ts ae-off ae-on
node ... $E/delivery.ts   ae-off ae-on
sh $E/with-arm.sh both both node ... $E/asks-delivery.ts both-res
sh $E/with-arm.sh both both node ... $E/rank-trace.ts arm
sh $E/with-arm.sh both both node ... $E/determinism.ts

# full-corpus census (7550 artworks, resumable)
sh $E/run-census.sh ae-off-census
sh $E/with-arm.sh both both sh $E/run-census.sh ae-on-census
node ... $E/census-diff.ts ae-off-census ae-on-census

# batch
node --no-warnings --experimental-strip-types research/v2-3-eval/make-batch.ts \
  --name ae-batch --a ae-off --b ae-on --cases <the 9 basenames in BATCH_MANIFEST.md>
```

Harness `analysis/probe.ts`, `salience-set.ts`, `standing-asks.ts`, `sweep.ts`, `corpus.json`,
`byte-identity.ts`, `fixture-parity.ts`, `diff-arms.ts`, `guardrails.ts`, `delivery.ts`,
`determinism.ts`, `build-corpus.ts` are inherited from `signature-role-score` (`ee2a75f`) unchanged;
`rank-trace.ts` from `accent-candidacy` (`6f3ab16`) with the source-eligibility correction added.
`accent-decompose.ts`, `asks-delivery.ts`, `with-arm.sh`, `census.ts`, `run-census.sh` and
`census-diff.ts` are this arm's.
