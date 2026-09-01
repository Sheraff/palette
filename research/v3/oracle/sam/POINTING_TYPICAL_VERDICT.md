# 16. The typical-strata round, scored — 2026-08-04

**This file is new and `POINTING_PROBE_NOTES.md` was not touched.** It is tracked and a history
rewrite is live on this branch; the section number continues that document's sequence so the two
read as one ledger. Nothing here was committed by this pass.

**Scored against `POINTING_TYPICAL_PREREG.md` §6, committed in `bafcc53` before the GPU run made a
single point.** No bar was read, moved, or interpreted after a number was seen. CPU only — no model
was loaded, no inference was run, every dot and mask comes from the run file the dead agent wrote at
00:40:56Z and §15.2 verified clause by clause.

Machine-readable form: **`research/v3/data/sam/pointing-typical-1-analysis.json`**.
Scorer: **`research/v3/oracle/sam/score_pointing_typical_1.py`** (new; reads the warehouse CLI and
the run file, recomputes every number in this document, including the duplicate detection).

---

## 16.1 The one-page answer

**THE BAR FAILED. The dot half passed; the wash half failed on all three policies, and not
narrowly.**

| criterion | observed | bar | result |
|---|---|---|---|
| **B1** — dot-right, cover level | **13/16** | ≥ 12/16 | **PASS** |
| **B2** — both-right, `containing` | **1/16** | ≥ 8/16 | **FAIL** |
| **B2** — both-right, `ground` | **2/16** | ≥ 8/16 | **FAIL** |
| **B2** — both-right, `union` | **2/16** | ≥ 8/16 | **FAIL** |
| **B3** — the conjunction | B1 ✓ **AND** B2 for ≥1 policy ✗ | both halves | **FAIL** |
| **B4** — `DEFAULT_SELECTION` moves | neither challenger qualified | stricter, separate | **stays `containing`** |

Tiles: `dot right + wash right` **5** · `dot right + wash wrong` **33** · `dot wrong` **2** ·
`can't tell` **8**. 48 tiles, 16 covers, one reviewer, 5 min 24 s.

**Said plainly: the wash is wrong on ordinary artwork, for every policy, and the pointer is not the
reason.** The best policy missed its bar by **six covers of sixteen**. This is not a one-tile margin
like §13's, and no reading of the duplicates below moves it.

**Provenance, since §13.3 had to establish it once and the same standard applies.** The
pre-registration commit is dated **2026-08-04T00:36:17Z**. The run file the round was built from was
written at **00:40:56Z** — **4 min 39 s later** — and the reviewer's first keypress landed at
**06:35:49Z**, the last at **06:41:13Z**, with the batch released at **06:41:15Z**. **The bar was in
version control before the first point existed, and about six hours before the first answer.** This
scoring is pre-registered; it is not post-hoc. (Both `bafcc53` and `e4e1553` resolve to that same
commit in the current object store — the branch's history rewrite has renamed it, and §15.2 cites the
old hash.)

**Answer-key status, unchanged and load-bearing:** typical covers have no `ground-freetext-1` prose,
so **there is no independent key**. Every number here is one reviewer's judgement. §13.9's caveat —
that every automatic "correctness" number in this campaign is an answer-rate wearing a correctness
label — is **not** retired by this round.

---

## 16.2 Per policy, per cover

All three tiles of a cover grew from the same point set, so the dot is a property of the cover and
is scored once. Area is the fraction of frame, from the run file. **`=`** marks a tile whose panel
is **byte-identical** to an earlier policy's tile on the same cover. **Bold point counts** are the
five covers that fell short of §14.7's ≥3 distinct points. "Content" is whether `ground` picked a
different candidate than `containing` — i.e. whether the policy comparison means anything on that
cover.

