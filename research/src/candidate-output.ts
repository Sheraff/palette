import { access, link, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"

export type OutputTarget = {
	path: string
	refuseOverwrite: boolean
}

export type OutputFileName =
	| "results.json"
	| "holdout-results.json"
	| "robustness.json"
	| "holdout-summary.json"

export function resolveOutputTarget(
	projectRoot: string,
	researchRoot: string,
	fileName: OutputFileName,
	outputDirectory: string | undefined,
): OutputTarget {
	if (outputDirectory === undefined) {
		return { path: join(researchRoot, "data", fileName), refuseOverwrite: false }
	}
	if (outputDirectory.trim().length === 0) throw new Error("RESEARCH_OUTPUT_DIR must not be empty")
	const root = isAbsolute(outputDirectory) ? resolve(outputDirectory) : resolve(projectRoot, outputDirectory)
	return { path: join(root, fileName), refuseOverwrite: true }
}

function overwriteError(path: string): Error {
	return new Error(`Refusing to overwrite existing candidate output: ${path}`)
}

export async function prepareOutputTarget(target: OutputTarget): Promise<void> {
	await mkdir(dirname(target.path), { recursive: true })
	if (!target.refuseOverwrite) return
	try {
		await access(target.path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw overwriteError(target.path)
}

export async function writeJsonAtomic(target: OutputTarget, value: unknown): Promise<void> {
	await mkdir(dirname(target.path), { recursive: true })
	const temporary = `${target.path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		if (!target.refuseOverwrite) {
			await rename(temporary, target.path)
			return
		}
		try {
			// A hard link publishes the complete temporary file without replacing an existing path.
			await link(temporary, target.path)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") throw overwriteError(target.path)
			throw error
		}
	} finally {
		await rm(temporary, { force: true })
	}
}
