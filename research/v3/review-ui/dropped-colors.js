/*
 * The dropped-colours page — `dropped-colors-1`.
 *
 * Twenty colours the reviewer endorsed, which invariant 2's population floor would still refuse to
 * publish even after the same-colour-bar fix of `reviews/toolbox-review/bias-audit.md` B1. For each
 * one this page shows the whole palette on its artwork, says which colour the rule would drop and
 * by how much it misses, and asks the one question `src/contract/BELONGS_STUDY.md` could not answer
 * from pixels: does this colour belong in this artwork's palette?
 *
 * **It renders the real mock player and does not own a renderer.** `REVIEW_UI.md` §3 makes the mock
 * the primary judging surface, and the mock is part of the output contract: a verdict is about the
 * exact rendering the reviewer judged, which only holds while there is exactly one renderer. So
 * this imports `mock.js` — the same module the pairwise, calibration and recheck pages import — and
 * adds nothing to it. The callout for the colour under question is built from `mock.js`'s own
 * exported `swatch()`, so even the highlight is the shared vocabulary rather than a second one.
 *
 * **Where the palettes come from.** The `oracle-validation` payload serves an item as image,
 * question and opaque token and nothing else, and that withholding is load-bearing for every other
 * round of this kind. Rather than widen it, the palettes travel in a side-car written beside this
 * file by `src/review-server/dropped-colors.ts` and joined on `questionKey`, the one item field the
 * payload does serve. There is nothing to blind here: the reviewer endorsed these palettes and is
 * being asked about them by name.
 *
 * Keyboard: **1** belongs · **2** does not belong · **3** I can't tell · **j** and **k** or the
 * arrows to move without answering · **u** undo one · **r** release. Digits come through `keys.js`, so the
 * AZERTY row answers too. No answer in this round binds `u`, so undo keeps its letter.
 */
import { el, renderSide, swatch } from "./mock.js"
import { normalizeKey } from "./keys.js"

const PAGE_DATA_URL = "/dropped-colors-1.data.json"

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
/** questionKey -> the side-car's entry for that item: palette, dropped colour, measurements. */
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
		// `oracle-map` and its two label classes are the ONLY styled shape for this list
		// (`styles.css`). Inventing a class here is what made the recheck round's footer render as
		// one unstyled run-on line, and the hotkeys stop reading as hotkeys when it happens.
		nodes.mapping.append(
			el(
				"li",
				{ class: answer.key === chosen ? "oracle-map is-selected" : "oracle-map" },
				el("b", { text: answer.hotkey }),
				el("span", { class: "oracle-map-label", text: answer.label }),
				el("span", { class: "oracle-map-gloss", text: answer.gloss }),
			),
		)
	}
}

/** Percentages small enough that two significant figures is the honest spelling. */
function showShare(fraction) {
	const percent = fraction * 100
	return percent < 0.01 ? percent.toPrecision(2) : percent.toFixed(3)
}

/**
 * The colour under question, and the working behind the drop line.
 *
 * The sentence above the mock is the claim; this is the arithmetic. Both come from the builder,
 * which re-derives them from the artwork's pixels through `src/contract/belongs-study.ts`, so
 * neither can drift from the rule being adjudicated.
 */
function renderCallout(page) {
	const measurements = page.measurements
	const list = el("ul", { class: "swatches" })

	list.append(
		swatch(
			`would be dropped — ${page.droppedRoles.join(" + ")}`,
			page.droppedHex,
			page.droppedName,
			`${showShare(measurements.neighbourhoodShare)}% of the artwork, floor ${showShare(measurements.populationFloor)}%`,
		),
	)

	if (measurements.nearestModeHex !== null) {
		list.append(
			swatch(
				"nearest artwork colour mode",
				measurements.nearestModeHex,
				measurements.nearestModeName ?? measurements.nearestModeHex,
				`${((measurements.nearestModeMass ?? 0) * 100).toFixed(1)}% of the artwork · ` +
					`${measurements.modeDistance.toFixed(3)} away in OKLab`,
			),
		)
	}

	const note = (text) => list.append(el("li", {}, el("span", {}), el("span", { class: "swatch-sub", text })))
	note(
		`population within the same-colour bar ${measurements.neighbourhoodShare.toExponential(2)} · ` +
			`as an exact 8-bit triple ${measurements.exactShare.toExponential(2)} · ` +
			`floor ${measurements.populationFloor}`,
	)
	note(
		`modes counted at radius ${measurements.modeRadius} with mass floor ` +
			`${measurements.modeMassFloor} — ${measurements.substantialModes} substantial modes in this artwork`,
	)
	note(`colour region — ${page.region}`)
	return list
}

function renderStage(item) {
	if (item === null) {
		nodes.stage.replaceChildren(
			el(
				"div",
				{ class: "oracle-done" },
				el("p", { text: "every colour answered" }),
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
	// heading, mock above, swatches under it. The same call the recheck and calibration pages make.
	const side = renderSide(item.media, null, page.side)
	const extras = el("div", { class: "side-body" })
	if (page.gradientNote !== null) extras.append(el("p", { class: "oracle-instruction", text: page.gradientNote }))
	extras.append(renderCallout(page))
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
		status("already at the first colour")
		return
	}
	index -= 1
	status("stepped back — answer again to replace")
	render()
}

/**
 * Move between colours WITHOUT answering.
 *
 * Auto-advance is right for a forty-item five-second pass; it is wrong on its own here, where
 * several items are different colours of the *same* artwork and seeing the neighbours is part of
 * judging whether one of them belongs. Movement records nothing and clears nothing.
 * `batch.items.length` is a valid position: it is the release screen.
 */
function move(delta) {
	const target = Math.min(Math.max(index + delta, 0), batch.items.length)
	if (target === index) {
		status(delta < 0 ? "already at the first colour" : "already at the last screen")
		return
	}
	index = target
	status(index < batch.items.length ? `colour ${index + 1} of ${batch.items.length}` : "all answered")
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
	// `normalizeKey(event.key.toLowerCase())`, never `normalizeKey(event)` — that exact typo made
	// the free-text page key-dead while crawling clean (PHASE_0_LOOSE_ENDS.md L-i).
	const key = normalizeKey(event.key.toLowerCase())
	const item = currentItem()
	const question = item === null ? null : questionOf(item)
	const chosen = question === null ? undefined : question.answers.find((entry) => entry.hotkey === key)

	if (chosen !== undefined) {
		event.preventDefault()
		answer(chosen.key)
		return
	}
	// Movement, which records nothing.
	if (key === "j" || event.key === "ArrowLeft") {
		event.preventDefault()
		move(-1)
		return
	}
	if (key === "k" || event.key === "ArrowRight") {
		event.preventDefault()
		move(1)
		return
	}
	// No answer in this round binds `u`, so undo keeps both of its keys.
	if (key === "u" || event.key === "Backspace") {
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