| cover | pts | content | `containing` | `ground` | `union` | dot |
|---|---|---|---|---|---|---|
| `0000cb59` | **1** | — | can't tell <br>`0.172` | can't tell `=` <br>`0.172` | can't tell `=` <br>`0.172` | **✗** |
| `00034b60` | 3 | yes | wash wrong <br>`0.245` | wash wrong <br>`0.647` | wash wrong <br>`0.638` | ✓ |
| `00045150` | **2** | — | wash wrong <br>`0.714` | wash wrong `=` <br>`0.714` | wash wrong <br>`0.582` | ✓ |
| `00055971` | **2** | yes | wash wrong <br>`0.432` | **both right** <br>`0.776` | **both right** <br>`0.809` | ✓ |
| `00056471` | 3 | yes | wash wrong <br>`0.678` | wash wrong <br>`0.714` | wash wrong <br>`0.771` | ✓ |
| `00060491` | 3 | — | wash wrong <br>`0.385` | wash wrong `=` <br>`0.385` | wash wrong <br>`0.558` | ✓ |
| `0007cc8b` | 3 | yes | wash wrong <br>`0.635` | wash wrong <br>`0.721` | wash wrong <br>`0.768` | ✓ |
| `00083a2d` | 3 | yes | wash wrong <br>`0.686` | wash wrong <br>`0.732` | wash wrong <br>`0.659` | ✓ |
| `000955cc` | **2** | — | wash wrong <br>`0.439` | wash wrong `=` <br>`0.439` | wash wrong <br>`0.579` | ✓ |
| `00103a37` | 3 | yes | can't tell <br>`0.207` | can't tell <br>`0.700` | can't tell <br>`0.590` | **✗** |
| `00106383` | 3 | yes | wash wrong <br>`0.957` | wash wrong <br>`0.482` | wash wrong <br>`0.800` | ✓ |
| `0010b864` | **2** | — | wash wrong <br>`0.340` | **both right** `=` <br>`0.340` | wash wrong <br>`0.328` | ✓ |
| `00117a3f` | 3 | yes | **DOT WRONG** <br>`0.019` | can't tell <br>`0.535` | **DOT WRONG** <br>`0.214` | **✗** |
| `00124d05` | 3 | — | **both right** <br>`0.373` | can't tell `=` <br>`0.373` | **both right** <br>`0.344` | ✓ |
| `0012eb9a` | 3 | — | wash wrong <br>`0.846` | wash wrong `=` <br>`0.846` | wash wrong <br>`0.816` | ✓ |
| `0014adcd` | 3 | yes | wash wrong <br>`0.864` | wash wrong <br>`0.607` | wash wrong <br>`0.780` | ✓ |

**Read the two `=` rows with a both-right in them before reading anything else.** `0010b864` and
`00124d05` are byte-identical images answered **differently**. They are §16.5.

---

## 16.3 The bar, verdict by verdict, exactly as registered

### B1 — DOT (the pointer). `dot-right ≥ 12/16`. **PASS, 13/16.**

Scored by the pre-registered rule: cover dot verdict = **majority of that cover's three tile
answers**, `can't tell` counts as neither, **a tie is dot-wrong**.

The three failures are not three pointer misses:

| cover | tiles | why it scored dot-wrong |
|---|---|---|
| `00117a3f` | dot wrong · can't tell · dot wrong | **a genuine miss.** `containing` took 1.9% of the frame |
| `0000cb59` | can't tell ×3 | **the tie rule.** 0 right vs 0 wrong → dot-wrong, conservatively |
| `00103a37` | can't tell ×3 | **the tie rule.** Same |

**Exactly one cover of sixteen carries a genuine `dot wrong` answer.** Among the 14 covers with any
decidable tile, the pointer is right on **13**. At tile level, 38 of 48.

The tie rule was fixed in advance in the conservative direction, and **B1 cleared anyway** — so the
pass was not manufactured by a scoring choice, and it would have been larger under any more generous
handling of `can't tell`. **This is the round's one solid positive, and it is the thing §13 could not
establish**: §13's 7/8 was a lenient ceiling on the hard tail. The pointer half now has a strict
number on ordinary artwork, and it holds.

