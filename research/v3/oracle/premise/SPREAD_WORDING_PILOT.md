# Spread-wording mini-pilot — result

**Measured 2026-08-04. 76 inferences, 8.7 minutes of GPU. Nothing here is adopted.**

`SCHEMA_V2_PROPOSAL.md` §4 asked for a cheap experiment to choose between three candidate
wordings of `signature_carrier`'s new spread value, on the reviewer's ruling that **"what matters
is that the model understands it, not me."** This is that experiment and its result.

The result is not a winner.

---

## 1. The answer in one line

**No candidate fired even once on the covers the value was built for.** All three wordings
scored **0 / 9** on the multi-carrier group. The value, as worded, three wordings deep, does not
exist for the model.

| | candidate A | candidate B | candidate C |
|---|---|---|---|
| value token | `several_places` | `spread_throughout` | `all_over` |
| gloss | it sits in several places at once and you cannot pick out which ones | it is spread through the whole cover rather than sitting on any one part | it is all over the cover, not on any one part you could point to |
| **fires on multi-carrier (9)** | **0 / 9** | **0 / 9** | **0 / 9** |
| fires on single-carrier controls (5) | 0 / 5 | 0 / 5 | 0 / 5 |
| fires on no-signature-colour controls (5) | 0 / 5 | **2 / 5** | 0 / 5 |
| **gap (multi − single)** — §4's primary metric | **0.0** | **0.0** | **0.0** |
| escape-hatch rate (≤ 0.25 required) | 0.0 | 0.0 | 0.0 | 
| escape-hatch bar met? | vacuously | vacuously | vacuously |
| mean carrier-list length | 2.84 | 2.95 | 2.53 |

**The escape-hatch bar is met by all three and the fact is worthless.** The bar counts covers
where the model chose spread *alone* instead of naming two carriers. A value that never fires can
never be chosen alone, so 0.0 here means "did not happen" and not "did not go wrong". Reading
those three zeroes as three passes would be the single easiest way to misuse this table.

**§4's pick rule returns nothing.** "Largest gap, subject to escape-hatch ≤ 0.25" ranges over
three candidates tied at exactly 0.0. That is a tie at zero, not a ranking, and the first row of
§4's own measured-metrics table — *"fires on the multi-carrier group | **the value works at
all**"* — is what settles it.

> **Disclosure, because it matters.** `analyze_spread_pilot.py` encoded only the escape-hatch bar
> before the run. Treating "fires at all" as an *eligibility gate* rather than a reported metric
> was formalised **after** seeing the zeroes, and is marked post-hoc in the artifact for the same
> reason §3e discloses the post-hoc 0.90 overlays reading. It advantages no candidate and moves
> no ranking — all three are at zero either way. What it changes is only whether a three-way tie
> at zero is permitted to crown a winner. It should not be.

