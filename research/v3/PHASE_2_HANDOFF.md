# Phase 2 handoff — for the next orchestrator

**Written 2026-08-04 by the Phase 1 orchestrator, at the reviewer's direction.** Phase 1 is
complete: fourteen independent architecture proposals exist, they collapse into six mechanisms, and
every one has been checked against this repository's own history of attempts. Phase 2 prototypes
them.

Read `PHASE_1_HANDOFF.md` first — its §6, "the rules earned by failures", is still in force and
this document does not repeat it. What follows is what changed, what you are building, and how.

---

## 1. What Phase 1 produced

`phase-1/` holds all of it. The documents you will actually use:

| file | what it is |
|---|---|
| `proposals/arm-*.md` | **14 proposals.** The raw material. Three rounds: plain, `-prime`, `-r3` |
| `DIVERGENCE_MAP.md`, `DIVERGENCE_MAP_2.md` | mechanism tables — what each proposal actually does, and which are the same thing in different words |
| `PRIOR_ART_CHECK.md` | **read this before writing any prototype brief.** Each mechanism against 636 commits of previous attempts |
| `CONTRACT_DEFECTS.md` | 17 recorded defects, most now resolved by reviewer ruling (§4 below) |
| `STRESS_TEST.md` | 32 field-guide challenges applied to the round-1 arms |
| `FIELD_GUIDE_CHECKLIST.md` | the 32 challenges themselves, with sourcing marks and evasion tests |
| `CONFINEMENT_AUDIT.md`, `_2.md` | whether the authors stayed independent — they did |
| `DITHER_METRIC_QUESTION.md` | the robustness-metric investigation |
| `COMMISSIONING.md` | how Phase 1 was run, including everything that went wrong |

**Phase 1's own errors are recorded in those documents rather than smoothed out.** The biggest: the
packet's manifest leaked the conclusions the packet existed to withhold, including one arm's seat.
It is corrected, measured, and bounded — but read `CONFINEMENT_AUDIT.md` before treating any arm as
a clean independent sample.

## 2. The six prototypes

Group by mechanism, not by author. **Where two proposals in a group differ, that is a Phase 2
experiment, not a decision you owe up front** — build the mechanism, try both, keep what works.
The reviewer's instruction is explicit: *"the exact implementation is not the most important thing,
the goal is more important than the details, as long as we give a genuine attempt at the described
mechanism."*

### P1 — one global objective priced as description length
**Arms: `arm-a`, `arm-a-prime`.** One scalar cost over the whole answer at once — four roles,
gradient boolean, stops, collapse flags — minimised together. Nothing is chosen in stages.
*Where they differ:* A normalises per unit image mass and takes an accent coefficient; A′ derives
its prior from the output schema itself and refuses the coefficient. Try both priors.
**Prior art: half tried.** Whole-object comparison existed; description-length pricing never did.
The prior failure in this space was a *hand-weighted* scalar, which is P6's shape, not this one.

### P2 — hierarchical region decomposition
**Arms: `arm-b`, `arm-b-prime`, `arm-e`, `arm-f-prime`.** Build a tree over the image, read roles
off nodes. The most-populated mechanism — four independent arrivals across three different seats,
one of them blind.
*Where they differ — and this is the main experiment:* which tree (quasi-flat zones vs level-set
component trees vs the tree of shapes), and what stops the decomposition. `arm-b`'s gradient
detector depends on a property only its tree has; the others need a different one. `arm-b` is the
only one with a text detector — graft it.
**Prior art: half tried.** Flat regions with roles read off them are the incumbent everywhere.
Hierarchy was proposed twice and **built zero times**. The new half is the half these lean on.
**Known risk:** region boundaries are the least stable object under re-encoding, so this mechanism
is suspected weakest on exactly the robustness goal. Measure it early rather than assuming it.

### P3 — per-pixel scalar fields and ranks
**Arms: `arm-d`, `arm-d-prime`.** Every published colour is the pixel holding a designated rank in
some measurement defined at every pixel. No grouping, no shortlist, no candidate set ever.
*Where they differ:* they disagree about what their own rule forbids — `arm-d` bans any local mean
colour (and therefore every linear filter on colour); `arm-d-prime` builds its whole field battery
from disc means. **Pick one line, state it, and hold it** — the value of this mechanism is the
discipline, and a prototype that quietly relaxes it is testing nothing.
**Prior art: not tried. The only genuine novelty of the six.** Measurement-maps were built three
times before and always fed into clustering.
**One note on auto-adjudication:** "could this method have produced the endorsed palette?" is
**vacuous** here — every pixel is always available, so the answer is always yes. Both authors found
this independently. **This is not a gap and it earns nothing a free pass**, because auto-adjudication
was never the gate (§5). It just means this mechanism gets less help from the warehouse while
iterating, and reaches the reviewer on its palettes alone.

