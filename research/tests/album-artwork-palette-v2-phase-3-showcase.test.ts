import assert from "node:assert/strict"
import { createServer } from "node:http"
import { spawn, type ChildProcess } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_VERSION,
	albumArtworkPaletteV2Phase3ShowcaseBaseFiles,
	parseAlbumArtworkPaletteV2Phase3ShowcaseArguments,
	verifyAlbumArtworkPaletteV2Phase3ShowcaseRoster,
} from "../serve-album-artwork-palette-v2-phase-3-showcase.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
} from "../src/album-artwork-palette-v2-phase-3-final-candidate.ts"
import {
	COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY,
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
} from "../src/complete-palette-review-v2.ts"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))
const imagesRoot = resolve(repositoryRoot, "images")
const serverPath = fileURLToPath(new URL("../serve-album-artwork-palette-v2-phase-3-showcase.ts", import.meta.url))

test("showcase freezes the exact 34 unsuffixed supported artwork files", async () => {
	const physicalFiles = await readdir(imagesRoot)
	const filtered = albumArtworkPaletteV2Phase3ShowcaseBaseFiles(physicalFiles)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES.length, 34)
	assert.deepEqual(filtered, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES)
	assert.deepEqual(await verifyAlbumArtworkPaletteV2Phase3ShowcaseRoster(),
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES)
	assert.ok(physicalFiles.some((file) => file.endsWith("-scrambled.jpg")))
	assert.ok(!filtered.some((file) => /-(?:masked|original|saliency|scrambled)\./u.test(file)))
	assert.ok(filtered.includes("disney.avif"))
})

test("showcase CLI keeps ordinary preflights bounded and requires an explicit all-roster mode", () => {
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3ShowcaseArguments([
		"--port", "4320", "--only", "pureblack.jpg", "--only", "disney.avif",
	]), {
		port: 4320,
		files: ["pureblack.jpg", "disney.avif"],
		completeRoster: false,
	})
	assert.equal(parseAlbumArtworkPaletteV2Phase3ShowcaseArguments(["--all"]).files.length, 34)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ShowcaseArguments([]), /literal GO/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ShowcaseArguments(["--only", "maroon5-original.jpg"]),
		/Unknown canonical/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ShowcaseArguments([
		...Array.from({ length: 9 }, (_, index) => ["--only", ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_FILES[index]]).flat(),
	]), /at most eight/u)
})

test("showcase presentation is responsive, achromatic, exact-render aware, and DOM safe", async () => {
	const [html, app, css, server] = await Promise.all([
		readFile(new URL("../album-artwork-palette-v2-phase-3-showcase/index.html", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-3-showcase/app.js", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-3-showcase/styles.css", import.meta.url), "utf8"),
		readFile(new URL("../serve-album-artwork-palette-v2-phase-3-showcase.ts", import.meta.url), "utf8"),
	])
	assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/u)
	assert.match(app, /linear-gradient\(135deg in oklab/u)
	assert.match(app, /midpoint\.hex\} 50%/u)
	assert.match(app, /collapsed to background/u)
	assert.match(app, /generated\*/u)
	assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/u)
	assert.match(css, /\.artwork\s*\{[^}]*border:\s*0/su)
	assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.role-legend\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u)
	assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.midpoint-custody\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\)/u)
	const colors = css.match(/#[0-9a-fA-F]{3,6}\b/gu) ?? []
	assert.ok(colors.length > 0)
	assert.ok(colors.every((value) => value.toLowerCase() === "#000" || value.toLowerCase() === "#fff"))
	assert.match(server, /from "\.\/src\/album-artwork-palette-v2-phase-3-final-candidate\.ts"/u)
	assert.doesNotMatch(server,
		/from "\.\/src\/album-artwork-palette-v2-phase-3-(?:contract|source-light|midpoint-aware|path-bound)[^"]*"/u)
})

async function availablePort(): Promise<number> {
	const probe = createServer()
	await new Promise<void>((resolveReady, reject) => {
		probe.once("error", reject)
		probe.listen(0, "127.0.0.1", resolveReady)
	})
	const address = probe.address()
	if (!address || typeof address === "string") throw new Error("Could not allocate a showcase test port")
	await new Promise<void>((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()))
	return address.port
}

function waitForServer(child: ChildProcess): Promise<void> {
	return new Promise((resolveReady, reject) => {
		let stderr = ""
		const timer = setTimeout(() => reject(new Error(`Showcase startup timed out: ${stderr}`)), 30_000)
		child.once("exit", (code) => {
			clearTimeout(timer)
			reject(new Error(`Showcase exited before startup with ${code}: ${stderr}`))
		})
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString()
			if (stderr.includes("Phase 3 final palette showcase: http://")) {
				clearTimeout(timer)
				resolveReady()
			}
		})
	})
}

test("bounded loopback showcase serves one genuine final palette and exact artwork custody", { timeout: 40_000 }, async () => {
	const port = await availablePort()
	const child = spawn(process.execPath, [
		"--no-warnings",
		"--experimental-strip-types",
		serverPath,
		"--port", String(port),
		"--only", "pureblack.jpg",
	], { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] })
	try {
		await waitForServer(child)
		const base = `http://127.0.0.1:${port}`
		const response = await fetch(`${base}/api/showcase`)
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("x-content-type-options"), "nosniff")
		assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/u)
		const payload = await response.json() as any
		assert.equal(payload.showcaseVersion, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SHOWCASE_VERSION)
		assert.deepEqual(payload.attempt, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity)
		assert.equal(payload.presentationVersion, COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION)
		assert.equal(payload.colorNamePolicy, COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY)
		assert.equal(payload.rosterCount, 34)
		assert.equal(payload.entryCount, 1)
		assert.equal(payload.completeRoster, false)
		assert.equal(payload.entries[0].file, "images/pureblack.jpg")
		assert.equal(payload.entries[0].artworkUrl, "/artwork/pureblack.jpg")
		assert.ok(payload.entries[0].treatment.roles.background.nearestName)
		assert.ok(payload.entries[0].treatment.roles.foreground.nearestName)
		const artwork = await fetch(`${base}${payload.entries[0].artworkUrl}`)
		assert.equal(artwork.status, 200)
		assert.equal(artwork.headers.get("content-type"), "image/jpeg")
		assert.ok((await artwork.arrayBuffer()).byteLength > 0)
		assert.equal((await fetch(`${base}/artwork/%2e%2e%2fetc%2fpasswd`)).status, 404)
		assert.equal((await fetch(`${base}/api/showcase`, { method: "POST" })).status, 405)
	} finally {
		child.kill("SIGTERM")
		await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()))
	}
})
