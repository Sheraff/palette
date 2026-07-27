import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { loadImage } from "./src/image.ts"

const PROTOCOL_VERSION = "resolution-canonical-raster-child-v1" as const
const allowedRoots = ["images", "00"] as const

type DecodeRequest = {
	id: string
	operation: "decode-224"
	source: string
}

type ChildResponse = {
	id: string | null
	ok: boolean
	protocolVersion: typeof PROTOCOL_VERSION
	width?: number
	height?: number
	dataBase64?: string
	sourceSha256?: string
	versions?: Record<string, string>
	error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseProjectRoot(arguments_: readonly string[]): string {
	if (arguments_.length !== 2 || arguments_[0] !== "--project-root" || arguments_[1].length === 0) {
		throw new Error("Usage: resolution-canonical-raster-child.ts --project-root <absolute-path>")
	}
	const root = resolve(arguments_[1])
	if (root !== arguments_[1]) throw new Error("Canonical child project root must be an absolute normalized path")
	return root
}

function parseRequest(value: unknown): DecodeRequest {
	if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 ||
		value.operation !== "decode-224" || typeof value.source !== "string") {
		throw new Error("Invalid canonical raster request")
	}
	return value as DecodeRequest
}

function splitAllowedSource(source: string): { root: typeof allowedRoots[number]; name: string } {
	if (source.includes("\0") || source.includes("\\")) throw new Error("Unsafe canonical source path")
	const parts = source.split("/")
	if (parts.length !== 2 || !allowedRoots.includes(parts[0] as typeof allowedRoots[number]) ||
		parts[1].length === 0 || parts[1] === "." || parts[1] === "..") {
		throw new Error("Canonical source must be one direct child of images/ or 00/")
	}
	return { root: parts[0] as typeof allowedRoots[number], name: parts[1] }
}

async function readBoundSource(projectRoot: string, source: string): Promise<Uint8Array> {
	const { root, name } = splitAllowedSource(source)
	const rootMetadata = await lstat(projectRoot)
	if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
		throw new Error("Canonical project root must be a real directory")
	}
	const physicalProjectRoot = await realpath(projectRoot)
	if (physicalProjectRoot !== projectRoot) throw new Error("Canonical project root changed physical identity")

	const allowedRoot = join(projectRoot, root)
	const allowedMetadata = await lstat(allowedRoot)
	if (allowedMetadata.isSymbolicLink() || !allowedMetadata.isDirectory() ||
		await realpath(allowedRoot) !== join(physicalProjectRoot, root)) {
		throw new Error(`Canonical ${root}/ root must be a real direct child`)
	}

	const path = join(allowedRoot, name)
	const before = await lstat(path)
	if (before.isSymbolicLink() || !before.isFile()) throw new Error("Canonical source must be a regular non-symlink file")
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
	try {
		const opened = await handle.stat()
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
			throw new Error("Canonical source changed while opening")
		}
		return await handle.readFile()
	} finally {
		await handle.close()
	}
}

async function decode(projectRoot: string, request: DecodeRequest): Promise<ChildResponse> {
	const source = await readBoundSource(projectRoot, request.source)
	const image = await loadImage(source, { maxSize: 224 })
	return {
		id: request.id,
		ok: true,
		protocolVersion: PROTOCOL_VERSION,
		width: image.width,
		height: image.height,
		dataBase64: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength).toString("base64"),
		sourceSha256: createHash("sha256").update(source).digest("hex"),
		versions: {
			node: process.versions.node,
			platform: process.platform,
			architecture: process.arch,
			...sharp.versions,
		},
	}
}

async function run(): Promise<void> {
	const projectRoot = parseProjectRoot(process.argv.slice(2))
	const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
	for await (const line of input) {
		let id: string | null = null
		let response: ChildResponse
		try {
			const parsed = JSON.parse(line) as unknown
			if (isRecord(parsed) && typeof parsed.id === "string") id = parsed.id
			const request = parseRequest(parsed)
			id = request.id
			response = await decode(projectRoot, request)
		} catch (error) {
			response = {
				id,
				ok: false,
				protocolVersion: PROTOCOL_VERSION,
				error: error instanceof Error ? error.message : String(error),
			}
		}
		process.stdout.write(`${JSON.stringify(response)}\n`)
	}
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	run().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
