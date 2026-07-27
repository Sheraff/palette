function addColorSamples() {
	for (const entry of document.querySelectorAll(".role-entry")) {
		const namedColor = entry.querySelector("dd")
		if (!namedColor || namedColor.querySelector(".color-sample")) continue
		const hex = namedColor.textContent.match(/#[0-9a-fA-F]{6}\b/)?.[0]
		if (!hex) continue
		namedColor.classList.add("named-color")
		const sample = document.createElement("span")
		sample.className = "color-sample"
		sample.setAttribute("aria-hidden", "true")
		sample.style.backgroundColor = hex
		namedColor.prepend(sample)
	}
}

const observer = new MutationObserver(addColorSamples)
observer.observe(document.querySelector("#options"), { childList: true, subtree: true })
await import("/v1-app.js")
addColorSamples()
