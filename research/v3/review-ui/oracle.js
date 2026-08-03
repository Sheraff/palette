/*
 * Oracle validation — the reviewer-facing half of REVIEW_UI.md §6.
 *
 * One artwork, one question, one closed vocabulary, and nothing else on screen. The pass runs one
 * question across every artwork before moving to the next question, so the reviewer holds one
 * criterion in their head for the whole run instead of re-reading a form per item. Keyboard only:
 * the answer keys are whatever the fixture bound (1–9 for an enum, y/n for a boolean), `u` steps
 * back, `r` releases. It auto-advances, resumes wherever you stopped, and is meant for ten-minute
 * chunks.
 *
 * **Multi-selects** (`kind: "multi"`, PREMISE_NEXT.md §15.9) are the one question shape that cannot
 * auto-advance: the digit keys toggle values on and off and Enter — or Space — records the set and
 * moves on. Everything else is unchanged, including undo, which is why a multi question may bind
 * digits and nothing else. Stepping back onto an answered multi item reloads its set, so undo means
 * "fix this" rather than "start again".
 *
 * **By-artwork rounds** (`serveMode: "by-artwork"`) are the exception, and there is exactly one
 * reason to pay for it: a question whose answer only means something beside another question's
 * answer on the SAME artwork. `bcde-validation-1` produced 9 gate contradictions across 8 of 20
 * artworks under by-question passes — the reviewer answered a gate in one pass and its dependent in
 * another and could not have seen that the pair does not hold. Such a round serves each artwork as
 * one contiguous run, gate first, with the reviewer's own earlier answers and the broken rule on
 * screen above the question. Nothing else changes: same keys, same undo, same auto-advance.
 *
 * The page knows nothing about what the oracle answered or what the algorithm published — the
 * server does not serve either, and this batch exists precisely to break a tie between them. The
 * reconciliation block is not an exception to that: it shows the REVIEWER's own answers back to
 * them, and never a model's.
 *
 * The answer mapping is on screen for every item. That is not decoration: an answer key the
 * reviewer has to recall is an answer key they will eventually mis-press, and there is no way to
 * find that afterwards in a closed vocabulary. For the same reason the digit row is decoded by the
 * shared `keys.js`: on the reviewer's French (Mac AZERTY) keyboard the unshifted digit row sends
 * `&é"'(§è!çà`, and an enum whose keys need a modifier held down is an enum answered wrong.
 */

import { normalizeKey } from "./keys.js"

const nodes = {
	reconcilePrior: document.querySelector("#reconcile-prior"),
	reconcileConflict: document.querySelector("#reconcile-conflict"),
	preamble: document.querySelector("#preamble"),
	framing: document.querySelector("#framing"),
	question: document.querySelector("#question"),
	instruction: document.querySelector("#instruction"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#stage"),
	mapping: document.querySelector("#mapping"),
	status: document.querySelector("#status"),
	undokey: document.querySelector("#undokey"),
	pending: document.querySelector("#pending"),
}

let batch = null
let index = 0
let busy = false

/**
 * The values toggled on for the multi-select item currently on screen.
 *
 * Keyed by the item's token so it resets by itself when the page moves, and seeded from the item's
 * recorded answer when the reviewer steps back onto one — a half-remembered set is not an answer.
 */
let pending = { token: null, values: [] }

function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class) node.className = options.class
	if (options.text !== undefined) node.textContent = String(options.text)
	node.append(...children.filter((child) => child !== null && child !== undefined))
	return node
}

function status(message) {
	nodes.status.textContent = message
}

async function api(path, init) {
	const response = await fetch(path, init)
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
	return body
}

/** True when the current question spends `u` on an answer, so `u` cannot also mean undo. */
function undoIsTaken() {
	const item = index < batch.items.length ? batch.items[index] : null
	const question = item === null ? null : questionOf(item)
	return question !== null && question.answers.some((entry) => entry.hotkey === "u")
}

function questionOf(item) {
	return batch.questions.find((entry) => entry.key === item.questionKey) ?? null
}

/** The item on screen, or null when the pass is finished. */
function currentItem() {
	return index < batch.items.length ? batch.items[index] : null
}

/**
 * The pending multi-select values for the item on screen, in the vocabulary's own order.
 *
 * Vocabulary order rather than press order, because the mapping is read top to bottom and a list
 * that jumps around as it is built is a list the reviewer has to re-read on every keypress. The
 * server sorts on the way in, so press order was never going to reach the record anyway.
 */
function pendingValues(item, question) {
	if (item === null || question === null || question.kind !== "multi") return []
	if (pending.token !== item.token) {
		const recorded = Array.isArray(item.answer) ? item.answer : []
		pending = { token: item.token, values: recorded }
	}
	return question.answers.map((answer) => answer.key).filter((key) => pending.values.includes(key))
}

function togglePending(item, key) {
	const already = pending.values.includes(key)
	pending = {
		token: item.token,
		values: already ? pending.values.filter((value) => value !== key) : [...pending.values, key],
	}
}

