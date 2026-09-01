const QUALITY_LABELS = ["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"]
const COMPARISONS = ["a-stronger", "b-stronger", "similarly-valid", "neither-acceptable", "uncertain"]
const ISSUE_TAGS = ["missing gradient", "extraneous gradient", "incomplete artwork identity"]
const ROLES = ["background", "surface", "foreground", "accent"]
const SIDES = ["A", "B"]

const qualityText = {
	strong: "Strong",
	acceptable: "Acceptable",
	"weak-fallback": "Weak fallback",
	unacceptable: "Unacceptable",
	uncertain: "Uncertain",
}
const comparisonText = {
	"a-stronger": "A is stronger",
	"b-stronger": "B is stronger",
	"similarly-valid": "Similarly valid",
	"neither-acceptable": "Neither acceptable",
	uncertain: "Uncertain",
}

const state = {
	review: null,
	feedback: new Map(),
	drafts: new Map(),
	index: 0,
	autoSaveTimer: null,
	mutationQueue: Promise.resolve(),
}

const elements = {
	review: document.querySelector("#review"),
	previous: document.querySelector("#previous"),
	next: document.querySelector("#next"),
	meter: document.querySelector("#meter"),
	progress: document.querySelector("#progress"),
}

function create(tag, properties = {}) {
	const element = document.createElement(tag)
	for (const [key, value] of Object.entries(properties)) {
		if (key === "text") element.textContent = value
		else if (key === "className") element.className = value
		else element.setAttribute(key, value)
	}
	return element
}

function submissionFrom(entry) {
	return {
		caseId: entry.caseId,
		sourceSha256: entry.sourceSha256,
		qualityA: entry.qualityA,
		qualityB: entry.qualityB,
		comparison: entry.comparison,
		tagsA: [...entry.tagsA],
		tagsB: [...entry.tagsB],
		comment: entry.comment,
	}
}

function draftFor(reviewCase) {
	if (state.drafts.has(reviewCase.caseId)) return state.drafts.get(reviewCase.caseId)
	const stored = state.feedback.get(reviewCase.caseId)
	const draft = stored ? submissionFrom(stored) : {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		qualityA: null,
		qualityB: null,
		comparison: null,
		tagsA: [],
		tagsB: [],
		comment: "",
	}
	state.drafts.set(reviewCase.caseId, draft)
	return draft
}

function roleStatus(role, palette) {
	const labels = []
	if (role === "surface" && palette.collapse.surface) labels.push("collapsed to background")
	if (role === "accent" && palette.collapse.accent) labels.push("collapsed to foreground")
	if (palette.roles[role].generated) labels.push("generated*")
	return labels
}

function renderPreview(reviewCase, side) {
	const palette = reviewCase.options[side]
	const option = create("article", { className: "option-panel", "aria-label": `Option ${side}` })
	const heading = create("header", { className: "option-heading" })
	heading.append(create("span", { text: `Option ${side}` }), create("small", { text: "Complete treatment" }))
	option.append(heading)

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
		src: reviewCase.artworkUrl,
		alt: "Album artwork under review",
	}))
	const backgroundCopy = create("div", { className: "background-copy" })
	backgroundCopy.append(
		create("p", { className: "accent-copy", text: "Accent over background" }),
		create("h3", { text: "Foreground over the primary field." }),
		create("p", { text: "Artwork-driven interface treatment." }),
	)
	preview.append(backgroundCopy)
	const surface = create("div", { className: "surface-card" })
	surface.append(
		create("p", { className: "accent-copy", text: "Accent over surface" }),
		create("strong", { text: "Foreground over a small surface." }),
	)
	preview.append(surface)
	option.append(preview)

	const legend = create("dl", { className: "role-legend", "aria-label": `Option ${side} palette roles` })
	for (const role of ROLES) {
		const color = palette.roles[role]
		const item = create("div", { className: "role-entry" })
		item.append(create("dt", { text: role }))
		const details = create("dd", { className: "role-color" })
		const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
		swatch.style.backgroundColor = color.hex
		const description = create("span")
		description.append(create("strong", { text: color.nearestName }), create("code", { text: color.hex }))
		details.append(swatch, description)
		item.append(details)
		const statuses = roleStatus(role, palette)
		if (statuses.length) item.append(create("dd", { className: "role-status", text: statuses.join(" / ") }))
		legend.append(item)
	}
	option.append(legend)
	return option
}

