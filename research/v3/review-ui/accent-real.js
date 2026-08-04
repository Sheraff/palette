/*
 * The real-stimulus accent functional-visibility round — the page.
 *
 * On the kit (`ROUND_KIT.md`: *"no new review page is written outside the kit"*), so everything
 * below is a config object. There is no `addEventListener`, no `fetch` of a payload, no
 * `normalizeKey` — navigation, resume, undo, autosave, release, the generated keymap, the per-item
 * note box and the copyable item id all come from `startRound`.
 *
 * The one thing this page owns is **which of two stimuli to draw**, and both come from somewhere
 * else:
 *
 *  - a **real cover in the pinned mock player**, through `renderSide` from the one `mock.js`. Thirty
 *    ladder items, the Sunshine item and four controls are these.
 *  - a **synthetic flat panel**, through `/accent-panel.js`, which is `bracketing.js`'s own
 *    `renderAccent()` — one renderer, two callers. Six items are these, and they are round 1's
 *    stimuli replayed unchanged so the round can measure the lab-versus-real gap.
 *
 * The reviewer is told nothing about which is which, and the two are shuffled together: an anchor a
 * reviewer could recognise as a replay would be answered from memory of the earlier round, and that
 * memory is exactly the confound the anchors exist to exclude.
 *
 * The side-car (`/accent-real-1.data.json`) carries **render data only** — the palette to draw and
 * the two panel colours. No rung, no target distance, no stratum, no governing role. It is a static
 * file the browser can read in full, so anything in it is effectively on screen.
 */
// Relative, like `./round-kit.js` beside it. A relative specifier resolves against the importing
// MODULE's URL — `/accent-real.js` — not against the document's route, so `/accent-real?batch=…` and
// a direct file load both land on the same neighbour.
import { el, enumKeys, startRound } from "./round-kit.js"
import { renderAccentPanel } from "./accent-panel.js"
import { renderSide } from "./mock.js"

const PAGE_DATA_URL = "/accent-real-1.data.json"

/** questionKey -> what to draw for that item. */
const page = new Map()
const loaded = await fetch(PAGE_DATA_URL)
	.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${PAGE_DATA_URL} ${response.status}`))))
	.then((data) => {
		for (const item of data.items) page.set(item.questionKey, item)
		return true
	})
	.catch(() => false)

await startRound({
	batchKind: "oracle-validation",
	nodeIds: [
		"preamble",
		"question",
		"instruction",
		"progress",
		"stage",
		"notebox",
		"noteinput",
		"notemark",
		"itemref",
		"mapping",
		"pending",
		"status",
		"keymap",
	],
	answerWidget: enumKeys,
	// The kit renders "N <singular>(s) still blank", so the singular has to pluralise with a bare "s".
	// This round shows two different stimulus KINDS, and naming either one would mislabel the other.
	unitSingular: "item",
	unitPlural: "items",
	answeredWord: "answered",
	/*
	 * **Why this calls `renderSide` itself rather than the kit's `mockPlayer`.**
	 *
	 * `mockPlayer` is a three-line wrapper whose only extra behaviour is `await import("/mock.js")` —
	 * a ROOT-ABSOLUTE dynamic specifier. Under the test harness there is no server root to resolve it
	 * against, so it throws `ERR_MODULE_NOT_FOUND`, the kit shows its visible-failure panel, and the
	 * mock never draws. The consequence is worth stating plainly: **no kit round's mock player has
	 * ever been executed in a test.** That is exactly the hole `PHASE_0_LOOSE_ENDS.md` L-i names — a
	 * page can crawl clean and be dead — applied to the primary judging surface itself.
	 *
	 * Importing `./mock.js` at the top of this file resolves against THIS module's URL
	 * (`/accent-real.js`), which is `/mock.js` in the browser and a real path under the harness. It is
	 * the **same pinned module** either way, so the single-renderer rule holds unchanged — that rule
	 * is about there being one mock renderer in the tree, not about how it is spelled.
	 *
	 * The kit's own fix, when someone owns that file, is one line: `import(new URL("./mock.js",
	 * import.meta.url).href)`, which is root-independent AND route-independent. It is not made here
	 * because `review-server-round-kit.test.ts` guard (4) pins the literal specifier, and quietly
	 * editing another surface's guard to make one's own round pass is the move that guard exists to
	 * prevent.
	 */
	stimulusRenderer: async (context) => {
		const entry = page.get(context.item.questionKey)
		if (entry === undefined) {
			// Loud rather than a blank frame. A missing side-car entry means the reviewer would
			// otherwise be asked to judge an empty stage, and answer it — which is worse than a stall,
			// because the answer would be recorded and would look like data.
			return el("div", {
				class: "round-error",
				text: loaded
					? "this item has no render data in the side-car — do not answer it, report the id below"
					: `could not load ${PAGE_DATA_URL} — do not answer anything, report this`,
			})
		}
		if (entry.stimulus === "panel") return renderAccentPanel(entry.panel, el)
		// `null` for the side name: one palette has nothing to label, and a heading would be chrome
		// competing with the thing being judged.
		return renderSide(context.item.media, null, entry.side)
	},
})