/** The first item with no answer yet — how "resumable anywhere" is implemented. */
function firstUnanswered() {
	const at = batch.items.findIndex((item) => item.answer === null)
	return at < 0 ? batch.items.length : at
}

function renderMapping(question, chosen) {
	const multi = question.kind === "multi"
	nodes.mapping.replaceChildren(
		...question.answers.map((answer) => {
			const on = multi && chosen.includes(answer.key)
			return el(
				"li",
				{ class: multi ? `oracle-map oracle-map-multi${on ? " is-selected" : ""}` : "oracle-map" },
				el("b", { text: answer.hotkey }),
				// The mark exists only on a multi-select: with no auto-advance there is nothing else on
				// screen that says a keypress landed, and a toggle you cannot see is a toggle you press twice.
				multi ? el("span", { class: "oracle-map-mark", text: on ? "on" : "·" }) : null,
				el("span", { class: "oracle-map-label", text: answer.label }),
				el("span", { class: "oracle-map-gloss", text: answer.gloss }),
			)
		}),
	)
}

/** The line that says what a multi-select is about to record, and what commits it. Empty otherwise. */
function renderPending(question, chosen) {
	if (nodes.pending === null || nodes.pending === undefined) return
	nodes.pending.textContent =
		question === null || question.kind !== "multi"
			? ""
			: chosen.length === 0
				? "select every value that applies · enter or space records"
				: `${chosen.join(", ")} · enter or space records`
}

/** One answer as the reviewer gave it — a multi-select is a list, everything else is one token. */
function answerText(answer) {
	return Array.isArray(answer) ? answer.join(", ") : String(answer)
}

/**
 * The reconciliation block: what this artwork already carries, and what does not hold between those
 * answers.
 *
 * It is on screen for the gate AND for every dependent, unchanged, because the whole defect being
 * repaired is that the two were never visible at the same moment. Empty on a by-question round,
 * where `:empty` hides both lines.
 */
function renderReconciliation(item) {
	// Tolerant of a page that does not declare the two lines, the same way `renderPending` is: a
	// missing element must not take the whole render down and leave the artwork on screen with a
	// stale question under it. `review-server-gate-reconciliation.test.ts` asserts oracle.html
	// declares both, which is what makes the tolerance safe rather than a place for a bug to hide.
	if (nodes.reconcilePrior === null || nodes.reconcileConflict === null) return
	const context = item === null ? null : (item.reconciliation ?? null)
	if (context === null) {
		nodes.reconcilePrior.textContent = ""
		nodes.reconcileConflict.textContent = ""
		return
	}
	const prior = context.priorAnswers.map((entry) => `${entry.questionKey} = ${answerText(entry.answer)}`).join(", ")
	nodes.reconcilePrior.textContent = `you previously answered: ${prior} — these conflict`
	nodes.reconcileConflict.textContent = context.conflict
}

/**
 * The progress line.
 *
 * By-question rounds report progress INSIDE the pass — the reviewer is answering one question, and
 * "12 of 30" for that question is the number that says how much is left of it. A by-artwork round
 * has no pass to be inside: the unit of work is the artwork, so it reports the group instead, and
 * names which side of the pair is on screen.
 */
function progressText(item) {
	const answeredLabel = item.answer === null ? "" : ` · answered ${answerText(item.answer)}`
	if (batch.serveMode === "by-artwork") {
		const groups = []
		for (const entry of batch.items) {
			const groupId = entry.reconciliation?.groupId ?? null
			if (groups.at(-1) !== groupId) groups.push(groupId)
		}
		const group = item.reconciliation?.groupId ?? null
		const inGroup = batch.items.filter((entry) => (entry.reconciliation?.groupId ?? null) === group)
		const answeredGroups = groups.filter((groupId) =>
			batch.items.every((entry) => (entry.reconciliation?.groupId ?? null) !== groupId || entry.answer !== null),
		).length
		const role = item.reconciliation?.role ?? "item"
		return (
			`artwork ${groups.indexOf(group) + 1} / ${groups.length} · ${role} · ` +
			`${item.questionKey} ${inGroup.indexOf(item) + 1}/${inGroup.length}${answeredLabel} · ${answeredGroups} artworks done`
		)
	}
	const pass = batch.items.filter((entry) => entry.questionKey === item.questionKey)
	const answeredInPass = pass.filter((entry) => entry.answer !== null).length
	const passLabel = batch.questions.length > 1 ? `${item.questionKey} · ` : ""
	return `${passLabel}${pass.indexOf(item) + 1} / ${pass.length}${answeredLabel} · ${answeredInPass} done`
}