function radioChoices(name, values, labels, selected) {
	const choices = create("div", { className: "choices" })
	for (const value of values) {
		const label = create("label")
		const input = create("input", { type: "radio", name, value })
		input.checked = selected === value
		label.append(input, document.createTextNode(labels[value]))
		choices.append(label)
	}
	return choices
}

function tagChoices(side, selected) {
	const choices = create("div", { className: "tag-choices" })
	for (const tag of ISSUE_TAGS) {
		const label = create("label")
		const input = create("input", { type: "checkbox", name: `tags${side}`, value: tag })
		input.checked = selected.includes(tag)
		label.append(input, document.createTextNode(tag))
		choices.append(label)
	}
	return choices
}

function renderAssessment(reviewCase, draft) {
	const form = create("form", { novalidate: "" })
	const heading = create("div", { className: "assessment-heading" })
	heading.append(create("h2", { text: "Assessment" }), create("p", {
		text: "Rate both complete treatments, then make one relative comparison.",
	}))
	form.append(heading)
	const qualityPair = create("div", { className: "paired-fields" })
	for (const side of SIDES) {
		const fieldset = create("fieldset")
		fieldset.append(create("legend", { text: `Absolute quality of ${side}` }))
		fieldset.append(radioChoices(`quality${side}`, QUALITY_LABELS, qualityText, draft[`quality${side}`]))
		qualityPair.append(fieldset)
	}
	form.append(qualityPair)
	const comparison = create("fieldset")
	comparison.append(create("legend", { text: "Relative comparison" }))
	comparison.append(radioChoices("comparison", COMPARISONS, comparisonText, draft.comparison))
	form.append(comparison)
	const tagPair = create("div", { className: "paired-fields optional-fields" })
	for (const side of SIDES) {
		const fieldset = create("fieldset")
		fieldset.append(create("legend", { text: `Optional issue tags for ${side}` }))
		fieldset.append(tagChoices(side, draft[`tags${side}`]))
		tagPair.append(fieldset)
	}
	form.append(tagPair)
	const commentLabel = create("label", { className: "comment-label" })
	commentLabel.append(create("span", { text: "Optional comment" }))
	const comment = create("textarea", {
		name: "comment",
		maxlength: "2000",
		rows: "5",
		placeholder: "What most supports or limits either treatment?",
	})
	comment.value = draft.comment
	commentLabel.append(comment)
	form.append(commentLabel)
	const actions = create("div", { className: "form-actions" })
	actions.append(
		create("output", { className: "save-status", role: "status", "aria-live": "polite" }),
		create("button", { type: "submit", text: "Save and continue" }),
	)
	form.append(actions)
	return form
}

function render() {
	window.clearTimeout(state.autoSaveTimer)
	const reviewCase = state.review.cases[state.index]
	const draft = draftFor(reviewCase)
	const article = create("article", { className: "review-case", "data-case-id": reviewCase.caseId })
	const heading = create("header", { className: "case-heading" })
	const title = create("div")
	title.append(
		create("p", { className: "eyebrow", text: `Case ${String(state.index + 1).padStart(2, "0")} / ${state.review.cases.length}` }),
		create("h2", { text: "Blinded A/B comparison" }),
	)
	heading.append(title, create("output", {
		className: "case-state",
		text: state.feedback.has(reviewCase.caseId) ? "Saved" : "Not reviewed",
	}))
	article.append(heading)
	const previews = create("section", { className: "preview-pair", "aria-label": "Blinded complete treatments" })
	previews.append(renderPreview(reviewCase, "A"), renderPreview(reviewCase, "B"))
	article.append(previews, renderAssessment(reviewCase, draft))
	elements.review.replaceChildren(article)
	elements.previous.disabled = state.index === 0
	elements.next.disabled = state.index === state.review.cases.length - 1
	updateProgress()
}

function updateProgress() {
	elements.meter.max = state.review.cases.length
	elements.meter.value = state.feedback.size
	elements.progress.textContent = `${state.feedback.size} of ${state.review.cases.length} cases saved`
}

function currentForm() {
	return elements.review.querySelector("form")
}

function readCurrentDraft() {
	const reviewCase = state.review.cases[state.index]
	const form = currentForm()
	const draft = {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		qualityA: form.querySelector('input[name="qualityA"]:checked')?.value ?? null,
		qualityB: form.querySelector('input[name="qualityB"]:checked')?.value ?? null,
		comparison: form.querySelector('input[name="comparison"]:checked')?.value ?? null,
		tagsA: [...form.querySelectorAll('input[name="tagsA"]:checked')].map((input) => input.value),
		tagsB: [...form.querySelectorAll('input[name="tagsB"]:checked')].map((input) => input.value),
		comment: form.querySelector('textarea[name="comment"]').value,
	}
	state.drafts.set(reviewCase.caseId, draft)
	return draft
}

