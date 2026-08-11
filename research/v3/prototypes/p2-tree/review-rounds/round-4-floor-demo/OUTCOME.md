# phase2-pair-018 — verified decode and outcome (I4 floor demonstration)

Analyst verification: **clean.** Blinding `{A:0,B:1}` confirmed three ways (blinding index,
paletteHashes, foreground hexes); 6 raw verdicts → 1 resolved (5 autosave prefixes of the
same answer, no divergence); confound false; no veto.

| side | variant | fg | grade |
|---|---|---|---|
| A | true-ink-floor-waived | `#1e2221` | unacceptable |
| B | published-halo | `#fcffff` | acceptable |

Preference: **B (published-halo)**. Reviewer note, verbatim:

> side A has the right idea to take a color from the artwork for the foreground, but it did
> not pick the correct one, and as a result the contrast is *indeed* too low and should not
> pass the minimum hard contrast floor. However there *are* valid picks in the image such as
> Charcoal or Putty.

## Firing row and action (MECE table row 3, guard clear)

**The floor stands. The colour pick was the defect. No contract request is filed — the D12
I4 escalation is CLOSED by reviewer verdict.**

## Convergence note (recorded, not claimed as validated)

The pre-declared action for this row — "P2 builds antialias-ineligibility so the walk lands
on a better-than-halo colour" — was already landed pre-verdict (worker L, `78f0285`): on this
exact cover the current build's foreground is the node-backed `#cba69d`, a putty tone in the
family the reviewer names as valid. Whether it is *the* right pick is for the next quality
round; nothing about it is asserted from this verdict.

Flag carried from the analyst: the note names example colours ("Charcoal or Putty"), not an
exclusion property — the eligible-pick definition remains P2's (structural: node-backed,
non-boundary-tracing), not a reviewer-specified rule.
