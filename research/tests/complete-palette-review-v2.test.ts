import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import {
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	COMPLETE_PALETTE_REVIEW_VERSION,
	completePaletteReviewManifestId,
	completePaletteReviewPublicPayload,
	completePaletteReviewSupportedPresentationVersions,
	parseCompletePaletteReviewFeedback,
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	parseCompletePaletteReviewResearchRender,
	type CompletePaletteReviewManifest,
	type CompletePaletteReviewPresentationVersion,
	type CompletePaletteReviewTreatment,
} from "../src/complete-palette-review-v2.ts"
import { normalizeTreatment } from "../tools/review-evidence/normalize.ts"

const hash = "a".repeat(64)
const HISTORICAL_PRESENTATION_VERSION: CompletePaletteReviewPresentationVersion =
	"complete-palette-review-v2-presentation-1"

function treatment(values: [string, string, string, string], gradient = false): CompletePaletteReviewTreatment {
	return {
		roles: Object.fromEntries(["background", "surface", "foreground", "accent"].map((role, index) => [role, {
			hex: values[index], generated: role === "foreground",
		}])) as CompletePaletteReviewTreatment["roles"],
		gradient,
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
	}
}

function manifest(
	mode: "absolute" | "pairwise",
	blinded = false,
	presentationVersion: CompletePaletteReviewPresentationVersion = COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
): CompletePaletteReviewManifest {
	const base = {
		schemaVersion: 1 as const,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		presentationVersion,
		title: "MVP treatment review",
		mode,
		blinded,
	}
	const source = { file: "artwork.png", sha256: hash, bytes: 68 }
	const cases = mode === "absolute" ? [{
		caseId: "case-01", order: 0, source,
		treatment: treatment(["#101010", "#202020", "#f0f0f0", "#f0f0f0"], true),
	}] : [{
		caseId: "case-01", order: 0, source,
		options: {
			A: treatment(["#101010", "#202020", "#f0f0f0", "#e0e0e0"], true),
			B: treatment(["#111111", "#111111", "#eeeeee", "#dddddd"]),
		},
		assignment: { A: "candidate", B: "anchor" },
	}]
	const identity = { ...base, cases } as Omit<CompletePaletteReviewManifest, "manifestId">
	return { ...identity, manifestId: completePaletteReviewManifestId(identity) } as CompletePaletteReviewManifest
}

function sourceSupportedRender(hex = "#1880a7") {
	return {
		schemaVersion: 1 as const,
		field: {
			kind: "linear-gradient" as const,
			angleDegrees: 135 as const,
			interpolation: "oklab" as const,
			stops: [
				{ kind: "role" as const, role: "background" as const, position: 0 as const },
				{ kind: "source-supported-color" as const, hex, position: 0.5 as const },
				{ kind: "role" as const, role: "surface" as const, position: 1 as const },
			] as const,
		},
	}
}

type TestNode = Readonly<{
	className: string
	style: Record<string, unknown>
	textContent: string
	children: readonly TestNode[]
}>

function presentationHarness(app: string): {
	state: { review: { blinded: boolean; presentationVersion: CompletePaletteReviewPresentationVersion } }
	treatmentFieldCss: (value: unknown) => string
	renderTreatment: (reviewCase: unknown, value: unknown, heading: string) => TestNode
} {
	class Element {
		className = ""
		attributes = new Map<string, string>()
		children: Element[] = []
		private ownText = ""
		style: Record<string, unknown> & { setProperty: (name: string, value: string) => void } = {
			setProperty: (name, value) => { this.style[name] = value },
		}

		get textContent(): string {
			return this.ownText + this.children.map((child) => child.textContent).join("")
		}

		set textContent(value: string) {
			this.ownText = String(value)
			this.children = []
		}

		setAttribute(name: string, value: string): void {
			this.attributes.set(name, String(value))
		}

		append(...children: Element[]): void {
			this.children.push(...children)
		}

		addEventListener(): void {}
	}
	const roots = new Set(["title", "instruction", "review", "previous", "next", "meter", "progress"])
	const elements = new Map([...roots].map((id) => [id, new Element()]))
	const document = {
		querySelector: (selector: string) => elements.get(selector.slice(1)) ?? null,
		createElement: () => new Element(),
		createTextNode: (text: string) => {
			const node = new Element()
			node.textContent = text
			return node
		},
		addEventListener: () => undefined,
	}
	const sandbox = {
		document,
		window: { clearTimeout, setTimeout },
		fetch: () => new Promise(() => undefined),
		structuredClone,
		__presentation: undefined as unknown,
	}
	runInNewContext(`${app}\n;globalThis.__presentation = { state, treatmentFieldCss, renderTreatment }`, sandbox)
	return sandbox.__presentation as ReturnType<typeof presentationHarness>
}

