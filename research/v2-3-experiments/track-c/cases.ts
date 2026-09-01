/**
 * Track C evaluation subsets.
 *
 * Targets: `johns` (postmortem role-obligation-capacity failure) plus five of the eleven
 * "incomplete artwork identity" cases whose per-case diagnosis names a family that should
 * have been carried by a role, plus `greenday` (foreground/background polarity failure).
 *
 * Regression: six cases the review judged `strong`, spanning treatment strata
 * (two-color collapse, three-color surface-collapsed, four-color flat, gradient).
 */

export type EvalCase = Readonly<{
	id: string
	file: string
	group: "target" | "regression" | "offpanel"
	reviewQuality: string
	expectation: string
}>

export const EVAL_CASES: readonly EvalCase[] = [
	{
		id: "johns",
		file: "images/johns.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "a major blue family should appear, most likely as the accent",
	},
	{
		id: "elephunk",
		file: "images/elephunk.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "the main medium blue should appear, probably as the background",
	},
	{
		id: "meteora",
		file: "images/meteora.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "black field, white foreground, khaki carried as accent (not as the field)",
	},
	{
		id: "skap",
		file: "images/skap.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "more than one chromatic family should survive alongside black/white",
	},
	{
		id: "vvbrown",
		file: "images/vvbrown.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "the characteristic bright yellow should be carried, plausibly as the accent",
	},
	{
		id: "slim",
		file: "images/slim.jpg",
		group: "target",
		reviewQuality: "unacceptable / incomplete artwork identity",
		expectation: "the tiny cyan family must not be the global foreground",
	},
	{
		id: "greenday",
		file: "images/greenday.jpg",
		group: "target",
		reviewQuality: "weak-fallback",
		expectation: "black field with white foreground, not the inverse",
	},
	{
		id: "placebo",
		file: "images/placebo.jpg",
		group: "target",
		reviewQuality: "weak-fallback / incomplete artwork identity",
		expectation: "review round 3: keep the baseline dark accent #111312; bright red text is a possible accent",
	},
	{
		id: "knuckles",
		file: "images/knuckles.jpg",
		group: "regression",
		reviewQuality: "strong (round-3 verdict: Track C output preferred, strong)",
		expectation: "preserve #beb2c6 #7b80a8 #d8cbdd #60aac5",
	},
	{
		id: "disney",
		file: "images/disney.avif",
		group: "regression",
		reviewQuality: "strong (round-3 verdict: equal, acceptable)",
		expectation: "a distinct surface would be an improvement; blue accent judged equal to orange",
	},
	{
		id: "doja",
		file: "images/doja.jpg",
		group: "regression",
		reviewQuality: "Track A batch-4 win set",
		expectation: "preserve the trunk treatment",
	},
	{
		id: "loups",
		file: "images/loups.jpg",
		group: "regression",
		reviewQuality: "Track D integrated, reviewed strong",
		expectation: "preserve the trunk treatment",
	},
	{
		id: "black",
		file: "images/black.jpg",
		group: "regression",
		reviewQuality: "strong (true two-color collapse control)",
		expectation: "preserve the collapse",
	},
	{
		id: "orelsan",
		file: "images/orelsan.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "preserve the reviewed #293949 #0c1222 #e9dec8 #6c5f57 gradient",
	},
	{
		id: "krafty",
		file: "images/krafty.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "preserve #050306 #680b3a #f7a223 #eb0a8a (orange foreground, pink accent)",
	},
	{
		id: "nobs",
		file: "images/nobs.jpg",
		group: "regression",
		reviewQuality: "acceptable, incomplete artwork identity",
		expectation: "reviewer asked for one of the vivid colors as a surface",
	},
	{
		id: "offpanel-09",
		file: "09/ab67616d0000b2730009d178a401f9433fdddff2",
		group: "offpanel",
		reviewQuality: "guardrail: trunk regressed off-panel, chromatic foreground was not an improvement",
		expectation: "near-white foreground with a teal accent, not a teal foreground",
	},
	{
		id: "offpanel-03",
		file: "03/ab67616d00001e020003e50500c5d762da89643a.jpg",
		group: "offpanel",
		reviewQuality: "strong",
		expectation: "gold-orange writing in the top left could make a good accent",
	},
	{
		id: "offpanel-11",
		file: "11/ab67616d0000b2730011c0148119c34e2b222b02",
		group: "offpanel",
		reviewQuality: "acceptable",
		expectation: "the accent would be better as one of the red hues",
	},
	{
		id: "offpanel-05",
		file: "05/ab67616d0000b2730005230fae1822525e5a5ff6",
		group: "offpanel",
		reviewQuality: "weak fallback, incomplete artwork identity",
		expectation: "the gray #86858b accent should be one of the artwork's many colors",
	},
	{
		id: "artofficial",
		file: "images/artofficial.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "four distinct flat colors preserved",
	},
	{
		id: "slipknot",
		file: "images/slipknot.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "true two-color collapse preserved",
	},
	{
		id: "muse",
		file: "images/muse.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "gradient with four distinct colors preserved",
	},
	{
		id: "ybbb",
		file: "images/ybbb.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "three-color surface-collapsed treatment preserved",
	},
	{
		id: "toxicity",
		file: "images/toxicity.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "four distinct flat colors with a saturated red accent preserved",
	},
	{
		id: "snarky",
		file: "images/snarky.jpg",
		group: "regression",
		reviewQuality: "strong",
		expectation: "saturated field with dark foreground and pale accent preserved",
	},
]
