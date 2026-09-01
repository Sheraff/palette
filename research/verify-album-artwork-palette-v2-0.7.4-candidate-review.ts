import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import type { RGB } from "./src/types.ts"
import {
	BOUND_REVIEW_CASES,
	COLOR_NAME_POLICY,
	FORBIDDEN_AUTHORIZATIONS,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	ROLES,
	candidateSide,
	canonicalJson,
	paletteKey,
	parsePrivateReviewManifest,
	parseStoredReviewFeedback,
	publicReviewPayload,
	sha256,
	sideAssignmentDigest,
	type PrivateReviewManifest,
	type ReviewPalette,
} from "./src/album-artwork-palette-v2-0.7.4-candidate-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const manifestRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-manifest.private.json"
const feedbackRelativePath =
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-feedback.json"
const candidateRoot = "research/data/experiments/album-artwork-palette-v2-0.7.4-development"

const expectedInputs = [
	["research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md", "cf43b640ab6c89bb64fffb7cd143a6b2486259a9dc252311684bd2b4dc317855"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_3_CANDIDATE_RECALL_POSTMORTEM.md", "09d1d3d8e32c3dc00bc2ed25ae41328af4882209a65182a415bf7a5452ae2160"],
	["research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4.md", "805bc221c18a4eddf99cb9f7a20bfa1a30a992caaae791d30d221d0e5bf05a86"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_4_CANDIDATE_CLOSURE_POSTMORTEM.md", "f3a61a63b6adf35083487bf546b05737248ccdac202bf166c4c6bad197e78742"],
	["research/data/album-artwork-palette-v2-development-panel.json", "9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4"],
	[`${candidateRoot}/execution-manifest.json`, "4166864322673fb250a2ea9c7da23f5d324fde60c0a250c1a271ac70ce2fc549"],
	[`${candidateRoot}/results.json`, "aed8e386717a45020b8eccadf1362bc31157a47aef4804b4b3d8b8fb31a4a4b8"],
	[`${candidateRoot}/summary.json`, "d7a5686d6127027dd0eabb3568dcd303ac3f92332d4af3eaf340d172efed0bc3"],
	[`${candidateRoot}/analysis.json`, "b49cb58c1c6a3cdd1f66ab5a1689ec5da0676470c30f7e50cb46ba1b88c45bd8"],
	[`${candidateRoot}/manifest.json`, "ea070636d10353d72e131c70638d792540ffddae894a0be568df2985bfdf80f4"],
] as const

const expectedImplementationPaths = [
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4_CANDIDATE_REVIEW.md",
	"research/src/album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/prepare-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/verify-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/serve-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/tests/album-artwork-palette-v2-0.7.4-candidate-review.test.ts",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/index.html",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/app.js",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/styles.css",
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/README.md",
] as const

const protectedMetadataBindings = [
	["research/data/album-artwork-palette-v2-fresh-sample.sealed.json", "6625aea0e38b93f6830a349468681a5dc6e93c99fe4bc3f38ca66ad23e0d16f3"],
	["research/data/album-artwork-palette-v2-future-sample-02.sealed.json", "2224603f5a4801cedf9f96375e86f2dd5624ed6895ab941fbcad5c6d8646fc8c"],
	["research/data/album-artwork-palette-v2-future-sample-03.sealed.json", "690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183"],
] as const

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

async function readBound(path: string, expectedSha256: string): Promise<Buffer> {
	const bytes = await readFile(resolve(projectRoot, path))
	assert(sha256(bytes) === expectedSha256, `Raw binding changed: ${path}`)
	return bytes
}

function collectDeclaredSha256(value: unknown, output = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const entry of value) collectDeclaredSha256(entry, output)
	} else if (value !== null && typeof value === "object") {
		for (const [key, entry] of Object.entries(value)) {
			if (key === "sha256" && typeof entry === "string" && /^[0-9a-f]{64}$/.test(entry)) output.add(entry)
			else collectDeclaredSha256(entry, output)
		}
	}
	return output
}

