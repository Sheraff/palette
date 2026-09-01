/*
 * Free text — one artwork, one open question, no vocabulary (REVIEW_UI.md §4).
 *
 * **This page is now a config object.** It used to be 300 lines of its own payload fetch, key
 * handling, autosave, undo, resume and release, and one line of that — `normalizeKey(event)` where
 * every other page wrote `normalizeKey(event.key)` — shipped a page the reviewer could not advance a
 * single cover on. Everything that was hand-rolled here now lives in `round-kit.js`, which is also
 * where it is tested; what is left below is the part that is genuinely about THIS round.
 *
 * The behaviour is unchanged and its tests are unchanged, which is the point of the exercise: the
 * kit had to absorb a real page without moving it, or it would just be a fourth way to write one.
 *
 * Why the round exists, kept here because it is what a future reader needs: every other round hands
 * the reviewer a closed list, and a closed list cannot record "none of these fit, and here is why" —
 * it has only a refusal value, and a refusal value files the reviewer's silence as their judgement.
 * `cascade-ground-truth-1` hit that: nine `none_discernible` answers that meant "I can see the
 * field, I just don't know how to tag it" — the opposite fact, wearing the same token.
 *
 * The context block shows the reviewer's own earlier answer, in the FIXTURE's wording, framed as
 * something not to defend. Shown bare it reads as an accusation, and the reviewer writes a
 * justification instead of the description this round exists to collect.
 */

import { freeText, imagePanel, startRound } from "./round-kit.js"

await startRound({
	batchKind: "oracle-validation",
	nodeIds: [
		"question",
		"instruction",
		"progress",
		"stage",
		"frame",
		"artwork",
		"context",
		"context-label",
		"context-answer",
		"context-note",
		"answer",
		"saved",
		"side",
		"done",
		"pending",
		"status",
		"keymap",
		"notebox",
		"noteinput",
		"notemark",
		"itemref",
	],
	stimulusRenderer: imagePanel,
	answerWidget: freeText,
	// The stage holds the frame and the side panel as permanent children, and the stimulus renderer
	// writes into the existing <img> rather than replacing the stage — so the textarea is never
	// rebuilt under a reviewer who is mid-sentence.
	stageReplaces: false,
	hideWhenDone: ["frame", "side"],

	unitSingular: "cover",
	unitPlural: "covers",
	answeredWord: "written",
	allAnsweredText: "every cover has an answer",
	emptyText: "this round has no covers",
	noRoundText: "no free-text round in the queue",
	atFirstText: "already at the first cover",
	steppedBackText: "stepped back — edit and save to replace",
	emptyAnswerText: "nothing written yet — an empty answer is not recorded",

	/**
	 * The reviewer's own earlier answer, in the fixture's own framing.
	 *
	 * Hidden entirely when the round carries none: an empty labelled box would imply a context that
	 * does not exist, which is worse than no box at all.
	 */
	renderContext({ item, question, nodes }) {
		const prior = item.priorAnswer ?? null
		if (prior === null || question?.contextLabel == null) {
			nodes.context.hidden = true
			return
		}
		nodes.context.hidden = false
		nodes["context-label"].textContent = question.contextLabel
		nodes["context-answer"].textContent = prior.answer
		nodes["context-note"].textContent = question.contextNote ?? ""
	},
})
