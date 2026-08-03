# Pointing phrasing sweep — pre-registration

**Written before anything was run.** 2026-08-04. **For:** the reviewer and the orchestrator.
**Follows:** `POINTING_PROBE_NOTES.md` §7.2 and §9 (`B-new`, `B-new+1`).
**GPU:** single-owner slot held. `pgrep` confirmed no MLX process running before this was written.

Everything below — the candidate list, the scoring, the pick rule, the bar for the reviewer
round — is fixed here and is not to be changed after a number is seen. Where the run deviates,
the deviation is recorded in the results section of `POINTING_PROBE_NOTES.md`, not by editing
this file.

---

## 1. The question

The probe found that **both** pointers refuse `point to the background surface behind the
subject` on 14 of 15 covers, identically, while `point to the background` answers 11/15 (Qwen)
and 15/15 (MolmoPoint). The refusal is a property of the sentence, not of the image.

`GROUND_FREETEXT_SYNTHESIS.md` §6 argues that the figure/ground line — *which pixels are
ground* — is the question that actually matters and the one the vocabulary never asked. So the
one phrasing pointing models will not answer is the one we most want to ask.

**This sweep asks two things:**

1. **Recovery.** Is there a phrasing that asks a ground question and still gets answered at the
   incumbent's rate?
2. **Mechanism.** *What* breaks the figure/ground sentence — the prepositional phrase
   (`behind the subject`), or the elaborated noun (`background surface`)? The probe conflated
   the two: its failing prompt changed both at once. This sweep separates them with a 2x2.

Question 2 is answered whatever happens to question 1, and is the reason this sweep is worth
running even if nothing clears.

---

## 2. The candidates

Eight phrasings, 15 covers, both pointers = 240 calls. Two are controls carried over verbatim
from the probe so the sweep contains its own baseline and so a reproducibility check at
temperature 0 comes free.

The first four form a **2x2 factorial** on the two things the probe's failing prompt changed
at once:

| key | phrasing | PP `behind the subject` | noun elaborated | role |
|---|---|---|---|---|
| `plain` | `point to the background` | no | no | **CONTROL** (incumbent; probe: 15/15 molmo, 11/15 qwen) |
| `surface` | `point to the background surface` | no | **yes** | TEST — noun elaboration alone |
| `fg_minimal` | `point to the background behind the subject` | **yes** | no | TEST — PP alone |
| `fg_full` | `point to the background surface behind the subject` | **yes** | **yes** | **CONTROL** (probe: 1/15 both) |

The remaining four vary the noun phrase, per §7.2's proposal:

| key | phrasing | eligible for the pick | why |
|---|---|---|---|
| `backdrop` | `point to the backdrop` | **yes** | generic ground noun from design vocabulary; true of most covers |
| `behind` | `point to what is behind the subject` | **yes** | the figure/ground relation with **no** ground noun at all |
| `wall` | `point to the wall` | **no — diagnostic only** | presupposing |
| `empty_area` | `point to the empty area` | **no — diagnostic only** | presupposing |

**Why `wall` and `empty_area` are pre-excluded from the pick, and why they are still run.**
Most album covers contain no wall and no empty area. A phrasing whose noun is factually false
on most of the corpus cannot be the phrasing we scale, however well it scores. But the answer
rate on them is a *diagnostic of willingness*: a pointer that happily points at "the wall" on a
cover with no wall is pointing at whatever is asked for, which bears directly on whether any of
these answers are perceptions. **A high answer rate on these two is evidence against the route,
not for it** — stated here so it cannot be read the other way later.

**Figure/ground rank** (used only as the last tie-break in §4, fixed now): `fg_full` 4 >
`fg_minimal` 3 > `behind` 2 > `surface` 1 > `plain` 0 > `backdrop` 0. Higher is better: it
measures how much of the figure/ground question the phrasing actually puts.

---

## 3. Scoring

Identical machinery to the probe (`pointing_probe.py`), so the numbers are comparable to it by
construction. Per (phrasing, pointer):

- **answer rate** = calls returning at least one in-frame point / 15.
  A parse failure and an explicit decline are counted separately and neither counts as an answer.
- **on-ground rate (proxy)** = point-bearing calls with **no** point inside a stored `person` or
  `face` mask, over point-bearing calls. Judged against the v4-noun SAM run
  (`data/sam/sam-eval-142-v4-nouns.jsonl`), not by eye. `words`/`display-text`/`emblem` and the
  other applied marks are **not** failures — applied text sits on a ground — and are tallied
  separately.
- **combined score** = answer rate x on-ground rate.
- reported alongside, not scored: unclaimed rate (points inside no stored mask at all), SAM mask
  area fraction, mask-contains-its-points, edge/corner concentration, seconds per call.

