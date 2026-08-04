/**
 * Do the TypeScript and Python halves of this project see the same pixels? (build item 18)
 *
 * The TS pipeline decodes with `sharp`. The Python analyses — SAM, embeddings, the premise probes —
 * decode the same files with PIL. Every cross-language claim in this repo rests on those two
 * agreeing, and until this test nobody had checked. The failure mode is silent by construction: two
 * decoders that differ slightly produce two plausible palettes and no error anywhere.
 *
 * ## The measured answer
 *
 * Measured 2026-08-04 on this machine, over the ten fixture images below.
 * Provenance: `sharp` 0.33.5 (`.removeAlpha().toColourspace("srgb").raw()`) versus Pillow 12.3.0 on
 * CPython 3.14.3 (`Image.open(...).convert("RGB").tobytes()`), the venv at
 * `oracle/embeddings/.venv`, frozen in `data/provenance/venv-freeze/`.
 *
 * | format | images | agreement |
 * |---|---:|---|
 * | JPEG (`.jpg`, `.jpeg`) | 4 | **byte-identical** — sha256 of the raw RGB buffers matches |
 * | PNG | 2 | **byte-identical** |
 * | AVIF | 4 | **differ by exactly 1 LSB** on 12.93%–14.10% of channel samples |
 *
 * The AVIF divergence is remarkably well-behaved: the maximum absolute per-channel difference is
 * **1** on every image, and every differing sample differs by exactly 1 (mean absolute difference
 * over differing samples = 1.0000). It is a rounding disagreement in the YUV→RGB conversion, not a
 * decode discrepancy — no sample is ever off by 2.
 *
 * ## Why this number matters, and why the tolerance is not "small enough, move on"
 *
 * `V3_PLAN.md` §1 records that in v2-3 **a ±1-LSB dither moved all 114 test palettes**. The
 * divergence measured here is exactly that magnitude, on 4,507 of the corpus's 8,595 files. So for
 * AVIF, a palette computed from the TS decode and a palette computed from the Python decode are as
 * different as v2-3's worst robustness result — *before any algorithm runs*. Any cross-language
 * analysis over AVIF inherits that, and the honest statement is not "the decoders agree" but "the
 * decoders agree on JPEG and PNG, and disagree on AVIF at the amplitude that historically moved
 * every palette we had".
 *
 * That is a robustness requirement, not a decoder bug: v3's success criterion 1 is a pipeline stable
 * under ±1 LSB. A pipeline meeting it is immune to this. One that does not, is not — and this test
 * is where the number to design against is written down.
 *
 * ## A corroboration, for free
 *
 * `..._1079x1079.avif` decodes to **640×640** in both languages. `CONVENTIONS.md` says
 * `music-artworks/` filenames lie and that 719 AVIFs disagree with their own header; both decoders
 * independently agree with the header and not the name. The two libraries disagreeing about a pixel
 * while agreeing about the geometry is the best evidence available that the geometry rule is right.
 */

import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const V3_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "")
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "")

/**
 * The Python interpreter used for the comparison.
 *
 * `[REVIEWED]` — the embeddings venv, chosen because it is the one whose decodes feed the DINOv2
 * embeddings the coverage set is built from, so its PIL is the one whose agreement actually matters.
 * All four oracle venvs carry the identical Pillow 12.3.0 / CPython 3.14.3 pair (checked
 * 2026-08-04), so the choice does not affect the result.
 */
const PYTHON = join(V3_ROOT, "oracle/embeddings/.venv/bin/python")

const DECODER = join(V3_ROOT, "src/provenance/decode_py.py")

/**
 * The maximum absolute per-channel difference tolerated between the two decoders.
 *
 * `[MEASURED]` — 1, the measured maximum over all ten fixtures (2026-08-04, table in this file's
 * header). This is an *assertion about what was measured*, not a budget chosen for comfort: it is
 * set exactly at the observed maximum, so any regression to 2 fails. JPEG and PNG are additionally
 * asserted at 0, which is stricter than this bound and is what they actually achieve.
 */
const MAX_TOLERATED_CHANNEL_DELTA = 1

/**
 * Upper bound on the fraction of channel samples allowed to differ, for AVIF.
 *
 * `[MEASURED]` — 0.15. The measured range is 12.93%–14.10% over four AVIFs at four sizes; 0.15 sits
 * just above the observed maximum. It exists to catch a decoder change that turns a 14% ±1
 * disagreement into a 90% one, which would be a different phenomenon wearing the same maximum.
 */
const MAX_AVIF_DIFFERING_FRACTION = 0.15

type Format = "jpeg" | "png" | "avif"

/**
 * Ten corpus images, pinned by content hash.
 *
 * `[REVIEWED]` — chosen to cover the three formats the corpus actually contains, with the AVIFs
 * deliberately being four renditions of one artwork so that size, not content, is what varies
 * across them. The hashes pin the fixture: if a file is ever replaced, this test says so rather than
 * silently measuring something else.
 */
