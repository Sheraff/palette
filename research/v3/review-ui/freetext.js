/*
 * Free text — one artwork, one open question, no vocabulary (REVIEW_UI.md §4).
 *
 * Every other reviewer page in this server is a keyboard grid over a closed list. This one is the
 * opposite instrument and exists because that shape has a blind spot: a closed list cannot record
 * "none of these fit, and here is why". It has only a refusal value, and a refusal value files the
 * reviewer's silence as their judgement. That is exactly what happened in `cascade-ground-truth-1`,
 * where nine `none_discernible` answers turned out to mean "I can see the field, I just don't know
 * how to tag it" — the opposite fact, wearing the same token.
 *
 * So: no answer keys, no mapping footer, nothing to memorize. The artwork at its own size (the
 * reviewer zooms natively, §3 — no magnifier), the reviewer's own earlier answer beside it as
 * LABELLED context, and a textarea.
 *
 * **Why the context block is worded the way it is.** It is not there to be defended. A previous
 * answer shown bare reads as an accusation, and the reviewer writes a justification instead of a
 * description — which would destroy the round's only product. The label and the "nothing is being
 * challenged" line come from the FIXTURE, not from this file, for the same reason every other
 * round's question text does: an answer only means something against the exact words it was
 * answered under, so those words travel with the answers.
 *
 * **Saving.** Enter saves and advances; Shift+Enter is a newline. There is also a debounced
 * autosave and a save on blur, so a reviewer who wanders off mid-sentence does not lose it — the
 * log is append-only and a re-save simply supersedes, so saving often costs nothing. Nothing is
 * ever saved empty: an empty field is "not answered yet", and recording it as an answer would
 * repeat the exact confusion this round was built to undo.
 *
 * Resumable: it opens on the first unanswered cover and reloads what was written for any cover you
 * step back to. Go-back is free before release (§1).
 */

import { normalizeKey } from "./keys.js"

const nodes = {
	question: document.querySelector("#question"),
	instruction: document.querySelector("#instruction"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#stage"),
	frame: document.querySelector("#frame"),
	artwork: document.querySelector("#artwork"),
	context: document.querySelector("#context"),
	contextLabel: document.querySelector("#context-label"),
	contextAnswer: document.querySelector("#context-answer"),
	contextNote: document.querySelector("#context-note"),
	answer: document.querySelector("#answer"),
	saved: document.querySelector("#saved"),
	side: document.querySelector("#side"),
	done: document.querySelector("#done"),
	pending: document.querySelector("#pending"),
	status: document.querySelector("#status"),
	backkey: document.querySelector("#backkey"),
}

let batch = null
let index = 0
let busy = false
let saveTimer = null

/**
 * How long the page waits after the last keystroke before saving.
 *
 * Long enough not to write a record per word, short enough that a reviewer who closes the tab
 * mid-thought loses at most a sentence. The same debounce the calibration page's comment field uses.
 */
const AUTOSAVE_DELAY_MS = 1200

function status(text) {
	nodes.status.textContent = text
}

async function api(path, options) {
	const response = await fetch(path, options)
	if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
	return response.status === 204 ? null : await response.json()
}

function questionOf(item) {
	return batch.questions.find((entry) => entry.key === item.questionKey) ?? null
}

/** The first cover with nothing written on it, or the end when they all have something. */
function firstUnanswered() {
	const at = batch.items.findIndex((item) => item.answer === null)
	return at === -1 ? batch.items.length : at
}

function progressText() {
	const answered = batch.items.filter((item) => item.answer !== null).length
	return `${Math.min(index + 1, batch.items.length)} / ${batch.items.length} · ${answered} written`
}

function renderPending() {
	const remaining = batch.items.filter((item) => item.answer === null).length
	nodes.pending.textContent = remaining === 0 ? "every cover has an answer" : `${remaining} cover(s) still blank`
}

function render() {
	if (batch.items.length === 0) {
		nodes.question.textContent = "this round has no covers"
		return
	}
	if (index >= batch.items.length) {
		nodes.question.textContent = "every cover has an answer"
		nodes.instruction.textContent = ""
		nodes.progress.textContent = `${batch.items.length} / ${batch.items.length}`
		// Hidden, never removed. Stepping back off the end has to restore a working field, and a page
		// that rebuilds its own inputs loses whatever was half-typed in them.
		nodes.frame.hidden = true
		nodes.side.hidden = true
		nodes.done.hidden = false
		nodes.done.textContent = batch.released ? "this round is released — thank you" : "press r to release the round"
		renderPending()
		return
	}
	nodes.frame.hidden = false
	nodes.side.hidden = false
	nodes.done.hidden = true
	const item = batch.items[index]
	const question = questionOf(item)
	nodes.question.textContent = question === null ? item.questionKey : question.question
	nodes.instruction.textContent = question?.instruction ?? ""
	nodes.progress.textContent = progressText()

	// Intrinsic dimensions from the file header, so the frame does not jump when the bytes arrive.
	nodes.artwork.src = item.media
	nodes.artwork.alt = "album artwork"
	nodes.artwork.width = item.width
	nodes.artwork.height = item.height

	// The reviewer's own earlier answer, in the fixture's own framing. Hidden entirely when the round
	// carries none — an empty labelled box would imply a context that does not exist.
	const prior = item.priorAnswer ?? null
	if (prior === null || question?.contextLabel == null) {
		nodes.context.hidden = true
	} else {
		nodes.context.hidden = false
		nodes.contextLabel.textContent = question.contextLabel
		nodes.contextAnswer.textContent = prior.answer
		nodes.contextNote.textContent = question.contextNote ?? ""
	}

	nodes.answer.value = item.answer ?? ""
	nodes.saved.textContent = item.answer === null ? "not saved yet" : "saved"
	renderPending()
	nodes.answer.focus()
}

/**
 * Save what is in the field, if it is worth saving.
 *
 * Returns true when the item now holds this text — including the case where nothing was written and
 * nothing needed to be. Never writes an empty answer: blank is "not answered", and the whole reason
 * this round exists is that a token standing in for "I have nothing to say" is unreadable later.
 */
async function save({ quiet = false } = {}) {
	if (busy || batch === null || index >= batch.items.length) return false
	const item = batch.items[index]
	const text = nodes.answer.value.trim()
	if (text.length === 0) {
		if (!quiet) status("nothing written yet — an empty answer is not recorded")
		return false
	}
	if (text === (item.answer ?? "").trim()) {
		nodes.saved.textContent = "saved"
		return true
	}
	busy = true
	try {
		await api(`/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.token)}/answer`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ answer: text }),
		})
		item.answer = text
		nodes.saved.textContent = "saved"
		if (!quiet) status(`saved ${text.length} characters`)
		renderPending()
		nodes.progress.textContent = progressText()
		return true
	} catch (error) {
		nodes.saved.textContent = "NOT saved"
		status(`not recorded: ${error.message}`)
		return false
	} finally {
		busy = false
	}
}

