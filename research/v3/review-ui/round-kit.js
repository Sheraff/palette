/*
 * The round-page kit — one shell every review round is built on.
 *
 * **Why.** Two review pages shipped broken in two days, and they were the same bug wearing two
 * faces. `/freetext` called `normalizeKey(event)` where every other page calls
 * `normalizeKey(event.key)`; because `normalizeKey` returns its argument unchanged when it is not
 * one of the twenty digit-row keys, it handed back the KeyboardEvent object and every
 * `key === "Enter"` below it was false forever. The page loaded, rendered, saved, and could not
 * advance a single item. The endorsement-recheck page shipped with no working input surface at all.
 * Neither is a hard bug. Both exist because every page in `review-ui/` re-implements payload fetch,
 * navigation, key handling, hints, autosave, undo, resume and release from scratch — so every new
 * page gets a fresh chance to get one of them wrong, and a page that RENDERS is indistinguishable
 * from a page that WORKS until the reviewer sits down in front of it.
 *
 * So the kit owns all of it, and a round supplies only what is genuinely round-specific: what to
 * show (a `stimulusRenderer`) and how to answer (an `answerWidget`).
 *
 * **The event never reaches round code.** That is the structural fix, not a convention. The shell
 * attaches the one `keydown` listener, pulls `.key` off the event itself, calls `normalizeKey` at
 * the single call site in this file, and hands widgets a plain string plus a small flags object.
 * A widget cannot pass the event object to `normalizeKey` because a widget is never given the event.
 * The mistake that killed `/freetext` is not a mistake that can be made here.
 *
 * **The keymap is not optional.** Both incidents included keys that were dead or undiscoverable, so
 * `renderKeymap` runs on every render from the shell's own binding table — the same table the
 * dispatcher reads. A key that is bound is on screen; a key on screen is bound. They cannot drift,
 * because there is one list.
 *
 * **Failure is visible.** A page that cannot load its payload says so, in the status line and in the
 * stage. `/freetext` sat at "loading…" whenever anything threw, which is indistinguishable from a
 * slow network and sends the reviewer away rather than to the orchestrator.
 *
 * Chrome is black and white, flat, no shadows (REVIEW_UI.md §3). The artwork is the only thing on
 * the page allowed to carry colour.
 */

import { normalizeKey } from "./keys.js"

/* ------------------------------------------------------------------------------------------- */
/* Small DOM helpers — every page needs these four and every page had its own copy               */
/* ------------------------------------------------------------------------------------------- */

export function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class !== undefined) node.className = options.class
	if (options.text !== undefined) node.textContent = options.text
	if (options.attrs !== undefined) for (const [name, value] of Object.entries(options.attrs)) node.setAttribute(name, value)
	node.append(...children)
	return node
}

/**
 * Look a node up by id, tolerating both spellings.
 *
 * `document.getElementById` and `document.querySelector("#id")` are the same lookup to a browser and
 * are NOT the same lookup to the test harness, which only implements one of them. A page that used
 * the other spelling was untestable, and "untestable" is where both incidents lived. The kit uses
 * this everywhere so a round never has to know which one the harness speaks.
 */
export function node(id) {
	if (typeof document.getElementById === "function") {
		const found = document.getElementById(id)
		if (found != null) return found
	}
	return document.querySelector(`#${id}`)
}

/* ------------------------------------------------------------------------------------------- */
/* Key handling — the one place an event is turned into a key                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The ONLY `normalizeKey` call in any round page, and the only place `.key` is read off an event.
 *
 * Everything downstream receives strings. `letter` is the lowercased form for letter bindings; `key`
 * keeps its case and its full name so `Enter`, `Escape`, `ArrowLeft`, `ArrowRight` and `Backspace`
 * survive intact — `oracle.js` lowercases wholesale, which is safe there only because that page
 * binds nothing but letters and digits.
 */
