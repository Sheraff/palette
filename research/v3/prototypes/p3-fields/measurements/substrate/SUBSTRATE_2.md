# Substrate cycle 2 — MEASUREMENT A, and the stop it produced

**W20, 2026-08-11, worktree `.worktrees/p3-fields`, branch `proto/p3-fields`, from `4e94e10`.**

`SUBSTRATE_2_PREREG.md` ordered Measurement A first *because it can falsify the family*, and it did
not confirm. **The cycle stopped there. No code was written, no revision was made, no gate run was
executed, and `src/` is byte-identical to `4e94e10` — `git diff HEAD -- …/p3-fields/src/` is empty,
which is a stronger proof than a demo-20 re-run because there is nothing to re-run.**

One thing in the prereg is **ambiguous against these numbers and is escalated rather than resolved
here**: the two statistics the prereg names as "the field's summary statistic" disagree with each
other about the criterion. §3 states both readings and picks neither.

---

## 1. What was measured

Both substrates, on the same files, in one process each, with no palette computed:

| | |
|---|---|
| instrument | `field-drift.ts` (new, measurement-only; imports `src/` and writes nothing to it) |
| cross-rendition set | `data/robustness/pair-set-1.json` — **all 200 pairs, both sides**, 0 excluded |
| same-resolution set | `data/robustness/perturbation-set-1.json` — the **first 50 covers** of the frozen draw × `dither-lsb1` and `jpeg-q92`, **100 comparisons** |
| files | 539 distinct, **539 summarised, 0 errors, 0 incomplete comparisons** |
| binary substrate | `computeEdgeField` → `computeDepthField` → `computeFieldSet` (the flags-off path, verbatim) |
| coherence substrate | `computeCoherenceField` → `computeCoherenceFieldSet` (the `P3_SUBSTRATE=field` path, verbatim) |
| cost | 1083 s of single-thread compute, run as 8 shards |

The 50 are a **prefix of the frozen seeded draw**, not a second draw with a second seed. `--limit`
was not used anywhere, so `INSTRUMENT_NOTES.md`'s trial-bias caveat does not apply to this file.

**The instrument reproduces itself.** Shard 3 (67 files) was recomputed in a second process and
compared field by field with the wall-clock column removed: **0 of 67 rows differ.** Every number
below is therefore a property of the images and the code, not of a run.

### The two statistics, defined before they were read

- **F-membership fraction** — `|F| / |eligible|`.
- **The e₁-relevant ordering** — e₁ is the cascade pixel of the band of F whose far edge sits at the
  (1 − τ) rank of *distance from F's cascade median* (`field-roles.ts:chooseFieldEnds`, step 2). The
  scalar that places that band is the (1 − τ) quantile of that distance distribution: **`e1Q95`**.
  `e1Q50`, the median of the same ordering, is reported beside it so the headline cannot be a
  single-quantile artefact.

Drift is **median |log ratio|** between the two sides, per the prereg. A comparison is dropped when
either side's statistic is 0 — F on a poster-flat artwork can be one exact colour, and `log 0` is not
a drift. The dropped counts are printed as the `n` of every row, never hidden.

---

## 2. The numbers

Median |log ratio| (p90 in the second column of each block):

| statistic | pairs n | **pairs median** | pairs p90 | perturb n | **perturb median** | perturb p90 |
|---|---|---|---|---|---|---|
| `binary.fFraction` | 200 | **0.0254** | 0.4399 | 100 | **0.0183** | 0.1924 |
| `binary.e1Q95` | 160 | **0.1084** | 0.6714 | 88 | **0.0117** | 0.1129 |
| `binary.e1Q50` | 136 | 0.2323 | 1.0173 | 82 | 0.0635 | 0.2665 |
| `coherence.fFraction` | 200 | **0.0000** (6.2e-6) | 0.0879 | 100 | **0.0000** (exact) | 0.0082 |
| `coherence.e1Q95` | 156 | **0.0890** | 0.4981 | 88 | **0.0060** | 0.0884 |
| `coherence.e1Q50` | 137 | 0.1833 | 0.6054 | 80 | 0.0383 | 0.2447 |