### P4 — a portfolio of rival extractors under a selector
**Arms: `arm-c`, `arm-c-prime`.** Several small methods, each asserting one structure; machinery
elects one.
**Prior art: partially tried, and this is the highest-risk match in the phase.** Portfolios have
been built in *every* era of this repo. **Every selector failed or turned out to be a human** —
hardcoded picks, hand-set reliability constants, two withheld at review, one refuted by
measurement, one deleted. The entire burden sits on whether the new currency is genuinely
different.
**Consider building it last, over the others.** `arm-c-prime`'s selector can take P1, P2, P3 and P5
as its members instead of thin sketches. That is a better test of the selector and costs almost
nothing extra.

### P5 — robust parametric field fit plus residual marks
**Arms: `arm-f`, `arm-f-r3`, and `arm-e-r3`.** Fit a smooth colour surface; the overlays are what
the fit rejects.
*(`arm-e-r3` was initially misfiled under P1 by this orchestrator. It prices only the field, and its
foreground/accent ranking revives an old comparator at the site the record names as the main
failure. It belongs here. Correction from `PRIOR_ART_CHECK.md`.)*
**Prior art: partially tried, and different in the diagnosed direction.** The old system fitted
gradients and used residuals as a veto — but it segmented *first* and fitted second, and never used
outlier-resistant fitting (zero occurrences in 636 commits). The documented dead end was that it
could not repair a bad role assignment; fitting first is what dissolves that.
**Known failure mode, from its own author:** on collage, photography or heavy texture there is no
field to fit, and the fit converges on "the largest smooth-ish patch" — *"arbitrary rather than
wrong-in-a-legible-way, which is worse."* Silent failure. Build the detector for it early.
**Cheapest of the six.** Days, not weeks. Worth building first as the floor — the control that
stops us congratulating a complex mechanism for beating nothing.

### P6 — one continuous joint figure–ground measure
**Arm: `arm-e-prime`.** A joint measure over colour, surround-at-scale and position; roles read out
by constrained minimisation with no early quantisation.
**Prior art: reinvention warning, and it is the loudest in the phase.** Its energy has seven terms
with free exchange rates between them. Multi-term hand-weighted objectives are **the most-relapsed
failure shape in this repository** — tried at root level, in v2, and again across 392 sources,
demoted every time. Its author's defence is that prior failures happened at quantised granularity
and this is continuous. That defence is real and falsifiable — **but exchange rates between terms
are a separate problem from graininess, and it does not answer it.** If you build this, make the
exchange rates the falsifier.

**One mechanism the reviewer flagged about all six:** *"they all seem to understate the difficulty
of the task at hand."* Take that as a standing prior on every cost and build estimate in these
proposals.

## 3. What was tried before that no proposal reached

From `PRIOR_ART_CHECK.md` §2 — eight items. The one worth acting on: **hue-anchored candidate
supplementation**, the late era's *only* success ever cleared for promotion. Whatever it did for
recall, P2, P4 and P5 have to re-earn. The others are listed there with their evidence.

## 4. The reviewer's rulings, and the standard they set

Four rulings on 2026-08-04, and the *pattern* matters more than any one of them.

- **SAM at runtime:** *"it's even better if we don't need SAM at runtime, let it just be a dev tool
  to help with iteration autonomy. I'm open to having it at runtime if any agent has a brilliant
  idea of how it would improve accuracy, but it's not a requirement."* Not a ban. All fourteen arms
  declined it unprompted.
- **Foreground and accent:** they are either different colours or collapsed into one, and
  "different" is decided by the formula calibrated in Phase 0 — **not** by the inherited 0.07444,
  which was never calibrated here. This dissolved two recorded defects at once.
- **Robustness:** *"i don't care about the definition, it's the principle that matters: remain
  stable under slight (i.e. imperceptible or barely perceptible) differences."*
- **Colour belonging:** *"we don't care about the exact numbers, and in fact we were not able to
  measure one in phase 0, what matters is the principle: when a human looks at a palette, they must
  feel like every color fits the artwork."*

**The standard: principles bind, numbers do not.** Several Phase 1 findings were contradictions
between documents about specific constants. The reviewer's response was that these are not
interesting. **Do not bring number-disagreements to the reviewer.** Resolve them by measurement, or
pick one, state it, and move on. Bring things that change what a prototype does or how it is judged.

## 5. What judges a prototype — and it is not an instrument

**The reviewer, 2026-08-04, verbatim, and this is the section that outranks the instruments:**

> the real test is when a palette produced by an algorithm is judged by a human. That's all that
> matters. The warehouse is there to provide past evidence that a palette has been accepted or
> ranked low, to help with agent iteration autonomy. Past evidence is weak evidence because we were
> working with different priors when it was produced. There is no free pass here, i'll be the judge.

So: **build palettes, put them in front of the reviewer.** Everything else exists to let a
prototype iterate on its own between reviews, and none of it is a gate.

- **Auto-adjudication against past verdicts is a development aid, not a score.** It is weak
  evidence by construction — those verdicts were produced under different priors. A prototype it
  cannot help (P3, §2) is not a prototype with a free pass; it just iterates with less scaffolding.