const FIXTURES: readonly { path: string; format: Format; sha256: string }[] = [
	{ path: "music-artworks/0/0/1/0014a010841f9afda040ae0a5eeaaacc.jpg", format: "jpeg", sha256: "fa23d994264a32ab7d2a6b78b68bb6bc4d4083e98800ca4a73428966e969fed7" },
	{ path: "music-artworks/0/0/1/00179ef0c31bd8ed7047e0cc66bc4b7e.jpg", format: "jpeg", sha256: "4843e65612702c542835ee6d23946b496c94bdce94acad4f3f38e24ad50020c5" },
	{ path: "music-artworks/0/2/7/0272517cb8f9c9626bedc72742d2c3bd.jpeg", format: "jpeg", sha256: "b3ed6573114ed4572455cfabde6d35be9afe906b95f33a67e8aa4983da3838b8" },
	{ path: "music-artworks/0/3/9/039846f0e1b0fd54797119282557b77a.jpeg", format: "jpeg", sha256: "4875ce263d8eadf46900b64be2361f5bf43fb20d79d6767543c25f8ea956c42e" },
	{ path: "music-artworks/0/0/0/000ed04c00cb6f98c78c3b5b9b2456af.png", format: "png", sha256: "8147911fbe6ed5ad20cbaac07695756c0247ad3a718d99081fdab6cada3e1759" },
	{ path: "music-artworks/0/0/3/00329219919bfac44522f0d2cd1a7600.png", format: "png", sha256: "278986bef68f5a659fbd5d1a607f17555a8e2d0f9da76090e9aa001b77b54e6a" },
	{ path: "music-artworks/0/0/1/0014a010841f9afda040ae0a5eeaaacc_147x147.avif", format: "avif", sha256: "33906a0846f7ce44e23dd75743d46c12455884ccb7a3e321c1948723e6d64e53" },
	{ path: "music-artworks/0/0/1/0014a010841f9afda040ae0a5eeaaacc_482x482.avif", format: "avif", sha256: "4009f9a7894e6b133d544e18d71dc276664a00a42b763b800ce697d8b7532e56" },
	{ path: "music-artworks/0/0/1/0014a010841f9afda040ae0a5eeaaacc_483x483.avif", format: "avif", sha256: "1e3e84aeaf3ce64c5190610c018a0a8c97d9554df0647111d0b801e486c96184" },
	{ path: "music-artworks/0/0/1/0014a010841f9afda040ae0a5eeaaacc_1079x1079.avif", format: "avif", sha256: "c5edca16e1dfa36d4b558f5a331cf272b654861e187455463ef4b24e3d0a0bae" },
]

interface PythonResult {
	path: string
	width: number | null
	height: number | null
	sha256: string | null
	error: string | null
	dump?: string
}

interface Comparison {
	fixture: (typeof FIXTURES)[number]
	width: number
	height: number
	identical: boolean
	maxChannelDelta: number
	differingSamples: number
	totalSamples: number
	differingFraction: number
	/** Every differing sample's |delta|, summed — used to prove all deltas are exactly 1. */
	summedAbsoluteDelta: number
}

/**
 * The environment is a hard prerequisite, and its absence is reported as a skip rather than a pass.
 *
 * `.venv` directories are not committed, so a fresh clone genuinely cannot run this. Node reports a
 * skipped test distinctly from a passing one, which is the whole point — this repo's standing rule
 * is that a check which did not run must never read as a check that passed.
 */
function missingPrerequisite(): string | null {
	if (!existsSync(PYTHON)) {
		return `no Python interpreter at ${PYTHON} — create the oracle venvs (see data/provenance/venv-freeze/README.md)`
	}
	const absent = FIXTURES.filter((f) => !existsSync(join(REPO_ROOT, f.path)))
	if (absent.length > 0) return `${absent.length} fixture image(s) missing from music-artworks/`
	return null
}