function presentedTreatment(value: CompletePaletteReviewTreatment) {
	return {
		...value,
		roles: Object.fromEntries(Object.entries(value.roles).map(([role, color]) => [role, {
			...color,
			nearestName: role,
		}])),
		...(value.researchRender ? {
			researchRender: {
				...value.researchRender,
				field: {
					...value.researchRender.field,
					stops: value.researchRender.field.stops.map((stop) => stop.kind === "source-supported-color"
						? { ...stop, nearestName: "Teal" }
						: stop),
				},
			},
		} : {}),
	}
}

test("absolute and pairwise manifests bind legal complete treatments", () => {
	assert.equal(COMPLETE_PALETTE_REVIEW_VERSION, "complete-palette-review-v2")
	assert.equal(COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION, "complete-palette-review-v2-presentation-2")
	assert.deepEqual([...completePaletteReviewSupportedPresentationVersions], [
		HISTORICAL_PRESENTATION_VERSION,
		COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	])
	for (const mode of ["absolute", "pairwise"] as const) {
		const fixture = manifest(mode)
		assert.deepEqual(parseCompletePaletteReviewManifest(fixture), fixture)
		assert.equal(fixture.schemaVersion, 1)
		assert.throws(() => parseCompletePaletteReviewManifest({ ...fixture, title: "changed" }), /identity is stale/)
		assert.throws(() => parseCompletePaletteReviewManifest({
			...fixture,
			presentationVersion: "complete-palette-review-v2-presentation-3",
		}), /header is invalid/)
	}
	const historical = manifest("pairwise", false, HISTORICAL_PRESENTATION_VERSION)
	const current = manifest("pairwise")
	assert.deepEqual(parseCompletePaletteReviewManifest(historical), historical)
	assert.equal(completePaletteReviewPublicPayload(historical).manifestId, historical.manifestId)
	assert.equal(current.presentationVersion, COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.notEqual(historical.manifestId, current.manifestId)
	const historicalStore = {
		schemaVersion: 1,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: historical.manifestId,
		entries: [],
	} as const
	assert.equal(parseCompletePaletteReviewFeedbackStore(historicalStore, historical).manifestId,
		historical.manifestId)
	assert.throws(() => parseCompletePaletteReviewFeedbackStore(historicalStore, current),
		/does not match the review manifest/)
	const fixture = manifest("absolute")
	if (fixture.mode !== "absolute") throw new Error("Fixture mode changed")
	const illegalCollapse = {
		...fixture,
		cases: [{
			...fixture.cases[0],
			treatment: { ...fixture.cases[0].treatment, collapse: { surface: true, accent: true } },
		}],
	}
	assert.throws(() => parseCompletePaletteReviewManifest(illegalCollapse), /collapse or gradient is illegal/)
	const illegalEquality = {
		...fixture,
		cases: [{
			...fixture.cases[0],
			treatment: {
				...fixture.cases[0].treatment,
				roles: {
					...fixture.cases[0].treatment.roles,
					surface: { ...fixture.cases[0].treatment.roles.surface,
						hex: fixture.cases[0].treatment.roles.foreground.hex },
				},
			},
		}],
	}
	assert.throws(() => parseCompletePaletteReviewManifest(illegalEquality), /illegal role equality/)
})

test("public payload derives names and withholds blinded assignments", () => {
	const blinded = completePaletteReviewPublicPayload(manifest("pairwise", true))
	const visible = completePaletteReviewPublicPayload(manifest("pairwise", false))
	assert.equal(blinded.blinded, true)
	assert.equal(visible.blinded, false)
	assert.equal("assignment" in blinded.cases[0], false)
	assert.deepEqual("assignment" in visible.cases[0] ? visible.cases[0].assignment : null,
		{ A: "candidate", B: "anchor" })
	if (!("options" in blinded.cases[0])) throw new Error("Pairwise payload changed")
	if (!("options" in visible.cases[0])) throw new Error("Pairwise payload changed")
	assert.deepEqual(blinded.cases[0].options, visible.cases[0].options)
	for (const side of ["A", "B"] as const) {
		for (const role of ["background", "surface", "foreground", "accent"] as const) {
			assert.ok(blinded.cases[0].options[side].roles[role].nearestName.length > 0)
		}
	}
})

test("source-supported midpoint rendering is optional, strict, and render-identity-only", () => {
	const ordinary = treatment(["#141975", "#3fa72a", "#030102", "#d02981"], true)
	const threeStop: CompletePaletteReviewTreatment = { ...ordinary, researchRender: sourceSupportedRender() }
	const base = manifest("absolute")
	if (base.mode !== "absolute") throw new Error("Fixture mode changed")
	const { manifestId: _manifestId, ...baseIdentity } = base
	const identity = {
		...baseIdentity,
		cases: [{ ...base.cases[0], treatment: threeStop }],
	}
	const researchManifest = {
		...identity,
		manifestId: completePaletteReviewManifestId(identity),
	} as CompletePaletteReviewManifest
	assert.deepEqual(parseCompletePaletteReviewManifest(researchManifest), researchManifest)
	const ordinaryIdentity = normalizeTreatment(ordinary, {
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	})
	const priorPresentationIdentity = normalizeTreatment(ordinary, {
		presentationVersion: HISTORICAL_PRESENTATION_VERSION,
	})
	const threeStopIdentity = normalizeTreatment(threeStop, {
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	})
	assert.equal(priorPresentationIdentity.treatmentIdentity, ordinaryIdentity.treatmentIdentity)
	assert.notEqual(priorPresentationIdentity.renderVariantId, ordinaryIdentity.renderVariantId)
	assert.equal(threeStopIdentity.treatmentIdentity, ordinaryIdentity.treatmentIdentity)
	assert.notEqual(threeStopIdentity.renderVariantId, ordinaryIdentity.renderVariantId)
	const payload = completePaletteReviewPublicPayload(researchManifest)
	if (!("treatment" in payload.cases[0])) throw new Error("Absolute payload changed")
	const payloadMidpoint = payload.cases[0].treatment.researchRender.field.stops[1]
	if (payloadMidpoint.kind !== "source-supported-color") throw new Error("Midpoint custody changed")
	assert.equal(payloadMidpoint.hex, "#1880a7")
	assert.ok(payloadMidpoint.nearestName.length > 0)
	assert.deepEqual(parseCompletePaletteReviewResearchRender(sourceSupportedRender()), sourceSupportedRender())
	assert.throws(() => parseCompletePaletteReviewResearchRender({
		...sourceSupportedRender(),
		field: { ...sourceSupportedRender().field, angleDegrees: 90 },
	}), /field protocol is invalid/u)
	assert.throws(() => parseCompletePaletteReviewResearchRender({
		...sourceSupportedRender(),
		field: { ...sourceSupportedRender().field, interpolation: "srgb" },
	}), /field protocol is invalid/u)
	const invalidFlat = {
		...researchManifest,
		cases: [{ ...researchManifest.cases[0], treatment: { ...threeStop, gradient: false } }],
	}
	assert.throws(() => parseCompletePaletteReviewManifest(invalidFlat), /research render is incompatible/u)
	const invalidStop = {
		...researchManifest,
		cases: [{
			...researchManifest.cases[0],
			treatment: { ...threeStop, researchRender: sourceSupportedRender("#ABCDEF") },
		}],
	}
	assert.throws(() => parseCompletePaletteReviewManifest(invalidStop), /stops are invalid/u)
})

test("feedback is mode-specific, strict, resumable, and verbatim", () => {
	const absolute = manifest("absolute")
	const comment = "  preserve\nexactly  "
	const parsed = parseCompletePaletteReviewFeedback({
		caseId: "case-01", sourceSha256: hash, quality: "strong",
		issues: ["missing gradient"], comment,
	}, absolute, false)
	assert.equal(parsed.comment, comment)
	assert.throws(() => parseCompletePaletteReviewFeedback({
		caseId: "case-01", sourceSha256: hash, qualityA: "strong", qualityB: "acceptable",
		comparison: "a-stronger", issuesA: [], issuesB: [], comment,
	}, absolute, false), /must contain exactly/)
	const store = parseCompletePaletteReviewFeedbackStore({
		schemaVersion: 1,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: absolute.manifestId,
		entries: [{ ...parsed, submittedAt: "2026-07-28T00:00:00.000Z" }],
	}, absolute)
	assert.equal(store.entries[0].comment, comment)
})

test("presentation blinds render-mode copy without changing field output", async () => {
	const app = await readFile(new URL("../complete-palette-review-v2/app.js", import.meta.url), "utf8")
	const ui = presentationHarness(app)
	const reviewCase = { artworkUrl: "/artwork/case-01" }
	const flat = presentedTreatment(treatment(["#101010", "#101010", "#f0f0f0", "#f0f0f0"]))
	const twoStopTreatment = treatment(["#101010", "#202020", "#f0f0f0", "#f0f0f0"], true)
	const twoStop = presentedTreatment(twoStopTreatment)
	const threeStop = presentedTreatment({ ...twoStopTreatment, researchRender: sourceSupportedRender() })
	assert.equal(ui.treatmentFieldCss(flat), "#101010")
	assert.equal(ui.treatmentFieldCss(twoStop),
		"linear-gradient(135deg in oklab, #101010 0%, #202020 100%)")
	assert.equal(ui.treatmentFieldCss(threeStop),
		"linear-gradient(135deg in oklab, #101010 0%, #1880a7 50%, #202020 100%)")

	ui.state.review = {
		blinded: false,
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	}
	assert.match(ui.renderTreatment(reviewCase, flat, "Option A").textContent, /Option AFlat field/)
	assert.match(ui.renderTreatment(reviewCase, twoStop, "Option B").textContent, /Option BGradient/)
	const visible = ui.renderTreatment(reviewCase, threeStop, "Option A")
	assert.match(visible.textContent, /Option A3-stop gradient/)
	assert.match(visible.textContent, /Gradient midpoint \(not a role\)/)
	assert.match(visible.textContent, /50% \/ exact source-supported render/)

	ui.state.review = { blinded: true, presentationVersion: HISTORICAL_PRESENTATION_VERSION }
	const historical = ui.renderTreatment(reviewCase, threeStop, "Option A")
	assert.match(historical.textContent, /Option A3-stop gradient/)
	assert.match(historical.textContent, /Gradient midpoint \(not a role\)/)
	assert.match(historical.textContent, /50% \/ exact source-supported render/)

	ui.state.review = {
		blinded: true,
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	}
	for (const [heading, candidate] of [["Option A", flat], ["Option B", twoStop], ["Option A", threeStop]] as const) {
		const panel = ui.renderTreatment(reviewCase, candidate, heading)
		assert.match(panel.textContent, new RegExp(`^${heading}Rendered field`))
		assert.doesNotMatch(panel.textContent, /Flat field|gradient|midpoint|source-supported|50%/i)
	}
	const blinded = ui.renderTreatment(reviewCase, threeStop, "Option A")
	assert.match(blinded.textContent, /Additional field color \(not a role\)/)
	assert.match(blinded.textContent, /Teal#1880a7/)
	const custody = blinded.children.find((child) => child.className === "research-render-custody")
	assert.ok(custody)
	assert.equal(custody.children[0].style.backgroundColor, "#1880a7")
})

test("presentation remains achromatic and statically safe at the mobile viewport", async () => {
	const [html, app, css] = await Promise.all([
		readFile(new URL("../complete-palette-review-v2/index.html", import.meta.url), "utf8"),
		readFile(new URL("../complete-palette-review-v2/app.js", import.meta.url), "utf8"),
		readFile(new URL("../complete-palette-review-v2/styles.css", import.meta.url), "utf8"),
	])
	assert.match(app, /linear-gradient\(135deg in oklab/)
	assert.match(app, /midpointSwatch\.style\.backgroundColor = midpoint\.hex/)
	assert.match(app, /collapsed to background/)
	assert.match(app, /generated\*/)
	assert.match(app, /autoSaveTimer/)
	assert.match(app, /ArrowLeft/)
	assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/)
	assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/)
	assert.match(css, /\.artwork\s*\{[^}]*border:\s*0/s)
	assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.research-render-custody\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\)/)
	assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.role-legend\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
	const colors = css.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []
	assert.ok(colors.length > 0)
	assert.ok(colors.every((value) => value.toLowerCase() === "#000" || value.toLowerCase() === "#fff"))
})

