const reasonLabels = {
	background: "Background",
	foreground: "Foreground",
	surface: "Surface",
	accent: "Accent",
	gradient: "Gradient",
	"lacks-artwork-identity": "Artwork identity",
	other: "Other",
}

const elements = {
	summary: document.querySelector("#summary"),
	status: document.querySelector("#status"),
	locked: document.querySelector("#locked"),
	lockedDetail: document.querySelector("#locked-detail"),
	stage: document.querySelector("#absolute-stage"),
	sourcePanel: document.querySelector("#source-panel"),
	image: document.querySelector("#source-image"),
	file: document.querySelector("#source-file"),
	preview: document.querySelector("#theme-preview"),
	surface: document.querySelector("#surface-preview"),
	accent: document.querySelector("#accent-copy"),
	swatches: document.querySelector("#swatches"),
	generatedNote: document.querySelector("#generated-note"),
	metrics: document.querySelector("#metrics"),
	ship: document.querySelector("#ship"),
	rejectForm: document.querySelector("#reject-form"),
	reasons: document.querySelector("#reject-reasons"),
	note: document.querySelector("#note"),
	complete: document.querySelector("#absolute-complete"),
	completeDetail: document.querySelector("#absolute-complete-detail"),
	blocked: document.querySelector("#absolute-blocked"),
	blockedTitle: document.querySelector("#absolute-blocked-title"),
	blockedDetail: document.querySelector("#absolute-blocked-detail"),
	historySection: document.querySelector("#history-section"),
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

function validColor(value) {
	return isObject(value) && /^#[0-9a-f]{6}$/i.test(value.hex) && typeof value.generated === "boolean" &&
		Array.isArray(value.rgb) && value.rgb.length === 3 && value.rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
}

function validPalette(value) {
	return isObject(value) && ["background", "foreground", "surface", "accent"].every((role) => validColor(value[role])) &&
		isObject(value.gradient) && typeof value.gradient.isGradient === "boolean" && Number.isFinite(value.gradient.confidence) &&
		isObject(value.metrics) && ["foregroundContrast", "foregroundSurfaceContrast", "accentContrast"].every((metric) => Number.isFinite(value.metrics[metric]))
}

function candidateProblem(candidate) {
	if (!isObject(candidate) || typeof candidate.file !== "string" || !candidate.file ||
		!Number.isInteger(candidate.width) || candidate.width <= 0 || !Number.isInteger(candidate.height) || candidate.height <= 0) {
		return "The absolute review response contains an invalid source candidate."
	}
	if (!validPalette(candidate.palette)) {
		return `The assigned source ${candidate.file} does not include a valid current palette.`
	}
	return ""
}

function validatePayload(value) {
	if (!isObject(value) || typeof value.algorithmVersion !== "string" || !value.algorithmVersion) {
		throw new Error("Absolute review response is missing its algorithm version.")
	}
	if (!isCount(value.total) || !isCount(value.reviewed) || value.reviewed > value.total) {
		throw new Error("Absolute review response contains invalid review progress.")
	}
	if (!("next" in value) || (value.next !== null && !isObject(value.next))) {
		throw new Error("Absolute review response is missing its next palette state.")
	}
	if (!Array.isArray(value.recent) || value.recent.some((entry) => !isObject(entry) ||
		typeof entry.image !== "string" || typeof entry.shippable !== "boolean" || !Array.isArray(entry.reasons) ||
		entry.reasons.some((reason) => typeof reason !== "string"))) {
		throw new Error("Absolute review response contains invalid review history.")
	}
	return value
}

function validateLockedProgress(value) {
	if (!isObject(value) || !isObject(value.progress)) throw new Error("Locked review response is missing aggregate progress.")
	for (const key of ["target", "accepted", "vetoed", "screened"]) {
		if (!isCount(value.progress[key])) throw new Error(`Locked review response has invalid ${key} progress.`)
	}
	return value.progress
}

async function responseJson(response) {
	const text = await response.text()
	if (!text) return {}
	try {
		return JSON.parse(text)
	} catch {
		if (response.ok) throw new Error("Absolute review API returned malformed JSON.")
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
	return [elements.ship, ...elements.rejectForm.querySelectorAll("button, input, textarea")]
}

function updateInteractiveState() {
	const disabled = mutating || !current || !imageReady || elements.stage.hidden
	for (const control of decisionControls()) control.disabled = disabled
	for (const undo of elements.history.querySelectorAll("button")) undo.disabled = mutating
	elements.rejectForm.setAttribute("aria-busy", String(mutating))
	elements.stage.setAttribute("aria-busy", String(mutating || Boolean(current && !imageReady)))
	elements.sourcePanel.setAttribute("aria-busy", String(Boolean(current && !imageReady)))
}

function readableText(rgb) {
	const channels = rgb.map((value) => {
		const channel = value / 255
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.179 ? "#000" : "#fff"
}

function resetDecision() {
	elements.rejectForm.reset()
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
	elements.preview.style.removeProperty("background")
	elements.preview.style.removeProperty("color")
	elements.surface.style.removeProperty("background")
	elements.surface.style.removeProperty("color")
	elements.surface.style.removeProperty("border-color")
	elements.accent.style.removeProperty("color")
	elements.swatches.replaceChildren()
	elements.metrics.replaceChildren()
	elements.generatedNote.hidden = true
	elements.sourcePanel.setAttribute("aria-busy", "false")
	resetDecision()
	updateInteractiveState()
}

function renderPalette(candidate) {
	const palette = candidate.palette
	const request = ++imageRequest
	current = candidate
	imageReady = false
	resetDecision()
	elements.file.textContent = `${candidate.file} / ${candidate.width} x ${candidate.height}`
	elements.preview.style.background = palette.gradient.isGradient
		? `linear-gradient(in oklch 135deg, ${palette.background.hex} 0 50%, ${palette.surface.hex} 90%)`
		: palette.background.hex
	elements.preview.style.color = palette.foreground.hex
	elements.surface.style.background = palette.surface.hex
	elements.surface.style.color = palette.foreground.hex
	elements.surface.style.borderColor = palette.accent.hex
	elements.accent.style.color = palette.accent.hex

	const roles = ["background", "foreground", "surface", "accent"]
	elements.swatches.replaceChildren(...roles.map((role) => {
		const color = palette[role]
		const swatch = document.createElement("div")
		swatch.className = "swatch"
		swatch.style.background = color.hex
		swatch.style.color = readableText(color.rgb)
		const label = document.createElement("span")
		label.textContent = role
		const value = document.createElement("strong")
		value.textContent = `${color.hex}${color.generated ? " *" : ""}`
		value.setAttribute("aria-label", color.generated ? `${color.hex}, generated fallback color` : color.hex)
		swatch.append(label, value)
		return swatch
	}))
	elements.generatedNote.hidden = !roles.some((role) => palette[role].generated)

	const metricValues = [
		`FG / BG ${palette.metrics.foregroundContrast.toFixed(2)}:1`,
		`FG / surface ${palette.metrics.foregroundSurfaceContrast.toFixed(2)}:1`,
		`Accent / BG ${palette.metrics.accentContrast.toFixed(2)}:1`,
		palette.gradient.isGradient ? `Gradient ${(palette.gradient.confidence * 100).toFixed(0)}%` : "Flat background",
	]
	elements.metrics.replaceChildren(...metricValues.map((copy) => {
		const metric = document.createElement("span")
		metric.textContent = copy
		return metric
	}))

	elements.image.alt = `Source artwork ${candidate.file}`
	elements.image.onload = () => {
		if (request !== imageRequest || current?.file !== candidate.file) return
		imageReady = true
		updateInteractiveState()
		setStatus(`Palette ready for review: ${candidate.file}`)
	}
	elements.image.onerror = () => {
		if (request !== imageRequest || current?.file !== candidate.file) return
		imageReady = false
		updateInteractiveState()
		showError(`Could not load source image ${candidate.file}. Decision controls remain disabled.`)
	}
	elements.image.removeAttribute("src")
	elements.image.src = imageUrl(candidate.file)
	setStatus(`Loading source image: ${candidate.file}`)
	updateInteractiveState()
}

function showBlocked(title, detail, status) {
	clearCandidate()
	elements.stage.hidden = true
	elements.complete.hidden = true
	elements.blocked.hidden = false
	elements.blockedTitle.textContent = title
	elements.blockedDetail.textContent = detail
	setStatus(status, true)
}

function renderAvailability() {
	elements.locked.hidden = true
	elements.historySection.hidden = false
	elements.summary.textContent = `${payload.reviewed} of ${payload.total} reviewed / ${payload.algorithmVersion}`

	if (payload.reviewed === payload.total) {
		clearCandidate()
		elements.stage.hidden = true
		elements.blocked.hidden = true
		elements.complete.hidden = false
		elements.completeDetail.textContent = `All ${payload.total} palettes are reviewed. Undo remains available below.`
		setStatus("Absolute review is complete. Undo a review below to reopen it.")
		return
	}

	elements.complete.hidden = true
	if (payload.next === null) {
		showBlocked(
			"No palette is currently assigned.",
			`${payload.reviewed} of ${payload.total} palettes are reviewed, so this queue is not complete. Refresh after checking the review service.`,
			"Absolute review is incomplete, but no next palette was returned.",
		)
		return
	}

	const problem = candidateProblem(payload.next)
	if (problem) {
		showBlocked("The current palette is unavailable.", `${problem} Review controls remain disabled.`, problem)
		return
	}

	elements.blocked.hidden = true
	elements.stage.hidden = false
	renderPalette(payload.next)
}

function renderHistory() {
	const rows = payload.recent.map((entry) => {
		const row = document.createElement("div")
		row.className = "history-row"
		const copy = document.createElement("div")
		const title = document.createElement("strong")
		title.textContent = entry.image
		const detail = document.createElement("span")
		const reasons = entry.reasons.map((reason) => reasonLabels[reason] || reason)
		const parts = [entry.shippable ? "shippable" : "unshippable"]
		if (reasons.length) parts.push(reasons.join(", "))
		if (typeof entry.note === "string" && entry.note) parts.push(`note: ${entry.note}`)
		detail.textContent = parts.join(" / ")
		copy.append(title, detail)
		const undo = document.createElement("button")
		undo.type = "button"
		undo.textContent = "Undo"
		undo.setAttribute("aria-label", `Undo review for ${entry.image}`)
		undo.addEventListener("click", () => removeReview(entry.image).catch(showError))
		row.append(copy, undo)
		return row
	})
	elements.history.replaceChildren(...rows)
	updateInteractiveState()
}

function renderLocked(result) {
	const progress = validateLockedProgress(result)
	payload = undefined
	clearCandidate()
	elements.locked.hidden = false
	elements.stage.hidden = true
	elements.complete.hidden = true
	elements.blocked.hidden = true
	elements.historySection.hidden = true
	elements.summary.textContent = "Absolute review remains sealed"
	elements.lockedDetail.textContent = `${progress.accepted} of ${progress.target} sources accepted / ${progress.screened} screened / ${progress.vetoed} vetoed.`
	setStatus("Absolute review is locked until source eligibility is complete.")
}

async function load() {
	setStatus("Checking absolute review status...")
	const response = await fetch("/api/absolute")
	const result = await responseJson(response)
	if (response.status === 409) {
		renderLocked(result)
		return
	}
	if (!response.ok) throw new Error(responseError(result, `Absolute review request failed with ${response.status}`))
	payload = validatePayload(result)
	renderHistory()
	renderAvailability()
}

function selectedReasons() {
	return [...elements.reasons.querySelectorAll("input:checked")].map((input) => input.value)
}

async function decide(shippable) {
	if (mutating || !current || !imageReady || elements.stage.hidden) return
	const candidate = current
	const note = elements.note.value.trim()
	const reasons = shippable ? [] : selectedReasons()
	if (!shippable && reasons.length === 0) {
		showError("Choose at least one issue to mark the palette unshippable.")
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
	setStatus(shippable ? "Saving shippable review..." : "Saving unshippable review...")
	let saved = false
	try {
		const response = await fetch("/api/absolute", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ image: candidate.file, shippable, reasons, note }),
		})
		saved = response.ok
		const result = await responseJson(response)
		if (!response.ok) throw new Error(responseError(result, `Review failed with ${response.status}`))
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

async function removeReview(image) {
	if (mutating) return
	mutating = true
	updateInteractiveState()
	setStatus(`Undoing review for ${image}...`)
	let removed = false
	try {
		const response = await fetch(`/api/absolute?image=${encodeURIComponent(image)}`, { method: "DELETE" })
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
elements.ship.addEventListener("click", () => decide(true).catch(showError))
elements.rejectForm.addEventListener("submit", (event) => {
	event.preventDefault()
	decide(false).catch(showError)
})

updateNoteRequirement()
updateInteractiveState()
load().catch(showError)
