# The criterion arm (variants C and D) — result

**For:** the reviewer, to read directly. **Date:** 2026-08-03.
**Status of the run:** DONE. `data/oracle-premise/premise-run-cd.jsonl`, 142 artworks × 2 prompt
variants, 284 rows, 0 failed, 0 parse failures, one run id, one model revision — the same model
and the same seed policy as run 1. Nothing here needs GPU. The run finished; only the write-up
was missing, and every document still said the arm was unrun. This file is that write-up.

**Verdict in one paragraph.** The criterion arm ran and it did not do what it was pre-registered to
do. It was supposed to show that variant B's *question order* was what made B better than A: C and
D are two independent wordings that both keep B's order, so if they landed near B, order carried
it. They did not land near B and they did not land near each other — C and D give the same answer
on 46% of artworks, which is worse than A agreed with B (71%), and against the reviewer's own
answers on the 30 hard artworks C scores 11/30 and D 9/30 where B scored 16/30. The one thing the
arm did fix, it fixed completely: the corrected criterion removed the "unmapped" leak outright,
from 44% (A) and 31% (B) down to **0%** under both C and D, which passes half of the §4 gate on
its own. But the leak did not become accuracy — it became disagreement. C now answers
`multiple_distinct_fields` on 56% of the corpus and D answers `shaded_field` on 75%, so the two
wordings of one corrected rule commit confidently in opposite directions. The honest reading is
that **design rule 6's confirmation test was run and came back negative**, that the question-set
freeze is resting on a rule whose "until then" clause has now elapsed adversely, and that the
group-A ground question is not ready to go corpus-wide at `group-a.v2` — the second half of the §4
gate (exact match ≥ 22/30) is missed by every variant ever run, by a wide margin.

---

## 1. What C and D were, and what they measured

Variants A and B (run 1) asked the same four questions with the same closed vocabularies. A asked
`ground_type` first; B asked `enclosure`, then `field_texture`, then `ground_type`. B won on every
readout. Two things differed between A and B, though — the order *and* the wording — so "B's order
did it" was a hypothesis, not a measurement. `ORACLE_QUESTION_SET.md` recorded design rule 6 as
`[MEASURED, one comparison, wording-confounded]` and named the test that would settle it:

> Variants C and D are two further independent wordings that both keep B's order; **if they land
> near B, ordering carried it**, and rule 6 is confirmed rather than merely consistent with the
> data. **Until then** rule 6 is …

C and D are that test. Both keep B's question order. Both carry the **corrected `ground_type`
criterion** and the new **precedence rule** the reviewer signed off on 2026-08-03 (§14 rows 1 and
2). They are two different renderings of the same corrected rule.

So the arm varies wording-and-criterion while holding order fixed. If order is what carries the
answer, C and D should cluster near B and near each other.

## 2. The headline numbers

### 2a. Do the two wordings agree with each other?

| | A vs B (run 1) | **C vs D (this arm)** |
|---|---|---|
| same `ground_type` word | 97 of 137 = **0.708** | 63 of 137 = **0.4599** |
| same gradient binary | 101 of 137 = 0.7372 | 64 of 137 = **0.4672** |
| disagree on the binary | 36 of 137 = 0.2628 | **73 of 137 = 0.5328** |

The pre-registered target (§4, "Secondary — wording robustness") was **C-vs-D binary disagreement
≤ 15%**, against A-vs-B's 26%. Observed: **53%**. Two wordings of one corrected rule disagree on
the gradient call for more than half the corpus.

Per question, C vs D, all n=137:

| question | raw agreement | kappa |
|---|---|---|
| `ground_type` | 0.4599 | 0.2342 |
| `shading_geometry` | 0.4307 | 0.1781 |
| `field_texture` | 0.8832 | 0.7945 |
| `enclosure` | 0.8613 | 0.6449 |
| `confidence` | 0.9854 | 0.0 |

The two *cheap context* questions (`field_texture`, `enclosure`) are the ones C and D agree on, and
they agree on them better than A and B did (0.6569 and 0.8686). The two questions that carry the
decision are the ones that fall apart. That is the shape of the problem: the model is stable about
what it can see and unstable about what it is being asked to conclude.

