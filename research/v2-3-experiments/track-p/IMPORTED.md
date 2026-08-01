# Imported — Track P tier-A perturbation analysis

`LEDGER.md` and `AGENDA.md` in this directory are imported **docs-only** from the Track P agent
branch so that the pin citations in `research/v2-3/test/configuration.test.ts` resolve at HEAD.

| | |
|---|---|
| source branch | `worktree-agent-a9652f5642a9e2b25` |
| source commit | `265ceba` — *"track-p: tier A complete — fragility measured, and it is not where the review effort went"* (2026-08-01) |
| imported files | `LEDGER.md` (411 lines), `AGENDA.md` (411 lines) — byte-identical to the source commit |
| imported by | the pervasive-cliff pinning arm, branch `worktree-agent-a9ba31ec28d059cff`, base `9063f6e` |
| not imported | `probe/`, `data/`, `build-review-series.ts`, `detect-boundary-contest.ts`, `harvest-anomalies.ts` — the arm's instrumentation and its 445 KB of raw measurement, which stay on the source branch |

## What changed relative to the copies already on trunk

Trunk carried an earlier Track P state (pre-tier-A). The import replaces `LEDGER.md` and
`AGENDA.md` with the tier-A-complete versions. `EXPERIMENT.md` is deliberately left as it stands on
trunk: the source branch deleted it, but deleting a record is not importing one, and no pin cites
it.

**Every line-number citation in `configuration.test.ts`, `policy.ts` and `palette-core.ts` was
re-resolved against the imported files in the same commit.** The mapping, for anyone auditing an
older citation:

| old | new | what it points at |
|---|---|---|
| `LEDGER.md:109` | `:115` | the midpoint bar's six-vs-seven anchor arithmetic |
| `LEDGER.md:113` | `:119` | `PROMOTION_ENVELOPE`, "1 named" |
| `LEDGER.md:117` | `:123` | `mark.*` — "no per-value anchor" |
| `LEDGER.md:145-149` | `:136-139` | the two quality-weight maps, FITTED / UNEVIDENCED |
| `LEDGER.md:147-148` | `:153-154` | `maximumQualityLoss`, "no cited derivation for the magnitude" |
| `LEDGER.md:191-194` | `:202-205` | `maximumIdentityGain` — "up to ten quantized utility bands" |
| `LEDGER.md:194-203` | `:207-215` | the `fieldFidelity` / `collapsedSurfaceFidelity` misattribution |
| `LEDGER.md:208-213` | `:219-224` | the missing literature review and the one uncited JND line |
| `LEDGER.md:258` | **retracted** | see below |
| `AGENDA.md:181-186` | `:276-280` | the same misattribution, agenda side |
| `AGENDA.md:188-190` | `:283-285` | `TRANSITION_PROMOTION_ORDER` contradicts its own comment |

## One citation is retracted, not relocated

The `identityChromaticSeparation = 0.01` pin cited `LEDGER.md:258` for "18,005 of 430,413
comparisons flip at ±20 %" as evidence the threshold sits close to a boundary. That was Track P's
**census** boolean-flip count, and tier A retired the method that produced it in the arm's own
words (`LEDGER.md:260-263`): *"A boolean-flip margin is not evidence of output fragility."* At
winner level the constant is live on 151 artworks and flips **3** (`LEDGER.md:276`). The pin now
records the retraction and the replacement measurement.

The same retraction applies to Track P's provisional "fragile fence" call on
`identity.decisiveForegroundPolarity = 0.6`, which tier A measured at 2 flips in 135 live artworks.
Tier A found **zero fragile fences**.

## How to read these records against today's trunk

The instrumented mirror was built at **`c2366d2`**, not at this trunk. `LEDGER.md:347-367` states
the carry-forward: 318 of 335 measured sites reach `research/palette-0.9-checkpoint` unchanged in
identity and value; `MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE` relocated to
`POLICY.distinctness.sameColor` at the same 3.3; one site is genuinely gone. **All thirteen
pervasive cliffs carry forward.** Nothing introduced by the batch-26/27/28/30 integrations or by
`gamut-coverage.ts` — including `GAMUT_COVERAGE.saturation = 0.75` — exists in this data at all.
