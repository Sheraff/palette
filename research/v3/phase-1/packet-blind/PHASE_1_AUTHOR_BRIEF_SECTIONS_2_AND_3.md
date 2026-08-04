<!-- Phase 1 author packet — provenance
     source: research/v3/PHASE_1_AUTHOR_BRIEF.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This document is a verbatim extract of §2 and §3 (including §3.1) of the source above,
     preceded by that document's title line and its "Who this is for" paragraph so that this
     file reads standalone. Assembled for a Phase 1 author packet. Nothing else is included.
-->

# Phase 1 — the author brief

**Who this is for.** You are one of several authors, each writing an architecture proposal
independently. You are not competing on polish and you are not being asked for code. **You are being
asked for a paradigm** — a way of getting from an image to a palette that is *structurally*
different from the others, described well enough that someone could prototype it.

---

## 2. The goals

From `V3_PLAN.md` §1. These are the success criteria, and the numbers about the previous system that
appear below are here because they define the target, not as a diagnosis of what went wrong.

**There is no inherited acceptability number, and you should not go looking for one.** The previous
system's headline figure was withdrawn on **2026-08-04** by the reviewer, who judged it fake. What
you are matched against is **the reviewer's verdicts** — the only ground truth this campaign has
ever had. If you find that figure quoted in an older document, the quote is stale.

What survives the withdrawal is the shape of the finding, and it is enough to set the goals:
single-verdict noise was measured at ~12%. **Acceptability is therefore not a direction v3 can
meaningfully move in; we are at the measurement ceiling**, and chasing acceptability points means
chasing reviewer noise. The rewrite's goals are therefore not "score higher":

1. **Robustness.** The incumbent is stable per file and collapses across encodings: 72.8% palette
   agreement on re-encode, a ±1-LSB dither moved all 114 test palettes, an ASCII id relabeling moved
   55.85% of the corpus. **These are architectural, not tunable.** Your paradigm should have an
   answer for why it does better, and that answer should be structural.
2. **Parameter honesty.** ~900 tunable sites against 11 human-anchored values, and 1.61× more
   perturbation-stable on reviewed than on unseen artwork — quantified overfitting. **v3 targets an
   order of magnitude fewer free constants, each carrying provenance from birth.**
3. **Structural completeness.** Every evidence lane can reach every role it should. The incumbent's
   candidacy walls made the reviewer's own corrected accents *structurally unpublishable* — the
   right answer existed and the architecture could not emit it. Identity coverage is first-class;
   the semantic classes (frames, overlays, giant text) are handled structurally rather than as
   patches.

**Success statement: hold the reviewer's judgment at least as well as the previous system did, with a
smaller, more stable, structurally complete system.** Deliberately not a number.

## 3. The output contract

By pointer, because the contract is normative and this brief is not. Read these; do not infer the
contract from anything else here.

| what | where |
|---|---|
| Output contract — roles, gradient boolean, stops, guide-stop semantics | `PHASE_0_DECISIONS.md` **§2**, as amended by the rulings in §3.1 below |
| Input policy — what the system is given and in what form | `PHASE_0_DECISIONS.md` **§1** |
| Metrics — what is tracked and how success is measured | `PHASE_0_DECISIONS.md` **§3** |
| Contract invariants and the pathology census — the gates a palette passes | `PHASE_0_DECISIONS.md` **§4**, implemented in `src/contract/` |
| Corpus, holdout and legacy policy | `PHASE_0_DECISIONS.md` **§5** |

The fixed problem shape, from `V3_PLAN.md` §2: **four roles** (background, surface, foreground,
accent) plus a **gradient boolean** and **stops**; foreground is text, accent is icons/UI, fields
are large areas; **contrast is deliberately low**, with the hard minimum a user parameter defaulting
near zero; multi-stop capable, with render stops decoupled from role colours **except the two ends**
(see the constraint sheet below).

**One standing rule about the gates, worth knowing before you design around them**
(`PHASE_0_DECISIONS.md` §4): *an invariant that ever blocks an endorsed palette is demoted — the
reviewer outranks the rule.* Gates are instruments, not axioms. If your paradigm is refused by one,
that is a fact about the gate as much as about your paradigm, and it is admissible as an argument.

### 3.1 The constraint sheet

**Everything your paradigm must satisfy, in one place.** The pointers above are the normative text;
this is the summary you can design against without re-reading them. Every item is the reviewer's,
and the ones dated **2026-08-04** were ruled that day and are the newest thing in this brief.

**The field, when it is a gradient.** Reviewer, 2026-08-04, verbatim:

> when the field is a gradient, the first stop is the `background` and the last stop is the
> `surface`. A gradient can have 2 or 3 stops (4 is negociable if proven utility).

So the ramp's two ends *are* the two field roles — exactly, not approximately — and a fitter does not
get to choose them independently. Enforced as `I1.first-stop-not-background` and
`I1.last-stop-not-surface`. One consequence worth designing around: **a collapsed surface means no
gradient**, because both ends would be the same colour.

