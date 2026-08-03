/*
 * v3 review page.
 *
 * Vanilla JS, no build step, no dependencies. Everything the page knows comes from
 * /api/batches/<id>: the sides are already blinded and the gradient CSS is already rendered by the
 * server (the preview renderer is part of the output contract, so the browser pastes it and never
 * composes it). Styles are only ever set through CSSOM properties, never through a style attribute.
 */

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
}

let batch = null
let index = 0
/** Per-item working state, itemId → verdict fields. Saved to the server; never only local. */
const drafts = new Map()
let commentTimer = null

function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class) node.className = options.class
	if (options.text !== undefined) node.textContent = String(options.text)
	for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value)
	node.append(...children.filter((child) => child !== null && child !== undefined))
	return node
}

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
			comment: item.verdict?.comment ?? "",
			confound: item.verdict?.confound ?? false,
			confoundNote: item.verdict?.confoundNote ?? "",
		}
		drafts.set(item.itemId, draft)
	}
	return draft
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
		status("this batch is released — editing it needs an amendment record (not built yet)")
		return
	}
	try {
		const result = await api(batchPath("items", item.itemId, "verdict"), {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(draft),
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

/**
 * The mock player — the primary judging surface (REVIEW_UI.md §3).
 *
 * Layout revision 2, 2026-08-03, from the reviewer's own report on revision 1. Their four findings,
 * and what each one changed:
 *
 *  1. "the artwork takes too much space, i can barely see the background/gradient i'm supposed to
 *     review" — the artwork is now a small thumbnail. It is context; the palette is the subject, so
 *     the field has to dominate the frame.
 *  2. "all the content is at the bottom, so in case of a gradient, almost nothing is on top of the
 *     background color" — content is spread across the mock's full height in three regions, so BOTH
 *     ends of a gradient carry something. Foreground text sits directly on the field at the top of
 *     the ramp, not only on the surface card near the bottom.
 *  3. "the accent color is only used on top of a surface colored area, so i won't be able to see it
 *     in other contexts" — accent now appears in four places: on the field at the top, on the field
 *     at the bottom, on the surface card, and as a fill on a background-coloured rail. Those are the
 *     relationships the contract's accent floors are checked against (background, surface, stops),
 *     so the reviewer can see each of them.
 *  4. swatches moved below the mock — see `renderSide`.
 *
 * Unchanged and not negotiable: the artwork is borderless on the field, there are no shadows
 * anywhere, and the gradient is the pinned preview renderer's output pasted verbatim
 * (`side.fieldCss`) — the [REVIEWED] display mapping is never recomputed here.
 */
function renderMock(item, side) {
	const roles = Object.fromEntries(side.roles.map((role) => [role.role, role.hex]))
	const mock = el("div", { class: "mock" })
	mock.style.background = side.fieldCss

	const accentIcon = (shape) => {
		const icon = el("span", { class: `icon ${shape}`, attrs: { "aria-hidden": "true" } })
		icon.style.background = roles.accent
		return icon
	}
	/** A progress rail: accent on a background-coloured track. Accent against background, directly. */
	const rail = () => {
		const track = el("div", { class: "mock-track" })
		track.style.background = roles.background
		const fill = el("div", { class: "mock-track-fill" })
		fill.style.background = roles.accent
		track.append(fill)
		return track
	}

	// --- top: foreground text and accent icons, both directly on the field, at the gradient's
	// background end. This is the region revision 1 had nothing in.
	const top = el("div", { class: "mock-top" })
	top.style.color = roles.foreground
	const heading = el("div", { class: "mock-field-text" })
	heading.append(el("p", { class: "mock-title", text: "Album title" }), el("p", { text: "Artist name" }))
	const topIcons = el("div", { class: "mock-icons" })
	topIcons.append(accentIcon("icon-prev"), accentIcon("icon-dot"))
	top.append(heading, topIcons)

	// --- middle: the artwork, small and borderless, beside the surface card.
	const middle = el("div", { class: "mock-middle" })
	const art = el("img", {
		class: "mock-art",
		attrs: { src: item.artwork.media, alt: "album artwork", loading: "lazy", decoding: "async" },
	})
	const card = el("div", { class: "mock-card" })
	card.style.background = roles.surface
	card.style.color = roles.foreground
	const cardIcons = el("div", { class: "mock-icons" })
	cardIcons.append(accentIcon("icon-play"), accentIcon("icon-bars"))
	const rowText = el("div", { class: "mock-row-text" })
	rowText.append(el("b", { text: "Track title" }), el("span", { text: "2:41 / 3:58" }))
	card.append(el("div", { class: "mock-row" }, cardIcons, rowText), rail())
	middle.append(art, card)

	// --- bottom: accent on the field again, at the gradient's far end, plus foreground text on the
	// field and one more accent-on-background rail.
	const bottom = el("div", { class: "mock-bottom" })
	bottom.style.color = roles.foreground
	const transport = el("div", { class: "mock-icons" })
	transport.append(accentIcon("icon-prev"), accentIcon("icon-play"), accentIcon("icon-next"))
	bottom.append(transport, el("span", { class: "mock-caption", text: "Up next · Another track" }), rail())

	mock.append(top, middle, bottom)
	return mock
}

function swatch(label, hex, name, extra) {
	const chip = el("span", { class: "chip", attrs: { "aria-hidden": "true" } })
	chip.style.background = hex
	// Children go through el(), which drops nullish ones — append() would stringify them to "null".
	const text = el(
		"span",
		{ class: "swatch-text" },
		el("span", { class: "swatch-role", text: label }),
		el("span", { text: `${name} — ${hex}` }),
		extra ? el("span", { text: extra }) : null,
	)
	return el("li", {}, chip, text)
}

function renderSwatches(side) {
	const list = el("ul", { class: "swatches" })
	for (const role of side.roles) {
		list.append(swatch(role.role, role.hex, role.name, role.collapsed ? "collapsed" : null))
	}
	if (side.gradient === null) {
		list.append(el("li", {}, el("span", {}), el("span", { class: "swatch-sub", text: "flat field" })))
		return list
	}
	const header = el("li", {}, el("span", {}), el("span", {
		class: "swatch-sub",
		text: `gradient — ${side.gradient.stops.length} stops`,
	}))
	list.append(header)
	for (const [position, stop] of side.gradient.stops.entries()) {
		list.append(
			swatch(
				`stop ${position + 1}`,
				stop.hex,
				stop.name,
				`published ${stop.publishedPosition} · shown at ${(stop.displayPosition * 100).toFixed(1)}%`,
			),
		)
	}
	return list
}

function renderSide(item, name, side) {
	const panel = el("section", { class: "side", attrs: { "aria-label": `side ${name}` } })
	panel.append(el("h2", { text: `side ${name}` }))
	// Swatches below the mock, not beside it: the reviewer's fourth finding — "the swatches ... take
	// too much space, put it below the mock ui ... (the swatches have only secondary importance to
	// the mock UI)". They stay an identity check, never the judging surface (REVIEW_UI.md §3).
	panel.append(el("div", { class: "side-body" }, renderMock(item, side), renderSwatches(side)))
	return panel
}

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

	block.append(
		control(
			"grade side A",
			buttonRow(gradesA, (value) => draft.gradeA === value, (value) => {
				draft.gradeA = value
				render()
				save(item)
			}),
		),
		control(
			"grade side B",
			buttonRow(gradesB, (value) => draft.gradeB === value, (value) => {
				draft.gradeB = value
				render()
				save(item)
			}),
		),
		control(
			"preference",
			buttonRow(
				batch.preferences.map((value) => [value, PREFERENCE_LABELS[value] ?? value]),
				(value) => draft.preference === value,
				(value) => {
					draft.preference = value
					render()
					save(item)
				},
			),
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
	sides.append(renderSide(item, "A", item.sides.A), renderSide(item, "B", item.sides.B))
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
		const result = await api(batchPath("release"), { method: "POST" })
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
	const draft = draftFor(item)
	const key = event.key

	if (key === "ArrowLeft" || key === "k") {
		move(-1)
	} else if (key === "ArrowRight" || key === "j") {
		move(1)
	} else if (GRADE_KEYS_A[key]) {
		draft.gradeA = GRADE_KEYS_A[key]
		render()
		save(item)
	} else if (GRADE_KEYS_B[key]) {
		draft.gradeB = GRADE_KEYS_B[key]
		render()
		save(item)
	} else if (key === "a" || key === "b" || key === "n") {
		draft.preference = key === "n" ? "no-preference" : key
		render()
		save(item)
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
