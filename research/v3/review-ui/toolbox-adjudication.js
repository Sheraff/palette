/*
 * Toolbox adjudication — 42 written proposals, four answers each, no artwork.
 *
 * The two toolbox reviews of 2026-08-04 proposed tools and process changes; the orchestrator triaged
 * them; the reviewer asked to rule on them point by point instead. Their standing rule is that
 * anything needing their eyes lives here rather than in a document, so the triage is a round.
 *
 * **This page is a config object**, because `ROUND_KIT.md`'s standing rule is that no new review page
 * is written outside the kit — three pages shipped broken in three days, all three because each one
 * re-implemented fetch, keys, navigation, undo, resume and release from scratch. The one thing below
 * that is genuinely about THIS round is the stimulus renderer, and it is one line.
 *
 * **The stimulus is prose, and all of it comes from the fixture.** The kit fills the title from
 * `question`, the plain-language description from `preamble` and the standing criterion from
 * `instruction`; the renderer prints `framing` — what the item serves, what it costs, my call and
 * where the proposal came from, one fact per line into a `pre-wrap` panel. Nothing is composed here
 * and there is no side-car, so what is laid out and what the answers are recorded under are the same
 * characters.
 *
 * **What is NOT here: a note box.** A free-text remark beside a closed answer is the one widget the
 * kit does not have yet — `ROUND_KIT.md`'s own migration list parks it under the calibration page,
 * which needs the same thing — and inventing one here would be a text field with no rule for handing
 * the keyboard back, which is the exact class of bug the kit exists to stop. `discuss` is the answer
 * for an item that needs words, and an `ambiguityNote` can be amended onto any of these records
 * through the warehouse afterwards.
 */

import { el, enumKeys, startRound } from "./round-kit.js"

await startRound({
	batchKind: "oracle-validation",
	nodeIds: ["question", "preamble", "instruction", "progress", "stage", "mapping", "pending", "status", "keymap"],

	/**
	 * The four facts, verbatim from the fixture.
	 *
	 * `round-text-panel` is a real rule in `styles.css` and it is `white-space: pre-wrap`, so the
	 * newlines the builder wrote are the layout. Splitting the string here would be a second copy of
	 * the round's own text, and a second copy is a thing that drifts.
	 */
	stimulusRenderer: ({ question }) => el("div", { class: "round-text-panel", text: question?.framing ?? "" }),
	answerWidget: enumKeys,

	unitSingular: "item",
	unitPlural: "items",
	allAnsweredText: "every proposal has a ruling",
	emptyText: "this round has no items",
	noRoundText: "no toolbox adjudication round in the queue",
	atFirstText: "already at the first proposal",
	atLastText: "already at the last proposal",
	steppedBackText: "stepped back — answer again to replace",
	failHeadline: "could not load the adjudication round",
})
