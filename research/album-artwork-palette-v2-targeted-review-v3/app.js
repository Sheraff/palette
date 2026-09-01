const ROLE_NAMES = ["background", "surface", "foreground", "accent"]
const state = { manifest: null, feedback: null, caseIndex: 0 }

const elements = {
	progress: document.querySelector("#progress"),
	caseTitle: document.querySelector("#case-title"),
	previous: document.querySelector("#previous"),
	next: document.querySelector("#next"),
	options: document.querySelector("#options"),
	noneValid: document.querySelector("#none-valid"),
	uncertain: document.querySelector("#uncertain"),
	preferredOption: document.querySelector("#preferred-option"),
	comment: document.querySelector("#comment"),
	save: document.querySelector("#save"),
	saveStatus: document.querySelector("#save-status"),
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

function currentCase() {
	return state.manifest.cases[state.caseIndex]
}

function feedbackEntry(reviewCase) {
	let entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	if (!entry) {
		entry = {
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.sourceSha256,
			validOptionIds: [],
			preferredOptionId: null,
			noneConfidentlyValid: false,
			uncertain: false,
			comment: "",
		}
		state.feedback.entries.push(entry)
	}
	return entry
}

function roleStatus(role, treatment) {
	const statuses = []
	if (role === "surface" && treatment.collapse.surface) statuses.push("collapsed to background")
	if (role === "accent" && treatment.collapse.accent) statuses.push("collapsed to foreground")
	if (treatment[role].generated) statuses.push("generated*")
	return statuses.join(" / ")
}

function renderOption(option, entry) {
	const treatment = option.treatment
	const wrapper = create("article", { className: "option" })
	const choice = create("label", { className: "option-choice" })
	const checkbox = create("input", { type: "checkbox", value: option.optionId })
	checkbox.checked = entry.validOptionIds.includes(option.optionId)
	choice.append(checkbox, document.createTextNode(`Option ${option.optionId} is independently valid`))
	wrapper.append(choice)
	const preview = create("div", { className: "palette-preview" })
	preview.style.setProperty("--background", treatment.background.hex)
	preview.style.setProperty("--surface", treatment.surface.hex)
	preview.style.setProperty("--foreground", treatment.foreground.hex)
	preview.style.setProperty("--accent", treatment.accent.hex)
	preview.style.background = treatment.gradient
		? `linear-gradient(135deg in oklab, ${treatment.background.hex} 0%, ${treatment.surface.hex} 100%)`
		: treatment.background.hex
	preview.append(create("img", { className: "artwork", src: currentCase().artworkUrl, alt: "Album artwork under review" }))
	const backgroundContent = create("div", { className: "background-content" })
	backgroundContent.append(create("p", { className: "background-accent", text: "Accent over background" }))
	backgroundContent.append(create("h3", { text: "Foreground over the primary field." }))
	preview.append(backgroundContent)
	const surfaceCard = create("div", { className: "surface-card" })
	surfaceCard.append(create("p", { className: "surface-accent", text: "Accent over surface" }))
	surfaceCard.append(create("p", { text: "Small secondary surface." }))
	preview.append(surfaceCard)
	wrapper.append(preview)
	const legend = create("dl", { className: "role-legend" })
	for (const role of ROLE_NAMES) {
		const descriptor = option.presentation.roles[role]
		const roleEntry = create("div", { className: "role-entry" })
		roleEntry.append(create("dt", { text: role }))
		const namedColor = create("dd", { className: "named-color" })
		const sample = create("span", { className: "color-sample", "aria-hidden": "true" })
		sample.style.backgroundColor = treatment[role].hex
		namedColor.append(sample, document.createTextNode(`${descriptor.nearestName} / ${treatment[role].hex}`))
		roleEntry.append(namedColor)
		if (roleStatus(role, treatment)) roleEntry.append(create("dd", { text: roleStatus(role, treatment) }))
		legend.append(roleEntry)
	}
	wrapper.append(legend)
	return wrapper
}

function checkedOptionIds() {
	return [...elements.options.querySelectorAll("input[type=checkbox]:checked")].map(({ value }) => value)
}

function refreshPreferenceOptions(preferredOptionId = elements.preferredOption.value || null) {
	const validOptionIds = checkedOptionIds()
	const options = [create("option", { value: "", text: "No preference" })]
	for (const optionId of validOptionIds) options.push(create("option", { value: optionId, text: `Option ${optionId}` }))
	elements.preferredOption.replaceChildren(...options)
	elements.preferredOption.value = preferredOptionId && validOptionIds.includes(preferredOptionId) ? preferredOptionId : ""
	elements.preferredOption.disabled = validOptionIds.length === 0
}

function persistControls() {
	if (!state.manifest) return
	const entry = feedbackEntry(currentCase())
	entry.validOptionIds = checkedOptionIds()
	entry.preferredOptionId = entry.validOptionIds.includes(elements.preferredOption.value) ? elements.preferredOption.value : null
	entry.noneConfidentlyValid = elements.noneValid.checked
	entry.uncertain = elements.uncertain.checked
	entry.comment = elements.comment.value
}

function completedCount() {
	return state.feedback.entries.filter(({ validOptionIds, noneConfidentlyValid, uncertain }) =>
		validOptionIds.length > 0 || noneConfidentlyValid || uncertain).length
}

function render() {
	const reviewCase = currentCase()
	const entry = feedbackEntry(reviewCase)
	elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} / ${completedCount()} complete`
	elements.caseTitle.textContent = `Development source ${state.caseIndex + 1}`
	elements.previous.disabled = state.caseIndex === 0
	elements.next.disabled = state.caseIndex === state.manifest.cases.length - 1
	elements.saveStatus.textContent = ""
	elements.options.replaceChildren(...reviewCase.options.map((option) => renderOption(option, entry)))
	elements.noneValid.checked = entry.noneConfidentlyValid
	elements.uncertain.checked = entry.uncertain
	refreshPreferenceOptions(entry.preferredOptionId)
	elements.comment.value = entry.comment
}

elements.options.addEventListener("change", (event) => {
	if (!event.target.matches("input[type=checkbox]")) return
	if (event.target.checked) {
		elements.noneValid.checked = false
		elements.uncertain.checked = false
	}
	refreshPreferenceOptions()
})

for (const fallback of [elements.noneValid, elements.uncertain]) {
	fallback.addEventListener("change", () => {
		if (!fallback.checked) return
		for (const option of elements.options.querySelectorAll("input[type=checkbox]")) option.checked = false
		if (fallback === elements.noneValid) elements.uncertain.checked = false
		else elements.noneValid.checked = false
		refreshPreferenceOptions(null)
	})
}

async function save() {
	persistControls()
	const entry = feedbackEntry(currentCase())
	if (entry.validOptionIds.length === 0 && !entry.noneConfidentlyValid && !entry.uncertain) {
		elements.saveStatus.textContent = "Mark valid options, none confidently valid, or uncertain."
		return
	}
	elements.save.disabled = true
	elements.saveStatus.textContent = "Saving..."
	try {
		const response = await fetch("/api/feedback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry),
		})
		if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`)
		elements.saveStatus.textContent = "Saved"
		elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} / ${completedCount()} complete`
	} catch (error) {
		elements.saveStatus.textContent = `Save failed: ${error.message}`
	} finally {
		elements.save.disabled = false
	}
}

function navigate(amount) {
	persistControls()
	state.caseIndex = Math.max(0, Math.min(state.manifest.cases.length - 1, state.caseIndex + amount))
	render()
}

elements.previous.addEventListener("click", () => navigate(-1))
elements.next.addEventListener("click", () => navigate(1))
elements.save.addEventListener("click", save)

const [manifestResponse, feedbackResponse] = await Promise.all([fetch("/api/review"), fetch("/api/feedback")])
if (!manifestResponse.ok || !feedbackResponse.ok) throw new Error("Could not load review data")
state.manifest = await manifestResponse.json()
state.feedback = await feedbackResponse.json()
if (state.manifest.cases.length > 4 || state.manifest.cases.some(({ options }) => options.length > 4)) {
	throw new Error("Targeted reviews are limited to four artworks and four options per artwork")
}
const firstIncomplete = state.manifest.cases.findIndex((reviewCase) => {
	const entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	return !entry || entry.validOptionIds.length === 0 && !entry.noneConfidentlyValid && !entry.uncertain
})
state.caseIndex = firstIncomplete < 0 ? 0 : firstIncomplete
render()
