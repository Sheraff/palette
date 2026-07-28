import { lstat, readFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { candidateTreatments, inventoryReviewArtifacts } from "./adapters.ts"
import {
	conflictReport,
	exactPairHistory,
	exactTreatmentLookup,
	minimalReviewNeed,
	unresolvedBindingsReport,
	warehouseSummary,
} from "./reports.ts"
import { buildWarehouse, defaultWarehouseRelativePath, openWarehouse } from "./warehouse.ts"

function argument(name: string): string | undefined {
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}

function argumentsFor(name: string): string[] {
	return process.argv.flatMap((value, index) => value === name && process.argv[index + 1] ? [process.argv[index + 1]] : [])
}

function required(name: string): string {
	const value = argument(name)
	if (!value) throw new Error(`Missing required ${name}`)
	return value
}

function output(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function readJson(path: string): Promise<unknown> {
	const stats = await lstat(path)
	if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`JSON input must be a regular non-symlink file: ${path}`)
	return JSON.parse(await readFile(path, "utf8")) as unknown
}

function usage(): never {
	throw new Error(`Usage:
  cli.ts inventory [--root PATH]
	  cli.ts build [--root PATH] [--db PATH] [--current-feedback PATH ...]
  cli.ts summary [--db PATH]
  cli.ts exact --source SHA (--treatment-id ID | --treatment-identity SHA) [--render-variant SHA] [--db PATH]
  cli.ts pair-history --source SHA [--first-id ID --second-id ID] [--db PATH]
  cli.ts conflicts [--db PATH]
  cli.ts unresolved [--db PATH]
  cli.ts minimal-review --candidate PATH [--db PATH]`)
}

export async function runCli(): Promise<void> {
	const command = process.argv[2]
	if (!command) usage()
	const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url))
	const root = argument("--root") ?? defaultRoot
	const databasePathValue = argument("--db") ?? join(root, defaultWarehouseRelativePath)
	const databasePath = isAbsolute(databasePathValue) ? databasePathValue : join(root, databasePathValue)
	if (command === "inventory") {
		const artifacts = await inventoryReviewArtifacts(root, { currentReviewPaths: argumentsFor("--current-feedback") })
		output({ artifactCount: artifacts.length, artifacts })
		return
	}
	if (command === "build") {
		output(await buildWarehouse({ projectRoot: root, databasePath, currentReviewPaths: argumentsFor("--current-feedback") }))
		return
	}
	const database = openWarehouse(databasePath)
	try {
		if (command === "summary") output(warehouseSummary(database))
		else if (command === "exact") output(exactTreatmentLookup(database, {
			sourceSha256: required("--source"),
			rawTreatmentId: argument("--treatment-id"),
			treatmentIdentity: argument("--treatment-identity"),
			renderVariantId: argument("--render-variant"),
		}))
		else if (command === "pair-history") output(exactPairHistory(database, {
			sourceSha256: required("--source"),
			firstRawTreatmentId: argument("--first-id"),
			secondRawTreatmentId: argument("--second-id"),
			firstTreatmentIdentity: argument("--first-treatment-identity"),
			secondTreatmentIdentity: argument("--second-treatment-identity"),
		}))
		else if (command === "conflicts") output(conflictReport(database))
		else if (command === "unresolved") output(unresolvedBindingsReport(database))
		else if (command === "minimal-review") {
			const pathValue = required("--candidate")
			const path = isAbsolute(pathValue) ? pathValue : join(root, pathValue)
			output(minimalReviewNeed(database, candidateTreatments(await readJson(path))))
		} else usage()
	} finally {
		database.close()
	}
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) await runCli()
