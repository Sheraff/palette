/**
 * The enrichment slices: covers whose CONTENT IS KNOWN because a human opened
 * them, kept beside the coverage set for instrument-specific tuning.
 *
 * These are NOT a sample of anything. They are a deliberately biased set of
 * covers carrying a named thing — a parental-advisory mark, CJK text, a car, a
 * barcode — so that a prompt or threshold aimed at that thing can be tuned
 * against a case where the right answer is already established independently of
 * any model. Every consumer that reports a rate, a distribution, or an agreement
 * number must exclude them (`role === "enrichment"`).
 *
 * Provenance for every entry is a file already in the repo; nothing here was
 * decided by looking at a model's output.
 */

export type EnrichmentSlice = 'parental-advisory' | 'cjk-text' | 'nonlatin-text' | 'vehicle' | 'barcode' | 'confirmed-negative'

export type EnrichmentEntry = {
	/** Repo-relative path to the exact file whose content was confirmed by eye.
	 *  For the sharded collection this is a specific RENDITION, not the artwork's
	 *  best rendition — the confirmation was made on this file, and for
	 *  `000f723f36271de0ed3aa893` the 300 px rendition was chosen deliberately
	 *  (review_round_2.py: "PA bottom-LEFT, 300px rendition"). */
	path: string
	slices: EnrichmentSlice[]
	/** What the human saw, quoted or paraphrased from the source file. */
	reason: string
	/** The repo file that establishes it. */
	source: string
}

/** [MEASURED, n=15] `research/v3/oracle/sam/review_round_2.py` CONFIRMED_PA_IMAGES —
 *  "the covers opened and confirmed by eye during probe 2 ... the only images in
 *  the eval set whose contents are established independently of the model".
 *  Two of the five (`images/greenday.jpg`, `images/slim.jpg`) live in the repo's
 *  legacy `images/` directory, which is in neither embedded collection; they are
 *  carried anyway, flagged `inEmbeddingUniverse: false`, because dropping them
 *  would take a third of the PA evidence with them.
 *
 *  Two counts live here and they are not the same number (review 2026-08-03,
 *  MINOR-8). This list is the FIVE covers probe 2 opened by eye. The
 *  `parental-advisory` SLICE holds SIX, because one probe-4 cover
 *  (`07/ab67616d0000b27300072f04eb3dae24ba1cc3e8`, a shipping label) carries a
 *  PA mark as well as its barcode. Six minus the two legacy covers is four —
 *  a third gone, not a halving, which is what the generated prose used to say. */
const PARENTAL_ADVISORY: EnrichmentEntry[] = [
	{
		path: 'images/greenday.jpg',
		slices: ['parental-advisory'],
		reason: 'parental-advisory mark bottom-right, on a flat black field',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_PA_IMAGES',
	},
	{
		path: 'images/slim.jpg',
		slices: ['parental-advisory'],
		reason: 'parental-advisory mark top-right, over a photo',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_PA_IMAGES',
	},
	{
		path: '03/ab67616d0000b27300034b60105d8937440211da.jpg',
		slices: ['parental-advisory'],
		reason: 'parental-advisory mark bottom-right, on a warm faded photo',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_PA_IMAGES',
	},
	{
		path: '0d/ab67616d0000b273000d8049603d6ab7f5d759bb',
		slices: ['parental-advisory'],
		reason: 'parental-advisory mark bottom-right, on a dark photo',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_PA_IMAGES',
	},
	{
		path: '0f/ab67616d00001e02000f723f36271de0ed3aa893',
		slices: ['parental-advisory'],
		reason: 'parental-advisory mark bottom-LEFT, and only the 300 px rendition exists — the mark at the resolution floor',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_PA_IMAGES',
	},
]

/** [MEASURED, n=16] `research/v3/data/sam/probe-4-scripts-objects.jsonl` — every row
 *  carries `image_kind`, `image_contains` and `image_note`, which the probe author
 *  filled in from opening the file. The `negative` row `images/toxicity.jpg` is
 *  excluded here: it is out of both collections AND its confirmed content
 *  (Latin display type) is not a slice anyone needs enriched. */
