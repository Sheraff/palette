const ROLES = ["background", "surface", "foreground", "accent"]
const SIDES = ["A", "B"]
const QUALITY_VALUES = ["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"]
const COMPARISON_VALUES = ["a-stronger", "b-stronger", "similarly-valid", "neither-acceptable", "uncertain"]
const ISSUE_VALUES = ["missing gradient", "extraneous gradient", "incomplete artwork identity"]

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
	title: document.querySelector("#title"),
	instruction: document.querySelector("#instruction"),
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
	const { submittedAt: _submittedAt, ...submission } = entry
	return structuredClone(submission)
}

function emptyDraft(reviewCase) {
	return state.review.mode === "absolute" ? {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		quality: null,
		issues: [],
		comment: "",
	} : {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		qualityA: null,
		qualityB: null,
		comparison: null,
		issuesA: [],
		issuesB: [],
		comment: "",
	}
}

function draftFor(reviewCase) {
	if (state.drafts.has(reviewCase.caseId)) return state.drafts.get(reviewCase.caseId)
	const stored = state.feedback.get(reviewCase.caseId)
	const draft = stored ? submissionFrom(stored) : emptyDraft(reviewCase)
	state.drafts.set(reviewCase.caseId, draft)
	return draft
}

function roleStatus(role, treatment) {
	const values = []
	if (role === "background") values.push("primary field")
	if (role === "foreground") values.push("required text role")
	if (role === "surface") values.push(treatment.collapse.surface ? "collapsed to background" : "distinct surface")
	if (role === "accent") values.push(treatment.collapse.accent ? "collapsed to foreground" : "distinct accent")
	if (treatment.roles[role].generated) values.push("generated*")
	return values.join(" / ")
}

