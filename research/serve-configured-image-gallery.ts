import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { UI_ACCENT_CONTRAST_PROFILE } from "./src/accent-contrast.ts"
import { namePalette, type ColorPresentationDescriptor } from "./src/color-name.ts"
import { apcaContrast } from "./src/color.ts"
import { extractConfiguredPalette } from "./src/configured-extract.ts"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { Palette, RoleName } from "./src/types.ts"

const [portArgument = "3122", modeArgument = "images", ...unexpectedArguments] = process.argv.slice(2)
if (unexpectedArguments.length > 0 || !/^\d+$/.test(portArgument) ||
	(modeArgument !== "images" && modeArgument !== "typography-apca")) {
	throw new Error("Usage: serve-configured-image-gallery.ts [port] [images|typography-apca]")
}
const port = Number(portArgument)
if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535")
const typographyReview = modeArgument === "typography-apca"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = join(researchRoot, "review")
const imagesRoot = join(projectRoot, "images")
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const generatedVariantSuffix = /-(?:masked|original|saliency|scrambled)\.[^.]+$/i
const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]
const typographyEvaluationPath = join(
	researchRoot,
	"data/experiments/typography-chromatic-apca-0.1.0-poc.1-development/evaluation.json",
)
const typographyFeedbackPath = join(
	researchRoot,
	"data/experiments/typography-chromatic-apca-0.1.0-poc.1-development/feedback.json",
)

function paletteChangedRoles(canonical: Palette, configured: Palette): RoleName[] {
	return roleNames.filter((role) => canonical[role].hex !== configured[role].hex)
}

function presentPalette(palette: Palette): Palette & {
	colorNames: Record<RoleName, ColorPresentationDescriptor>
	apca: {
		foregroundBackgroundLc: number
		foregroundSurfaceLc: number
		accentBackgroundLc: number
		accentSurfaceLc: number
	}
} {
	const descriptors = namePalette(roleNames.map((role) => palette[role].rgb))
	return {
		...palette,
		colorNames: Object.fromEntries(
			roleNames.map((role, index) => [role, descriptors[index]]),
		) as Record<RoleName, ColorPresentationDescriptor>,
		apca: {
			foregroundBackgroundLc: apcaContrast(palette.foreground.rgb, palette.background.rgb),
			foregroundSurfaceLc: apcaContrast(palette.foreground.rgb, palette.surface.rgb),
			accentBackgroundLc: apcaContrast(palette.accent.rgb, palette.background.rgb),
			accentSurfaceLc: apcaContrast(palette.accent.rgb, palette.surface.rgb),
		},
	}
}

function respond(response: ServerResponse, status: number, body: string | Buffer, contentType: string): void {
	response.writeHead(status, {
		"content-type": contentType,
		"content-length": Buffer.byteLength(body),
		"cache-control": "no-store",
	})
	response.end(body)
}

const staticFiles = new Map<string, { body: Buffer; contentType: string }>()
for (const [route, file, contentType] of [
	["/", typographyReview ? "typography-apca-gallery.html" : "configured-gallery.html", "text/html; charset=utf-8"],
	["/configured-gallery.js", "configured-gallery.js", "text/javascript; charset=utf-8"],
	["/gallery.css", "gallery.css", "text/css; charset=utf-8"],
	["/configured-gallery.css", "configured-gallery.css", "text/css; charset=utf-8"],
	["/typography-apca-gallery.css", "typography-apca-gallery.css", "text/css; charset=utf-8"],
] as const) {
	staticFiles.set(route, { body: await readFile(join(reviewRoot, file)), contentType })
}

