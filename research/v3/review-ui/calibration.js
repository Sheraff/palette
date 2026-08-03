/*
 * v3 calibration page — absolute grading (REVIEW_UI.md §5).
 *
 * One artwork, one palette, one grade. No A/B, no preference, no confound: those are statements
 * about a comparison, and there is no comparison here. The grade scale is the same one the pairwise
 * page uses, and the records land in the same warehouse with `mode: "absolute"` — that flag is the
 * only thing that separates them, which is exactly what makes drift measurable across the two.
 *
 * Periodic absolute grading of never-reviewed artworks, with previously graded ones mixed back in:
 * the repeats are what measure reviewer drift and noise. The page cannot tell a repeat from a fresh
 * artwork, and neither should the reviewer — that is the measurement.
 *
 * Same renderer as the pairwise page (`mock.js`), because a grade given against a different
 * rendering is a grade about a different thing.
 */

import { el, renderSide } from "./mock.js"
import { normalizeKey } from "./keys.js"

const GRADE_KEYS = { 1: "strong", 2: "acceptable", 3: "weak", 4: "unacceptable" }
/** Free text is written to the warehouse this long after the last keystroke, and on blur. */
const COMMENT_SAVE_DELAY_MS = 1200

const nodes = {
	batchLine: document.querySelector("#batch-line"),
	itemNav: document.querySelector("#item-nav"),
	item: document.querySelector("#item"),
	status: document.querySelector("#status"),
	prev: document.querySelector("#prev"),
	next: document.querySelector("#next"),
	release: document.querySelector("#release"),
	releaseNote: document.querySelector("#release-note"),
}

let batch = null
let index = 0
const drafts = new Map()
let commentTimer = null

function status(message) {
	nodes.status.textContent = message
}

function api(path, init) {
	return fetch(path, init).then(async (response) => {
		const body = await response.json().catch(() => ({}))
		if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
		return body
	})
}

function draftFor(item) {
	let draft = drafts.get(item.itemId)
	if (draft === undefined) {
		draft = { grade: item.verdict?.grade ?? null, comment: item.verdict?.comment ?? "" }
		drafts.set(item.itemId, draft)
	}
	return draft
}

function isJudged(item) {
	if (item.veto?.active) return true
	return Boolean(draftFor(item).grade)
}

async function save(item) {
	const draft = draftFor(item)
	if (!draft.grade) {
		status("not saved: an item needs a grade")
		return
	}
	if (batch.released) {
		status(`this round is released — second thoughts go through /amend?batch=${batch.batchId}`)
		return
	}
	try {
		const result = await api(
			`/api/calibration/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.itemId)}/verdict`,
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ grade: draft.grade, comment: draft.comment }),
			},
		)
		status(`saved ${item.itemId} — revision ${result.revision} at ${new Date(result.recordedAt).toLocaleTimeString()}`)
		renderNav()
	} catch (error) {
		status(`save failed: ${error.message}`)
	}
}

function flushComment() {
	if (commentTimer === null) return
	clearTimeout(commentTimer)
	commentTimer = null
	save(batch.items[index])
}

/* ---------- rendering ---------- */

function control(label, ...children) {
	return el("div", { class: "control" }, el("p", { class: "control-label", text: label }), ...children)
}

function renderInputs(item) {
	const draft = draftFor(item)
	const block = el("div", { class: "inputs" })

	const row = el("div", { class: "control-row" })
	batch.grades.forEach((grade, position) => {
		const button = el("button", {
			class: draft.grade === grade ? "selected" : "",
			text: `${position + 1} ${grade}`,
			attrs: { type: "button" },
		})
		button.addEventListener("click", () => {
			draft.grade = grade
			render()
			save(item)
		})
		row.append(button)
	})
	block.append(control("grade this palette", row))

	const comment = el("textarea", {
		attrs: { rows: "5", placeholder: "What do you see? This free text is the primary channel." },
	})
	comment.value = draft.comment
	comment.addEventListener("input", () => {
		draft.comment = comment.value
		if (commentTimer !== null) clearTimeout(commentTimer)
		commentTimer = setTimeout(() => {
			commentTimer = null
			save(item)
		}, COMMENT_SAVE_DELAY_MS)
	})
	comment.addEventListener("blur", flushComment)
	comment.addEventListener("keydown", (event) => {
		if (event.key === "Escape") comment.blur()
	})
	block.append(control("comment", comment))

	const vetoButton = el("button", {
		class: item.veto?.active ? "selected" : "",
		text: item.veto?.active ? "artwork vetoed — click to undo" : "veto this artwork",
		attrs: { type: "button" },
	})
	vetoButton.addEventListener("click", () => toggleVeto(item))
	block.append(
		control(
			"artwork veto",
			el(
				"div",
				{ class: "control-row" },
				vetoButton,
				el("span", {
					text: item.veto?.active
						? `reason: ${item.veto.reason}`
						: "removes this artwork from the corpus, not a palette judgement",
				}),
			),
		),
	)
	return block
}