Per arm, medians: `dither-lsb1` (n = 50) binary `e1Q95` 0.0121 / coherence 0.0138; `jpeg-q92`
(n = 50) binary 0.0115 / coherence 0.0044. **On the dither arm the coherence field is the less
stable of the two**, which is the arm trial 1 regressed hardest on (24.3 → 13.5 %).

### Paired, so the two columns are the same rows

`e1Q95` drops different rows for the two substrates (they do not go flat on the same covers). On the
**155 pairs and 88 perturbation comparisons where all four values are positive**:

| set | binary | coherence | rows where coherence is smaller |
|---|---|---|---|
| pairs | **0.1119** | **0.0889** | **81 / 155** (sign test p = 0.63) |
| perturbations | 0.0117 | 0.0060 | 53 / 88 (p = 0.069) |

**Cross-rendition, the coherence field is smaller on 81 of 155 rows — a coin flip.** The 21 %
median improvement is carried by the size of a few rows, not by a consistent direction.

---

## 3. The prereg's criterion, evaluated mechanically — and the reading conflict

> **Claim confirmed iff the coherence field's cross-rendition drift is (i) ≤ half the binary field's
> AND (ii) not materially above its own perturbation drift.**

| statistic | binary cross-rendition | half of it | coherence cross-rendition | **clause (i)** | coherence perturbation | cross ÷ own perturbation | **clause (ii)** |
|---|---|---|---|---|---|---|---|
| **`e1Q95`** (the e₁ ordering) | 0.1084 | 0.0542 | **0.0890** | **FAIL** | 0.0060 | **14.88 ×** | **FAIL** |
| `e1Q50` (corroboration) | 0.2323 | 0.1162 | 0.1833 | FAIL | 0.0383 | 4.79 × | FAIL |
| **`fFraction`** | 0.0254 | 0.0127 | **6.2e-6** | **PASS** | **0.0000** (exactly) | 6.2e-6 ÷ 0 | see below |

`fFraction`'s clause (ii) has no defined value: the coherence field's perturbation drift is **exactly
zero** and its cross-rendition drift is 6.2e-6, so the *ratio* is infinite and the *difference* is six
millionths of a log unit. Read as a ratio the clause fails; read as "materially" — which is the word
the prereg uses — it passes. That is a third place where the criterion is under-determined, and it is
listed rather than resolved.

**The two statistics the prereg names as one thing return opposite answers, and the prereg does not
say which decides or whether both must hold.** Both readings, stated, neither picked:

- **Conjunctive reading** — "the field's summary statistic drift (F-membership fraction *and* the
  e₁-relevant ordering distribution)" names a composite; confirmation needs both clauses on both
  statistics. → **FAILED**, decisively: the ordering misses clause (i) by 64 % of the required
  reduction and misses clause (ii) by 14.9 ×.
- **Disjunctive reading** — either named statistic satisfying both clauses confirms. → **CONFIRMED
  on `fFraction`**, but only if clause (ii)'s "materially" is read in absolute terms (6.2e-6 over a
  perturbation drift of exactly 0) rather than as a ratio.

Two facts bear on which reading was intended, and are reported rather than used to decide:

1. **The membership-fraction pass is the pass the previous cycle already declared not to be
   evidence.** `SUBSTRATE.md` §8 measured the same quantity, called it "constant by construction",
   and wrote: *"That is a fact about the design, not evidence that the membership is stable."*