**What justifies a stop beyond the second.** Recorded in `PHASE_0_DECISIONS.md` §2 and re-affirmed by
the ruling above; quoted here because the reviewer asked for it to travel with the constraint:

> **Guide-stop semantics for stops 3–4.** A 3rd stop is allowed when the artwork genuinely has a
> 3-color linear gradient. Stops 3–4 are otherwise *guides*: they exist only to pull the rendered
> OKLab interpolation onto the artwork when the 2-stop straight line demonstrably passes through
> off-artwork colors. Never to expand colorspace coverage or fit a metric. Curvature carries a
> banding cost when rendered, so the winning gradient is the **flattest path that stays on-artwork**
> — excursion reduction justifies a stop; meandering is forbidden.

One admissible reason to add a stop (**excursion reduction**), plus the genuine three-colour ramp.
Three named inadmissible ones: colourspace coverage, metric fitting, meandering. The fourth stop is
additionally **negotiable on proven utility** rather than granted, so reaching for it is an argument
you owe evidence for.

**Every published colour is an exact pixel of the artwork** — the same three 8-bit channel values,
not the nearest bin. This is what makes the whole contract falsifiable against the image.

**Collapses, and the one escape from that rule.** Reviewer, 2026-08-04:

- The **accent may collapse to exactly the foreground colour** when genuinely no valid accent exists.
- The **surface may collapse to exactly the background** when genuinely no valid surface exists.
- **New, and strictly bounded:** a palette may introduce **exactly one** colour not present in the
  artwork — **pure white (`#ffffff`) or pure black (`#000000`) only**, used as **background or
  foreground only**, with surface or accent collapsed correspondingly, and **only when there is
  genuinely no other way to produce a 2-colour palette**.

Collapses are *declared* (`collapse.surfaceCollapsed`, `collapse.accentCollapsed`) and must be exact
hex equality — a near-match is not a collapse, it is two colours that look alike. The escape is
declared the same way (`palette.escape`) and is checked against four conditions: the colour is
exactly one of those two literals, the role is one of those two, the partner is genuinely collapsed,
and **the colour is genuinely absent from the artwork** (an escape over a colour the image contains
is a violation, not a free pass). If your paradigm never needs the escape, that is the normal case.

**Runtime models are banned, with one conditional exception.** No model runs in the shipped pipeline.
The single exception the reviewer has left open is **SAM**, and it is admissible only if *all* of
these hold: (1) **nothing upstream feeds it** — no VLM nouns, no model-derived prompts; (2) it is
**provably deterministic**, meaning the same file yields byte-identical masks across runs, and this
must be **tested before anything relies on it**; (3) it is **fast enough**; and (4) plain-code methods
have been **exhausted**, or SAM is **demonstrably more reliable** than them. A proposal that wants
SAM at runtime should say which of these it can already argue and which it would have to establish.
The oracle's dev-time use of SAM is a separate thing and is not affected. **Condition (2) is settled
as of 2026-08-04** — SAM's determinism is **measured and satisfied for the pinned stack**
(`sam-determinism-1`: 144 inferences, 5,148 regions, zero differing bytes; scope and one cosmetic
concept-order boundary in `PHASE_0_DECISIONS.md` §6.1) — and **(3) is the number to quote: ~6.2 s per
cold call**, because runtime is cold and the model load is paid every time; the reviewer's ruling
that this "counts as slow" and needs *"very good reasons"* stands unchanged.

**The algorithm never reads a table.** That is the reviewer's own sentence and the form to remember
it in. Reviewer, 2026-08-04, verbatim:

> yes, the algorithm *never reads a table*, this must be very clear. Those pre-computed datasets are
> for the agents, to be able to test, evaluate, ideate, find holes in their coverage... They are
> development-time tools for efficient iteration.

**Runtime is cold. Nothing is precomputed.** The same ruling, stated as the constraint. Reviewer,
2026-08-04, verbatim:

> At runtime we *will not* have anything pre-computed. Pre-computed is only while we develop on a
> known corpus.

**This is the constraint most likely to invalidate an otherwise good paradigm, so design against it
first.** Your algorithm receives **one image file**, cold. There is no warm cache, no index, no
lookup table, no prior pass over that file, no companion images, and no artifact that anyone
computed earlier. Whatever your paradigm needs at runtime, it computes **from that single file, then
and there**.

Everything precomputed that you will see referenced in this repo — cached masks, embedding tables,
the devloop's warm artifacts, the robustness harness's stored runs — exists **only** because
development happens on a *known corpus*: a fixed, enumerable set of images we can sweep offline.
**None of it ships.** A paradigm may freely *use* those artifacts to argue for itself during
development; it may not *depend* on them at runtime. If your cost story needs a prior pass over the
corpus, you do not yet have a runtime cost story.