function renderNav() {
	nodes.itemNav.replaceChildren()
	batch.items.forEach((item, position) => {
		const button = el("button", {
			class: `${position === index ? "selected" : ""} ${isJudged(item) ? "judged" : ""}`.trim(),
			text: `${position + 1}`,
			attrs: { type: "button", title: item.itemId },
		})
		button.addEventListener("click", () => {
			flushComment()
			index = position
			render()
		})
		nodes.itemNav.append(button)
	})
	const judged = batch.items.filter(isJudged).length
	nodes.batchLine.textContent =
		`round ${batch.batchId} · ${batch.purpose} · absolute · item ${index + 1} of ${batch.items.length} · ` +
		`${judged}/${batch.items.length} judged${batch.released ? " · RELEASED" : ""}`
}

function render() {
	const item = batch.items[index]
	renderNav()

	const main = el("div", { class: "item" })
	if (batch.released) {
		main.append(el("p", { class: "banner", text: `released ${batch.releasedAt} — this round is closed` }))
	}

	const artwork = el("div", { class: "artwork-block" })
	artwork.append(
		el("img", { attrs: { src: item.artwork.media, alt: `artwork ${item.itemId}` } }),
		el(
			"div",
			{ class: "artwork-meta" },
			el("p", { text: item.itemId }),
			el("p", { text: item.artwork.fileName }),
			// Dimensions come from the file header, never from the filename.
			el("p", {
				text:
					`${item.artwork.width}×${item.artwork.height} ${item.artwork.format} · ` +
					`${item.artwork.bytes} bytes · ${item.artwork.collection}`,
			}),
			el("p", { text: `sha256 ${item.artwork.sha256.slice(0, 16)}…` }),
		),
	)
	main.append(artwork)

	const sides = el("div", { class: "sides" })
	// No side letter: naming it "side A" would imply a side B that does not exist.
	sides.append(renderSide(item.artwork.media, null, item.side))
	main.append(sides)
	main.append(renderInputs(item))

	nodes.item.replaceChildren(main)
}

/* ---------- actions ---------- */

async function toggleVeto(item) {
	flushComment()
	const active = !(item.veto?.active ?? false)
	const reason = active ? (globalThis.prompt("Why is this artwork unfit for review?") ?? "") : ""
	if (active && reason.trim().length === 0) {
		status("veto cancelled — a veto needs a reason")
		return
	}
	try {
		await api(`/api/batches/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.itemId)}/veto`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ reason, active }),
		})
		await loadBatch(batch.batchId)
		status(active ? `vetoed ${item.itemId}` : `veto withdrawn for ${item.itemId}`)
	} catch (error) {
		status(`veto failed: ${error.message}`)
	}
}

async function release() {
	flushComment()
	if (!globalThis.confirm(`Release ${batch.batchId}? Items stay editable only until this point.`)) return
	try {
		const note = nodes.releaseNote?.value ?? ""
		const result = await api(`/api/batches/${encodeURIComponent(batch.batchId)}/release`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ note }),
		})
		await loadBatch(batch.batchId)
		const missing = result.itemsWithoutComment ?? []
		status(
			`released ${batch.batchId} at ${result.releasedAt}` +
				(missing.length > 0 ? ` · ${missing.length} item(s) carry no comment` : ""),
		)
	} catch (error) {
		status(`release refused: ${error.message}`)
	}
}

function move(step) {
	flushComment()
	index = Math.min(batch.items.length - 1, Math.max(0, index + step))
	render()
	globalThis.scrollTo({ top: 0 })
}

async function loadBatch(batchId) {
	batch = await api(`/api/calibration/${encodeURIComponent(batchId)}`)
	drafts.clear()
	index = Math.min(index, batch.items.length - 1)
	render()
}

function isTyping() {
	const active = document.activeElement
	return active !== null && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")
}

function onKey(event) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	if (isTyping()) return
	const item = batch?.items[index]
	if (item === undefined) return
	// One keymap for every page: the French (Mac AZERTY) digit row answers wherever a digit does.
	const key = normalizeKey(event.key)

	if (key === "ArrowLeft" || key === "k") {
		move(-1)
	} else if (key === "ArrowRight" || key === "j") {
		move(1)
	} else if (GRADE_KEYS[key]) {
		draftFor(item).grade = GRADE_KEYS[key]
		render()
		save(item)
	} else if (key === "c") {
		nodes.item.querySelector("textarea")?.focus()
	} else if (key === "v") {
		toggleVeto(item)
	} else {
		return
	}
	event.preventDefault()
}

async function start() {
	nodes.prev.addEventListener("click", () => move(-1))
	nodes.next.addEventListener("click", () => move(1))
	nodes.release.addEventListener("click", release)
	document.addEventListener("keydown", onKey)
	globalThis.addEventListener("beforeunload", flushComment)

	try {
		const queue = await api("/api/queue")
		const params = new URL(globalThis.location.href).searchParams
		const wanted = params.get("batch")
		const rounds = queue.batches.filter((entry) => entry.kind === "calibration")
		const chosen =
			rounds.find((entry) => entry.batchId === wanted) ?? rounds.find((entry) => !entry.released) ?? rounds.at(-1)
		if (chosen === undefined) {
			nodes.item.replaceChildren(el("p", { text: "no calibration round in the queue — push one to /api/calibration" }))
			status("no calibration round")
			return
		}
		await loadBatch(chosen.batchId)
		const wantedItem = batch.items.findIndex((entry) => entry.itemId === params.get("item"))
		if (wantedItem >= 0) {
			index = wantedItem
			render()
		}
		status(`${rounds.length} calibration round(s) in the queue`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