**Candidate B is worse than the others, not merely equal.** Its only firings in the entire run
were on covers with **no signature colour at all** — a greyscale line illustration and a
five-band rainbow. §4 predicted exactly this ("*spread = pervasive. Risk: overlaps
`background`*"), and it is the one prediction in the packet the run confirmed. If a spread value
ever does ship, B's wording is the one the evidence positively argues against.

---

## 2. Why it did not fire — and the finding that outranks the wording question

The three wordings are not the story. **The carrier question is already answering "everywhere",
so there is nothing left for a spread value to mean.**

Arm N is the control arm: the same 19 covers, the same prompt, with the spread value deleted from
the vocabulary entirely. It is the cleanest read of the question as v2 actually drafts it.

| arm N, 19 covers | value |
|---|---|
| `background` present on | **19 / 19 — 1.000** |
| `text` present on | 16 / 19 — 0.842 |
| `subject` present on | 14 / 19 — 0.737 |
| `small_element` present on | 0 / 19 |
| **`no_single_colour` present on** | **0 / 19** |
| modal exact set | `background+subject+text` |
| modal exact set share | 0.632 (bar is ≤ 0.85 — passes) |
| singleton rate | 0.053 (bar is ≥ 0.90 = array bought nothing — passes, emphatically) |
| mean list length | 2.58 |

Two of those numbers are the finding.

**`background` fires on every single cover.** Not most — all nineteen, including a cover that is
five equal rainbow bands and a cover that is pure greyscale smoke.

**`no_single_colour` fires on none of them — including the five covers picked *because* they have
no signature colour.** Those five were confirmed by eye before the run: a greyscale line
illustration, greyscale smoke-and-headlights, pastel pointillist noise, a five-band rainbow, and
equal-weight red/blue/green cubist panels. On the black-and-white "GOALS" cover the model answered
**`text+subject+background`** — *all three parts of this cover carry this cover's colour*, on a
cover that has no colour.

Read together, these say the model is not listing **which parts carry the signature colour**. It
is listing **which parts the cover has**. The question has quietly become "name the regions of
this cover", and under that reading every answer in the run is consistent — including the zeroes,
because a value glossed "you cannot pick out which ones" can never win against a model that is
picking them out by default.

**This is why the multi-select cannot be scored as a success yet.** §3(c) warned that "across the
entire warehouse, no array-valued answer has ever had two or more elements", and this run is the
first time the machinery has really been exercised: mean list length 2.58, singleton rate 0.053,
first three-element answers on record. The machinery **works**. What it is recording is the open
question, and the two pre-registered degeneracy instruments (§7.4) both **pass** while the field
is behaving this way — modal set 0.632 against a 0.85 bar, singleton rate 0.053 against a 0.90
bar. Neither bar can see this failure. That is worth knowing before the 200-cover pilot leans on
them.

---

## 3. What this does and does not license

**Does not license:** deleting the spread value. §4 pre-registers a consequence for the
escape-hatch failure and this is the *other* failure, for which the packet registers nothing. The
precedent in the packet points one way — §3(d) removed `illegible_at_this_size` after it fired
**0 times in 284 rows**, on the reasoning that it "cannot fire as worded" — and this is the same
shape three wordings deep rather than one. But that is a reviewer's call and the sample here is
19 hand-picked covers, not 284.

**Does not license anything about the corpus.** §4 is explicit and it is repeated in the artifact
and the image list: **this is a probe set, not a sample.** It measures whether the model
understands a wording. It says nothing about how often spread colours occur, and no number above
may be quoted as a rate over anything.

**Does license one narrow claim:** the reviewer's motivating case is already solved by the *other*
half of the ruling. Asked about the cover that started this — the same colour on the lettering
and on the subject — the model answered `text+subject+background` under every arm including the
control. **The multi-select does the job the spread value was invented to do**, which is the most
useful thing this run found and the reason the zeroes are not simply a failure.

**Suggests, without settling:** the thing to fix is the carrier question's *stem*, not its value
list. A value set cannot rescue a question that is being read as "name the regions". §4's own
framing anticipates this — a wording pilot can only tell you whether the model understood the
wording, and here the answer is that it never got as far as the wording.

---

## 4. The motivating covers

The task named the two covers that motivated the value; both are in the set, and one of them is
not what it was taken to be.

| | cover | what the eye saw | every arm answered |
|---|---|---|---|
| 1 | `0e/ab67616d00001e02000e007955ee2f8b29f5b2b4` | Electric cyan on the big diagonal lettering **and** as rim-light on the figure's collar and tie. A genuine two-carrier cover. | `text+subject+background` |
| 2 | `0a/ab67616d0000b273000ad9116781016bd6e6c21c` | **A greyscale line illustration. No colour at all.** | `background` (A, C, N) / `background+subject+text+small_element+spread_throughout` (B) |

**Motivating cover 2 is not a two-carrier cover.** It was identified from the reviewer round's
gate-consistency rule 6 (`has_signature_color == yes` with carrier `not_applicable`), but on
joint re-asking the reviewer moved that cover's gate to **`no`** — recorded in
`data/oracle-validation/bcde-gate-reconciliation-1.json`. Looking at it settles it: it is
black-and-white. It is listed in the **no-signature-colour** group, which is where the eye puts
it, and it is flagged in the list file so nobody re-derives it as a spread case. It is also the
cover on which candidate B produced its five-value answer, the longest and least defensible list
in the run.

Cover 1 is the real one, and it is the cleanest single result here: on the exact cover that
prompted "how do you answer with only 1 answer?", every arm named the carriers and none reached
for spread.

---

## 5. Method, so it can be checked or repeated

- **Model.** Pinned `mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit` @ `f311026557…`, temperature 0,
  constrained decode, exactly as every other arm in this workstream.
- **Arms.** Four, not three. A/B/C are §4's candidates; **N deletes the spread value entirely** to
  supply §4's fourth metric ("shift vs the same covers without the value"), which is not
  computable from the three candidates alone. N is a control and the pick rule never ranged over it.
- **The arms differ only in question 13.** `make_spread_pilot_prompts.py` derives all four from
  `prompts/group-bcde.v2.variant-e.json` by swapping one value token and one gloss line, then
  *proves* the rest is identical: strip every line mentioning a spread token and the four prompts
  must be byte-identical, asserted at build time. Arm A's prompt hash is **`be4722015f4cdbf6`**,
  which is variant E's published hash in §9 — so arm A is byte-identical to the drafted variant E
  and the derivation is verified rather than claimed.
- **The set.** 19 covers, **every one opened and looked at** before it was listed, grouped by what
  the eye saw: 9 multi-carrier, 5 single-carrier, 5 no-signature-colour. Pilot rows were used only
  to build a *candidate pool* to look through (covers where renderings E and F named different
  carriers are enriched for two-carrier covers); the pool is a search heuristic and never the
  label. List and per-cover justifications: `spread-pilot-19.txt`.
- **Health.** 76 / 76 rows ok. **0** parse failures, **0** retries, longest answer **130 tokens**
  against a 256 cap. 6.91 s/inference, 524.9 s total.

### A defect found on the way, which the orchestrator needs

The two drafted v2 prompt files **cannot be loaded by the real code path**. Both declare
`multi_select_fields` using **prompt-key** names — `["lettering_kinds", "signature_source"]` in E,
`["word_kinds", "defining_colour_where"]` in F — while `common.load_prompt_variant` reads that
list as **canonical** names, which is what `group-bcde.v1` carries (`["text_roles", "overlays"]`).
The array-valued property therefore falls through to the single-enum branch and load raises
`KeyError: 'enum'`.

§9's checks were made on the JSON shape without ever loading the files through `common.py`, which
is how it survived — and it is exactly the class of thing §9 says it did *not* check ("that the
grammars compile"). **Not fixed here:** the v2 drafts are unsigned and another workstream owns
that directory this week. The pilot's own four arms are normalised to the canonical convention,
which is why they load.

---

## 6. Files

New, all of them; nothing existing was modified and nothing was committed.

| file | what |
|---|---|
| `research/v3/oracle/premise/SPREAD_WORDING_PILOT.md` | this |
| `research/v3/oracle/premise/make_spread_pilot_prompts.py` | derives the four arms from variant E, proves they differ only in question 13 |
| `research/v3/oracle/premise/prompts/spread-wording-pilot/spread-pilot.{A,B,C,N}.json` | the four arms (a **subdirectory** — `selftest.py`'s inventory globs `prompts/*.json` non-recursively, so these do not trip it) |
| `research/v3/oracle/premise/spread-pilot-19.txt` | the probe set, with what the eye saw on each cover |
| `research/v3/oracle/premise/run_spread_pilot.py` | the worker |
| `research/v3/oracle/premise/analyze_spread_pilot.py` | §4's pick rule, plus the degeneracy diagnostics |
| `research/v3/data/oracle-premise/spread-wording-pilot-1.jsonl` | 76 rows |
| `research/v3/data/oracle-premise/spread-wording-pilot-1-analysis.json` | the numbers above |
| `research/v3/data/oracle-premise/run.spread-pilot.log` | run log |
