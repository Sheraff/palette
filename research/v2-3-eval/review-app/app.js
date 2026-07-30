/*
 * Structure and DOM conventions taken from research/album-artwork-palette-v2-0.7.7-quick-review/app.js
 * (blinded A/B review item, treatment panel, assessment block); the treatment field, role legend, named
 * colors, and gradient-midpoint custody rendering are taken from
 * research/album-artwork-palette-v2-phase-3-showcase/app.js.
 */

const PREFERENCES = [
	["A", "A is stronger"],
	["B", "B is stronger"],
	["equal", "Equally good"],
]
const VERDICT_LABELS = {
	"strong": "Strong",
	"acceptable": "Acceptable",
	"weak-fallback": "Weak fallback",
	"unacceptable": "Unacceptable",
}

const root = document.querySelector("#review")
const progress = document.querySelector("#progress")
const batchName = document.querySelector("#batch-name")
const submitButton = document.querySelector("#submit")
const submitStatus = document.querySelector("#submit-status")

let payload = null
/** Per-item review state, keyed by batch index. */
const state = []

function create(tag, properties = {}) {
	const element = document.createElement(tag)
	for (const [key, value] of Object.entries(properties)) {
		if (key === "text") element.textContent = value
		else if (key === "className") element.className = value
		else element.setAttribute(key, value)
	}
	return element
}

function treatmentFieldCss(palette) {
	if (!palette.gradient) return palette.background.hex
	return palette.midpoint
		? `linear-gradient(135deg in oklab, ${palette.background.hex} 0%, ${palette.midpoint} 50%, ${palette.surface.hex} 100%)`
		: `linear-gradient(135deg in oklab, ${palette.background.hex} 0%, ${palette.surface.hex} 100%)`
}

function roleStatus(role, palette) {
	const values = []
	if (role === "background") values.push("primary field")
	if (role === "foreground") values.push("required text role")
	if (role === "surface") values.push(palette.collapse.surface ? "collapsed to background" : "distinct surface")
	if (role === "accent") values.push(palette.collapse.accent ? "collapsed to foreground" : "distinct accent")
	if (palette[role].generated) values.push("generated*")
	return values.join(" / ")
}

function artworkTitle(file) {
	return file.split("/").at(-1).replace(/\.[^.]+$/u, "").replaceAll("-", " ")
}

function renderRoleLegend(palette, label) {
	const legend = create("dl", { className: "role-legend", "aria-label": `${label} role colors` })
	for (const role of payload.roles) {
		const color = palette[role]
		const entry = create("div", { className: "role-entry" })
		entry.append(create("dt", { text: role }))
		const description = create("dd", { className: "role-color" })
		const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
		swatch.style.backgroundColor = color.hex
		const text = create("span")
		text.append(create("strong", { text: color.name }), create("code", { text: color.hex }))
		description.append(swatch, text)
		entry.append(description, create("dd", { className: "role-status", text: roleStatus(role, palette) }))
		legend.append(entry)
	}
	return legend
}

function renderMidpoint(palette) {
	if (!palette.midpoint) return null
	const custody = create("div", { className: "midpoint-custody" })
	const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
	swatch.style.backgroundColor = palette.midpoint
	const color = create("span", { className: "midpoint-color" })
	color.append(create("strong", { text: palette.midpointName }), create("code", { text: palette.midpoint }))
	custody.append(
		swatch,
		create("strong", { text: "Gradient midpoint" }),
		color,
		create("span", { text: "50% / exact source-supported render / not a role" }),
	)
	return custody
}