function renderTreatment(reviewCase, treatment, headingText) {
	const panel = create("article", { className: "option-panel", "aria-label": headingText })
	const heading = create("header", { className: "option-heading" })
	const cardinality = new Set(ROLES.map((role) => treatment.roles[role].hex)).size
	heading.append(
		create("strong", { text: headingText }),
		create("span", { text: `${treatment.gradient ? "Gradient" : "Flat field"} / ${cardinality} distinct colors` }),
	)
	panel.append(heading)

	const preview = create("section", { className: "palette-preview" })
	preview.style.setProperty("--background", treatment.roles.background.hex)
	preview.style.setProperty("--surface", treatment.roles.surface.hex)
	preview.style.setProperty("--foreground", treatment.roles.foreground.hex)
	preview.style.setProperty("--accent", treatment.roles.accent.hex)
	preview.style.background = treatment.gradient
		? `linear-gradient(135deg in oklab, ${treatment.roles.background.hex} 0%, ${treatment.roles.surface.hex} 100%)`
		: treatment.roles.background.hex
	preview.append(create("img", {
		className: "artwork",
		src: reviewCase.artworkUrl,
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

	const legend = create("dl", { className: "role-legend", "aria-label": `${headingText} role colors` })
	for (const role of ROLES) {
		const color = treatment.roles[role]
		const entry = create("div", { className: "role-entry" })
		entry.append(create("dt", { text: role }))
		const description = create("dd", { className: "role-color" })
		const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
		swatch.style.backgroundColor = color.hex
		const text = create("span")
		text.append(create("strong", { text: color.nearestName }), create("code", { text: color.hex }))
		description.append(swatch, text)
		entry.append(description, create("dd", { className: "role-status", text: roleStatus(role, treatment) }))
		legend.append(entry)
	}
	panel.append(legend)
	return panel
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

function issueChoices(name, selected) {
	const choices = create("div", { className: "issue-choices" })
	for (const value of ISSUE_VALUES) {
		const label = create("label")
		const input = create("input", { type: "checkbox", name, value })
		input.checked = selected.includes(value)
		label.append(input, document.createTextNode(value))
		choices.append(label)
	}
	return choices
}

function renderAssessment(draft) {
	const form = create("form", { novalidate: "" })
	const heading = create("div", { className: "assessment-heading" })
	heading.append(create("h2", { text: "Assessment" }), create("p", {
		text: state.review.mode === "absolute"
			? "Rate the complete treatment. Issue tags and comments are optional."
			: "Rate both complete treatments independently, then compare them.",
	}))
	form.append(heading)
	if (state.review.mode === "absolute") {
		const quality = create("fieldset")
		quality.append(create("legend", { text: "Absolute quality" }))
		quality.append(radioChoices("quality", QUALITY_VALUES, qualityText, draft.quality))
		form.append(quality)
		const issues = create("fieldset", { className: "optional-fields" })
		issues.append(create("legend", { text: "Optional issue tags" }))
		issues.append(issueChoices("issues", draft.issues))
		form.append(issues)
	} else {
		const qualities = create("div", { className: "paired-fields" })
		for (const side of SIDES) {
			const fieldset = create("fieldset")
			fieldset.append(create("legend", { text: `Absolute quality of ${side}` }))
			fieldset.append(radioChoices(`quality${side}`, QUALITY_VALUES, qualityText, draft[`quality${side}`]))
			qualities.append(fieldset)
		}
		form.append(qualities)
		const comparison = create("fieldset")
		comparison.append(create("legend", { text: "Relative comparison" }))
		comparison.append(radioChoices("comparison", COMPARISON_VALUES, comparisonText, draft.comparison))
		form.append(comparison)
		const issues = create("div", { className: "paired-fields optional-fields" })
		for (const side of SIDES) {
			const fieldset = create("fieldset")
			fieldset.append(create("legend", { text: `Optional issue tags for ${side}` }))
			fieldset.append(issueChoices(`issues${side}`, draft[`issues${side}`]))
			issues.append(fieldset)
		}
		form.append(issues)
	}
	const commentLabel = create("label", { className: "comment-label" })
	commentLabel.append(create("span", { text: "Optional comment" }))
	const comment = create("textarea", {
		name: "comment",
		maxlength: "2000",
		rows: "5",
		placeholder: "What most supports or limits this complete treatment?",
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
		create("h2", { text: state.review.mode === "absolute" ? "Complete treatment" : "A/B comparison" }),
	)
	heading.append(title, create("output", {
		className: "case-state",
		text: state.feedback.has(reviewCase.caseId) ? "Saved" : "Not reviewed",
	}))
	article.append(heading)
	const previews = create("section", {
		className: state.review.mode === "absolute" ? "preview-single" : "preview-pair",
		"aria-label": "Complete treatments",
	})
	if (state.review.mode === "absolute") {
		previews.append(renderTreatment(reviewCase, reviewCase.treatment, "Complete treatment"))
	} else {
		for (const side of SIDES) {
			const identity = reviewCase.assignment?.[side]
			previews.append(renderTreatment(reviewCase, reviewCase.options[side],
				identity ? `Option ${side} / ${identity}` : `Option ${side}`))
		}
	}
	article.append(previews, renderAssessment(draft))
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

function selected(form, name) {
	return form.querySelector(`input[name="${name}"]:checked`)?.value ?? null
}

function checked(form, name) {
	return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value)
}

function readCurrentDraft() {
	const reviewCase = state.review.cases[state.index]
	const form = currentForm()
	const draft = state.review.mode === "absolute" ? {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		quality: selected(form, "quality"),
		issues: checked(form, "issues"),
		comment: form.querySelector('textarea[name="comment"]').value,
	} : {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.sourceSha256,
		qualityA: selected(form, "qualityA"),
		qualityB: selected(form, "qualityB"),
		comparison: selected(form, "comparison"),
		issuesA: checked(form, "issuesA"),
		issuesB: checked(form, "issuesB"),
		comment: form.querySelector('textarea[name="comment"]').value,
	}
	state.drafts.set(reviewCase.caseId, draft)
	return draft
}

function complete(draft) {
	return state.review.mode === "absolute"
		? QUALITY_VALUES.includes(draft.quality)
		: QUALITY_VALUES.includes(draft.qualityA) && QUALITY_VALUES.includes(draft.qualityB) &&
			COMPARISON_VALUES.includes(draft.comparison)
}

function setStatus(message, caseId) {
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
		const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
		if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
		return result
	}
	const result = state.mutationQueue.then(write, write)
	state.mutationQueue = result.then(() => undefined, () => undefined)
	return result
}

async function saveCurrent(advance) {
	window.clearTimeout(state.autoSaveTimer)
	const payload = readCurrentDraft()
	if (!complete(payload)) {
		setStatus("Complete the required judgment before saving.", payload.caseId)
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
		if (state.review.cases[state.index].caseId === payload.caseId) {
			elements.review.querySelector(".case-state").textContent = "Saved"
		}
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
		setStatus("Not saved: complete the required judgment.", draft.caseId)
		return
	}
	setStatus("Changes pending...", draft.caseId)
	state.autoSaveTimer = window.setTimeout(() => saveCurrent(false), 600)
}

function navigate(amount) {
	window.clearTimeout(state.autoSaveTimer)
	if (currentForm()) {
		const draft = readCurrentDraft()
		if (complete(draft)) void saveCurrent(false)
	}
	state.index = Math.max(0, Math.min(state.review.cases.length - 1, state.index + amount))
	render()
}

elements.review.addEventListener("change", scheduleAutoSave)
elements.review.addEventListener("input", (event) => {
	if (event.target.matches("textarea")) scheduleAutoSave()
})
elements.review.addEventListener("submit", (event) => {
	event.preventDefault()
	void saveCurrent(true)
})
elements.previous.addEventListener("click", () => navigate(-1))
elements.next.addEventListener("click", () => navigate(1))
document.addEventListener("keydown", (event) => {
	if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey ||
		event.target.matches("input, textarea, button, select")) return
	if (event.key === "ArrowLeft") navigate(-1)
	if (event.key === "ArrowRight") navigate(1)
})

async function load() {
	try {
		const [reviewResponse, feedbackResponse] = await Promise.all([
			fetch("/api/review", { cache: "no-store" }),
			fetch("/api/feedback", { cache: "no-store" }),
		])
		if (!reviewResponse.ok) throw new Error("Could not load the review")
		if (!feedbackResponse.ok) throw new Error("Could not load saved feedback")
		state.review = await reviewResponse.json()
		const store = await feedbackResponse.json()
		if (!["absolute", "pairwise"].includes(state.review.mode) ||
			!Array.isArray(state.review.cases) || state.review.cases.length < 1) {
			throw new Error("Review payload is invalid")
		}
		state.feedback = new Map(store.entries.map((entry) => [entry.caseId, entry]))
		const firstIncomplete = state.review.cases.findIndex((entry) => !state.feedback.has(entry.caseId))
		state.index = firstIncomplete < 0 ? 0 : firstIncomplete
		elements.title.textContent = state.review.title
		elements.instruction.textContent = state.review.mode === "absolute"
			? "Judge each complete artwork-driven interface treatment as one coupled role assignment."
			: "Rate A and B independently before comparing them. More than one complete treatment can be valid."
		render()
	} catch (error) {
		elements.review.textContent = error.message || "Could not load review"
		elements.progress.textContent = "Load failed"
	}
}

void load()
