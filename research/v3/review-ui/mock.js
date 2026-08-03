/*
 * The mock player — the primary judging surface (REVIEW_UI.md §3), in one file.
 *
 * Three pages render it now: the pairwise review page, the calibration page, and the composer's live
 * preview. **The mock is part of the output contract**, so a verdict is about the exact rendering
 * the reviewer judged — which only holds if there is exactly one renderer. That is why this is a
 * module and not a copy in each page.
 *
 * Layout revision 2, 2026-08-03, from the reviewer's own report on revision 1. Their four findings,
 * and what each one changed:
 *
 *  1. "the artwork takes too much space, i can barely see the background/gradient i'm supposed to
 *     review" — the artwork is now a small thumbnail. It is context; the palette is the subject, so
 *     the field has to dominate the frame.
 *  2. "all the content is at the bottom, so in case of a gradient, almost nothing is on top of the
 *     background color" — content is spread across the mock's full height in three regions, so BOTH
 *     ends of a gradient carry something. Foreground text sits directly on the field at the top of
 *     the ramp, not only on the surface card near the bottom.
 *  3. "the accent color is only used on top of a surface colored area, so i won't be able to see it
 *     in other contexts" — accent now appears in four places: on the field at the top, on the field
 *     at the bottom, on the surface card, and as a fill on a background-coloured rail. Those are the
 *     relationships the contract's accent floors are checked against (background, surface, stops),
 *     so the reviewer can see each of them.
 *  4. swatches moved below the mock — see `renderSide`.
 *
 * Unchanged and not negotiable: the artwork is borderless on the field, there are no shadows
 * anywhere, and the gradient is the pinned preview renderer's output pasted verbatim
 * (`side.fieldCss`) — the [REVIEWED] display mapping is never recomputed here. Styles are only ever
 * set through CSSOM properties, never through a style attribute.
 */

export function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class) node.className = options.class
	if (options.text !== undefined) node.textContent = String(options.text)
	for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value)
	node.append(...children.filter((child) => child !== null && child !== undefined))
	return node
}

/**
 * @param artworkSrc the media URL of the artwork, or null for a mock with no artwork in it
 * @param side a side payload from the server: roles with names, the gradient's display stops, fieldCss
 */
export function renderMock(artworkSrc, side) {
	const roles = Object.fromEntries(side.roles.map((role) => [role.role, role.hex]))
	const mock = el("div", { class: "mock" })
	mock.style.background = side.fieldCss

	const accentIcon = (shape) => {
		const icon = el("span", { class: `icon ${shape}`, attrs: { "aria-hidden": "true" } })
		icon.style.background = roles.accent
		return icon
	}
	/** A progress rail: accent on a background-coloured track. Accent against background, directly. */
	const rail = () => {
		const track = el("div", { class: "mock-track" })
		track.style.background = roles.background
		const fill = el("div", { class: "mock-track-fill" })
		fill.style.background = roles.accent
		track.append(fill)
		return track
	}

	// --- top: foreground text and accent icons, both directly on the field, at the gradient's
	// background end. This is the region revision 1 had nothing in.
	const top = el("div", { class: "mock-top" })
	top.style.color = roles.foreground
	const heading = el("div", { class: "mock-field-text" })
	heading.append(el("p", { class: "mock-title", text: "Album title" }), el("p", { text: "Artist name" }))
	const topIcons = el("div", { class: "mock-icons" })
	topIcons.append(accentIcon("icon-prev"), accentIcon("icon-dot"))
	top.append(heading, topIcons)

	// --- middle: the artwork, small and borderless, beside the surface card.
	const middle = el("div", { class: "mock-middle" })
	const art = el("img", {
		class: "mock-art",
		attrs: { src: artworkSrc, alt: "album artwork", loading: "lazy", decoding: "async" },
	})
	const card = el("div", { class: "mock-card" })
	card.style.background = roles.surface
	card.style.color = roles.foreground
	const cardIcons = el("div", { class: "mock-icons" })
	cardIcons.append(accentIcon("icon-play"), accentIcon("icon-bars"))
	const rowText = el("div", { class: "mock-row-text" })
	rowText.append(el("b", { text: "Track title" }), el("span", { text: "2:41 / 3:58" }))
	card.append(el("div", { class: "mock-row" }, cardIcons, rowText), rail())
	middle.append(art, card)

	// --- bottom: accent on the field again, at the gradient's far end, plus foreground text on the
	// field and one more accent-on-background rail.
	const bottom = el("div", { class: "mock-bottom" })
	bottom.style.color = roles.foreground
	const transport = el("div", { class: "mock-icons" })
	transport.append(accentIcon("icon-prev"), accentIcon("icon-play"), accentIcon("icon-next"))
	bottom.append(transport, el("span", { class: "mock-caption", text: "Up next · Another track" }), rail())

	mock.append(top, middle, bottom)
	return mock
}

export function swatch(label, hex, name, extra) {
	const chip = el("span", { class: "chip", attrs: { "aria-hidden": "true" } })
	chip.style.background = hex
	// Children go through el(), which drops nullish ones — append() would stringify them to "null".
	const text = el(
		"span",
		{ class: "swatch-text" },
		el("span", { class: "swatch-role", text: label }),
		el("span", { text: `${name} — ${hex}` }),
		extra ? el("span", { text: extra }) : null,
	)
	return el("li", {}, chip, text)
}

/** The identity check under the mock: every colour with its hex and its `colornames-oklab` name. */
export function renderSwatches(side) {
	const list = el("ul", { class: "swatches" })
	for (const role of side.roles) {
		list.append(swatch(role.role, role.hex, role.name, role.collapsed ? "collapsed" : null))
	}
	if (side.gradient === null) {
		list.append(el("li", {}, el("span", {}), el("span", { class: "swatch-sub", text: "flat field" })))
		return list
	}
	const header = el("li", {}, el("span", {}), el("span", {
		class: "swatch-sub",
		text: `gradient — ${side.gradient.stops.length} stops`,
	}))
	list.append(header)
	for (const [position, stop] of side.gradient.stops.entries()) {
		list.append(
			swatch(
				`stop ${position + 1}`,
				stop.hex,
				stop.name,
				`published ${stop.publishedPosition} · shown at ${(stop.displayPosition * 100).toFixed(1)}%`,
			),
		)
	}
	return list
}

/**
 * One judged palette: the mock, and the swatches under it.
 *
 * Swatches below the mock, not beside it: the reviewer's fourth finding — "the swatches ... take too
 * much space, put it below the mock ui ... (the swatches have only secondary importance to the mock
 * UI)". They stay an identity check, never the judging surface (REVIEW_UI.md §3).
 */
export function renderSide(artworkSrc, name, side) {
	const panel = el("section", { class: "side", attrs: { "aria-label": `side ${name}` } })
	if (name !== null) panel.append(el("h2", { text: `side ${name}` }))
	panel.append(el("div", { class: "side-body" }, renderMock(artworkSrc, side), renderSwatches(side)))
	return panel
}
