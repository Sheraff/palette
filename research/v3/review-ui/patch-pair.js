/*
 * The colour-patch pair — **one renderer, two callers.**
 *
 * This is `bracketing.js`'s `renderPair()`, lifted out of that file unchanged: the same three
 * elements in the same order, the same class names, the same one style property each. `bracketing.js`
 * imports it and `perception-4.js` imports it, so rounds 1–3's pairs and round 4's arm A and arm B
 * pairs are drawn by the same code rather than by two copies that agree today.
 *
 * **Why that matters here.** Round 4's identity items carry rounds 1–3's question and instruction
 * byte for byte, because their 184 answers and this round's are meant to pool into one fit. Pooling
 * answers to the same words about a *differently drawn* stimulus would put a rendering difference
 * inside a threshold, which is the confound the wording guarantee exists to exclude. The reasoning is
 * `accent-panel.js`'s, verbatim, applied to the other stimulus: *"a verdict is about the exact
 * rendering the reviewer judged — which only holds if there is exactly one renderer."*
 *
 * The classes `pair`, `pair-field` and `pair-divider` are all real rules in `styles.css`. The kit's
 * class guard walks the rendered DOM, so a class invented here fails a test rather than reaching a
 * reviewer as a collapsed layout.
 */

/**
 * Two flat fields, edge to edge, separated only by a thin line of the page's own paper colour.
 *
 * The seam is the whole instrument: the criterion asks whether the two *register* as one colour, not
 * whether a difference can be found at the boundary, and a gap wide enough to break the comparison
 * would be asking a different question.
 *
 * @param {{ firstHex: string, secondHex: string }} pair the two colours, as CSS colour strings
 * @param {(tag: string, options?: object, ...children: unknown[]) => Element} el the caller's element helper
 * @returns {Element} the stage content
 */
export function renderPatchPair(pair, el) {
	const node = el("div", { class: "pair" })
	const first = el("div", { class: "pair-field" })
	first.style.background = pair.firstHex
	const second = el("div", { class: "pair-field" })
	second.style.background = pair.secondHex
	node.append(first, el("div", { class: "pair-divider" }), second)
	return node
}
