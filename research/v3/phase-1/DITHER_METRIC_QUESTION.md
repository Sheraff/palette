# The dither metric question — settled by reading the instrument

**Status: pre-registration committed before the empirical check was run.** This document was
committed once with §5.1 (the pre-registration) filled in and §5.2 (the results) empty, then a
second time with the results. The two commits are the audit trail; `git log --follow` on this file
shows them.

**Written 2026-08-04**, against `research/v3/` at branch `v3-phase-1`.

---

## 0. Vocabulary, so nothing here has to be looked up

Every term the rest of this document leans on, defined once.

| term | what it means here |
| --- | --- |
| **exact triple** | a colour written as its three 8-bit channel values, e.g. `(31, 42, 197)`. Two colours are the *same exact triple* only if all three bytes match. Equivalent to hex-string equality. |
| **exact-pixel rule** | the contract's invariant 2: *"Every published colour is an exact pixel of the input… the same three 8-bit channel values, not the nearest quantised bin"* (`src/contract/invariants.ts:1387-1392`, ruling text at `PHASE_0_DECISIONS.md:240`). One bounded exception exists — a declared escape to pure white or pure black — and is irrelevant to everything below. |
| **OKLab distance** | Euclidean distance in the OKLab colour space. `PHASE_0_DECISIONS.md` §3 calls it "the one ruler"; it is `colorDistance()` at `src/contract/color.ts:175-177`, built on `okLabDistance()` at `:170-172`. All bars below are in these units. |
| **same-colour bar** | the OKLab distance under which two colours are ruled to be *the same colour*. It is **regional**: four measured values, `SAME_COLOR_BAR_BY_REGION` at `src/contract/constants.ts:153-158` — `dark-neutral` 0.00932, `dark-saturated` 0.01502, `light-neutral` 0.01627, `light-saturated` 0.02293. For a *pair* of colours the bar is the larger of the two regions' bars (`sameColorBar()`, `src/contract/color.ts:249-254`). |
| **regional bar mode** | scoring two colours as "the same" iff their OKLab distance is **strictly less than** that pair's regional same-colour bar. |
| **exact-hex mode** | scoring two colours as "the same" iff their hex strings are identical. A distinct, much stricter relation. |
| **agreement** (this harness) | one trial agrees iff **all four role colours** agree under the chosen mode. It is a conjunction: one role outside the bar fails the whole trial (`src/robustness/compare.ts:88, 93`). |
| **dither arm (`dither-lsb1`)** | the perturbation under discussion: a ±1 checkerboard on the **blue channel only**, `+1` where `(x + y)` is even and `-1` where it is odd, clamped to `[0,255]` (`src/robustness/perturb.ts:121-133`). Both sides are written as lossless PNG from the same decode, so the two images differ **only** by that one bit per pixel (`perturb.ts:208-235`). |
| **ε-agreement (v2-3)** | the *older* campaign's agreement relation: the **mean** of the four roles' OKLab distances is ≤ **0.04**. One number, averaged across roles. Not the same relation as the regional bar, and not the same relation as exact hex. |
| **byte-identical palette (v2-3)** | the *older* campaign's strictest relation: the four role hexes, the gradient boolean, and the gradient midpoint hex all match exactly. |

---

## 1. The question in plain language

The output contract obliges a palette system to publish colours that are **exact pixels of the
artwork**. The robustness harness perturbs an artwork in ways a human cannot see — one of them being
a ±1 least-significant-bit dither — and asks whether the system gives back the same palette.

Arm F′ observed that these two things may be at war with each other. If you nudge every pixel's blue
channel by one, the set of exact triples in the image changes; a system obliged to publish an exact
triple may therefore be *unable* to republish the triple it published before, no matter how good it
is. F′'s conclusion, verbatim from `phase-1/DIVERGENCE_MAP_2.md:1081-1089`:

> …a system obliged to publish an exact pixel cannot in general publish the identical triple. I
> therefore do not claim bit-identical stability and I do not think **any conforming system can**. …
> **If the harness currently scores dither robustness as hex equality, that metric is unsatisfiable
> under the exact-pixel rule** and, by the standing rule that an instrument which blocks good work is
> the thing that gives way, I would argue the metric rather than the paradigm.

Note the conditional. Everything F′ asks for turns on *"if the harness currently scores dither
robustness as hex equality"*. That is a question about code, and this document answers it by reading
the code.

Three things are then in scope:

1. what the harness compares, per arm;
2. where the brief's *"a ±1-LSB dither moved all 114 test palettes"* comes from and what relation the
   word "moved" carried there;
