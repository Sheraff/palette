import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadImage } from "./src/image.ts"
import {
	traceTypographyChromaticRoleCounterfactuals,
	TYPOGRAPHY_CHROMATIC_ROLE_COUNTERFACTUAL_VERSION,
} from "./src/typography-chromatic-role-counterfactual.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const targetFile = "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg"
const experimentRoot = join(projectRoot, "research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development")
const outputPath = join(experimentRoot, "target-counterfactuals.json")

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
const bytes = await readFile(join(projectRoot, targetFile))
const trace = traceTypographyChromaticRoleCounterfactuals(await loadImage(bytes))
const bindings = Object.fromEntries(await Promise.all([
	"research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/protocol.json",
	"research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/evaluation.json",
	"research/src/typography-chromatic-role-counterfactual.ts",
	"research/evaluate-typography-chromatic-role-counterfactual.ts",
].map(async (file) => [file, sha256(await readFile(join(projectRoot, file)))] as const)))
await writeFile(outputPath, `${JSON.stringify({
	schemaVersion: 1,
	experimentVersion: TYPOGRAPHY_CHROMATIC_ROLE_COUNTERFACTUAL_VERSION,
	generatedAt: new Date().toISOString(),
	developmentEvidence: true,
	target: { caseId: "pa00-fd039db1bbdea9bd080f", file: targetFile, sourceSha256: sha256(bytes) },
	bindings,
	interpretationPolicy: {
		targetHexesAreNotInferred: true,
		positivePaletteRatingRemainsNonExclusive: true,
		feasibleAlternativeIsNotAssumedPreferred: true,
	},
	trace,
}, null, 2)}\n`, { flag: "wx" })