- **The robustness harness measures the principle the reviewer named**: stay stable under changes
  that should not matter — re-encode, quality, dither. That is what it does today and it is enough.
  The catalog also lists resize, 1-pixel crop and ID relabeling, which do not exist. **Do not build
  them and do not treat their absence as a gap** — the reviewer has ruled the relabeling result was
  a bug, not a finding. Fix the catalog row so no future author reasons about arms that are not
  there.
- **The minimum distance between colours is in the specification.** Implementations must satisfy
  it, including the consequence that two field colours too close together collapse and the artwork
  therefore has no gradient. Reviewer: *"it's not a surprise, it's not silent, it's in the specs."*
  This is a design constraint for every prototype, not an open question and not a defect.

**A standing prohibition, earned:** this orchestrator brought the reviewer four items framed as
instrument gaps, and all four were dismissed — three as restatements of things already specified or
already known, one as a test not worth running. **Do not invent evaluation machinery to protect
against failure modes the reviewer has not asked about.** The reviewer is the judge, they have said
so plainly, and instrument-building that is not requested is overhead the campaign has already been
warned about once (`PHASE_1_HANDOFF.md` §6, rule 12).

## 6. The orchestration plan

**Three tiers: you (Fable) → one Fable orchestrator per prototype → many Opus workers each.**
Piloted 2026-08-04 on the prior-art check: spawning subagents from inside a subagent works, six
Opus workers ran concurrently from one message, zero failures.

**Set the session to `high` reasoning effort.** Effort is *not* settable on the Agent tool — only
the Workflow tool exposes it per call. But agents inherit session effort, so a high-effort session
gives every tier high effort with no script. Use a workflow only if you later want *different*
efforts per stage; for uniform high, session-level is simpler and keeps the orchestration dynamic,
which Phase 2 needs — each prototype discovers what it requires as it goes.

**Five things the pilot said to fix before a six-way fan-out:**

1. **Worktrees must branch from HEAD, not `origin/main`.** `worktree.baseRef` is unset, so the
   default branches from main — and this campaign lives 300+ commits away. Six prototype agents
   taking default worktrees would each get a tree **with no v3 instruments in it**. Set
   `worktree.baseRef` to `head`, or create the worktrees manually. This already bit Phase 1 once.
2. **Explicit path ownership per prototype.** The pilot's workers were read-only, so nothing
   collided; Phase 2's will write. Each prototype gets its own worktree *and* its own subtree, with
   the shared instruments read-only.
3. **Cap report sizes and fix the verdict vocabulary in every brief.** That is what made fan-in
   affordable at six workers; it is mandatory at six orchestrators.
4. **Middle tiers absorb their workers' completions and report once.** Do not stream worker
   notifications upward.
5. **Build deliberate overlap between workers instead of relying on accidental redundancy.** The
   pilot verified nothing itself — its correct verdict on one mechanism came from two workers
   happening to disagree. Design that in.

**Orchestration overhead runs ~30% of a middle orchestrator's budget regardless of task size.** The
tier pays for itself when the material exceeds one context, which for a prototype it does. It does
not pay for small tasks — do those directly.

## 7. Two things Phase 1 got wrong that you should not repeat

- **A claim outran its verification.** This orchestrator wrote "three incidents, three
  self-disclosures, zero undisclosed breaches" into a committed document, from agents'
  self-reports, *before* any audit existed. The audit found four incidents and three disclosures.
  **Agent self-reports are evidence, not verification.**
- **An instrument built to measure a hole became the hole.** The packet manifest was told to record
  honestly what had been withheld and why. It did — quoting the withheld findings, inside the
  packet. Both instructions were right; together they were the leak. **When you build something to
  audit a boundary, check that the audit artifact sits outside it.**

## 8. Where things stand

Branch `research/palette-0.9-checkpoint`, all work fast-forwarded onto it. Nothing pushed — the
remote push was blocked by a permission prompt and is owed. Phase 1 documents are under
`research/v3/phase-1/`; the decision ledger, loose ends and instruments are where
`PHASE_1_HANDOFF.md` left them.

**Nothing in Phase 1 is unfinished.** Two things are open, and neither blocks starting:

- **Whether to commission a deliberately-anchored incumbent arm** (ledger row **B46**). No proposal
  represents what the previous system learned, because writing one requires exactly the material
  Phase 1 withheld from every author. The reviewer's call, any time before the prototypes are
  compared.
- **The documentation defects in `CONTRACT_DEFECTS.md`.** The reviewer has ruled these are not
  worth their attention — they are disagreements between documents about specific constants. Where
  one blocks an implementer, **resolve it by measurement or pick one, state it, and move on.**

`CONTRACT_DEFECTS.md` should be read with §4's standard in hand: most of its 17 items were written
before the reviewer made clear that principles bind and numbers do not. Several are already
dissolved by the rulings recorded there and have not been re-scored.
