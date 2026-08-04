/*
 * The endorsement-recheck page — `endorsement-recheck-1`.
 *
 * Two palettes the reviewer endorsed now fail the contract after the metric ruling of 2026-08-04
 * (`d-2026-08-04-reviewer-metric-follows-the-pair`). PHASE_0_DECISIONS.md §4's meta-rule is that an
 * invariant which blocks an endorsed palette is demoted — the reviewer outranks the rule — so this
 * page asks them which way it goes, one palette at a time.
 *
 * **It renders the real mock player and does not own a renderer.** `REVIEW_UI.md` §3 makes the mock
 * the primary judging surface, and the mock is part of the output contract: a verdict is about the
 * exact rendering the reviewer judged, which only holds while there is exactly one renderer. So this
 * imports `mock.js` — the same module the pairwise page, the calibration page and the composer's
 * preview import — and adds nothing to it. A palette drawn any other way would be a surface no
 * verdict has ever been scoped to, which is the one thing this round cannot afford: it is
 * adjudicating a contract rule.
 *
 * **Where the palettes come from.** The `oracle-validation` payload deliberately serves an item as
 * image, question and opaque token, and nothing else — that withholding is load-bearing for every
 * other round of this kind. Rather than widen it for this one round, the palettes travel in a
 * side-car written beside this file by `src/review-server/endorsement-recheck.ts` and joined on
 * `questionKey`, the one item field the payload does serve. There is nothing to blind here anyway:
 * the reviewer endorsed these two palettes and is being asked about them by name.
 *
 * Keyboard: **1** keep the endorsement · **2** the rule is right · **3** I can't tell · **u** undo
 * one · **r** release. Digits come through `keys.js`, so the AZERTY row answers too. `u` is undo and
 * stays undo: no answer in this round binds it.
 */
import { el, renderSide } from "./mock.js"
import { normalizeKey } from "./keys.js"

const PAGE_DATA_URL = "/endorsement-recheck-1.data.json"

