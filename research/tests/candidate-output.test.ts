import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { prepareOutputTarget, resolveOutputTarget, writeJsonAtomic } from "../src/candidate-output.ts"

test("candidate output directories resolve from project root without changing defaults", () => {
	const projectRoot = "/project"
	const researchRoot = "/project/research"
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "results.json", undefined), {
		path: "/project/research/data/results.json",
		refuseOverwrite: false,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "robustness.json", undefined), {
		path: "/project/research/data/robustness.json",
		refuseOverwrite: false,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "holdout-summary.json", undefined), {
		path: "/project/research/data/holdout-summary.json",
		refuseOverwrite: false,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "holdout-results.json", "research/candidates/v1"), {
		path: "/project/research/candidates/v1/holdout-results.json",
		refuseOverwrite: true,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "robustness.json", "research/candidates/v1"), {
		path: "/project/research/candidates/v1/robustness.json",
		refuseOverwrite: true,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "holdout-summary.json", "research/candidates/v1"), {
		path: "/project/research/candidates/v1/holdout-summary.json",
		refuseOverwrite: true,
	})
	assert.deepEqual(resolveOutputTarget(projectRoot, researchRoot, "results.json", "/tmp/palette-v1"), {
		path: "/tmp/palette-v1/results.json",
		refuseOverwrite: true,
	})
	assert.throws(() => resolveOutputTarget(projectRoot, researchRoot, "results.json", "  "), /must not be empty/)
})

test("candidate writes can share a directory and never replace an existing output", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-candidate-output-"))
	try {
		const researchRoot = join(root, "research")
		const files = ["results.json", "holdout-results.json", "robustness.json", "holdout-summary.json"] as const
		const targets = files.map((file) => resolveOutputTarget(root, researchRoot, file, "nested/candidate"))
		for (const [index, target] of targets.entries()) await writeJsonAtomic(target, { version: index + 1 })

		for (const [index, target] of targets.entries()) {
			await assert.rejects(prepareOutputTarget(target), /Refusing to overwrite/)
			await assert.rejects(writeJsonAtomic(target, { version: 99 }), /Refusing to overwrite/)
			assert.deepEqual(JSON.parse(await readFile(target.path, "utf8")), { version: index + 1 })
		}
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("canonical writes keep overwrite behavior", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-canonical-output-"))
	try {
		const target = resolveOutputTarget(root, join(root, "research"), "robustness.json", undefined)
		await writeJsonAtomic(target, { version: 1 })
		await writeJsonAtomic(target, { version: 2 })
		assert.deepEqual(JSON.parse(await readFile(target.path, "utf8")), { version: 2 })
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
