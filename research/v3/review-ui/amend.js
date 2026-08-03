/*
 * "Amend a previous batch" — post-release second thoughts (REVIEW_UI.md §1, §2).
 *
 * Before release, every item is freely editable with zero ceremony. This page is the other side of
 * that line: the batch is closed, the release record has already triggered the orchestrator, and a
 * correction is now an `amendment` record pointing at the original verdict. The latest amendment
 * wins at query time, and every downstream decision records the verdict ids that funded it — so a
 * standing gate query flags whatever this page invalidates instead of the orchestrator having to
 * wait for the reviewer to be sure.
 *
 * Read-only by default, one edit action per item. Amendments deliberately carry ceremony the live
 * form does not: a reason is required, because "I changed my mind" about released evidence is itself
 * evidence, and a bare grade flip six weeks later is unreadable.
 *
 * What may change is the warehouse's business (`AMENDABLE_FIELDS`), not this page's: judgement
 * fields only. The artwork, the palettes shown and the fingerprints are frozen — a verdict is always
 * about the exact palettes shown.
 */

import { el, renderSide } from "./mock.js"
import { normalizeKey } from "./keys.js"

const GRADE_KEYS_A = { 1: "strong", 2: "acceptable", 3: "weak", 4: "unacceptable" }
const GRADE_KEYS_B = { 6: "strong", 7: "acceptable", 8: "weak", 9: "unacceptable" }
const PREFERENCE_LABELS = { a: "A is better", b: "B is better", "no-preference": "no preference" }

const nodes = {
	batchLine: document.querySelector("#batch-line"),
	batchNav: document.querySelector("#batch-nav"),
	items: document.querySelector("#items"),
	status: document.querySelector("#status"),
}

let released = []
let batch = null
/** null when nothing is being edited; otherwise `{itemId, patch, reason}`. */
let editing = null
let index = 0

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

function isAbsolute() {
	return batch?.mode === "absolute"
}

function fact(label, value) {
	return el("div", { class: "adj-fact" }, el("span", { class: "adj-fact-label", text: label }), el("span", { text: value }))
}

function verdictFacts(item) {
	const verdict = item.verdict
	if (verdict === null) return [fact("verdict", "none — this item was vetoed or never judged")]
	const facts = isAbsolute()
		? [fact("grade", verdict.grade)]
		: [fact("grade A", verdict.gradeA), fact("grade B", verdict.gradeB), fact("preference", verdict.preference)]
	facts.push(fact("comment", verdict.comment || "—"))
	if (!isAbsolute()) {
		facts.push(fact("confound", verdict.confound ? `yes — ${verdict.confoundNote}` : "no"))
	}
	facts.push(fact("recorded", `${verdict.recordedAt} · revision ${verdict.revision}`))
	if (verdict.amendmentCount > 0) {
		facts.push(fact("amended", `${verdict.amendmentCount}× · last ${verdict.amendedAt}`))
	}
	if (verdict.retracted) facts.push(fact("retracted", "this verdict has been withdrawn and funds nothing"))
	return facts
}