const nodes = {
	preamble: document.querySelector("#preamble"),
	framing: document.querySelector("#framing"),
	question: document.querySelector("#question"),
	instruction: document.querySelector("#instruction"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#stage"),
	mapping: document.querySelector("#mapping"),
	status: document.querySelector("#status"),
}

let batch = null
/** questionKey -> the side-car's entry for that item: palette, measurements, notes. */
let pageItems = new Map()
let index = 0
let busy = false

function status(message) {
	nodes.status.textContent = message
}

async function api(path, init) {
	const response = await fetch(path, init)
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
	return body
}

function questionOf(item) {
	return batch.questions.find((entry) => entry.key === item.questionKey) ?? null
}

function currentItem() {
	return index < batch.items.length ? batch.items[index] : null
}

/** The first item with no answer yet — how "resumable anywhere" is implemented. */
function firstUnanswered() {
	const at = batch.items.findIndex((item) => item.answer === null)
	return at < 0 ? batch.items.length : at
}

function renderMapping(question, chosen) {
	nodes.mapping.replaceChildren()
	if (question === null) return
	for (const answer of question.answers) {
		const row = el(
			"li",
			{ class: answer.key === chosen ? "oracle-answer oracle-answer-chosen" : "oracle-answer" },
			el("b", { text: answer.hotkey }),
			el("span", { class: "oracle-answer-label", text: answer.label }),
			el("span", { class: "oracle-answer-gloss", text: answer.gloss }),
		)
		nodes.mapping.append(row)
	}
}

/**
 * The arithmetic behind the failure line, under the mock.
 *
 * The sentence above the mock is the claim; this is the working. Both come from the builder, which
 * derives them from the contract's own constants and colour code, so neither can drift from the gate
 * being adjudicated.
 */
function renderMeasurements(page) {
	const list = el("ul", { class: "swatches" })
	for (const pair of page.measurements) {
		list.append(
			el(
				"li",
				{},
				el("span", {}),
				el("span", {
					class: "swatch-sub",
					text:
						`${pair.from} vs ${pair.to} — OKLab distance ${pair.distance.toFixed(4)} · ` +
						`raw APCA ${pair.rawApca.toFixed(2)} · Lc ${pair.lc.toFixed(1)} · ` +
						`same-colour bar ${pair.sameColorBar.toFixed(4)}`,
				}),
			),
		)
	}
	for (const [name, value] of Object.entries(page.floors)) {
		list.append(el("li", {}, el("span", {}), el("span", { class: "swatch-sub", text: `${name} = ${value}` })))
	}
	list.append(
		el("li", {}, el("span", {}), el("span", { class: "swatch-sub", text: `violation code — ${page.violationCode}` })),
	)
	return list
}

function renderStage(item) {
	if (item === null) {
		nodes.stage.replaceChildren(
			el(
				"div",
				{ class: "oracle-done" },
				el("p", { text: "both palettes answered" }),
				el("p", { text: batch.released ? "this round is released — thank you" : "press r to release the round" }),
			),
		)
		return
	}
	const page = pageItems.get(item.questionKey)
	if (page === undefined) {
		// Loud rather than a blank frame: a missing side-car entry means the reviewer would be asked
		// to judge a palette the page cannot draw, which is worse than an error message.
		nodes.stage.replaceChildren(el("p", { text: `no palette data for ${item.questionKey} — do not answer` }))
		return
	}
	// `renderSide(artworkSrc, name, side)` with a null name is the single-sided mock: no "side A"
	// heading, mock above, swatches under it. The same call the calibration page makes.
	const side = renderSide(item.media, null, page.side)
	const extras = el("div", { class: "side-body" })
	if (page.gradientNote !== null) extras.append(el("p", { class: "oracle-instruction", text: page.gradientNote }))
	extras.append(renderMeasurements(page))
	nodes.stage.replaceChildren(el("div", { class: "sides" }, side, extras))
}

function render() {
	const item = currentItem()
	const question = item === null ? null : questionOf(item)
	nodes.preamble.textContent = question?.preamble ?? ""
	nodes.framing.textContent = question?.framing ?? ""
	nodes.question.textContent = question?.question ?? "done"
	nodes.instruction.textContent = question?.instruction ?? ""
	const answered = batch.items.filter((entry) => entry.answer !== null).length
	nodes.progress.textContent = `${answered} of ${batch.items.length} answered${batch.released ? " · released" : ""}`
	renderMapping(question, item?.answer ?? undefined)
	renderStage(item)
}

async function answer(value) {
	if (busy || index >= batch.items.length) return
	const item = batch.items[index]
	busy = true
	try {
		// The token is all the page ever knows an item by; the server resolves it to the real item.
		await api(
			`/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.token)}/answer`,
			{ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: value }) },
		)
		item.answer = value
		status(`recorded ${value}`)
		index += 1
		render()
	} catch (error) {
		status(`not recorded: ${error.message}`)
	} finally {
		busy = false
	}
}

/**
 * Undo is one key and it deletes nothing: it steps back so the item can be answered again, and the
 * new answer supersedes the old one at query time. The log stays append-only.
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

	if (chosen !== undefined) {
		event.preventDefault()
		answer(chosen.key)
		return
	}
	// No answer in this round binds `u`, so undo keeps all three of its keys.
	if (key === "u" || event.key === "Backspace" || event.key === "ArrowLeft") {
		event.preventDefault()
		undo()
		return
	}
	if (key === "r") {
		event.preventDefault()
		release()
	}
}

async function start() {
	document.addEventListener("keydown", onKey)
	try {
		const requested = new URL(globalThis.location.href).searchParams.get("batch")
		const [queue, pageData] = await Promise.all([api("/api/queue"), api(PAGE_DATA_URL)])
		const rounds = queue.batches.filter((entry) => entry.kind === "oracle-validation")
		const wanted =
			requested === null
				? (rounds.find((entry) => entry.batchId === pageData.batchId) ?? null)
				: (rounds.find((entry) => entry.batchId === requested) ?? null)
		if (wanted === null) {
			status(`round ${requested ?? pageData.batchId} is not in the queue`)
			nodes.question.textContent = "no round to review"
			return
		}
		pageItems = new Map(pageData.items.map((entry) => [entry.questionKey, entry]))
		batch = await api(`/api/oracle-validation/${encodeURIComponent(wanted.batchId)}`)
		index = firstUnanswered()
		status(batch.released ? "released — answers are amended through the warehouse" : "ready")
		render()
	} catch (error) {
		status(`could not load: ${error.message}`)
		nodes.question.textContent = "could not load"
	}
}

await start()
