import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	algorithmIdentity,
	extractPalette,
	extractPaletteFromBytes,
	type PaletteExtraction,
	type RawImage,
} from "../index.ts"

import { reviewFixtures, type ReviewFixture } from "./review-fixtures.ts"

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url))
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

test("standalone output exactly matches all 34 reviewed treatments and midpoint renders", { timeout: 1_800_000 },
	async () => {
		assert.equal(reviewFixtures.length, 34)
		for (const reviewCase of reviewFixtures) {
			const sourcePath = resolve(packageRoot, reviewCase.source.file)
			const bytes = await readFile(sourcePath)
			assert.equal(bytes.byteLength, reviewCase.source.bytes, `${reviewCase.caseId}: source byte count`)
			assert.equal(createHash("sha256").update(bytes).digest("hex"), reviewCase.source.sha256,
				`${reviewCase.caseId}: source hash`)
			const extraction = await extractPaletteFromBytes(bytes)
			assert.deepEqual(reviewTreatment(extraction), expectedTreatment(reviewCase), reviewCase.caseId)
			assertLegal(extraction)
		}
	})

test("decoded RawImage inference is deterministic", () => {
	const image = solidImage([31, 79, 143])
	assert.deepEqual(extractPalette(image), extractPalette(image))
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

test("standalone identity is v2-2", () => {
	assert.equal(algorithmIdentity, "v2-2")
})
