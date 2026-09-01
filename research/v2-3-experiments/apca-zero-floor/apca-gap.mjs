/**
 * Is the (0, ~7.3) hole in APCA's output real for *every* pair of colours, not just 8-bit greys?
 *
 * APCA's reported Lc depends on nothing but the two luminances, so sweeping luminance densely
 * covers every possible colour pair. If no pair anywhere reports a magnitude inside the hole, then
 * every candidate threshold inside it selects exactly the same set, and picking one is not tuning.
 */
import { APCAcontrast } from "apca-w3"

let smallestNonZero = Infinity
let insideHole = 0
const steps = 4000
for (let i = 0; i <= steps; i += 1) {
	const ya = i / steps
	for (let j = 0; j <= steps; j += 1) {
		const yb = j / steps
		const lc = Math.abs(APCAcontrast(ya, yb))
		if (!Number.isFinite(lc) || lc === 0) continue
		if (lc < smallestNonZero) smallestNonZero = lc
		if (lc < 7) insideHole += 1
	}
}
console.log(`swept ${(steps + 1) ** 2} luminance pairs over the full [0,1] range`)
console.log(`smallest non-zero |Lc| anywhere: ${smallestNonZero.toFixed(6)}`)
console.log(`pairs reporting 0 < |Lc| < 7: ${insideHole}`)
