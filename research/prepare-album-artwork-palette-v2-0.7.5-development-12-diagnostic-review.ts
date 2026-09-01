import { link, readFile, rm, writeFile } from "node:fs/promises"
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
	PRESENTATION_VERSION,
	RELATIVE_OUTCOME_VALUES,
	RENDERER_ID,
	REVIEW_APP_RELATIVE_PATH,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	ROLES,
	alternativeSide,
	canonicalJson,
	implementationSemanticId,
	mediaToken,
	paletteKey,
	publicItemId,
	refuseExistingReviewArtifact,
	reviewManifestContentId,
	sha256,
	sideAssignmentDigest,
	type FileBinding,
	type PrivateReviewItem,
	type PrivateReviewManifest,
	type ReviewPalette,
} from "./src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const outputPath = resolve(projectRoot, MANIFEST_RELATIVE_PATH)
const feedbackPath = resolve(projectRoot, FEEDBACK_RELATIVE_PATH)

type Treatment = Readonly<Record<string, any>> & Readonly<{
	background: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	surface: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	foreground: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	accent: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

async function readBound(path: string, expectedSha256: string): Promise<Buffer> {
	const bytes = await readFile(resolve(projectRoot, path))
	assert(sha256(bytes) === expectedSha256, `Raw binding changed: ${path}`)
	return bytes
}

async function atomicExclusiveJson(path: string, value: unknown): Promise<Buffer> {
	const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
	const temporary = `${path}.${process.pid}.${sha256(bytes).slice(0, 12)}.tmp`
	await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
		}
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
	return bytes
}

function projectTreatment(treatment: Treatment): ReviewPalette {
	const names = namePalette(ROLES.map((role) => treatment[role].rgb))
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

function validateAuthoritativeSemantics(rawByPath: ReadonlyMap<string, Buffer>) {
	const text = rawByPath.get(AUTHORITATIVE_BINDINGS[0].path)!.toString("utf8")
	assert(text.startsWith("# Album Artwork UI Palette V2 0.7.5 Known-Failure Diagnostic Postmortem\n") &&
		text.includes("## Smallest Next Evidence Unit") && text.includes(`case: \`${BOUND_CASE.caseId}\` only`) &&
		text.includes(`exact \`0.7.4\` control key: \`${BOUND_CASE.controlKey}\``) &&
		text.includes(`exact alternative key: \`${BOUND_CASE.alternativeKey}\``),
	"Diagnostic postmortem semantic binding changed")

	const roster = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[1].path)!.toString("utf8"))
	const audit = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[2].path)!.toString("utf8"))
	const artifact = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[3].path)!.toString("utf8"))
	const panel = JSON.parse(rawByPath.get(AUTHORITATIVE_BINDINGS[4].path)!.toString("utf8"))
	assert(roster.rosterVersion === AUTHORITATIVE_BINDINGS[1].semanticIds[0] &&
		roster.rosterId === AUTHORITATIVE_BINDINGS[1].semanticIds[1], "Roster semantic binding changed")
	assert(audit.analysisVersion === AUTHORITATIVE_BINDINGS[2].semanticIds[0] &&
		audit.analysisId === AUTHORITATIVE_BINDINGS[2].semanticIds[1] &&
		audit.roster?.rosterId === roster.rosterId, "Audit semantic binding changed")
	assert(artifact.candidateVersion === AUTHORITATIVE_BINDINGS[3].semanticIds[0] &&
		artifact.protocolId === AUTHORITATIVE_BINDINGS[3].semanticIds[1] &&
		artifact.executionManifestId === AUTHORITATIVE_BINDINGS[3].semanticIds[2] &&
		artifact.scientificSha256 === AUTHORITATIVE_BINDINGS[3].semanticIds[3],
	"Checked source-artifact semantic binding changed")
	assert(panel.manifestId === AUTHORITATIVE_BINDINGS[4].semanticIds[0], "Development panel semantic binding changed")
	return { roster, audit, artifact, panel }
}