**The cost bracket this implies.** Two rulings bound it from opposite ends, and neither names a
number — so **neither do we, and neither should you**:

- **The target end.** Runtime models are banned and plain code must be *exhausted* before a model is
  even considered — so the assumed shape of a runtime is **ordinary per-file image code**, at the
  cost such code naturally has.
- **The exceptional end.** SAM measures at roughly **2.7–4.3 s per image**, and the reviewer ruled
  that this **counts as slow** — admissible, but only with *"very good reasons"* (see
  `PHASE_0_DECISIONS.md` §6.1). So a **seconds-scale** per-file tool is not forbidden; it is
  **exceptional-justification territory**, and the justification is owed up front.

Between those two ends there is **no ruled threshold** — no millisecond budget exists anywhere in
v3, and a proposal that cites one is citing something invented. What you owe instead is an honest
per-file cost estimate for a cold run, and an argument proportionate to where in that bracket it
lands. Cheap plain code needs no defence; anything approaching seconds needs one.

**Four questions are genuinely open.** They are stated plainly, on purpose — none of them has a
settled technical name yet, and inventing one would make a live question look decided:

1. **The accent escape refused measurement, twice.** An accent is allowed to survive having almost no
   brightness difference from what is behind it, if it is different *enough* in colour. How different
   is enough is still the placeholder `ACCENT_FUNCTIONAL_DISTANCE = 0.14591`, `[UNCALIBRATED]`, and
   **the round that was running to replace it has now run and declined to** (`perception-4`,
   2026-08-04) — for the second time, on fresh covers, for the same pre-registered reason as
   `accent-real-1`: one hue third identifies no threshold anywhere in the claim domain, so the
   quantity is `stratum-dependent` and a single constant is refused. What the round did add is the
   axis nobody could measure before: at matched OKLab distance, an accent that **also moves in
   lightness** does its job about twice as often (0.750 against 0.361). Read that as a direction and
   not as a coefficient — it is confounded with stratum by design. **Design implication: an accent
   that differs from its field only in hue and chroma is the fragile case**, and there is no number
   that will tell you when it is fragile enough to matter.
2. **No computable rule matches the reviewer's sense of which colours belong to an artwork.** The
   rule that used to drop colours for being too rare was tested against the reviewer's own judgments
   and had no discriminating power at any setting, so it was demoted to a reported figure. Nothing
   has replaced it. If your paradigm needs to decide whether a colour "belongs", that decision is
   yours to justify and there is no instrument to lean on.
3. **The same-colour threshold does depend on direction — measured, provisionally adopted, and
   gated on a counter.** This bullet used to say the question was parked. It is not: `perception-4`
   (2026-08-04) measured it and the reviewer signed off on a package the same day.

   **What is now known.** Whether two colours read as "the same" depends on *which way* they differ,
   not only how far apart they are. In `dark-neutral`, a pure **lightness** step has to reach 0.02063
   before it registers as a different colour, where a pure **chroma** step needs only 0.00717 and a
   pure **hue** step 0.00759 — so a lightness difference must be roughly **2.9×** larger to be
   noticed. Both ratios survive multiplicity correction and are the only such results the round
   produced. The contract's committed `dark-neutral` bar of 0.00932 sits *between* those thresholds:
   too loose for chroma, less than half of what lightness needs.

   **What was adopted, and what "provisional" means here.** The shape — a direction-aware
   (ellipsoidal) bar, `√(ΔL² + 8.29·ΔC² + 7.39·ΔH²) < 0.02063` — is **adopted provisionally**, which
   in this repo means *encoded and not enforced*. It runs as a **report-only challenger** beside the
   frozen bars (`src/contract/challengers.ts`), together with the ICtCp-global rule the round
   refused, and the two are counted against the frozen rule on every pair invariant 3 judges. **No
   verdict changes.** `sameColorBar()` is still a scalar, invariant 3 still consumes it as one, and
   the confirming round is **deferred** — the disagreement counter decides whether it ever runs.

   **What you should design against.** Treat "these two colours are the same" as a rule that is
   currently *conservative in the chroma direction and permissive in the lightness direction*, and do
   not build anything that depends on the bar's exact value in either. Two further warnings travel
   with it: the ratios are measured in **`dark-neutral` only** and applied everywhere, and the
   **functional** criterion is anisotropic in the *opposite* direction — a lightness step is worth
   about 3.9× a chromatic one for making an accent findable. Same space, same decomposition,
   opposite anisotropy. **Never share one ruler between "is this the same colour?" and "does this
   work as an accent?"**

   Canonical text: `src/contract/PERCEPTION_VERDICT.md` (signed-off header).
4. **How a pixels-first route actually computes its answer is Phase 1's problem.** Working directly
   from the pixels, rather than from any intermediate summary, is a legitimate paradigm and nobody
   has written down the computation it would need. If that is your route, that computation *is* your
   proposal.
