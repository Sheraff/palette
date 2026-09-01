/*
 * Two runs, side by side, biggest change first — the other half of the dev loop's viewer.
 *
 * Same kit, same browse mode, same nothing-is-recorded. The only thing this page adds over
 * `devloop-run.js` is that each item carries **two** palettes instead of one, so the stimulus is a
 * composite of two mocks over the same artwork: before on the left, after on the right.
 *
 * The ordering is the server's (`src/devloop/diff.ts`): covers arrive sorted by the largest OKLab
 * distance between corresponding role colours, so item 1 is the cover your change moved most. The
 * number itself is in the footer under each cover — a magnitude to look at first, never a verdict.
 */
import { composite, el, mockPlayer, startRound } from "./round-kit.js"

/** One labelled mock, or a plain panel saying why there is none. */
function sidePanel(label, pick) {
	return async (context) => {
		const side = pick(context.item)
		if (side === null) {
			return el(
				"div",
				{ class: "round-error" },
				el("p", { text: `${label}: no palette` }),
				el("p", { text: context.item.imagePath ?? "" }),
			)
		}
		return mockPlayer({ ...context, config: { sideName: label, sideOf: () => side } })
	}
}

await startRound({
	browse: true,
	batchKind: "devloop-diff",
	payloadPath: "/api/devloop-diff",
	nodeIds: ["preamble", "question", "instruction", "progress", "stage", "context", "itemref", "status", "keymap"],
	stimulusRenderer: composite(
		sidePanel("before", (item) => item.before),
		sidePanel("after", (item) => item.after),
	),
	unitSingular: "cover",
	unitPlural: "covers",
	failHeadline: "this diff could not be loaded",
	noRoundText: "no diffable pair — two runs over the same set are needed",
	renderContext({ item, nodes }) {
		if (nodes.context == null) return
		nodes.context.textContent = `${item.imagePath ?? ""}\n${item.summary ?? item.status ?? ""}`
	},
})