function complete(draft) {
	return QUALITY_LABELS.includes(draft.qualityA) && QUALITY_LABELS.includes(draft.qualityB) &&
		COMPARISONS.includes(draft.comparison)
}

function setStatus(message, caseId = state.review.cases[state.index].caseId) {
	if (state.review.cases[state.index].caseId !== caseId) return
	elements.review.querySelector(".save-status").textContent = message
}

function enqueueWrite(payload) {
	const write = async () => {
		const response = await fetch("/api/feedback", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		})
		if (!response.ok) {
			const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
			throw new Error(body.error ?? `HTTP ${response.status}`)
		}
		return response.json()
	}
	const result = state.mutationQueue.then(write, write)
	state.mutationQueue = result.then(() => undefined, () => undefined)
	return result
}

async function saveCurrent(advance) {
	window.clearTimeout(state.autoSaveTimer)
	const payload = readCurrentDraft()
	if (!complete(payload)) {
		setStatus("Complete both quality ratings and the comparison.", payload.caseId)
		return false
	}
	const button = currentForm().querySelector('button[type="submit"]')
	button.disabled = true
	setStatus("Saving...", payload.caseId)
	try {
		const stored = await enqueueWrite(payload)
		state.feedback.set(stored.caseId, stored)
		state.drafts.set(stored.caseId, submissionFrom(stored))
		updateProgress()
		setStatus("Saved", payload.caseId)
		const caseState = elements.review.querySelector(".case-state")
		if (state.review.cases[state.index].caseId === payload.caseId) caseState.textContent = "Saved"
		if (advance && state.review.cases[state.index].caseId === payload.caseId) {
			const nextIncomplete = state.review.cases.findIndex((candidate, index) =>
				index > state.index && !state.feedback.has(candidate.caseId))
			if (nextIncomplete >= 0) state.index = nextIncomplete
			else if (state.index < state.review.cases.length - 1) state.index++
			render()
		}
		return true
	} catch (error) {
		setStatus(`Save failed: ${error.message}`, payload.caseId)
		return false
	} finally {
		if (button.isConnected) button.disabled = false
	}
}

function scheduleAutoSave() {
	window.clearTimeout(state.autoSaveTimer)
	const draft = readCurrentDraft()
	if (!complete(draft)) {
		setStatus("Not saved: complete the required choices.", draft.caseId)
		return
	}
	setStatus("Changes pending...", draft.caseId)
	state.autoSaveTimer = window.setTimeout(() => saveCurrent(false), 700)
}

elements.review.addEventListener("change", scheduleAutoSave)
elements.review.addEventListener("input", (event) => {
	if (event.target.matches("textarea")) scheduleAutoSave()
})
elements.review.addEventListener("submit", (event) => {
	event.preventDefault()
	saveCurrent(true)
})

function navigate(amount) {
	window.clearTimeout(state.autoSaveTimer)
	if (currentForm()) {
		const draft = readCurrentDraft()
		if (complete(draft)) saveCurrent(false)
	}
	state.index = Math.max(0, Math.min(state.review.cases.length - 1, state.index + amount))
	render()
}

elements.previous.addEventListener("click", () => navigate(-1))
elements.next.addEventListener("click", () => navigate(1))

async function load() {
	try {
		const [reviewResponse, feedbackResponse] = await Promise.all([
			fetch("/api/review", { cache: "no-store" }),
			fetch("/api/feedback", { cache: "no-store" }),
		])
		if (!reviewResponse.ok) throw new Error("Could not load the blinded review")
		if (!feedbackResponse.ok) throw new Error("Could not load saved feedback")
		state.review = await reviewResponse.json()
		const store = await feedbackResponse.json()
		if (!Array.isArray(state.review.cases) || state.review.cases.length < 1 || state.review.cases.length > 28) {
			throw new Error("Blinded review must contain 1 through 28 cases")
		}
		state.feedback = new Map(store.entries.map((entry) => [entry.caseId, entry]))
		const firstIncomplete = state.review.cases.findIndex((entry) => !state.feedback.has(entry.caseId))
		state.index = firstIncomplete < 0 ? 0 : firstIncomplete
		render()
	} catch (error) {
		elements.review.textContent = error.message || "Could not load review"
		elements.progress.textContent = "Load failed"
	}
}

load()
