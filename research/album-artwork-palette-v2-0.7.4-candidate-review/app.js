const ROLES = ["background", "surface", "foreground", "accent"]
const SIDES = ["A", "B"]
const QUALITY_VALUES = ["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"]
const RELATIVE_VALUES = ["a-stronger", "b-stronger", "similarly-valid", "neither-acceptable", "uncertain"]
const ISSUE_VALUES = ["missing gradient", "extraneous gradient", "incomplete artwork identity"]

const qualityText = {
	strong: "Strong",
	acceptable: "Acceptable",
	"weak-fallback": "Weak fallback",
	unacceptable: "Unacceptable",
	uncertain: "Uncertain",
}
const relativeText = {
	"a-stronger": "A is stronger",
	"b-stronger": "B is stronger",
	"similarly-valid": "Similarly valid",
	"neither-acceptable": "Neither acceptable",
	uncertain: "Uncertain",
}

const reviewRoot = document.querySelector("#review")
const status = document.querySelector("#status")
let payload = null
let submitted = false

function create(tag, properties = {}) {
	const element = document.createElement(tag)
	for (const [key, value] of Object.entries(properties)) {
		if (key === "text") element.textContent = value
		else if (key === "className") element.className = value
		else element.setAttribute(key, value)
	}
	return element
}

function roleStatus(role, palette) {
	const values = []
	if (role === "background") values.push("primary field")
	if (role === "foreground") values.push("required text role")
	if (role === "surface") values.push(palette.collapse.surface ? "collapsed to background" : "distinct surface")
	if (role === "accent") values.push(palette.collapse.accent ? "collapsed to foreground" : "distinct accent")
	if (palette.roles[role].generated) values.push("generated*")
	return values.join(" / ")
}

function renderTreatment(item, side) {
	const palette = item.options[side]
	const panel = create("article", { className: "option-panel", "aria-label": `Option ${side}` })
	const heading = create("header", { className: "option-heading" })
	const cardinality = new Set(ROLES.map((role) => palette.roles[role].hex)).size
	heading.append(
		create("strong", { text: `Option ${side}` }),
		create("span", { text: `${palette.gradient ? "Gradient" : "Flat field"} / ${cardinality} distinct colors` }),
	)
	panel.append(heading)

	const preview = create("section", { className: "palette-preview" })
	preview.style.setProperty("--background", palette.roles.background.hex)
	preview.style.setProperty("--surface", palette.roles.surface.hex)
	preview.style.setProperty("--foreground", palette.roles.foreground.hex)
	preview.style.setProperty("--accent", palette.roles.accent.hex)
	preview.style.background = palette.gradient
		? `linear-gradient(135deg in oklab, ${palette.roles.background.hex} 0%, ${palette.roles.surface.hex} 100%)`
		: palette.roles.background.hex
	preview.append(create("img", {
		className: "artwork",
		src: item.artworkUrl,
		alt: "Album artwork under review",
	}))
	const copy = create("div", { className: "background-copy" })
	copy.append(
		create("p", { className: "accent-copy", text: "Accent over background" }),
		create("h3", { text: "Foreground carries the listening view." }),
		create("p", { text: "A complete artwork-driven interface treatment." }),
	)
	preview.append(copy)
	const surface = create("div", { className: "surface-card" })
	surface.append(
		create("p", { className: "accent-copy", text: "Accent over surface" }),
		create("strong", { text: "Foreground over the surface role." }),
	)
	preview.append(surface)
	panel.append(preview)

	const legend = create("dl", { className: "role-legend", "aria-label": `Option ${side} role colors` })
	for (const role of ROLES) {
		const color = palette.roles[role]
		const entry = create("div", { className: "role-entry" })
		entry.append(create("dt", { text: role }))
		const description = create("dd", { className: "role-color" })
		const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
		swatch.style.backgroundColor = color.hex
		const text = create("span")
		text.append(create("strong", { text: color.nearestName }), create("code", { text: color.hex }))
		description.append(swatch, text)
		entry.append(description, create("dd", { className: "role-status", text: roleStatus(role, palette) }))
		legend.append(entry)
	}
	panel.append(legend)
	return panel
}

function radioChoices(name, values, labels) {
	const choices = create("div", { className: "choices" })
	for (const value of values) {
		const label = create("label")
		label.append(create("input", { type: "radio", name, value }), document.createTextNode(labels[value]))
		choices.append(label)
	}
	return choices
}

function issueChoices(name) {
	const choices = create("div", { className: "issue-choices" })
	for (const value of ISSUE_VALUES) {
		const label = create("label")
		label.append(create("input", { type: "checkbox", name, value }), document.createTextNode(value))
		choices.append(label)
	}
	return choices
}