### B2 — WASH, per policy. `dot-right-and-wash-right ≥ 8/16`. **FAIL on all three.**

| policy | both-right | bar | margin | covers |
|---|---|---|---|---|
| `containing` | **1/16** | 8 | **−7** | `00124d05` |
| `ground` | **2/16** | 8 | **−6** | `00055971`, `0010b864` |
| `union` | **2/16** | 8 | **−6** | `00055971`, `00124d05` |

Only **5 of 48 tiles** in the entire round are both-right. The bar needed 8 from a single policy's
16. **No policy could have cleared B2 even if every both-right tile in the round had been its own.**

### B3 — THE ROUTE. `B1 AND at least one policy clears B2`. **FAIL.**

B1 passed. No policy cleared B2. The conjunction fails. Per the prereg: *"Neither half alone
licenses anything."*

### B4 — `DEFAULT_SELECTION`. **No promotion. Stays `containing`.**

| challenger | 1. clears B2 | 2. margin ≥ +3 | 3. breaks ≤ 1 | qualifies |
|---|---|---|---|---|
| `ground` | ✗ (2/16) | ✗ (**+1**) | ✓ (breaks 1 — `00124d05`) | **no** |
| `union` | ✗ (2/16) | ✗ (**+1**) | ✓ (breaks **0**) | **no** |

Each challenger fails on clause 1 and again on clause 2. The prereg's own sentence applies before
anyone reaches for the margins: *"Failing B4 while clearing B2 is not a promotion."* Neither
challenger cleared B2 at all.

**`containing` did not win.** It scored the **lowest** of the three, and its single both-right cover
is a re-graded answer to an image whose byte-identical twin was answered `can't tell` (§16.5). The
default stays put because the bar to move it went unmet, **not** because the incumbent was
vindicated. §14.5's open clause — *"the default moves when the typical-strata probe says so"* — is
hereby **closed**, in the negative, for all three policies.

### Which §6.4 branch fired

**Branch 2, verbatim, written before the data:**

> **B1 ✓, B2 ✗ for all three** — the pointer is fine and the wash fails on *ordinary* covers too —
> the §14 repairs do not generalise. **the wash is a route-level defect, not a hard-tail artifact.**
> Stop point-prompt engineering; §14.8's third clause fires and the residual route is the answer.

Branch 3 (`B1 ✗` → route-dead) did **not** fire. Branch 4 (the incoherent one) did not fire.

---

## 16.4 The route verdict — `route-not-carried-forward`

**§13.6 left the route `route-alive-pending-typical-strata-probe`. This round IS that probe. It
resolves against the route.**

> **POINTING→SAM DOES NOT CARRY FORWARD AS A GROUND ROUTE — NOT UNDER `containing`, NOT UNDER
> `ground`, NOT UNDER `union`.**

Per policy, since the round was built to answer it per policy:

| policy | carries forward as a ground route? | on what |
|---|---|---|
| `containing` | **no** | 1/16 against 8/16 |
| `ground` | **no** | 2/16 against 8/16 |
| `union` | **no** | 2/16 against 8/16 |

**What "alive" meant, and why it is now spent.** §13.6 was careful that "alive" meant only *not
killable on that evidence* — the misfit round could not distinguish a bad route from a bad stratum,
because it contained no typical covers by construction. That ambiguity was the entire warrant for
keeping the route open, and this round removes it: **on covers drawn at random from eval-142 with
the whole pointing set excluded by id, the wash still fails.** There is no stratum left to appeal
to.

**This is NOT `route-dead`, and the distinction is the same one §13.5 protected.** §6.4's route-dead
branch requires **B1 to fail**, and B1 passed at 13/16 with exactly one genuine pointer miss. Filing
this as a pointer failure would blame the wrong component, in the exact way §13.6 refused to. **The
pointer works on ordinary artwork. The mask grown from it is not the background.** That is a SAM
mask-growth defect, now measured at route level rather than inferred from six hard covers.