function readKey(event) {
	const raw = event === null || event === undefined ? "" : event.key
	const key = normalizeKey(typeof raw === "string" ? raw : "")
	return {
		key,
		letter: typeof key === "string" ? key.toLowerCase() : "",
		shift: event?.shiftKey === true,
		meta: event?.metaKey === true || event?.ctrlKey === true || event?.altKey === true,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Stimulus renderers — what the reviewer looks at                                                */
/* ------------------------------------------------------------------------------------------- */

/**
 * One artwork, at its own size.
 *
 * No magnifier: the reviewer zooms natively (REVIEW_UI.md §3). Intrinsic width/height come from the
 * file header via the payload, so the frame holds its aspect ratio before the bytes land and the
 * page does not jump under the cursor mid-answer.
 */
export function imagePanel({ item, nodes }) {
	const image = nodes.artwork ?? el("img")
	image.src = item.media
	image.alt = "album artwork"
	image.width = item.width
	image.height = item.height
	return image
}

/** A block of round-supplied text. Used by rounds whose stimulus is prose, not a picture. */
export function textPanel({ item, config }) {
	return el("div", { class: "round-text-panel", text: config.textOf?.(item) ?? "" })
}

/**
 * The mock player, from the ONE pinned `mock.js`.
 *
 * Imported dynamically and from a ROOT-ABSOLUTE path. Both matter: dynamic so a round that never
 * shows a palette does not pay for the module, and root-absolute because a relative specifier
 * resolves against the importing module's URL, which is not the same directory once a page is served
 * from a route rather than a file. The mock UI is the primary judging surface (§3) and there is
 * exactly one renderer of it — a page with its own copy would be judging a different mock.
 */
export async function mockPlayer({ item, config }) {
	const mock = await import("/mock.js")
	return mock.renderSide(item.media, config.sideName ?? "", config.sideOf?.(item) ?? item.side)
}

/** Several panels, stacked. The composite is a renderer like any other, so it nests. */
export function composite(...renderers) {
	return async (context) => {
		const panel = el("div", { class: "round-composite" })
		for (const render of renderers) panel.append(await render(context))
		return panel
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Answer widgets — how the reviewer answers                                                      */
/* ------------------------------------------------------------------------------------------- */

/**
 * One keystroke per answer, auto-advancing (REVIEW_UI.md §6).
 *
 * The mapping is on screen for every item, from the same table the dispatcher reads. An answer key
 * the reviewer has to recall is one they will eventually mis-press, and a mis-press inside a closed
 * vocabulary is unfindable afterwards.
 */
export const enumKeys = {
	kind: "enumKeys",
	ownsTextEntry: false,
	bindings(question) {
		return (question?.answers ?? []).map((answer) => ({ key: answer.hotkey, label: answer.label ?? answer.key, kind: "answer" }))
	},
	render({ question, nodes }) {
		const list = nodes.mapping
		if (list == null) return null
		// `oracle-map`, which is a real rule in styles.css and gives the hotkey its own 1.5em column.
		// The endorsement page invented `oracle-answer`, matched no rule, and the grid collapsed into a
		// run-on line — invisible to every textContent assertion, because the harness has no CSS engine.
		list.replaceChildren(
			...(question?.answers ?? []).map((answer) =>
				el(
					"li",
					{ class: "oracle-map" },
					el("b", { class: "oracle-map-mark", text: answer.hotkey }),
					el("span", { class: "oracle-map-label", text: answer.label ?? answer.key }),
					el("i", { class: "oracle-map-gloss", text: answer.gloss ?? "" }),
				),
			),
		)
		return null
	},
	onKey({ key, question, shell }) {
		const answer = (question?.answers ?? []).find((entry) => entry.hotkey === key)
		if (answer === undefined) return false
		void shell.answer(answer.key)
		return true
	},
}

/**
 * Toggle values on and off, commit with Enter or Space (PREMISE_NEXT.md §15.9).
 *
 * The one shape that cannot auto-advance, because the reviewer is still choosing. It binds digits and
 * nothing else so the commit key and undo stay unambiguous, and the set is recorded sorted so two
 * reviewers who pick the same values write the same row.
 */
export const multiToggle = {
	kind: "multiToggle",
	ownsTextEntry: false,
	bindings(question) {
		return [
			...(question?.answers ?? []).map((answer) => ({ key: answer.hotkey, label: answer.label ?? answer.key, kind: "toggle" })),
			{ key: "enter", label: "record the set", kind: "commit" },
		]
	},
	start({ item }) {
		return new Set(Array.isArray(item.answer) ? item.answer : [])
	},
	render({ question, nodes, state }) {
		if (nodes.mapping != null) {
			nodes.mapping.replaceChildren(
				...(question?.answers ?? []).map((answer) =>
					el(
						"li",
						{ class: `oracle-map oracle-map-multi${state.has(answer.key) ? " is-selected" : ""}` },
						el("b", { class: "oracle-map-mark", text: answer.hotkey }),
						el("span", { class: "oracle-map-label", text: answer.label ?? answer.key }),
						el("i", { class: "oracle-map-gloss", text: answer.gloss ?? "" }),
					),
				),
			)
		}
		if (nodes.pending != null) {
			nodes.pending.textContent = state.size === 0 ? "nothing selected yet — press enter to record" : `about to record: ${[...state].sort().join(", ")}`
		}
		return null
	},
	onKey({ key, question, state, shell }) {
		const answer = (question?.answers ?? []).find((entry) => entry.hotkey === key)
		if (answer !== undefined) {
			if (state.has(answer.key)) state.delete(answer.key)
			else state.add(answer.key)
			shell.rerender()
			return true
		}
		if (key === "Enter" || key === " ") {
			if (state.size === 0) {
				shell.status("nothing selected — a multi-select records at least one value")
				return true
			}
			void shell.answer([...state].sort())
			return true
		}
		return false
	},
}

/**
 * A textarea, saved on Enter and autosaved while the reviewer types.
 *
 * Everything here is a lesson from `/freetext`:
 *  - the field OWNS the plain arrow keys and Shift+Enter. Stealing an arrow makes a typo unfixable;
 *    stealing Shift+Enter makes a paragraph impossible.
 *  - Escape is the documented way out, and it says out loud what the out-of-field keys are, because
 *    a key nobody can discover is a key that does not exist.
 *  - nothing is ever saved empty. "" and "I see nothing" are different answers and a text field
 *    cannot tell them apart; recording the first as the second is precisely the confusion the
 *    free-text round was built to undo.
 */
export const freeText = {
	kind: "freeText",
	ownsTextEntry: true,
	bindings() {
		return [
			{ key: "enter", label: "save & next", kind: "commit" },
			{ key: "shift+enter", label: "newline", kind: "field" },
			{ key: "esc", label: "leave the field", kind: "field" },
			{ key: "c", label: "back to typing", kind: "field" },
		]
	},
	render({ item, nodes }) {
		if (nodes.answer == null) return null
		nodes.answer.value = item.answer ?? ""
		if (nodes.saved != null) nodes.saved.textContent = item.answer == null ? "not saved yet" : "saved"
		nodes.answer.focus()
		return null
	},
	/** True when the caret is in the field, so the shell knows the field owns the keyboard. */
	hasFocus({ nodes }) {
		return document.activeElement === nodes.answer
	},
	value({ nodes }) {
		return (nodes.answer?.value ?? "").trim()
	},
	clearMarker({ nodes }) {
		if (nodes.saved != null) nodes.saved.textContent = "unsaved…"
	},
	failMarker({ nodes }) {
		if (nodes.saved != null) nodes.saved.textContent = "NOT saved"
	},
	savedMarker({ nodes }) {
		if (nodes.saved != null) nodes.saved.textContent = "saved"
	},
	onKey({ key, shift, inField, nodes, shell }) {
		if (inField && key === "Enter" && !shift) {
			void shell.next()
			return true
		}
		if (inField && key === "Escape") {
			nodes.answer.blur()
			shell.status(shell.outOfFieldHint())
			return true
		}
		// Everything else belongs to the textarea while it has focus. Reported as UNHANDLED so the
		// shell lets it through to the browser rather than swallowing it.
		if (inField) return false
		if (key === "c") {
			nodes.answer?.focus()
			return true
		}
		return false
	},
}

/* ------------------------------------------------------------------------------------------- */
/* The shell                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/** How long the shell waits after the last keystroke before saving a text answer. */
export const AUTOSAVE_DELAY_MS = 1200

/**
 * Start a round page.
 *
 * The only entry point. A round's whole page is this call plus a config object; there is no wiring
 * for a round to get wrong, which is the point.
 */
export async function startRound(config) {
	const nodes = Object.fromEntries((config.nodeIds ?? []).map((id) => [camel(id), node(id)]))
	// Both spellings, so a round can say `nodes.contextLabel` or `nodes["context-label"]`.
	for (const id of config.nodeIds ?? []) nodes[id] = node(id)

	const widget = config.answerWidget ?? enumKeys
	const renderStimulus = config.stimulusRenderer ?? imagePanel

	let batch = null
	let index = 0
	let busy = false
	let saveTimer = null
	let widgetState = null
	/** True while the per-item note box is open. Only ever open on the item currently on screen. */
	let noteOpen = false

	const status = (text) => {
		if (nodes.status != null) nodes.status.textContent = text
	}

	async function api(path, options) {
		const response = await fetch(path, options)
		if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
		return response.status === 204 ? null : await response.json()
	}

	const questionOf = (item) => batch.questions.find((entry) => entry.key === item.questionKey) ?? null
	const firstUnanswered = () => {
		const at = batch.items.findIndex((item) => item.answer === null || item.answer === undefined)
		return at === -1 ? batch.items.length : at
	}

	/**
	 * Every key the page currently answers to, in one table.
	 *
	 * The dispatcher reads it and the footer prints it, so a bound key is always on screen and an
	 * on-screen key is always bound. Both shipped incidents had keys that were one or the other.
	 */
	function bindings() {
		const item = batch?.items[index]
		const question = item === undefined ? null : questionOf(item)
		const own = widget.bindings?.(question, item) ?? []
		// Navigation is advertised from the same table the dispatcher reads, so the footer cannot drift
		// from what the keys actually do. It is generated, never hand-written — the endorsement page's
		// footer was hand-written and said things the page had stopped doing.
		const canNavigate = config.itemNavigation !== false
		const navigation = widget.ownsTextEntry
			? [
					...(canNavigate ? [{ key: "esc then ←/k", label: "back", kind: "nav" }, { key: "esc then →/j", label: "forward", kind: "nav" }] : []),
					{ key: "esc then r", label: "release when finished", kind: "release" },
				]
			: [
					...(canNavigate ? [{ key: "k / ←", label: "back", kind: "nav" }, { key: "j / →", label: "forward (records nothing)", kind: "nav" }] : []),
					{ key: config.undoKey ?? "u", label: "undo one", kind: "nav" },
					{ key: "r", label: "release when finished", kind: "release" },
				]
		// The note key is on every round of every kind, and it is advertised like any other binding —
		// an affordance nobody can discover is an affordance that does not exist.
		const note = config.itemNotes === false ? [] : [{ key: widget.ownsTextEntry ? "esc then f" : "f", label: "note on this item", kind: "note" }]
		return [...own, ...note, ...navigation]
	}

	/**
	 * The item's short, stable, copyable name.
	 *
	 * The reviewer, 2026-08-04: *"i often want to give feedback about a specific thing and we
	 * currently have no way of doing that, which prevents accidental discovery of information."* A
	 * reviewer who cannot name what is in front of them cannot report anything about it. One click
	 * selects the whole string so it can go straight into a message.
	 */
	function renderItemRef(item) {
		const target = nodes.itemref
		if (target == null) return
		target.textContent = item.itemRef ?? ""
		target.title = "click to select — paste this to name this exact item"
		if (target.dataset === undefined) target.dataset = {}
		if (target.dataset.wired !== "yes") {
			target.dataset.wired = "yes"
			target.addEventListener?.("click", () => {
				const selection = globalThis.getSelection?.()
				const range = document.createRange?.()
				if (selection == null || range == null) return
				range.selectNodeContents(target)
				selection.removeAllRanges()
				selection.addRange(range)
				status("item id selected — copy it into your message")
			})
		}
	}

	/**
	 * The per-item note box.
	 *
	 * Optional on every item of every round, never required, and it never blocks an answer or an
	 * advance. Enter saves; Escape closes without saving. An empty note is never recorded — a blank
	 * row would make "had nothing to say" indistinguishable from "said nothing".
	 */
	function renderNote(item) {
		if (nodes.notebox != null) nodes.notebox.hidden = !noteOpen
		if (nodes.noteinput != null && noteOpen) {
			nodes.noteinput.value = item.note ?? ""
			nodes.noteinput.focus()
		}
		// The indicator is on the item whether or not the box is open, so a reviewer scanning back
		// through a round can see which items they have already said something about.
		if (nodes.notemark != null) nodes.notemark.textContent = item.note ? "note saved on this item" : ""
	}

	async function saveNote() {
		const item = batch.items[index]
		const text = (nodes.noteinput?.value ?? "").trim()
		if (text.length === 0) {
			noteOpen = false
			status("empty note — nothing recorded")
			await render()
			return
		}
		try {
			await api(`${config.notePath ?? `/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items`}/${encodeURIComponent(item.token)}/note`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: text }),
			})
			item.note = text
			noteOpen = false
			status(`note saved on ${item.itemRef ?? "this item"}`)
		} catch (error) {
			status(`note NOT saved: ${error.message}`)
		}
		await render()
	}

	function renderKeymap() {
		if (nodes.keymap == null) return
		nodes.keymap.replaceChildren(
			...bindings().map((binding) => el("span", { class: "round-key" }, el("b", { text: binding.key }), el("span", { text: ` ${binding.label}` }))),
		)
	}

	const outOfFieldHint = () =>
		"out of the field — " +
		bindings()
			.filter((binding) => binding.kind === "nav" || binding.kind === "release")
			.map((binding) => `${binding.key.replace("esc then ", "")} ${binding.label}`)
			.join(" · ")

	function progressText() {
		const answered = batch.items.filter((item) => item.answer !== null && item.answer !== undefined).length
		const unit = config.unitPlural ?? "items"
		void unit
		return `${Math.min(index + 1, batch.items.length)} / ${batch.items.length} · ${answered} ${config.answeredWord ?? "done"}`
	}

	function renderPending() {
		if (nodes.pending == null || widget.kind === "multiToggle") return
		const remaining = batch.items.filter((item) => item.answer === null || item.answer === undefined).length
		nodes.pending.textContent =
			remaining === 0 ? config.allAnsweredText ?? "every item has an answer" : `${remaining} ${config.unitSingular ?? "item"}(s) still blank`
	}

	/** A failure the reviewer can see. Never "loading…" forever — that reads as a slow network. */
	function fail(message) {
		if (nodes.question != null) nodes.question.textContent = config.failHeadline ?? "this round could not be loaded"
		status(message)
		if (nodes.stage != null) {
			nodes.stage.replaceChildren(
				el("div", { class: "round-error" }, el("p", { text: message }), el("p", { text: "nothing was lost — tell the orchestrator and reload." })),
			)
		}
	}

	async function render() {
		renderKeymap()
		if (batch.items.length === 0) {
			if (nodes.question != null) nodes.question.textContent = config.emptyText ?? "this round has no items"
			return
		}
		if (index >= batch.items.length) {
			if (nodes.question != null) nodes.question.textContent = config.allAnsweredText ?? "every item has an answer"
			if (nodes.instruction != null) nodes.instruction.textContent = ""
			if (nodes.progress != null) nodes.progress.textContent = `${batch.items.length} / ${batch.items.length}`
			// Hidden, never removed: stepping back off the end has to restore a working field, and a page
			// that rebuilds its own inputs loses whatever was half-typed in them.
			for (const id of config.hideWhenDone ?? []) if (nodes[id] != null) nodes[id].hidden = true
			if (nodes.done != null) {
				nodes.done.hidden = false
				nodes.done.textContent = batch.released ? "this round is released — thank you" : `press ${widget.ownsTextEntry ? "esc then r" : "r"} to release the round`
			}
			renderPending()
			return
		}
		for (const id of config.hideWhenDone ?? []) if (nodes[id] != null) nodes[id].hidden = false
		if (nodes.done != null) nodes.done.hidden = true

		const item = batch.items[index]
		const question = questionOf(item)
		if (nodes.question != null) nodes.question.textContent = question === null ? item.questionKey : question.question
		if (nodes.instruction != null) nodes.instruction.textContent = question?.instruction ?? ""
		if (nodes.preamble != null) nodes.preamble.textContent = question?.preamble ?? ""
		if (nodes.framing != null) nodes.framing.textContent = question?.framing ?? ""
		if (nodes.progress != null) nodes.progress.textContent = progressText()

		renderItemRef(item)
		renderNote(item)
		config.renderContext?.({ item, question, nodes, el })
		const stimulus = await renderStimulus({ item, question, nodes, config, el })
		if (nodes.stage != null && stimulus != null && !nodes.stage.contains?.(stimulus)) {
			if (config.stageReplaces !== false) nodes.stage.replaceChildren(stimulus)
		}
		widgetState = widget.start?.({ item, question }) ?? null
		widget.render?.({ item, question, nodes, state: widgetState, config, el })
		renderPending()
	}

	function rerender() {
		void render()
	}

	/** Post one answer. The token is all the page ever knows an item by. */
	async function post(value) {
		const item = batch.items[index]
		await api(`${config.answerPath ?? `/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items`}/${encodeURIComponent(item.token)}/answer`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ answer: value }),
		})
		item.answer = value
	}

	/** Record an answer and advance. Used by every widget that does not own text entry. */
	async function answer(value) {
		if (busy || index >= batch.items.length) return
		busy = true
		try {
			await post(value)
			status(`recorded ${Array.isArray(value) ? value.join(", ") : value}`)
			index += 1
			await render()
		} catch (error) {
			status(`not recorded: ${error.message}`)
		} finally {
			busy = false
		}
	}

	/**
	 * Save whatever the text widget currently holds, if it is worth saving.
	 *
	 * Returns true when the item now holds this text. Never writes an empty answer.
	 */
	async function save({ quiet = false } = {}) {
		if (busy || batch === null || index >= batch.items.length) return false
		const item = batch.items[index]
		const text = widget.value?.({ nodes }) ?? ""
		if (text.length === 0) {
			if (!quiet) status(config.emptyAnswerText ?? "nothing written yet — an empty answer is not recorded")
			return false
		}
		if (text === (item.answer ?? "").trim()) {
			widget.savedMarker?.({ nodes })
			return true
		}
		busy = true
		try {
			await post(text)
			widget.savedMarker?.({ nodes })
			if (!quiet) status(`saved ${text.length} characters`)
			renderPending()
			if (nodes.progress != null) nodes.progress.textContent = progressText()
			return true
		} catch (error) {
			widget.failMarker?.({ nodes })
			status(`not recorded: ${error.message}`)
			return false
		} finally {
			busy = false
		}
	}

	function scheduleSave() {
		widget.clearMarker?.({ nodes })
		if (saveTimer !== null) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			saveTimer = null
			void save({ quiet: true })
		}, config.autosaveDelayMs ?? AUTOSAVE_DELAY_MS)
	}

	function flushTimer() {
		if (saveTimer === null) return
		clearTimeout(saveTimer)
		saveTimer = null
	}

	async function next() {
		flushTimer()
		if (widget.ownsTextEntry) {
			const saved = await save()
			if (!saved) return
		}
		if (index >= batch.items.length) return
		index += 1
		await render()
	}

	/**
	 * Move between items WITHOUT answering. Clamped at both ends; records nothing.
	 *
	 * Standard on every by-item round, because the endorsement page shipped with no way to look at
	 * item 2 without committing an answer to item 1 — which makes "let me see them both before I
	 * decide" impossible, and quietly turns a considered judgement into a forced one. `j`/`k` and the
	 * arrows both do it. It is configurable off (`itemNavigation: false`) only for by-question speed
	 * passes, where auto-advance-only IS the design and a stray `j` would cost the reviewer their place.
	 *
	 * "Records nothing" is exact for every widget that does not own text entry: no POST is made. A text
	 * widget still flushes a PENDING EDIT on the way out, which is the autosave contract protecting
	 * work the reviewer already typed, not navigation inventing an answer — it never writes an empty
	 * or unchanged field.
	 */
	async function navigate(delta) {
		if (config.itemNavigation === false) return false
		flushTimer()
		if (widget.ownsTextEntry) await save({ quiet: true })
		const next = index + delta
		if (next < 0) {
			status(config.atFirstText ?? "already at the first item")
			return true
		}
		if (next > batch.items.length - 1) {
			status(config.atLastText ?? "already at the last item")
			return true
		}
		index = next
		status(delta < 0 ? config.steppedBackText ?? "stepped back — answer again to replace" : config.steppedForwardText ?? "moved on — nothing was recorded")
		await render()
		return true
	}

	/** Step back. Nothing is deleted: re-answering appends a record that supersedes at query time. */
	async function back() {
		flushTimer()
		if (widget.ownsTextEntry) await save({ quiet: true })
		if (index === 0) {
			status(config.atFirstText ?? "already at the first item")
			return
		}
		index -= 1
		status(config.steppedBackText ?? "stepped back — answer again to replace")
		await render()
	}

	async function release() {
		flushTimer()
		if (widget.ownsTextEntry) await save({ quiet: true })
		try {
			const result = await api(`/api/batches/${encodeURIComponent(batch.batchId)}/release`, { method: "POST" })
			batch.released = true
			status(`released at ${result.releasedAt}`)
			await render()
		} catch (error) {
			status(`release refused: ${error.message}`)
		}
	}

	const shell = { answer, next, back, navigate, release, status, rerender, save, outOfFieldHint }

	/**
	 * The one keydown listener on the page.
	 *
	 * It reads `.key` off the event here and hands widgets strings. Order matters: the widget sees
	 * the key first so a text field can claim Enter, then navigation, then release — and release is
	 * checked LAST and never while a text field has focus, so a reviewer typing "red" cannot end the
	 * round on the first letter.
	 */
	function onKey(event) {
		if (batch === null) return
		const { key, letter, shift } = readKey(event)

		/*
		 * THE NOTE BOX COMES FIRST, and that is what resolves the free-text edge.
		 *
		 * On a free-text ANSWER round there are two textareas on screen, and Escape means something in
		 * both. They never collide because only one can hold the keyboard at a time and the note box,
		 * while open, holds it: Escape closes the note and hands focus back to the answer field, where
		 * Escape then does its own job of leaving the field. One key, two scopes, disambiguated by
		 * which box is open rather than by a rule anyone has to remember.
		 *
		 * They stay DISTINCT rather than merged, because they are different records about different
		 * things: the answer is the round's datum, the note is commentary the round never asked for —
		 * "this rendition looks corrupted", "this question does not fit this cover". Merging them would
		 * put the second kind of statement into the first kind's column, which is the exact confusion
		 * `none_discernible` already cost this project once.
		 */
		if (noteOpen) {
			if (key === "Enter" && !shift) {
				event.preventDefault()
				void saveNote()
				return
			}
			if (key === "Escape") {
				event.preventDefault()
				noteOpen = false
				status("note closed — nothing recorded")
				void render()
				return
			}
			// Everything else belongs to the note textarea, including plain arrows and Shift+Enter.
			return
		}

		const inField = widget.hasFocus?.({ nodes }) === true

		// `f` opens the note, and only when no text field owns the keyboard — otherwise it is a letter
		// the reviewer is typing. On a free-text round that means Escape first, the same shape as
		// `esc then r` and `esc then j/k`, and the footer says so.
		if (!inField && letter === "f" && config.itemNotes !== false && index < batch.items.length) {
			event.preventDefault()
			noteOpen = true
			status("note box open — enter saves, esc closes without saving")
			void render()
			return
		}
		const handled = widget.onKey?.({ key, letter, shift, inField, nodes, question: batch.items[index] === undefined ? null : questionOf(batch.items[index]), state: widgetState, shell })
		if (handled === true) {
			event.preventDefault()
			return
		}
		// While a text field owns the keyboard, nothing below this line runs. The arrows belong to the
		// caret and `r` is a letter.
		if (inField) return
		// Undo steps back AND is the documented way to replace an answer, so it stays distinct from
		// plain navigation even though both move by one.
		if (key === "Backspace" || letter === (config.undoKey ?? "u")) {
			event.preventDefault()
			void back()
			return
		}
		if (key === "ArrowLeft" || letter === "k") {
			event.preventDefault()
			void navigate(-1)
			return
		}
		if (key === "ArrowRight" || letter === "j") {
			event.preventDefault()
			void navigate(1)
			return
		}
		if (key === "Enter" && !widget.ownsTextEntry) {
			event.preventDefault()
			void next()
			return
		}
		if (letter === "r") {
			event.preventDefault()
			void release()
		}
	}

	document.addEventListener("keydown", onKey)
	if (widget.ownsTextEntry && nodes.answer != null) {
		nodes.answer.addEventListener("input", scheduleSave)
		nodes.answer.addEventListener("blur", () => {
			flushTimer()
			void save({ quiet: true })
		})
		// Best-effort only; the browser gives no guarantee here, which is why the debounce and the blur
		// handler carry the real weight.
		globalThis.addEventListener?.("pagehide", () => {
			if (saveTimer !== null) void save({ quiet: true })
		})
	}

	try {
		const queue = await api("/api/queue")
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		const rounds = queue.batches.filter((entry) => entry.kind === (config.batchKind ?? "oracle-validation")).sort((a, b) => (a.pushedAt < b.pushedAt ? -1 : 1))
		const chosen = rounds.find((entry) => entry.batchId === wanted) ?? rounds.filter((entry) => !entry.released).at(-1) ?? rounds.at(-1)
		if (chosen === undefined) {
			fail(config.noRoundText ?? "no round of this kind in the queue")
			return shell
		}
		batch = await api(`${config.payloadPath ?? "/api/oracle-validation"}/${encodeURIComponent(chosen.batchId)}`)
		index = firstUnanswered()
		await render()
		status(`${batch.batchId} — resuming at ${config.unitSingular ?? "item"} ${Math.min(index + 1, batch.items.length)}`)
	} catch (error) {
		// Visible, always. A page that sits on "loading…" is indistinguishable from a slow network and
		// sends the reviewer away instead of to the orchestrator.
		fail(`could not load: ${error.message}`)
	}
	return shell
}

function camel(id) {
	return id.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
}
