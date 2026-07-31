/**
 * Quantization of the ranking evidence, shared by every stage that compares treatments.
 *
 * `evidence` is the width of one *score* band: two scores inside one band are treated as
 * indistinguishable evidence. `utility` is the same for weighted utility sums. Both were
 * previously re-declared per stage — `evidence` five times and `utility` twice — so a stage
 * could silently quantize differently from the stage feeding it.
 *
 * Note that `evidence` is **not** the same quantity as `FAMILY_BIN_STEP` or
 * `REPRESENTATIVE_DENSITY_RADIUS` in `palette-core.ts`, which are OKLab distances that merely
 * happen to share the value 0.04. Do not unify them, and do not retune one by grepping for the
 * literal.
 */
export const ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS = Object.freeze({
	evidence: 0.04,
	utility: 0.005,
})

export const ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS = Object.freeze([
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"foregroundUtility",
	"accentFidelity",
	"accentUtility",
	"coherence",
	"economy",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS = Object.freeze([
	"treatmentFoundation",
	"fieldIdentity",
	"fieldFidelity",
	"fieldStructure",
	"accentFidelity",
	"accentUtility",
	"artworkIdentity",
	"foregroundUtility",
	"representativeness",
	"coherence",
	"economy",
] as const)

export type AlbumArtworkPaletteV2QualityBlock =
	typeof ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS[number] |
	typeof ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS[number]

export const ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS: readonly AlbumArtworkPaletteV2QualityBlock[] =
	Object.freeze([...new Set<AlbumArtworkPaletteV2QualityBlock>([
		...ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
		...ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	])])

export const ALBUM_ARTWORK_PALETTE_V2_POLICY = Object.freeze({
	canonicalColor: "srgb-uint8",
	displayHex: "lower-case-six-digit-srgb",
	gradient: Object.freeze({
		cssDirectionDegrees: 135,
		backgroundPosition: 0,
		surfacePosition: 1,
		interpolation: "oklab",
		contrastSamplePositions: Object.freeze([0, 0.25, 0.5, 0.75, 1]),
	}),
	contrast: Object.freeze({
		metric: "apca-w3-0.1.9-signed-lc",
		hardMinimum: 0,
		requiredForegroundObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
		distinctAccentObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
		emergencyMaximumAbsoluteLc: 5,
		emergencyGeneratedPenalty: 0.18,
	}),
	/**
	 * When two rendered colours in one palette are *the same colour*.
	 *
	 * All three bars are the same number because they are the same question asked of three
	 * different pairs, and human review settled that question once. Batch 12, `muse`: "a midpoint
	 * cannot be the same color as either endpoint … the midpoint was pitch black and the background
	 * was pitch black. We should consider that invalid". Batch 12, `slim`, on a pair that was
	 * measurably distinct and still refused: "While the midpoint of option B is in fact different
	 * from its background. I cannot visually distinguish them. They are too close, too black, both
	 * of them … **so we should consider them as the same color**, in which case the same rule as
	 * before should apply". Batch 14, `placebo`, is the shadow-material caveat recorded on
	 * `ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE`.
	 *
	 * `slim` is why the ruler is CIE76 ΔE and not OKLab. The reviewer's refusal was of two
	 * *near-black* colours, and OKLab's cube-root transfer has unbounded derivative at zero: one
	 * 8-bit code step spans `okDistance` 0.0672 at level 0 but 0.0030 at level 254, a 22.6x swing,
	 * so no single OKLab threshold can express "the same colour" across the tone range. See
	 * `perceptualDifference` in `color.ts`.
	 *
	 * They are three separate fields rather than one shared constant so a library user can raise
	 * one without the others, in the spirit of charter constraint 2. **None of them is a contrast
	 * floor**: ΔE 3.3 is roughly one just-noticeable difference and says nothing about legibility.
	 * The APCA hard minimum stays at `contrast.hardMinimum`, still zero, still a caller parameter.
	 * The closest reviewed foreground/background pair in the corpus, `knuckles`, is ΔE 9.19 — three
	 * times this bar.
	 */
	distinctness: Object.freeze({
		/**
		 * The bar itself, read off six human midpoint judgements rather than tuned: the refused
		 * midpoints scored 0.00, 1.00 and 3.01, the accepted ones 3.64, 9.78, 19.75 and 62.59.
		 */
		sameColor: 3.3,
		/**
		 * A foreground perceptually identical to the field it is drawn on is not a foreground.
		 *
		 * Track Q measured this on 214 distinct non-scrambled artworks and found the distribution
		 * sharply bimodal: two artworks below ΔE 1 — one rendering its text at ΔE 0.366 from its own
		 * background, an APCA Lc of exactly 0.000 — and then nothing at all until ΔE 9.19. Any bar
		 * in (1, 9) selects the same two artworks, so this one is not a tuned boundary; it is the
		 * bar review already set, dropped into an empty band.
		 *
		 * Charter constraint 2 names this case: a contrast *pathology* is fair game, and "APCA sign
		 * flips across gradient samples imply a zero-contrast crossing inside the gradient". The
		 * measured artwork does not imply a crossing, it renders one, because the observability
		 * guard is a maximum over ramp positions and passes on the far endpoint alone.
		 */
		foregroundField: 3.3,
		/**
		 * A gradient whose two endpoints are the same colour renders as flat, so claiming a
		 * gradient is a false claim about the artwork. Charter rule 5 makes an incorrectly allowed
		 * gradient exactly as bad as an incorrectly prevented one, and this is the allowed
		 * direction of that error.
		 *
		 * The endpoint-level analogue of the midpoint rule, and `slim`'s reasoning applied one pair
		 * over: two near-blacks the reviewer could not tell apart are one colour. It stands beside
		 * the `okDistance` endpoint bar rather than replacing it — they refuse different things —
		 * because that bar cannot see this case at all: the one artwork Track Q measured below this
		 * threshold is a pair of near-blacks at ΔE 3.0 whose `okDistance` is 0.074, comfortably
		 * clear of it, while the artwork an OKLab framing flags instead is `okDistance` 0.048 and
		 * ΔE 5.2 — plainly visible, and admitted here. Of 96 measured gradient winners, one falls
		 * below this bar.
		 */
		gradientEndpoints: 3.3,
	}),
	representatives: Object.freeze({
		maximumSynthesizedOccupiedDistance: 0.025,
	}),
	/**
	 * Salient-mark evidence.
	 *
	 * A small, vivid, repeated element — lettering, a logo, a stamp — carries
	 * artwork identity that its population fraction cannot express. Every
	 * support term in the algorithm normalises by a population fraction
	 * (`totalSupport / 0.08`, `largestComponentFraction / 0.002`, …) that an
	 * element covering 0.02 % of the artwork can never reach, so such an
	 * element is filtered out before it can compete for the accent role.
	 *
	 * `markSupport` is a bounded, measured substitute for that population
	 * support, derived entirely from the region observations the evidence pass
	 * already computes. It is deliberately a *product* of independent
	 * conditions, so a family only earns it when **all** of them hold — a bare
	 * pixel, a JPEG aberration, or a single unrepeated blob earns nothing,
	 * which is what the representativity rule requires.
	 *
	 * Set every threshold to a value no observation can meet (or
	 * `substitution: 0`) to restore the previous behaviour exactly.
	 */
	mark: Object.freeze({
		/**
		 * Absolute pixel floor for a component to count as a mark stroke. Below
		 * this a component cannot be distinguished from compression noise at any
		 * resolution.
		 */
		minimumComponentPopulation: 12,
		/**
		 * Scale-relative floor for the same component, so the rule means the
		 * same thing on a 350 px thumbnail and a 1400 px master.
		 */
		minimumComponentFraction: 0.000_02,
		/** Mutual-similarity floor: a mark stroke looks like its siblings. */
		minimumRepetition: 0.5,
		/** A mark sits inside the frame; a field bleeds off the edge. */
		maximumBorderContact: 0.25,
		/** A mark stroke fills a usable share of its own bounding box. */
		minimumFill: 0.08,
		/** Fewest qualifying components before any mark credit is earned. */
		minimumComponentCount: 3,
		/** Component count at which the plurality term saturates. */
		saturationComponentCount: 6,
		/**
		 * OKLab distance from the family prototype to the nearest field-owning
		 * family at which the separation term saturates. Boundary contrast
		 * measured pixel-adjacent systematically under-reads a small element,
		 * because its perimeter is dominated by the anti-aliased blend into the
		 * ground; the distance between the two prototypes is the same quantity
		 * measured where anti-aliasing cannot reach it.
		 */
		fieldSeparation: 0.12,
		/** Field-owning families the separation is measured against. */
		fieldReferenceFamilies: 2,
		/**
		 * How much population support a fully-evidenced mark may substitute,
		 * as a fraction of the term it replaces. `0` disables the mechanism.
		 */
		substitution: 1,
	}),
	/**
	 * Optical-blend absorption (segmentation granularity).
	 *
	 * Where two dominant fields meet, the image does not jump between them: soft
	 * edges, shadow falloff, vignettes, semi-transparency and JPEG ringing all
	 * produce pixels whose colour is a *linear mixture* of the two fields. The
	 * perceptual quantizer has no way to know that, so it slices that mixture ramp
	 * into ordinary families — and a fat slice of it then looks, on every signal
	 * measured at ranking time (support, concentration, coverage, materiality),
	 * exactly like a legitimate third region competing for the surface role.
	 *
	 * OKLab makes this markedly worse at the dark end: a single 8-bit code step at
	 * the black point spans dL ≈ 0.067, more than the whole family anchor radius,
	 * so the ramp out of a black field is sliced into many families rather than one.
	 *
	 * A family is treated as such a mixture — not a material — only when *all* of
	 * these hold, so the rule stays a measurement rather than a preference:
	 *
	 *  - the two dominant field families are far enough apart that lying on the
	 *    chord between them is informative at all (`minimumFieldSeparation`);
	 *  - its prototype lies strictly *between* them (`interiorMargin`) and within
	 *    `maximumRelativeOffset` of the chord, as a fraction of chord length — a
	 *    colour that is an independent material essentially never lands that close
	 *    to a long chord by chance;
	 *  - the mixtures it belongs to actually form a *continuum*: ordered along the
	 *    chord, and counting the two fields as its ends, no gap between successive
	 *    colours exceeds `maximumRungGap`. This is the load-bearing test. Evidence
	 *    that quantization sliced a continuous ramp is that the whole ramp is
	 *    present as contiguous slices; two materials that merely happen to be
	 *    colinear with the field pair appear as isolated colours with a gap, and
	 *    are left alone. It is what separates a seam from an artwork whose field
	 *    genuinely *is* a gradient — there the intermediate colours are the field.
	 *  - spatially it never leaves the mixture: `minimumCorridorClosure` of its
	 *    boundary is shared with the two fields or with other mixtures of the same
	 *    pair. A region that exists in its own right touches things the mixture
	 *    cannot explain.
	 *
	 * Absorption withdraws the family from the **field lane only**, so a mixture can
	 * never be published as a background or surface colour. Nothing else changes:
	 * the family keeps its evidence record, still competes in the signature and
	 * foreground lanes, and whether its pixels join a field domain is still decided
	 * by the existing composite rule, which is untouched. This deliberately does
	 * *not* assign the mixture to either field's domain — a seam belongs to both.
	 *
	 * This is the interior counterpart of the diffuse-composite pass, and the two
	 * are opposites on purpose. That pass merges *fragments of one field* whose
	 * colours are legitimate field colours, so they must join the domain and stay
	 * fully eligible. This one withdraws colours that exist only because two fields
	 * meet — they are not a material the artwork contains, so they must not be
	 * publishable, whatever domain their pixels end up in.
	 *
	 * Set `maximumRelativeOffset` to 0 to restore the previous behaviour exactly.
	 */
	fieldBlend: Object.freeze({
		/** Minimum OKLab separation of the two dominant field families. */
		minimumFieldSeparation: 0.3,
		/** Perpendicular chord distance allowed, as a fraction of chord length. */
		maximumRelativeOffset: 0.015,
		/** How far inside the chord the prototype must sit, in chord fractions. */
		interiorMargin: 0.03,
		/**
		 * Largest gap allowed between successive colours of the ramp (the two
		 * fields included as its ends), in chord fractions.
		 */
		maximumRungGap: 0.25,
		/** Share of the family's boundary that must stay inside the mixture. */
		minimumCorridorClosure: 0.9,
	}),
	/**
	 * Mount (frame / matte) border credit.
	 *
	 * `fieldScore` rewards `borderCoverage` because bleeding off every edge is
	 * evidence that a family is the artwork's *ground*: nothing lies behind
	 * something that reaches all four edges. That inference has one systematic
	 * exception. A frame or matte — a band pasted *around* the artwork — also
	 * touches every edge, and what lies behind it is the artwork itself. The
	 * evidence pass cannot tell the two apart, so the mount wins the field
	 * whenever it is present.
	 *
	 * The tell is enclosure, and it is directly measurable: a mount owns the whole
	 * border while a *larger* field family owns none of it. Ground never has that
	 * shape — if a bigger region never reaches an edge, the thing at the edge is
	 * framing it, not underlying it. So a family in that position keeps every other
	 * piece of field evidence (breadth, coherence, quadrant reach, calm) and only
	 * loses the border credit, which is the one term its shape does not earn.
	 *
	 * This is deliberately *not* border-stripping. Nothing is cropped, no family is
	 * withdrawn, and a mount that is genuinely the artwork's dominant region — a
	 * wide white matte, a dark field with a slightly darker edge — keeps its credit
	 * in full, because nothing larger is enclosed by it.
	 *
	 * Set `borderCreditRetained` to 1 to restore the previous behaviour exactly.
	 */
	mount: Object.freeze({
		/** Border share above which a family counts as owning the frame. */
		minimumBorderCoverage: 0.9,
		/** Border share below which a family counts as fully enclosed. */
		maximumEnclosedBorderCoverage: 0.05,
		/**
		 * How much larger the enclosed field must be than the border-owning family
		 * before the latter is read as a mount rather than as ground.
		 *
		 * Every artwork carrying a human verdict sits far from this value: the one
		 * case review wants flipped measures 4.47, and the six framed artworks whose
		 * frame-as-background review accepted measure 0.07 to 0.76. The threshold is
		 * placed at the centre of that gap rather than at either edge.
		 */
		minimumEnclosedPopulationRatio: 2.5,
		/** Fraction of the border credit a mount keeps. */
		borderCreditRetained: 0,
	}),
	/**
	 * Accent candidacy in a two-colour artwork.
	 *
	 * `fieldBlend` withdraws optical mixtures from the field lane, because a colour
	 * that exists only where two fields meet is not a material the artwork
	 * contains. The same colours stay eligible as *accents*, which is usually
	 * right — an anti-aliased edge tone can still be the most interesting thing in
	 * a busy artwork, and stripping every such family would cost legitimate accents
	 * across the corpus.
	 *
	 * There is one configuration where it is not right. When the family carrying the
	 * background and the family carrying the foreground already own nearly every
	 * pixel between them, the artwork has two materials and no more. Anything on the
	 * chord between them is the edge where they meet — anti-aliasing, JPEG ringing,
	 * a soft shadow. Publishing it as a fourth colour asserts a cardinality the
	 * artwork does not have.
	 *
	 * **The coverage condition is what makes this safe.** Reviewed accents elsewhere
	 * in the corpus sit *closer* to their own palette's chord (0.008, 0.007) than the
	 * case this was built for (0.011), so proximity alone would strip them. What
	 * separates them is coverage: their artworks' two published colours own about
	 * 50 % and 32 % of the pixels, against 95 %. Those artworks have a third
	 * material; that one does not.
	 *
	 * The rule deliberately does *not* require the surface to be collapsed. It is a
	 * claim about the two materials the artwork is made of, and it has to apply the
	 * same way to a treatment that reads the artwork the other way round (ink as
	 * background, field as foreground) — otherwise a treatment can dodge it by
	 * spending the same edge ramp on its surface instead.
	 *
	 * The effect is to zero the accent's *evidence*, not to remove it from
	 * candidacy: an edge blend still competes, it simply has no identity of its own
	 * to weigh, and it is no longer counted as an opportunity the collapsed
	 * treatment gave up. Filtering candidacy outright was measured and rejected: it
	 * perturbs `accentOpportunity`, which feeds foreground scoring, and moved a
	 * reviewed foreground that had nothing to do with accents.
	 *
	 * The mixture geometry reuses `fieldBlend`'s thresholds rather than introducing
	 * its own: "is this colour an optical mixture" should mean one thing here.
	 *
	 * Set `minimumTwoColourCoverage` above 1 to restore the previous behaviour.
	 */
	accentBlend: Object.freeze({
		/**
		 * Share of the artwork the background's family and the foreground's family
		 * must own between them before the artwork counts as two-colour. Measured:
		 * 0.95 on the reviewed case, at most 0.51 on every other artwork whose accent
		 * is an interior chord blend.
		 */
		minimumTwoColourCoverage: 0.8,
	}),
	identity: Object.freeze({
		materialDistance: 0.025,
		selection: "source-connected-signature-evidence-levels",
		reservedMajorFamilyPopulationFraction: 0.06,
		/**
		 * Chroma at or above which a family counts as an identity *direction* rather than a
		 * neutral. Matches `identityDirectionChroma` in the selector policy, which decides the
		 * same question downstream when the winner objective counts carried directions.
		 */
		neutralObligationChroma: 0.06,
		/**
		 * How many of the identity-obligation slots may be spent on near-neutral families.
		 *
		 * The shortlist dedups by OKLab material distance, which two greys separated only by
		 * lightness clear easily, so a neutral-heavy artwork can spend every slot restating one
		 * direction while chromatic directions with real region evidence are never nominated.
		 * Slots freed by this quota are filled from the *existing* evidence order: nothing is
		 * promoted by fiat, the artwork's own region evidence still decides who fills them.
		 */
		maximumNeutralObligations: 2,
		/**
		 * How well evidenced a family's foreground-polarity claim must be before the neutral
		 * quota will treat it as an identity *direction* of its own.
		 *
		 * `maximumNeutralObligations` exists because material distance cannot separate two greys
		 * that differ only in lightness. That is true of two mid-greys, and false of a near-white
		 * and a near-black: hue-wise they are one direction, but as *foreground* claims they are
		 * opposite ones — the artwork either sets light text or dark text, and only one of those
		 * readings can be represented by whichever neutral holds an obligation slot. So a neutral
		 * whose polarity claim is decisive and points against every neutral already selected is
		 * not a redundant restatement, and the quota does not spend a rejection on it.
		 *
		 * The measure is `|polarity| * confidence` of `foregroundPolarityObservation` — the same
		 * reliability-times-direction product `polarityAgreement` uses. It is required of *both*
		 * sides: a weakly polarised incumbent gives no basis for calling anything its opposite.
		 */
		decisiveForegroundPolarity: 0.6,
		winnerPrecedence: "quality-incumbent-then-quality-guarded-obligation-coverage-and-priority",
		qualityGuard: Object.freeze({
			version: "complete-quality-domain-non-inferiority-v1",
			comparison: "generated-penalty-adjusted-complete-quality-domain-evidence-level-non-inferiority",
			challengerDomain: "strict-obligation-coverage-or-priority-improvement-over-quality-incumbent",
			blocks: ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
		}),
	}),
	bounds: Object.freeze({
		retainedDiagnosticFamilies: 48,
		fieldFamilies: 12,
		signatureFamilies: 16,
		foregroundFamilies: 16,
		fieldHypotheses: 12,
		fieldDomains: 12,
		retainedDiagnosticFieldDomains: 48,
		largestComponentsPerFamily: 8,
		roleObservationComponentsPerFamily: 24,
		typographyPolarityRegions: 4,
		gradientEndpointFamiliesPerBand: 2,
		representativesPerRole: 2,
		foregroundsPerFieldVariant: 6,
		distinctAccentsPerForeground: 4,
		identityObligations: 4,
		completeCandidates: 1_500,
		gradientChallengerProjections: 6,
		retainedTreatments: 8,
		developmentWorkers: 6,
	}),
})
