# Challenger disagreement counter — first run, pre-registration

**Written and committed before the run. Nothing below moves after data is seen.**

Date: 2026-08-04. Instrument: `src/contract/challengers.ts` (report-only challengers),
`src/contract/challenger-ledger.ts` (the counter), `src/stats/` (every statistic).

---

## 0. What triggered this, and what it is not

`PHASE_1_HANDOFF.md` §5(b) parks the challenger counter's first review behind one trigger: *"once a
real corpus run has populated that file"*. `data/contract/challenger-disagreements.json` is empty.
It is empty **not** because the pair invariants have never run, but because **nothing has ever
called the ledger** — `accumulate`/`saveLedger` are exported from `challenger-ledger.ts` and, apart
from `tests/contract-challengers.test.ts`, have no caller anywhere in the repository. There is no
CLI and no automatic accumulation; a `validatePalette` call without an observation sink does not
even *compute* a challenger verdict (`invariants.ts:878` — `observe?.({…})` short-circuits its
argument list).

So this run supplies the missing caller, over the only real palettes v3 has: the 554 v2-3 palettes
distilled into `data/legacy/`.

**It is a legacy-fixture run, not a v3-pipeline run.** See §5.

---

## 1. What will be run

A new runner, `src/contract/run-legacy-challenger-counter.ts` — a **new file only**; no existing
contract logic is modified, no bar and no invariant changes behaviour. It:

1. Reads `data/legacy/endorsements.json`, `data/legacy/acceptable.json`, `data/legacy/known-bad.json`.
2. De-duplicates the 554 entries on `roleSignature` (the four role hexes) — see §2.
3. Rebuilds each as a v3 `Palette`:
   - roles from the fixture's `palette.roles` hexes, via `colorFromHex` (`src/contract/color.ts`);
   - `gradient: null` — the legacy fixtures carry a gradient *boolean*, never a v3 stop list, so
     there are no stop colours to publish (see §5a);
   - `collapse` flags derived from **exact hex equality** of (surface, background) and
     (accent, foreground), which is what invariant 1 requires of the flags and what makes the
     sanctioned-collapse exemption apply where it genuinely applies;
   - `contrast` = `resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)` (both parameters at their
     default, which is also their minimum);
   - `metadata` from the fixture's own `artwork` block — real repo-relative path, real
     `contentSha256`, real header rendition and processed size. Only `algorithmVersion` (`"v2-3"`)
     and `preprocessingVersion` are strings this run supplies; neither is read by any pair invariant.
4. Calls `validatePalette(palette, { observe })` with a raw `ObservationSink`, which is the exported,
   supported way to make the challengers run at all.
5. Folds the observations with the contract's own `tallyChallengers` and writes one ledger entry per
   palette through `accumulate` / `saveLedger`, into
   `data/contract/challenger-disagreements.json`.

Deterministic: no image is decoded, no randomness except the declared bootstrap seed (§4), and no
clock enters the ledger beyond `observedAt`, which is pinned to a single fixed ISO timestamp for the
whole run so the file is byte-reproducible.

Every ledger row is labelled so a later reader cannot mistake it for a v3 run:
`subject` is prefixed `legacy:`, and `source` names the run and says it is not a v3-pipeline run.

**Artwork images are not required and are not read.** Invariant 2 is the only check that needs
pixels, and it is not a pair invariant; it will be reported as `deferred` and contributes nothing to
the counter.

---

## 2. The unit of count, declared explicitly

**One judged colour pair, per palette, per challenger.**

A *judged pair* is a pair of published colours for which invariant 3's distinctness matrix actually
emitted an observation (`invariants.ts:878`). Pairs skipped by an exception class — a field role
against a gradient stop, or a sanctioned collapse that is both exact and flagged — are **not
judgments** and are not counted, which is the definition `ChallengerTally.judged` already carries.

Because the reconstructed palettes publish four roles and no stops, at most
`C(4,2) = 6` pairs are judged per palette, and fewer where a sanctioned collapse is exact.

**Population: 492 palettes**, being the 554 fixture entries de-duplicated on `roleSignature`
(489 with four roles, 1 with three, 2 with one). De-duplication is not optional: the counter judges
*colours*, artwork identity does not enter a colour-pair judgment, and 31 signatures appear in more
than one tier — counting the same four hexes twice is exactly the pseudo-replication defect
`src/stats/README.md` lists as having moved two frozen constants by more than 10%.

The two single-role palettes judge zero pairs. They are written to the ledger (where `queryLedger`
correctly reports their rate as `null`, never `0`) and are **excluded from every denominator and
from the subject-concentration measure**, because "these rules never disagreed" and "there was
nothing to disagree about" must not be conflated.

---

## 3. The rate, and its denominator

For each challenger independently (`direction-aware-oklab`, `ictcp-global`):

```
disagreement rate  =  disagreed / judged
```

- **Numerator**: judged pairs where the challenger's same-colour answer differs from the frozen
  OKLab regional bar's answer (`ChallengerTally.disagreed`).
- **Denominator**: judged pairs, pooled over the whole population (`ChallengerTally.judged`).
- **Pairing**: unpaired in the statistical sense — each judged pair yields one binary outcome per
  challenger; the two challengers are not compared against each other by any test here.
- **Independence**: the trials are **not** independent. Six pairs from one palette share four
  colours. The primary interval is therefore a **cluster bootstrap over palettes**
  (`clusterBootstrapCI`, `clusterBy: "palette"`, 10,000 resamples, seed 20260804), with a
  `wilsonInterval` reported beside it as the naive-independence comparison and labelled as such.
