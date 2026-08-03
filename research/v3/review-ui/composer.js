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
 *     A mistaken one is withdrawn, and both stay in the log.
 *
 * Keyboard, while the composer is open: `t` next target · `T` previous target · `1`–`9` assign that
 * swatch · `g` cycle flat / 2 stops / 3 stops · `s` submit · `w` withdraw the latest endorsement ·
 * `e` or `Esc` close. Digits address the swatch grid here, not the grade scale — the composer owns
 * the keyboard while it is open, and the legend on screen says so.
 */

import { el, renderMock, renderSwatches } from "./mock.js"

/** Roles in published order. [INHERITED] output contract, PHASE_0_DECISIONS.md §2. */
const ROLES = ["background", "surface", "foreground", "accent"]

/** Gradient shapes the composer offers. REVIEW_UI.md §4: "must support flat / 2-stop / 3-stop". */
const GRADIENT_MODES = ["flat", "2-stop", "3-stop"]

/** Stop positions per mode. The published values; the display mapping is the server's business. */
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
		stops: [],
		/** Which slot the next picked colour fills: a role name, or `stop:<index>`. */
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

	const targets = () => [...ROLES, ...state.stops.map((_, index) => `stop:${index}`)]

	function paletteOf() {
		if (ROLES.some((role) => state.roles[role] === null)) return null
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
					: { stops: state.stops.map((stop, index) => ({ color: stop, position: STOP_POSITIONS[state.mode][index] })) },
		}
	}

	/** Seed the composition from a side the reviewer was shown, or leave it empty. */
	function startFrom(sideName, side) {
		state.basedOn = sideName
		if (side !== null) {
			for (const role of side.roles) state.roles[role.role] = role.hex
			const stops = side.gradient === null ? [] : side.gradient.stops.map((stop) => stop.hex)
			state.mode = stops.length >= 3 ? "3-stop" : stops.length === 2 ? "2-stop" : "flat"
			state.stops = stops.slice(0, 3)
		}
		state.target = "background"
		schedulePreview()
		render()
	}

	function assign(hex) {
		if (state.target.startsWith("stop:")) state.stops[Number(state.target.slice(5))] = hex
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
		return slot.startsWith("stop:") ? (state.stops[Number(slot.slice(5))] ?? null) : state.roles[slot]
	}

	function cycleMode(step = 1) {
		const next = (GRADIENT_MODES.indexOf(state.mode) + step + GRADIENT_MODES.length) % GRADIENT_MODES.length
		state.mode = GRADIENT_MODES[next]
		const wanted = STOP_POSITIONS[state.mode].length
		// A new stop starts as the background — a real source pixel, so the palette stays submittable —
		// and the reviewer replaces it.
		while (state.stops.length < wanted) state.stops.push(state.roles.background ?? state.swatches[0]?.hex ?? null)
		state.stops.length = wanted
		if (state.target.startsWith("stop:") && Number(state.target.slice(5)) >= wanted) state.target = "background"
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

	/** Withdraw the latest endorsement: an empty-patch retracting amendment, never a deletion. */
	async function withdraw() {
		const live = (item.endorsements ?? []).filter((entry) => !entry.retracted)
		if (live.length === 0) {
			status("no endorsement to withdraw on this item")
			return
		}
		const reason = globalThis.prompt("Why withdraw this endorsement?") ?? ""
		if (reason.trim().length === 0) {
			status("withdrawal cancelled — an amendment needs a reason")
			return
		}
		try {
			await api(itemPath("amend"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ target: "endorsement", patch: {}, retract: true, reason }),
			})
			status("endorsement withdrawn — the record stays in the log, retracted")
			await onSubmitted()
		} catch (error) {
			status(`not withdrawn: ${error.message}`)
		}
	}

	/* ---------- rendering ---------- */

	function renderTargets() {
		const row = el("div", { class: "control-row" })
		for (const slot of targets()) {
			const hex = valueOf(slot)
			const label = slot.startsWith("stop:") ? `stop ${Number(slot.slice(5)) + 1}` : slot
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
			block.append(el("p", { text: "pick a colour for every role to see the preview" }))
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
		const withdrawButton = el("button", { text: "withdraw the latest (w)", attrs: { type: "button" } })
		withdrawButton.addEventListener("click", withdraw)
		const closeButton = el("button", { text: "close (Esc)", attrs: { type: "button" } })
		closeButton.addEventListener("click", () => close())

		// Nullish children are filtered rather than appended: `append(null)` writes the text "null".
		root.append(
			...[
				head,
				el("p", {
					class: "composer-keys",
					text:
						"t / T target · 1–9 swatch · g gradient shape · s endorse · w withdraw · Esc close · " +
						"click the artwork to eyedrop",
				}),
				el(
					"div",
					{ class: "composer-body" },
					el("div", { class: "composer-pickers" }, image, renderGrid()),
					renderPreview(),
				),
				el("p", { class: "control-label", text: "roles and stops" }),
				renderTargets(),
				modeRow,
				state.foreign.length > 0
					? el("p", { class: "banner", text: `not pixels of this artwork: ${state.foreign.join(", ")}` })
					: null,
				comment,
				el("div", { class: "control-row" }, submitButton, withdrawButton, closeButton),
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
		/** True when the composer consumed the key. The host page must not act on it as well. */
		onKey(key) {
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
