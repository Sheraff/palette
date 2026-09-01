# Next Palette Connected-Family Architecture

Status: development only. This architecture does not authorize review, promotion, or access to
output-unseen roots.

## Problem

The frozen 12-center shortlist can erase small connected typography and identity families before
joint role inference. Population-based family coverage then rewards broad field families over the
small exact-source families the palette is expected to preserve.

## Availability

Connected-family availability is computed before role inference from source evidence only:

- 12 overlapping OKLab hue windows reuse the existing chroma and lightness domain.
- Four-connected components must contain at least four pixels and carry existing saliency or text
  evidence.
- Ordinary population support, one sufficiently large connected component, or repeated evidenced
  components across source regions can establish availability.
- Existing candidates represent a component only when their exact representative pixel lies in
  the retained mask and their representative color is within the existing family radius.
- Every proposal retains an exact source representative, exact mask, mask hash, source bins,
  connected components, and deterministic stable key.
- Overlapping hue-window proposals are suppressed by source-mask overlap or representative color
  distance. There is no scalar score floor or proposal-count cap after evidence qualification.

Comments identify failure classes and evaluation cases only. They do not provide target colors to
the availability algorithm.

## Perception

`palette-perception-connected-family-0.2.0-dev` retains the original Lloyd masks as the complete,
non-overlapping source partition. Connected-family masks are additional overlay evidence, like the
existing light-typography mask, and do not remove or reassign source pixels from the field domain.

Candidate construction and role membership are explicit:

| Construction | Field role | Overlay roles |
| --- | --- | --- |
| `lloyd-cluster` | allowed, subject to field eligibility | allowed |
| `light-typography` | disallowed | allowed |
| `connected-family-reserve` | disallowed | allowed |

Each connected reserve is an independent source family. Its family mask is its exact connected
evidence mask. Overlap with a broad Lloyd family is permitted and remains explicit; source
reconstruction uses only the non-overlapping Lloyd partition.

## Inference

`region-graph-next-0.4.0-connected-family-dev` retains the `0.3` field relation and consumer APCA
policy. Connected reserves participate in complete foreground and accent inference but cannot
become background or surface.

The global population-mass family-coverage objective is removed for this version. Foreground and
accent families compete through their role-local source support. The fifth certificate slot is a
constant `noGlobalFamilyMassPenalty = 1` to preserve certificate reconciliation while isolating
this development change; it is not evidence and does not rank tuples.

The solver must not force an arbitrary connected family into the palette. When several source
families are available but the four-role budget cannot represent all of them, source evidence may
rank them, but qualitative comments may not choose one inside inference.

## Stops

Before review:

1. All six availability-attributed comment cases must expose source-exact connected proposals.
2. Equal-histogram isolated-speck controls must not qualify while connected controls do.
3. Lloyd field masks must still partition every source pixel exactly once.
4. Reserve nodes must remain absent from every field edge while retaining complete overlay edges.
5. Complete tuple counts, hard-constraint rejections, explicit APCA adjacency, deterministic
   ordering, generated fallback authorization, and source provenance must reconcile.
6. The same 392 authorized sources and every prior comment case must be evaluated before any new
   human review is considered.
