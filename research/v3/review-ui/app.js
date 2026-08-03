/*
 * v3 review page.
 *
 * Vanilla JS, no build step, no dependencies. Everything the page knows comes from
 * /api/batches/<id>: the sides are already blinded and the gradient CSS is already rendered by the
 * server (the preview renderer is part of the output contract, so the browser pastes it and never
 * composes it). Styles are only ever set through CSSOM properties, never through a style attribute.
 *
 * The mock player lives in `mock.js` — three pages render it and it is part of the output contract,
 * so there is exactly one of it. The palette composer lives in `composer.js` and is optional per
 * item: closed until `e`, never required, never blocking. The keyboard's digit row is decoded by
 * `keys.js`, which is shared for the same reason the mock is: one mapping, or a mis-mapped key
 * silently records a judgement nobody made.
 */

import { el, renderSide } from "./mock.js"
import { createComposer } from "./composer.js"
import { normalizeKey } from "./keys.js"

const GRADE_LABELS = {
	strong: "strong",
	acceptable: "acceptable",
	weak: "weak",
	unacceptable: "unacceptable",
}
/** Preference values are the warehouse's, lowercase; only the labels are capitalized. */
const PREFERENCE_LABELS = { a: "A is better", b: "B is better", "no-preference": "no preference" }
const GRADE_KEYS_A = { 1: "strong", 2: "acceptable", 3: "weak", 4: "unacceptable" }
const GRADE_KEYS_B = { 6: "strong", 7: "acceptable", 8: "weak", 9: "unacceptable" }
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
/** Per-item working state, itemId → verdict fields. Saved to the server; never only local. */
const drafts = new Map()
let commentTimer = null
/** The composer for the item on screen, itemId → composer. Kept so its state survives navigation. */
const composers = new Map()

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

function batchPath(...parts) {
	return ["/api/batches", encodeURIComponent(batch.batchId), ...parts.map(encodeURIComponent)].join("/")
}

function draftFor(item) {
	let draft = drafts.get(item.itemId)
	if (draft === undefined) {
		draft = {
			gradeA: item.verdict?.gradeA ?? null,
			gradeB: item.verdict?.gradeB ?? null,
			preference: item.verdict?.preference ?? null,
			/** "prefilled" | "explicit" | null — how the preference on this draft got its value. */
			preferenceSource: item.verdict?.preferenceSource ?? null,
			comment: item.verdict?.comment ?? "",
			confound: item.verdict?.confound ?? false,
			confoundNote: item.verdict?.confoundNote ?? "",
		}
		drafts.set(item.itemId, draft)
	}
	return draft
}

/**
 * The preference the two grades already imply, filled in for the reviewer.
 *
 * Reviewer, 2026-08-03: "if I rate 'A strong' and then 'B weak' I should not have to rate 'A is
 * better' (this should autofill if individual ratings for A and B are not the same)". Two rules
 * follow, and the second matters as much as the first:
 *
 *  - **grades differ** → the better-graded side is prefilled. It stays a button like any other: the
 *    reviewer can override it, and a sidegrade preference is still theirs to state.
 *  - **grades are equal** → nothing is prefilled, and the item stays unjudged until a preference is
 *    chosen. Two strongs are not interchangeable (regrade agreement is ~88%, REVIEW_UI.md §2), so
 *    guessing here would invent an ordering constraint the reviewer never made — including
 *    "no preference", which is itself a statement and has to be pressed.
 *
 * An explicit choice is never overwritten by a later regrade: the reviewer said what they meant, and
 * a machine that quietly undoes it is worse than one that never helped. Which of the two happened is
 * recorded on the verdict (`preferenceSource`), so nothing downstream has to guess whether a
 * preference was pressed or inferred.
 */
function applyPrefill(draft) {
	if (draft.preferenceSource === "explicit") return
	if (draft.gradeA === null || draft.gradeB === null) return
	if (draft.gradeA === draft.gradeB) {
		// A prefill that is no longer implied is withdrawn, not left behind as a stale answer.
		if (draft.preferenceSource === "prefilled") {
			draft.preference = null
			draft.preferenceSource = null
		}
		return
	}
	// `batch.grades` is served best-first, so the lower index is the better grade.
	const rankA = batch.grades.indexOf(draft.gradeA)
	const rankB = batch.grades.indexOf(draft.gradeB)
	draft.preference = rankA < rankB ? "a" : "b"
	draft.preferenceSource = "prefilled"
}

