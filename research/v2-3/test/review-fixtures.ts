export type ReviewFixture = Readonly<{
	caseId: string
	source: Readonly<{ file: string; sha256: string; bytes: number }>
	roles: readonly [background: string, surface: string, foreground: string, accent: string]
	generated?: readonly ("background" | "surface" | "foreground" | "accent")[]
	gradient: boolean
	collapse: readonly [surface: boolean, accent: boolean]
	midpoint?: string
}>

export const reviewFixtures: readonly ReviewFixture[] = [
	{ caseId: "artofficial.jpg", source: { file: "images/artofficial.jpg", sha256: "c5b20159f95c11e27525fc9fb7801045e60e5c7d44b8bb69c94e5e120bffafda", bytes: 1657931 }, roles: ["#31305c", "#040325", "#bdc1ca", "#f5e20c"], gradient: false, collapse: [false, false] },
	{ caseId: "birdsofprey.jpg", source: { file: "images/birdsofprey.jpg", sha256: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d", bytes: 136233 }, roles: ["#141975", "#3fa72a", "#030102", "#d02981"], gradient: true, collapse: [false, false], midpoint: "#1880a7" },
	{ caseId: "black.jpg", source: { file: "images/black.jpg", sha256: "519b1020f1afdc49ee61cbcd7a094fb5169b2859a9f85c1e32db62de59c7633c", bytes: 38119 }, roles: ["#000000", "#000000", "#575757", "#575757"], gradient: false, collapse: [true, true] },
	// Surface and accent exchange under the background-fidelity integration (`BACKGROUND_FIDELITY`
	// = "on"). `batch-bf-1` showed the reviewer both arrangements side by side and returned STRONG
	// on both, with no preference — so this is a move between two endorsed palettes, which is
	// exactly what the charter's "Multiple valid palettes" section says is not a regression. The
	// background `#74c044` does not move. Sole parity change in the integration.
	{ caseId: "disney.avif", source: { file: "images/disney.avif", sha256: "8aeb184764d9bdb5d8273bba8bffb4a1da2eaf44606330fa1f847a71fb01563b", bytes: 8996 }, roles: ["#74c044", "#f68121", "#fbfdfc", "#c72690"], gradient: false, collapse: [false, false] },
	{ caseId: "doja.jpg", source: { file: "images/doja.jpg", sha256: "6db5579b6d143c716ac1658937fe60587a47812251c13524fb8cd580512e54ef", bytes: 133578 }, roles: ["#fd75b5", "#f79e80", "#fff6fc", "#ce5e52"], gradient: true, collapse: [false, false], midpoint: "#ff8cc6" },
	{ caseId: "elephunk.jpg", source: { file: "images/elephunk.jpg", sha256: "cbff25964afd3e74e91506e47beeb855f41c602ac10556935eb3a95ec814954f", bytes: 70051 }, roles: ["#55919b", "#022833", "#fcfdd1", "#a5c7c8"], gradient: false, collapse: [false, false] },
	{ caseId: "franz.jpg", source: { file: "images/franz.jpg", sha256: "634d27eb2a703963e7da87b1b6ebfb2a68a7b23f2a8c7445fe8c88b5daec774e", bytes: 50193 }, roles: ["#020612", "#020612", "#f9ebc4", "#da9925"], gradient: false, collapse: [true, false] },
	{ caseId: "greenday.jpg", source: { file: "images/greenday.jpg", sha256: "082b0cbb95852a1d871360e0b3672d5acde9be62765a100c751f9482101f5853", bytes: 81805 }, roles: ["#000211", "#000211", "#fefefe", "#c13131"], gradient: false, collapse: [true, false] },
	{ caseId: "havana.jpg", source: { file: "images/havana.jpg", sha256: "1bb7af568a67cafdffddc9bf817a72ffb1e5dad739e23845d5c20c55c2acfdf8", bytes: 258556 }, roles: ["#375c77", "#243a51", "#eed076", "#ee655f"], gradient: true, collapse: [false, false] },
	{ caseId: "horrorwood.jpg", source: { file: "images/horrorwood.jpg", sha256: "69382d609c4c88a917e9151aeb07fd6c1b938ae732fe286de0e43cf038662b7d", bytes: 241855 }, roles: ["#151922", "#667481", "#ccd3d9", "#27598e"], gradient: false, collapse: [false, false] },
	{ caseId: "horsley.jpg", source: { file: "images/horsley.jpg", sha256: "3b32f2f95f2ce01af5ecd0ca8383b2b292ba160a874aac5f8480ae6e26634acb", bytes: 71019 }, roles: ["#c99242", "#cc615b", "#f2eec1", "#daad46"], gradient: true, collapse: [false, false] },
	{ caseId: "infected.jpg", source: { file: "images/infected.jpg", sha256: "32adb11856d3156c80defdaa3af4107fcc7cccb713d69d97f00bba1fc932bf44", bytes: 146935 }, roles: ["#30388d", "#2f2959", "#49b7f6", "#e24852"], gradient: true, collapse: [false, false] },
	{ caseId: "johns.jpg", source: { file: "images/johns.jpg", sha256: "3c519a67314f999a0e52b005eef4b146a9e43ab70819ce00f6e197c62f01dac1", bytes: 79960 }, roles: ["#0d181c", "#315a92", "#f7f8fa", "#ff5a62"], gradient: false, collapse: [false, false] },
	{ caseId: "knuckles.jpg", source: { file: "images/knuckles.jpg", sha256: "057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2", bytes: 90657 }, roles: ["#beb2c6", "#7b80a8", "#d8cbdd", "#60aac5"], gradient: false, collapse: [false, false] },
	{ caseId: "krafty.jpg", source: { file: "images/krafty.jpg", sha256: "3afaf90cd911c134fe26708b3da3fdad181eb38cd8455a8a4538de88a4894091", bytes: 181770 }, roles: ["#050306", "#680b3a", "#f7a223", "#eb0a8a"], gradient: false, collapse: [false, false] },
	{ caseId: "loups.jpg", source: { file: "images/loups.jpg", sha256: "ac5784abcef2493024b69ce3d7295cd6c1d7e942386830c848e0b9243be629fa", bytes: 69808 }, roles: ["#fa7b34", "#ebda8a", "#fde5d9", "#fc8831"], gradient: true, collapse: [false, false], midpoint: "#fdc568" },
	{ caseId: "maroon5.jpg", source: { file: "images/maroon5.jpg", sha256: "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef", bytes: 105355 }, roles: ["#0a0a0a", "#4a0d14", "#f4e9e7", "#ea8f74"], gradient: false, collapse: [false, false] },
	{ caseId: "meteora.jpg", source: { file: "images/meteora.jpg", sha256: "26ab93c9c2e806f79e9930f060d39597b1f9ef9811aa19e7ee048903d7e7cb7f", bytes: 68076 }, roles: ["#000000", "#000000", "#fafafa", "#a59073"], gradient: false, collapse: [true, false] },
	{ caseId: "muse.jpg", source: { file: "images/muse.jpg", sha256: "c1ed7ef0e2d6254738ad265103e67ce018b01a68c06c2f24077df618fa3c0f35", bytes: 113438 }, roles: ["#000000", "#026faa", "#edf6fb", "#10a4d4"], gradient: true, collapse: [false, false] },
	{ caseId: "nada.jpg", source: { file: "images/nada.jpg", sha256: "92bfe9dd27931b1badc1b4ce5847c13c8852eacf8c49d6f38b6ff8ea58be7480", bytes: 174998 }, roles: ["#44648b", "#354f70", "#fbfcf7", "#fcda3b"], gradient: false, collapse: [false, false] },
	{ caseId: "nobs.jpg", source: { file: "images/nobs.jpg", sha256: "d0d5e570f961094da6d2a0744660bddd1811eb8116d176dcc0750c55651d723c", bytes: 364846 }, roles: ["#f7ffff", "#f7f61f", "#a1162d", "#0695fd"], gradient: false, collapse: [false, false] },
	{ caseId: "once.jpg", source: { file: "images/once.jpg", sha256: "26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9", bytes: 91019 }, roles: ["#817486", "#dddde7", "#3b303e", "#6c5f71"], gradient: true, collapse: [false, false], midpoint: "#d9dee2" },
	{ caseId: "orelsan.jpg", source: { file: "images/orelsan.jpg", sha256: "2d2bb16bda633340d7b7ece3c98b04772d9f48d900d4535fd6ba448c7cdcd0f6", bytes: 17077 }, roles: ["#172737", "#0c1222", "#e9dec8", "#6c5f57"], gradient: true, collapse: [false, false] },
	{ caseId: "placebo.jpg", source: { file: "images/placebo.jpg", sha256: "5a45dc54f71a6064d3ee8920a4a2e4b9e27bbbd1ae4e661e836beabed4145905", bytes: 210759 }, roles: ["#6c8a8a", "#86a5aa", "#fbfdfa", "#c91611"], gradient: true, collapse: [false, false] },
	{ caseId: "pureblack.jpg", source: { file: "images/pureblack.jpg", sha256: "79c0978816663e7f59002cd25147d89dfe8ecfad50f71e3411185517a929629b", bytes: 1802 }, roles: ["#000000", "#000000", "#ffffff", "#ffffff"], generated: ["foreground", "accent"], gradient: false, collapse: [true, true] },
	{ caseId: "purered.jpg", source: { file: "images/purered.jpg", sha256: "d29dc24562d2afb502385a41667267c93e4f8fc259f73aabcda9806e29fb57ef", bytes: 1806 }, roles: ["#fe0000", "#fe0000", "#ffffff", "#ffffff"], generated: ["foreground", "accent"], gradient: false, collapse: [true, true] },
	{ caseId: "purewhite.jpg", source: { file: "images/purewhite.jpg", sha256: "527a833d1a546df5bc3d1c8f6d523a2c2429432eb21c0e17856f56312fe1aaa0", bytes: 1802 }, roles: ["#ffffff", "#ffffff", "#000000", "#000000"], generated: ["foreground", "accent"], gradient: false, collapse: [true, true] },
	{ caseId: "skap.jpg", source: { file: "images/skap.jpg", sha256: "0eb0e60d862f1703cbf6cf2b01e0d3edd14fe6ff0f7abf48eabf7fbb5863af3d", bytes: 162561 }, roles: ["#ffffff", "#5d763c", "#000103", "#be814b"], gradient: false, collapse: [false, false] },
	{ caseId: "slim.jpg", source: { file: "images/slim.jpg", sha256: "e44c8ebb6e50520d38ec0c62c5333708150c2116ddcd9d97aaa083dbcd864c3e", bytes: 169226 }, roles: ["#01040b", "#140e18", "#37c2eb", "#df2a33"], gradient: true, collapse: [false, false] },
	{ caseId: "slipknot.jpg", source: { file: "images/slipknot.jpg", sha256: "8faff414922e52af414bbcf979694481597ebb67cf39dbbc22432172b3015899", bytes: 14864 }, roles: ["#000000", "#000000", "#fbfbfd", "#fbfbfd"], gradient: false, collapse: [true, true] },
	{ caseId: "snarky.jpg", source: { file: "images/snarky.jpg", sha256: "681a2c4a00cdee770a08049034023bb45309455ab8bf796571fcc6bb3b3a5f9e", bytes: 32831 }, roles: ["#c7bf36", "#c7bf36", "#020c03", "#fcfdf5"], gradient: false, collapse: [true, false] },
	{ caseId: "toxicity.jpg", source: { file: "images/toxicity.jpg", sha256: "b62f5cdd35099615d788a6548f62aa8edb0aea93661d336cb856f6c30ee9c9da", bytes: 204217 }, roles: ["#b59e8e", "#805a33", "#edebd2", "#dd1434"], gradient: false, collapse: [false, false] },
	{ caseId: "vvbrown.jpg", source: { file: "images/vvbrown.jpg", sha256: "06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0", bytes: 57673 }, roles: ["#fffffe", "#fffffe", "#080808", "#e6e622"], gradient: false, collapse: [true, false] },
	{ caseId: "ybbb.jpg", source: { file: "images/ybbb.jpg", sha256: "67f6c4f58c00ac4299d5517ba541410eddd0901e34d753c2536229b2c13cd3c3", bytes: 35092 }, roles: ["#84080a", "#84080a", "#f8eeb3", "#0d0b0e"], gradient: false, collapse: [true, false] },
]
