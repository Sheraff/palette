const QUALITY_LABELS = ["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"]
const ROLE_NAMES = ["background", "surface", "foreground", "accent"]

const state = { manifest: null, feedback: null, caseIndex: 0 }

const elements = {
	progress: document.querySelector("#progress"),
	caseTitle: document.querySelector("#case-title"),
	previous: document.querySelector("#previous"),
	next: document.querySelector("#next"),
	preview: document.querySelector("#preview"),
	roleLegend: document.querySelector("#role-legend"),
	qualityOptions: document.querySelector("#quality-options"),
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

function currentTreatment() {
	const reviewCase = currentCase()
	return reviewCase.alternatives.find(({ id }) => id === reviewCase.winnerTreatmentId)
}

function currentPresentation() {
	const treatment = currentTreatment()
	return currentCase().presentations.find(({ treatmentId }) => treatment.id)
}

function feedbackEntry(reviewCase) {
	let entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	if (!entry) {
		entry = {
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.sourceSha256,
			treatmentId: reviewCase.winnerTreatmentId,
			quality: null,
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
	return statuses.join(" · ")
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
	preview.append(create("img", { className: "artwork", src: reviewCase.artworkUrl, alt: "Album artwork under review" }))
	const backgroundContent = create("div", { className: "background-content" })
	backgroundContent.append(create("p", { className: "background-accent", text: "Accent over background" }))
	backgroundContent.append(create("h3", { text: "Foreground over the primary field." }))
	backgroundContent.append(create("p", {
		className: "background-copy",
		text: "Most application content lives here, so this area carries the visual judgment.",
	}))
	preview.append(backgroundContent)
	const surfaceCard = create("div", { className: "surface-card" })
	surfaceCard.append(create("p", { className: "surface-accent", text: "Accent over surface" }))
	surfaceCard.append(create("p", { text: "Foreground over a small secondary surface." }))
	preview.append(surfaceCard)

	elements.roleLegend.replaceChildren()
	for (const role of ROLE_NAMES) {
		const descriptor = presentation.roles[role]
		const entry = create("div", { className: "role-entry" })
		entry.append(create("dt", { text: role }))
		const namedColor = create("dd", { className: "named-color" })
		const sample = create("span", { className: "color-sample", "aria-hidden": "true" })
		sample.style.backgroundColor = treatment[role].hex
		namedColor.append(sample, document.createTextNode(`${descriptor.nearestName} · ${treatment[role].hex}`))
		entry.append(namedColor)
		if (roleStatus(role, treatment)) entry.append(create("dd", { text: roleStatus(role, treatment) }))
		elements.roleLegend.append(entry)
	}
}

function renderControls() {
	const entry = feedbackEntry(currentCase())
	elements.qualityOptions.replaceChildren()
	for (const quality of QUALITY_LABELS) {
		const label = create("label")
		const input = create("input", { type: "radio", name: "quality", value: quality })
		input.checked = entry.quality === quality
		label.append(input, document.createTextNode(quality))
		elements.qualityOptions.append(label)
	}
	elements.comment.value = entry.comment
}

function persistControls() {
	if (!state.manifest) return
	const entry = feedbackEntry(currentCase())
	entry.quality = elements.qualityOptions.querySelector("input:checked")?.value ?? null
	entry.comment = elements.comment.value
}

function completedCount() {
	return state.feedback.entries.filter(({ quality }) => quality !== null).length
}

function render() {
	elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} · ${completedCount()} complete`
	elements.caseTitle.textContent = `Development source ${state.caseIndex + 1}`
	elements.previous.disabled = state.caseIndex === 0
	elements.next.disabled = state.caseIndex === state.manifest.cases.length - 1
	elements.saveStatus.textContent = ""
	renderPreview()
	renderControls()
}

async function save() {
	persistControls()
	const entry = feedbackEntry(currentCase())
	if (entry.quality === null) {
		elements.saveStatus.textContent = "Choose one quality rating before saving."
		return
	}
	elements.save.disabled = true
	elements.saveStatus.textContent = "Saving…"
	try {
		const response = await fetch("/api/feedback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry),
		})
		if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`)
		elements.saveStatus.textContent = "Saved"
		elements.progress.textContent = `Artwork ${state.caseIndex + 1} of ${state.manifest.cases.length} · ${completedCount()} complete`
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
if (state.manifest.cases.length > 12) throw new Error("Broad lightweight reviews are limited to 12 artworks")
const firstIncomplete = state.manifest.cases.findIndex((reviewCase) => {
	const entry = state.feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	return !entry || entry.quality === null
})
state.caseIndex = firstIncomplete < 0 ? 0 : firstIncomplete
render()