function renderTreatment(item, side) {
	const palette = item[side]
	const label = item.identical ? "Single palette" : `Option ${side}`
	const panel = create("article", { className: "option-panel", "aria-label": label })
	const heading = create("header", { className: "option-heading" })
	const cardinality = new Set(payload.roles.map((role) => palette[role].hex)).size
	const renderMode = palette.midpoint ? "3-stop gradient" : palette.gradient ? "Gradient" : "Flat field"
	heading.append(
		create("strong", { text: label }),
		create("span", {
			text: item.identical
				? `Identical on both sides / ${renderMode} / ${cardinality} colors`
				: `${renderMode} / ${cardinality} colors`,
		}),
	)
	panel.append(heading)

	const preview = create("section", { className: "palette-preview" })
	for (const role of payload.roles) preview.style.setProperty(`--${role}`, palette[role].hex)
	preview.style.background = treatmentFieldCss(palette)
	preview.append(create("img", {
		className: "artwork",
		src: item.media,
		alt: `${artworkTitle(item.image)} album artwork`,
		loading: "lazy",
	}))
	const copy = create("div", { className: "background-copy" })
	copy.append(
		create("p", { className: "accent-copy", text: "Now playing" }),
		create("h3", { text: "The artwork carries the listening view." }),
		create("p", { text: "One coupled field, foreground, surface, and accent treatment." }),
	)
	preview.append(copy)
	const surface = create("div", { className: "surface-card" })
	surface.append(
		create("p", { className: "accent-copy", text: "Surface role" }),
		create("strong", { text: "Foreground remains part of the same palette." }),
	)
	preview.append(surface)
	panel.append(preview, renderRoleLegend(palette, label))
	const midpoint = renderMidpoint(palette)
	if (midpoint) panel.append(midpoint)
	return panel
}

function control(label, node) {
	const block = create("div", { className: "control" })
	block.append(create("p", { className: "control-label", text: label }), node)
	return block
}

function decision(options, isSelected, onSelect) {
	const row = create("div", { className: "decision" })
	for (const [value, label] of options) {
		const button = create("button", {
			type: "button",
			text: label,
			className: isSelected(value) ? "selected" : "",
		})
		button.addEventListener("click", () => {
			onSelect(value)
			render()
		})
		row.append(button)
	}
	return row
}

function corrections(item, index) {
	const block = create("div")
	for (const role of payload.roles) {
		const row = create("div", { className: "correction" })
		row.append(create("span", { className: "role-status", text: role }))
		const strip = create("div", { className: "swatch-strip" })
		for (const swatch of item.swatches) {
			const chosen = state[index].corrections[role] === swatch.hex
			const button = create("button", {
				type: "button",
				className: `swatch-choice${swatch.source === "palette" ? " proposed" : ""}${chosen ? " selected" : ""}`,
				title: swatch.source === "image"
					? `${swatch.name} ${swatch.hex} / ${(swatch.share * 100).toFixed(1)}% of pixels`
					: `${swatch.name} ${swatch.hex} / proposed by a treatment`,
			})
			const chip = create("span", { className: "swatch", "aria-hidden": "true" })
			chip.style.backgroundColor = swatch.hex
			button.append(chip, create("strong", { text: swatch.name }), create("code", { text: swatch.hex }))
			button.addEventListener("click", () => {
				if (chosen) delete state[index].corrections[role]
				else state[index].corrections[role] = swatch.hex
				render()
			})
			strip.append(button)
		}
		const clear = create("button", { type: "button", className: "swatch-clear", text: "Clear" })
		clear.addEventListener("click", () => {
			delete state[index].corrections[role]
			render()
		})
		strip.append(clear)
		row.append(strip)
		block.append(row)
	}
	block.append(create("p", {
		className: "correction-note role-status",
		text: "Solid: sampled from the artwork / dashed: proposed by a treatment",
	}))
	return block
}

