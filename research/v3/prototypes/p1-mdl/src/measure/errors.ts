/**
 * The measurement layer's typed refusals.
 *
 * Every one of these is a *loud* stop, never a silent fallback: `PHASE_0_DECISIONS.md` §4 invariant
 * 5 refuses transparent input rather than flattening it onto an invented background, and the same
 * discipline applies to every other input this layer cannot measure honestly. A caller that wants to
 * skip such an image must catch the error and say so; it can never happen by accident.
 *
 * Fields are assigned in the constructor body rather than declared as parameter properties, because
 * `--experimental-strip-types` is strip-only and parameter properties would need a transform
 * (`CONVENTIONS.md`: plain Node, no build step).
 */

/** Base class for everything the measurement layer refuses. */
export class MeasureError extends Error {
	override readonly name: string = "MeasureError"
	constructor(message: string) {
		super(message)
	}
}

/**
 * Thrown when the input carries at least one genuinely transparent pixel.
 *
 * "Genuinely" is the operative word: an alpha channel that is uniformly opaque is not transparency,
 * and is accepted. The first non-opaque pixel in raster order is reported with its coordinates so
 * the refusal is checkable against the file.
 */
export class TransparentInputError extends MeasureError {
	override readonly name = "TransparentInputError"
	readonly imagePath: string
	readonly firstTransparentPixel: Readonly<{ x: number; y: number; alpha: number }>
	constructor(
		message: string,
		imagePath: string,
		firstTransparentPixel: Readonly<{ x: number; y: number; alpha: number }>,
	) {
		super(message)
		this.imagePath = imagePath
		this.firstTransparentPixel = firstTransparentPixel
	}
}

/** Thrown when the decoder cannot give this layer a full-resolution 8-bit sRGB raster. */
export class DecodeError extends MeasureError {
	override readonly name = "DecodeError"
	readonly imagePath: string
	constructor(message: string, imagePath: string) {
		super(message)
		this.imagePath = imagePath
	}
}

/**
 * Thrown when an image is large enough that the integer spatial moments would leave the exact range
 * of a float64.
 *
 * The per-triple moments are exact integer sums by construction (arm A′ §2.1: "exact, associative,
 * order-free"), and that property is the determinism gate. Silently losing it on a big image would
 * turn a structural guarantee into a size-dependent one, so the layer refuses instead.
 */
export class ImageTooLargeForExactMomentsError extends MeasureError {
	override readonly name = "ImageTooLargeForExactMomentsError"
	readonly imagePath: string
	readonly largestMoment: number
	constructor(message: string, imagePath: string, largestMoment: number) {
		super(message)
		this.imagePath = imagePath
		this.largestMoment = largestMoment
	}
}