3. whether F′'s in-principle claim is true, and whether — true or not — it *binds* the instrument.

---

## 2. Headline: the premise is wrong about the harness, and right about the brief

**The harness does not score hex equality. It has never scored hex equality. It scores the contract's
regional same-colour bar, per role, identically on every arm — the dither arm included.** The
conditional in F′'s paragraph is false, so the argument it introduces does not fire, and no change to
the instrument is warranted on this ground.

**But the brief's headline evidence is genuinely metric-mixed, and in a way that matters more than the
harness question did.** The two v2-3 figures the Phase 1 author brief quotes side by side —

> 72.8% palette agreement on re-encode, a ±1-LSB dither moved all 114 test palettes
> (`phase-1/packet/PHASE_1_AUTHOR_BRIEF.md:60-61`)

— **are stated against two different relations.** 72.8% is v2-3's **ε-agreement** (mean role OKLab
distance ≤ 0.04). "Moved all 114" is v2-3's **byte-identity** count. They are not two readings of one
ruler; they are two rulers, and the stricter one was quoted for the more alarming claim.

Read on the *same* ruler as the 72.8% figure, the same v2-3 dither experiment reports **86 of 114
(75.4%) agreeing within ε** — a number that sits alongside re-encode's 72.8% rather than screaming
past it. Both numbers appear in the same table of the same document (§6.1 of the v2-3 `EXPERIMENT.md`,
commit `56506d0`); only one of them travelled into Phase 1.

So the finding to carry forward is not "the instrument is broken". It is: **the qualitative claim that
v2-3 was fragile under a one-bit dither survives intact, but the specific figure "moved all 114"
should never again be printed next to "72.8%" without saying that the first is byte-identity and the
second is a distance criterion.** The place where the two are currently printed together is
`src/robustness/README.md:104`, which is in the author packet verbatim.

---

## 3. What the instrument does today, cited

### 3.1 One comparison function, one mode, every arm

`check.ts` resolves the comparison options **once per run** and hands the *same* object to every
trial, whatever arm it belongs to:

- `src/robustness/check.ts:482` — `const compare = options.compare ?? DEFAULT_COMPARE_OPTIONS`
- `src/robustness/check.ts:240` — `comparison: comparePalettes(left, right, compare)`

`runTrial` is arm-agnostic: it takes a left path and a right path (for the JPEG arms the left path is
the corpus file, for the dither arm it is a generated PNG), extracts a palette from each, and calls
the one comparison. **There is no per-arm branch anywhere in the comparison path.** Rendition pairs,
`jpeg-q92`, `jpeg-q85`, `jpeg-q75` and `dither-lsb1` are all scored by the identical relation.

### 3.2 The relation is the regional same-colour bar, per role

`src/robustness/compare.ts:35-38`:

```ts
export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
	barMode: "regional",
	roles: ROLE_NAMES,
}
```

marked `[REVIEWED]` in its docstring (`compare.ts:29-34`) with the reviewer's own wording: *"same-palette
= every role within its regional same-colour bar"*.

The per-role test, `compare.ts:58-60`:

```ts
const bar = barFor(left, right, barMode, fixedBar)!
const distance = colorDistance(left, right)
return { role, left: left.hex, right: right.hex, distance, bar, same: distance < bar }
```

`barFor` is **imported from `src/adjudication/match.ts:62-81`**, not reimplemented (`compare.ts:23`),
and in `regional` mode returns `sameColorBar(first, second)` from the contract
(`src/contract/color.ts:249-254`). So the bar the robustness harness uses is literally the contract's
bar object, not a lookalike.

The trial verdict, `compare.ts:88, 93`: `same` is the conjunction over the four roles and nothing
else. Two further agreements are computed and **deliberately excluded** from the verdict —
`collapseAgrees` and `gradientPresenceAgrees` (`compare.ts:99-102`), reported beside it.

### 3.3 `exact-hex` exists, and is fenced off from every headline

`exact-hex` is one of four bar modes (`src/adjudication/types.ts:228`). Its own documentation,
`src/adjudication/types.ts:225-226`, says:

> `exact-hex` — string equality. Present for one purpose only: reproducing hit counts computed
> before the bar landed, which `data/legacy/README.md` records as provisional. **Never a live mode.**

Reaching it requires an explicit CLI flag (`--bar-mode exact-hex`, `check.ts:570-573`); the README
labels the flag *"diagnosis only — every headline number is `regional`"* (`README.md:38-39`); and
every report records the mode it ran under (`check.ts:430`, and the `compare` block written into the
report JSON). The one committed report on disk,
`data/robustness/reports/toy-median-offsets.json`, carries `"compare": {"barMode": "regional", …}`.