**And the §14 repair programme does not generalise.** §14 diagnosed two failure shapes and built two
policies to repair them, on n=6, in-sample, on the hard stratum, against an analyst-authored key.
Out of sample, on typical covers, under a strict criterion: `ground` **+1 cover**, `union` **+1
cover**, both inside the noise floor. §14.6's own honest framing — *"this is a repair fitted to the
failures it repairs"* — is confirmed, and it is confirmed the unwelcome way.

**The anchor stands unmoved: "it wasn't amazing."** Nothing here raises it. On ordinary covers,
under the strict criterion, it is lower than that.

---

## 16.5 The duplicates — where the per-policy numbers are correlated, and it matters

**Disclosed in §15.3, before any answer was seen, and scored as pre-registered anyway.** Recomputed
here from sha256 over the stored mask RLE rather than trusted from the run file's own flag; the two
agree on all 16 covers.

**8 of 48 tiles are byte-identical to another tile of the same cover. 40 distinct images, 48 tiles.**
On 7 covers `SELECT_GROUND` picked the same candidate as `SELECT_CONTAINING`; on `0000cb59`, the
single-point cover, all three policies collapse to one mask and the reviewer saw the same panel three
times.

### The correlation, stated where it bites

**The policy comparison has content on 9 covers, not 16.** Split the B2 numbers by whether the
policies actually differed:

| policy | both-right on the **9 informative** covers | both-right on the **7 duplicate** covers | total |
|---|---|---|---|
| `containing` | **0/9** | 1/7 | 1/16 |
| `ground` | **1/9** | 1/7 | 2/16 |
| `union` | **1/9** | 1/7 | 2/16 |

**On 8 of the 9 informative covers, all three policies drew the same keypress.** Exactly one cover —
`00055971` — is a genuine policy win, and on the ninth (`00117a3f`) the policies differ only between
`dot wrong` and `can't tell`, which is a judgement about the dot, not a wash gain.

**So the entire `containing` 1 / `ground` 2 / `union` 2 spread rests on one real cover and two
inconsistent answers to identical images.** Which brings us to:

### The unplanned consistency check — and it did not come back clean

§15.3 predicted this would be readable for free and should be *read* that way, not designed that
way. Of the **7** byte-identical pairs/groups, **5 were answered identically and 2 were not**:

| cover | the identical pair | answers |
|---|---|---|
| `0010b864` | `containing` / `ground` — same image | `dot right, wash wrong` vs **`dot right, wash right`** |
| `00124d05` | `containing` / `ground` — same image | **`dot right, wash right`** vs `can't tell` |

**Both inconsistencies land on a both-right, and both-rights are the entire B2 signal.** Concretely:

- `ground`'s second both-right (`0010b864`) is a **duplicate of a `containing` tile the reviewer
  called wash-wrong**. It is not a policy effect. There is no policy difference on that cover.
- `containing`'s **only** both-right (`00124d05`) is a **revision-2 re-grade** (`can't tell` →
  `dot right, wash right`) whose byte-identical `ground` twin was answered `can't tell`.

**The round's noise floor is at least 2 of 7 on identical images. The between-policy signal is 1 of
9. The noise is larger than the signal.** No per-policy ranking from this round is trustworthy, in
either direction, and none is asserted.

### What the duplicates do NOT touch

- **B1 is unaffected.** The dot is a property of the cover, scored once per cover by construction —
  identical tiles cannot inflate it. The pointer result stands at full strength.
- **The B2 failure is unaffected.** The best policy missed by six covers. Reassigning every
  duplicate-driven both-right in the round to a single policy would give it 5/16 at the absolute
  ceiling — still short of 8. **No arrangement of the duplicates clears B2.** That is why the round
  was scored as pre-registered rather than repaired.
- **B4 is unaffected in outcome**, though its margins (+1 / +1) are exactly the quantity the
  duplicates corrupt. Both challengers failed clause 1 outright, so the corrupted margins never
  became load-bearing.

### The other disclosed shortfalls