**What this proxy is not.** It cannot check a point against the reviewer's prose. The prose
fixes *which pixels are ground* on 6 of the 15 covers, and on those it is spatial
("green on the left and red on the right", "a black bar at the top") but not metric — it does
not give boundaries a script can test against without someone looking at the image first, which
would be scoring the answer key against my own eyes. So the automatic criterion is the strictly
narrower, objective half — **not on a figure** — exactly as the probe's §11.4 deviation records,
and the prose-level question is deferred to the human round in §5 rather than approximated.
Three prose facts *are* checkable without inspecting an image, and are reported as bonuses,
never as part of the pick:

- `00014fb4` — points in both the left and right halves ("green on the left and red on the right").
- `000f0a78` — points in two or more of the three horizontal thirds ("a black bar at the top,
  then a champagne bar, then a red field").
- `disney` — points in three or more quadrants (the four-quadrant colour-block cover).

---

## 4. The pick, and what "clears" means

**A phrasing CLEARS** — is good enough to spend the reviewer's attention on — if, on
**MolmoPoint** (the better pointer, probe §5.4), all four hold:

1. **answer rate >= 13/15**. The incumbent is 15/15; a ground route that silently drops more
   than two covers in seven is not a route.
2. **zero on-figure calls on the 11 decidable covers.** The probe's pre-registered FAIL
   condition, held at the incumbent's zero. Not a rate — a count of zero.
3. **>= 4 of the 5 non-`skap` controls answer.** The scout's stop rule, honoured explicitly.
4. **it is eligible** — i.e. not `wall` or `empty_area` (§2).

**The sweep clears** if at least one phrasing clears. **The PICK**, among cleared phrasings:

1. highest combined score (answer rate x on-ground rate) on MolmoPoint;
2. tie -> higher Qwen answer rate (a phrasing that works on two independently-trained models is
   a fact about the sentence, not about one model's training set);
3. tie -> higher figure/ground rank (§2), so that a tie is broken toward the question we
   actually want to ask;
4. tie -> the incumbent `plain`, which needs no change to be adopted.

`plain` is in the candidate pool and can win. **If `plain` wins, the honest report is that the
sweep found no improvement** — the round is still built and pushed (the reviewer round is about
whether the dots are right, which is unanswered either way), and the notes say plainly that the
phrasing space was searched and the incumbent survived.

**If nothing clears**, nothing is pushed, and the null goes into a dated section of
`POINTING_PROBE_NOTES.md`. A null here is a real result about the route: it would mean the
pointing route answers only the abstract-noun question and cannot be steered toward the
figure/ground one, which is the finding that decides whether pointing is worth width.

---

## 5. The reviewer round, and its bar — fixed now

Built and pushed **only if** something clears. Shape is exactly the probe's §8 proposal:

- **8 tiles.** The 6 palette-decidable misfit covers from `GROUND_FREETEXT_SYNTHESIS.md`
  (`00014fb4`, `00030075`, `00066a61`, `00075841`, `000f0a78`, `artofficial`), plus the 2
  covers where the picked phrasing and the incumbent `plain` produce the most different SAM
  masks (lowest mask IoU) — because a disagreement between phrasings is where a human eye is
  worth most. If the picked phrasing *is* `plain`, the 2 extra tiles are instead the 2 covers
  where `plain` and the runner-up cleared phrasing disagree most.
- **One question per tile:** *"The wash is what the model called background, grown from the
  green dot. Is the dot on the background? Is the wash the background?"*
  Answers: **dot right + wash right / dot right + wash wrong / dot wrong / can't tell.**
- **THE BAR, fixed before any answer is seen:** carry pointing forward as a ground route only if
  **dot right >= 6/8** **and** **dot-right-and-wash-right >= 4/8**.
  The dot and the wash are separated deliberately: a right dot with a bad wash is a SAM
  candidate-selection problem (probe §2.4), a wrong dot is a pointer problem, and the two have
  different fixes. Pooling them would hide which one we have.
- **Not asked:** anything about the three ambiguous covers' correctness. They are not in the
  eight.

---

## 6. Budget and stop rule

| item | estimate | basis |
|---|---|---|
| MolmoPoint, 120 calls | ~7.8 min | 3.9 s/call [MEASURED], probe §4.2 |
| Qwen, 120 calls | ~2.0 min | 1.0 s/call [MEASURED], probe §4.2 |
| model loads | ~20 s | probe §6 |
| SAM encode 15 covers + ~200 decodes | ~20 s | 1 s encode, 11 ms decode [MEASURED], probe §2.2 |
| **total** | **~11 min** | |

**Hard stop: if the run projects past ~20 min of GPU, it stops and reports.** The sweep runs
MolmoPoint first, because it is both the slower model and the one the pick is decided on; if
the budget runs out, a MolmoPoint-only result is still a result and a Qwen-only one is not.
