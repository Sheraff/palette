# Album Artwork UI Palette V2 0.7.5 Development-12 Diagnostic Review Protocol

Status: immutable, separately authorized preparation protocol for one blinded diagnostic review package. This
is not a `0.7.5` candidate protocol and authorizes no candidate or inference implementation.

The current authorization covers preparation and verification only. It does not authorize serving or opening
the review, viewing the rendered review, submitting feedback, or analyzing a response.

## Identity And Scope

- Protocol ID:
  `album-artwork-ui-palette-protocol-v2-0.7.5-development-12-diagnostic-review-1`.
- Review version:
  `album-artwork-palette-v2-0.7.5-development-12-diagnostic-review-1.0.0`.
- Presentation version: `album-artwork-palette-v2-complete-treatment-presentation-1`.
- Evidence class: `bounded-development-known-failure-diagnostic`.
- Private namespace:
  `research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/`.
- Application namespace:
  `research/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/`.
- Denominator: exactly one item, `development-12` only.
- Purpose: determine whether the first source-independently ordered unreviewed public-slate treatment after
  the current winner closes the known severe failure or merely displaces it.

No other source, public-slate entry, frontier entry, complete treatment, protected or fresh artwork, or full
roster is in scope.

## Authoritative Bindings

| Input | Semantic ID or IDs | Raw SHA-256 |
| --- | --- | --- |
| `research/ALBUM_ARTWORK_UI_PALETTE_0_7_5_KNOWN_FAILURE_DIAGNOSTIC_POSTMORTEM.md` | `album-artwork-ui-palette-v2-0.7.5-known-failure-diagnostic-postmortem-1` | `3b6892ce36af983206119b650c3cc35e567e63fd530d9a10417f3a100a97d076` |
| `research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json` | `album-artwork-palette-v2-0.7.5-known-bad-roster-1.0.0`; `0ce0465834d82b1a72e931eab21e5a4b318eac14919c4bb07b59e5e7e5653c6f` | `6ab3c41f60b35bc87a53ee8da887dc7daa1d76cba0774ff15bfb0a858b6248b3` |
| `research/data/album-artwork-palette-v2-0.7.5-known-failure-audit.json` | `album-artwork-palette-v2-0.7.5-known-failure-audit-1.0.0`; `1fb095ab8d331694eaf09ab5405532961ca3e4845142ddc92b14f88bc5f54ae1` | `5a9302296c617512788d02edeac1a3f7d7ce1c183b11d7a98c6de9a277423cdf` |
| `research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-12.json` | `album-artwork-first-principles-0.7.4`; `album-artwork-ui-palette-protocol-v2-0.7.4`; `a80f75b402a12516fb00f2afb3dd56e4c0fb8a4a5f7d8d5284e557eec87a3d09`; `0a0bf7b95bc683882fada068d363fcab7e022420d0867261228aaab51ed68bd3` | `2fd1a63bca5838bbbc0fb6655700532955454fd21d201b06975903bf1d1e0ffd` |
| `research/data/album-artwork-palette-v2-development-panel.json` | `bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305` | `9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4` |
| `images/vvbrown.jpg` | `development-12`; `exact:06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0` | `06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0` |

The source is the explicit checked development file above, with exactly 57,673 bytes. Preparation,
verification, and later serving use that one path directly and perform no artwork-root enumeration. They do
not read, resolve, stat, hash, decode, render, or serve any protected or fresh artwork path.

Every protocol, implementation, server, test, README, package-script, and UI file is included in the private
manifest with exact byte count, raw SHA-256, and semantic file ID. A semantic file ID is SHA-256 of canonical
JSON containing exactly the binding domain, path, and raw SHA-256. The protocol file instead uses the protocol
ID as its semantic ID. The immutable manifest content ID binds these implementation bindings.

## Exact Treatments

The checked `0.7.4` artifact is the only treatment source:

