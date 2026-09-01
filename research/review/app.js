const state = {
	allEntries: [],
	previousEntries: new Map(),
	entries: [],
	feedback: [],
	carriedReviews: new Set(),
	index: 0,
	comparison: "iteration",
	iterationOnly: false,
	assignments: new Map(),
	algorithmVersion: "",
	presentationVersion: 0,
	preference: null,
	ship: null,
}

function rgbToOklab(rgb) {
	const linear = rgb.map((value) => {
		const channel = value / 255
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	})
	const l = Math.cbrt(0.4122214708 * linear[0] + 0.5363325363 * linear[1] + 0.0514459929 * linear[2])
	const m = Math.cbrt(0.2119034982 * linear[0] + 0.6806995451 * linear[1] + 0.1073969566 * linear[2])
	const s = Math.cbrt(0.0883024619 * linear[0] + 0.2817188376 * linear[1] + 0.6299787005 * linear[2])
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

function palettesDiffer(first, second) {
	if (first.gradient.isGradient !== second.gradient.isGradient) return true
	return ["background", "foreground", "surface", "accent"].some((role) => {
		const a = rgbToOklab(first[role].rgb)
		const b = rgbToOklab(second[role].rgb)
		return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.025
	})
}

function selectComparison(comparison) {
	if (state.iterationOnly && comparison !== "iteration") return
	state.comparison = comparison
	const completed = new Set(state.feedback
		.filter((item) => item.reviewSchema === 2 && item.algorithmVersion === state.algorithmVersion &&
			item.presentationVersion === state.presentationVersion && item.comparison === comparison)
		.map((item) => item.image))
	state.entries = state.allEntries.filter((entry) => {
		if (!entry.review) return false
		if (comparison === "iteration" && !state.previousEntries.has(entry.file)) return false
		if (completed.has(entry.file)) return false
		if (state.carriedReviews.has(`${comparison}:${entry.file}`)) return false
		const pair = methodsForComparison(comparison)
		return palettesDiffer(paletteFor(entry, pair[0]), paletteFor(entry, pair[1]))
	})
	state.index = state.entries.length === 0 ? -1 : 0
}

const artwork = document.querySelector("#artwork")
const artworkName = document.querySelector("#artwork-name")
const candidates = document.querySelector("#candidates")
const progress = document.querySelector("#progress")
const status = document.querySelector("#status")
const submit = document.querySelector("#submit")
const note = document.querySelector("#note")
const previousButton = document.querySelector("#previous")
const skipButton = document.querySelector("#skip")
const comparisonButton = document.querySelector("#comparison")
const galleryLink = document.querySelector("#gallery-link")
const reasonInputs = [...document.querySelectorAll('#reasons input[type="checkbox"]')]
const preferenceButtons = [...document.querySelectorAll("[data-preference]")]
const shipButtons = [...document.querySelectorAll("[data-ship]")]

function hash(value) {
	let result = 2166136261
	for (let index = 0; index < value.length; index++) {
		result = Math.imul(result ^ value.charCodeAt(index), 16777619)
	}
	return result >>> 0
}

function methodsFor(entry) {
	if (state.iterationOnly) return state.assignments.get(entry.file)
	const pair = methodsForComparison(state.comparison)
	return hash(`${entry.file}:${state.comparison}`) % 2 === 0 ? pair : pair.reverse()
}

function methodsForComparison(comparison) {
	if (comparison === "iteration") return ["spatial", "previous"]
	if (comparison === "baseline") return ["spatial", "quantized"]
	return ["spatial", "expressive"]
}

function paletteFor(entry, method) {
	if (method !== "previous") return entry.extraction.methods[method]
	return state.previousEntries.get(entry.file).extraction.methods.spatial
}

function readableText(rgb) {
	const channels = rgb.map((value) => {
		const channel = value / 255
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	})
	const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
	return luminance > 0.179 ? "#000" : "#fff"
}

function preview(label, palette, image) {
	const article = document.createElement("article")
	article.className = "candidate"
	const previewBackground = palette.gradient.isGradient
		? `linear-gradient(in oklch 135deg, ${palette.background.hex} 0 50%, ${palette.surface.hex} 90%)`
		: palette.background.hex
	article.innerHTML = `
		<h2>Candidate ${label}</h2>
		<div class="preview" style="background:${previewBackground};color:${palette.foreground.hex}">
			<div class="background-content">
				<img class="preview-artwork" src="${image}" alt="">
				<div class="background-copy">
					<div class="preview-kicker">Artist name</div>
					<div class="background-title">Selected album</div>
					<div class="background-detail">Foreground text directly on the background</div>
					<div class="background-accent" style="color:${palette.accent.hex}">Accent text on the background</div>
				</div>
			</div>
			<div class="preview-surface" style="background:${palette.surface.hex};color:${palette.foreground.hex};border-color:${palette.accent.hex}">
				<div class="preview-kicker">Now playing</div>
				<div class="preview-title">Album title</div>
				<div class="accent-line" style="background:${palette.accent.hex}"></div>
			</div>
		</div>
		<div class="swatches">
			${["background", "foreground", "surface", "accent"].map((role) => {
				const color = palette[role]
				return `<div class="swatch" style="background:${color.hex};color:${readableText(color.rgb)}">${role}<br>${color.hex}</div>`
			}).join("")}
		</div>
	`
	return article
}

function resetDecision() {
	state.preference = null
	state.ship = null
	preferenceButtons.forEach((button) => button.classList.remove("selected"))
	shipButtons.forEach((button) => button.classList.remove("selected"))
	reasonInputs.forEach((input) => { input.checked = false })
	note.value = ""
	submit.disabled = true
	status.textContent = ""
}

function render() {
	const entry = state.entries[state.index]
	if (!entry) {
		artworkName.textContent = "No comparisons in this queue"
		artwork.hidden = true
		candidates.replaceChildren()
		progress.textContent = "0 / 0"
		resetDecision()
		previousButton.disabled = true
		skipButton.disabled = true
		status.textContent = "No new or changed pairs require review"
		return
	}
	artwork.hidden = false
	previousButton.disabled = false
	skipButton.disabled = false
	const [leftMethod, rightMethod] = methodsFor(entry)
	artworkName.textContent = state.iterationOnly ? `Artwork ${state.index + 1}` : entry.file
	artwork.src = `/images/${encodeURIComponent(entry.file)}`
	artwork.alt = state.iterationOnly ? "Artwork under review" : `Artwork under review: ${entry.file}`
	candidates.replaceChildren(
		preview("A", paletteFor(entry, leftMethod), artwork.src),
		preview("B", paletteFor(entry, rightMethod), artwork.src),
	)
	progress.textContent = `${state.index + 1} / ${state.entries.length} pending`
	resetDecision()
}

function updateSubmitState() {
	submit.disabled = !state.preference || !state.ship
}

function selectPreference(preference) {
	state.preference = preference
	preferenceButtons.forEach((button) => button.classList.toggle("selected", button.dataset.preference === preference))
	updateSubmitState()
}

function selectShip(ship) {
	state.ship = ship
	shipButtons.forEach((button) => button.classList.toggle("selected", button.dataset.ship === ship))
	updateSubmitState()
}

preferenceButtons.forEach((button) => button.addEventListener("click", () => selectPreference(button.dataset.preference)))
shipButtons.forEach((button) => button.addEventListener("click", () => selectShip(button.dataset.ship)))

comparisonButton.addEventListener("click", (event) => {
	if (state.iterationOnly) return
	const modes = ["iteration", "baseline", "variant"]
	selectComparison(modes[(modes.indexOf(state.comparison) + 1) % modes.length])
	event.currentTarget.textContent = `${state.comparison[0].toUpperCase()}${state.comparison.slice(1)} comparison`
	render()
})

previousButton.addEventListener("click", () => {
	state.index = Math.max(0, state.index - 1)
	render()
})

skipButton.addEventListener("click", () => {
	state.index = (state.index + 1) % state.entries.length
	render()
})

submit.addEventListener("click", async () => {
	if (!state.preference || !state.ship) return
	submit.disabled = true
	status.textContent = "Saving"
	const entry = state.entries[state.index]
	const [leftMethod, rightMethod] = methodsFor(entry)
	const response = await fetch("/api/feedback", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			image: entry.file,
			comparison: state.comparison,
			leftMethod,
			rightMethod,
			preference: state.preference,
			ship: state.ship,
			reasons: reasonInputs.filter((input) => input.checked).map((input) => input.value),
			note: note.value,
		}),
	})
	if (!response.ok) {
		const result = await response.json()
		status.textContent = result.error || "Could not save feedback"
		submit.disabled = false
		return
	}
	state.feedback.push(await response.json())
	selectComparison(state.comparison)
	render()
})