function assessment(itemIndex) {
	const section = create("section", { className: "assessment" })
	section.append(create("h3", { text: "Assessment" }), create("p", {
		className: "assessment-instruction",
		text: "Required: rate both complete treatments and make one relative judgment.",
	}))
	const qualityPair = create("div", { className: "paired-fields" })
	for (const side of SIDES) {
		const fieldset = create("fieldset")
		fieldset.append(create("legend", { text: `Absolute quality of ${side}` }))
		fieldset.append(radioChoices(`item-${itemIndex}-quality-${side}`, QUALITY_VALUES, qualityText))
		qualityPair.append(fieldset)
	}
	section.append(qualityPair)
	const relative = create("fieldset")
	relative.append(create("legend", { text: "Relative judgment" }))
	relative.append(radioChoices(`item-${itemIndex}-relative`, RELATIVE_VALUES, relativeText))
	section.append(relative)
	const issuePair = create("div", { className: "paired-fields optional-fields" })
	for (const side of SIDES) {
		const fieldset = create("fieldset")
		fieldset.append(create("legend", { text: `Optional issue tags for ${side}` }))
		fieldset.append(issueChoices(`item-${itemIndex}-issues-${side}`))
		issuePair.append(fieldset)
	}
	section.append(issuePair)
	const commentLabel = create("label", { className: "comment-label" })
	commentLabel.append(create("span", { text: "Optional comment" }))
	commentLabel.append(create("textarea", {
		name: `item-${itemIndex}-comment`,
		maxlength: "2000",
		rows: "5",
		placeholder: "What most supports or limits either complete treatment?",
	}))
	section.append(commentLabel)
	return section
}

function selected(form, name) {
	return form.querySelector(`input[name="${name}"]:checked`)?.value ?? null
}

function checked(form, name) {
	return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value)
}

function responsesFrom(form) {
	return payload.items.map((item, index) => ({
		itemId: item.itemId,
		qualityA: selected(form, `item-${index}-quality-A`),
		qualityB: selected(form, `item-${index}-quality-B`),
		relative: selected(form, `item-${index}-relative`),
		issuesA: checked(form, `item-${index}-issues-A`),
		issuesB: checked(form, `item-${index}-issues-B`),
		comment: form.querySelector(`textarea[name="item-${index}-comment"]`).value,
	}))
}

function render() {
	const form = create("form", { novalidate: "" })
	for (const [index, item] of payload.items.entries()) {
		const reviewItem = create("section", { className: "review-item" })
		const heading = create("header", { className: "item-heading" })
		heading.append(
			create("p", { className: "eyebrow", text: `Comparison ${String(index + 1).padStart(2, "0")} / ${payload.itemCount}` }),
			create("h2", { text: "Blinded A/B comparison" }),
		)
		reviewItem.append(heading)
		const pair = create("div", { className: "preview-pair", "aria-label": "Blinded complete treatments" })
		pair.append(...SIDES.map((side) => renderTreatment(item, side)))
		reviewItem.append(pair, assessment(index))
		form.append(reviewItem)
	}
	const submitBlock = create("footer", { className: "submit-block" })
	submitBlock.append(
		create("p", { text: "Submission is final and cannot overwrite prior feedback." }),
		create("button", { type: "submit", text: "Submit both comparisons" }),
	)
	form.append(submitBlock)
	form.addEventListener("submit", submit)
	reviewRoot.replaceChildren(form)
	if (submitted) lockForm(form, "This bound review has already been submitted.")
}

function lockForm(form, message) {
	for (const field of form.elements) field.disabled = true
	status.textContent = message
}

async function submit(event) {
	event.preventDefault()
	const form = event.currentTarget
	const responses = responsesFrom(form)
	if (responses.some((entry) => !QUALITY_VALUES.includes(entry.qualityA) ||
		!QUALITY_VALUES.includes(entry.qualityB) || !RELATIVE_VALUES.includes(entry.relative))) {
		status.textContent = "Complete both absolute ratings and the relative judgment for each comparison."
		return
	}
	const button = form.querySelector('button[type="submit"]')
	button.disabled = true
	status.textContent = "Submitting..."
	try {
		const response = await fetch("/api/submit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ schemaVersion: 1, reviewId: payload.reviewId, responses }),
		})
		const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
		if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
		submitted = true
		lockForm(form, "Submitted. The bound feedback file is complete.")
	} catch (error) {
		status.textContent = `Submission failed: ${error.message}`
		button.disabled = false
	}
}

async function load() {
	try {
		const [reviewResponse, statusResponse] = await Promise.all([
			fetch("/api/review", { cache: "no-store" }),
			fetch("/api/status", { cache: "no-store" }),
		])
		if (!reviewResponse.ok || !statusResponse.ok) throw new Error("Could not load the bound review")
		payload = await reviewResponse.json()
		const current = await statusResponse.json()
		if (payload.schemaVersion !== 1 || payload.itemCount !== 2 || payload.items?.length !== 2 ||
			payload.reviewId !== current.reviewId) throw new Error("Review payload is invalid")
		submitted = current.submitted === true
		status.textContent = submitted ? "Already submitted" : "Not submitted"
		render()
	} catch (error) {
		reviewRoot.textContent = error.message || "Could not load the review"
		status.textContent = "Load failed"
	}
}

load()
