# Album Artwork UI Palette Candidate Protocol V2

Status: bound before candidate output on 2026-07-26.

Normative direction is exclusively `research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. Historical plans,
incumbent palettes, filenames, source IDs, review comments, color names, and target values do not
participate in extraction or ranking. The remaining full-roster run is unused and is prohibited until
the user supplies a separate literal `GO` after all bounded gates pass.

## Product Binding

- Canonical output colors are immutable three-channel 8-bit sRGB tuples with channels in `0...255`.
  Display uses lower-case six-digit sRGB hex. Internal evidence uses OKLab.
- Equality is exact canonical tuple equality. Only `surface === background` and
  `accent === foreground` are legal collapses. Background and foreground are always distinct.
- Ordinary colors are exact source pixels or sRGB-gamut-clipped synthesized representatives no more
  than `0.025` OKLab from an occupied dense source neighborhood. Every ordinary color carries a
  support record.
- An emergency pure black or pure white candidate is eligible only when the maximum absolute APCA Lc
  among all distinct artwork-supported field/foreground candidate pairings is below `5`, or when the
  supported domain cannot form two distinct canonical colors. It carries a `0.18` ranking penalty and
  generated role, source-domain maximum contrast, eligibility reason, and alternatives diagnostics.
- Gradient review rendering is one CSS linear gradient at `135deg`, with background at `0%`, surface
  at `100%`, and interpolation in OKLab. Conversion to display sRGB clips each channel. Contrast is
  sampled at positions `0`, `0.25`, `0.5`, `0.75`, and `1` using the same interpolation.
- Inferred gradient direction, linear topology, endpoint bands, progression, residual, coverage, and
  supporting family identities remain in field hypotheses and complete-treatment diagnostics. Public
  output projects that evidence to a boolean.
- Contrast uses signed APCA Lc from `apca-w3@0.1.9`. Applicable pairs are foreground/background,
  foreground/surface, accent/background, and accent/surface. Magnitude is continuous evidence; all
  research-stage positive-magnitude hard floors are disabled. A distinct accent is structurally legal
  only when every applicable accent/field pair is outside APCA's own literal zero-output dead-zone;
  this adds no epsilon or fitted positive threshold, and collapsed accent remains legal. The number of
  complete treatments rejected by this structural rule is serialized in candidate-availability diagnostics.
- Discovery always uses the decoded native raster. A small grid derived from the same raster may add
  broad-transition evidence only after native color families and connected support exist.
- Gradient fitting is restricted to connected native field domains. A domain can cross family
  boundaries only when both aggregate boundary contrast and the traversed native edge are within the
  family tolerance. It must cover at least 8% of the raster, own at least two 15%-corner fields, and
  have population-weighted field support of at least `0.35`. Up to two deterministically ranked
  endpoint-family representatives per topology-relative band come only from the owned domain, and all
  four bounded endpoint pairings are evaluated before gradient rejection. Topology order remains diagnostic;
  role-attributed endpoint order enters field variants, which recheck the bound `0.028` OKLab
  material-distance minimum.
- Gradient topology order and semantic UI role order are separate evidence. The low and high topology
  endpoints remain serialized in fit order, while background versus surface is assigned by fixed
  `0.04` evidence levels over frame coverage, peripheral coverage, connected coverage, field score,
  and population coverage, in that order. Flat and gradient hypotheses use the same role assignment;
  color darkness, hue, and endpoint parameter order do not decide semantic roles.
- Up to four broad connected domains may seed at most six paired field corridors. Both seeds must each
  cover at least 8% of the raster, at least half the quadrants, at least `0.035` of the image border,
  and field score `0.35`; their centroids must differ by at least `0.18` and mean colors by at least
  `0.06` OKLab. A native four-neighbor corridor may include intervening pixels only within `0.08`
  OKLab of the seed-color segment and must reach at least 25% of the second seed. An eligible corridor
  covers at least 20% of the raster, `0.20` of the border, three quadrants, one corner field, and three
  supported intermediate families, each occupying at least 0.2% of the corridor. Connected
  cross-family domains retain a `0.27` dominant-mode progression gate; same-family endpoints retain a
  `0.16` normalized within-band dispersion gate. Paired corridors use their intermediate-family gate
  instead of either endpoint-family gate. They must additionally have either at least `0.8` native
  band progression or at least 30% intermediate-color population. All gradients remain subject to
  progression, monotonicity, residual, texture, endpoint, and native edge-continuity diagnostics, so
  discrete illustrated fields, stripes, and interior-object lighting remain rejected.
- Connected regions retain local boundary contrast, signed boundary-lightness polarity, geometry,
  fill, repetition, border/interior, and source-support observations before role pruning. For each
  family, up to four strongest repeated typography observations form a confidence-weighted signed
  source polarity. Foreground proposals retain source/UI polarity agreement jointly with unsigned APCA
  utility; absent or cancelling polarity evidence is neutral. Foreground and signature lanes combine
  region observations with family evidence, and foreground and distinct-accent generation is closed
  over its corresponding lane.
- Per-field foreground proposal quotas preserve the complete conditionally ranked role-lane prefix.
  Six directions are the minimum; otherwise the quota uses all capacity remaining under the global
  1,500-treatment bound after reserving the exact worst-case generated-emergency count. Each foreground
  reserves one accent-collapse and up to four distinct-accent treatments. Multiple near-equivalent
  representatives from one family cannot consume slots needed by distinct role directions.
- A distinct accent's economy contribution is its signature support multiplied by its perceptual
  separation from foreground. A near-duplicate accent therefore cannot earn a separate role merely by
  coming from a strong family. Distinct accents must also come from a different source family than
  background, surface, and foreground; multiple representatives of one family cannot manufacture a
  semantic role distinction.
- A separate flat surface must have component-backed field ownership of at least `0.45`, supplied by
  broad distributed/border support or a resolved high-fill interior layer. Aggregate adjacency alone
  cannot turn a compact irregular interior object into a UI surface. Flat-field fidelity weights
  background support `0.35`, surface support `0.10`, relation evidence `0.25`, and component-backed
  field ownership `0.30` so a strongly owned second field is not erased by its lower global population.
- Foreground and distinct-accent utilities are separate score blocks. Each is the square root of the
  equal-weight mean of normalized mean APCA magnitude and normalized worst-field APCA magnitude; the
  foreground denominator is `90` and accent denominator is `75`. A collapsed accent inherits
  foreground utility. The square root encodes diminishing returns without imposing a hard floor, while
  the worst-field term prevents cross-field invisibility from hiding inside an average.
- Accent fidelity is explicit optional-role evidence. A distinct accent multiplies its signature role
  score by the square root of its foreground separation, measured from the `0.018` material-distance
  floor across a `0.18` OKLab range; a collapsed accent uses one minus the strongest conditionally
  available accent fidelity. Foreground and accent proposal caps retain the highest conditionally
  ranked representative from each family rather than reverting to unconditional lane order. Field
  structure is field fidelity multiplied by the square root of surface fidelity, so surface evidence
  can preserve or penalize but never amplify the underlying field interpretation. A distinct surface
  uses its measured contribution and a collapsed surface uses one minus the strongest role-local
  surface opportunity for that background family. Surface opportunity is not attenuated by field
  fidelity because field fidelity remains an independent score block. Field identity is the geometric
  mean of field structure and artwork identity.
  Treatment foundation is the geometric mean of field structure, artwork identity, and
  required-foreground utility.

## Bounds And Determinism

- No randomness or seeded pseudo-randomness is used.
- At most 48 color families are retained diagnostically, with independent caps of 12 field, 16
  signature, and 16 foreground families before their union.
- Per family, the eight largest components and up to 24 additional role-observation components are
  retained by deterministic union; at most four retained typography regions contribute to signed
  polarity. At most 12 eligible connected field domains are fitted and 48
  component-backed domains are serialized diagnostically.
- At most two endpoint families per gradient band, 12 structured field hypotheses, two representative
  strategies per role, a budget-adaptive minimum of six foregrounds per field variant, four distinct
  accents plus collapse, and 1,500 complete candidates are scored.
- No legal candidate is removed by a compensatory scalar before ranking. Exact treatments are
  deduplicated, and componentwise Pareto dominance uses deterministic `0.04` evidence levels over
  field fidelity, surface fidelity, artwork identity, representativeness, foreground utility, accent
  fidelity, accent utility, coherence, and economy after the generated-color penalty. The same evidence
  levels drive deterministic top-one in the declared semantic priority order: treatment foundation,
  field identity, field fidelity, field structure, accent fidelity, accent utility, artwork identity, foreground
  utility, representativeness, coherence, then economy. Accent utility resolves evidence-level ties in
  accent fidelity rather than vetoing a stronger signature identity from a lower-priority position.
  ASCII identity is the final tie breaker. Raw sub-resolution decimal differences cannot remove a
  candidate or decide top-one; derived generator confidence remains diagnostic only.
  Historical weighted scores remain diagnostics only.
- Up to eight materially distinct Pareto-frontier treatments are returned, prioritizing unseen field
  treatment kinds, then unseen field directions, before additional complete directions. Search does
  not reward raw cardinality.
- Development evaluation uses at most six source workers and declares the worker count. A repeated
  result must be byte-identical apart from explicitly measured wall time.
- Wall time, source dimensions, candidate counts, and worker count are recorded. Optimization follows
  measurement and may not replace native discovery with resizing.

## Source Custody

- Authorized read-only artwork roots are `images/`, `music-artworks/`, and `00/` through `0f/`.
- Any other dataset root requires explicit user authorization before listing, reading, hashing,
  decoding, or rendering.
- The 28-source development panel is fixed by
  `research/data/album-artwork-palette-v2-development-panel.json`: 19 explicitly classified stress
  artworks from `images/` and one deterministic metadata-only selection from each of `00/` through
  `08/`.
- The fresh directional sample is fixed by
  `research/data/album-artwork-palette-v2-fresh-sample.sealed.json`: 12 independent source groups from
  `0f/`, selected only from the pre-existing provenance inventory by a domain-separated SHA-256 rule.
- Development commands reject any source hash in the sealed sample. Fresh artwork may not be decoded
  by this candidate until Phase 4 is separately reached after the Phase 3 human checkpoint.
- Exact encoded duplicates and stable artwork IDs are one source group. Cross-resolution agreement is
  not evaluated and alternate versions are not sought.

## Review Binding

- Review shows the artwork borderlessly inside a complete palette-only mock UI. All chrome outside the
  preview is literal black and white.
- Every displayed role and swatch shows its role, lower-case hex, collapse/generated status, and a
  `colornames-oklab@0.6.0` nearest name. Every written color name has a small sample of that exact
  displayed color beside it. Names and samples are presentation-only.
- Absolute labels are `strong`, `acceptable`, `weak-fallback`, `unacceptable`, and `uncertain`.
- The completed Round 2 availability review used one strongest treatment plus optional independently
  valid alternatives. Its presentation and feedback remain archived as historical development
  evidence, including the finding that the surface-heavy mock biased cardinality and field judgments.
- Subsequent broad development reviews show only the deterministic top treatment for at most 12
  artworks. They ask one required absolute-quality question and provide one optional free-text comment;
  they do not ask for tags, alternative ranking, or validity marking. Alternative availability is
  reviewed separately on a targeted diagnostic subset of at most four artworks when a specific
  evidence-versus-ranking question requires it.
- The targeted Pareto-mechanism review shows at most four blinded complete treatments per artwork and
  asks which are independently valid. Any subset is an equal set of positive directions; unselected
  treatments are unlabeled rather than negative. `none confidently valid` and `uncertain` are mutually
  exclusive fallback responses. When a targeted artwork was reviewed in the immediate predecessor,
  its selected treatments remain eligible as blinded controls after the current Pareto and legacy
  scalar directions; verbatim comments continue to moderate those controls.
- Architecture checkpoints may additionally ask for one optional preferred option among those already
  marked independently valid. Preference must be null or reference a selected positive; it never turns
  unselected options into negative labels.
- Subsequent preview mocks devote the large majority of area and content to the complete background
  treatment. A solid surface appears only as a small secondary section. Gradient treatments still use
  the bound full-preview 135-degree OKLab interpolation, without a large opaque surface panel hiding it.
- Optional reviewer tags are only `missing gradient`, `extraneous gradient`, and
  `incomplete artwork identity`. Free text is preserved verbatim with a 2,000-character limit.
- Agent-inferred technical classes are stored separately with a trace to the original response and an
  explicit uncertainty flag. They never become inference features.

## Phase Boundary

Phases 1 through 3 may run on bounded development sources. Phase 3 ends at a human review checkpoint.
Phase 4 fresh evaluation, baseline comparison, persistence, optional learning, full-run preflight, and
the full run are not implicitly authorized by this protocol.
