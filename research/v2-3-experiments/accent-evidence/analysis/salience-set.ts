/**
 * The salience target set: every accent correction whose stated reason is artwork-salience,
 * hand-classified from the reviewer's note, with the record index so every label is auditable.
 */
export type SalienceCase = {
	idx: number
	image: string
	published: string
	prescribed: string
	bg: string
	surface: string
	fg: string
	klass: "salience" | "permutation" | "provenance" | "other" | "distinctness"
	quote: string
}

/** Hand-labelled. `salience` = the reviewer names an artwork element the accent should represent. */
export const CASES: SalienceCase[] = [
	{ idx: 96, image: "ab67616d0000b2730007cc8b341c11227aa7b461", published: "#242426", prescribed: "#f06d13", bg: "#5d856b", surface: "#99bece", fg: "#fbfbfb", klass: "salience", quote: "the accent should be the color of the orange album title" },
	{ idx: 102, image: "ab67616d00001e0200087b1314ac8e17bc1c6916", published: "#e7a680", prescribed: "#ff4e2a", bg: "#020401", surface: "#311f13", fg: "#f1e8df", klass: "salience", quote: "stronger using the red accents instead of the caramel cream skin color" },
	{ idx: 124, image: "ab67616d0000b2730008601958194a047b8e75a3", published: "#f34e2e", prescribed: "#cd6075", bg: "#623c39", surface: "#623c39", fg: "#faf4e8", klass: "salience", quote: "in the order of importance ... honeycomb and firebug pink" },
	{ idx: 129, image: "ab67616d0000b27300014fb430dd1b693e653121", published: "#fbd17f", prescribed: "#fd332f", bg: "#11130e", surface: "#23761e", fg: "#f5f5f5", klass: "salience", quote: "big gold text, half the image is red" },
	{ idx: 130, image: "ab67616d0000b27300014fb430dd1b693e653121", published: "#98ac27", prescribed: "#fd332f", bg: "#11130e", surface: "#23761e", fg: "#fdd891", klass: "salience", quote: "the accent can be one of the red shades" },
	{ idx: 132, image: "ab67616d0000b2730009d178a401f9433fdddff2", published: "#f5f7f4", prescribed: "#e83463", bg: "#000000", surface: "#21203f", fg: "#15a6a9", klass: "salience", quote: "a lot of red shades ... we might as well replace [the white accent]" },
	{ idx: 135, image: "ab67616d00001e02000cd48fb26f462cd33760f6", published: "#a7dbd9", prescribed: "#eb257d", bg: "#ffffff", surface: "#ffffff", fg: "#201f41", klass: "salience", quote: "the artwork has many colors, so we are missing some of its identity" },
	{ idx: 140, image: "ab67616d0000b273000f815611cd5966187e2051", published: "#bebcbf", prescribed: "#f168a0", bg: "#dbdce1", surface: "#fbfbfb", fg: "#1d1a21", klass: "salience", quote: "a couple splashes of color around pink and purple ... should have some of this represented" },
	{ idx: 164, image: "ab67616d0000b273000f815611cd5966187e2051", published: "#8e672c", prescribed: "#f168a0", bg: "#dbdce1", surface: "#fbfbfb", fg: "#1d1a21", klass: "salience", quote: "(same artwork, re-asked)" },
	{ idx: 175, image: "ab67616d0000b273000f815611cd5966187e2051", published: "#bebcbf", prescribed: "#f168a0", bg: "#dbdce1", surface: "#fbfbfb", fg: "#1d1a21", klass: "salience", quote: "(same artwork, re-asked)" },
	{ idx: 178, image: "ab67616d0000b273000d5cdbc67ed815efc360ad", published: "#c7c6c1", prescribed: "#cd1227", bg: "#000000", surface: "#000000", fg: "#f7de67", klass: "salience", quote: "The Dim grey feels too neutral for this artwork, it is not the focus of it. The gold and red are the important ones." },
	{ idx: 202, image: "ab67616d00001e02000c4d52300a016ee65f1622", published: "#b67161", prescribed: "#d479bf", bg: "#0c070b", surface: "#300c16", fg: "#c6a37b", klass: "salience", quote: "a bit muted compared to the artwork that contains very rich purples" },
	{ idx: 205, image: "ab67616d00001e0200102a1cdfa1c0f12d6528ea", published: "#d79a87", prescribed: "#f4405d", bg: "#a9b8cd", surface: "#014047", fg: "#e3eaf2", klass: "salience", quote: "a very strong incision red ... instead of the blush beige skin color" },
	{ idx: 209, image: "ab67616d0000b2730001c404b8a04a8789db8dab", published: "#055226", prescribed: "#ede1bb", bg: "#070908", surface: "#070908", fg: "#fdf9fa", klass: "salience", quote: "missing the cream color of some of the text" },
	{ idx: 210, image: "ab67616d0000b27300028829f9e78dbe7ce92f7e", published: "#e5b3cc", prescribed: "#40e1c2", bg: "#282129", surface: "#485b6a", fg: "#f6efc1", klass: "salience", quote: "not as important as the blush pink and the teal accents" },
	{ idx: 216, image: "ab67616d0000b273000c42c61ba60f69e5a40a29", published: "#de9b06", prescribed: "#fdfc0c", bg: "#5e2f05", surface: "#b56b00", fg: "#fbfdf8", klass: "salience", quote: "not strong enough compared to the bright pure yellow shape ... picked from some shadow around the actual highlight" },
	{ idx: 227, image: "ab67616d00001e02000db903479b2da9843413b1", published: "#5da1a2", prescribed: "#ed6569", bg: "#8ad1cd", surface: "#e1d1c1", fg: "#20150f", klass: "salience", quote: "2 amazing colors in this artwork (watermelon and pineapple)" },
	{ idx: 230, image: "ab67616d0000b2730007447dce968ba3a4066044", published: "#404066", prescribed: "#842c68", bg: "#131313", surface: "#131313", fg: "#ececee", klass: "salience", quote: "this palette is dull compared to the artwork ... a rich dark bordeaux accent" },
	{ idx: 240, image: "ab67616d00001e02000a8aa1dafa651976a7bb44", published: "#8f3908", prescribed: "#f0d202", bg: "#040301", surface: "#491600", fg: "#fa8a02", klass: "salience", quote: "good foreground color, but weak accent" },

	// --- non-salience accent corrections, kept as the within-taxonomy control ---
	{ idx: 103, image: "ab67616d0000b273000955ccfc1e8da97a09b32d", published: "#997634", prescribed: "#131313", bg: "#fbbb4d", surface: "#fbbb4d", fg: "#131313", klass: "permutation", quote: "accent should be collapsed to the foreground" },
	{ idx: 123, image: "ab67616d0000b273000a392cb5a08d9801562845", published: "#ffd800", prescribed: "#ffffff", bg: "#242424", surface: "#000000", fg: "#f7f7f5", klass: "permutation", quote: "this is the role of the foreground, not the accent" },
	{ idx: 125, image: "ab67616d00001e02000eaebc73a8a91dabda71fa", published: "#78d429", prescribed: "#f1f9ec", bg: "#242424", surface: "#242424", fg: "#f1f9ec", klass: "permutation", quote: "the ghost mint white can serve as the accent" },
	{ idx: 142, image: "ab67616d00001e020002f9f58137435bcf6e8e77", published: "#c5ab20", prescribed: "#fdfdf1", bg: "#7a609f", surface: "#80575d", fg: "#fdfdf1", klass: "permutation", quote: "use that as the foreground instead of the accent" },
	{ idx: 152, image: "ab67616d0000b2730009ee6f6835bed9a0e41752", published: "#f8e0a0", prescribed: "#f8aebf", bg: "#54a0c4", surface: "#1b70b3", fg: "#f8aebf", klass: "permutation", quote: "main text is vanilla ... Chantilly pink as the accent" },
	{ idx: 211, image: "ab67616d0000b27300034b1c66ddd55a5337f66a", published: "#9ae5fc", prescribed: "#c3b0c6", bg: "#281832", surface: "#273d77", fg: "#c3b0c6", klass: "permutation", quote: "roles are flipped between foreground and accent" },
	{ idx: 212, image: "ab67616d0000b27300038e79a0efbc7325db6444", published: "#fc0001", prescribed: "#cbc2b9", bg: "#070101", surface: "#570d0c", fg: "#cbc2b9", klass: "permutation", quote: "foreground and accent roles are flipped" },
	{ idx: 217, image: "ab67616d0000b273000f58e77c6b56afa4666ad0", published: "#fba035", prescribed: "#df828d", bg: "#413877", surface: "#803d60", fg: "#df828d", klass: "permutation", quote: "foreground and accent are flipped" },
	{ idx: 247, image: "ab67616d0000b273000f58e77c6b56afa4666ad0", published: "#fba035", prescribed: "#df828d", bg: "#413877", surface: "#803d60", fg: "#df828d", klass: "permutation", quote: "(same artwork, re-asked)" },
	{ idx: 199, image: "ab67616d00001e020006bcb4b80e6d6c49820121", published: "#5f69a7", prescribed: "#672a4c", bg: "#3a2922", surface: "#ac8b6c", fg: "#fbfbf3", klass: "provenance", quote: "off-screen blue light reflecting off of the white clothes ... doesn't feel like it belongs" },
	{ idx: 244, image: "ab67616d0000b27300034b1c66ddd55a5337f66a", published: "#8a5243", prescribed: "#c6b3c9", bg: "#2b0f25", surface: "#143471", fg: "#9ae5fc", klass: "provenance", quote: "i can't see in the artwork where this color comes from" },
	{ idx: 151, image: "ab67616d0000b273000d8049603d6ab7f5d759bb", published: "#774e0c", prescribed: "#692906", bg: "#0e0701", surface: "#301e08", fg: "#fafcf1", klass: "other", quote: "(no note)" },
	{ idx: 154, image: "ab67616d00001e020001c08189a1b1a67bab3d95", published: "#f7f7f5", prescribed: "#58ca1a", bg: "#2d2113", surface: "#16110d", fg: "#dcb246", klass: "other", quote: "(no note)" },
	{ idx: 166, image: "ab67616d0000b2730008c1c08433aa880aad7f30", published: "#ce9f71", prescribed: "#fcfef0", bg: "#9dcfcc", surface: "#ccddd7", fg: "#297269", klass: "other", quote: "(no note)" },
	{ idx: 167, image: "ab67616d0000b27300103a3729bf589e0dc913ab", published: "#f9f9ef", prescribed: "#b29b3e", bg: "#1c252a", surface: "#553e1f", fg: "#c0b98b", klass: "other", quote: "(no note)" },
	{ idx: 168, image: "ab67616d0000b2730012eb9ade9c1bf4a5411c5d", published: "#96d1a5", prescribed: "#9bd2aa", bg: "#040205", surface: "#1a272f", fg: "#e9e9eb", klass: "other", quote: "(no note)" },
	{ idx: 187, image: "ab67616d0000b273000d5cdbc67ed815efc360ad", published: "#f22632", prescribed: "#cd1227", bg: "#000000", surface: "#000000", fg: "#c7c6c1", klass: "other", quote: "(no note; same-hue refinement)" },
	{ idx: 188, image: "ab67616d00001e020003e50500c5d762da89643a", published: "#758151", prescribed: "#cfd4c0", bg: "#050a06", surface: "#121e10", fg: "#cfd4c0", klass: "permutation", quote: "not picking up the orange-gold colors in the top left corner" },
	{ idx: 242, image: "ab67616d00001e020010b864b2a925ec6bfaa30e", published: "#773a8a", prescribed: "#2279be", bg: "#140210", surface: "#113b63", fg: "#ae66a6", klass: "other", quote: "(no note)" },
]

export const SALIENCE = CASES.filter((c) => c.klass === "salience")