const PROBE_4: EnrichmentEntry[] = [
	{
		path: '03/ab67616d0000b2730003580bd2766859c4d81e13.jpg',
		slices: ['barcode'],
		reason: 'EAN barcode on a promo sticker',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=barcode)',
	},
	{
		path: '07/ab67616d0000b27300072f04eb3dae24ba1cc3e8',
		slices: ['barcode', 'parental-advisory'],
		reason: 'shipping label with a barcode, plus a parental-advisory mark',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=barcode)',
	},
	{
		path: '10/ab67616d0000b27300100a3e9c764acf01c16db8',
		slices: ['cjk-text'],
		reason: 'Chinese: 没有你的天冬 (the probe recorded SAM leaving it standing)',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=cjk-chinese)',
	},
	{
		path: '03/ab67616d0000b2730003f2b6590090abe420d104.jpg',
		slices: ['cjk-text'],
		reason: 'Chinese: 佛前等花开 across the top',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=cjk-chinese)',
	},
	{
		path: '08/ab67616d0000b2730008f7b7f01d9149dbe92fa0',
		slices: ['cjk-text'],
		reason: 'Japanese: 森昌子 / こころ雪, set vertically',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=cjk-japanese)',
	},
	{
		path: '10/ab67616d00001e0200106c3252a4c133c0abde36',
		slices: ['cjk-text'],
		reason: 'Japanese: 言葉を恐れる under Latin "FEARING WORDS" — mixed script on one cover',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=cjk-japanese)',
	},
	{
		path: '00/ab67616d0000b2730000cb591a0d52d8b88692d9.jpg',
		slices: ['nonlatin-text'],
		reason: 'Korean hangul',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=nonlatin-other)',
	},
	{
		path: '05/ab67616d0000b2730005230fae1822525e5a5ff6',
		slices: ['nonlatin-text'],
		reason: 'Thai script',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=nonlatin-other)',
	},
	{
		path: '00/ab67616d0000b27300009f60aeb150a5db45b47b.jpg',
		slices: ['nonlatin-text'],
		reason: 'Malayalam script',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=nonlatin-other)',
	},
	{
		path: '00/ab67616d0000b27300002947b898e4bd572ac4aa.jpg',
		slices: ['vehicle'],
		reason: 'photographed G-class (the probe recorded SAM leaving the whole vehicle standing)',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=vehicle)',
	},
	{
		path: '02/ab67616d00001e020002881a851f1e14c374562b.jpg',
		slices: ['vehicle'],
		reason: 'illustrated yellow sedan',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=vehicle)',
	},
	{
		path: '01/ab67616d0000b2730001adc121d5ed117cfdbd91.jpg',
		slices: ['vehicle'],
		reason: 'illustrated Suzuki jeep',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=vehicle)',
	},
	{
		path: '0a/ab67616d0000b273000ae334b447825e117f2e01',
		slices: ['vehicle'],
		reason: 'photoreal Lamborghini',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=vehicle)',
	},
	{
		path: '0d/ab67616d00001e02000d676569f781897718a085',
		slices: ['vehicle'],
		reason: 'red saloon with four people',
		source: 'research/v3/data/sam/probe-4-scripts-objects.jsonl (image_kind=vehicle)',
	},
	{
		path: '03/ab67616d00001e02000300752f338b6aedff856c.jpg',
		slices: ['confirmed-negative'],
		reason:
			'interior/spa photo: opened by eye and confirmed to carry NO parental-advisory mark, no logo, no sticker, no display text. Any detection of those on this cover is a false positive by construction.',
		source: 'research/v3/oracle/sam/review_round_2.py CONFIRMED_NEGATIVE_IMAGES; probe-4 image_kind=negative',
	},
]

export const ENRICHMENT_ENTRIES: EnrichmentEntry[] = [...PARENTAL_ADVISORY, ...PROBE_4]

/** [MEASURED] Counted from the two source files. A change here means an
 *  enrichment source moved and the doc's counts are stale. */
export const EXPECTED_ENRICHMENT_ENTRIES = 20

/** Paths that are deliberately outside both embedded collections. They get no
 *  embedding, no cluster and no near-duplicate component, and they never
 *  participate in the core selection. */
export const OUT_OF_COLLECTION_PREFIX = 'images/'