/** Record a grade the reviewer just gave, and let the prefill rule run on the result. */
function setGrade(item, side, grade) {
	const draft = draftFor(item)
	draft[side] = grade
	applyPrefill(draft)
	render()
	save(item)
}

/** Record a preference the reviewer pressed. Pressed is explicit, by definition. */
function setPreference(item, value) {
	const draft = draftFor(item)
	draft.preference = value
	draft.preferenceSource = "explicit"
	render()
	save(item)
}

function isJudged(item) {
	const draft = draftFor(item)
	if (item.veto?.active) return true
	return Boolean(draft.gradeA && draft.gradeB && draft.preference)
}

async function save(item) {
	const draft = draftFor(item)
	if (!draft.gradeA || !draft.gradeB || !draft.preference) {
		status("not saved: an item needs a grade for A, a grade for B, and a preference")
		return
	}
	if (batch.released) {
		status(`this batch is released — second thoughts go through /amend?batch=${batch.batchId}`)
		return
	}
	try {
		const result = await api(batchPath("items", item.itemId, "verdict"), {
			method: "PUT",
			headers: { "content-type": "application/json" },
			// `preferenceSource` travels with the verdict: whether the reviewer pressed the preference or
			// accepted the one the grades implied is a property of this judgement, not of the session.
			body: JSON.stringify({ ...draft, preferenceSource: draft.preferenceSource ?? "explicit" }),
		})
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


function buttonRow(options, isSelected, onPick) {
	const row = el("div", { class: "control-row" })
	for (const [value, label] of options) {
		const button = el("button", { class: isSelected(value) ? "selected" : "", text: label, attrs: { type: "button" } })
		button.addEventListener("click", () => onPick(value))
		row.append(button)
	}
	return row
}

function control(label, ...children) {
	return el("div", { class: "control" }, el("p", { class: "control-label", text: label }), ...children)
}

function renderInputs(item) {
	const draft = draftFor(item)
	// The digit in each label is that button's keyboard shortcut: 1-4 for side A, 6-9 for side B.
	const gradesA = batch.grades.map((grade, position) => [grade, `${position + 1} ${GRADE_LABELS[grade]}`])
	const gradesB = batch.grades.map((grade, position) => [grade, `${position + 6} ${GRADE_LABELS[grade]}`])

	const block = el("div", { class: "inputs" })

	// Said on screen, next to the buttons, whenever the preference was not pressed: a prefilled answer
	// the reviewer never noticed is a preference they never gave.
	const prefillNote =
		draft.preferenceSource === "prefilled"
			? el("p", {
					class: "control-note",
					text: `prefilled from the grades — side ${draft.preference?.toUpperCase()} is graded higher. Click or press a / b / n to override.`,
				})
			: draft.gradeA !== null && draft.gradeA === draft.gradeB
				? el("p", { class: "control-note", text: "both sides are graded the same — choose, or say no preference (n)." })
				: null

	block.append(
		control("grade side A", buttonRow(gradesA, (value) => draft.gradeA === value, (value) => setGrade(item, "gradeA", value))),
		control("grade side B", buttonRow(gradesB, (value) => draft.gradeB === value, (value) => setGrade(item, "gradeB", value))),
		control(
			"preference",
			buttonRow(
				batch.preferences.map((value) => [value, PREFERENCE_LABELS[value] ?? value]),
				(value) => draft.preference === value,
				(value) => setPreference(item, value),
			),
			prefillNote,
		),
	)

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

	const checkbox = el("input", { attrs: { type: "checkbox", id: "confound" } })
	checkbox.checked = draft.confound
	const note = el("input", { attrs: { type: "text", placeholder: "which unrelated defect?" } })
	note.value = draft.confoundNote
	note.addEventListener("input", () => {
		draft.confoundNote = note.value
		if (commentTimer !== null) clearTimeout(commentTimer)
		commentTimer = setTimeout(() => {
			commentTimer = null
			save(item)
		}, COMMENT_SAVE_DELAY_MS)
	})
	note.addEventListener("blur", flushComment)
	checkbox.addEventListener("change", () => {
		draft.confound = checkbox.checked
		// The server refuses a confound flag without a note, so ask for it right away.
		if (draft.confound && draft.confoundNote.trim().length === 0) {
			status("say which unrelated defect, then it saves")
			note.focus()
			return
		}
		save(item)
	})
	const confoundRow = el(
		"div",
		{ class: "confound" },
		checkbox,
		el("label", { text: "I am only choosing this side because the other has an unrelated defect", attrs: { for: "confound" } }),
	)
	block.append(control("confound", confoundRow, note))

	const vetoButton = el("button", {
		class: item.veto?.active ? "selected" : "",
		text: item.veto?.active ? "artwork vetoed — click to undo" : "veto this artwork",
		attrs: { type: "button" },
	})
	vetoButton.addEventListener("click", () => toggleVeto(item))
	block.append(control("artwork veto", el("div", { class: "control-row" }, vetoButton, el("span", {
		text: item.veto?.active ? `reason: ${item.veto.reason}` : "removes this artwork from the corpus, not a palette judgement",
	}))))

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
		`batch ${batch.batchId} · ${batch.purpose} · item ${index + 1} of ${batch.items.length} · ` +
		`${judged}/${batch.items.length} judged${batch.released ? " · RELEASED" : ""}`
}

function render() {
	const item = batch.items[index]
	renderNav()

	const main = el("div", { class: "item" })
	if (batch.released) {
		main.append(el("p", { class: "banner", text: `released ${batch.releasedAt} — this batch is closed` }))
	}
	if (item.identical) {
		main.append(el("p", { class: "banner", text: "both sides render identically — this is not a comparison" }))
	}

	const artwork = el("div", { class: "artwork-block" })
	const image = el("img", { attrs: { src: item.artwork.media, alt: `artwork ${item.itemId}` } })
	artwork.append(
		image,
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
	sides.append(renderSide(item.artwork.media, "A", item.sides.A), renderSide(item.artwork.media, "B", item.sides.B))
	main.append(sides)
	main.append(renderInputs(item))
	main.append(composerFor(item).node)

	nodes.item.replaceChildren(main)
}

/**
 * The composer for one item, built once and kept.
 *
 * Kept rather than rebuilt because a half-assembled palette is work: walking to the next item and
 * back must not throw it away. It is closed until `e`, and it never blocks anything.
 */
function composerFor(item) {
	let composer = composers.get(item.itemId)
	if (composer === undefined) {
		composer = createComposer({
			batchId: batch.batchId,
			item,
			artworkSrc: item.artwork.media,
			api,
			status,
			onSubmitted: () => loadBatch(batch.batchId),
		})
		composers.set(item.itemId, composer)
		composer.render()
	} else {
		composer.setItem(item)
	}
	return composer
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
		await api(batchPath("items", item.itemId, "veto"), {
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
		// The batch-level note: what this batch was for, in the reviewer's own words, on the record that
		// closes it. Optional, like every other free-text channel here.
		const note = nodes.releaseNote?.value ?? ""
		const result = await api(batchPath("release"), {
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
	batch = await api(`/api/batches/${encodeURIComponent(batchId)}`)
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

	// The composer owns the keyboard while it is open: its digits address the swatch grid, not the
	// grade scale. That is why it is opened deliberately, with one key, and says so on screen.
	if (composerFor(item).onKey(key)) {
		event.preventDefault()
		return
	}

	if (key === "ArrowLeft" || key === "k") {
		move(-1)
	} else if (key === "ArrowRight" || key === "j") {
		move(1)
	} else if (GRADE_KEYS_A[key]) {
		setGrade(item, "gradeA", GRADE_KEYS_A[key])
	} else if (GRADE_KEYS_B[key]) {
		setGrade(item, "gradeB", GRADE_KEYS_B[key])
	} else if (key === "a" || key === "b" || key === "n") {
		setPreference(item, key === "n" ? "no-preference" : key)
	} else if (key === "c") {
		nodes.item.querySelector("textarea")?.focus()
	} else if (key === "x") {
		nodes.item.querySelector("input[type=checkbox]")?.click()
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
		const chosen =
			queue.batches.find((entry) => entry.batchId === wanted) ??
			queue.batches.find((entry) => !entry.released) ??
			queue.batches.at(-1)
		if (chosen === undefined) {
			nodes.item.replaceChildren(el("p", { text: "the queue is empty — push a batch to /api/batches" }))
			status("empty queue")
			return
		}
		await loadBatch(chosen.batchId)
		// ?item=<itemId> opens straight on one item, so a link can point at a specific comparison.
		const wantedItem = batch.items.findIndex((entry) => entry.itemId === params.get("item"))
		if (wantedItem >= 0) {
			index = wantedItem
			render()
		}
		status(`${queue.batches.length} batch(es) in the queue`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
