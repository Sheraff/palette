import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import type { RGB } from "./src/types.ts"
import {
	ABSOLUTE_QUALITY_VALUES,
	AUTHORITATIVE_BINDINGS,
	BLINDED_RELATIVE_VALUES,
	BOUND_CASE,
	COLOR_NAME_POLICY,
	FEEDBACK_RELATIVE_PATH,
	FORBIDDEN_AUTHORIZATIONS,
	IMPLEMENTATION_PATHS,
	ISSUE_TAGS,
	MANIFEST_RELATIVE_PATH,
	RELATIVE_OUTCOME_VALUES,
	RENDERER_ID,
	REVIEW_APP_RELATIVE_PATH,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	ROLES,
	alternativeSide,
	canonicalJson,
	implementationSemanticId,
	paletteKey,
	parsePrivateReviewManifest,
	publicReviewPayload,
	sha256,
	sideAssignmentDigest,
	type ReviewPalette,
} from "./src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

async function readBound(path: string, expectedSha256: string): Promise<Buffer> {
	const bytes = await readFile(resolve(projectRoot, path))
	assert(sha256(bytes) === expectedSha256, `Raw binding changed: ${path}`)
	return bytes
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

async function assertFeedbackAbsent(): Promise<void> {
	try {
		await readFile(resolve(projectRoot, FEEDBACK_RELATIVE_PATH))
		throw new Error(`Feedback must not exist before review: ${FEEDBACK_RELATIVE_PATH}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

export async function verifyDiagnosticReview() {
	const manifestRaw = await readFile(resolve(projectRoot, MANIFEST_RELATIVE_PATH))
	const manifestRawSha256 = sha256(manifestRaw)
	const manifest = parsePrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	assert(manifest.protocolId === REVIEW_PROTOCOL_ID && manifest.reviewVersion === REVIEW_VERSION,
		"Diagnostic review identity changed")
	assert(manifest.items.length === 1 && manifest.scope.itemCount === 1 &&
		canonicalJson(manifest.scope.exactSourceCaseIds) === canonicalJson([BOUND_CASE.caseId]),
	"Diagnostic review denominator changed")

	const rawByPath = new Map<string, Buffer>()
	for (const binding of AUTHORITATIVE_BINDINGS) {
		rawByPath.set(binding.path, await readBound(binding.path, binding.rawSha256))
	}
	const expectedAuthoritativeBindings = AUTHORITATIVE_BINDINGS.map((binding) => ({
		path: binding.path,
		semanticIds: binding.semanticIds,
		byteCount: rawByPath.get(binding.path)!.byteLength,
		rawSha256: binding.rawSha256,
	}))
	assert(canonicalJson(manifest.authoritativeBindings) === canonicalJson(expectedAuthoritativeBindings),
		"Manifest authoritative bindings do not match exact source bytes")
	const postmortem = rawByPath.get(AUTHORITATIVE_BINDINGS[0].path)!.toString("utf8")
	const roster = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[1].path)!.toString("utf8"))
	const audit = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[2].path)!.toString("utf8"))
	const artifact = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[3].path)!.toString("utf8"))
	const panel = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[4].path)!.toString("utf8"))
	assert(postmortem.startsWith("# Album Artwork UI Palette V2 0.7.5 Known-Failure Diagnostic Postmortem\n") &&
		postmortem.includes(`exact alternative key: \`${BOUND_CASE.alternativeKey}\``),
	"Diagnostic postmortem semantics changed")
	assert(roster.rosterVersion === AUTHORITATIVE_BINDINGS[1].semanticIds[0] &&
		roster.rosterId === AUTHORITATIVE_BINDINGS[1].semanticIds[1], "Roster semantic IDs changed")
	assert(audit.analysisVersion === AUTHORITATIVE_BINDINGS[2].semanticIds[0] &&
		audit.analysisId === AUTHORITATIVE_BINDINGS[2].semanticIds[1], "Audit semantic IDs changed")
	assert(artifact.candidateVersion === AUTHORITATIVE_BINDINGS[3].semanticIds[0] &&
		artifact.protocolId === AUTHORITATIVE_BINDINGS[3].semanticIds[1] &&
		artifact.executionManifestId === AUTHORITATIVE_BINDINGS[3].semanticIds[2] &&
		artifact.scientificSha256 === AUTHORITATIVE_BINDINGS[3].semanticIds[3],
	"Checked artifact semantic IDs changed")
	assert(panel.manifestId === AUTHORITATIVE_BINDINGS[4].semanticIds[0], "Development panel semantic ID changed")

	const rosterCase = roster.cases?.find((entry: any) => entry.caseId === BOUND_CASE.caseId)
	const auditReview = audit.nextBoundedDiagnosticReview
	const panelSource = panel.sources?.find((entry: any) => entry.caseId === BOUND_CASE.caseId)
	const source = artifact.scientific?.source
	const candidate = artifact.scientific?.candidate
	const winner = candidate?.winner
	const control = candidate?.slate?.[0]
	const alternative = candidate?.slate?.[1]
	const reviewedKeys = new Set([
		...(rosterCase?.humanEvidence ?? []).map((entry: any) => entry.treatmentKey),
		...(rosterCase?.reviewedAlternatives ?? []).map((entry: any) => entry.treatmentKey),
	])
	assert(rosterCase?.current074?.winnerKey === BOUND_CASE.controlKey &&
		canonicalJson(rosterCase.current074.slateKeys?.slice(0, 2)) ===
			canonicalJson([BOUND_CASE.controlKey, BOUND_CASE.alternativeKey]) &&
		reviewedKeys.has(BOUND_CASE.controlKey) && !reviewedKeys.has(BOUND_CASE.alternativeKey),
	"Roster treatment review-state binding changed")
	assert(auditReview?.caseId === BOUND_CASE.caseId && auditReview.sourceSha256 === BOUND_CASE.sourceSha256 &&
		auditReview.control?.key === BOUND_CASE.controlKey && auditReview.control?.reviewed === true &&
		auditReview.alternative?.key === BOUND_CASE.alternativeKey && auditReview.alternative?.publicSlateIndex === 1 &&
		auditReview.alternative?.reviewed === false && auditReview.maximumItemCount === 1 &&
		auditReview.blindedPairwiseComparisonRequired === true,
	"Audit exact review predeclaration changed")
	assert(panelSource?.path === BOUND_CASE.file && panelSource.sha256 === BOUND_CASE.sourceSha256 &&
		panelSource.byteCount === BOUND_CASE.byteCount && panelSource.artworkId === BOUND_CASE.artworkId &&
		source?.caseId === BOUND_CASE.caseId && source.path === BOUND_CASE.file &&
		source.sha256 === BOUND_CASE.sourceSha256 && source.byteCount === BOUND_CASE.byteCount &&
		source.artworkId === BOUND_CASE.artworkId,
	"Exact development source binding changed")
	assert(rawByPath.get(BOUND_CASE.file)!.byteLength === BOUND_CASE.byteCount,
		"Exact development source byte count changed")
	assert(candidate?.slate?.length === 8 && winner?.key === BOUND_CASE.controlKey &&
		control?.key === BOUND_CASE.controlKey && alternative?.key === BOUND_CASE.alternativeKey &&
		canonicalJson(winner.treatment) === canonicalJson(control.treatment),
	"Checked winner and public-slate indices changed")

	const expectedControl = projectTreatment(control.treatment)
	const expectedAlternative = projectTreatment(alternative.treatment)
	const item = manifest.items[0]
	assert(item.comparison.control.slateIndex === 0 && item.comparison.control.reviewed === true &&
		item.comparison.alternative.slateIndex === 1 && item.comparison.alternative.reviewed === false &&
		item.comparison.control.key === BOUND_CASE.controlKey &&
		item.comparison.alternative.key === BOUND_CASE.alternativeKey &&
		item.comparison.control.treatmentRecordSha256 === sha256(canonicalJson(control.treatment)) &&
		item.comparison.alternative.treatmentRecordSha256 === sha256(canonicalJson(alternative.treatment)) &&
		canonicalJson(item.comparison.control.palette) === canonicalJson(expectedControl) &&
		canonicalJson(item.comparison.alternative.palette) === canonicalJson(expectedAlternative) &&
		paletteKey(expectedControl) === BOUND_CASE.controlKey && paletteKey(expectedAlternative) === BOUND_CASE.alternativeKey,
	"Manifest treatments were not projected from the exact checked slate records")
	const digest = sideAssignmentDigest(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	const side = alternativeSide(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	assert(item.assignment.digest === digest && item.assignment[side] === "alternative" &&
		item.assignment[side === "A" ? "B" : "A"] === "control",
	"Deterministic side assignment changed")
	assert(canonicalJson(item.options.A) === canonicalJson(item.assignment.A === "alternative" ? expectedAlternative : expectedControl) &&
		canonicalJson(item.options.B) === canonicalJson(item.assignment.B === "alternative" ? expectedAlternative : expectedControl),
	"Complete side rendering data changed")

	assert(canonicalJson(manifest.implementationBindings.map(({ path }) => path)) === canonicalJson(IMPLEMENTATION_PATHS),
		"Implementation/UI binding path set changed")
	for (const binding of manifest.implementationBindings) {
		const bytes = await readFile(resolve(projectRoot, binding.path))
		const expectedSemanticId = binding.path.endsWith("DIAGNOSTIC_REVIEW.md")
			? REVIEW_PROTOCOL_ID
			: implementationSemanticId(binding.path, binding.rawSha256)
		assert(bytes.byteLength === binding.byteCount && sha256(bytes) === binding.rawSha256 &&
			canonicalJson(binding.semanticIds) === canonicalJson([expectedSemanticId]),
		`Implementation/UI binding changed: ${binding.path}`)
	}
	for (const key of FORBIDDEN_AUTHORIZATIONS) {
		assert(manifest.authorization[key] === false, `Forbidden authorization ${key} must remain false`)
	}
	assert(canonicalJson(manifest.presentation) === canonicalJson({
		rendererId: RENDERER_ID,
		rendererSourcePath: `${REVIEW_APP_RELATIVE_PATH}/app.js`,
		rendererFunction: "renderTreatment",
		identicalRendererForAllSides: true,
		reviewCompleteRenderedTreatmentNotSwatchesOnly: true,
		gradientCss: "linear-gradient(135deg in oklab, background 0%, surface 100%)",
		colorNamePolicy: COLOR_NAME_POLICY,
		colorNamesPresentationOnly: true,
	}), "Presentation contract changed")
	assert(canonicalJson(manifest.responseSchema) === canonicalJson({
		absoluteQuality: ABSOLUTE_QUALITY_VALUES,
		blindedRelativeInput: BLINDED_RELATIVE_VALUES,
		storedRelativeOutcome: RELATIVE_OUTCOME_VALUES,
		candidateOutcomeMeans: "bound-alternative",
		baselineOutcomeMeans: "bound-control",
		issueTags: ISSUE_TAGS,
		comment: { required: false, maximumUtf16CodeUnits: 2_000, preserveVerbatim: true },
		isolatedSwatchQuestions: false,
	}), "Allowed response schema changed")

	const payload = publicReviewPayload(manifest)
	const publicRaw = canonicalJson(payload)
	for (const forbidden of [
		item.internalCaseId,
		item.source.file,
		item.source.sha256,
		item.source.artworkId,
		item.checkedArtifact.path,
		item.comparison.control.key,
		item.comparison.alternative.key,
	]) assert(!publicRaw.includes(forbidden), `Browser payload leaks private provenance: ${forbidden}`)
	assert(!/(?:candidate|baseline|control|alternative|slateIndex|reviewed)/i.test(publicRaw),
		"Browser payload leaks assignment provenance")

	const [app, html, css, server, packageJson] = await Promise.all([
		readFile(resolve(projectRoot, `${REVIEW_APP_RELATIVE_PATH}/app.js`), "utf8"),
		readFile(resolve(projectRoot, `${REVIEW_APP_RELATIVE_PATH}/index.html`), "utf8"),
		readFile(resolve(projectRoot, `${REVIEW_APP_RELATIVE_PATH}/styles.css`), "utf8"),
		readFile(resolve(projectRoot,
			"research/serve-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"), "utf8"),
		readFile(resolve(projectRoot, "package.json"), "utf8"),
	])
	assert((app.match(/function renderTreatment\s*\(/g) ?? []).length === 1 &&
		app.includes("SIDES.map((side) => renderTreatment(item, side))"),
	"Both sides do not use exactly one complete-treatment renderer")
	assert(app.includes("linear-gradient(135deg in oklab") && app.includes("palette.collapse.surface") &&
		app.includes("palette.collapse.accent") && app.includes("className: \"artwork\"") &&
		ROLES.every((role) => app.includes(`\"${role}\"`)), "Complete treatment UI rendering is incomplete")
	assert(!/(?:candidate|baseline|control|alternative|development-12|sourceSha256|0\.7\.)/i.test(`${app}\n${html}`),
		"Browser static assets leak private provenance")
	const staticColors = css.match(/#[0-9a-fA-F]{3,8}/g) ?? []
	assert(staticColors.every((color) => color.toLowerCase() === "#000" || color.toLowerCase() === "#fff"),
		"Review chrome contains a non-black/white static color")
	assert(server.includes("await link(temporary, feedbackPath)") && server.includes("EEXIST") &&
		server.includes("parseReviewSubmission") && server.includes("BOUND_CASE.file") && !server.includes("readdir("),
	"Dormant server does not enforce exact-source and atomic no-overwrite boundaries")
	const scripts = JSON.parse(packageJson).scripts
	assert(scripts["research:album-v2:0.7.5:diagnostic-review:prepare"] &&
		scripts["research:album-v2:0.7.5:diagnostic-review:verify"] &&
		scripts["research:album-v2:0.7.5:diagnostic-review:serve"] &&
		scripts["research:album-v2:0.7.5:diagnostic-review:test"], "Diagnostic review package scripts are incomplete")
	await assertFeedbackAbsent()

	return {
		protocolId: manifest.protocolId,
		reviewVersion: manifest.reviewVersion,
		contentId: manifest.contentId,
		manifestRawSha256,
		protocolRawSha256: manifest.implementationBindings.find(({ path }) =>
			path.endsWith("DIAGNOSTIC_REVIEW.md"))!.rawSha256,
		itemCount: 1,
		treatmentPairCount: 1,
		alternativeSide: side,
		controlSlateIndex: 0,
		alternativeSlateIndex: 1,
		authoritativeBindingCount: manifest.authoritativeBindings.length,
		implementationBindingCount: manifest.implementationBindings.length,
		forbiddenAuthorizationCount: FORBIDDEN_AUTHORIZATIONS.length,
		protectedOrFreshArtworkRootsAccessed: 0,
		exactDevelopmentArtworkFilesAccessed: 1,
		feedbackStatus: "not-submitted" as const,
		feedbackPath: FEEDBACK_RELATIVE_PATH,
		ready: true,
		servedOrOpened: false,
	}
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
	verifyDiagnosticReview().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`), (error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
		process.exitCode = 1
	})
}