**Five of sixteen covers had <3 distinct points** (§14.7 addition 2 asked for ≥3): `00045150` (2),
`000955cc` (2), `0010b864` (2), `00055971` (2), `0000cb59` (1). Two consequences worth naming:

- **The single genuine policy win, `00055971`, is itself a 2-point cover.** The one cover carrying
  the whole policy signal is one of the five that did not get the point budget the design asked for.
- `0000cb59`, at one point, is the cover where all three policies collapse; it contributed nothing to
  B4, exactly as §15.3 predicted, and it scored dot-wrong by the tie rule after three `can't tell`s.

**Two answers were re-graded** (revision 2, `supersedes` set) — `0012eb9a|union` and
`00124d05|containing`, both `can't tell` → a definite answer. Scored at latest revision with
supersession respected, per §13.4's precedent. Round 1 had no re-grades; this one has two, and one of
them created `containing`'s only both-right. Disclosed rather than absorbed.

---

## 16.6 The comparison with `pointing-ground-1` — reported, and deliberately not computed

Prereg §6.3 requires this round's rates to be reported alongside §13's. They are:

| | `pointing-ground-1` | `pointing-typical-1` |
|---|---|---|
| criterion | **LENIENT** — *"could this be considered correct"*, disclosed after answering (§13.2) | **STRICT** — *"is this correct"*, instructed in the framing text (§5) |
| stratum | the misfit tail — *exactly* the covers already called "none discernible" | typical — eval-142 minus all 15 pointing covers |
| n | 8 tiles, 8 covers | 48 tiles, 16 covers |
| dot-right | 7/8 | 13/16 |
| both-right | 3/8 | 2/16 (best policy) |

**No delta is computed between these columns, and none should be.** This is the **first strict
pointing measurement** in the campaign. The two rounds differ in **criterion and stratum at the same
time**, so any arithmetic difference between them is confounded by construction and cannot be
attributed to either. Prereg §6.3 licenses reading **only a gain, and only as a floor**; the dot half
is level to the eye and the composite direction is down, and §6.3 says in advance that *"a small loss
is not evidence of a worse stratum"*.

**None of this is load-bearing.** B2 failed against its own **absolute** pre-registered bar of 8/16,
by six covers, with no reference to round 1 anywhere in the calculation. The verdict would be
identical if `pointing-ground-1` had never been run.

---

## 16.7 What happens next — the pre-registered branch, and nothing invented

**All four pre-registered outcomes, and which one this round is** — so it is visible that the
consequence was selected by the data and not chosen after it:

| §6.4 outcome | fired? | pre-registered consequence |
|---|---|---|
| B1 ✓, B2 ✓ for ≥1 policy | **no** | route carries forward; B4 decides the default; residual cross-check next |
| **B1 ✓, B2 ✗ for all three** | **YES** | **wash is a route-level defect; stop point-prompt engineering; §14.8 clause 3 fires; residual route is the answer** |
| B1 ✗ | no | route-dead — the pointer misses on ordinary covers, nothing left to turn |
| B1 ✗, B2 ✓ | no | incoherent; report as instrument fault and score nothing |

Branch 2's consequence was written before the data and is adopted without addition:

1. **STOP point-prompt engineering.** No further phrasing work — §12.3 searched that space, 240
   calls, the incumbent survived, and the mechanism argument says nothing is left to turn. No further
   selection-policy work: three policies on identical points separated nothing. **No GPU slot on
   pointing.**
2. **§14.8's third clause fires: the residual route is the answer.** It answers *which pixels are
   ground* directly, which §14.6 shows the point prompt cannot reach. `RESIDUAL_PURITY_VERDICT.md`
   and `RESIDUAL_V5_NOTES.md` are where the next measurement lives, not here.
3. **`DEFAULT_SELECTION` stays `containing`.** No code change falls out of this round. `SELECT_GROUND`
   and `segment_ground_union` stay implemented and callable — they are not removed, because nothing
   here says they are worse, only that this round could not tell them apart.