- The directional split (`challengerSaysSameIncumbentDistinct` versus
  `incumbentSaysSameChallengerDistinct`) is **reported and never pooled**, but it does **not** enter
  the decision rule below.

`ChallengerTally` carries `disagreedByRegion` but has **no `judgedByRegion` field**, so a per-region
*rate* cannot be computed from the ledger. The runner therefore also records judged-pair counts by
region, from the same observation stream, into
`reviews/challenger-counter/run-summary.json`. That side file is analysis material; the ledger
itself stores exactly what the contract's own `tallyChallengers` produces and nothing invented.

---

## 4. The decision rule

Pre-registered in full. Applied mechanically. Evaluated **per challenger**; the recommendation to
propose is made if **either** challenger triggers.

### HIGH

A challenger is **HIGH** iff **both**:

- **H1** — pooled disagreement rate ≥ **0.10**; and
- **H2** — the cluster-bootstrap 95% **lower** bound ≥ **0.05**.

> *H1, one line:* the deferred round buys a second region's perception ladders at 30 rungs of
> reviewer time, and a rival rule that parts company with the frozen bar on fewer than one judged
> pair in ten is not reaching real palettes often enough to price that.
> *H2, one line:* the point estimate must survive palette-level clustering, because six pairs from
> one palette are not six facts and a rate that collapses under resampling whole palettes was never
> a rate about palettes.

### CONCENTRATED

A challenger is **CONCENTRATED** iff **either** C-region **or** C-palette holds.

- **C-region** — the region holding the largest share of disagreements holds ≥ **0.60** of all
  disagreements **while holding < 0.40 of the judged pairs**.

  > *One line:* an even smear over the four regions is 0.25 each, so 0.60 is more than double even;
  > the second clause stops a region that merely dominates the corpus from registering as
  > concentration.

- **C-palette** — the palettes in the **top decile by disagreement count** (the ⌈0.10 × P⌉ palettes
  with the most disagreements, ties broken by `subject` ascending, over the P palettes with
  `judged > 0`) hold ≥ **0.50** of all disagreements.

  > *One line:* with at most six judged pairs per palette an even smear puts about a tenth of the
  > disagreements in the top tenth of palettes, so half is five times even — and it is precisely the
  > shape `challenger-ledger.ts` says a pooled rate must not hide ("0% on most covers and 60% on a
  > few").

  **Declared in advance:** C-palette is degenerate when the rate is very low — if fewer than a tenth
  of palettes disagree at all, the top decile holds 100% of the disagreements by construction. That
  is accepted and not patched, because CONCENTRATED alone decides nothing: the verdict requires
  HIGH ∧ CONCENTRATED, and a very low rate fails HIGH.

### VERDICT

| condition | verdict |
|---|---|
| some challenger is HIGH **and** CONCENTRATED | **propose the deferred confirming round to the reviewer** |
| every other case (including HIGH but smeared, and low however shaped) | **keep the round deferred** |

No other pattern in the data may produce a "propose". If the numbers land somewhere the rule handles
awkwardly, the write-up says so and the rule stays where it is.

---

## 5. Scope limits — stated in advance, because they will be quoted

**(a) This is a legacy-fixture run, not a v3-pipeline run.** It measures the frozen bar against its
challengers on the palettes the **previous era** produced, under the previous era's algorithm and
role semantics. It says nothing about the pair mix v3 will produce. Two concrete consequences:

- the legacy fixtures carry a gradient *boolean*, not a v3 stop list, so **no stop pairs are judged
  here at all** — only the six role pairs. A v3 palette publishes 2–4 stops, and stop-to-stop and
  role-to-stop pairs are exactly where near-identity is most likely to live. This run therefore
  **under-samples the near-identical regime the challengers are about**, in a direction that
  understates the disagreement rate;
- v2-3 role semantics are not v3 role semantics (the gradient reused background/surface as
  endpoints; v3 decouples stops from roles), so the *distribution* of role-pair distances here is a
  v2-3 distribution.

**(b) Both challenger bars were measured in `dark-neutral` alone and are applied globally.**
(`challengers.ts` module docstring; `SAME_COLOR_BAR_LIGHTNESS_AXIS` has one key on purpose.) A
disagreement outside `dark-neutral` is **a difference between two rules**, not evidence that the
frozen bar is wrong there. The other three regions are unmeasured, and this run does not measure
them.

**(c) Therefore `disagreedByRegion` is read before any total is quoted**, and every headline number
in the write-up carries its region breakdown in the same sentence or the same table row.

**(d) The region of a pair is not the region of a colour.** It is `governingRegion`
(`invariants.ts:787`): the region of whichever of the two colours has the **larger** regional bar,
matching `sameColorBar`'s straddle rule. A pair labelled `light-saturated` may contain a
`dark-neutral` colour.

**(e) A disagreement is arithmetic, not a verdict.** The direction-aware bar is 0.02063 against
`dark-neutral`'s frozen 0.00932; pairs whose distance falls between the two are *guaranteed* to be
scored differently by the two rules. The counter's question is not whether such a band exists — it
does, by construction — but **how often real palettes land in it**. Nobody has been shown any of
these pairs.

---

## 6. What this run cannot decide

**It cannot move any bar, any threshold, or any constant.** Its single output is a recommendation
about whether to *propose* the deferred confirming round to the reviewer, who decides.
