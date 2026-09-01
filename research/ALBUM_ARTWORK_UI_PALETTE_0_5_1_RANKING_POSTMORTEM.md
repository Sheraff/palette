# Album Artwork UI Palette 0.5.1 Ranking Postmortem

Status: bounded development ranking experiment failed. Candidate
`album-artwork-first-principles-0.5.1` is not eligible for freeze, future-sample execution, Phase 4,
Phase 5, promotion, persistence, or full-roster execution.

## Binding

- Implementation SHA-256: `5589b85e5c2b9a1c57c15240dec3ad983c8193f13720bbceee3d5ccb7138cb3f`.
- Scientific SHA-256: `8ecbc6e61935cece60bd110a5d41ad7d160fd9ef1dd39109588a5542c2ec6fa5`.
- Review manifest ID: `fd14081fa2d05660afde4a31093c1e450ca7bd0725b16f1d70aa5bdd3e13ec91`.
- Review analysis ID: `1ad02000067ec7025c4fbfff3cde52d8445a4ed32a542b9b478a16ff730ea962`.
- Future sample 02 remained unopened.

## Mechanical Result

The declared active-role bottleneck formula was implemented correctly. Per-source complete-candidate
and Pareto-frontier counts were identical to `0.5.0`, all role-admission and execution bounds remained
valid, and no winner changed gradient state. The formula nevertheless changed 19 of 28 development
winners, including one field-treatment change.

## Human Result

All 19 changed winners received the predeclared blinded paired review against `0.5.0`:

- candidate strong or acceptable: 13 of 19;
- candidate stronger: 1 of 19;
- similarly valid: 10 of 19;
- gate-passing pairs: 11 of 19;
- gate-failing pairs: 8 of 19.

Failed cases were `development-03`, `development-04`, `development-06`, `development-08`,
`development-09`, `development-11`, `development-16`, and `development-25`.

The failure modes were not random:

- `development-04` and `development-11` retained acceptable new treatments, but the predecessor was
  stronger. The `development-11` change lost the artwork's red accent.
- `development-08`, `development-16`, and `development-25` regressed from strong or acceptable
  predecessors to weak fallbacks.
- `development-06` regressed from strong to weak fallback, retained the missing-gradient issue, and
  added incomplete artwork identity.
- `development-09` regressed from strong to unacceptable with incomplete artwork identity.
- `development-03` remained below acceptable on both sides and made the candidate worse.

The intended `development-24` correction succeeded: the reviewed `0.5.1` winner was strong and stronger
than the acceptable `0.5.0` winner.

## Interpretation

`min(foregroundUtility, accentUtility)` was too broad for the first lexicographic ranking block. It
treated every low-utility distinct accent as a foundation bottleneck even when that accent carried
important source identity and remained observable over its complete field. This over-promoted generic
high-contrast role colors and role swaps.

The narrower development distinction is path continuity, not low utility by itself:

- every `0.5.0` winner except `development-24` has nonzero APCA output at every applicable foreground
  and distinct-accent sample;
- the `development-24` winner has distinct-accent output at three of five samples and literal APCA zero
  output at two interior samples;
- low-but-valid reviewed accents on `development-09`, `development-11`, `development-14`, and
  `development-16` remain nonzero at every applicable sample.

## Decision

Candidate `0.5.1` is abandoned. A subsequent revision may preserve the original `0.5.0`
foreground-based foundation for fully observable treatments and add only a continuous sampled-path
observability factor derived from the already bound literal APCA zero-output condition. It must not add
a magnitude threshold, fitted color rule, gradient bonus, signature-color bonus, or source-specific
branch. Any such revision requires a separate protocol and bounded gate before freeze.
