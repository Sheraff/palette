/*
 * One run, cover by cover — the dev loop's viewer.
 *
 * A page on the kit, in browse mode: it fetches, navigates, renders its own keymap and shows a
 * visible failure, and it records nothing at all. Everything below is configuration; there is no
 * machinery here, which is the point of the kit and the reason this page is nine lines of behaviour
 * rather than three hundred lines of a fourth chance to get key handling wrong.
 *
 * Read-only, developer-facing, served by `src/devloop/serve.ts` on localhost. Nothing seen here is
 * evidence and nothing here can be answered.
 */
import { el, mockPlayer, startRound } from "./round-kit.js"

/** The mock for a row that has a palette; a plain error panel for one that does not. */
async function palettePanel(context) {
	if (context.item.side === null) {
		return el(
			"div",
			{ class: "round-error" },
			el("p", { text: context.item.error ?? "this candidate produced no palette for this cover" }),
			el("p", { text: context.item.imagePath ?? "" }),
		)
	}
	return mockPlayer(context)
}

await startRound({
	browse: true,
	batchKind: "devloop-run",
	payloadPath: "/api/devloop-run",
	nodeIds: ["preamble", "question", "instruction", "progress", "stage", "context", "itemref", "status", "keymap"],
	stimulusRenderer: palettePanel,
	// No heading over the mock: there is one palette on screen, and "side " is not a label.
	sideName: null,
	unitSingular: "cover",
	unitPlural: "covers",
	failHeadline: "this run could not be loaded",
	noRoundText: "no run in the dev loop's runs directory — run one first",
	renderContext({ item, nodes }) {
		if (nodes.context == null) return
		nodes.context.textContent =
			`${item.imagePath ?? ""}` +
			(item.ok === false ? " · FAILED" : "") +
			(item.cached === true ? " · from cache" : ` · computed in ${item.computeMs ?? 0} ms`)
	},
})