### 2b. Do they agree with the algorithm's accepted gradient flag? (137 primary artworks)

| variant | agreement | kappa | says "gradient" on | truth says gradient on | unmapped |
|---|---|---|---|---|---|
| A | 0.6131 | 0.210 | 34.3% | 46.7% | 60/137 = 44% |
| B | 0.6642 | 0.311 | 30.7% | 46.7% | 43/137 = 31% |
| **C** | 0.5766 | **0.126** | 26.3% | 46.7% | **0** |
| **D** | 0.6861 | **0.3924** | **75.2%** | 46.7% | **0** |

D has the best kappa of any variant ever run — and it gets there by calling gradient on three
quarters of the corpus. Its confusion table: 62 gradients caught, 2 missed, but 41 of the 73 flat
covers called gradient. Read the two halves separately and D is two different instruments:

- when **D says flat** (34 artworks), it is right on **32** — a strong, usable signal;
- when **D says gradient** (103 artworks), it is right on 62 — barely above the base rate.

C is the mirror: it says gradient on only 36 artworks and misses 43 of the 64 real gradients.

### 2c. Against the reviewer's own answers (the 30 hard artworks)

These are the artworks where the oracle and the algorithm's flag contradicted each other and the
reviewer looked and answered the question themselves. Computed by
`analyze_gold30_variants.py`, which reproduces the already-published A and B figures exactly as a
self-check.

| variant | same word as the reviewer | same gradient direction |
|---|---|---|
| A | 7 / 30 = 23% | 8 / 20 = 40% |
| **B** | **16 / 30 = 53%** | **17 / 24 = 71%** |
| C | 11 / 30 = 37% | 15 / 24 = 63% |
| D | 9 / 30 = 30% | 10 / 24 = 42% |
| the algorithm's own flag | — | 14 / 24 = 58% |

Neither C nor D lands near B. B remains the best variant against the reviewer, by 5 to 7 artworks
on the exact word and by 8 to 29 points on the direction.

### 2d. The one clean win: the unmapped leak is gone

Design rule 8 says a value that maps to no decision is a value that can refuse the question, and
A and B refused on 44% and 31% of the corpus. **C and D refuse on nothing.** Zero rows landed on
`full_scene`, `pattern_or_texture` or `none_discernible` under either variant. The corrected
criterion and the precedence rule did exactly what they were designed to do.

But look at where the answers went instead:

| `ground_type` | A | B | C | D |
|---|---|---|---|---|
| `shaded_field` | 47 | 42 | 36 | **103** |
| `flat_field` | 16 | 39 | 24 | 15 |
| `multiple_distinct_fields` | 14 | 13 | **77** | 19 |
| `full_scene` | 50 | 38 | 0 | 0 |
| `pattern_or_texture` | 10 | 5 | 0 | 0 |

C's answers piled onto `multiple_distinct_fields`; D's piled onto `shaded_field`. Both of those map
to a decision, so the refusal rate is 0 — and the two variants now confidently disagree, because
the precedence rule pushed each wording to a different default. The leak did not close; it moved
from "no answer" to "an answer that depends on the wording".

### 2e. `confidence` is still dead

