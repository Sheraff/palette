import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { dirname, extname, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { reviewFixtures } from "./review-fixtures.ts"

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url))
const standaloneRoot = resolve(packageRoot, "research/v2-3")
const runtimeRoot = resolve(standaloneRoot, "src")

async function TypeScriptFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
		? TypeScriptFiles(resolve(directory, entry.name))
		: extname(entry.name) === ".ts" ? [resolve(directory, entry.name)] : []))
	return nested.flat()
}

test("runtime imports are closed inside v2-3 except declared npm dependencies", async () => {
	const files = [resolve(standaloneRoot, "index.ts"), ...await TypeScriptFiles(runtimeRoot)]
	const allowedPackages = new Set(["apca-w3", "sharp"])
	for (const file of files) {
		const source = await readFile(file, "utf8")
		const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\()(["'])([^"']+)\1/gu)]
			.map((match) => match[2])
		for (const specifier of specifiers) {
			if (!specifier.startsWith(".")) {
				assert.ok(allowedPackages.has(specifier), `${file} imports undeclared package ${specifier}`)
				continue
			}
			const target = resolve(dirname(file), specifier)
			assert.ok(target.startsWith(`${standaloneRoot}${sep}`), `${file} escapes v2-3 via ${specifier}`)
		}
	}
})

test("runtime contains no reviewed-case identity or expected-output fixture", async () => {
	const files = [resolve(standaloneRoot, "index.ts"), ...await TypeScriptFiles(runtimeRoot)]
	const runtime = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n")
	const genericEmergencyColors = new Set(["#000000", "#ffffff"])
	for (const reviewCase of reviewFixtures) {
		assert.ok(!runtime.includes(reviewCase.caseId), `runtime contains case ID ${reviewCase.caseId}`)
		assert.ok(!runtime.includes(reviewCase.source.file), `runtime contains fixture path ${reviewCase.source.file}`)
		assert.ok(!runtime.includes(reviewCase.source.sha256), `runtime contains source hash ${reviewCase.source.sha256}`)
		for (const color of reviewCase.roles) {
			if (genericEmergencyColors.has(color)) continue
			assert.ok(!runtime.includes(`"${color}"`), `runtime contains expected color ${color}`)
		}
	}
})