### The one piece of §14 that this round supports

**§14.8's second clause — the `00030075` worry — did NOT fire.** The fear was that a union rule
"costs more single-region covers than the multi-region covers it buys". On typical covers, **`union`
broke zero already-passing covers**, and its masks sat inside the `[0.05, 0.85]` ground band on
**16/16** covers where `containing` fell outside on **3** (two over 0.85, one under 0.05, including
`00117a3f` at 0.019). That is a small, real, negative result about union's failure mode — recorded
because it was pre-registered as something that would change my mind, and it is the only part of the
§14 repair programme this round supports. **It is a proxy, not a reviewer answer, and it promotes
nothing.**

### The CPU work this round makes possible and did not do

**The candidate-level counterfactual is now answerable and is still unanswered.** §14.7 addition 1
landed: `pointing-typical-1-candidates.json` holds every candidate mask with pixels, 4.1 MB, on all
16 covers. §14.8's **first** clause — *if the four masks from the shipped point never contain a
better ground on the failing covers, then `SELECT_GROUND` is treating a model limit as a selection
defect and the whole §14 framing is wrong* — can now be checked on CPU, for the first time in the
campaign, on 33 dot-right/wash-wrong tiles.

**It is worth doing precisely because the route is being stood down.** If it comes back empty it
converts this verdict from "the wash is a route-level defect" to the stronger and more useful "SAM
cannot express these grounds from a point at all", which is a fact about the model that outlives the
route and constrains the residual work. It needs no GPU and no reviewer. **It is not done here, and
this section is not a claim that it was.**

### If anything here is to be revisited

**The trigger is not more pointing tuning.** It is a different instrument for growing a region from a
point, or a ground definition that does not require one mask to be the whole background. A repeat of
this round with the same components would measure the same defect.

---

## 16.8 Proposed decision records — NOT placed

Three, drafted in the file's own schema and left for the orchestrator:
**`research/v3/data/decisions/proposed-pointing-typical-1.json`** (new file; `decisions.json` is
tracked and the rewrite is live, so nothing was spliced).

| id | what it settles |
|---|---|
| `d-2026-08-04-pointing-sam-does-not-carry-forward-as-a-ground-route` | the route verdict; closes `route-alive-pending-typical-strata-probe`; stops point-prompt engineering |
| `d-2026-08-04-the-three-policy-comparison-did-not-separate-the-policies` | the instrument finding: 9 informative covers, 8 of 9 identical keypresses, noise > signal; constrains how any future three-arm round is built |
| `d-2026-08-04-default-selection-stays-containing-by-the-preregistered-bar` | B4; closes §14.5's open clause in the negative; records that the union worry did not fire |

All three cite the **48 latest-revision label ids** in `fundedBy`, so an amendment to any answer
flags them; each carries `fundingCaveats` naming the missing answer key, the duplicate correlation,
and the re-grades. The route record explicitly changes **no code and no constant**.

---

## 16.9 What would change my mind

- **The candidate-level counterfactual coming back non-empty on the 33 wash-wrong tiles.** If a
  better ground was sitting among the persisted candidates on most failing covers, then this is a
  selection defect after all and the route is worth one more policy — though it would need a policy
  that can *find* that candidate without an answer key, which is the problem §2.4 already measured as
  unsolved.
- **A second reviewer disagreeing on the wash.** With no answer key and a measured 2-of-7
  inconsistency on identical images, the wash numbers are one person's judgement with a visible noise
  floor. A second reviewer on the same 40 distinct panels is cheap, needs no GPU, and is the only
  thing that would make the per-policy numbers mean anything.
- **The reviewer reporting that the strict instruction changed how he read the panels rather than
  what he saw.** The `can't tell` rate went from 0/8 to 8/48 between rounds. That is consistent with a
  stricter criterion doing its job, and also with the plural-dots panel being harder to read. The
  round cannot distinguish these, and 3 of the 16 covers were decided by `can't tell` alone.
