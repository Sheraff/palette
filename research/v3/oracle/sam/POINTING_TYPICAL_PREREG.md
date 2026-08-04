# Typical-strata pointing probe — pre-registration

**Written before any inference was run.** 2026-08-04. **For:** the reviewer and the orchestrator.
**Implements:** `POINTING_PROBE_NOTES.md` §13.8 as refined by §14.7 (commits `2d5322c`, `293e6f1`).
**GPU:** single-owner slot held. `pgrep` confirmed no MLX process running before this was written.

Everything below — the sampling frame, the draw, the point protocol, the three policies, the
panel, the question, and **the bar** — is fixed here and is not to be changed after a number is
seen. Deviations get recorded in `POINTING_PROBE_NOTES.md`, never by editing this file.

Batch id: **`pointing-typical-1`**.

---

## 1. The question

`pointing-ground-1` measured the pointing→SAM route on the **misfit tail** and failed its bar:
dot-right 7/8, dot-right-and-wash-right 3/8 against a bar of ≥6/8 and ≥4/8. §13.2 disclosed two
things afterwards that govern every number: the reviewer answered *"could this be considered
correct"* rather than *"is this correct"*, and the eight covers were **exactly** the covers he had
already called "none discernible". So the round measured the hard tail, leniently.

**This round asks the one question that round could not: does the wash failure rate hold on
ordinary covers, or is it a property of the hard tail?**

§14 then split the wash failure into two shapes wanting opposite repairs (under-coverage on
multi-region grounds; over-coverage that swallows the subject) and added two candidate policies.
So this round asks a second question at the same time: **which selection policy is right**, on
identical points, so the reviewer's keypress separates the policy from the pointer.

---

## 2. The sampling frame and the draw

**Frame:** the 142 `included` entries of `research/v3/data/oracle-premise/eval-set.json`
(eval-142), **minus, by artwork id, every cover in `pointing_covers.COVERS`.**

§13.8 says "the misfit set excluded by id, so the two strata are disjoint". I exclude the **full
15-cover pointing set**, not only the 9 misfits: `pointing-ground-1` contained two controls
(`elephunk`, `0002dfdc`), and disjointness from the round being compared against is the point of
the clause. Excluding a superset can only strengthen it.

**Stratify on nothing else.** §13.8 is explicit, and further stratification would reintroduce the
selection problem the misfit round suffers from.

**The draw is deterministic and documented:** eligible artwork ids sorted ascending, shuffled by
`random.Random(20260804)`, first **16** taken as the sample and the next **4** held as reserves in
order. The seed is written here, before the draw. The realised draw is echoed into the results
JSON and into the notes.

**Reserve rule (the only substitution permitted).** If a drawn cover yields **zero** in-frame
points across all of its attempts (§3), it is replaced by the next unused reserve, in order, and
**both** the failure and the substitution are recorded. Nothing else may be substituted, and no
cover may be dropped for looking hard, uninteresting, or unflattering.

**Answer-key caveat, carried from §13.8 verbatim in force:** typical covers have no
`ground-freetext-1` prose behind them, so there is **no independent answer key**. This round
measures reviewer judgement only and is labelled that way everywhere.

---

## 3. The points — and the one place the spec could not be followed as written

§14.7 addition 2 requires **≥3 points per cover**, and proposes "repeat the `plain` call, or take
the pointer's own multiple points where it emits them".

**Neither route works as written, and this was checked before running, not discovered after:**

- `pointing_probe.py:127` calls `generate(..., temperature=0.0)`. Repeating the `plain` call is a
  second sample of a **deterministic** process — `pointing_phrasing_sweep.py`'s own docstring says
  so. Three repeats would be one point recorded three times.
- MolmoPoint emits one point on `plain`: `mean_points_per_answer` 1.0 across the sweep. Of 120
  sweep rows exactly two carried more than one point, neither on `plain`.

**The protocol, fixed here:**

| draw | temperature | what it is |
|---|---|---|
| 1 | **0.0** | the **shipped** point — bit-identical to what any prior or future run at the pinned revision produces |
| 2 | 0.7, `top_p` 0.95, `mx.random.seed(20260804 + 2)` | a sample of the same prompt |
| 3 | 0.7, `top_p` 0.95, `mx.random.seed(20260804 + 3)` | a sample of the same prompt |
| 4, 5 | as above, seeds `+4`, `+5` | **only if** fewer than 3 *distinct* in-frame points have been obtained |

