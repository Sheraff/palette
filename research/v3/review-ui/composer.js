/*
 * The palette composer (REVIEW_UI.md §4).
 *
 * Optional per item, zero ceremony: it is closed until the reviewer presses `e`, it never blocks a
 * verdict, and nothing about it is required to release a batch. What it produces is an
 * `endorsed-sample` — never a fitting target, never an auto-win. Its uses are reachability diagnosis
 * ("can the algorithm even produce this?"), destination adjudication, and complaint interpretation.
 *
 * Three rules shape the whole thing:
 *
 *  1. **Colours come from the artwork.** Two pickers, both returning exact source pixels: a compact
 *     quantized swatch grid, and an eyedropper — a click on the artwork, resolved server-side
 *     against the decoded file rather than against the scaled copy on screen.
 *  2. **Always preview before submit, in the judging renderer.** The preview is not composed here:
 *     the palette is POSTed and the server returns the same side payload a judged side gets,
 *     including the [REVIEWED] gradient display mapping. The reviewer previews in the mock they
 *     grade in, because a palette that only looks right in a different renderer is not endorsed.
 *  3. **Editing a submitted composition is a NEW endorsement.** The record is immutable evidence of
 *     what was assembled and previewed; the warehouse refuses an amendment carrying palette changes.
 *     A mistaken one is deleted (`w`) — which retracts it rather than erasing the line — and the
 *     replacement is a second submission. Both stay in the log; only one of them counts.
 *
 * Keyboard, while the composer is open: `t` next target · `T` previous target · `1`–`9` assign that
 * swatch · `g` cycle flat / 2 stops / 3 stops · `s` submit · `w` delete the submitted palette ·
 * `e` or `Esc` close. Digits address the swatch grid here, not the grade scale — the composer owns
 * the keyboard while it is open, and the legend on screen says so. The digit row is decoded by the
 * shared `keys.js`, so the reviewer's AZERTY row (`&é"'(§è!çà`) addresses the grid too.
 */

import { el, renderMock, renderSwatches } from "./mock.js"
import { normalizeKey } from "./keys.js"

/** Roles in published order. [INHERITED] output contract, PHASE_0_DECISIONS.md §2. */
const ROLES = ["background", "surface", "foreground", "accent"]

/** Gradient shapes the composer offers. REVIEW_UI.md §4: "must support flat / 2-stop / 3-stop". */
const GRADIENT_MODES = ["flat", "2-stop", "3-stop"]

/**
 * How many colours each shape asks the reviewer for, beyond the four roles.
 *
 * Reviewer, 2026-08-03: *"why does the 2-stop background option actually add 2 colors? a 2-stop
 * gradient is between surface and background, no extra color. Only the 3-stop gradient adds a
 * midpoint color"*. They are right about what the reviewer is being asked, so:
 *
 *  - **2-stop** asks for **nothing**. The ramp runs background → surface, both already picked.
 *  - **3-stop** asks for **one** colour, the midpoint; the ends stay background and surface.
 *
 * The submitted palette still carries explicit stops with explicit positions, because the output
 * contract says a gradient is a list of stops and the composer must be able to express what the
 * algorithm publishes. The decoupling stays in the data; it is gone from the form, where it was
 * asking the reviewer to state the same two colours twice.
 */
const EXTRA_COLORS_PER_MODE = { flat: 0, "2-stop": 0, "3-stop": 1 }

/** Published stop positions per mode. The display mapping is the server's business, not this file's. */
const STOP_POSITIONS = { flat: [], "2-stop": [0, 1], "3-stop": [0, 0.5, 1] }

/** How many swatches a digit key can reach. 1–9 on the keyboard; the rest are a click away. */
const SWATCH_HOTKEYS = 9

/** Live preview is re-requested this long after the last change, so dragging a slider is one call. */
const PREVIEW_DEBOUNCE_MS = 120

/**
 * Build a composer for one item.
 *
 * `api(path, init)` and `status(message)` come from the host page, so the composer speaks with the
 * page's own error handling and status line rather than inventing a second one.
 */
