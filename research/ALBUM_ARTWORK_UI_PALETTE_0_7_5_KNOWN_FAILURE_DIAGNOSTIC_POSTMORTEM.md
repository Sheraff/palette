# Album Artwork UI Palette V2 0.7.5 Known-Failure Diagnostic Postmortem

Status: the authorized bounded Phase 3 preparation for `0.7.5` is complete. The evidence-bound known-bad
roster and read-only current-domain custody audit are frozen and independently reproducible. The audit does
not support one repeated failure class across the two severe Phase 4 blockers. Under the predeclared mechanism
selection rule, `0.7.5` therefore ends as a diagnostic audit with no candidate protocol, implementation,
counterfactual output, or human review.

Normative product direction remains `research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. The immediate baseline
remains closed `album-artwork-first-principles-0.7.4`; the default extractor and safety control remain
`album-artwork-first-principles-0.7.2`.

## Bound Evidence

- Known-bad roster version:
  `album-artwork-palette-v2-0.7.5-known-bad-roster-1.0.0`.
- Roster path: `research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json`.
- Roster ID: `0ce0465834d82b1a72e931eab21e5a4b318eac14919c4bb07b59e5e7e5653c6f`.
- Roster raw SHA-256: `6ab3c41f60b35bc87a53ee8da887dc7daa1d76cba0774ff15bfb0a858b6248b3`.
- Roster preparation script raw SHA-256:
  `60b2a20e0f41cbefc24f8670a79e20005549ed85c7de4b97ee7c08d378e8ba19`.
- Custody-analysis version:
  `album-artwork-palette-v2-0.7.5-known-failure-audit-1.0.0`.
- Custody-analysis path:
  `research/data/album-artwork-palette-v2-0.7.5-known-failure-audit.json`.
- Custody-analysis ID:
  `1fb095ab8d331694eaf09ab5405532961ca3e4845142ddc92b14f88bc5f54ae1`.
- Custody-analysis raw SHA-256:
  `5a9302296c617512788d02edeac1a3f7d7ce1c183b11d7a98c6de9a277423cdf`.
- Custody-analysis preparation script raw SHA-256:
  `cb953504d1872d9c1f1242b845ebc7f477be5264f40bb6bcc8aac6a356d4ea06`.
- Focused test raw SHA-256:
  `a53995543bc9988a335b63945fb0aaadcd2e62381b63bdf2576f0b3a10c48d49`.

Both preparation scripts verify every bound raw input, derive semantic IDs from canonical JSON, refuse to
overwrite their artifacts, and support exact `--verify` reproduction.

## Frozen Roster

The roster freezes seven exact current-source and current-treatment cases before any `0.7.5` counterfactual
output:

| Case | Severity | Blocks Phase 4 | Bound current human result |
| --- | --- | --- | --- |
| `development-03` | severe | yes | repeated `unacceptable` or `weak-fallback`; incomplete field and foreground identity |
| `development-12` | severe | yes | `weak-fallback`; incomplete identity because bright yellow is absent |
| `development-16` | systemic diagnostic | no | `acceptable`; repeated missing-gradient and accent criticism |
| `development-19` | systemic diagnostic | no | `acceptable`; exact historical strong preferred alternative exists |
| `development-26` | systemic diagnostic | no | `acceptable`; repeated foreground-polarity criticism |
| `development-13` | accepted isolated limitation | no | `acceptable`; optional slight-gradient request |
| `development-15` | accepted isolated limitation | no | `acceptable`; explicitly uncertain criticism with no issue tags |

Human responses, issue tags, verbatim comments and hashes, and technical interpretations remain separate.
Changed or novel treatments are marked unreviewed. No source-level label is inherited by a different complete
treatment. Protected and fresh sources are excluded.

## Custody Result

| Case | Earliest demonstrated result | Current-domain evidence |
| --- | --- | --- |
| `development-03` | discovery-semantic failure at field-hypothesis proposal | a source-connected blue-green gradient and legal black-foreground/magenta-accent treatment exist in the prior widened-family diagnostic arm, but the field hypothesis is not proposed to the selected `0.7.4` retention boundary |
| `development-12` | unresolved after complete construction | a legal black-foreground/yellow-accent treatment is already constructed, but it is unreviewed and fails the current guard on `accentUtility`; human evidence cannot distinguish a visibly good suppressed treatment from another poor alternative |
| `development-13` | accepted isolated limitation | gradient treatments already reach the public slate and the request was optional |
| `development-15` | accepted isolated limitation | no bound systemic failure is demonstrated |
| `development-16` | discovery-semantic failure at field-hypothesis proposal | all `0.7.4` treatments are flat and every predeclared `0.7.3` recall arm contains zero gradient hypotheses |
| `development-19` | ranking or retention failure at public-slate retention | the exact reviewed strong preferred treatment reaches the ordinary frontier but not the public slate |
| `development-26` | unresolved after ordinary frontier | a legal light-foreground treatment reaches the frontier, but it is unreviewed |

The audit does not call an unreviewed treatment strong, acceptable, or resolving. Candidate-domain, frontier,
guard, and slate presence are mechanical custody facts only.

## Mechanism Decision

No mechanism is selected.

The two severe blockers do not share a demonstrated class:

- `development-03` loses the needed field direction before field-hypothesis proposal;
- `development-12` already constructs the relevant role combination and becomes unresolved only because the
  visible quality of the suppressed and retained alternatives is unknown.

The permitted mechanism assessments are therefore:

- deterministic ranking correction: not supported by repeated reviewed strong alternatives already in public
  slates;
- role-specific identity attribution: not the earliest loss for `development-03` and disproved as an
  availability loss for `development-12`;
- multi-hue or piecewise field structure: not demonstrated across the severe cases;
- mechanism-aware joint construction: disproved for `development-12` and not the earliest loss for
  `development-03`;
- discovery-semantic follow-up: supported for `development-03` and non-blocking `development-16`, but not for
  severe `development-12`, and no common one-factor proposal boundary is proved even between `03` and `16`;
- representative or collapse follow-up: not demonstrated across the severe cases.

This activates the `0.7.4` review postmortem's stop rule: if no single class is supported, end `0.7.5` as a
diagnostic audit rather than guessing or combining mechanisms. The required candidate protocol
`research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_5.md` is intentionally not created because there is no
evidence-selected one-factor candidate to predeclare.

## Smallest Next Evidence Unit

The audit predeclares, but does not authorize or prepare, one bounded diagnostic review:

- case: `development-12` only;
- exact `0.7.4` control key: `#fffffe:#fffffe:#080808:#584c1c:flat`;
- exact alternative key: `#fffffe:#fffffe:#e6e622:#584c1c:flat`;
- alternative selection rule: first deterministically ordered unreviewed public-slate treatment after the
  current winner;
