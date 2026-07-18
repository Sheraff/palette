const reasonLabels = {
	"not-artwork": "Not artwork",
	"unusable-quality": "Unusable quality",
	"out-of-distribution": "Out of distribution",
	"corrupt-or-incomplete": "Corrupt or incomplete",
	duplicate: "Duplicate",
	other: "Other",
}

const elements = {
	summary: document.querySelector("#summary"),
	status: document.querySelector("#status"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#review-stage"),
	sourcePanel: document.querySelector("#source-panel"),
	imageState: document.querySelector("#image-state"),
	image: document.querySelector("#source-image"),
	file: document.querySelector("#source-file"),
	size: document.querySelector("#source-size"),
	include: document.querySelector("#include"),
	vetoForm: document.querySelector("#veto-form"),
	reasons: document.querySelector("#veto-reasons"),
	note: document.querySelector("#note"),
	complete: document.querySelector("#curation-complete"),
	completeTitle: document.querySelector("#curation-complete-title"),
	completeDetail: document.querySelector("#curation-complete-detail"),
	absoluteLink: document.querySelector("#absolute-link"),
	blocked: document.querySelector("#curation-blocked"),
	blockedLabel: document.querySelector("#curation-blocked-label"),
	blockedTitle: document.querySelector("#curation-blocked-title"),
	blockedDetail: document.querySelector("#curation-blocked-detail"),
	historyNote: document.querySelector("#history-note"),
	history: document.querySelector("#history"),
}

let payload
let current
let imageReady = false
let imageRequest = 0
let mutating = false

for (const [value, label] of Object.entries(reasonLabels)) {
	const item = document.createElement("label")
	item.className = "reason-option"
	const input = document.createElement("input")
	input.type = "checkbox"
	input.name = "reason"
	input.value = value
	const copy = document.createElement("span")
	copy.textContent = label
	item.append(input, copy)
	elements.reasons.append(item)
}

function imageUrl(file) {
	return `/images/${encodeURIComponent(file)}`
}

function isObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isCount(value) {
	return Number.isInteger(value) && value >= 0
}

function validatePayload(value) {
	if (!isObject(value) || !isObject(value.progress)) throw new Error("Curation response is missing aggregate progress.")
	for (const key of ["target", "accepted", "vetoed", "screened"]) {
		if (!isCount(value.progress[key])) throw new Error(`Curation response has invalid ${key} progress.`)
	}
	if (value.progress.accepted > value.progress.target) throw new Error("Curation response has invalid accepted progress.")
	if (typeof value.progress.complete !== "boolean") throw new Error("Curation response is missing completion status.")
	if (typeof value.exhausted !== "boolean") throw new Error("Curation response is missing reserve status.")
	if (typeof value.frozen !== "boolean") throw new Error("Curation response is missing frozen status.")
	if (value.next !== null) {
		if (!isObject(value.next) || typeof value.next.file !== "string" || !value.next.file ||
			typeof value.next.sha256 !== "string" || !Number.isInteger(value.next.width) || value.next.width <= 0 ||
			!Number.isInteger(value.next.height) || value.next.height <= 0) {
			throw new Error("Curation response contains an invalid source candidate.")
		}
	}
	if (!Array.isArray(value.recent) || value.recent.some((entry) => !isObject(entry) ||
		typeof entry.image !== "string" || !["include", "veto"].includes(entry.decision) || !Array.isArray(entry.reasons) ||
		entry.reasons.some((reason) => typeof reason !== "string"))) {
		throw new Error("Curation response contains invalid decision history.")
	}
	return value
}

async function responseJson(response) {
	const text = await response.text()
	if (!text) return {}
	try {
		return JSON.parse(text)
	} catch {
		if (response.ok) throw new Error("Curation API returned malformed JSON.")
		return {}
	}
}

function responseError(result, fallback) {
	return isObject(result) && typeof result.error === "string" ? result.error : fallback
}

function setStatus(message, error = false) {
	elements.status.textContent = message
	elements.status.classList.toggle("error", error)
	elements.status.setAttribute("role", error ? "alert" : "status")
	elements.status.setAttribute("aria-live", error ? "assertive" : "polite")
}

function showError(error) {
	setStatus(error instanceof Error ? error.message : String(error), true)
}

function decisionControls() {
	return [elements.include, ...elements.vetoForm.querySelectorAll("button, input, textarea")]
}

function updateInteractiveState() {
	const disabled = mutating || !current || !imageReady || elements.stage.hidden
	for (const control of decisionControls()) control.disabled = disabled
	for (const undo of elements.history.querySelectorAll("button")) undo.disabled = mutating || payload?.frozen === true
	elements.vetoForm.setAttribute("aria-busy", String(mutating))
	elements.stage.setAttribute("aria-busy", String(mutating || Boolean(current && !imageReady)))
	elements.sourcePanel.setAttribute("aria-busy", String(Boolean(current && !imageReady)))
}

function progressCard(label, value, detail, fraction) {
	const card = document.createElement("article")
	card.className = "progress-card"
	const name = document.createElement("span")
	name.textContent = label
	const count = document.createElement("strong")
	count.textContent = value
	const description = document.createElement("small")
	description.textContent = detail
	card.append(name, count, description)
	if (fraction !== undefined) {
		const bar = document.createElement("div")
		bar.setAttribute("role", "progressbar")
		bar.setAttribute("aria-label", "Accepted source progress")
		bar.setAttribute("aria-valuemin", "0")
		bar.setAttribute("aria-valuemax", String(payload.progress.target))
		bar.setAttribute("aria-valuenow", String(payload.progress.accepted))
		const fill = document.createElement("i")
		fill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`
		bar.append(fill)
		card.append(bar)
	}
	return card
}

function renderProgress() {
	const progress = payload.progress
	const acceptedFraction = progress.target === 0 ? 1 : progress.accepted / progress.target
	elements.progress.replaceChildren(
		progressCard("Accepted", `${progress.accepted} / ${progress.target}`, progress.complete ? "Eligibility target reached" : "Sources retained for the corpus", acceptedFraction),
		progressCard("Screened", String(progress.screened), "Total source decisions recorded"),
		progressCard("Vetoed", String(progress.vetoed), "Sources excluded and replaced"),
	)
	elements.summary.textContent = `${progress.accepted} of ${progress.target} sources accepted / ${progress.screened} screened / ${progress.vetoed} vetoed`
}

function resetDecision() {
	elements.vetoForm.reset()
	elements.note.removeAttribute("aria-invalid")
	elements.note.setAttribute("aria-required", "false")
}

function updateNoteRequirement() {
	const required = elements.reasons.querySelector('input[value="other"]')?.checked === true
	elements.note.setAttribute("aria-required", String(required))
	if (!required) elements.note.removeAttribute("aria-invalid")
}

function clearCandidate() {
	imageRequest += 1
	current = undefined
	imageReady = false
	elements.image.onload = null
	elements.image.onerror = null
	elements.image.removeAttribute("src")
	elements.image.alt = ""
	elements.file.textContent = ""
	elements.size.textContent = ""
	elements.imageState.textContent = "Awaiting image"
	elements.sourcePanel.setAttribute("aria-busy", "false")
	resetDecision()
	updateInteractiveState()
}

function renderCandidate(candidate) {
	const request = ++imageRequest
	current = candidate
	imageReady = false
	resetDecision()
	elements.file.textContent = candidate.file
	elements.size.textContent = `${candidate.width} x ${candidate.height} / sha256 ${candidate.sha256.slice(0, 12)}`
	elements.imageState.textContent = "Loading image"
	elements.image.alt = `Source artwork candidate ${candidate.file}`
	elements.image.onload = () => {
		if (request !== imageRequest || current?.file !== candidate.file) return
		imageReady = true
		elements.imageState.textContent = "Image ready"
		updateInteractiveState()
		setStatus(`Source ready for decision: ${candidate.file}`)
	}
	elements.image.onerror = () => {
		if (request !== imageRequest || current?.file !== candidate.file) return
		imageReady = false
		elements.imageState.textContent = "Image failed"
		updateInteractiveState()
		showError(`Could not load source image ${candidate.file}. Decision controls remain disabled.`)
	}
	elements.image.removeAttribute("src")
	elements.image.src = imageUrl(candidate.file)
	setStatus(`Loading source image: ${candidate.file}`)
	updateInteractiveState()
}

function renderAvailability() {
	const progress = payload.progress
	if (progress.complete) {
		clearCandidate()
		elements.stage.hidden = true
		elements.blocked.hidden = true
		elements.complete.hidden = false
		if (payload.frozen) {
			elements.completeTitle.textContent = "The source corpus is permanently frozen."
			elements.completeDetail.textContent = `${progress.accepted} accepted sources are fixed because palette output has been opened. Eligibility decisions can no longer be undone.`
			elements.absoluteLink.textContent = "Continue absolute review"
			setStatus("The source corpus is permanently frozen because palette output has been opened.")
		} else {
			elements.completeTitle.textContent = "The source corpus is complete."
			elements.completeDetail.textContent = `${progress.accepted} accepted sources are ready for absolute review. Decisions can be undone below until palette output is opened.`
			elements.absoluteLink.textContent = "Begin absolute review"
			setStatus("Source eligibility is complete. Undo remains available until palette output is opened.")
		}
		return
	}

	elements.complete.hidden = true
	if (payload.next) {
		elements.blocked.hidden = true
		elements.stage.hidden = false
		renderCandidate(payload.next)
		return
	}

	clearCandidate()
	elements.stage.hidden = true
	elements.blocked.hidden = false
	if (payload.exhausted) {
		elements.blockedLabel.textContent = "Reserve exhausted"
		elements.blockedTitle.textContent = "No reserve sources remain."
		elements.blockedDetail.textContent = `Eligibility is incomplete at ${progress.accepted} of ${progress.target} accepted sources. More source reserves are required before screening can continue.`
		setStatus("Screening is blocked because the source reserves are exhausted.", true)
	} else {
		elements.blockedLabel.textContent = "Screening blocked"
		elements.blockedTitle.textContent = "No source is currently assigned."
		elements.blockedDetail.textContent = `Eligibility is incomplete at ${progress.accepted} of ${progress.target} accepted sources. Refresh after checking the curation service.`
		setStatus("Screening is incomplete, but no next source was returned.", true)
	}
	updateInteractiveState()
}

function renderHistory() {
	if (payload.frozen) {
		elements.historyNote.textContent = "Palette output has been opened; eligibility decisions are permanently frozen."
	} else if (payload.progress.complete) {
		elements.historyNote.textContent = "Undo remains available until palette output is opened."
	} else {
		elements.historyNote.textContent = "Undo removes a decision and reopens source screening."
	}
	const rows = payload.recent.map((entry) => {
		const row = document.createElement("div")
		row.className = "history-row"
		const copy = document.createElement("div")
		const title = document.createElement("strong")
		title.textContent = entry.image
		const detail = document.createElement("span")
		const reasons = entry.reasons.map((reason) => reasonLabels[reason] || reason)
		const parts = [entry.decision === "include" ? "accepted" : "vetoed"]
		if (reasons.length) parts.push(reasons.join(", "))
		if (typeof entry.note === "string" && entry.note) parts.push(`note: ${entry.note}`)
		detail.textContent = parts.join(" / ")
		copy.append(title, detail)
		const undo = document.createElement("button")
		undo.type = "button"
		undo.textContent = "Undo"
		undo.setAttribute("aria-label", payload.frozen
			? `Undo unavailable for ${entry.image}; corpus frozen after palette output opened`
			: `Undo decision for ${entry.image}`)
		if (payload.frozen) undo.title = "Unavailable because palette output has been opened"
		undo.addEventListener("click", () => removeDecision(entry.image).catch(showError))
		row.append(copy, undo)
		return row
	})
	elements.history.replaceChildren(...rows)
	updateInteractiveState()
}

async function load() {
	setStatus("Loading source eligibility...")
	const response = await fetch("/api/curation")
	const result = await responseJson(response)
	if (!response.ok) throw new Error(responseError(result, `Curation request failed with ${response.status}`))
	payload = validatePayload(result)
	renderProgress()
	renderHistory()
	renderAvailability()
}

function selectedReasons() {
	return [...elements.reasons.querySelectorAll("input:checked")].map((input) => input.value)
}

async function decide(decision) {
	if (mutating || !current || !imageReady || elements.stage.hidden) return
	const candidate = current
	const note = elements.note.value.trim()
	const reasons = decision === "veto" ? selectedReasons() : []
	if (decision === "veto" && reasons.length === 0) {
		showError("Choose at least one veto reason.")
		elements.reasons.querySelector("input")?.focus()
		return
	}
	if (reasons.includes("other") && !note) {
		elements.note.setAttribute("aria-invalid", "true")
		showError("Add a note when Other is selected.")
		elements.note.focus()
		return
	}

	elements.note.removeAttribute("aria-invalid")
	mutating = true
	updateInteractiveState()
	setStatus(decision === "include" ? "Saving accepted source..." : "Saving veto...")
	let saved = false
	try {
		const response = await fetch("/api/curation", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ image: candidate.file, decision, reasons, note }),
		})
		saved = response.ok
		const result = await responseJson(response)
		if (!response.ok) throw new Error(responseError(result, `Decision failed with ${response.status}`))
		clearCandidate()
		elements.stage.hidden = true
		await load()
	} catch (error) {
		if (saved) {
			clearCandidate()
			elements.stage.hidden = true
		}
		throw error
	} finally {
		mutating = false
		updateInteractiveState()
	}
}

async function removeDecision(image) {
	if (mutating || payload?.frozen) return
	mutating = true
	updateInteractiveState()
	setStatus(`Undoing decision for ${image}...`)
	let removed = false
	try {
		const response = await fetch(`/api/curation?image=${encodeURIComponent(image)}`, { method: "DELETE" })
		removed = response.ok
		const result = await responseJson(response)
		if (!response.ok) throw new Error(responseError(result, `Undo failed with ${response.status}`))
		clearCandidate()
		elements.stage.hidden = true
		await load()
	} catch (error) {
		if (removed) {
			clearCandidate()
			elements.stage.hidden = true
		}
		throw error
	} finally {
		mutating = false
		updateInteractiveState()
	}
}

elements.note.addEventListener("input", () => {
	if (elements.note.value.trim()) elements.note.removeAttribute("aria-invalid")
})
elements.reasons.addEventListener("change", updateNoteRequirement)
elements.include.addEventListener("click", () => decide("include").catch(showError))
elements.vetoForm.addEventListener("submit", (event) => {
	event.preventDefault()
	decide("veto").catch(showError)
})

updateNoteRequirement()
updateInteractiveState()
load().catch(showError)