2. **It is nevertheless not a pure tautology, and that cuts both ways.** §5 below measures the
   coherence F fraction at **anything from 1e-5 to 0.89 of the artwork, off (1 − β) on 205 of 539
   files**, so its 0.0000 median is an empirical fact about the tie-free majority and its p90 (0.0879
   vs the binary field's 0.4399) is a real 5 × improvement in the *size* of F.

**The substantive shape of the result, which no reading changes: the coherence field stabilises how
big F is and does not stabilise which pixels are in it or how they are ordered.** e₁ — the site
`PAIRS_ATTRIBUTION.md` measured owning **43 of the 54** all-four pair flips — reads the ordering,
not the size.

**Escalated. This worker does not pick between the readings, and stopped the cycle in the direction
both readings agree on for the next step: no revision, no gate run, no flag flipped.**

---

## 4. The mechanism's own claim, split by resolution

The claim is that scale-relative radii buy resolution invariance a fixed 8-neighbourhood cannot.
171 of the 200 pairs differ in resolution, so that is where it has to show. `e1Q95`, paired rows:

| subset | n | binary | coherence | coherence smaller on |
|---|---|---|---|---|
| **resolution differs** | 145 | **0.1146** | **0.0974** | **76 / 145** (p = 0.62) |
| … radii triple differs | 121 | 0.1145 | 0.0840 | 66 / 121 (p = 0.36) |
| … **radii triple equal** | 24 | 0.1292 | **0.1703** | 10 / 24 |
| same resolution | 10 | 0.0457 | 0.0435 | 5 / 10 |

**On its home ground the reduction is 15 % and the direction is a coin flip.** And
`coherence.ts`'s line tension 1 is now counted rather than stated: **`Math.round` lands 29 of the 171
resolution-differing pairs on the identical integer radius triple**, and on exactly those 24
measurable pairs the coherence field is **worse than the binary one** (0.1292 → 0.1703). The
quantisation is not a residual; it is a subset where the mechanism inverts.

---

## 5. Two claims in the shipped documentation are measured false

- **`coherence.ts` claim 2 and `field-roles.ts:computeCoherenceFieldSet`** state that F is "exactly
  (1 − β) of the eligible pixels on every rendition of every artwork, at every resolution". Over 539
  files: min **9.8e-6**, median 0.2500, p90 **0.4442**, max **0.8922**; **not exactly (1 − β) on 205
  of 539 files (38 %)**. The cause is in the code and is not a bug in the measurement: the strict cut
  `coherence > threshold` sits on a **tie-averaged** percentile field, so a flat artwork puts a large
  block of pixels on one shared percentile and the cut lands far from the rank. One dither-arm file
  returns **F = 4 pixels of 409 600**.
- The same docstrings say `DEGENERATE_DEPTH_FLOOR_PX` "has nothing left to do on this path". A
  4-pixel F is the degenerate case arriving through a different door, unguarded.

---

## 6. Instrument validation, against numbers this campaign already published

Two quantities travelled with every row for this purpose only:

| quantity | this file, pairs | prior | this file, perturbations | prior |
|---|---|---|---|---|
| binary edge fraction | **0.1136** (n = 200) | **0.122** (`PAIRS_ATTRIBUTION.md` §8, n = 84) | **0.0200** (n = 100) | 0.058 (§8, n = 20) |
| binary β-depth (fraction form) | **0.2504** (n = 162) | **0.34** (§5, n = 63) | 0.0025 (n = 70) | 0.32 (§5, n = 10) |

The cross-rendition column reproduces the prior figures in magnitude and direction on a **larger and
differently-selected sample**, which is what validates the instrument. The perturbation column is
lower, and the reason is structural rather than a discrepancy: **§8's and §5's perturbation controls
were drawn from perturbation trials that had already disagreed** (20 selected disagreements, 10 of
them usable), while this file's 100 comparisons are an unselected prefix of the frozen cover draw.
A drift median over covers selected for instability is not comparable to one over covers not so
selected. **The prereg's quoted 0.34 / 0.32 are therefore quoted here as provenance, not used as the
comparison baseline — the comparison baseline is the binary column measured on these same 300
comparisons**, which is what the prereg's clause (i) asks for ("≤ half *the binary field's*").

---

## 7. What was not run, and why

Per the prereg: *"If the claim fails, the coherence-field family is FALSIFIED for P3's purpose —
record, stop the cycle, report MECHANISM-limited honestly."*

- **Measurement B** (trial-1 perturbation-regression attribution) — **not run.** It is gated on A
  confirming.
- **The revision** — **not written.** No file under `src/` was opened for editing.
- **The gate run** (600-trial robustness, demo-20 determinism, coverage-220, the three round-5
  covers) — **not run.** It measures a revision that does not exist.

**MECHANISM-limited, as the prereg asks it to be reported:** the coherence-field family does not
deliver the coupling reduction it was proposed for. The robustness story rests on incremental e1
work, and the round-5 field-role complaint class (6/9 notes) does **not** have this substrate
replacement as its fix.

---

## 8. Line tensions, reported not smoothed

1. **`e1Q95` is one scalar standing in for "the ordering".** It is the rank e₁'s band is actually
   read at, and `e1Q50` agrees with it, but a drift in a quantile of the distance distribution is not
   the same thing as a drift in *which pixels* occupy that band. A set-overlap statistic (Jaccard of
   the two sides' bands) would be a sharper instrument and was not run — the prereg named a "summary
   statistic drift as median |log ratio|", which is a scalar-valued form.
2. **Cross-rendition comparisons cannot separate resolution from re-encoding.** Two renditions differ
   in both. The same-resolution pair subset that would isolate it is 29 pairs, 10 of them usable for
   `e1Q95` — reported in §4 and too small to carry weight.
3. **The e₁ rows drop 40–44 of 200 pairs** for a flat F on one side. The paired subset (§2) is the
   defence, and the two substrates' dropped sets are not identical: that is itself a difference
   between them, and it is not measured here beyond the counts.
4. **The 50-cover perturbation sample is the prereg's number, not a powered one.** 100 comparisons
   give a median with a wide interval; the 14.9 × clause-(ii) ratio is large enough that the
   conclusion does not turn on it, but a 2 × ratio would have.
5. **This file measures fields, not palettes.** A field statistic that drifts less does not
   necessarily publish a more stable palette, and the converse: trial 1's measured +6.0 pp on pairs
   is a fact about published palettes that this file neither reproduces nor contradicts. **What it
   does contradict is the mechanism offered as the explanation for it.**
6. **`e1Q95` on the coherence path is read over a set whose size varies from 4 pixels to 89 % of the
   artwork** (§5). Some of the coherence column's drift is that variation rather than the ordering's.
   Splitting it was not run.

---

## 9. Command lines

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields
S=research/v3/prototypes/p3-fields/measurements/substrate

# 1 — the task plan (materialises the two perturbation arms into the harness cache)
NODE_NO_WARNINGS=1 node --experimental-strip-types $S/field-drift.ts plan \
  --out $S/field-drift-plan.json
# plan: 600 tasks over 539 distinct files

# 2 — the summaries, 8 shards over the distinct files
for i in 0 1 2 3 4 5 6 7; do
  NODE_NO_WARNINGS=1 node --experimental-strip-types $S/field-drift.ts compute \
    --plan $S/field-drift-plan.json --shard $i/8 --out $S/field-drift-summaries-s$i.jsonl &
done; wait

# 3 — the drift table and the mechanical evaluation
NODE_NO_WARNINGS=1 node --experimental-strip-types $S/field-drift.ts report \
  --plan $S/field-drift-plan.json \
  $(for i in 0 1 2 3 4 5 6 7; do echo --summaries $S/field-drift-summaries-s$i.jsonl; done) \
  --out $S/field-drift.json

# 4 — the default-path proof: nothing under src/ was touched
git diff --stat HEAD -- research/v3/prototypes/p3-fields/src/   # empty
```

## 10. Files

| file | what |
|---|---|
| `field-drift.ts` | **new** — the Measurement A instrument; reads `src/`, writes nothing to it |
| `field-drift-plan.json` | the 600 tasks over 539 files, with both frozen set ids |
| `field-drift-summaries-s{0..7}.jsonl` | one row per file: both substrates' F fraction, threshold, `e1Q95`, `e1Q50`, rule, edge fraction, radii |
| `field-drift.json` | the drift table, the paired and resolution splits, the mechanical verdicts, and every per-comparison row |
| `console-field-drift.txt` | the report run's console, unedited |
| `SUBSTRATE_2.md` | this file |

No file under `src/` was created, modified or deleted.