**Conclusion of §3: there is no configuration in which the harness scores the dither arm by hex
equality unless a human types a flag whose own docstring says never to.**

### 3.4 What the harness does *not* do — relevant to F′'s alternative

F′ proposed scoring *decision* stability instead: "role identity, the gradient boolean, the stop
count, and the collapse and escape flags, with published colours required to move less than the
same-colour bar."

The harness already implements the **second half** of that (colours within the bar) as the whole of
its verdict, and it **computes but does not score** two of the four decision flags —
`collapseAgrees` and `gradientPresenceAgrees` (`compare.ts:99-102`). Stop count and escape are not
compared at all. The exclusion is deliberate and documented (`compare.ts:68-75`, README decision
list item in `README.md:162-164`): folding them in would widen the relation past the definition the
reviewer approved. So F′'s proposal is, against today's code, a request to **add** flag agreement to
the conjunction — a *stricter* harness, not a looser one — and is not the change the "unsatisfiable
metric" argument was reaching for.

### 3.5 The packet did contain the answer

`phase-1/packet/MANIFEST.json` lists `catalog/src/robustness/README.md` as
`"kind": "verbatim-whole-file"`, `mayContainCampaignConclusions: true`, *"Delivered in full"*. The
copy at `phase-1/packet/catalog/src/robustness/README.md:72-79` carries decision 1 — *"'Same palette'
is the contract's regional same-colour bar, per role"* — in full. Authors were given the answer; the
divergence in pre-registrations is not an information-withholding failure. It is, most likely, the
brief's §1 line being far more prominent than a catalog README's numbered-decision list.

---

## 4. Where "moved all 114" comes from, and under which metric

**Provenance.** The figure is from v2-3's `research/v2-3-experiments/resolution-pairs/`, which exists
only in commit `56506d0` (it is not in the working tree). Two files carry it:

- `perturbation-probe.ts` (mode `requantize`) — decodes the 640 px file, applies *exactly* the
  checkerboard the v3 harness reproduces, re-extracts.
- `perturbation.mjs` — the scorer.

**The metric.** `perturbation.mjs` computes two relations per pair, and only two:

```js
const okd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const roleCost = (A, B) => ROLES.reduce((s, r) => s + okd(A[r], B[r]), 0) / 4
…
const key = (r) => ROLES.map((x) => r.winner[x]).join(':') + (r.winner.gradient ? '|g' : '|f') + '|' + (r.midpoint ?? '-')
…
return { rc: roleCost(a.oklab, b.oklab), same: key(a) === key(b), … }
```

and reports them as two separate columns:

```js
const ident  = rows.filter((r) => r.same).length      // "identical"
const within = rows.filter((r) => r.rc <= 0.04).length // "within eps"
```

So:

- **"identical"** = the four role hexes **plus** the gradient boolean **plus** the gradient midpoint
  hex, all string-equal. Stricter than hex equality on the four roles alone.
- **"within ε"** = the **mean** of the four roles' OKLab distances is ≤ **0.04**.

**The two figures, in their source table** (`EXPERIMENT.md` §6 and §6.1, commit `56506d0`), n = 114
artworks:

| v2-3 contrast | identical | agree within ε = 0.04 |
| --- | --- | --- |
| re-encode, JPEG q92 4:4:4, same size | 22 (19.3%) | **83 (72.8%)** |
| **±1 LSB dither, blue channel** | **0 (0%)** | **86 (75.4%)** |

The brief quotes the **bolded 72.8% from the ε column** and the **bolded 0 from the identity
column** — one figure from each column, as though they were one measurement.

**Is "moved all 114" reproducible from the v3 instrument?** No, and not because of a defect:

1. The v3 harness's default relation exists in *neither* v2-3 column. It is per-role conjunction
   against regional bars of 0.00932–0.02293, which is stricter than a 0.04 *mean* in the usual case
   and looser than byte-identity always.
2. The v3 harness runs a different sample (100 covers frozen in
   `data/robustness/perturbation-set-1.json`, not v2-3's 114 pairs) against a different candidate.
3. The v2-3 code is not in the working tree; only the perturbation *definition* was reproduced
   (`src/robustness/perturb.ts:9-27`), on purpose.

The v2-3 experiment's own stated limit, carried into the v3 README (`README.md:59-61`), is worth
repeating: *"A different dither would give a different number; the qualitative result (0 of 114
unchanged) is what matters and would not survive being quoted as a precise sensitivity."*

