const gallery = document.querySelector("#gallery")
const summary = document.querySelector("#gallery-summary")
const filterButtons = [...document.querySelectorAll("[data-cohort]")]
let entries = []
let resultsVersion = ""

function readableText(rgb) {
	const channels = rgb.map((value) => {
		const channel = value / 255
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	})
	const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
	return luminance > 0.179 ? "#000" : "#fff"
}

function displayName(file) {
	return file.replace(/\.[^.]+$/, "").replaceAll("-", " ").replaceAll("_", " ")
}

function paletteCard(entry, index) {
	const palette = entry.extraction.methods.spatial
	const image = `/images/${encodeURIComponent(entry.file)}`
	const previewBackground = palette.gradient.isGradient
		? `linear-gradient(in oklch 135deg, ${palette.background.hex} 0 50%, ${palette.surface.hex} 90%)`
		: palette.background.hex
	const article = document.createElement("article")
	article.className = "artwork-card"
	article.dataset.cohort = entry.kind === "holdout" ? "holdout" : "development"
	article.innerHTML = `
		<div class="card-heading">
			<span class="index">${String(index + 1).padStart(2, "0")}</span>
			<div>
				<h2>${entry.file}</h2>
				<p>${entry.kind} / ${entry.width} x ${entry.height}</p>
			</div>
		</div>
		<div class="pair">
			<figure class="source-artwork">
				<img src="${image}" alt="Source artwork: ${entry.file}" loading="lazy">
				<figcaption>Source artwork</figcaption>
			</figure>
			<section class="palette-output" aria-label="Palette preview for ${entry.file}">
				<div class="theme-preview" style="background:${previewBackground};color:${palette.foreground.hex}">
					<div class="background-content">
						<img class="preview-artwork" src="${image}" alt="" loading="lazy">
						<div class="background-copy">
							<div class="preview-kicker">Corpus palette</div>
							<div class="background-title">${displayName(entry.file)}</div>
							<div class="background-detail">Foreground text directly on the background</div>
							<div class="background-accent" style="color:${palette.accent.hex}">Accent text on the background</div>
						</div>
					</div>
					<div class="preview-surface" style="background:${palette.surface.hex};color:${palette.foreground.hex};border-color:${palette.accent.hex}">
						<div class="preview-kicker">Selected palette</div>
						<div class="preview-title">Now playing</div>
						<div class="accent-line" style="background:${palette.accent.hex}"></div>
					</div>
				</div>
				<div class="swatches">
					${["background", "foreground", "surface", "accent"].map((role) => {
						const color = palette[role]
						return `<div class="swatch" style="background:${color.hex};color:${readableText(color.rgb)}"><span>${role}</span><strong>${color.hex}${color.generated ? " *" : ""}</strong></div>`
					}).join("")}
				</div>
				<div class="metrics">
					<span>FG / BG ${palette.metrics.foregroundContrast.toFixed(2)}:1</span>
					<span>FG / surface ${palette.metrics.foregroundSurfaceContrast.toFixed(2)}:1</span>
					<span>${palette.gradient.isGradient ? "Gradient" : "Flat background"}</span>
				</div>
			</section>
		</div>
	`
	return article
}

function render(cohort) {
	const visible = cohort === "all"
		? entries
		: entries.filter((entry) => (entry.kind === "holdout" ? "holdout" : "development") === cohort)
	const developmentCount = entries.filter((entry) => entry.kind !== "holdout").length
	const holdoutCount = entries.length - developmentCount
	summary.textContent = `${visible.length} shown / ${developmentCount} development / ${holdoutCount} holdout / ${resultsVersion}`
	gallery.replaceChildren(...visible.map(paletteCard))
}

filterButtons.forEach((button) => button.addEventListener("click", () => {
	filterButtons.forEach((candidate) => candidate.classList.toggle("selected", candidate === button))
	render(button.dataset.cohort)
}))

try {
	const response = await fetch("/api/results")
	if (!response.ok) throw new Error(`Results request failed with ${response.status}`)
	const results = await response.json()
	entries = results.entries
	resultsVersion = `${results.algorithmVersion} / spatial method`
	render("all")
} catch (error) {
	summary.textContent = error instanceof Error ? error.message : String(error)
}
