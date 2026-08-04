/*
 * The synthetic accent panel — **one renderer, two callers.**
 *
 * This is `bracketing.js`'s `renderAccent()`, lifted out of that file unchanged: the same three
 * shapes in the same order, the same class names, the same two style properties. `bracketing.js`
 * imports it and `accent-real.js` imports it, so round 1's panels and their replays in
 * `accent-real-1` are drawn by the same code rather than by two copies that agree today.
 *
 * **Why that matters more here than anywhere else.** `accent-real-1`'s six anchors exist to measure
 * the gap between a lab stimulus and a real one. That measurement is only worth having if the lab
 * side is *identical* to what round 1 showed — same pixels, same everything — because any difference
 * in the rendering would land in the measurement as if it were a difference in the stimulus class.
 * A second copy of this function is exactly the drift the mock's single-renderer rule
 * (`mock.js:5-7`) exists to prevent, and the reasoning transfers verbatim: *"a verdict is about the
 * exact rendering the reviewer judged — which only holds if there is exactly one renderer."*
 *
 * The classes `accent-stage`, `accent-shape`, `accent-circle`, `accent-triangle` and `accent-ring`
 * are all real rules in `styles.css`. The kit's class guard walks the rendered DOM, so a class
 * invented here fails a test rather than reaching a reviewer as a collapsed layout.
 */

/**
 * A flat field filling the stage, with three accent-coloured elements on it: a disc, a
 * play-triangle and a ring.
 *
 * That vocabulary is not decoration — it is the transport-control shape language of the palette mock
 * itself, which is what makes this an accent *in a role* rather than a bare swatch pair. (The bare
 * pair is `renderPair()` in `bracketing.js`, which part 1 uses and neither of these rounds touches.)
 *
 * @param {{ fieldHex: string, accentHex: string }} panel the two colours, as CSS colour strings
 * @param {(tag: string, options?: object, ...children: unknown[]) => Element} el the caller's element helper
 * @returns {Element} the stage
 */
export function renderAccentPanel(panel, el) {
	const stage = el("div", { class: "accent-stage" })
	stage.style.background = panel.fieldHex
	for (const shape of ["accent-circle", "accent-triangle", "accent-ring"]) {
		const node = el("div", { class: `accent-shape ${shape}` })
		// The ring is an outline, so its colour is the border; the other two are filled.
		if (shape === "accent-ring") node.style.borderColor = panel.accentHex
		else node.style.background = panel.accentHex
		stage.append(node)
	}
	return stage
}