/** The editor: the same vocabulary as the live form, plus the reason an amendment needs. */
function renderEditor(item) {
	const patch = editing.patch
	const block = el("div", { class: "inputs" })

	const gradeRow = (field, keyBase) => {
		const row = el("div", { class: "control-row" })
		for (const [position, grade] of ["strong", "acceptable", "weak", "unacceptable"].entries()) {
			const current = patch[field] ?? (isAbsolute() ? item.verdict.grade : item.verdict[field])
			// Marked in the text as well as by inversion: what is on screen has to say what the record
			// will say, and an amendment is read back long after it was made.
			const button = el("button", {
				class: current === grade ? "selected" : "",
				text: `${current === grade ? "▸ " : ""}${position + keyBase} ${grade}`,
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => {
				patch[field] = grade
				render()
			})
			row.append(button)
		}
		return row
	}

	if (isAbsolute()) {
		block.append(el("p", { class: "control-label", text: "grade" }), gradeRow("gradeA", 1))
	} else {
		block.append(
			el("p", { class: "control-label", text: "grade side A" }),
			gradeRow("gradeA", 1),
			el("p", { class: "control-label", text: "grade side B" }),
			gradeRow("gradeB", 6),
		)
		const preferenceRow = el("div", { class: "control-row" })
		for (const value of ["a", "b", "no-preference"]) {
			const current = patch.preference ?? item.verdict.preference
			const button = el("button", {
				class: current === value ? "selected" : "",
				text: `${current === value ? "▸ " : ""}${PREFERENCE_LABELS[value]}`,
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => {
				patch.preference = value
				render()
			})
			preferenceRow.append(button)
		}
		block.append(el("p", { class: "control-label", text: "preference" }), preferenceRow)
	}

	const comment = el("textarea", { attrs: { rows: "4" } })
	comment.value = patch.comment ?? item.verdict.comment
	comment.addEventListener("input", () => {
		patch.comment = comment.value
	})
	block.append(el("p", { class: "control-label", text: "comment" }), comment)

	const reason = el("input", { attrs: { type: "text", placeholder: "why are you changing this? (required)" } })
	reason.value = editing.reason
	reason.addEventListener("input", () => {
		editing.reason = reason.value
	})
	block.append(el("p", { class: "control-label", text: "reason for the amendment" }), reason)

	const save = el("button", { text: "save the amendment (s)", attrs: { type: "button" } })
	save.addEventListener("click", () => submit(item))
	const retract = el("button", { text: "retract this verdict (x)", attrs: { type: "button" } })
	retract.addEventListener("click", () => submit(item, true))
	const cancel = el("button", { text: "cancel (Esc)", attrs: { type: "button" } })
	cancel.addEventListener("click", () => {
		editing = null
		render()
	})
	block.append(el("div", { class: "control-row" }, save, retract, cancel))
	return block
}

function renderItem(item, position) {
	const head = el("h3", { class: "adj-item-head", text: `${position + 1}. ${item.itemId} · ${item.artwork.fileName}` })
	const body = el("div", { class: "amend-item-body" })

	// The palettes exactly as they were judged, from the one shared renderer. Amending a grade without
	// seeing what it was about is guessing.
	const sides = el("div", { class: "sides" })
	if (isAbsolute()) sides.append(renderSide(item.artwork.media, null, item.side))
	else sides.append(renderSide(item.artwork.media, "A", item.sides.A), renderSide(item.artwork.media, "B", item.sides.B))

	const facts = el("div", { class: "adj-facts" }, ...verdictFacts(item))
	if (item.veto?.active) facts.append(fact("veto", `active — ${item.veto.reason}`))
	for (const endorsement of item.endorsements ?? []) {
		facts.append(
			fact(
				"endorsed sample",
				`${endorsement.paletteHash.slice(0, 12)}…${endorsement.retracted ? " (withdrawn)" : ""}`,
			),
		)
	}

	if (editing !== null && editing.itemId === item.itemId) {
		body.append(sides, facts, renderEditor(item))
	} else {
		const edit = el("button", { text: "edit this verdict", attrs: { type: "button" } })
		edit.addEventListener("click", () => {
			index = position
			startEditing(item)
		})
		body.append(sides, facts, el("div", { class: "control-row" }, edit))
	}

	return el("article", { class: `adj-item amend-item${position === index ? " adj-current" : ""}` }, head, body)
}

function render() {
	nodes.batchNav.replaceChildren()
	for (const entry of released) {
		const button = el("button", {
			class: batch !== null && entry.batchId === batch.batchId ? "selected" : "",
			text: `${entry.batchId} (${entry.kind})`,
			attrs: { type: "button" },
		})
		button.addEventListener("click", () => loadBatch(entry.batchId))
		nodes.batchNav.append(button)
	}

	if (batch === null) {
		nodes.batchLine.textContent = "no released batch to amend yet"
		nodes.items.replaceChildren(el("p", { text: "nothing has been released — there is nothing to amend." }))
		return
	}

	nodes.batchLine.textContent =
		`batch ${batch.batchId} · ${batch.purpose} · ${isAbsolute() ? "absolute" : "pairwise"} · ` +
		`released ${batch.releasedAt} · ${batch.items.length} items` +
		(batch.releaseNote ? ` · note: ${batch.releaseNote}` : "")
	nodes.items.replaceChildren(...batch.items.map((item, position) => renderItem(item, position)))
}

/* ---------- actions ---------- */

function startEditing(item) {
	if (item.verdict === null) {
		status(`${item.itemId} carries no verdict to amend`)
		return
	}
	editing = { itemId: item.itemId, patch: {}, reason: "" }
	status(`editing ${item.itemId} — a reason is required, then save`)
	render()
}

async function submit(item, retract = false) {
	if (editing === null) return
	if (editing.reason.trim().length === 0) {
		status("an amendment needs a reason — say what changed your mind")
		return
	}
	const patch = retract ? {} : editing.patch
	if (!retract && Object.keys(patch).length === 0) {
		status("nothing changed — edit a grade, the preference or the comment first")
		return
	}
	try {
		const result = await api(
			`/api/batches/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.itemId)}/amend`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ target: "verdict", patch, retract, reason: editing.reason }),
			},
		)
		editing = null
		await loadBatch(batch.batchId)
		status(
			retract
				? `retracted the verdict on ${item.itemId} — amendment ${result.recordId}, nothing deleted`
				: `amended ${item.itemId} — amendment ${result.recordId} now wins over ${result.targetId}`,
		)
	} catch (error) {
		status(`not amended: ${error.message}`)
	}
}

