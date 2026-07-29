import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	COMPLETE_PALETTE_REVIEW_VERSION,
	completePaletteReviewManifestId,
	completePaletteReviewPublicPayload,
	parseCompletePaletteReviewFeedback,
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	type CompletePaletteReviewManifest,
	type CompletePaletteReviewTreatment,
} from "../src/complete-palette-review-v2.ts"
import { normalizeTreatment } from "../tools/review-evidence/normalize.ts"

const hash = "a".repeat(64)

function treatment(values: [string, string, string, string], gradient = false): CompletePaletteReviewTreatment {
	return {
		roles: Object.fromEntries(["background", "surface", "foreground", "accent"].map((role, index) => [role, {
			hex: values[index], generated: role === "foreground",
		}])) as CompletePaletteReviewTreatment["roles"],
		gradient,
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
	}
}

function manifest(mode: "absolute" | "pairwise", blinded = false): CompletePaletteReviewManifest {
	const base = {
		schemaVersion: 1 as const,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
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

test("absolute and pairwise manifests bind legal complete treatments", () => {
	for (const mode of ["absolute", "pairwise"] as const) {
		const fixture = manifest(mode)
		assert.deepEqual(parseCompletePaletteReviewManifest(fixture), fixture)
		assert.throws(() => parseCompletePaletteReviewManifest({ ...fixture, title: "changed" }), /identity is stale/)
	}
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
	assert.equal("assignment" in blinded.cases[0], false)
	assert.deepEqual("assignment" in visible.cases[0] ? visible.cases[0].assignment : null,
		{ A: "candidate", B: "anchor" })
	if (!("options" in blinded.cases[0])) throw new Error("Pairwise payload changed")
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
	const threeStopIdentity = normalizeTreatment(threeStop, {
		presentationVersion: COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	})
	assert.equal(threeStopIdentity.treatmentIdentity, ordinaryIdentity.treatmentIdentity)
	assert.notEqual(threeStopIdentity.renderVariantId, ordinaryIdentity.renderVariantId)
	const payload = completePaletteReviewPublicPayload(researchManifest)
	if (!("treatment" in payload.cases[0])) throw new Error("Absolute payload changed")
	assert.equal(payload.cases[0].treatment.researchRender.field.stops[1].hex, "#1880a7")
	assert.ok(payload.cases[0].treatment.researchRender.field.stops[1].nearestName.length > 0)
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

test("presentation retains exact V2 semantics and achromatic chrome", async () => {
	const [app, css] = await Promise.all([
		readFile(new URL("../complete-palette-review-v2/app.js", import.meta.url), "utf8"),
		readFile(new URL("../complete-palette-review-v2/styles.css", import.meta.url), "utf8"),
	])
	assert.match(app, /linear-gradient\(135deg in oklab/)
	assert.match(app, /3-stop gradient/)
	assert.match(app, /Gradient midpoint/)
	assert.match(app, /midpointSwatch\.style\.backgroundColor = midpoint\.hex/)
	assert.match(app, /Gradient midpoint \(not a role\)/)
	assert.match(app, /collapsed to background/)
	assert.match(app, /generated\*/)
	assert.match(app, /autoSaveTimer/)
	assert.match(app, /ArrowLeft/)
	assert.match(css, /\.artwork\s*\{[^}]*border:\s*0/s)
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

test("loopback service verifies source bytes and atomically upserts one case", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "complete-palette-review-v2-"))
	context.after(() => rm(directory, { recursive: true, force: true }))
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
	await writeFile(join(directory, "artwork.png"), png)
	const template = manifest("pairwise", true)
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
	assert.equal("assignment" in review.cases[0], false)
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