export function createComposer({ batchId, item: initialItem, artworkSrc, api, status, onSubmitted }) {
	// The host page reloads the batch after every submission, so the item object is replaced. The
	// composer keeps its own half-assembled palette across that: it is work, and losing it because the
	// page refreshed would be the kind of friction §4 rules out.
	let item = initialItem
	const state = {
		open: false,
		roles: { background: null, surface: null, foreground: null, accent: null },
		mode: "flat",
		/** The 3-stop shape's middle colour, and the only stop colour the reviewer ever picks. */
		midpoint: null,
		/** Which slot the next picked colour fills: a role name, or `midpoint`. */
		target: "background",
		swatches: [],
		source: null,
		preview: null,
		foreign: [],
		basedOn: null,
		comment: "",
		busy: false,
	}
	let previewTimer = null
	const root = el("div", { class: "composer" })

	const itemPath = (...parts) =>
		["/api/batches", encodeURIComponent(batchId), "items", encodeURIComponent(item.itemId), ...parts].join("/")

	/** The slots that ask the reviewer for a colour: the four roles, plus a midpoint on 3-stop only. */
	const targets = () => [...ROLES, ...(EXTRA_COLORS_PER_MODE[state.mode] > 0 ? ["midpoint"] : [])]

	/**
	 * The stops the palette will carry, derived rather than asked for.
	 *
	 * Background and surface are the two ends in every shape — that is what makes the 2-stop form
	 * empty — and the midpoint is the one colour a 3-stop shape adds.
	 */
	function stopColors() {
		if (state.mode === "flat") return []
		if (state.mode === "2-stop") return [state.roles.background, state.roles.surface]
		return [state.roles.background, state.midpoint ?? state.roles.background, state.roles.surface]
	}

	function paletteOf() {
		if (ROLES.some((role) => state.roles[role] === null)) return null
		if (EXTRA_COLORS_PER_MODE[state.mode] > 0 && state.midpoint === null) return null
		return {
			background: state.roles.background,
			surface: state.roles.surface,
			foreground: state.roles.foreground,
			accent: state.roles.accent,
			surfaceCollapsed: state.roles.surface === state.roles.background,
			accentCollapsed: state.roles.accent === state.roles.surface,
			gradient:
				state.mode === "flat"
					? null
					: { stops: stopColors().map((color, index) => ({ color, position: STOP_POSITIONS[state.mode][index] })) },
		}
	}

	/**
	 * Seed the composition from a side the reviewer was shown, or leave it empty.
	 *
	 * A shown palette may carry stops that are not its background and surface — the contract allows
	 * that and the algorithm sometimes does it. What is kept here is its *shape* and, on three stops,
	 * its middle colour; the ends follow the roles, because those are the two ends the form now
	 * offers. The reviewer sees the result in the preview before anything is endorsed.
	 */
	function startFrom(sideName, side) {
		state.basedOn = sideName
		if (side !== null) {
			for (const role of side.roles) state.roles[role.role] = role.hex
			const stops = side.gradient === null ? [] : side.gradient.stops.map((stop) => stop.hex)
			state.mode = stops.length >= 3 ? "3-stop" : stops.length === 2 ? "2-stop" : "flat"
			state.midpoint = stops.length >= 3 ? stops[1] : null
		}
		state.target = "background"
		schedulePreview()
		render()
	}

	function assign(hex) {
		if (state.target === "midpoint") state.midpoint = hex
		else state.roles[state.target] = hex
		// Zero ceremony: picking a colour moves to the next empty slot, so a fresh palette is four
		// clicks and not four clicks plus four target selections.
		const list = targets()
		const empty = list.find((slot) => valueOf(slot) === null)
		if (empty !== undefined) state.target = empty
		schedulePreview()
		render()
	}

	function valueOf(slot) {
		return slot === "midpoint" ? state.midpoint : state.roles[slot]
	}

	function cycleMode(step = 1) {
		const next = (GRADIENT_MODES.indexOf(state.mode) + step + GRADIENT_MODES.length) % GRADIENT_MODES.length
		state.mode = GRADIENT_MODES[next]
		if (EXTRA_COLORS_PER_MODE[state.mode] === 0) {
			// Nothing extra to pick: the 2-stop ramp is background → surface, both already chosen.
			state.midpoint = null
			if (state.target === "midpoint") state.target = "background"
		} else if (state.midpoint === null) {
			// The midpoint starts as the background — a real source pixel, so the palette stays
			// previewable and submittable from the first frame — and the reviewer replaces it.
			state.midpoint = state.roles.background ?? state.swatches[0]?.hex ?? null
		}
		schedulePreview()
		render()
	}

	function moveTarget(step) {
		const list = targets()
		const at = Math.max(0, list.indexOf(state.target))
		state.target = list[(at + step + list.length) % list.length]
		render()
	}

	function schedulePreview() {
		if (previewTimer !== null) clearTimeout(previewTimer)
		previewTimer = setTimeout(() => {
			previewTimer = null
			refreshPreview()
		}, PREVIEW_DEBOUNCE_MS)
	}

	async function refreshPreview() {
		const palette = paletteOf()
		if (palette === null) {
			state.preview = null
			render()
			return
		}
		try {
			const result = await api(itemPath("preview"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ palette }),
			})
			state.preview = result.side
			state.foreign = result.foreign
			render()
		} catch (error) {
			state.preview = null
			status(`preview failed: ${error.message}`)
			render()
		}
	}

	async function loadSource() {
		if (state.source !== null) return
		try {
			state.source = await api(itemPath("colors"))
			state.swatches = state.source.swatches
			render()
		} catch (error) {
			status(`could not read the artwork's colours: ${error.message}`)
		}
	}

	/** The eyedropper: a click inside the artwork, in normalized coordinates. */
	async function sample(event, image) {
		const box = image.getBoundingClientRect()
		if (box.width === 0 || box.height === 0) return
		const x = (event.clientX - box.left) / box.width
		const y = (event.clientY - box.top) / box.height
		try {
			const pixel = await api(`${itemPath("pixel")}?x=${x.toFixed(6)}&y=${y.toFixed(6)}`)
			assign(pixel.hex)
			status(`picked ${pixel.name} — ${pixel.hex}`)
		} catch (error) {
			status(`eyedropper failed: ${error.message}`)
		}
	}

	async function submit() {
		const palette = paletteOf()
		if (palette === null) {
			status("every role needs a colour before this can be endorsed")
			return
		}
		if (state.busy) return
		state.busy = true
		try {
			const result = await api(itemPath("endorsement"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ palette, comment: state.comment, basedOn: state.basedOn }),
			})
			status(`endorsed ${result.paletteHash.slice(0, 12)}… — endorsement ${result.count} for this item`)
			state.comment = ""
			await onSubmitted()
		} catch (error) {
			status(`not endorsed: ${error.message}`)
		} finally {
			state.busy = false
			render()
		}
	}

	/**
	 * Delete the palette this reviewer submitted on this item.
	 *
	 * "Delete" in the reviewer's sense, not the log's: what is appended is an empty-patch retracting
	 * amendment, so the palette stops counting as evidence everywhere (release stops citing it, the
	 * warehouse resolves it as retracted) while the record itself stays in the log. Nothing here ever
	 * removes a line — but from the reviewer's side the palette is gone, and the button says that.
	 */
	async function withdraw() {
		const live = (item.endorsements ?? []).filter((entry) => !entry.retracted)
		if (live.length === 0) {
			status("nothing to delete — you have no submitted palette on this item")
			return
		}
		const reason = globalThis.prompt("Why delete this submitted palette?") ?? ""
		if (reason.trim().length === 0) {
			status("deletion cancelled — the log needs a reason for it")
			return
		}
		try {
			await api(itemPath("amend"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ target: "endorsement", patch: {}, retract: true, reason }),
			})
			status("submitted palette deleted — it counts as evidence no more; the record stays in the log, retracted")
			await onSubmitted()
		} catch (error) {
			status(`not deleted: ${error.message}`)
		}
	}

	/* ---------- rendering ---------- */

	function renderTargets() {
		const row = el("div", { class: "control-row" })
		for (const slot of targets()) {
			const hex = valueOf(slot)
			const label = slot === "midpoint" ? "gradient midpoint" : slot
			// The active target is marked in the text, not only by inversion: the reviewer moves through
			// these with `t` while looking at the artwork, and a class change is not readable from there.
			const button = el("button", {
				class: state.target === slot ? "selected" : "",
				text: `${state.target === slot ? "▸ " : ""}${label}: ${hex ?? "—"}`,
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => {
				state.target = slot
				render()
			})
			row.append(button)
		}
		return row
	}

	function renderGrid() {
		const grid = el("ul", { class: "composer-grid" })
		if (state.source !== null) {
			// What the grid is and is not: the artwork's most common colours, not a partition of it.
			grid.append(
				el("li", {
					class: "composer-grid-note",
					text:
						`${state.swatches.length} swatches · ${(state.source.coveredAreaFraction * 100).toFixed(0)}% of the ` +
						`artwork · ${state.source.distinctColors} distinct colours in it — eyedrop for the rest`,
				}),
			)
		}
		state.swatches.forEach((entry, index) => {
			const chip = el("span", { class: "chip" })
			chip.style.background = entry.hex
			const button = el(
				"button",
				{ class: "composer-swatch", attrs: { type: "button", title: `${entry.name} — ${entry.hex}` } },
				chip,
				el("span", {
					class: "composer-swatch-text",
					text:
						`${index < SWATCH_HOTKEYS ? `${index + 1} ` : ""}${entry.name} ${entry.hex} · ` +
						`${(entry.areaFraction * 100).toFixed(1)}%`,
				}),
			)
			button.addEventListener("click", () => assign(entry.hex))
			grid.append(el("li", {}, button))
		})
		return grid
	}

	function renderPreview() {
		const block = el("div", { class: "composer-preview" })
		if (state.preview === null) {
			block.append(el("p", { text: "pick a colour for every slot above to see the preview" }))
			return block
		}
		// The same mock, from the same module, fed the server's own side payload: the reviewer previews
		// in the renderer they judge in.
		block.append(renderMock(artworkSrc, state.preview), renderSwatches(state.preview))
		return block
	}

	function renderEndorsements() {
		const list = el("ul", { class: "composer-history" })
		for (const [index, entry] of (item.endorsements ?? []).entries()) {
			list.append(
				el("li", {
					text:
						`${index + 1}. ${entry.paletteHash.slice(0, 12)}…${entry.retracted ? " (withdrawn)" : ""} · ` +
						`${entry.recordedAt}${entry.comment ? ` · ${entry.comment}` : ""}`,
				}),
			)
		}
		return list
	}

	function render() {
		root.replaceChildren()
		if (!state.open) {
			const live = (item.endorsements ?? []).filter((entry) => !entry.retracted).length
			const button = el("button", {
				text: live > 0 ? `compose a palette (e) — ${live} endorsed` : "compose a palette (e)",
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => open())
			root.append(el("div", { class: "control-row" }, button))
			return
		}

		const head = el(
			"div",
			{ class: "control-row" },
			el("span", { class: "control-label", text: "compose a palette — optional" }),
		)
		// A pairwise item offers its two blinded sides as starting points; a calibration item offers its
		// one. Either way `basedOn` records which shown palette this grew from, by content hash.
		const starts = item.sides
			? [["start from A", item.sides.A, "A"], ["start from B", item.sides.B, "B"]]
			: item.side
				? [["start from the shown palette", item.side, "palette"]]
				: []
		for (const [label, side, name] of [...starts, ["start empty", null, null]]) {
			const button = el("button", {
				class: state.basedOn === name ? "selected" : "",
				text: label,
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => startFrom(name, side))
			head.append(button)
		}

		const image = el("img", { class: "composer-art", attrs: { src: artworkSrc, alt: "artwork — click to pick a colour" } })
		image.addEventListener("click", (event) => sample(event, image))

		const modeRow = el("div", { class: "control-row" })
		for (const mode of GRADIENT_MODES) {
			const button = el("button", {
				class: state.mode === mode ? "selected" : "",
				text: mode,
				attrs: { type: "button" },
			})
			button.addEventListener("click", () => {
				const step = (GRADIENT_MODES.indexOf(mode) - GRADIENT_MODES.indexOf(state.mode) + 3) % 3
				cycleMode(step === 0 ? 3 : step)
			})
			modeRow.append(button)
		}

		const comment = el("textarea", {
			attrs: { rows: "2", placeholder: "why this palette? (optional, and the most useful part)" },
		})
		comment.value = state.comment
		comment.addEventListener("input", () => {
			state.comment = comment.value
		})

		const submitButton = el("button", { text: "endorse this palette (s)", attrs: { type: "button" } })
		submitButton.addEventListener("click", submit)
		const closeButton = el("button", { text: "close (Esc)", attrs: { type: "button" } })
		closeButton.addEventListener("click", () => close())

		// The delete button, and the one line that says why deleting is the only correction there is.
		// Reviewer, 2026-08-03: "there is a button that says 'withdraw the latest (w)' and i have no idea
		// what this does". So it now names the thing it acts on, and it is only on screen when there IS
		// one — a button offering to delete something that does not exist is the same confusion again.
		const live = (item.endorsements ?? []).filter((entry) => !entry.retracted)
		const deleteButton =
			live.length === 0
				? null
				: el("button", { text: "delete my submitted palette (w)", attrs: { type: "button" } })
		deleteButton?.addEventListener("click", withdraw)
		const deleteNote =
			live.length === 0
				? null
				: el("p", {
						class: "control-note",
						text:
							"a submitted palette cannot be edited — it is evidence of what you actually assembled and " +
							"previewed — so deleting it and composing a new one is the only correction. The record stays " +
							"in the log, marked withdrawn.",
					})

		// Nullish children are filtered rather than appended: `append(null)` writes the text "null".
		root.append(
			...[
				head,
				el("p", {
					class: "composer-keys",
					text:
						`t / T target · 1–9 swatch · g gradient shape · s endorse · ${live.length > 0 ? "w delete · " : ""}` +
						"Esc close · click the artwork to eyedrop",
				}),
				el(
					"div",
					{ class: "composer-body" },
					el("div", { class: "composer-pickers" }, image, renderGrid()),
					renderPreview(),
				),
				el("p", { class: "control-label", text: "colours to pick" }),
				renderTargets(),
				modeRow,
				// What each shape asks for, in one line, because "2 stops" reading as "two more colours"
				// is exactly the misunderstanding the reviewer reported.
				el("p", {
					class: "control-note",
					text:
						"flat — one colour, the background · 2 stops — background → surface, no extra colour · " +
						"3 stops — background → midpoint → surface, one extra colour",
				}),
				state.foreign.length > 0
					? el("p", { class: "banner", text: `not pixels of this artwork: ${state.foreign.join(", ")}` })
					: null,
				comment,
				el("div", { class: "control-row" }, submitButton, deleteButton, closeButton),
				deleteNote,
				renderEndorsements(),
			].filter((child) => child !== null),
		)
	}

	function open() {
		state.open = true
		// A composition that starts from a shown palette is the common case — the reviewer is usually
		// saying "this, but the accent should be that" — so it starts there and `start empty` is a click.
		if (state.basedOn === null) {
			if (item.sides) startFrom("A", item.sides.A)
			else if (item.side) startFrom("palette", item.side)
		}
		loadSource()
		render()
		status("composer open — digits pick swatches, not grades")
	}

	function close() {
		state.open = false
		render()
		status("composer closed")
	}

	return {
		node: root,
		get isOpen() {
			return state.open
		},
		render,
		/** Point at the reloaded item without disturbing the composition in progress. */
		setItem(next) {
			item = next
			render()
		},
		/**
		 * True when the composer consumed the key. The host page must not act on it as well.
		 *
		 * The key is normalized again here even though the host page already did it: this is a module
		 * with several callers, and "the digit row works" must not depend on which page is hosting it.
		 */
		onKey(rawKey) {
			const key = normalizeKey(rawKey)
			if (!state.open) {
				if (key !== "e") return false
				open()
				return true
			}
			if (key === "Escape" || key === "e") close()
			else if (key === "t") moveTarget(1)
			else if (key === "T") moveTarget(-1)
			else if (key === "g") cycleMode(1)
			else if (key === "s") submit()
			else if (key === "w") withdraw()
			else if (/^[1-9]$/.test(key)) {
				const entry = state.swatches[Number(key) - 1]
				if (entry === undefined) {
					status(`no swatch ${key} in this artwork's grid`)
					return true
				}
				assign(entry.hex)
				status(`${state.target}: ${entry.name} — ${entry.hex}`)
			} else return false
			return true
		},
	}
}
