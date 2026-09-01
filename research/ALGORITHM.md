# Palette Algorithm 0.19

## Purpose

The extractor turns one artwork into four UI roles:

- `background`: the main background of the entire application
- `foreground`: main text, usually on background and sometimes on surface
- `surface`: an alternative noncritical background, or a thin separator around background-colored areas
- `accent`: meaningful UI elements, usually on background and sometimes on surface

This product contract was clarified after canonical 0.19 was frozen. Canonical 0.19 still uses the historical accent identity/visibility rules described below. An initial WCAG 2 `3:1` development audit found 147/355 canonical `00/` palettes below that contract. The current opt-in consumer contract instead uses signed APCA contrast and requires absolute `Lc 10` against both fields; canonical remains frozen while that separately identified configuration is evaluated.

The implementation is a deterministic classical vision pipeline. It does not use the legacy extractor, a pretrained model, OCR, or a vision-language judge.

## 1. Normalize The Image

Sharp applies orientation metadata, flattens transparency onto white, converts to sRGB, removes alpha, and scales the artwork to fit within 224 by 224 pixels without enlarging it. The algorithm then works on an 8-bit, three-channel RGB buffer.

Every pixel is converted directly from sRGB to floating-point OKLab. OKLab is used for segmentation, clustering, color distance, and gradient analysis. Canonical and foreground metrics retain their historical WCAG 2 ratios from sRGB relative luminance. The opt-in accent contract uses the official `apca-w3` 0.1.9 implementation and preserves signed foreground/background polarity.

## 2. Build Perceptual Regions

The image is segmented into roughly 48 to 320 SLIC-style regions. Assignment balances OKLab color distance against pixel position, so a region tends to be both spatially compact and perceptually coherent.

For every region the extractor records:

- population and center position
- edge strength and within-region color variance
- neighboring regions and their shared boundary strength
- contact with each image side
- global distinctiveness and local contrast

The representative RGB value for a region is an actual pixel nearest its mean OKLab color, not a generated average.

## 3. Estimate Background, Saliency, And Text Evidence

Background evidence starts from regions touching the artwork boundary. A region receives stronger seed evidence when it has broad perimeter contact, touches several sides, and is not highly salient.

That evidence propagates through the region graph. Crossing a strong image edge or a large OKLab color change is expensive, so a subject touching one edge does not automatically become background. The graph score is blended with a continuous border-band measurement when color candidates are built.

Saliency is a structural estimate combining global distinctiveness, contrast with neighboring regions, and a weak center prior. Border contact is a penalty.

Text likelihood is also structural, not OCR-based. It combines edge density, local contrast, small region size, and low internal variance. It can recognize many title-like regions, but it can also confuse decorative detail with typography.

## 4. Build Exact Source-Color Candidates

Pixels are first collected into a stable, fine OKLab histogram. The histogram bins retain population plus the background, saliency, and text evidence of their pixels.

A role-aware weighted clustering pass reduces this evidence to about 12 candidates. This is a role shortlist, not a reconstruction of every artwork color. Initial centers deliberately include dominant, background-like, salient/colorful, and text-like bins before farthest-point expansion. Cluster updates use population and role evidence.

The shortlist cannot invent information on low-color artwork: every candidate must resolve to an observed pixel, and truly uniform fixtures produce one candidate. JPEG noise or subtle shading can still create several observed near-colors. Simple-cover role collapse prevents those shades from being treated as four meaningful UI roles.

Gradient analysis continues to use the full pixel and region buffers rather than only the 12 candidates. Version 0.9 excluded tiny edge colors from smooth-gradient background shortlists when substantial candidates exist, repaired muddy surface/accent pairs with edge-supported source surfaces, and expanded highly coherent endpoint pairs when the selected colors cover only the middle of a gradient.

The final RGB value is never the cluster average. Each cluster selects an observed histogram representative nearest its center, and each histogram representative is itself an exact artwork pixel. This preserves source fidelity while the floating-point center remains useful for grouping.

A separate pass preserves a small, highly light, near-neutral typography candidate when the main clustering would otherwise absorb it. Version 0.10 marks this auxiliary candidate as typography-only: it can serve foreground or accent, but cannot masquerade as a background or surface.

Version 0.19 also evaluates twelve fixed OKLab hue families and may append at most two missing, supported chromatic representatives. Every supplement is an exact normalized source pixel. Availability requires bounded population, chroma, saliency, connected or multi-region support, and perceptual absence from the canonical shortlist. Availability alone does not authorize a role assignment.

## 5. Jointly Assign The Four Roles

The spatial solver does not choose each role independently. It shortlists plausible backgrounds and jointly enumerates foreground, surface, and accent assignments for each one.

