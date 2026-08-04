/*
 * Perception round 4 — "the shape round". The page.
 *
 * On the kit (`ROUND_KIT.md`: *"no new review page is written outside the kit"*), so everything below
 * is a config object. There is no `addEventListener`, no `fetch` of a payload, no `normalizeKey` —
 * navigation, resume, undo, autosave, release, the generated keymap, the per-item note box and the
 * copyable item id all come from `startRound`.
 *
 * The one thing this page owns is **which of two stimuli to draw**, and both come from somewhere
 * else:
 *
 *  - a **colour-patch pair**, through `renderPatchPair` from `/patch-pair.js`, which is
 *    `bracketing.js`'s own `renderPair()` — one renderer, two callers. 84 items are these: arm A's 40
 *    discriminating pairs, arm B's 36 ladder rungs, and the identity controls and repeats.
 *  - a **real cover in the pinned mock player**, through `renderSide` from the one `mock.js`. 64
 *    items are these: arm C's 60 accents and the accent controls and repeats.
 *
 * **The page never decides which question is being asked.** Both the stem and the instruction come
 * from the item's own question object in the fixture, and so does the one-line stimulus-type label in
 * `preamble`. That is not incidental to this round, it is the round's central hazard managed: 148
 * items alternate between two criteria that a tired reviewer could easily blur, one of which
 * ("do these register as the same colour") is byte-identical to what three earlier rounds asked, and
 * the other of which ("does this work as an accent at a glance") explicitly excludes things the first
 * one has no opinion about. If the words ever came from this file they could drift from the words the
 * answers were recorded under, and a threshold is only meaningful against the question that made it.
 *
 * The side-car (`/perception-4.data.json`) carries **render data only** — two hex values for a pair,
 * a palette for a mock. No arm, no rung, no target distance, no stratum, no which-rule-says-what. It
 * is a static file the browser can read in full, so anything in it is effectively on screen, and on
 * this round that matters more than usual: arm A's items are *by construction* the ones where the two
 * candidate rules disagree, so an arm label in the side-car would print half the experiment.
 */
// Relative, like `./round-kit.js` beside it. A relative specifier resolves against the importing
// MODULE's URL — `/perception-4.js` — not against the document's route, so `/perception-4?batch=…`
// and a direct file load both land on the same neighbour.
import { el, enumKeys, startRound } from "./round-kit.js"
import { renderPatchPair } from "./patch-pair.js"
import { renderSide } from "./mock.js"

const PAGE_DATA_URL = "/perception-4.data.json"

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
	 * mock never draws. Importing `./mock.js` at the top of this file resolves against THIS module's
	 * URL, which is `/mock.js` in the browser and a real path under the harness — the **same pinned
	 * module** either way, so the single-renderer rule holds unchanged. `accent-real.js` carries the
	 * same import for the same reason, and the same note about why the kit's own one-line fix is not
	 * made from here.
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
		// The patch pair keeps the bracketing rounds' own stage padding, so a pair drawn here is the
		// same size on screen as the 184 pairs the identity threshold was measured on. The mock keeps
		// the kit's. Both classes are real rules in `styles.css`.
		if (context.nodes?.stage != null) {
			context.nodes.stage.className = entry.stimulus === "pair" ? "oracle-stage pair-stage" : "oracle-stage"
		}
		if (entry.stimulus === "pair") return renderPatchPair(entry.pair, el)
		// `null` for the side name: one palette has nothing to label, and a heading would be chrome
		// competing with the thing being judged.
		return renderSide(context.item.media, null, entry.side)
	},
})