- denominator: one blinded pairwise item;
- purpose: determine whether the best source-independently ordered unreviewed retained alternative closes the
  severe failure or merely displaces it.

This review cannot establish generalization or Phase 4 readiness. If the alternative is visibly strong while
the current winner remains weak, it supplies ranking evidence. If both remain weak, it rejects ranking as the
repair for this case but may still leave the earliest constructive cause unresolved.

Opening or preparing that review requires separate explicit authorization.

## Phase Position

Work remains in V2 Phase 3. Both severe known-bad cases remain unresolved or unrepaired, so Phase 3 cannot
close and `0.7.4` cannot be frozen for Phase 4.

No `0.7.5` inference code was changed. No candidate output was generated. The default extractor remains
`0.7.2`; historical `0.7.2`, `0.7.3`, and `0.7.4` artifacts remain immutable.

## Handoff

The next authorized unit should proceed in this order:

1. bind this postmortem, the frozen roster, and the custody analysis;
2. if explicitly authorized, prepare exactly the predeclared one-item `development-12` diagnostic review;
3. analyze the submitted response descriptively without changing inference;
4. rerun the mechanism-selection rule using the frozen severe denominator;
5. write a separately versioned one-factor candidate protocol only if one repeated severe failure class is then
   supported; and
6. otherwise retain the diagnostic stop and request a separately bounded evidence unit rather than inspecting
   arbitrary alternatives.

Do not start a discovery change for `development-03`, a ranking change for `development-19`, or a polarity
change for `development-26` as `0.7.5`. Each is real diagnostic evidence, but none closes the unresolved severe
denominator under one common demonstrated mechanism.

## Authorization Boundary

This diagnostic audit authorizes no candidate implementation, counterfactual candidate output, review
preparation, human review, protected or fresh artwork access, full-roster execution, Phase 4, promotion,
persistence, default-extractor replacement, product-baseline change, or production replacement.
