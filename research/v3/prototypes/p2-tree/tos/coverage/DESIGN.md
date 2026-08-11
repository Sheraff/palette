# `tos/coverage` — identity-coverage allocation

**Worker K, cycle 3, 2026-08-05.** Design prototype behind candidate id **`p2-tos-coverage`**.
Integration into `../candidate.ts` is a later, sequenced decision — nothing here changes what
`p2-tos` publishes.

Input: `../../DECISIONS.md` **D9** (the mission, verbatim), **D3** (salience gates identity;
text-colour-leads is supreme), **D4** (identity-coverage is a grading axis), **D5** (accent should sit
in a different colour *family*), **D8** (concentration beats population), **D10.3**;
`../../review-rounds/round-3-tradeoffs/OUTCOME.md` (the Strawberry Moon note) and
`round-3-quality/OUTCOME.md` items 1–2; `../integration-NOTES.md`.

## 1. What a family is

A **family** is a maximal run of the hue circle among the pool's *chromatic, non-field* colours, cut
wherever the circle shows a gap wider than one family separation.

- **Population** — every retained **mark** node of every lane, minus the ground chain: exactly
  `pipeline.ts`'s `poolMarks`, reconstructed from the published `Parse` so the census and the accent
  ranking read one pool. Node ids are globally unique across lanes, so id order subsumes lane order.
- **"beyond the field"** — a colour inside the same-colour bar of the published background or surface
  is dropped. The contract's own ruler, unchanged.
- **"chromatic"** — `colorRegion(c)` ends in `-saturated`, i.e. OKLab chroma ≥ `REGION_CHROMA_BOUNDARY`.
  That boundary is *the bracketing rounds' own strata boundary* `[REVIEWED]`, so a colour counts as
  chromatic here exactly when the reviewer's judgements were stratified as saturated.
- **the separation** — the same-colour bar's hue geometry. Two OKLab colours of equal lightness and
  chroma `C` separated by hue angle `Δh` sit at distance `2·C·sin(Δh/2)`. Solve at the weakest chroma
  that still counts as chromatic:
  `Δh = 2·asin( SAME_COLOR_BAR_BY_REGION["light-saturated"] / (2 · REGION_CHROMA_BOUNDARY) )`
  `= 2·asin(0.02293 / 0.1) = 0.46272 rad = **26.51°**`.
  `light-saturated` is the larger of the two saturated bars, chosen for the same reason `sameColorBar`
  itself takes `Math.max` on a straddling pair — the wider bar gives *fewer, wider* families, so the
  census reports ≥2 families less often and the rule fires less often. Where a derivation is a reasoned
  default rather than a measurement it should err toward leaving the published palette alone.
- **grouping** — single-linkage on the sorted hue circle. No gap wider than the separation ⇒ **one
  family** (a continuous wheel), which is the conservative outcome. Order-independent by construction
  and asserted so (`tests/census.test.ts`).

**Ranking (D8: concentration beats population).** Lexicographic, no thresholds, no exclusions:
1. **salience level** — 0 when any of the family's nodes is at or below the pool's *lower-median* MSER
   growth (D3's split, the same order statistic `pipeline.ts` uses; asserted equal to the value the
   pipeline publishes in `parse.notes`);
2. **stability** — the family's best (smallest) growth;
3. **concentrated mass** — the largest single node's **own**-area fraction, never a sum: one coherent
   mark of area *a* outranks ten specks totalling 10*a*. The sum is reported and never ranked on;
4. **hue**, for a total order.

No family is ever excluded for being small — that is the mass floor D8 says excludes exactly what the
reviewer asks for.

## 2. The allocation order

`background`, `surface` and `foreground` resolve **under the rules that already exist** — this module
never touches them, so D3's text-colour-leads foreground is untouched by construction. Let `R` be the
families those three represent (*represented* = within the bar of a published colour, **or** the
published colour is itself chromatic and lands in that family under the census's own membership rule —
see §4). Then the accent ranking is re-ordered to put the highest-ranked family **not** in `R` first,
and `roles/assemble.ts` walks it exactly as before: same admissibility, same twin matrix, same
whole-palette re-validation, and inside the preferred family **D1's chroma-first order decides**.

Three narrowings, so the rule only ever *increases* the number of represented families:

| condition | action | why |
|---|---|---|
| fewer than 2 families | no change, byte-identical | D9's premise; asserted on demo-20 |
| `R` empty | no change | the accent is the sole carrier; moving it spends D1's *"correct shade of red"* and buys no coverage |
| the current accent already sits in a family outside `R` | no change | coverage is already 2; swapping one uncovered family for another gains nothing |

If nothing in the preferred family survives the assembly walk, the module publishes the **baseline**
and says so (`coverage-no-op:preferred-family-did-not-survive-assembly`) rather than publishing a
fall-through the rule did not intend.

## 3. Measurements (demo-20, this worktree, 2026-08-05T12:28Z)

`node --experimental-strip-types prototypes/p2-tree/tos/coverage/measure.ts`

- **12/20 covers find <2 families** — byte-identity path, asserted by `tests/byte-identity.test.ts`.
- **3/20 covers change, all of them the accent only.** Field roles, foreground, gradient, collapse
  flags and metadata are asserted byte-identical on every cover.