function scheduleSave() {
	nodes.saved.textContent = "unsaved…"
	if (saveTimer !== null) clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		saveTimer = null
		void save({ quiet: true })
	}, AUTOSAVE_DELAY_MS)
}

async function next() {
	if (saveTimer !== null) {
		clearTimeout(saveTimer)
		saveTimer = null
	}
	const saved = await save()
	if (!saved) return
	index += 1
	render()
}

/** Step back. Nothing is deleted: re-saving appends a record that supersedes at query time. */
async function back() {
	if (saveTimer !== null) {
		clearTimeout(saveTimer)
		saveTimer = null
	}
	await save({ quiet: true })
	if (index === 0) {
		status("already at the first cover")
		return
	}
	index -= 1
	status("stepped back — edit and save to replace")
	render()
}

async function release() {
	await save({ quiet: true })
	try {
		const result = await api(`/api/batches/${encodeURIComponent(batch.batchId)}/release`, { method: "POST" })
		batch.released = true
		status(`released at ${result.releasedAt}`)
		render()
	} catch (error) {
		status(`release refused: ${error.message}`)
	}
}

/**
 * Keys, with the textarea in mind.
 *
 * The field owns almost every keystroke — that is the point of the round — so the page binds only
 * what cannot be typed into prose: Enter to save and advance (Shift+Enter stays a newline), Escape
 * to leave the field, and the arrow keys to step. `r` releases ONLY when the field does not have
 * focus, because a reviewer typing "the ground is red" must not release the round on the first `r`.
 */
function onKey(event) {
	const inField = document.activeElement === nodes.answer
	const key = normalizeKey(event)
	if (inField && key === "Enter" && !event.shiftKey) {
		event.preventDefault()
		void next()
		return
	}
	if (inField && key === "Escape") {
		event.preventDefault()
		nodes.answer.blur()
		return
	}
	if (inField) return
	if (key === "Enter" || key === "ArrowRight") {
		event.preventDefault()
		void next()
		return
	}
	if (key === "ArrowLeft" || key === "Backspace") {
		event.preventDefault()
		void back()
		return
	}
	if (key === "r") {
		event.preventDefault()
		void release()
		return
	}
	if (key === "c") {
		event.preventDefault()
		nodes.answer.focus()
	}
}

async function start() {
	document.addEventListener("keydown", onKey)
	nodes.answer.addEventListener("input", scheduleSave)
	nodes.answer.addEventListener("blur", () => {
		if (saveTimer !== null) {
			clearTimeout(saveTimer)
			saveTimer = null
		}
		void save({ quiet: true })
	})
	// A reviewer who closes the tab mid-sentence should not lose it. Best-effort only: the browser
	// gives no guarantee here, which is why the debounce and the blur handler carry the real weight.
	globalThis.addEventListener("pagehide", () => {
		if (saveTimer !== null) void save({ quiet: true })
	})
	try {
		const queue = await api("/api/queue")
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		const rounds = queue.batches
			.filter((entry) => entry.kind === "oracle-validation")
			.sort((a, b) => (a.pushedAt < b.pushedAt ? -1 : 1))
		const chosen = rounds.find((entry) => entry.batchId === wanted) ?? rounds.filter((entry) => !entry.released).at(-1) ?? rounds.at(-1)
		if (chosen === undefined) {
			nodes.question.textContent = "no free-text round in the queue"
			status("push one to /api/oracle-validation")
			return
		}
		batch = await api(`/api/oracle-validation/${encodeURIComponent(chosen.batchId)}`)
		index = firstUnanswered()
		render()
		status(`${batch.batchId} — resuming at cover ${Math.min(index + 1, batch.items.length)}`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
