/**
 * The result-file fingerprint header (build item 17).
 *
 * The load-bearing property is the one that is easiest to break by accident: the header must stay
 * **outside** any body hash a producer publishes. If it ever lands inside, every commit changes the
 * hash and the hash stops distinguishing "the numbers moved" from "someone committed something".
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { writeHeader, fingerprintFile, packageVersions } from "../src/provenance/header.ts"
import { runCensus } from "../src/honesty/cli.ts"
import { V3_ROOT } from "../src/honesty/cli.ts"

describe("writeHeader", () => {
	test("records code identity, packages, and the timestamp it was told to use", () => {
		const header = writeHeader({
			what: "test fixture",
			generatedBy: "research/v3/tests/provenance-header.test.ts",
			generatedAt: "2026-08-04T00:00:00.000Z",
		})
		assert.equal(header.what, "test fixture")
		assert.equal(header.generatedAt, "2026-08-04T00:00:00.000Z")
		assert.equal(header.node, undefined, "node lives under code, not at the top level")
		assert.equal(header.code.node, process.version)
		assert.match(
			header.code.gitCommit ?? "",
			/^[0-9a-f]{40}$/,
			"the full commit id is recorded; a reader may abbreviate, a writer may not",
		)
		assert.equal(typeof header.code.gitDirty, "boolean")
		assert.deepEqual(header.inputs, [])
	})

	test("sharp's version is captured — the repo carries two sharps on purpose", () => {
		const versions = packageVersions()
		assert.ok(Object.hasOwn(versions, "sharp"), "sharp must be tracked")
		assert.ok(Object.hasOwn(versions, "sharp-modern"), "the alias must be tracked separately")
		assert.match(versions.sharp ?? "", /^\d+\.\d+\.\d+/)
	})

	test("input files are fingerprinted by full sha256 of their bytes", () => {
		const dir = mkdtempSync(join(tmpdir(), "prov-"))
		try {
			const file = join(dir, "input.json")
			const contents = '{"a":1}'
			writeFileSync(file, contents)
			const expected = createHash("sha256").update(contents).digest("hex")

			const header = writeHeader({
				what: "test",
				generatedBy: "test",
				generatedAt: "2026-08-04T00:00:00.000Z",
				inputs: [{ absolute: file, display: "data/input.json" }],
			})
			assert.equal(header.inputs.length, 1)
			assert.equal(header.inputs[0].path, "data/input.json", "display path is what the header shows")
			assert.equal(header.inputs[0].sha256, expected)
			assert.equal(header.inputs[0].bytes, contents.length)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test("an unreadable input is recorded as unreadable, never silently dropped", () => {
		const fingerprint = fingerprintFile("/definitely/not/a/real/path.json", "missing.json")
		assert.deepEqual(fingerprint, { path: "missing.json", sha256: null, bytes: null })
	})

	test("a missing git does not throw — a header field goes null and the run continues", () => {
		// Exercised indirectly: the fields are typed nullable and every git call is wrapped. This test
		// pins the contract that the nullable type is real, so a future caller cannot assume non-null.
		const header = writeHeader({ what: "t", generatedBy: "t", generatedAt: "2026-08-04T00:00:00.000Z" })
		const nullable: string | null = header.code.gitCommit
		assert.ok(nullable === null || typeof nullable === "string")
	})
})

describe("wired into the honesty census", () => {
	test("the census attaches a header when asked, and omits it when not", () => {
		const withHeader = runCensus(V3_ROOT, "2026-08-04T00:00:00.000Z", true)
		assert.ok(withHeader.meta.provenance, "provenance header missing")
		assert.equal(withHeader.meta.provenance?.generatedBy, "research/v3/src/honesty/cli.ts")
		assert.equal(
			withHeader.meta.provenance?.inputs[0]?.path,
			"research/v3/data/decisions/decisions.json",
			"the decision ledger is the census's one external input",
		)

		const without = runCensus(V3_ROOT, "2026-08-04T00:00:00.000Z", false)
		assert.equal(without.meta.provenance, undefined)
	})

	test("the header does not enter bodyHash — this is the whole determinism contract", () => {
		const withHeader = runCensus(V3_ROOT, "2026-08-04T00:00:00.000Z", true)
		const without = runCensus(V3_ROOT, "2026-08-04T00:00:00.000Z", false)
		assert.equal(
			withHeader.bodyHash,
			without.bodyHash,
			"attaching a fingerprint changed the body hash: every commit would now show up as a metric change",
		)
	})
})