async function availablePort(): Promise<number> {
	const probe = createServer()
	await new Promise<void>((resolveReady, reject) => {
		probe.once("error", reject)
		probe.listen(0, "127.0.0.1", resolveReady)
	})
	const address = probe.address()
	if (!address || typeof address === "string") throw new Error("Could not allocate test port")
	await new Promise<void>((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()))
	return address.port
}

function waitForServer(child: ChildProcess): Promise<void> {
	return new Promise((resolveReady, reject) => {
		let stderr = ""
		const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 10_000)
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString()
			if (stderr.includes("Complete-palette review: http://")) {
				clearTimeout(timer)
				resolveReady()
			}
		})
		child.once("exit", (code) => {
			clearTimeout(timer)
			reject(new Error(`Server exited with ${code}: ${stderr}`))
		})
	})
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolveExit, reject) => {
		let stderr = ""
		const timer = setTimeout(() => {
			child.kill("SIGKILL")
			reject(new Error(`Process exit timed out: ${stderr}`))
		}, 10_000)
		child.stderr?.on("data", (chunk) => { stderr += chunk.toString() })
		child.once("exit", (code) => {
			clearTimeout(timer)
			resolveExit({ code, stderr })
		})
	})
}

test("loopback service serves historical presentation identity and atomically upserts one case", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "complete-palette-review-v2-"))
	context.after(() => rm(directory, { recursive: true, force: true }))
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
	await writeFile(join(directory, "artwork.png"), png)
	const template = manifest("pairwise", false, HISTORICAL_PRESENTATION_VERSION)
	if (template.mode !== "pairwise") throw new Error("Fixture mode changed")
	const { manifestId: _manifestId, ...templateIdentity } = template
	const identity = {
		...templateIdentity,
		cases: template.cases.map((reviewCase) => ({
			...reviewCase,
			source: {
				...reviewCase.source,
				bytes: png.byteLength,
				sha256: createHash("sha256").update(png).digest("hex"),
			},
		})),
	}
	const fixture = { ...identity, manifestId: completePaletteReviewManifestId(identity) } as CompletePaletteReviewManifest
	await writeFile(join(directory, "manifest.json"), `${JSON.stringify(fixture, null, 2)}\n`)
	const port = await availablePort()
	const serverPath = fileURLToPath(new URL("../serve-complete-palette-review-v2.ts", import.meta.url))
	const child = spawn(process.execPath, [
		"--experimental-strip-types", serverPath, "manifest.json", "feedback.json", String(port),
	], { cwd: directory, env: { ...process.env, NODE_NO_WARNINGS: "1" }, stdio: ["ignore", "ignore", "pipe"] })
	context.after(() => child.kill("SIGTERM"))
	await waitForServer(child)
	const base = `http://127.0.0.1:${port}`
	const review = await fetch(`${base}/api/review`).then((response) => response.json())
	assert.equal(review.presentationVersion, HISTORICAL_PRESENTATION_VERSION)
	assert.equal(review.manifestId, fixture.manifestId)
	assert.deepEqual(review.cases[0].assignment, { A: "candidate", B: "anchor" })
	assert.deepEqual(Buffer.from(await fetch(`${base}${review.cases[0].artworkUrl}`).then((response) => response.arrayBuffer())), png)
	const feedback = {
		caseId: "case-01",
		sourceSha256: fixture.cases[0].source.sha256,
		qualityA: "strong",
		qualityB: "acceptable",
		comparison: "a-stronger",
		issuesA: [],
		issuesB: [],
		comment: "first",
	}
	assert.equal((await fetch(`${base}/api/feedback`, {
		method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(feedback),
	})).status, 200)
	assert.equal((await fetch(`${base}/api/feedback`, {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...feedback, comment: "edited" }),
	})).status, 200)
	const stored = await fetch(`${base}/api/feedback`).then((response) => response.json())
	assert.equal(stored.entries.length, 1)
	assert.equal(stored.entries[0].comment, "edited")
	assert.equal(JSON.parse(await readFile(join(directory, "feedback.json"), "utf8")).entries[0].comment, "edited")
	const stopped = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()))
	child.kill("SIGTERM")
	await stopped
	await writeFile(join(directory, "artwork.png"), Buffer.concat([png, Buffer.from([0])]))
	const changedSource = spawn(process.execPath, [
		"--experimental-strip-types", serverPath, "manifest.json", "other-feedback.json", String(await availablePort()),
	], { cwd: directory, env: { ...process.env, NODE_NO_WARNINGS: "1" }, stdio: ["ignore", "ignore", "pipe"] })
	const rejected = await waitForExit(changedSource)
	assert.notEqual(rejected.code, 0)
	assert.match(rejected.stderr, /artwork custody changed/)
})