async function loadBatch(batchId) {
	const entry = released.find((candidate) => candidate.batchId === batchId)
	if (entry === undefined) return
	batch = await api(
		entry.kind === "calibration"
			? `/api/calibration/${encodeURIComponent(batchId)}`
			: `/api/batches/${encodeURIComponent(batchId)}`,
	)
	batch.mode = entry.kind === "calibration" ? "absolute" : "pairwise"
	editing = null
	index = 0
	render()
	status(`${batchId} — released ${batch.releasedAt}, read-only until you edit an item`)
}

function isTyping() {
	const active = document.activeElement
	return active !== null && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")
}

function onKey(event) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	if (isTyping() && event.key !== "Escape") return
	if (batch === null) return
	const item = batch.items[index]
	// One keymap for every page: the French (Mac AZERTY) digit row answers wherever a digit does.
	const key = normalizeKey(event.key)

	if (editing !== null && editing.itemId === item?.itemId) {
		const patch = editing.patch
		if (key === "Escape") {
			editing = null
			render()
		} else if (GRADE_KEYS_A[key]) {
			patch.gradeA = GRADE_KEYS_A[key]
			render()
		} else if (!isAbsolute() && GRADE_KEYS_B[key]) {
			patch.gradeB = GRADE_KEYS_B[key]
			render()
		} else if (!isAbsolute() && (key === "a" || key === "b" || key === "n")) {
			patch.preference = key === "n" ? "no-preference" : key
			render()
		} else if (key === "s") {
			submit(item)
		} else if (key === "x") {
			submit(item, true)
		} else return
		event.preventDefault()
		return
	}

	if (key === "j" || key === "ArrowDown") {
		index = Math.min(batch.items.length - 1, index + 1)
		render()
	} else if (key === "k" || key === "ArrowUp") {
		index = Math.max(0, index - 1)
		render()
	} else if (key === "e") {
		startEditing(item)
	} else return
	event.preventDefault()
}

async function start() {
	document.addEventListener("keydown", onKey)
	try {
		const queue = await api("/api/queue")
		// Only the modes that produce verdicts: a bracketing or oracle round is answered, not graded,
		// and its records are not what AMENDABLE_FIELDS' verdict row is about.
		released = queue.batches
			.filter((entry) => entry.released && (entry.kind === "pairwise" || entry.kind === "calibration"))
			.sort((first, second) => (first.releasedAt < second.releasedAt ? -1 : 1))
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		const chosen = released.find((entry) => entry.batchId === wanted) ?? released.at(-1)
		if (chosen === undefined) {
			render()
			status("no released batch yet")
			return
		}
		await loadBatch(chosen.batchId)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