§4 set success at **more than 10% of rows non-`high`**. C answered `high` on 142 of 142. D answered
`high` on 140 of 142. Observed: **1.4%**. The operational trigger ("answer low whenever a second
answer is defensible") did not revive the field. Kappa is 0.0 in both runs, which is arithmetically
exact for a constant rater, not a bug. Per §4's own pre-registration, the field should be deleted
from the next schema and uncertainty should come from inter-variant disagreement instead.

### 2f. One genuinely encouraging number

On the 63 artworks where C and D **do** give the same word, agreement with the flag is **0.7778,
kappa 0.5612** — much better than the equivalent A/B subset (97 artworks, 0.6701, kappa 0.3379).
When the two wordings of the corrected criterion concur, they are worth substantially more than
when A and B concurred. The problem is that they concur on 46% of the corpus rather than 85%.

## 3. What this does to design rule 6 (question order)

Rule 6 pre-registered its own falsification and got it. C and D keep B's order and do not land
near B; they do not even land near each other. **The claim "ordering carried the A→B jump" is not
confirmed, and the test that was supposed to confirm it came back negative.**

What it does *not* establish, and should not be written down as if it did: C and D changed the
criterion and the precedence rule as well as the wording, so this is not a clean order-only
experiment either. The correct conclusion is narrower and still decisive for the freeze:

> Holding B's question order fixed does not reproduce B's result. Order is therefore not
> sufficient, and the A→B difference cannot be attributed to order on the evidence available.

Rule 6 should stop being quoted as `[MEASURED, one comparison, wording-confounded]` with a pending
confirmation, because the confirmation is no longer pending. Its honest tag is something like
`[MEASURED, one comparison; the pre-registered replication FAILED — premise-run-cd]`. That is the
reviewer's call, not this workstream's; §5 lists it as a proposed change.

## 4. What this does to the question-set freeze's evidence

`ORACLE_QUESTION_SET.md` froze v2 with design rule 6 among its stated rules, carrying an explicit
"**Until then** rule 6 is …" clause. That clause has elapsed, and it elapsed adversely. Nothing in
the freeze is *wrong* as a set of questions — the questions are unchanged and the run used them —
but one of the design rules the freeze cites as its rationale now has a failed replication behind
it, and no document says so.

This does not by itself unfreeze anything. It means the freeze's evidence base needs an amendment
record, so that the next person who reads rule 6 and orders their questions accordingly knows what
happened when it was tested.

## 5. The decision the reviewer has to make

Four things, in order of how much they cost.

**(1) Does the group-A ground question go corpus-wide at `group-a.v2`? — the answer is no, and the
gate says so.** §4's gate is two numbers together: unmapped ≤ 15% **and** exact match ≥ 22/30. The
first half now passes outright (0%). The second half is missed by every variant ever run: best is
B at 16/30, and the criterion arm made it worse, not better (C 11/30, D 9/30). §4's own branch for
this case is "the vocabulary is the problem, not the criterion → escalate the §A.5 split to the
reviewer as `group-a.v3`". That escalation is now due.

**(2) Rule 6's status in `ORACLE_QUESTION_SET.md`.** Retag it, and record the failed replication
beside it. One-line doc change; the evidence is in this file and in
`premise-run-cd.agreement.json`.

**(3) Delete `confidence` from the next schema.** Pre-registered at >10% non-`high`, observed 1.4%
after the stem was given an operational trigger. This is the second run in a row that says the
same thing.

**(4) What to do with D specifically.** D is already the second bulk arm inside the cascade
simulation, and this arm explains why it behaves the way it does there: D's `flat` answers are
worth a lot (32 of 34 right on the whole primary corpus) and its `shaded_field` answers are worth
little (62 of 103). The cascade's existing recommendation — commit on D's non-shaded answers,
leave its shaded ones undetermined — is exactly what these numbers support. Nothing here changes
that recommendation; it strengthens the reason for it.

**What is NOT on the table.** Re-running C/D. The run is complete, clean, and its result is
unambiguous. No GPU time is needed to act on any of the four decisions above.

---

## 6. Where the numbers come from

| number | file |
|---|---|
| inter-variant agreement, per question, C/D | `data/oracle-premise/premise-run-cd.agreement.json` → `inter_variant_agreement` |
| per-variant vs the flag, C/D, incl. tiers | same file → `per_variant`, `per_variant_by_tier` |
| the same for A/B | `data/oracle-premise/premise-run-1.agreement.json` |
| gold-30 exact match and binary, all four variants | `data/oracle-premise/gold30-variant-agreement.json` |
| the reviewer's own answers | `data/oracle-validation/premise-disambiguation-1-analysis.json` |
| raw rows | `data/oracle-premise/premise-run-cd.jsonl` (284 rows + 15 canaries) |

Regenerate all of it with:

```
research/v3/oracle/premise/.venv/bin/python analyze.py --results ../../data/oracle-premise/premise-run-cd.jsonl
research/v3/oracle/premise/.venv/bin/python analyze_gold30_variants.py
```

Both analyzers now exit non-zero on a missing or empty input rather than publishing a complete
report over zero rows (Phase-0 adversarial review, findings 1 and 7).