**The concrete defect this exposes** — and it is small, textual, and inside an instrument's README
rather than inside an instrument:

- `src/robustness/README.md:104` — *"The baselines: re-encode **72.8%**, dither **0 of 114**
  unchanged"* — is a single sentence containing one ε number and one identity number, presented as
  one row of baselines.
- `src/robustness/README.md:131-134` — *"The toy survives the dither far better than v2-3 did (92% vs
  0 of 114)"* — compares a **regional-bar** rate (92%) against a **byte-identity** count (0 of 114).
  The comparable v2-3 number is 75.4%, and the honest sentence is "92% against v2-3's 75.4% on a
  looser relation", which is a much smaller gap and still points the same direction.
- `README.md:66-68` (decision 1) already warns that v2-3's ε and the regional bar *"compare in
  magnitude and direction, not decimal places"*. That warning covers the 72.8%-vs-69.0% comparison
  honestly. It does **not** cover the dither comparison, because that one crosses a category (a
  distance criterion against an identity criterion), not a calibration.

---

## 5. Is F′'s incompatibility claim true?

### 5.1 Pre-registration

*Written and committed before the check below was run.*

**Sample.** All **100** covers of `data/robustness/perturbation-set-1.json` — the frozen set the
harness itself uses. No new sampling decision is taken; all 100 resolve on disk under
`/Users/Flo/GitHub/palette`.

**Procedure.** For each cover, decode exactly as `src/robustness/perturb.ts:211` does
(`sharp(path).raw()`), giving the pixel array `D`. Apply `ditherBlueChannelLsb` verbatim
(`perturb.ts:121-133`) to a copy, giving `D'`. Both correspond to the two lossless PNGs the harness
actually compares, whose pixels are unaltered by the PNG round trip.

**Measures.**

| id | measure |
| --- | --- |
| **T1** | *modal-triple survival* — is the most frequent exact triple of `D` present anywhere in `D'`? |
| **T2** | of the 16 most frequent triples of `D`, how many are present in `D'`? |
| **T3** | *pixel-weighted survival* — the fraction of `D`'s pixels whose exact triple is present somewhere in `D'`. |
| **T4** | *distinct-triple survival* — `|triples(D) ∩ triples(D')| / |triples(D)|`. |
| **T5** | *forced-move bound* — for each triple of `D` that does **not** survive, the OKLab distance from it to the nearest triple that is guaranteed present (see the argument below), pixel-weighted; compared against the smallest regional same-colour bar, 0.00932. |

**The T5 guarantee, stated before measuring.** For any triple `T = (r, g, b)` occurring at some pixel
`p` of `D`, `D'` contains at that same position `(r, g, clamp(b ± 1))`, the sign fixed by `p`'s
checkerboard parity. Therefore **at least one of `T`, `(r, g, b+1)`, `(r, g, b-1)` is always present
in `D'`**, and the distance a system is forced to move — *if it wants the same conceptual colour* —
is at most one blue LSB. T5 measures that bound empirically; it does not need to search `D'`.

**Decision rule for F′'s claim** ("no conforming system can republish an identical triple"):

- **strictly true** — T1 fails (modal triple lost) in ≥ 95 of 100 covers **and** median T4 ≤ 0.05.
- **true for a class** — the covers split: ≥ 20 lose the modal triple and ≥ 20 keep it, or T4 is
  visibly bimodal.
- **overstated** — T1 survives in ≥ 80 of 100 covers **and** median T4 ≥ 0.5.
- If none of the three bands is hit, report the numbers and name the nearest, flagged as judgement.

**Decision rule for whether the claim *binds the harness*** (a separate question, deliberately
pre-registered separately):

- **does not bind** — the 99th percentile of T5 (pixel-weighted) is **below 0.00932**, the smallest
  regional bar. Then no exact-pixel republication can be forced across the same-colour bar by this
  dither, for any algorithm and any artwork in the set.
- **binds** — more than 1% of pixel mass has a forced move at or above its own colour's regional bar.

**What this check cannot show.** It measures *availability of colours*, not *behaviour of
algorithms*. A system can still move far more than the forced bound for its own reasons — a tie
flipping, a cluster boundary crossed, an argmax changing hands. A "does not bind" result says the
metric is **achievable**, not that any given candidate will achieve it. That distinction is stated
here in advance so it cannot be blurred afterwards.

### 5.2 Results

*Filled in after the run. Empty at the pre-registration commit.*

---

## 6. Options

*Filled in after §5.2.*

---

## 7. Measurement versus judgement

*Filled in after §5.2.*
