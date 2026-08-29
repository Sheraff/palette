# Phase 3 — proposal brief for the combined algorithm

**Written 2026-08-29.** Phase 2 built six prototypes and judged them. None is the base of the
final algorithm; three were falsified, three plateaued. The reviewer's ruling: the value is in
the pieces, and the next algorithm is a new design assembled from what worked, constrained by
what failed. You are one of several authors writing that design independently. Proposals are
documents, not code. The best two or three get implemented and judged by the reviewer.

Unlike Phase 1, you receive the full evidence: what every prototype did, how it was judged,
and why it failed where it failed. Use it. Do not repeat what was falsified.

## 1. What you are designing

One algorithm: image file in, palette out. Runtime is cold and per-file — no precomputed
data, no tables, no models (SAM is admissible only with "very good reasons" at ~6.2 s cold;
assume plain image code). Output contract (normative text: `research/v3/PHASE_0_DECISIONS.md`
§2 and §4; summary: `research/v3/PHASE_1_AUTHOR_BRIEF.md` §3.1):

- four roles — background, surface, foreground (text), accent (icons/UI) — every one an exact
  pixel of the artwork;
- gradient boolean; when true, 2–3 stops (4 negotiable) where the first stop IS the background
  and the last IS the surface; interior stops exist only to keep the rendered OKLab ramp on
  artwork colours (excursion reduction), never to add coverage;
- sanctioned collapses (surface→background, accent→foreground, exact equality, declared) and
  one strictly bounded pure-white/black escape;
- every pair of published colours distinct above the same-colour bar; fg and accent must clear
  a near-zero APCA floor against the whole rendered ramp (user-raisable); fg↔accent and
  bg↔surface are judged on colour distance.

**The palette is judged as a whole.** The reviewer grades the four colours + gradient as one
object against the artwork. Roles are interdependent through the contract (ramp ends,
collapses, pairwise distinctness, contrast over the ramp) and through the reviewer's judgment
("incorrect background, the rest is hard to judge in front of that"). A design that picks roles
in isolation and glues them together has already failed twice in this repo.

## 2. The goals (from `V3_PLAN.md` §1)

1. **Robustness** — stable under imperceptible change (re-encode, ±1-LSB dither, the two
   renditions of one artwork). The previous system: 72.8% agreement on re-encode, 0/114
   unmoved under dither. The Phase 2 arms: P3 ~16% pooled disagreement (pairs ~9%), P5 39%,
   P2 9% overall but dither 15% — and all three said the remaining instability is structural
   (discrete decisions near thresholds; edge-based substrates coupling to noise). Your
   robustness argument must be structural, not "we'll tune it".
2. **Parameter honesty** — an order of magnitude fewer free constants than v2-3's ~900, each
   with provenance. Say where your paradigm's human decisions are and what anchors each.
3. **Structural completeness** — every colour in the artwork can reach every role; no
   candidacy walls. Population/mass floors block colours the reviewer endorses (median endorsed
   colour covers 8.9e-5 of the image).

Success is the reviewer's verdicts. There is no numeric target.

## 3. What Phase 2 established — read these, in this order

| read | what it gives you |
|---|---|
| `research/v3/phase-2/GRAFT_INVENTORY.md` | the evidenced pieces, the negative results as constraints, what is settled vs not |
| `research/v3/phase-2/PROTOTYPE_RANKING.md` | one paragraph per arm: outcome and why |
| `research/v3/PHASE_2_HANDOFF.md` §2, §4, §5 | the six mechanisms as commissioned; the reviewer's rulings; "the reviewer is the judge" |
| `.worktrees/p3-fields/research/v3/prototypes/p3-fields/STATE.md` + `README.md` | P3: per-pixel fields and ranks — best-judged arm, robustness plateaued, cause located |
| `.worktrees/p2-tree/research/v3/prototypes/p2-tree/STATE.md` | P2: tree of shapes — finds endorsed colours (92%), election unstable |
| `.worktrees/p5-fieldfit/research/v3/prototypes/p5-fieldfit/STATE.md` | P5: robust field fit + residual marks — stable fields, unstable discrete role picks |
| `.worktrees/p1-mdl/research/v3/prototypes/p1-mdl/STATE.md`, `.worktrees/p4-portfolio/research/v3/prototypes/p4-portfolio/RULING.md`, `.worktrees/p6-figureground/research/v3/prototypes/p6-figureground/reports/REOPENING_ANALYSIS.md` | the three falsified arms: what exactly fired the kill |
| `research/v3/phase-1/PRIOR_ART_CHECK.md` | everything tried before v3 (636 commits) — do not reinvent |
| `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md` | the previous system's lessons. **Adversarial checklist, not a blueprint**: §2 constraints, §6 gradients, §10 edge cases are things your design must have an answer for |
| `research/v3/data/warehouse/warehouse.jsonl`, rows whose batch id starts with `phase2-` | the reviewer's actual Phase 2 verdicts and notes (206). Read the notes. |