Prompt is `plain` — `point to the background` — on every draw. Model, pin, and 640 px pointer cap
unchanged. **Temperature is not on §13.8's "unchanged, deliberately" list** (which fixes phrasing,
model pin, panel, question and answer keys); this is the minimal change that makes addition 2
executable, and draw 1 keeps the shipped configuration present in every point set.

Points are deduplicated at the pixel level. A cover proceeds with however many distinct points it
has after at most 5 draws, and the count is recorded per cover. Fewer than 3 is a reported
shortfall, not a silent one.

---

## 4. The three policies, on identical points

All three tiles of a cover are grown from **the same point set**. The dot pattern is therefore
constant across a cover's three tiles and the reviewer's keypress separates the policies.

| tile policy | what it does | calls |
|---|---|---|
| `containing` | `segment_from_points(all points)`, `SELECT_CONTAINING` | one multi-point decode |
| `ground` | **the same decode**, `.with_selection(SELECT_GROUND)` | none — reselection only |
| `union` | `segment_ground_union(all points)` — one decode per point, union the admissible | K decodes |

`containing` and `ground` share one forward pass by construction, so they differ **only** in which
of the four candidates is taken. That is the comparison §14.4 could only argue from scalars.

**Every candidate is persisted** — `candidate_records(rle_encode=common.rle_encode)` on every
segmentation, multi-point and per-point alike. §14.7 addition 1, non-negotiable: its absence is
what made §13.6's own recommendation only half-executable, and it is why the helper was written.

---

## 5. The round

**48 tiles** = 16 covers × 3 policies. At the observed ~11 s/tile that is ~9 min for one reviewer,
inside §13.8's ~10 min budget.

**Tile order is shuffled** by `random.Random(20260804 + 1)` over all 48, so policy identity is not
cued by position and a cover's three tiles do not sit adjacent. The mapping tile→(cover, policy) is
recorded in the sample JSON and is never on the panel.

**The panel, unchanged from `pointing-ground-1`:** two panels, left the bare artwork, right the
same artwork with the SAM mask as a pink wash and the prompted pixels as green dots. **No caption,
no area number, no phrasing, no model name, no policy name.**

**The question and the four answers, verbatim from §12.6 — not one word changed:**

> "The pink wash is what the model called the background. It was grown from the green dot — the
> single pixel the model pointed at. Is the dot on the background? Is the wash the background?"

Answers on digits `1`–`4`: dot right + wash right / dot right + wash wrong / dot wrong / can't
tell. Digits deliberately: `review-ui/oracle.js:322` resolves an answer hotkey **before** falling
through to `u` (undo) and `r` (release), so a letter hotkey can make release unreachable.