function render() {
	if (index >= batch.items.length) {
		nodes.question.textContent = "every item answered"
		nodes.instruction.textContent = ""
		nodes.preamble.textContent = ""
		nodes.framing.textContent = ""
		nodes.progress.textContent = `${batch.items.length} / ${batch.items.length}`
		renderReconciliation(null)
		nodes.mapping.replaceChildren()
		renderPending(null, [])
		nodes.stage.replaceChildren(
			el(
				"div",
				{ class: "oracle-done" },
				el("p", { text: batch.released ? "this round is released — thank you" : "press r to release the round" }),
			),
		)
		return
	}
	const item = batch.items[index]
	const question = questionOf(item)
	nodes.question.textContent = question === null ? item.questionKey : question.question
	nodes.instruction.textContent = question === null ? "" : question.instruction
	// The referent preamble and the unsure framing sit above the question on EVERY item of every
	// pass, not once at the start: they are what makes these probes answerable on a background made
	// of several parts, and a reviewer who scrolled past them once is answering a different question.
	nodes.preamble.textContent = question?.preamble ?? ""
	nodes.framing.textContent = question?.framing ?? ""
	renderReconciliation(item)
	const chosen = pendingValues(item, question)
	if (question !== null) renderMapping(question, chosen)
	renderPending(question, chosen)
	nodes.undokey.textContent = undoIsTaken() ? "backspace" : "u"

	nodes.progress.textContent = progressText(item)

	// The artwork is the whole judgement, so it gets the whole stage. Intrinsic dimensions come from
	// the file header, so the frame does not jump when the bytes arrive.
	const image = el("img", { class: "oracle-art" })
	image.src = item.media
	image.alt = "album artwork"
	image.width = item.width
	image.height = item.height
	nodes.stage.replaceChildren(image)
}

async function answer(value) {
	if (busy || index >= batch.items.length) return
	const item = batch.items[index]
	busy = true
	try {
		// The token is all the page ever knows an item by; the server resolves it to the real item.
		await api(
			`/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.token)}/answer`,
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ answer: value }),
			},
		)
		item.answer = value
		status(`recorded ${Array.isArray(value) ? value.join(", ") : value}`)
		index += 1
		render()
	} catch (error) {
		status(`not recorded: ${error.message}`)
	} finally {
		busy = false
	}
}

/**
 * Undo is one key and it does not delete anything: it steps back so the item can be answered again.
 * The new answer supersedes the old one at query time — the log stays append-only.
 */
function undo() {
	if (index === 0) {
		status("already at the first item")
		return
	}
	index -= 1
	status("stepped back — answer again to replace")
	render()
}

async function release() {
	try {
		const result = await api(`/api/batches/${encodeURIComponent(batch.batchId)}/release`, { method: "POST" })
		batch.released = true
		status(`released at ${result.releasedAt}`)
		render()
	} catch (error) {
		status(`release refused: ${error.message}`)
	}
}

function onKey(event) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	const key = normalizeKey(event.key.toLowerCase())
	const item = currentItem()
	const question = item === null ? null : questionOf(item)
	const chosen = question === null ? undefined : question.answers.find((entry) => entry.hotkey === key)

	// A multi-select spends its digits on toggles and commits on its own key. Handled before the
	// single-answer path so a digit cannot auto-advance out from under a half-built selection.
	if (question !== null && question.kind === "multi") {
		if (chosen !== undefined) {
			togglePending(item, chosen.key)
			render()
		} else if (event.key === "Enter" || event.key === " ") {
			const values = pendingValues(item, question)
			// An empty commit is a slip, not an answer: every multi vocabulary carries an explicit
			// nothing-here value, so there is always something true to press.
			if (values.length === 0) status("nothing selected — every value is off, and one of them is the empty answer")
			else answer(values)
		} else if (key === "u" || event.key === "Backspace" || event.key === "ArrowLeft") undo()
		else if (key === "r") release()
		else return
		event.preventDefault()
		return
	}

	if (chosen !== undefined) answer(chosen.key)
	// `u` is undo unless the question spends it on an answer — the probe round binds y/n/u, so there
	// undo is Backspace or ArrowLeft, and the footer says which.
	else if ((key === "u" && !undoIsTaken()) || event.key === "Backspace") undo()
	else if (key === "r") release()
	else if (event.key === "ArrowLeft") undo()
	else return
	event.preventDefault()
}

async function start() {
	document.addEventListener("keydown", onKey)
	try {
		const queue = await api("/api/queue")
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		// The NEWEST unreleased round, not the first: an abandoned earlier pass must never be the one
		// the reviewer lands on.
		const rounds = queue.batches
			.filter((entry) => entry.kind === "oracle-validation")
			.sort((a, b) => (a.pushedAt < b.pushedAt ? -1 : 1))
		const chosen =
			rounds.find((entry) => entry.batchId === wanted) ??
			rounds.filter((entry) => !entry.released).at(-1) ??
			rounds.at(-1)
		if (chosen === undefined) {
			nodes.question.textContent = "no oracle-validation round in the queue"
			status("push one to /api/oracle-validation")
			return
		}
		batch = await api(`/api/oracle-validation/${encodeURIComponent(chosen.batchId)}`)
		index = firstUnanswered()
		render()
		status(`${batch.batchId} — resuming at item ${Math.min(index + 1, batch.items.length)}`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
