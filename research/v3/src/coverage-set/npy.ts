/**
 * Minimal reader for the `.npy` files the embedding workstream writes.
 *
 * Scope on purpose: the only files this ever reads are
 * `research/v3/data/embeddings/<collection>.<arm>.npy`, which the embedding
 * runner writes as a C-contiguous little-endian float32 matrix of shape
 * (rows, dim), L2-normalized per row. Anything else is rejected loudly rather
 * than guessed at.
 */

import { readFile } from 'node:fs/promises'

/** [MEASURED] The 6-byte magic every .npy starts with: \x93 then "NUMPY". */
const NPY_MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59])

/** [MEASURED] The only dtype the embedding writer emits: little-endian float32. */
const EXPECTED_DTYPE = '<f4'

export type NpyMatrix = {
	/** Row-major values; row r occupies [r * dim, (r + 1) * dim). */
	data: Float32Array
	rows: number
	dim: number
}

/** Parse the ASCII header dict without eval: we only need three keys. */
function parseHeaderDict(header: string): { descr: string; fortranOrder: boolean; shape: number[] } {
	const descrMatch = /'descr'\s*:\s*'([^']+)'/.exec(header)
	const orderMatch = /'fortran_order'\s*:\s*(True|False)/.exec(header)
	const shapeMatch = /'shape'\s*:\s*\(([^)]*)\)/.exec(header)
	if (!descrMatch || !orderMatch || !shapeMatch) {
		throw new Error(`npy header is not the expected numpy dict: ${header.trim()}`)
	}
	const shape = shapeMatch[1]!
		.split(',')
		.map((piece) => piece.trim())
		.filter((piece) => piece.length > 0)
		.map((piece) => Number.parseInt(piece, 10))
	return { descr: descrMatch[1]!, fortranOrder: orderMatch[1] === 'True', shape }
}

export async function readNpyFloat32Matrix(absolutePath: string): Promise<NpyMatrix> {
	const raw = await readFile(absolutePath)
	if (!raw.subarray(0, 6).equals(NPY_MAGIC)) {
		throw new Error(`${absolutePath}: not a .npy file (bad magic)`)
	}
	const majorVersion = raw.readUInt8(6)
	// v1 stores the header length as 2 bytes, v2+ as 4. Both start at offset 8.
	const headerLength = majorVersion === 1 ? raw.readUInt16LE(8) : raw.readUInt32LE(8)
	const headerStart = majorVersion === 1 ? 10 : 12
	const dataStart = headerStart + headerLength
	const header = raw.subarray(headerStart, dataStart).toString('latin1')
	const { descr, fortranOrder, shape } = parseHeaderDict(header)

	if (descr !== EXPECTED_DTYPE) throw new Error(`${absolutePath}: dtype ${descr}, expected ${EXPECTED_DTYPE}`)
	if (fortranOrder) throw new Error(`${absolutePath}: fortran_order is True; only C order is supported`)
	if (shape.length !== 2) throw new Error(`${absolutePath}: shape ${JSON.stringify(shape)} is not 2-D`)

	const [rows, dim] = shape as [number, number]
	const expectedBytes = rows * dim * 4
	const actualBytes = raw.length - dataStart
	if (actualBytes !== expectedBytes) {
		throw new Error(`${absolutePath}: payload is ${actualBytes} bytes, shape implies ${expectedBytes}`)
	}

	// The payload is 4-byte aligned inside the file but not necessarily inside the
	// Buffer's underlying ArrayBuffer, so copy rather than view.
	const data = new Float32Array(rows * dim)
	for (let i = 0; i < data.length; i++) data[i] = raw.readFloatLE(dataStart + i * 4)
	return { data, rows, dim }
}

/** Cosine similarity of two rows. The vectors are L2-normalized, so this is a dot product. */
export function dot(matrix: NpyMatrix, rowA: number, rowB: number): number {
	const { data, dim } = matrix
	const offsetA = rowA * dim
	const offsetB = rowB * dim
	let sum = 0
	for (let i = 0; i < dim; i++) sum += data[offsetA + i]! * data[offsetB + i]!
	return sum
}
