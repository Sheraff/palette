/**
 * VERIFIER-OWNED. Builds the fixtures the independent re-derivation reads.
 *
 * Writes: a 6-colour synthetic PNG, a 30-degree linear ramp, a quadratic radial field with a known
 * centre, a ring bull's-eye, and a raw RGB dump of one real demo-20 cover (dumped through sharp
 * directly so the naive side never imports src/measure).
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const OUT = process.argv[2]
const REPO = "/Users/Flo/GitHub/palette"
const REAL = join(REPO, "00/ab67616d00001e02000000d8bc25fbca2eff2a4a.jpg")

mkdirSync(OUT, { recursive: true })

async function writePng(name: string, width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
	const raw = Buffer.alloc(width * height * 3)
	let offset = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1, offset += 3) {
			const [r, g, b] = paint(x, y)
			raw[offset] = r
			raw[offset + 1] = g
			raw[offset + 2] = b
		}
	}
	const path = join(OUT, name)
	await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

// --- 1. six-colour synthetic ---------------------------------------------------------------
const PALETTE: [number, number, number][] = [
	[10, 10, 12],
	[200, 30, 40],
	[20, 120, 200],
	[240, 240, 235],
	[128, 128, 128],
	[250, 200, 20],
]
const W6 = 17
const H6 = 13
const EDGES = [10, 25, 55, 100, 160, W6 * H6]
await writePng("six.png", W6, H6, (x, y) => {
	const n = y * W6 + x
	for (let i = 0; i < EDGES.length; i += 1) if (n < EDGES[i]) return PALETTE[i]
	return PALETTE[5]
})

// --- 1b. six colours that sit INSIDE / near the same-colour bar, so the kernel actually bites --
const NEAR: [number, number, number][] = [
	[10, 10, 12],
	[12, 11, 13],
	[15, 14, 16],
	[250, 200, 20],
	[248, 203, 25],
	[243, 196, 14],
]
await writePng("six-near.png", W6, H6, (x, y) => {
	const n = y * W6 + x
	for (let i = 0; i < EDGES.length; i += 1) if (n < EDGES[i]) return NEAR[i]
	return NEAR[5]
})

// --- 2. 30-degree linear ramp --------------------------------------------------------------
const ANGLE = (30 * Math.PI) / 180
const N = 200
{
	const ux = Math.cos(ANGLE)
	const uy = Math.sin(ANGLE)
	let lo = Infinity
	let hi = -Infinity
	for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) {
		const p = ux * x + uy * y
		if (p < lo) lo = p
		if (p > hi) hi = p
	}
	await writePng("ramp30.png", N, N, (x, y) => {
		const t = (ux * x + uy * y - lo) / (hi - lo)
		const v = Math.max(0, Math.min(255, Math.round(255 * t)))
		return [v, v, v]
	})
}

// --- 3. radial: colour quadratic in distance from a known centre ----------------------------
const RW = 201
const RH = 201
const CX = 60
const CY = 140
{
	let maxSq = 0
	for (const [x, y] of [[0, 0], [RW - 1, 0], [0, RH - 1], [RW - 1, RH - 1]]) {
		const d = (x - CX) ** 2 + (y - CY) ** 2
		if (d > maxSq) maxSq = d
	}
	await writePng("radial-quad.png", RW, RH, (x, y) => {
		const d = (x - CX) ** 2 + (y - CY) ** 2
		const v = Math.max(0, Math.min(255, Math.round(255 * (d / maxSq))))
		return [v, v, v]
	})
	// concentric rings around the same centre
	await writePng("radial-rings.png", RW, RH, (x, y) => {
		const r = Math.hypot(x - CX, y - CY)
		const v = Math.round(127.5 * (1 + Math.cos(r / 12)))
		return [v, v, v]
	})
}

// --- 4. raw RGB dump of the real cover -------------------------------------------------------
{
	const { data, info } = await sharp(REAL).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	writeFileSync(join(OUT, "real.raw"), data)
	writeFileSync(
		join(OUT, "real.meta.json"),
		JSON.stringify({ path: REAL, width: info.width, height: info.height, channels: info.channels, bytes: data.length }),
	)
}

console.log(
	JSON.stringify({
		out: OUT,
		six: { width: W6, height: H6, palette: PALETTE, edges: EDGES },
		ramp30: { width: N, height: N, angleDegrees: 30 },
		radial: { width: RW, height: RH, centrePx: [CX, CY], centreNormalised: [CX / Math.min(RW, RH), CY / Math.min(RW, RH)] },
		real: REAL,
	}),
)
