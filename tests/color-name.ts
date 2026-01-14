import Color from "colorjs.io"
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import short from './short-names.ts'
import simplest from './simplest-names.ts'

// Lazy-loaded cache for long names
let longNamesCache: { name: string; rgb: [number, number, number] }[] | null = null

function loadLongNames(): { name: string; rgb: [number, number, number] }[] {
	if (longNamesCache) return longNamesCache

	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(__filename)
	const csvPath = join(__dirname, 'long-names.csv')
	const content = readFileSync(csvPath, 'utf-8')
	const lines = content.split('\n')

	longNamesCache = []
	// Skip header line
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim()
		if (!line) continue

		// Parse CSV: name,hex,good name
		// Handle names that might contain commas by finding hex pattern
		const hexMatch = line.match(/,#([0-9a-fA-F]{6})(,|$)/)
		if (!hexMatch) continue

		const hexIndex = line.indexOf(hexMatch[0])
		const name = line.slice(0, hexIndex)
		const hex = hexMatch[1]

		// Convert hex to RGB [0-1]
		const r = parseInt(hex.slice(0, 2), 16) / 255
		const g = parseInt(hex.slice(2, 4), 16) / 255
		const b = parseInt(hex.slice(4, 6), 16) / 255

		longNamesCache.push({ name, rgb: [r, g, b] })
	}

	return longNamesCache
}

function base(keywords: Record<string, number[]>, hex: number) {
	const color = new Color('#' + hex.toString(16).padStart(6, '0'))
	let min = Infinity
	let name = ''
	for (let keyword in keywords) {
		let keywordColor = new Color("srgb", keywords[keyword] as [number, number, number])
		let deltaE = keywordColor.deltaE(color, { method: "2000" })
		if (deltaE < min) {
			min = deltaE
			name = keyword
		}
	}
	return name
}

export function nameColor(hex: number) {
	return base(short, hex)
}

export function simpleColor(hex: number) {
	return base(simplest, hex)
}

/**
 * Find the closest color name from the comprehensive long-names.csv database
 * (31,800+ color names). Uses deltaE2000 for perceptual color matching.
 * 
 * Note: First call will be slower due to CSV parsing, subsequent calls use cache.
 */
export function longNameColor(hex: number): string {
	const color = new Color('#' + hex.toString(16).padStart(6, '0'))
	const longNames = loadLongNames()

	let min = Infinity
	let name = ''

	for (const entry of longNames) {
		const keywordColor = new Color("srgb", entry.rgb)
		const deltaE = keywordColor.deltaE(color, { method: "2000" })
		if (deltaE < min) {
			min = deltaE
			name = entry.name
		}
	}

	return name
}