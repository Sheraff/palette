const ROLES = ["background", "surface", "foreground", "accent"]

function create(tag, properties = {}) {
	const element = document.createElement(tag)
	for (const [key, value] of Object.entries(properties)) {
		if (key === "text") element.textContent = value
		else if (key === "className") element.className = value
		else element.setAttribute(key, value)
	}
	return element
}

function treatmentFieldCss(treatment) {
	if (!treatment.gradient) return treatment.roles.background.hex
	const midpoint = treatment.researchRender?.field?.stops?.[1]
	return midpoint?.kind === "source-supported-color"
		? `linear-gradient(135deg in oklab, ${treatment.roles.background.hex} 0%, ${midpoint.hex} 50%, ${treatment.roles.surface.hex} 100%)`
		: `linear-gradient(135deg in oklab, ${treatment.roles.background.hex} 0%, ${treatment.roles.surface.hex} 100%)`
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

function artworkTitle(file) {
	return file.split("/").at(-1).replace(/\.[^.]+$/u, "").replaceAll("-", " ")
}

function renderRoleLegend(treatment) {
	const legend = create("dl", { className: "role-legend", "aria-label": "Complete palette role colors" })
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
	return legend
}

function renderMidpoint(treatment) {
	const midpoint = treatment.researchRender?.field?.stops?.[1]
	if (midpoint?.kind !== "source-supported-color") return null
	const custody = create("div", { className: "midpoint-custody" })
	const swatch = create("span", { className: "swatch", "aria-hidden": "true" })
	swatch.style.backgroundColor = midpoint.hex
	const color = create("span", { className: "midpoint-color" })
	color.append(create("strong", { text: midpoint.nearestName }), create("code", { text: midpoint.hex }))
	custody.append(
		swatch,
		create("strong", { text: "Gradient midpoint" }),
		color,
		create("span", { text: "50% / exact source-supported render / not a role" }),
	)
	return custody
}

function renderEntry(entry, index) {
	const treatment = entry.treatment
	const card = create("article", { className: "palette-card" })
	const heading = create("header", { className: "card-heading" })
	const cardinality = new Set(ROLES.map((role) => treatment.roles[role].hex)).size
	const renderMode = treatment.researchRender ? "3-stop gradient" : treatment.gradient ? "Gradient" : "Flat field"
	heading.append(
		create("span", { text: String(index + 1).padStart(2, "0") }),
		create("h2", { text: artworkTitle(entry.file) }),
		create("span", { text: `${renderMode} / ${cardinality} colors` }),
	)
	card.append(heading)

	const preview = create("section", { className: "palette-preview" })
	preview.style.setProperty("--background", treatment.roles.background.hex)
	preview.style.setProperty("--surface", treatment.roles.surface.hex)
	preview.style.setProperty("--foreground", treatment.roles.foreground.hex)
	preview.style.setProperty("--accent", treatment.roles.accent.hex)
	preview.style.background = treatmentFieldCss(treatment)
	preview.append(create("img", {
		className: "artwork",
		src: entry.artworkUrl,
		alt: `${artworkTitle(entry.file)} album artwork`,
		loading: "lazy",
	}))
	const copy = create("div", { className: "background-copy" })
	copy.append(
		create("p", { className: "accent-copy", text: "Now playing / final palette" }),
		create("h3", { text: "The artwork carries the listening view." }),
		create("p", { text: "One coupled field, foreground, surface, and accent treatment." }),
	)
	preview.append(copy)
	const surface = create("div", { className: "surface-card" })
	surface.append(
		create("p", { className: "accent-copy", text: "Surface role" }),
		create("strong", { text: "Foreground remains part of the same palette." }),
	)
	preview.append(surface)
	card.append(preview, renderRoleLegend(treatment))
	const midpoint = renderMidpoint(treatment)
	if (midpoint) card.append(midpoint)
	card.append(create("footer", { className: "source-meta", text:
		`${entry.dimensions.width}x${entry.dimensions.height} / ${entry.sourceSha256.slice(0, 12)} / ${Math.round(entry.runtime.wallMs)} ms` }))
	return card
}

async function loadShowcase() {
	const response = await fetch("/api/showcase", { headers: { Accept: "application/json" } })
	if (!response.ok) throw new Error(`Showcase request failed with ${response.status}`)
	const showcase = await response.json()
	document.querySelector("#scope").textContent = showcase.completeRoster
		? `${showcase.entryCount} / ${showcase.rosterCount} canonical artworks`
		: `${showcase.entryCount} / ${showcase.rosterCount} bounded preflight`
	document.querySelector("#identity").textContent =
		`${showcase.attempt.attemptId} / ${showcase.attempt.configurationId}`
	const gallery = document.querySelector("#gallery")
	for (const [index, entry] of showcase.entries.entries()) gallery.append(renderEntry(entry, index))
}

loadShowcase().catch((error) => {
	document.querySelector("#scope").textContent = "Showcase unavailable"
	document.querySelector("#identity").textContent = error instanceof Error ? error.message : "Request failed"
})
