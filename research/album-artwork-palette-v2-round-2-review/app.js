const QUALITY_LABELS = ["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"]
const ISSUE_TAGS = ["missing gradient", "extraneous gradient", "incomplete artwork identity"]
const ROLE_NAMES = ["background", "surface", "foreground", "accent"]

const state = {
	manifest: null,
	feedback: null,
	caseIndex: 0,
	alternativeIndex: 0,
}

const elements = {
	progress: document.querySelector("#progress"),
	caseTitle: document.querySelector("#case-title"),
	previousCase: document.querySelector("#previous-case"),
	nextCase: document.querySelector("#next-case"),
	alternatives: document.querySelector("#alternatives"),
	preview: document.querySelector("#preview"),
	qualityOptions: document.querySelector("#quality-options"),
	issueOptions: document.querySelector("#issue-options"),
	comment: document.querySelector("#comment"),
	assessmentSelection: document.querySelector("#assessment-selection"),
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

function currentTreatment() {
	return currentCase().alternatives[state.alternativeIndex]
}

function currentPresentation() {
	const treatment = currentTreatment()
	return currentCase().presentations.find(({ treatmentId }) => treatmentId === treatment.id)
}

function feedbackEntry(reviewCase) {
	let entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	if (!entry) {
		entry = {
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.sourceSha256,
			selectedTreatmentId: reviewCase.winnerTreatmentId,
			alsoValidTreatmentIds: [],
			quality: null,
			tags: [],
			comment: "",
		}
		state.feedback.entries.push(entry)
	}
	return entry
}

function selectCurrentEntry() {
	const reviewCase = currentCase()
	const entry = feedbackEntry(reviewCase)
	const index = reviewCase.alternatives.findIndex(({ id }) => id === entry.selectedTreatmentId)
	state.alternativeIndex = index < 0 ? 0 : index
}

function roleStatus(role, treatment) {
	const statuses = []
	if (role === "surface" && treatment.collapse.surface) statuses.push("collapsed to background")
	if (role === "accent" && treatment.collapse.accent) statuses.push("collapsed to foreground")
	if (treatment[role].generated) statuses.push("generated*")
	return statuses.join(" · ")
}

function renderAlternatives() {
	elements.alternatives.replaceChildren()
	const reviewCase = currentCase()
	const entry = feedbackEntry(reviewCase)
	for (const [index, treatment] of reviewCase.alternatives.entries()) {
		const presentation = reviewCase.presentations.find(({ treatmentId }) => treatment.id)
		const wrapper = create("div", { className: "alternative-choice" })
		const button = create("button", {
			type: "button",
			className: "alternative",
			"aria-current": index === state.alternativeIndex ? "true" : "false",
		})
		const labels = []
		if (treatment.id === reviewCase.winnerTreatmentId) labels.push("candidate winner")
		if (treatment.id === entry.selectedTreatmentId) labels.push("strongest")
		if (entry.alsoValidTreatmentIds.includes(treatment.id)) labels.push("also valid")
		button.append(create("strong", { text: `Alternative ${index + 1}${labels.length ? ` · ${labels.join(" · ")}` : ""}` }))
		button.append(create("span", {
			text: ROLE_NAMES.map((role) => `${role}: ${presentation.roles[role].nearestName}`).join(" · "),
		}))
		button.addEventListener("click", () => {
			state.alternativeIndex = index
			render()
		})
		const choices = create("div", { className: "direction-choices" })
		const strongestLabel = create("label")
		const strongestInput = create("input", { type: "radio", name: `strongest-${reviewCase.caseId}`, value: treatment.id })
		strongestInput.checked = entry.selectedTreatmentId === treatment.id
		strongestInput.addEventListener("change", () => {
			persistControls()
			if (entry.selectedTreatmentId !== treatment.id) {
				entry.selectedTreatmentId = treatment.id
				entry.alsoValidTreatmentIds = entry.alsoValidTreatmentIds.filter((id) => id !== treatment.id)
				entry.quality = null
				entry.tags = []
				entry.comment = ""
			}
			state.alternativeIndex = index
			render()
		})
		strongestLabel.append(strongestInput, document.createTextNode("strongest"))
		const alsoValidLabel = create("label")
		const alsoValidInput = create("input", { type: "checkbox", value: treatment.id })
		alsoValidInput.checked = entry.alsoValidTreatmentIds.includes(treatment.id)
		alsoValidInput.disabled = entry.selectedTreatmentId === treatment.id
		alsoValidInput.addEventListener("change", () => {
			entry.alsoValidTreatmentIds = alsoValidInput.checked
				? [...entry.alsoValidTreatmentIds, treatment.id]
				: entry.alsoValidTreatmentIds.filter((id) => id !== treatment.id)
			renderAlternatives()
		})
		alsoValidLabel.append(alsoValidInput, document.createTextNode("also valid"))
		choices.append(strongestLabel, alsoValidLabel)
		wrapper.append(button, choices)
		elements.alternatives.append(wrapper)
	}
}

function renderPreview() {
	const reviewCase = currentCase()
	const treatment = currentTreatment()
	const presentation = currentPresentation()
	const preview = elements.preview
	preview.replaceChildren()
	preview.style.setProperty("--background", treatment.background.hex)
	preview.style.setProperty("--surface", treatment.surface.hex)
	preview.style.setProperty("--foreground", treatment.foreground.hex)
	preview.style.setProperty("--accent", treatment.accent.hex)
	preview.style.background = treatment.gradient
		? `linear-gradient(135deg in oklab, ${treatment.background.hex} 0%, ${treatment.surface.hex} 100%)`
		: treatment.background.hex

	const artworkColumn = create("div", { className: "artwork-column" })
	const backgroundDemo = create("div", { className: "background-demo" })
	backgroundDemo.append(create("p", { className: "background-foreground", text: "Foreground over background" }))
	backgroundDemo.append(create("p", { className: "background-accent", text: "Accent over background" }))
	artworkColumn.append(backgroundDemo)
	artworkColumn.append(create("img", { src: reviewCase.artworkUrl, alt: "Album artwork under review" }))
	const mock = create("div", { className: "mock-interface" })
	const titleBlock = create("div")
	titleBlock.append(create("p", { className: "mock-kicker", text: "Accent over surface" }))
	titleBlock.append(create("h3", { text: "Foreground over surface" }))
	const action = create("div", { className: "accent-action", text: "Play treatment" })
	const roleList = create("div", { className: "role-list" })
	for (const role of ROLE_NAMES) {
		const descriptor = presentation.roles[role]
		const card = create("div", { className: "role-card" })
		const swatch = create("span", {
			className: "role-swatch",
			role: "img",
			"aria-label": `${role}, ${descriptor.nearestName}, ${treatment[role].hex}${roleStatus(role, treatment) ? `, ${roleStatus(role, treatment)}` : ""}`,
			title: `${descriptor.nearestName} ${treatment[role].hex}`,
		})
		swatch.style.setProperty("--role-color", treatment[role].hex)
		const copy = create("div")
		copy.append(create("strong", { text: role }))
		copy.append(create("span", { text: `${descriptor.nearestName} · ${treatment[role].hex}` }))
		if (roleStatus(role, treatment)) copy.append(create("span", { text: roleStatus(role, treatment) }))
		card.append(swatch, copy)
		roleList.append(card)
	}
	mock.append(titleBlock, action, roleList)
	preview.append(artworkColumn, mock)
}

function renderControls() {
	const assessment = feedbackEntry(currentCase())
	const selectedIndex = currentCase().alternatives.findIndex(({ id }) => id === assessment.selectedTreatmentId)
	elements.assessmentSelection.textContent = `Your assessment applies to Alternative ${selectedIndex + 1}, currently marked strongest.`
	elements.qualityOptions.replaceChildren()
	for (const quality of QUALITY_LABELS) {
		const label = create("label")
		const input = create("input", { type: "radio", name: "quality", value: quality })
		input.checked = assessment.quality === quality
		label.append(input, document.createTextNode(quality))
		elements.qualityOptions.append(label)
	}
	elements.issueOptions.replaceChildren()
	for (const tag of ISSUE_TAGS) {
		const label = create("label")
		const input = create("input", { type: "checkbox", value: tag })
		input.checked = assessment.tags.includes(tag)
		label.append(input, document.createTextNode(tag))
		elements.issueOptions.append(label)
	}
	elements.comment.value = assessment.comment
}

function persistControls() {
	if (!state.manifest) return
	const assessment = feedbackEntry(currentCase())
	assessment.quality = elements.qualityOptions.querySelector("input:checked")?.value ?? null
	assessment.tags = [...elements.issueOptions.querySelectorAll("input:checked")].map(({ value }) => value)
	assessment.comment = elements.comment.value
}

function reviewedCount() {
	return state.feedback.entries.reduce((count, entry) =>
		count + (entry.quality === null ? 0 : 1), 0)
}

function render() {
	const reviewCase = currentCase()
	elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} · ${reviewedCount()} of ${state.manifest.cases.length} artwork assessments complete`
	elements.caseTitle.textContent = `Development source ${state.caseIndex + 1}`
	elements.previousCase.disabled = state.caseIndex === 0
	elements.nextCase.disabled = state.caseIndex === state.manifest.cases.length - 1
	elements.saveStatus.textContent = ""
	renderAlternatives()
	renderPreview()
	renderControls()
}

async function save() {
	persistControls()
	const entry = feedbackEntry(currentCase())
	elements.save.disabled = true
	elements.saveStatus.textContent = "Saving…"
	try {
		const response = await fetch("/api/feedback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				caseId: entry.caseId,
				sourceSha256: entry.sourceSha256,
				selectedTreatmentId: entry.selectedTreatmentId,
				alsoValidTreatmentIds: entry.alsoValidTreatmentIds,
				quality: entry.quality,
				tags: entry.tags,
				comment: entry.comment,
			}),
		})
		if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`)
		elements.saveStatus.textContent = "Saved"
		elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} · ${reviewedCount()} of ${state.manifest.cases.length} artwork assessments complete`
	} catch (error) {
		elements.saveStatus.textContent = `Save failed: ${error.message}`
	} finally {
		elements.save.disabled = false
	}
}

function navigate(amount) {
	persistControls()
	state.caseIndex = Math.max(0, Math.min(state.manifest.cases.length - 1, state.caseIndex + amount))
	selectCurrentEntry()
	render()
}

elements.previousCase.addEventListener("click", () => navigate(-1))
elements.nextCase.addEventListener("click", () => navigate(1))
elements.save.addEventListener("click", save)

const [manifestResponse, feedbackResponse] = await Promise.all([fetch("/api/review"), fetch("/api/feedback")])
if (!manifestResponse.ok || !feedbackResponse.ok) throw new Error("Could not load review data")
state.manifest = await manifestResponse.json()
state.feedback = await feedbackResponse.json()
const firstIncomplete = state.manifest.cases.findIndex((reviewCase) => {
	const entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	return !entry || entry.quality === null
})
state.caseIndex = firstIncomplete < 0 ? 0 : firstIncomplete
selectCurrentEntry()
render()