Code for each prototype lives beside its STATE.md (`src/`, `tos/`, etc.). Read code when a
document's description of a mechanism is not enough to redesign it.

**The negative results are constraints, not opinions** (GRAFT_INVENTORY §"Negative results"):
no single scalar objective judges like the reviewer (falsified twice); role assignment is a
separate judged competence from colour extraction; optimizers sit on floors while the reviewer
grades margins; selectors between rival whole-palette answers die (five times); mass floors
block endorsed colours.

## 4. How to read the reviewer's notes

The notes are about specific artworks. "The foreground should be white like the huge
typography" is a fact about that cover, not a rule that text colour is always the foreground.
Extract *classes of failure* from them (wrong field colour — e.g. a face taken as background;
false gradient / missed gradient; unreadable foreground; colour only present in a label logo;
a strong artwork colour missing from the palette; right colours in the wrong roles; two
near-identical shades where the artwork has one), and design so those classes are addressed
structurally. Do not derive thresholds from notes. Numbers in this repo do not bind —
principles do; any constant you need is yours to anchor.

## 5. What to write

One file: `research/v3/phase-3/proposals/<your-slug>.md`. **Hard cap 350 lines.** Plain
language; define every term you introduce. Sections, in this order:

1. **The design in one paragraph.** Image → palette, end to end.
2. **Mechanism.** Step by step, precise enough that an implementer could build it without
   asking you anything. For every step: what it computes, from what, and what decision (if any)
   it makes. Name the salvaged piece it comes from (arm + component) or say it is new. Say
   explicitly how the four roles + gradient are decided *as one palette*, and where the contract
   (collapses, distinctness, contrast over the ramp, ramp ends) enters — before, during, or
   after the decision, and why there.
3. **Why it does not die the way the six died.** Address each negative result in §3
   explicitly. One line each is fine if the answer is structural.
4. **Robustness argument.** Where are the discrete decisions? What makes each one stable under
   dither/re-encode? Which of Phase 2's located instability causes does your design remove, and
   which does it inherit?
5. **Free parameters.** Every constant your paradigm needs, what anchors it (measured from the
   corpus, derived from the contract, reviewer round, held), and what happens if it is wrong.
6. **The failure classes.** For each class in §4 above: handled structurally / handled by a
   specific step / not handled (say so). Add the field guide §10 cases you consider decisive.
7. **Cost.** Honest cold per-file estimate at 300 px and 3000 px, and where the time goes.
8. **Expected failures and falsifier.** What you expect this to be bad at, and what result on
   the first reviewer round would tell us the design is wrong rather than under-built.
9. **Build plan.** What to build first so the reviewer sees palettes soonest; what can be
   staged later; rough effort.

## 6. Rules

- No code from v2-3 (`research/src/album-artwork-palette-v2*`, root pipeline) may be reused;
  Phase 2 prototype code may. Ideas from anywhere are fine.
- Write only your own proposal file. Do not edit anything else. No git commands.
- Evidence or silence: every claim about what a prototype did or the reviewer said cites a
  file or a batch id. If you are guessing, say "guess".
- Do not pad. A 150-line proposal that is precise beats a 350-line one that is vague.