| Role | Public slate index | Exact key | Review state |
| --- | ---: | --- | --- |
| control | 0 | `#fffffe:#fffffe:#080808:#584c1c:flat` | checked current winner; reviewed |
| alternative | 1 | `#fffffe:#fffffe:#e6e622:#584c1c:flat` | first ordered alternative; unreviewed |

Preparation must prove that the control is byte-semantically equal to both `scientific.candidate.winner` and
`scientific.candidate.slate[0]`, and that the alternative is exactly `scientific.candidate.slate[1]`.
Complete presentation payloads are projected from those two exact treatment records. Colors must not be
hand-constructed, regenerated, inferred, or obtained from any response.

## Blinding

There is no PRNG. The side-assignment domain is the protocol ID followed by `/side-assignment`. The message is
canonical JSON containing exactly `alternativeTreatmentKey`, `controlTreatmentKey`, `domain`, `protocolId`,
`reviewVersion`, and `sourceSha256`. The alternative is side A when the first SHA-256 digest byte is even and
side B otherwise.

The browser receives only an opaque review ID, opaque item and media tokens, ordinal position, and side A/B
presentation payloads. It receives no case ID, source path or hash, artifact path, treatment key, slate index,
version, reviewed state, assignment, alternative, control, candidate, or baseline label.

## Complete Treatment UI

Both sides use the same `renderTreatment` function and markup. Each side displays the same exact artwork
borderlessly in a complete interface treatment with background, surface, foreground, and accent applied over
both field and surface. The UI shows flat/gradient status, legal surface/accent collapse status, all role hex
values, generated status, and nearest `colornames-oklab` names. Gradient treatments use a 135-degree
background-to-surface CSS gradient with OKLab interpolation.

Color names are presentation-only. They may not affect treatment selection, side assignment, response
validation or mapping, analysis, inference, or any gate. Outside treatment previews and role swatches, static
UI colors are black and white. Desktop and mobile receive the same data and renderer. Reviewers assess the
complete rendered UI treatment, not isolated swatches.

## Response Schema

The one item requires independent `qualityA` and `qualityB`, each exactly one of `strong`, `acceptable`,
`weak-fallback`, `unacceptable`, or `uncertain`. The blinded browser asks for `a-stronger`, `b-stronger`,
`similarly-valid`, `neither-acceptable`, or `uncertain`. Server-side unblinding stores the required relative
outcome as `candidate-stronger`, `baseline-stronger`, `similarly-valid`, `neither-acceptable`, or `uncertain`,
where `candidate` means the bound alternative and `baseline` means the bound control.

`issuesA` and `issuesB` are unique optional subsets of `missing gradient`, `extraneous gradient`, and
`incomplete artwork identity`. `comment` is optional, at most 2,000 UTF-16 code units, and preserved verbatim
without trimming or normalization.

The server accepts only one complete exact-schema submission bound to the private-manifest content ID and
opaque item token. It publishes feedback atomically with a no-overwrite filesystem operation. Preparation
also refuses to overwrite either the private manifest or feedback. Feedback must not exist when preparation
and its verification gate complete.

## Verification Gate

The package is ready only if the focused verifier and tests prove all authoritative raw and semantic bindings,
the exact source bytes, the exact one-item denominator, winner/slate index 0 control, slate index 1 unreviewed
alternative, deterministic assignment, complete projected treatment data, one shared renderer, strict
response and stored-outcome schemas, implementation/UI hashes, no feedback, and every forbidden authorization
set to `false`.

## Authorization Boundary

Authorized now: write this protocol; prepare the one immutable private manifest and local review package; add
the dormant local server and package scripts; verify and test the package.

Not authorized now: serve or open the review; inspect the rendered review; conduct human review; submit or
analyze feedback; access protected, fresh, or any other artwork; inspect any other treatment; implement palette
inference; generate candidate output; change ranking, the default extractor, product baseline, or production;
support, freeze, promote, or persist a candidate; run a full roster or multi-hour job; enter Phase 4 or Phase 5;
use a learned model; or use comments or color names in inference.
