# Next Palette Joint Inference Plan

Status: development only. This plan supersedes Stages 4 through 6 of
`NEXT_PALETTE_SOFT_CONTRAST_PLAN.md` after the completed Stage 3 accent review. It does not authorize
candidate freeze, canonical promotion, reserve access, or output-unseen review.

## Architecture Correction

The accent review demonstrated that independently selecting or promoting one frozen-role module is
too rigid. Palette roles are coupled:

- background and surface define the contrast context for both overlays;
- foreground must work over both fields;
- accent depends primarily on background and secondarily on surface;
- role collapse, gradient state, cardinality, and composition belong to the complete tuple.

Role-specific stages now generate evidence only. Field treatments are enumerated first, overlay
frontiers are recomputed for each treatment, and final inference compares complete tuples.

Attribution uses constrained re-optimization rather than frozen-role human review. For every
selected tuple, inference is rerun with canonical background, surface, field state, complete field
block, foreground, accent, and complete overlay block fixed in turn, and with connected-family local representatives
removed. These ablations identify necessary evidence without pretending roles are independent.

## Stage 4: Field And Overlay Evidence Frontiers

Build a separately versioned read-only frontier that changes no output.

Enumerate source-derived field treatments from the `0.3` relation components:

- source-derived field eligibility;
- jointly observed endpoint mass;
- zero-preserving harmonic conjunction;
- connected source topology;
- separate distinct-flat and gradient evidence;
- positive-distance subtle-gradient legality;
- explicit collapse.

For every ordered field pair, recompute source overlay evidence:

- foreground APCA magnitude over both fields and worst-field contrast;
- foreground typography, saliency, detail, and population evidence;
- accent APCA over background as primary evidence and surface as secondary evidence;
- accent chroma, saliency, detail, and population evidence;
- explicit source foreground/accent collapse alternatives;
- generated black and white as a separate consumer-authorized diagnostic domain.

No APCA value may reject a source field or overlay alternative. Connected-family local
representatives remain overlay-only. The logical domain, Pareto pruning, and dominance witnesses
must reconcile, and output remains byte-for-byte canonical.

When a known field complaint has no complete tuple that strictly dominates canonical, run a
diagnostic-only field tradeoff review before changing extraction policy. The cohort may be selected
from comments, but comments may not select colors or enter inference. A generalized complete-tuple
frontier must:

- require a changed field block and stronger source field evidence on at least one field dimension;
- exclude alternatives dominated by canonical;
- recompute foreground and accent for every field treatment;
- rank the diagnostic frontier by normalized lexicographic minimax regret;
- present only complete palettes and record all sacrificed as well as improved dimensions;
- authorize no extraction output, candidate freeze, or promotion.

## Stage 5: Joint Complete-Tuple Candidate

Use canonical `0.19` as the incumbent complete tuple. Field treatment is the outer evidence domain,
not an independently committed selection. For every field treatment, recompute foreground and
accent alternatives before comparing complete tuples.

The first joint candidate is deliberately conservative:

- a challenger introduces source-exact colors only; canonical generated colors remain legal only in
  the incumbent;
- it does not introduce foreground/accent collapse because the completed Stage 3 review found zero
  wins for that mechanism; existing canonical collapse remains a legal incumbent;
- maximum four-color cardinality and explicit field, gradient, and accent collapse remain hard;
- every declared signed APCA relation remains finite and recomputable but has no fixed floor;
- a challenger must Pareto-dominate the incumbent complete tuple on field support, field relation,
  foreground role evidence, foreground worst-field contrast, accent identity, and primary
  accent-on-background contrast;
- accent-on-surface remains diagnostic or a later tie signal;
- incomparable tradeoffs preserve canonical exactly;
- among every complete tuple that dominates canonical, selection first prefers fewer changed
  semantic blocks, where background, surface, and field state form one coupled block and foreground
  and accent each form one block; candidate-to-candidate Pareto dominance is applied only within
  that minimum-block class, followed by fewer changed atoms and deterministic stable identity;
- there is no postselection repair, veto, or role mutation.

Every changed tuple carries the constrained ablations declared above. Evaluate every change directly
against canonical `0.19`.

## Stage 6: Joint Review And Freeze

Review the complete changed set from the joint candidate. Prior judgments transfer only when the
source, canonical palette, candidate palette, field state, and presentation are exact matches.

```text
canonical 0.19
  -> source field treatments
  -> pair-local foreground and accent frontiers
  -> hard provenance and role constraints
  -> complete-tuple Pareto comparison against incumbent
  -> constrained role ablations
  -> blinded complete-palette review
  -> freeze attributable joint improvement or preserve canonical exactly
```

Only the interacting joint candidate can pass the complete-palette quality gate.

## Success Definition

A joint candidate is an improvement when it:

- preserves canonical output exactly for every unchanged source;
- produces zero hard structural violations;
- receives no weak or unacceptable judgments on its complete changed set;
- receives no baseline-stronger judgment;
- receives at least one candidate-stronger judgment;
- has recomputable evidence, deterministic ablations, and predeclared stopping rules.

No reserve may be opened until a joint candidate is frozen after authorized development evaluation
and complete changed-set review.
