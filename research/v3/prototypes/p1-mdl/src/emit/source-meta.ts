/**
 * # `sourceMetaOf` — the file's identity, for `toPalette`'s metadata block
 *
 * Kept in its own module for exactly one reason: **it is the only file in `src/emit/` that imports
 * `sharp`.** Loading `sharp` loads a native binding, which is a real cost and a real side effect, and
 * `candidates/p1a.ts` and `candidates/p1ap.ts` must be importable without paying it — a devloop that
 * enumerates candidate modules to list them should not be initialising an image decoder. So
 * `palette.ts`, `types.ts` and `cost.ts` are decoder-free, and anything wanting a file's identity
 * imports this module by name.
 *
 * Header-only: `metadata()` reads the container header and never pulls pixels, so this is not a
 * second decode competing with `src/measure/`. Dimensions come from the header and never from the
 * filename — `CONVENTIONS.md` records 719 AVIFs in `music-artworks/` whose filenames disagree with
 * their own headers.
 */

import sharp from "sharp"
import { hashFileBytes } from "../../../../src/devloop/code-version.ts"
import { ConfigurationError, type EmitMeta } from "./types.ts"

/**
 * Build the `EmitMeta` for a file: header dimensions and format from the decoder, content hash from
 * the bytes.
 *
 * `inputContentHash` is sha-256 over the file's bytes via `hashFileBytes` — the same function, and
 * therefore the same identity, the devloop cache and the toy candidate use.
 */
export async function sourceMetaOf(
	imagePath: string,
	algorithmVersion: string,
	contrast?: EmitMeta["contrast"],
): Promise<EmitMeta> {
	const metadata = await sharp(imagePath).metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new ConfigurationError(`no header dimensions for ${imagePath}`)
	}
	return {
		algorithmVersion,
		inputContentHash: await hashFileBytes(imagePath),
		sourceRendition: {
			path: imagePath,
			width: metadata.width,
			height: metadata.height,
			format: metadata.format ?? "unknown",
		},
		...(contrast === undefined ? {} : { contrast }),
	}
}
