/**
 * V3 verdict warehouse — record builders.
 *
 * Test and development helpers only: they fill in defaults so a test (or a scratch
 * script) can state just the fields it cares about. The review server builds its own
 * records from real data; nothing here is production input.
 */

import {
	hashPalette,
	sha256Hex,
	type ArtworkIdentity,
	type BatchRef,
	type CodeFingerprint,
	type EndorsedSampleRecord,
	type Grade,
	type NoteRecord,
	type OracleLabelRecord,
	type PaletteSnapshot,
	type RecordInput,
	type RecordType,
	type VerdictRecord,
	type VerdictSide,
	type VetoRecord,
	type BatchCompleteRecord,
	type AmendmentRecord,
} from './records.ts'

/** Deterministic ids for tests: `<prefix>-<n>`, in append order. */
export function counterIds(): (type: RecordType) => string {
	let n = 0
	const prefix: Record<RecordType, string> = {
		verdict: 'v',
		note: 'n',
		'endorsed-sample': 'e',
		veto: 'x',
		amendment: 'am',
		'batch-complete': 'bc',
		'oracle-label': 'o',
	}
	return (type: RecordType) => `${prefix[type]}-${++n}`
}

/** Deterministic clock: fixed start, one step per call. */
export function stepClock(startIso = '2026-08-02T10:00:00.000Z', stepMs = 60_000): () => number {
	let now = Date.parse(startIso) - stepMs
	return () => (now += stepMs)
}

export function makeArtwork(overrides: Partial<ArtworkIdentity> & { name?: string } = {}): ArtworkIdentity {
	const name = overrides.name ?? 'cover.jpg'
	const path = overrides.path ?? `/Users/Flo/GitHub/palette/music-artworks/${name}`
	return {
		path,
		sha256: overrides.sha256 ?? sha256Hex(path),
		rendition: {
			width: 1000,
			height: 1000,
			format: 'jpeg',
			bytes: 240_000,
			collection: 'music-artworks',
			artworkId: null,
			...overrides.rendition,
		},
	}
}

export function makeFingerprint(overrides: Partial<CodeFingerprint> = {}): CodeFingerprint {
	return {
		algorithmVersion: 'v3.0.0-dev',
		preprocessingVersion: 'pp-1',
		gitCommit: '0'.repeat(40),
		dirty: false,
		...overrides,
	}
}

export function makePalette(overrides: Partial<PaletteSnapshot> = {}): PaletteSnapshot {
	return {
		background: '#101018',
		surface: '#1c1c2a',
		foreground: '#e8e6f0',
		accent: '#c94f3d',
		gradient: null,
		surfaceCollapsed: false,
		accentCollapsed: false,
		...overrides,
	}
}

export function makeSide(variantId: string, overrides: Partial<VerdictSide> = {}): VerdictSide {
	const palette = overrides.palette ?? makePalette()
	return {
		paletteHash: overrides.paletteHash ?? hashPalette(palette),
		fingerprint: overrides.fingerprint ?? makeFingerprint(),
		variantId,
		palette: null,
	}
}

export function makeBatch(overrides: Partial<BatchRef> = {}): BatchRef {
	return { id: 'b1', purpose: 'arm', itemCount: 4, fundedBy: [], ...overrides }
}

export function makeVerdict(overrides: Partial<VerdictRecord> = {}): RecordInput<VerdictRecord> {
	return {
		type: 'verdict',
		author: { kind: 'human', id: 'flo' },
		mode: 'pairwise',
		batch: makeBatch(),
		itemId: 'i1',
		artwork: makeArtwork(),
		sideA: makeSide('trunk'),
		sideB: makeSide('arm/foo', { palette: makePalette({ accent: '#3d7fc9' }) }),
		gradeA: 'strong',
		gradeB: 'acceptable',
		preference: 'a',
		comment: '',
		confound: false,
		confoundNote: null,
		...overrides,
	}
}

export function makeNote(overrides: Partial<NoteRecord> = {}): RecordInput<NoteRecord> {
	return {
		type: 'note',
		author: { kind: 'human', id: 'flo' },
		batch: makeBatch(),
		itemId: null,
		artwork: null,
		text: 'a note',
		tags: [],
		derived: null,
		...overrides,
	}
}

export function makeEndorsedSample(overrides: Partial<EndorsedSampleRecord> = {}): RecordInput<EndorsedSampleRecord> {
	const palette = overrides.palette ?? makePalette()
	return {
		type: 'endorsed-sample',
		author: { kind: 'human', id: 'flo' },
		batch: makeBatch(),
		itemId: 'i1',
		artwork: makeArtwork(),
		palette,
		paletteHash: hashPalette(palette),
		basedOnPaletteHash: null,
		comment: '',
		...overrides,
	}
}

export function makeVeto(overrides: Partial<VetoRecord> = {}): RecordInput<VetoRecord> {
	return {
		type: 'veto',
		author: { kind: 'human', id: 'flo' },
		batch: null,
		itemId: null,
		artwork: makeArtwork(),
		reason: 'not album artwork',
		scope: 'artwork',
		...overrides,
	}
}

export function makeAmendment(
	targetId: string,
	patch: Record<string, unknown>,
	overrides: Partial<AmendmentRecord> = {},
): RecordInput<AmendmentRecord> {
	return {
		type: 'amendment',
		author: { kind: 'human', id: 'flo' },
		targetId,
		patch,
		retract: false,
		reason: 'second thought',
		...overrides,
	}
}

export function makeBatchComplete(
	batchId: string,
	overrides: Partial<BatchCompleteRecord> = {},
): RecordInput<BatchCompleteRecord> {
	return {
		type: 'batch-complete',
		author: { kind: 'human', id: 'flo' },
		batchId,
		purpose: 'arm',
		itemCount: 4,
		fundedBy: [],
		releasedItemIds: null,
		note: '',
		...overrides,
	}
}

export function makeOracleLabel(overrides: Partial<OracleLabelRecord> = {}): RecordInput<OracleLabelRecord> {
	return {
		type: 'oracle-label',
		author: { kind: 'human', id: 'flo' },
		imageId: 'music-artworks/abc123',
		artwork: null,
		labelSchemaVersion: 'q-1.0',
		questionKey: 'ground_type',
		answer: 'shaded_field',
		confidence: 'high',
		ambiguityNote: null,
		stratum: null,
		batch: null,
		...overrides,
	}
}