async function compareAll(): Promise<{ comparisons: Comparison[]; pillow: string; python: string }> {
	const dumpDir = mkdtempSync(join(tmpdir(), "decoder-agreement-"))
	try {
		const stdout = execFileSync(
			PYTHON,
			[DECODER, "--dump-dir", dumpDir, ...FIXTURES.map((f) => join(REPO_ROOT, f.path))],
			{ encoding: "utf8", maxBuffer: 1 << 28 },
		)
		const payload = JSON.parse(stdout) as {
			pillow: string
			python: string
			results: PythonResult[]
		}

		const comparisons: Comparison[] = []
		for (const [index, fixture] of FIXTURES.entries()) {
			const py = payload.results[index]
			assert.equal(py.error, null, `PIL failed on ${fixture.path}: ${py.error}`)

			const bytes = await readFile(join(REPO_ROOT, fixture.path))
			assert.equal(
				createHash("sha256").update(bytes).digest("hex"),
				fixture.sha256,
				`fixture ${fixture.path} has been replaced; this test is no longer measuring what it documents`,
			)

			const { data, info } = await sharp(bytes)
				.removeAlpha()
				.toColourspace("srgb")
				.raw()
				.toBuffer({ resolveWithObject: true })

			assert.equal(info.channels, 3, `${fixture.path}: expected 3 channels from sharp`)
			assert.equal(info.width, py.width, `${fixture.path}: width disagreement`)
			assert.equal(info.height, py.height, `${fixture.path}: height disagreement`)

			const pyBuffer = readFileSync(py.dump as string)
			assert.equal(
				pyBuffer.length,
				data.length,
				`${fixture.path}: buffer lengths differ despite equal dimensions`,
			)

			let maxChannelDelta = 0
			let differingSamples = 0
			let summedAbsoluteDelta = 0
			for (let i = 0; i < data.length; i++) {
				const delta = Math.abs(data[i] - pyBuffer[i])
				if (delta === 0) continue
				differingSamples += 1
				summedAbsoluteDelta += delta
				if (delta > maxChannelDelta) maxChannelDelta = delta
			}

			comparisons.push({
				fixture,
				width: info.width,
				height: info.height,
				identical: differingSamples === 0,
				maxChannelDelta,
				differingSamples,
				totalSamples: data.length,
				differingFraction: differingSamples / data.length,
				summedAbsoluteDelta,
			})
		}
		return { comparisons, pillow: payload.pillow, python: payload.python }
	} finally {
		rmSync(dumpDir, { recursive: true, force: true })
	}
}

const prerequisite = missingPrerequisite()

test(
	"TS (sharp) and Python (PIL) decode the same corpus images to within the measured tolerance",
	{ skip: prerequisite ?? false },
	async () => {
		const { comparisons, pillow, python } = await compareAll()
		assert.equal(comparisons.length, 10)

		// The environment this number was measured on. A different Pillow is not a failure, but the
		// documented divergence would no longer be the one being asserted, so it is worth seeing.
		assert.match(pillow, /^\d+\./)
		assert.match(python, /^3\./)

		for (const c of comparisons) {
			assert.ok(
				c.maxChannelDelta <= MAX_TOLERATED_CHANNEL_DELTA,
				`${c.fixture.path}: max per-channel delta ${c.maxChannelDelta} exceeds the measured maximum of ${MAX_TOLERATED_CHANNEL_DELTA}`,
			)
		}
	},
)

test(
	"JPEG and PNG decode byte-identically — the stricter claim, asserted separately",
	{ skip: prerequisite ?? false },
	async () => {
		const { comparisons } = await compareAll()
		const lossless = comparisons.filter((c) => c.fixture.format !== "avif")
		assert.equal(lossless.length, 6)
		for (const c of lossless) {
			assert.ok(
				c.identical,
				`${c.fixture.path} (${c.fixture.format}) is no longer byte-identical: ${c.differingSamples}/${c.totalSamples} samples differ, max delta ${c.maxChannelDelta}`,
			)
		}
	},
)

test(
	"AVIF disagrees by exactly one LSB, on a bounded fraction of samples",
	{ skip: prerequisite ?? false },
	async () => {
		const { comparisons } = await compareAll()
		const avif = comparisons.filter((c) => c.fixture.format === "avif")
		assert.equal(avif.length, 4)

		for (const c of avif) {
			assert.ok(c.differingSamples > 0, `${c.fixture.path}: expected AVIF to differ; it did not`)
			assert.equal(
				c.maxChannelDelta,
				1,
				`${c.fixture.path}: AVIF divergence is documented as exactly 1 LSB, measured ${c.maxChannelDelta}`,
			)
			// Every differing sample differs by exactly 1: the sum of |delta| equals the count. This is
			// the claim that makes the divergence a rounding disagreement rather than a decode bug.
			assert.equal(
				c.summedAbsoluteDelta,
				c.differingSamples,
				`${c.fixture.path}: some samples differ by more than 1`,
			)
			assert.ok(
				c.differingFraction < MAX_AVIF_DIFFERING_FRACTION,
				`${c.fixture.path}: ${(c.differingFraction * 100).toFixed(2)}% of samples differ, above the measured ceiling of ${MAX_AVIF_DIFFERING_FRACTION * 100}%`,
			)
		}
	},
)

test(
	"both decoders trust the header over the filename, and agree on geometry",
	{ skip: prerequisite ?? false },
	async () => {
		const { comparisons } = await compareAll()
		// Dimensions were asserted equal per image during comparison; this pins the specific case
		// CONVENTIONS.md warns about — a filename claiming 1079x1079 over a 640x640 image.
		const liar = comparisons.find((c) => c.fixture.path.endsWith("_1079x1079.avif"))!
		assert.equal(liar.width, 640)
		assert.equal(liar.height, 640)
	},
)