export async function prepareDiagnosticReview() {
	await Promise.all([
		refuseExistingReviewArtifact(outputPath),
		refuseExistingReviewArtifact(feedbackPath),
	])

	const rawByPath = new Map<string, Buffer>()
	for (const binding of AUTHORITATIVE_BINDINGS) {
		rawByPath.set(binding.path, await readBound(binding.path, binding.rawSha256))
	}
	const { roster, audit, artifact, panel } = validateAuthoritativeSemantics(rawByPath)
	const rosterCase = roster.cases?.find((entry: any) => entry.caseId === BOUND_CASE.caseId)
	const auditReview = audit.nextBoundedDiagnosticReview
	const panelSource = panel.sources?.find((entry: any) => entry.caseId === BOUND_CASE.caseId)
	const source = artifact.scientific?.source
	const candidate = artifact.scientific?.candidate
	const control = candidate?.slate?.[BOUND_CASE.controlSlateIndex]
	const alternative = candidate?.slate?.[BOUND_CASE.alternativeSlateIndex]
	const reviewedKeys = new Set([
		...(rosterCase?.humanEvidence ?? []).map((entry: any) => entry.treatmentKey),
		...(rosterCase?.reviewedAlternatives ?? []).map((entry: any) => entry.treatmentKey),
	])
	assert(rosterCase?.current074?.winnerKey === BOUND_CASE.controlKey &&
		rosterCase.current074.slateKeys?.[0] === BOUND_CASE.controlKey &&
		rosterCase.current074.slateKeys?.[1] === BOUND_CASE.alternativeKey &&
		reviewedKeys.has(BOUND_CASE.controlKey) && !reviewedKeys.has(BOUND_CASE.alternativeKey),
	"Frozen roster does not establish the exact reviewed control and unreviewed alternative")
	assert(auditReview?.caseId === BOUND_CASE.caseId && auditReview.sourceSha256 === BOUND_CASE.sourceSha256 &&
		auditReview.control?.key === BOUND_CASE.controlKey && auditReview.control?.reviewed === true &&
		auditReview.alternative?.key === BOUND_CASE.alternativeKey &&
		auditReview.alternative?.publicSlateIndex === BOUND_CASE.alternativeSlateIndex &&
		auditReview.alternative?.reviewed === false && auditReview.maximumItemCount === 1 &&
		auditReview.blindedPairwiseComparisonRequired === true,
	"Audit no longer predeclares this exact one-item diagnostic review")
	assert(panelSource?.path === BOUND_CASE.file && panelSource.sha256 === BOUND_CASE.sourceSha256 &&
		panelSource.byteCount === BOUND_CASE.byteCount && panelSource.artworkId === BOUND_CASE.artworkId &&
		source?.caseId === BOUND_CASE.caseId && source.path === BOUND_CASE.file &&
		source.sha256 === BOUND_CASE.sourceSha256 && source.byteCount === BOUND_CASE.byteCount &&
		source.artworkId === BOUND_CASE.artworkId,
	"Development panel or checked artifact source custody changed")
	assert(candidate?.winner?.key === BOUND_CASE.controlKey && control?.key === BOUND_CASE.controlKey &&
		alternative?.key === BOUND_CASE.alternativeKey && candidate.slate.length === 8 &&
		canonicalJson(candidate.winner.treatment) === canonicalJson(control.treatment),
	"Checked winner/public-slate custody changed")

	const controlPalette = projectTreatment(control.treatment as Treatment)
	const alternativePalette = projectTreatment(alternative.treatment as Treatment)
	assert(paletteKey(controlPalette) === BOUND_CASE.controlKey &&
		paletteKey(alternativePalette) === BOUND_CASE.alternativeKey,
	"Complete treatment projection changed")
	const side = alternativeSide(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	const item: PrivateReviewItem = {
		internalCaseId: BOUND_CASE.caseId,
		publicItemId: publicItemId(BOUND_CASE.sourceSha256),
		mediaToken: mediaToken(BOUND_CASE.sourceSha256),
		order: 0,
		source: {
			file: BOUND_CASE.file,
			sha256: BOUND_CASE.sourceSha256,
			byteCount: BOUND_CASE.byteCount,
			artworkId: BOUND_CASE.artworkId,
			cohort: "development",
		},
		checkedArtifact: {
			path: BOUND_CASE.artifactPath,
			rawSha256: BOUND_CASE.artifactRawSha256,
			candidateVersion: "album-artwork-first-principles-0.7.4",
			scientificSha256: "0a0bf7b95bc683882fada068d363fcab7e022420d0867261228aaab51ed68bd3",
		},
		comparison: {
			control: {
				key: BOUND_CASE.controlKey,
				slateIndex: BOUND_CASE.controlSlateIndex,
				reviewed: true,
				treatmentRecordSha256: sha256(canonicalJson(control.treatment)),
				palette: controlPalette,
			},
			alternative: {
				key: BOUND_CASE.alternativeKey,
				slateIndex: BOUND_CASE.alternativeSlateIndex,
				reviewed: false,
				treatmentRecordSha256: sha256(canonicalJson(alternative.treatment)),
				palette: alternativePalette,
			},
		},
		assignment: side === "A"
			? { digest: sideAssignmentDigest(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey),
				A: "alternative", B: "control" }
			: { digest: sideAssignmentDigest(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey),
				A: "control", B: "alternative" },
		options: side === "A"
			? { A: alternativePalette, B: controlPalette }
			: { A: controlPalette, B: alternativePalette },
	}

	const authoritativeBindings: FileBinding[] = AUTHORITATIVE_BINDINGS.map((binding) => ({
		path: binding.path,
		semanticIds: binding.semanticIds,
		byteCount: rawByPath.get(binding.path)!.byteLength,
		rawSha256: binding.rawSha256,
	}))
	const implementationBindings: FileBinding[] = []
	for (const path of IMPLEMENTATION_PATHS) {
		const bytes = await readFile(resolve(projectRoot, path))
		const rawSha256 = sha256(bytes)
		implementationBindings.push({
			path,
			semanticIds: [path.endsWith("DIAGNOSTIC_REVIEW.md")
				? REVIEW_PROTOCOL_ID
				: implementationSemanticId(path, rawSha256)],
			byteCount: bytes.byteLength,
			rawSha256,
		})
	}
	const authorization: Record<string, boolean> = {
		diagnosticReviewPreparation: true,
		immutableReviewPackage: true,
		focusedVerification: true,
	}
	for (const key of FORBIDDEN_AUTHORIZATIONS) authorization[key] = false
	const identity: Omit<PrivateReviewManifest, "contentId"> = {
		schemaVersion: 1,
		protocolId: REVIEW_PROTOCOL_ID,
		reviewVersion: REVIEW_VERSION,
		presentationVersion: PRESENTATION_VERSION,
		scope: {
			evidenceClass: "bounded-development-known-failure-diagnostic",
			purpose: "one-item-retained-alternative-quality-diagnosis",
			itemCount: 1,
			exactSourceCaseIds: [BOUND_CASE.caseId],
			protectedOrFreshArtworkRootsAccessed: 0,
		},
		authoritativeBindings,
		implementationBindings,
		presentation: {
			rendererId: RENDERER_ID,
			rendererSourcePath: `${REVIEW_APP_RELATIVE_PATH}/app.js`,
			rendererFunction: "renderTreatment",
			identicalRendererForAllSides: true,
			reviewCompleteRenderedTreatmentNotSwatchesOnly: true,
			gradientCss: "linear-gradient(135deg in oklab, background 0%, surface 100%)",
			colorNamePolicy: COLOR_NAME_POLICY,
			colorNamesPresentationOnly: true,
		},
		responseSchema: {
			absoluteQuality: ABSOLUTE_QUALITY_VALUES,
			blindedRelativeInput: BLINDED_RELATIVE_VALUES,
			storedRelativeOutcome: RELATIVE_OUTCOME_VALUES,
			candidateOutcomeMeans: "bound-alternative",
			baselineOutcomeMeans: "bound-control",
			issueTags: ISSUE_TAGS,
			comment: { required: false, maximumUtf16CodeUnits: 2_000, preserveVerbatim: true },
			isolatedSwatchQuestions: false,
		},
		authorization,
		items: [item],
	}
	const manifest: PrivateReviewManifest = { ...identity, contentId: reviewManifestContentId(identity) }
	const bytes = await atomicExclusiveJson(outputPath, manifest)
	return {
		protocolId: REVIEW_PROTOCOL_ID,
		reviewVersion: REVIEW_VERSION,
		contentId: manifest.contentId,
		manifestRawSha256: sha256(bytes),
		itemCount: 1,
		alternativeSide: side,
		feedbackPath: FEEDBACK_RELATIVE_PATH,
	}
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
	prepareDiagnosticReview().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`), (error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
		process.exitCode = 1
	})
}
