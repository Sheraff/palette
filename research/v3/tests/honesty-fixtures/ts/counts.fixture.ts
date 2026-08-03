// Fixture for the honesty TS scanner: an exact-count file.
// Every numeric literal below is deliberate. The test pins the total, so adding a number here
// without updating `honesty-scan-ts.test.ts` is meant to fail.

/** Alpha. [REVIEWED] */
export const ALPHA = 0.5

export const BETA = [1, 2, 3]

export function ratio(input: number, scale = 2): number {
	let total = 0
	for (let i = 0; i < 4; i++) {
		total += input * 1000
	}
	return Math.max(0, Math.min(1, total / scale)) - 1
}

export const HEX = 0x10
export const EXPO = 1e-6
export const SEPARATED = 1_000_000
export const NEGATIVE = -1

// BigInt is deliberately excluded from the scan — a different AST node kind, and not a tunable.
export const HUGE = 10n