**The question says "the green dot — the single pixel" and this round shows several dots.** The
question is frozen by §13.8 ("the question and four answer keys **verbatim**. Any wording change
breaks comparability"). So the plural is explained in the **framing text**, which is per-round and
not frozen, rather than by editing the frozen question.

**REQUIRED FRAMING TEXT — §13.8's lesson of §13.2, and it is the reason this round exists:**

> Answer **"is this correct"** — not "could this be considered correct". The previous round was
> answered leniently and that cost it its interpretability. Where there are several green dots,
> they are all points the model pointed at, and the pink wash was grown from all of them together.

Without that instruction the two rounds are not comparable at all.

---

## 6. THE BAR

§13's bar was **dot-right ≥ 6/8 (0.75)** and **dot-right-and-wash-right ≥ 4/8 (0.50)**, as a
conjunction. §13.8 requires the same conjunction in the same dot/wash split at n=16, plus — since
§14.7 splits the round three ways — a per-policy form, which §13.8 does not state and which is
therefore derived here, before the round goes up.

**The dot is a property of the cover, not of the policy** (identical points across the three
tiles), so it is scored once per cover:

> **Cover dot verdict** = majority of that cover's three tile answers. `can't tell` counts as
> neither. **A tie is scored dot-wrong** — the conservative direction, fixed here so it cannot be
> chosen later.

### 6.1 The bar, in three parts

> **B1 — DOT (the pointer).** `dot-right ≥ 12/16` (0.75 — §13's rate, unchanged).
>
> **B2 — WASH (per policy).** For a policy `P`: `dot-right-and-wash-right ≥ 8/16` (0.50 — §13's
> rate, unchanged) counted over that policy's 16 tiles.
>
> **B3 — THE ROUTE (the conjunction).** Pointing→SAM carries forward as a ground route only if
> **B1 holds AND at least one of the three policies clears B2.** Both halves, as in §13. Neither
> half alone licenses anything.

### 6.2 When `DEFAULT_SELECTION` moves — and it is a separate bar

§14.5 left the default at `containing` deliberately, on the grounds that a 3/6-vs-1/6 in-sample
win on the hard stratum is exactly the evidence §13 exists to refuse, and wrote: *"The default
moves when the typical-strata probe says so."* This is that clause, made explicit before the data:

> **B4.** A challenger (`ground` or `union`) replaces `containing` as `DEFAULT_SELECTION` only if
> **all three** hold:
> 1. the challenger clears **B2**;
> 2. it beats `containing` by **≥ 3 covers of 16** on dot-right-and-wash-right (a 1–2 cover margin
>    is inside the noise that sank the last round by one tile);
> 3. it breaks **at most 1** cover that `containing` got both-right — §14.8's `00030075` worry,
>    that a union rule costs more single-region covers than the multi-region covers it buys.
>
> If two challengers qualify, the larger margin wins; on a tie the default stays `containing`.
> **Failing B4 while clearing B2 is not a promotion.** The default stays put.

### 6.3 The comparison against `pointing-ground-1`, and its known bias

Reported alongside: this round's rates against **7/8 dot** and **3/8 composite**.

**The comparison is biased AGAINST this round and the bias is one-directional.** Round 1 was
answered "could this be considered correct", so its 7/8 and 3/8 are **lenient ceilings** — the
strict numbers can only be lower. This round is answered strictly, by instruction (§5). Therefore:

> **A tie reads as an improvement. A small loss is not evidence of a worse stratum. Only a gain is
> reported as a gain, and it is reported as a floor.**

Nothing in this round licenses raising §13's qualitative anchor, which stands: **"it wasn't
amazing."**

### 6.4 What follows from each outcome — written now, so no branch can be manufactured later

| outcome | reading | what happens next |
|---|---|---|
| **B1 ✓, B2 ✓ for ≥1 policy** | the misfit round measured the tail, not the route | route carries forward; B4 decides whether the default moves; the residual cross-check becomes the next measurement |
| **B1 ✓, B2 ✗ for all three** | the pointer is fine and the wash fails on *ordinary* covers too — the §14 repairs do not generalise | **the wash is a route-level defect, not a hard-tail artifact.** Stop point-prompt engineering; §14.8's third clause fires and the residual route is the answer |
| **B1 ✗** | the pointer misses on ordinary covers, where round 1's dot half passed 6/6 on its key | **route-dead.** The phrasing space is searched (§12.3), the better pointer is in use, nothing is left to turn |
| **B1 ✗, B2 ✓** | incoherent — a wash cannot be right where the dot is wrong under this scoring | report as an instrument fault and score nothing until it is understood |

---

## 7. Cost and the stop rule

16 covers × 3–5 pointer calls ≈ 48–80 MolmoPoint calls at the measured 3.9 s ≈ **3–5 min**; 16 SAM
encodes plus ~64 decoder calls, decoders being milliseconds.

**Budgeted separately and honestly (§12.7):** `common.load_sam()` sha256s the 3.5 GB weights file
**before** its own timer starts. The first load of a session cost ~8 min wall and **presents exactly
like a wedged process** — low CPU, flat RSS, no output. This is a fresh session, so the
verification runs; `--no-verify-weights` is licensed only after a verified load in the same
session, and is not used here.

> **STOP RULE:** total budget ~15 min of GPU slot. If the run projects past **~25 min**, it stops
> and reports rather than overrunning a single-owner slot.

---

## 8. What would change my mind

- **A candidate-level counterfactual that comes back empty** (§14.8). With candidates finally
  persisted, if the four masks from the shipped point never contain a better ground on the failing
  covers, then `SELECT_GROUND` is treating a model limit as a selection defect and §14's whole
  framing is wrong. This round is the first that *can* check it.
- **`union` winning on multi-region covers while losing single-region ones.** That is a loss, not
  a tuning problem, and B4.3 is what catches it.
- **The dot failing on typical covers.** Round 1's one durable positive was 6/6 dots on the covers
  with a key. If that does not survive contact with ordinary artwork, it was the tail flattering us.
