import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	algorithmIdentity,
	extractPalette,
	extractPaletteFromBytes,
	type PaletteExtraction,
	type RawImage,
} from "../index.ts"

import { corpusPath } from "./corpus.ts"
import { reviewFixtures, type ReviewFixture } from "./review-fixtures.ts"

const roles = ["background", "surface", "foreground", "accent"] as const

function reviewTreatment(extraction: PaletteExtraction) {
	const winner = extraction.winner
	return {
		roles: Object.fromEntries(roles.map((role) => [role, {
			hex: winner[role].hex,
			generated: winner[role].generated,
		}])),
		gradient: winner.gradient,
		collapse: winner.collapse,
		...(extraction.researchRender ? { researchRender: extraction.researchRender } : {}),
	}
}

function expectedTreatment(reviewCase: ReviewFixture) {
	const generated = new Set(reviewCase.generated ?? [])
	return {
		roles: Object.fromEntries(roles.map((role, index) => [role, {
			hex: reviewCase.roles[index],
			generated: generated.has(role),
		}])),
		gradient: reviewCase.gradient,
		collapse: { surface: reviewCase.collapse[0], accent: reviewCase.collapse[1] },
		...(reviewCase.midpoint ? {
			researchRender: {
				schemaVersion: 1,
				field: {
					kind: "linear-gradient",
					angleDegrees: 135,
					interpolation: "oklab",
					stops: [
						{ kind: "role", role: "background", position: 0 },
						{ kind: "source-supported-color", hex: reviewCase.midpoint, position: 0.5 },
						{ kind: "role", role: "surface", position: 1 },
					],
				},
			},
		} : {}),
	}
}

function solidImage(rgb: readonly [number, number, number], width = 24, height = 24): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let offset = 0; offset < data.length; offset += 3) data.set(rgb, offset)
	return { width, height, data }
}

function assertLegal(extraction: PaletteExtraction): void {
	assert.equal(extraction.algorithm, algorithmIdentity)
	assert.ok(Number.isSafeInteger(extraction.width) && extraction.width > 0)
	assert.ok(Number.isSafeInteger(extraction.height) && extraction.height > 0)
	const treatment = extraction.winner
	for (const role of roles) {
		const color = treatment[role]
		assert.match(color.hex, /^#[0-9a-f]{6}$/u)
		assert.equal(color.rgb.length, 3)
		assert.ok(color.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255))
		assert.equal(`#${color.rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
			color.hex)
		assert.ok(color.oklab.every(Number.isFinite))
		assert.equal(typeof color.generated, "boolean")
	}
	if (treatment.collapse.surface) assert.equal(treatment.surface.hex, treatment.background.hex)
	if (treatment.collapse.accent) assert.equal(treatment.accent.hex, treatment.foreground.hex)
	if (treatment.gradient) assert.equal(treatment.collapse.surface, false)
}

function describeTreatment(value: ReturnType<typeof reviewTreatment>): string {
	const palette = roles.map((role) => `${role}=${value.roles[role].hex}`
		+ (value.roles[role].generated ? "(generated)" : "")).join(" ")
	const midpoint = value.researchRender?.field.stops[1]
	return `${palette} gradient=${value.gradient}`
		+ ` collapse=${value.collapse.surface ? "S+" : "S-"}${value.collapse.accent ? "A+" : "A-"}`
		+ ` midpoint=${midpoint && "hex" in midpoint ? midpoint.hex : "none"}`
}

assert.equal(reviewFixtures.length, 34)

/**
 * One subtest per fixture, so a change that moves six artworks reports six named failures instead
 * of aborting on the first `deepEqual`. The failure message prints both complete palettes, because
 * the thing a reviewer needs is the diff, not "expected object to equal object".
 */
for (const reviewCase of reviewFixtures) {
	test(`parity: ${reviewCase.caseId}`, { timeout: 300_000 }, async () => {
		const bytes = await readFile(corpusPath(reviewCase.source.file))
		assert.equal(bytes.byteLength, reviewCase.source.bytes, `${reviewCase.caseId}: source byte count`)
		assert.equal(createHash("sha256").update(bytes).digest("hex"), reviewCase.source.sha256,
			`${reviewCase.caseId}: source hash`)
		const extraction = await extractPaletteFromBytes(bytes)
		const actual = reviewTreatment(extraction)
		const expected = expectedTreatment(reviewCase)
		assert.deepEqual(actual, expected,
			`${reviewCase.caseId}\n  expected ${describeTreatment(expected as ReturnType<typeof reviewTreatment>)}`
			+ `\n  actual   ${describeTreatment(actual)}`)
		assertLegal(extraction)
	})
}

test("decoded RawImage inference is deterministic", () => {
	const image = solidImage([31, 79, 143])
	assert.deepEqual(extractPalette(image), extractPalette(image))
})

/**
 * The synthetic case above takes the generated-emergency path, so it exercises none of the
 * quantization, family discovery, field-domain, gradient-fit, scoring or selection code where
 * determinism could actually break — it completes in single-digit milliseconds against seconds for
 * a real extraction. Charter rule 6 makes determinism a hard constraint, so one real artwork runs
 * twice here. `orelsan.jpg` is the smallest fixture that still produces a gradient winner.
 */
test("a real artwork extracts identically twice", { timeout: 300_000 }, async () => {
	const bytes = await readFile(corpusPath("images/orelsan.jpg"))
	const first = await extractPaletteFromBytes(bytes)
	const second = await extractPaletteFromBytes(bytes)
	assert.deepEqual(first, second)
	assert.equal(first.winner.gradient, true, "orelsan is the gradient-stratum determinism case")
})

/**
 * The APCA hard minimum is a charter-mandated parameter (rule 2), and its default must reproduce
 * the reviewed behaviour exactly. Raising it must be able to change the outcome, or it is not
 * wired to anything — which is what it was before.
 */
test("the contrast hard minimum is a live parameter whose default is inert", async () => {
	const bytes = await readFile(corpusPath("images/orelsan.jpg"))
	const byDefault = await extractPaletteFromBytes(bytes)
	const explicitZero = await extractPaletteFromBytes(bytes, { contrastHardMinimum: 0 })
	assert.deepEqual(explicitZero, byDefault, "an explicit 0 must be the default")
	const raised = await extractPaletteFromBytes(bytes, { contrastHardMinimum: 40 })
	assertLegal(raised)
	assert.notDeepEqual(raised, byDefault, "raising the floor must reach the observability gates")
})

test("one-color input uses the normative generated emergency", () => {
	const extraction = extractPalette(solidImage([254, 0, 0]))
	assertLegal(extraction)
	assert.equal(extraction.winner.background.hex, "#fe0000")
	assert.equal(extraction.winner.surface.hex, "#fe0000")
	assert.equal(extraction.winner.foreground.generated, true)
	assert.equal(extraction.winner.accent.generated, true)
	assert.equal(extraction.winner.foreground.hex, extraction.winner.accent.hex)
	assert.deepEqual(extraction.winner.collapse, { surface: true, accent: true })
	assert.equal(extraction.winner.gradient, false)
})

test("standalone identity is v2-3", () => {
	assert.equal(algorithmIdentity, "v2-3")
})