window.addEventListener("keydown", (event) => {
	if (event.target instanceof HTMLInputElement) return
	if (event.key === "1") selectPreference("left")
	if (event.key === "2") selectPreference("right")
	if (event.key === "0") selectPreference("tie")
	if (event.key.toLowerCase() === "q") selectShip("left")
	if (event.key.toLowerCase() === "w") selectShip("right")
	if (event.key.toLowerCase() === "e") selectShip("both")
	if (event.key.toLowerCase() === "r") selectShip("neither")
	if (event.key === "Enter" && !submit.disabled) submit.click()
	if (event.key === "ArrowRight") document.querySelector("#skip").click()
	if (event.key === "ArrowLeft") document.querySelector("#previous").click()
})

const response = await fetch("/api/review")
const payload = await response.json()
state.iterationOnly = payload.iterationOnly === true
state.assignments = new Map(Object.entries(payload.assignments || {}))
comparisonButton.hidden = state.iterationOnly
comparisonButton.disabled = state.iterationOnly
galleryLink.hidden = state.iterationOnly
state.allEntries = payload.results.entries
state.previousEntries = new Map(payload.previousResults.entries.map((entry) => [entry.file, entry]))
state.feedback = payload.feedback.entries
state.carriedReviews = new Set(payload.carriedReviews.map((item) => `${item.comparison}:${item.image}`))
state.algorithmVersion = payload.results.algorithmVersion
state.presentationVersion = payload.presentationVersion
selectComparison("iteration")
render()