- dev loop, `--no-cache`: **20 ok · 0 failed**, and **0 contract violations · 0 forbidden twin pairs**
  over the twenty published palettes.
- sequential wall time **711 → 727 ms/cover (1.022×, +16 ms)**. The cost is the census plus, on the
  three covers that fire, two extra assembly walks — one of them the replica check of §4.
- **acceptance (a)**, `…35b967964d`: `#dfe0d0 · #f3f3f3 · #edbab9 · #6a723f`. The foreground `#edbab9`
  (chroma 0.0591, hue 19.7°) already represents the red family the coral `#d25068` (hue 12.3°) leads,
  so the accent goes to the green family and publishes the reviewer's own preferred olive. The coral
  is still in the pool and still the most chromatic candidate in it — D9's re-scoped recall claim,
  asserted.
- **(b) cal-014 item 1**, `…39b7dbc802fd`: census 2 families (a red/orange arc 343–60° that the
  **background** `#e66f6b` represents, and a violet arc 286–300°). Baseline
  `#e66f6b · #a47d7e · #fbfbfb · #383c48` → coverage moves **only the accent**, `#383c48 → #72688a`.
  The reviewer's three rejected roles were background, surface and accent; this rule reaches **one** of
  them, and replaces a near-neutral slate with a violet the artwork carries. It does **not** address
  the rejected background or surface, which are field roles and out of this rule's scope.

## 4. What this deliberately does not do

- **No new constant.** `FAMILY_HUE_SEPARATION` is `[DERIVED]` — computed at load from two committed
  contract values (`SAME_COLOR_BAR_BY_REGION["light-saturated"]`, `REGION_CHROMA_BOUNDARY`, both
  `[REVIEWED]`) and it moves if either is recalibrated. No number is written down in this directory.
  `lowerMedian` is re-implemented rather than imported from `roles/text.ts` (another worker's file,
  mid-flight) and is asserted equal to the value the pipeline published.
- **It does not move the foreground or the surface into the second family**, which D9 permits
  (*"fg/surface can carry the second family"*). Declined: the foreground order is text-colour-leads
  under D3 and identity-over-legibility, both priced directly, and a coverage preference may not sit in
  front of two rulings that were. The accent is the slot D9's own diagnosis is about.
- **It widens D9's "represented = within the bar of a published colour"** to also count a published
  chromatic colour that lands in the family by hue. Bar-only fails on the acceptance cover itself:
  `#edbab9` is 0.11 from every red in its family — five bars clear — so bar-only would call the red
  family unrepresented, send the accent to red a second time, and reproduce the palette the reviewer
  rejected for *"doesn't have the green"*. The bar clause is kept alongside.
- **It does not change `metadata.algorithmVersion`**, which still reads `p2-tos-0.3.0-cycle-2-merged`.
  Byte-identity on the <2-family covers is the acceptance condition, and a new version string would
  break it on every cover. The prototype's identity is in `candidateId` alone, which is what the dev
  loop stamps into the run id and the code-version digest. **This is the one open integration
  question** — an integrated rule should carry its own version.
- **It declines covers where the role-swap check fired** (`coverage-no-op:role-swap-fired`) rather than
  reasoning about coverage through an exchanged pair. The swap is a no-op on all twenty demo covers.
- **It re-checks its own assembly replica at run time.** On every cover it fires on, the same walk is
  first run with the pool in its published order and must reproduce the baseline palette exactly, or
  the baseline is published and the note says why. Nothing else is duplicated from `../candidate.ts`.

## 5. The round item I would stage to price it

**A 4-item pairwise round, `p2-coverage-1`: published accent vs coverage accent, every other role
byte-identical, blinded sides.** It is a pairwise round because coverage is a *trade* — chroma and
readability against identity breadth — and an absolute grade cannot see a trade.

1. `…0935b967964d` — `#d25068` (coral) vs `#6a723f` (olive). The confirmatory re-test: round-3's T1
   already preferred the olive, but on a palette this construction did not produce. If the preference
   holds here, D9's coverage reading is confirmed on its own cover.
2. `…7116a8247378` — `#c18d20` (gold) vs `#030e2a` (near-black navy). **The adverse case**: coverage
   buys a family and spends most of the accent's chroma. This is the item that can kill the rule.
3. `…1c908479200b` — `#ffbd6f` (warm orange) vs `#242e09` (dark green). The same trade, the other
   direction of lightness.
4. `…75fc8d58e0af` — 2 families, `R` empty, so narrowing #2 declined to fire. Shown against a
   **forced**-coverage variant, to price the one place D1 is deliberately preserved.

Pre-declared reading, MECE per D9's process lesson: coverage side preferred on **3–4 items** ⇒ stage
integration into `../candidate.ts`; on **2** ⇒ the rule is real but the ranking is wrong, and item 2's
verdict says whether stability or chroma should lead a family; on **0–1** ⇒ coverage is not worth an
accent, and D1 stands unqualified. Each item carries its census read-out (family count, arcs, the
26.51° separation) as a side-car, because the second thing this round can falsify is the **family
width** — a census that finds two families where the reviewer sees one is the failure mode no
assertion in this directory can catch.