Version 0.17 first computes the reviewed 0.16 palette as an incumbent, then completely enumerates every feasible four-role tuple with pair-specific gradient evidence and explicit surface/accent collapse. A replacement is admissible only when none of five structural objectives regresses, at least one improves by `0.05`, and the mean improvement is at least `0.16`. The five objectives cover background, foreground, surface, accent, and source-identity coverage. Selection first minimizes the number of changed roles, then maximizes total gain, then uses a stable semantic key. If no tuple clears those constraints, the incumbent is preserved byte-for-byte. This permits coherent multi-role corrections without composing independent post-hoc guards.

Version 0.19 replays that complete spatial solver with only supplements whose population is at most `0.02` and text evidence is at least `0.5`. The treatment is emitted only when a supplement occupies foreground or accent and all post-solver safety gates pass: accent contrast at least `1.5:1`, incumbent-relative text or chroma gain, bounded accent chroma and saliency loss, emitted accent chroma at least `0.045`, no fully chromatic collapsed background/surface, and no collateral role chroma loss above `0.025`. Expressive and quantized output remain the 0.17 results. Supplements that fail admission or emission remain diagnostic only.

Background scoring favors:

- propagated background evidence
- population
- low saliency
- low text likelihood

Foreground eligibility is tiered. A source color normally requires 4.0:1 against background. A large, salient, text-like source region may use 3.0:1. When any source candidate reaches 4.5:1, relaxed candidates compete only if they have that strong typography evidence. Scoring still favors higher contrast, text evidence, saliency, source colors, and prominent near-black or near-white artwork typography.

Version 0.11 adds one evidence-gated exception to the normal preference for an achromatic high-contrast foreground. When the default winner is an observed low-chroma color and the artwork contains at least three substantial, salient, text-like chromatic candidates, accessible chromatic candidates receive an identity bonus. Each candidate still requires at least 4.5:1 before receiving the bonus. The three-candidate gate keeps the rule inactive on isolated colorful noise and on the separate validation cohort.

Surface contrast remains 4.5:1 for ordinary high-contrast palettes. It may fall to 3.0:1 when the source foreground already uses relaxed contrast or when several substantial edge-supported background fields need representation. A strong typography foreground may use 2.5:1 on surface. These eligibility gates apply equally when the surface becomes a gradient endpoint. A surface is rewarded when it has background evidence, useful population, and an appropriate perceptual relationship to the background. Reusing the background is intentionally allowed for simple or effectively single-background artwork. Version 0.10 requires a distinct surface to beat the collapsed surface score by 0.04. A separate 0.1 evidence bonus lets a substantial edge-supported alternate background field clear that margin without weakening text contrast.

Version 0.13 adds a dominant interior-field evidence rule to non-gradient surface scoring. An individual candidate receives the same 0.1 bonus only when its population is at least 0.5, its aggregate background evidence is strictly below 0.4, and its OKLab distance from the selected background is at least 0.08. These are the rule's complete evidence limits: it does not inspect containment, connected components, region topology, or other proof that the field is spatially enclosed. It also does not broaden representative-surface permission or relax foreground-to-surface contrast. Surface scoring is shared across modes, so this rule affects both spatial and expressive output for the target case; acceptance review concerned the spatial output. Gradient evidence instead encourages a separated endpoint. Redundant near-black surfaces are penalized on flat dark covers.

Version 0.14 tested a source-support gate for low-population flat surfaces. A non-gradient surface below 0.04 population remained eligible only when its OKLab distance from a region mean was at most 0.02. Human review accepted one replacement but found that the rule incorrectly removed a low-population surface with overwhelming background evidence. Version 0.15 retains the gate but exempts candidates whose aggregate background evidence is at least 0.75. Gradient surfaces retain the existing 0.008 population floor because interpolation can legitimately use sparse endpoint colors. This gate does not change surface scoring, contrast thresholds, or sufficiently populated surfaces.

Accent scoring favors colorful or salient identity detail, perceptual separation from foreground, low background likelihood, and text-like source colors. Focused evidence also preserves prominent major colors, small saturated title colors, and small near-black details on chromatic artwork. Version 0.13 requires a near-white accent to have at least 0.005 population or 0.58 text evidence before receiving the extreme-typography bonus; the corresponding near-black rule is unchanged. Version 0.15 adds a spatial-only preference on light chromatic backgrounds with dark foregrounds: when a substantial, salient, region-supported source candidate has at least 0.22 chroma, it receives the existing 0.12 major-identity bonus instead of rewarding a tiny chromatic typography candidate. The expressive solver is unchanged.

Historically, the accent has a hard minimum distance of 0.025 OKLab from both background and surface and, in version 0.10, at least 1.2:1 WCAG 2 contrast against background. It may match foreground, but it may not match either background role. When no source accent clears the visibility floor, the accessible foreground fills the accent role. These historical gates are artwork-identity heuristics, not the current UI contract. Meaningful accent UI now requires at least absolute `Lc 10` APCA contrast against both background and surface; canonical 0.19 does not enforce that requirement.