function assessment(item, index) {
	const section = create("section", { className: "assessment" })
	const answered = state[index].preference !== null && state[index].verdict !== null

	if (!item.identical) {
		section.append(control("Preference", decision(
			PREFERENCES,
			(value) => state[index].preference === value,
			(value) => { state[index].preference = value },
		)))
	}
	const verdictLabel = item.identical
		? "Absolute verdict for this palette"
		: state[index].preference === "equal"
			? "Absolute verdict (both sides)"
			: `Absolute verdict for ${state[index].preference ? `option ${state[index].preference}` : "the preferred side"}`
	section.append(control(verdictLabel, decision(
		payload.verdicts.map((value) => [value, VERDICT_LABELS[value] ?? value]),
		(value) => state[index].verdict === value,
		(value) => { state[index].verdict = value },
	)))
	section.append(control("Error tags (optional)", decision(
		payload.starterTags.map((tag) => [tag, tag]),
		(value) => state[index].tags.includes(value),
		(value) => {
			state[index].tags = state[index].tags.includes(value)
				? state[index].tags.filter((tag) => tag !== value)
				: [...state[index].tags, value]
		},
	)))
	section.append(control("Role corrections (optional)", corrections(item, index)))

	const comment = create("textarea", {
		className: "comment",
		maxlength: "4000",
		placeholder: "Optional notes",
	})
	comment.value = state[index].notes
	comment.addEventListener("input", () => { state[index].notes = comment.value })
	section.append(comment, create("p", { className: "status", text: answered ? "Answered" : "Not reviewed" }))
	return section
}

function render() {
	const textareas = [...root.querySelectorAll("textarea")]
	const focusedIndex = textareas.indexOf(document.activeElement)
	const selection = focusedIndex >= 0
		? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
		: null
	root.replaceChildren()
	for (const [index, item] of payload.items.entries()) {
		const reviewItem = create("section", { className: "review-item", "data-id": item.image })
		const heading = create("header", { className: "item-heading" })
		heading.append(
			create("p", {
				className: "eyebrow",
				text: item.identical
					? `Item ${String(index + 1).padStart(2, "0")} / ${payload.items.length} / identical output`
					: `Comparison ${String(index + 1).padStart(2, "0")} / ${payload.items.length}`,
			}),
			create("h2", { text: artworkTitle(item.image) }),
		)
		if (item.identical) {
			heading.append(create("p", {
				className: "identity-note",
				text: "Both candidates produced the same treatment. Judge this single palette on its own merits.",
			}))
		}
		const pair = create("div", { className: item.identical ? "preview-pair single" : "preview-pair" })
		if (item.identical) pair.append(renderTreatment(item, "A"))
		else pair.append(renderTreatment(item, "A"), renderTreatment(item, "B"))
		reviewItem.append(heading, pair, assessment(item, index))
		root.append(reviewItem)
	}
	if (focusedIndex >= 0) {
		const textarea = root.querySelectorAll("textarea")[focusedIndex]
		textarea.focus()
		textarea.setSelectionRange(selection[0], selection[1])
	}
	const answered = state.filter((entry) => entry.preference !== null && entry.verdict !== null).length
	progress.textContent = `${answered} / ${state.length} answered`
	submitButton.disabled = answered !== state.length
	if (!submitButton.disabled && submitStatus.dataset.state !== "submitted") {
		submitStatus.textContent = "Ready to submit."
	}
}

async function submit() {
	submitButton.disabled = true
	submitStatus.textContent = "Submitting..."
	try {
		const response = await fetch("/api/submit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				batch: payload.batch,
				items: payload.items.map((item, index) => ({
					image: item.image,
					preference: state[index].preference,
					verdict: state[index].verdict,
					corrections: state[index].corrections,
					tags: state[index].tags,
					notes: state[index].notes,
				})),
			}),
		})
		const body = await response.json()
		if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
		submitStatus.dataset.state = "submitted"
		submitStatus.textContent = `Appended ${body.appended} record(s) to ${body.warehouse}. You can close this tab.`
	} catch (error) {
		submitStatus.textContent = `Submission failed: ${error.message}`
		submitButton.disabled = false
	}
}

submitButton.addEventListener("click", () => { submit() })

fetch("/api/batch", { cache: "no-store" })
	.then((response) => response.json())
	.then((value) => {
		payload = value
		batchName.textContent = `Batch ${payload.batch}`
		for (const item of payload.items) {
			// An identical pair carries no side preference: it is recorded as equal / comparison "identical".
			state.push({
				preference: item.identical ? "equal" : null,
				verdict: null,
				corrections: {},
				tags: [],
				notes: "",
			})
		}
		render()
	})
	.catch((error) => {
		progress.textContent = "Review failed to load"
		root.textContent = error instanceof Error ? error.message : "Request failed"
	})