const reviewSourceHashes = new Map<string, string>()
const reviewJudgments = new Map<string, string>()
let files: string[]
if (typographyReview) {
	const evaluation = JSON.parse(await readFile(typographyEvaluationPath, "utf8")) as {
		decision: string
		reviewEntries: Array<{ file: string; sourceSha256: string }>
	}
	if (evaluation.decision !== "prepare-complete-palette-review") {
		throw new Error("Typography APCA evaluation does not authorize review")
	}
	files = evaluation.reviewEntries.map((entry) => {
		reviewSourceHashes.set(entry.file, entry.sourceSha256)
		return entry.file
	})
	const feedback = JSON.parse(await readFile(typographyFeedbackPath, "utf8")) as {
		entries: Array<{ file: string; judgment: string }>
	}
	for (const entry of feedback.entries) reviewJudgments.set(entry.file, entry.judgment)
} else {
	files = (await readdir(imagesRoot))
		.filter((file) => supportedExtensions.has(extname(file).toLowerCase()))
		.filter((file) => !generatedVariantSuffix.test(file))
		.sort((left, right) => left.localeCompare(right, "en"))
}
const knownImages = new Set(files)
const entries = []
const sourcePath = (file: string): string => typographyReview ? join(projectRoot, file) : join(imagesRoot, file)

for (const [index, file] of files.entries()) {
	const path = sourcePath(file)
	const source = await readFile(path)
	const expectedSourceHash = reviewSourceHashes.get(file)
	if (expectedSourceHash && createHash("sha256").update(source).digest("hex") !== expectedSourceHash) {
		throw new Error(`Typography review source changed: ${file}`)
	}
	const image = await loadImage(source)
	const baselineExtraction = typographyReview
		? extractConfiguredPalette(image, { accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE })
		: extractPalette(image)
	const canonical = baselineExtraction.methods.spatial
	const configuredExtraction = extractConfiguredPalette(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		...(typographyReview ? { typographyChromaticAccent: true as const } : {}),
	})
	const configured = configuredExtraction.methods.spatial
	if (Math.abs(apcaContrast(configured.accent.rgb, configured.background.rgb)) + 1e-9 <
			UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc ||
		Math.abs(apcaContrast(configured.accent.rgb, configured.surface.rgb)) + 1e-9 <
			UI_ACCENT_CONTRAST_PROFILE.surfaceMinimumLc) {
		throw new Error(`Configured accent contrast contract failed for ${file}`)
	}
	entries.push({
		file,
		width: image.width,
		height: image.height,
		changedRoles: paletteChangedRoles(canonical, configured),
		reviewJudgment: typographyReview ? reviewJudgments.get(file) ?? "pending" : null,
		canonical: presentPalette(canonical),
		configured: presentPalette(configured),
		baselineVersion: baselineExtraction.version,
		configuredVersion: configuredExtraction.version,
	})
	process.stderr.write(`[${index + 1}/${files.length}] ${file}\n`)
}

const galleryData = JSON.stringify({
	generatedAt: new Date().toISOString(),
	canonicalVersion: entries[0]?.baselineVersion ?? ALGORITHM_VERSION,
	configuredVersion: entries[0]?.configuredVersion ?? null,
	accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
	baselineLabel: typographyReview ? "APCA baseline" : "Canonical",
	configuredLabel: typographyReview ? "Typography treatment" : "Configured",
	baselineCode: typographyReview ? "APCA BASELINE" : "NO PROFILE",
	configuredCode: typographyReview ? "TYPOGRAPHY" : `|Lc| ${UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc}`,
	paletteOnlyChrome: typographyReview,
	entries,
})

const contentTypes: Record<string, string> = {
	".avif": "image/avif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
}

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
		if (request.method === "GET" && staticFiles.has(url.pathname)) {
			const file = staticFiles.get(url.pathname)!
			respond(response, 200, file.body, file.contentType)
			return
		}
		if (request.method === "GET" && url.pathname === "/api/results") {
			respond(response, 200, galleryData, "application/json; charset=utf-8")
			return
		}
		if (request.method === "GET" && url.pathname.startsWith("/images/")) {
			const file = decodeURIComponent(url.pathname.slice("/images/".length))
			if (!knownImages.has(file)) {
				respond(response, 404, "Not found", "text/plain; charset=utf-8")
				return
			}
			respond(
				response,
				200,
				await readFile(sourcePath(file)),
				contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
			)
			return
		}
		respond(response, 404, "Not found", "text/plain; charset=utf-8")
	} catch (error) {
		respond(response, 400, error instanceof Error ? error.message : "Request failed", "text/plain; charset=utf-8")
	}
})

server.listen(port, "127.0.0.1", () => {
	process.stderr.write(`${typographyReview ? "Typography APCA review" : "Configured image palette gallery"}: http://127.0.0.1:${port}/\n`)
})