function projectTreatment(treatment: any): ReviewPalette {
	const names = namePalette(ROLES.map((role) => treatment[role].rgb as RGB))
	return {
		roles: Object.fromEntries(ROLES.map((role, index) => [role, {
			hex: treatment[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: treatment[role].generated,
		}])) as ReviewPalette["roles"],
		gradient: treatment.gradient,
		collapse: { surface: treatment.collapse.surface, accent: treatment.collapse.accent },
	}
}

async function optionalFeedback(manifest: PrivateReviewManifest, manifestRawSha256: string): Promise<"not-submitted" | "submitted"> {
	try {
		const raw = await readFile(resolve(projectRoot, feedbackRelativePath))
		const feedback = parseStoredReviewFeedback(JSON.parse(raw.toString("utf8")), manifest)
		assert(feedback.manifestRawSha256 === manifestRawSha256, "Stored feedback is bound to another manifest raw hash")
		return "submitted"
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "not-submitted"
		throw error
	}
}

export async function verifyCandidateReview() {
	const manifestRaw = await readFile(resolve(projectRoot, manifestRelativePath))
	const manifestRawSha256 = sha256(manifestRaw)
	const manifest = parsePrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	const closure = manifest.closure as any
	assert(manifest.protocolId === REVIEW_PROTOCOL_ID && manifest.reviewVersion === REVIEW_VERSION,
		"Review protocol identity changed")
	assert(closure.implementationSha256 === "b1139a62047bcb5d454c39c19b74e0c518de07145c49efa784d416305b8d2f3e" &&
		closure.scientificSha256 === "3dd20b73f39ebca33ca6dd762f9a4d5db13867dc85e685aa15f8d4a17708cc21" &&
		closure.executionManifestId === "a80f75b402a12516fb00f2afb3dd56e4c0fb8a4a5f7d8d5284e557eec87a3d09" &&
		closure.resultsId === "5b2526b05267bf7df7aea80e91fd8f7fad0aed27044fc8bfe5bdb4b7e9ef1a7a" &&
		closure.summaryId === "02a2bc1987a84e5567ff95316b11847c68b0df399cea9d3bdb11d7ef8d9bef37" &&
		closure.analysisId === "b2d542377ec21b9861155216ddcff5003bf501ce08fc355f277cf9303a3d8576" &&
		closure.artifactManifestId === "4f5278d454cfd7223fad9c1bd174a75892c0f17fdf40d04a3623d35f1f910aef" &&
		closure.artifactOrderedRoot === "863290bfc38e96d7297353d7cf997e853baea511ccdedf71b8d768047664bd12",
	"Review closure semantic binding changed")

	const actualInputBindings = []
	for (const [path, expectedSha256] of expectedInputs) {
		const bytes = await readBound(path, expectedSha256)
		actualInputBindings.push({ path, rawSha256: sha256(bytes) })
	}
	assert(canonicalJson(closure.inputBindings) === canonicalJson(actualInputBindings),
		"Private manifest input bindings changed")
	const results = JSON.parse((await readBound(`${candidateRoot}/results.json`, expectedInputs[6][1])).toString("utf8"))
	const analysis = JSON.parse((await readBound(`${candidateRoot}/analysis.json`, expectedInputs[8][1])).toString("utf8"))
	const artifactManifest = JSON.parse((await readBound(`${candidateRoot}/manifest.json`, expectedInputs[9][1])).toString("utf8"))
	assert(results.mechanicalGate?.pass === true && analysis.mechanicalPass === true,
		"Checked 0.7.4 mechanical gate no longer passes")
	assert(canonicalJson(results.caseIds?.novelFinalWinners) === canonicalJson(BOUND_REVIEW_CASES.map(({ caseId }) => caseId)) &&
		results.counts?.novelFinalWinners === 2 && results.counts?.novelAlternativesReachingSlateWithoutTopOne === 44 &&
		results.counts?.candidateAdditions === 6673, "Checked 0.7.4 review scope changed")
	assert(Object.values(results.authorization ?? {}).every((value) => value === false),
		"Checked closure contains a forbidden authorization")
	for (const key of FORBIDDEN_AUTHORIZATIONS) assert(manifest.authorization[key] === false,
		`Review authorization ${key} must remain false`)

	assert(canonicalJson(manifest.implementationBindings.map(({ path }) => path)) === canonicalJson(expectedImplementationPaths),
		"Review implementation closure path set changed")
	for (const binding of manifest.implementationBindings) {
		const bytes = await readFile(resolve(projectRoot, binding.path))
		assert(bytes.byteLength === binding.byteCount && sha256(bytes) === binding.rawSha256,
			`Review implementation binding changed: ${binding.path}`)
	}

	const protectedHashes = new Set<string>()
	for (const [path, rawSha256] of protectedMetadataBindings) {
		const bytes = await readBound(path, rawSha256)
		for (const hash of collectDeclaredSha256(JSON.parse(bytes.toString("utf8")))) protectedHashes.add(hash)
	}
	assert(BOUND_REVIEW_CASES.every(({ sourceSha256 }) => !protectedHashes.has(sourceSha256)),
		"A bounded development source overlaps protected-sample metadata")
	assert(manifest.scope.protectedOverlap === false, "Private manifest protected-overlap field changed")

	const artifactRows = new Map(artifactManifest.files.map((entry: any) => [entry.path, entry]))
	const resultByCase = new Map(results.sources.map((entry: any) => [entry.caseId, entry]))
	const displayedKeys: string[] = []
	const assignmentDigests = new Set<string>()
	for (const [order, bound] of BOUND_REVIEW_CASES.entries()) {
		const item = manifest.items[order]
		const [candidateRaw, controlRaw, sourceBytes] = await Promise.all([
			readBound(item.checkedArtifacts.candidatePath, bound.candidateArtifactRawSha256),
			readBound(item.checkedArtifacts.controlPath, bound.controlArtifactRawSha256),
			readFile(resolve(projectRoot, bound.file)),
		])
		assert(sourceBytes.byteLength === bound.byteCount && sha256(sourceBytes) === bound.sourceSha256,
			`Review development source changed: ${bound.caseId}`)
		assert((artifactRows.get(`sources/${bound.caseId}.json`) as any)?.rawSha256 === bound.candidateArtifactRawSha256,
			`0.7.4 artifact manifest source binding changed: ${bound.caseId}`)
		const candidateArtifact = JSON.parse(candidateRaw.toString("utf8"))
		const controlArtifact = JSON.parse(controlRaw.toString("utf8"))
		const liveControl = candidateArtifact.scientific?.control?.winner
		const closedCandidate = candidateArtifact.scientific?.candidate?.winner
		assert(liveControl?.key === bound.controlKey && closedCandidate?.key === bound.candidateKey &&
			canonicalJson(liveControl.treatment) === canonicalJson(controlArtifact.extraction?.winner),
			`Live/frozen winner custody changed: ${bound.caseId}`)
		assert(candidateArtifact.scientific?.deltaFrom072?.winner?.baselineKey === bound.controlKey &&
			candidateArtifact.scientific?.deltaFrom072?.winner?.candidateKey === bound.candidateKey &&
			candidateArtifact.scientific?.deltaFrom072?.novelFinalWinnerKey === bound.candidateKey &&
			(resultByCase.get(bound.caseId) as any)?.novelFinalWinnerKey === bound.candidateKey,
			`Closed winner delta changed: ${bound.caseId}`)
		assert(!candidateArtifact.scientific.control.domain.treatments.some(({ key }: { key: string }) => key === bound.candidateKey),
			`Candidate winner is no longer novel: ${bound.caseId}`)
		const expectedControlPalette = projectTreatment(liveControl.treatment)
		const expectedCandidatePalette = projectTreatment(closedCandidate.treatment)
		assert(canonicalJson(item.comparison.control.palette) === canonicalJson(expectedControlPalette) &&
			canonicalJson(item.comparison.candidate.palette) === canonicalJson(expectedCandidatePalette) &&
			item.comparison.control.treatmentRecordSha256 === sha256(canonicalJson(liveControl.treatment)) &&
			item.comparison.candidate.treatmentRecordSha256 === sha256(canonicalJson(closedCandidate.treatment)) &&
			paletteKey(expectedControlPalette) === bound.controlKey && paletteKey(expectedCandidatePalette) === bound.candidateKey,
			`Review treatment or color-name projection changed: ${bound.caseId}`)
		const digest = sideAssignmentDigest(bound.sourceSha256, bound.candidateKey, bound.controlKey)
		const side = candidateSide(bound.sourceSha256, bound.candidateKey, bound.controlKey)
		assert(item.assignment.digest === digest && item.assignment[side] === "candidate" &&
			item.assignment[side === "A" ? "B" : "A"] === "control", `Side assignment changed: ${bound.caseId}`)
		assignmentDigests.add(digest)
		displayedKeys.push(paletteKey(item.options.A), paletteKey(item.options.B))
	}
	assert(assignmentDigests.size === BOUND_REVIEW_CASES.length, "Side assignment was not independently bound per item")
	assert(displayedKeys.length === 4 && canonicalJson([...new Set(displayedKeys)].sort()) === canonicalJson(
		BOUND_REVIEW_CASES.flatMap(({ candidateKey, controlKey }) => [candidateKey, controlKey]).sort()),
	"Review displays something other than the exact two winner pairs")

	const payload = publicReviewPayload(manifest)
	const publicRaw = canonicalJson(payload)
	for (const item of manifest.items) {
		for (const forbidden of [
			item.internalCaseId, item.source.file, item.source.sha256, item.comparison.candidate.key,
			item.comparison.control.key, item.comparison.candidate.version, item.comparison.control.version,
		]) assert(!publicRaw.includes(forbidden), `Browser payload leaks private provenance: ${forbidden}`)
	}
	assert(!/(?:candidate|control|baseline)/i.test(publicRaw), "Browser payload leaks an assignment label")
	assert(manifest.presentation.colorNamePolicy === COLOR_NAME_POLICY && manifest.presentation.colorNamesPresentationOnly,
		"Color names are not presentation-only")

	const [app, html, css, server] = await Promise.all([
		readFile(resolve(projectRoot, "research/album-artwork-palette-v2-0.7.4-candidate-review/app.js"), "utf8"),
		readFile(resolve(projectRoot, "research/album-artwork-palette-v2-0.7.4-candidate-review/index.html"), "utf8"),
		readFile(resolve(projectRoot, "research/album-artwork-palette-v2-0.7.4-candidate-review/styles.css"), "utf8"),
		readFile(resolve(projectRoot, "research/serve-album-artwork-palette-v2-0.7.4-candidate-review.ts"), "utf8"),
	])
	assert((app.match(/function renderTreatment\s*\(/g) ?? []).length === 1 &&
		app.includes("SIDES.map((side) => renderTreatment(item, side))"), "Both sides do not use exactly one renderer")
	assert(app.includes("linear-gradient(135deg in oklab") && app.includes("palette.collapse.surface") &&
		app.includes("palette.collapse.accent") && app.includes("className: \"artwork\"") &&
		ROLES.every((role) => app.includes(`\"${role}\"`)), "Complete treatment rendering is incomplete")
	assert(!/(?:candidate|control|baseline|development-18|development-21|sourceSha256|0\.7\.[24])/i.test(`${app}\n${html}`),
		"Browser static assets leak private provenance")
	const staticColors = css.match(/#[0-9a-fA-F]{3,8}/g) ?? []
	assert(staticColors.every((color) => color.toLowerCase() === "#000" || color.toLowerCase() === "#fff"),
		"Review chrome contains a non-black/white static color")
	assert(server.includes("await link(temporary, feedbackPath)") && server.includes("EEXIST") &&
		server.includes("parseReviewSubmission") && !server.includes("readdir("),
		"Server does not enforce atomic no-overwrite bounded submission")

	const feedbackStatus = await optionalFeedback(manifest, manifestRawSha256)
	return {
		protocolId: manifest.protocolId,
		reviewVersion: manifest.reviewVersion,
		contentId: manifest.contentId,
		manifestRawSha256,
		protocolRawSha256: manifest.implementationBindings.find(({ path }) =>
			path.endsWith("PROTOCOL_V2_0_7_4_CANDIDATE_REVIEW.md"))!.rawSha256,
		itemCount: manifest.items.length,
		treatmentPairCount: displayedKeys.length / 2,
		assignments: Object.fromEntries(manifest.items.map((item) => [item.internalCaseId,
			item.assignment.A === "candidate" ? "A" : "B"])),
		protectedMetadataSourceHashCount: protectedHashes.size,
		protectedOverlap: false,
		protectedArtworkFilesAccessed: 0,
		colorNamesPresentationOnly: true,
		identicalRendererForAllSides: true,
		forbiddenAuthorizationCount: FORBIDDEN_AUTHORIZATIONS.length,
		feedbackStatus,
		feedbackPath: feedbackRelativePath,
	}
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
	verifyCandidateReview().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`), (error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
		process.exitCode = 1
	})
}