The opt-in `UI_ACCENT_CONTRAST_PROFILE` enforces the current contract through a separate safety-first complete joint assignment. A safe canonical incumbent is preserved exactly. For an unsafe incumbent, every feasible four-role tuple must satisfy absolute `Lc 10` against both fields; selection minimizes the largest objective regression, then total regression, changed roles, and finally maximizes objective mean before stable-key tie-breaking. The profile identity binds `apca-w3-0.1.9`, and the configured path changes only the spatial method and carries a profile-bound version distinct from canonical 0.19. The floor is calibrated to preserve the source-observed Thimbleberry accent at `+12.5173 Lc` on its background and the Obsidian accent at `+11.8310 Lc` on its background/surface. The earlier WCAG 2 `3:1` POC passed its bound technical contract, but those changed-set counts are historical and do not validate this APCA profile.

The additional configured option `typographyChromaticAccent: true` requires that APCA profile. It appends at most one exact-source family certified by the frozen strong-typography availability mechanism, completely enumerates feasible tuples containing that candidate as accent, and ranks fewer role/gradient changes before minimax objective regret. A treatment emits only when accent is the sole changed role; otherwise the APCA-only configured baseline is preserved and the counterfactual rejection is reported. This option is development-only and is not part of canonical 0.19.

Near-equal total scores are placed into coarse score buckets and resolved with a stable color key. In version 0.13, the spatial solver first prefers the complete selection whose foreground alone has strong typography evidence when exactly one tied selection qualifies. The expressive solver continues to resolve the bucket directly by stable color key. This reduces output churn from tiny numeric changes and keeps extraction deterministic.

## 6. Handle Accessibility Fallbacks

Background, surface, accent, and ordinary foreground are always exact source colors. The source foreground tiers are 4.0:1 normally and 3.0:1 for strong typography evidence.

Only when no source foreground reaches its applicable tier may the solver add pure black or pure white. Generated fallback still requires 4.5:1. A necessary generated foreground may also serve as accent when the artwork has no usable source accent. Generated tones, adjusted background shades, and arbitrary interpolated role colors are not allowed.

The selected foreground therefore reaches at least 3.0:1 against background and 2.5:1 against surface. The gallery reports the actual ratios so the accessibility tradeoff remains visible.

## 7. Detect Gradient Use

Gradient detection is separate from selecting two different colors.

One detector looks for smooth low-frequency change in likely background regions: neighboring pixels should change only slightly while pixels farther apart should differ substantially.

Another projects image pixels onto the OKLab line between selected background and surface. It measures:

- how much of the image lies near that color path
- how many intermediate positions are populated
- continuity across the path
- spatial coherence of intermediate pixels

A gradient is emitted only when coverage, continuity, and coherence pass explicit thresholds. Dark chromatic gradients receive a limited secondary hint when smoothness and chromatic coverage support it.

The accepted 0.17 behavior still permits the global smooth detector to support a selected endpoint pair. The current development candidate deliberately disables that fallback and uses pair-specific connected-field coverage, endpoint isolation, directional ordering, and local transition evidence. It targets dominant flat backgrounds paired with isolated object colors while preserving coherent endpoint-spanning fields. No eligibility thresholds from that experiment are part of the accepted algorithm yet.

The UI preview renders an accepted gradient as:

```css
linear-gradient(in oklch 135deg, background 0 50%, surface 90%)
```

Otherwise it uses the background as a flat field and reserves surface for the panel.

## 8. Return Diagnostics

The result includes all four roles, generated/source flags, gradient evidence, and separate diagnostics:

- foreground contrast on background and surface
- historical WCAG 2 accent ratios against both fields; configured presentation additionally reports signed APCA `Lc`, and canonical 0.19 does not guarantee the current absolute `Lc 10` meaningful-UI requirement
- minimum role distance
- mean distance to source regions
- four-color reconstruction error
- region and candidate counts

Crop and deterministic one-level noise tests are reported separately. They are diagnostics, not a hidden composite quality score.

## Constraints And Limits

- All non-fallback role RGB values are exact observed pixels.
- Generated black or white fallback retains a non-compensable 4.5:1 gate.
- Source foreground may use the documented 4.0/3.0 background and 4.5/3.0/2.5 surface tiers.
- Accent is distinct from background and surface and reaches at least 1.2:1 against background.
- The algorithm is deterministic for identical normalized bytes.
- Structural text evidence is weaker than OCR on unusual typography.
- One foreground token cannot represent every multi-background artwork while remaining accessible on every selected field.
- The 35 reviewable difficult artworks are the development corpus, not evidence of broad statistical superiority.
- The separate 355-artwork random cohort is now development-facing validation after aggregate analysis and the documented 0.12 visual audit; final generalization claims require new sealed artwork.

Version 0.19 is the accepted four-color algorithm. Its exact POC.10 scientific payload passed fresh `0f/` validation with four candidate preferences, one similarly valid result, and no baseline preferences, weak candidates, or hard violations among five material changes. This supports only the bounded emitted transition. The broad `00/` absolute audit remains necessary to discover defects in unchanged palettes and in every role.
