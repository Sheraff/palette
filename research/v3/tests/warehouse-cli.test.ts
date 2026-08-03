/**
 * V3 verdict warehouse — CLI output tests.
 *
 * The CLI is the only interface agents use, so its output shape is a contract: these
 * are literal snapshots, and a change to a line here is a change every consuming
 * agent sees.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/warehouse-*.test.ts
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import { runCli } from '../src/warehouse/cli.ts'
import { append, appendMany } from '../src/warehouse/warehouse.ts'
import {
	counterIds,
	makeAmendment,
	makeArtwork,
	makeBatch,
	makeBatchComplete,
	makeEndorsedSample,
	makeFingerprint,
	makeNote,
	makeOracleLabel,
	makePalette,
	makeSide,
	makeVerdict,
	makeVeto,
	stepClock,
} from '../src/warehouse/fixtures.ts'

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'warehouse', 'cli.ts')

const tempRoots: string[] = []
function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'v3-warehouse-cli-'))
	tempRoots.push(dir)
	return dir
}
after(() => {
	for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

/** A small fixed warehouse: one released batch, one open batch, an amendment, a veto, a label. */
function fixtureWarehouse(): string {
	const file = join(tempDir(), 'warehouse.jsonl')
	const options = { now: stepClock(), idFactory: counterIds(), fsync: false }
	const artwork = makeArtwork({ path: '/corpus/music-artworks/kind-of-blue.jpg', sha256: 'a'.repeat(64) })
	const other = makeArtwork({ path: '/corpus/music-artworks/blue-train.jpg', sha256: 'b'.repeat(64) })
	const b1 = makeBatch({ id: 'b1', purpose: 'arm', itemCount: 3, fundedBy: ['v-seed'] })
	const b2 = makeBatch({ id: 'b2', purpose: 'calibration', itemCount: 2, fundedBy: [] })

	const v1 = append(
		file,
		makeVerdict({
			batch: b1,
			itemId: 'i1',
			artwork,
			gradeA: 'strong',
			gradeB: 'weak',
			preference: 'a',
			comment:
				'B loses the trumpet gold entirely; A keeps it, though the surface is a touch close to the background for my taste and I would nudge it darker.',
		}),
		options,
	)
	appendMany(
		file,
		[
			makeVerdict({
				batch: b1,
				itemId: 'i2',
				artwork: other,
				gradeA: 'acceptable',
				gradeB: 'acceptable',
				preference: 'no-preference',
				confound: true,
				confoundNote: 'B has the zero-contrast accent bug',
				comment: 'both fine',
			}),
			makeNote({ batch: b1, text: 'the gradient reads as two areas, not one shaded surface', tags: ['should-be-flat'] }),
			makeEndorsedSample({
				batch: b1,
				itemId: 'i1',
				artwork,
				palette: makePalette({ background: '#0b1d2a', surface: '#123043', foreground: '#f2ede4', accent: '#d9a441' }),
				comment: 'this is the palette I wanted',
			}),
			makeBatchComplete('b1', { itemCount: 3, releasedItemIds: ['i1', 'i2'] }),
			makeVerdict({ batch: b2, mode: 'absolute', sideB: null, gradeB: null, preference: null, itemId: 'c1', artwork, gradeA: 'strong', comment: 'calibration repeat' }),
			makeVeto({ artwork: other, reason: 'artist press photo, not artwork' }),
			makeOracleLabel({ imageId: 'music-artworks/kind-of-blue', questionKey: 'ground_type', answer: 'shaded_field', stratum: 's3' }),
		],
		options,
	)
	append(file, makeAmendment(v1.id, { gradeB: 'unacceptable' }, { reason: 'magnified: B clips the horn' }), options)
	return file
}

describe('cli status', () => {
	it('prints one dense line per batch plus a totals line', () => {
		const file = fixtureWarehouse()
		const result = runCli(['status', '--file', file])
		assert.equal(result.code, 0)
		assert.equal(result.err, '')
		assert.equal(
			result.out,
			[
				'batch=b1 purpose=arm items=3 reviewed=2 pending=1 released=2026-08-02T10:04:00.000Z notes=1 endorsed=1 amended=1 last=2026-08-02T10:04:00.000Z',
				'batch=b2 purpose=calibration items=2 reviewed=1 pending=1 released=no last=2026-08-02T10:05:00.000Z',
				'batch=- purpose=- items=- reviewed=1 pending=- released=no vetoes=1 labels=1 unit=image last=2026-08-02T10:07:00.000Z',
				'file records=9 types=verdict:3,note:1,endorsed-sample:1,batch-complete:1,veto:1,oracle-label:1,amendment:1',
				'placeholder-commits records=3 (counted in totals; fingerprint git commit is a placeholder)',
				'total batches=2 open=1 records=9 verdicts=3 amendments=1 orphan-amendments=0 invalid-amendments=0',
				'',
			].join('\n'),
		)
	})

	it('reports an empty warehouse without creating it', () => {
		const missing = join(tempDir(), 'nothing.jsonl')
		const result = runCli(['status', '--file', missing])
		assert.equal(result.code, 0)
		assert.equal(
			result.out,
			[
				'file records=0 types=-',
				'total batches=0 open=0 records=0 verdicts=0 amendments=0 orphan-amendments=0 invalid-amendments=0',
				'',
			].join('\n'),
		)
	})

	it('emits one JSON object per batch plus a totals object with --json', () => {
		const file = fixtureWarehouse()
		const lines = runCli(['status', '--file', file, '--json']).out.trim().split('\n')
		assert.equal(lines.length, 4)
		assert.equal(JSON.parse(lines[0]!).batchId, 'b1')
		const totals = JSON.parse(lines[3]!)
		assert.equal(totals.kind, 'totals')
		assert.equal(totals.fileRecords, 9)
		assert.deepEqual(totals.demo, { batches: 0, batchIds: [], records: 0, verdicts: 0 })
	})
})

describe('cli query', () => {
	it('prints one line per verdict with both grades, both sides and truncated free text', () => {
		const file = fixtureWarehouse()
		const result = runCli(['query', '--file', file, '--type', 'verdict'])
		assert.equal(result.code, 0)
		assert.equal(
			result.out,
			[
				'2026-08-02T10:00:00.000Z v-1 verdict b1/i1 mode=pairwise A=strong@trunk#b5979728 B=unacceptable@arm/foo#8ca33b11 pref=a cf=0 art=aaaaaaaa:kind-of-blue.jpg 1000x1000 am=1 | B loses the trumpet gold entirely; A keeps it, though the surface is a touch close to the backgr…',
				'2026-08-02T10:01:00.000Z v-2 verdict b1/i2 mode=pairwise A=acceptable@trunk#b5979728 B=acceptable@arm/foo#8ca33b11 pref=np cf=1 art=bbbbbbbb:blue-train.jpg 1000x1000 cfnote="B has the zero-contrast accent bug" | both fine',
				'2026-08-02T10:05:00.000Z v-6 verdict b2/c1 mode=absolute A=strong@trunk#b5979728 B=- pref=- cf=0 art=aaaaaaaa:kind-of-blue.jpg 1000x1000 | calibration repeat',
				'',
			].join('\n'),
		)
	})

	it('applies amendments by default and shows the original with --raw', () => {
		const file = fixtureWarehouse()
		const resolved = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1']).out
		assert.match(resolved, /B=unacceptable@/)
		assert.match(resolved, / am=1 /)
		const raw = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1', '--raw']).out
		assert.match(raw, /B=weak@/)
		assert.doesNotMatch(raw, / am=1 /)
	})

	it('expands free text with --full and honours --chars', () => {
		const file = fixtureWarehouse()
		const full = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1', '--full']).out
		assert.match(full, /nudge it darker\.$/m)
		assert.doesNotMatch(full, /…/)
		const clipped = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1', '--chars', '10']).out
		assert.match(clipped, /\| B loses th…$/m)
	})

	it('filters by batch, artwork and time', () => {
		const file = fixtureWarehouse()
		assert.equal(runCli(['query', '--file', file, '--batch', 'b2']).out.trim().split('\n').length, 1)
		assert.equal(runCli(['query', '--file', file, '--artwork', 'b'.repeat(8)]).out.trim().split('\n').length, 2)
		assert.equal(runCli(['query', '--file', file, '--artwork', 'blue-train']).out.trim().split('\n').length, 2)
		assert.equal(runCli(['query', '--file', file, '--since', '2026-08-02T10:05:00.000Z']).out.trim().split('\n').length, 3)
		assert.equal(runCli(['query', '--file', file, '--until', '2026-08-02T10:01:00.000Z']).out.trim().split('\n').length, 1)
		assert.equal(runCli(['query', '--file', file, '--confound']).out.trim().split('\n').length, 1)
	})

	it('drops retracted records with --no-retracted and emits raw records with --json', () => {
		const file = fixtureWarehouse()
		const options = { now: stepClock('2026-08-02T11:00:00.000Z'), idFactory: counterIds(), fsync: false }
		append(file, makeAmendment('v-2', {}, { retract: true, reason: 'wrong rendition shown' }), options)

		const all = runCli(['query', '--file', file, '--type', 'verdict']).out.trim().split('\n')
		assert.equal(all.length, 3)
		assert.match(all[1]!, / RETRACTED /)
		const kept = runCli(['query', '--file', file, '--type', 'verdict', '--no-retracted']).out.trim().split('\n')
		assert.equal(kept.length, 2)

		const json = runCli(['query', '--file', file, '--type', 'verdict', '--json']).out.trim().split('\n')
		assert.equal(JSON.parse(json[0]!).gradeB, 'unacceptable', 'json output is resolved too')
	})

	it('names every colour it prints for an endorsed sample', () => {
		const file = fixtureWarehouse()
		const out = runCli(['query', '--file', file, '--type', 'endorsed-sample']).out
		assert.equal(
			out,
			'2026-08-02T10:03:00.000Z e-4 endorsed b1/i1 art=aaaaaaaa:kind-of-blue.jpg 1000x1000 ' +
				'bg=#0b1d2a/Blackbird sf=#123043/Cellar-Door fg=#f2ede4/Eggshell ac=#d9a441/Goldenrod ' +
				'grad=flat hash=0b1c5cc4 | this is the palette I wanted\n',
		)
	})

	it('prints notes, vetoes, oracle labels, releases and amendments', () => {
		const file = fixtureWarehouse()
		assert.equal(
			runCli(['query', '--file', file, '--type', 'note']).out,
			'2026-08-02T10:02:00.000Z n-3 note b1/- tags=should-be-flat derived=- art=-' +
				' | the gradient reads as two areas, not one shaded surface\n',
		)
		assert.equal(
			runCli(['query', '--file', file, '--type', 'veto']).out,
			'2026-08-02T10:06:00.000Z x-7 veto art=bbbbbbbb:blue-train.jpg 1000x1000 scope=artwork | artist press photo, not artwork\n',
		)
		assert.equal(
			runCli(['query', '--file', file, '--type', 'oracle-label']).out,
			'2026-08-02T10:07:00.000Z o-8 oracle music-artworks/kind-of-blue ground_type=shaded_field sv=q-1.0 conf=high stratum=s3\n',
		)
		assert.equal(
			runCli(['query', '--file', file, '--type', 'batch-complete']).out,
			'2026-08-02T10:04:00.000Z bc-5 batch-complete b1 purpose=arm items=3 released=2 | \n',
		)
		assert.equal(
			runCli(['query', '--file', file, '--type', 'amendment']).out,
			'2026-08-02T10:08:00.000Z am-9 amend->v-1 fields=gradeB retract=0 | magnified: B clips the horn\n',
		)
	})

	it('flags a superseded pre-release draft and hides it with --latest', () => {
		const file = fixtureWarehouse()
		const options = { now: stepClock('2026-08-02T12:00:00.000Z'), idFactory: () => 'v-regrade', fsync: false }
		append(
			file,
			makeVerdict({
				batch: makeBatch({ id: 'b1', purpose: 'arm', itemCount: 3, fundedBy: ['v-seed'] }),
				itemId: 'i1',
				artwork: makeArtwork({ path: '/corpus/music-artworks/kind-of-blue.jpg', sha256: 'a'.repeat(64) }),
				gradeA: 'acceptable',
				comment: 'looked again: A is only acceptable',
			}),
			options,
		)
		const all = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1']).out.trim().split('\n')
		assert.equal(all.length, 2)
		assert.match(all[0]!, / SUPERSEDED /)
		const latest = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1', '--latest']).out.trim().split('\n')
		assert.equal(latest.length, 1)
		assert.match(latest[0]!, /looked again/)
	})

	it('reports the remainder when --limit cuts the result', () => {
		const file = fixtureWarehouse()
		const out = runCli(['query', '--file', file, '--limit', '2']).out.trim().split('\n')
		assert.equal(out.length, 3)
		assert.equal(out[2], 'total shown=2 matched=8 (raise --limit)')
	})

	it('rejects an unknown --type', () => {
		const file = fixtureWarehouse()
		const result = runCli(['query', '--file', file, '--type', 'opinion'])
		assert.equal(result.code, 1)
		assert.match(result.err, /unknown --type opinion/)
	})
})

describe('cli tail', () => {
	it('prints the last N records as appended, amendments included', () => {
		const file = fixtureWarehouse()
		const result = runCli(['tail', '--file', file, '--n', '2'])
		assert.equal(
			result.out,
			[
				'2026-08-02T10:07:00.000Z o-8 oracle music-artworks/kind-of-blue ground_type=shaded_field sv=q-1.0 conf=high stratum=s3',
				'2026-08-02T10:08:00.000Z am-9 amend->v-1 fields=gradeB retract=0 | magnified: B clips the horn',
				'',
			].join('\n'),
		)
	})

	it('defaults to the whole log when it is shorter than the default N', () => {
		const file = fixtureWarehouse()
		assert.equal(runCli(['tail', '--file', file]).out.trim().split('\n').length, 9)
	})
})

describe('cli recheck', () => {
	it('flags decisions funded by since-amended verdicts', () => {
		const file = fixtureWarehouse()
		const decisionsPath = join(tempDir(), 'decisions.json')
		writeFileSync(
			decisionsPath,
			JSON.stringify([
				{ id: 'integration-1', kind: 'integration', ts: '2026-08-02T10:04:30.000Z', fundedBy: ['v-1', 'v-2'] },
				{ id: 'integration-2', kind: 'integration', ts: '2026-08-02T11:00:00.000Z', fundedBy: ['v-1'] },
				{ id: 'adjudication-9', fundedBy: ['v-absent'] },
			]),
		)
		const result = runCli(['recheck', '--file', file, '--decisions', decisionsPath])
		assert.equal(result.code, 0)
		assert.equal(
			result.out,
			[
				'decision=integration-1 kind=integration ts=2026-08-02T10:04:30.000Z stale=1 retracted=0 superseded=0 missing=0 ids=v-1 fields=gradeB',
				'decision=adjudication-9 kind=- ts=- stale=0 retracted=0 superseded=0 missing=1 ids=- fields=- missing-ids=v-absent',
				'total decisions=3 flagged=2',
				'',
			].join('\n'),
		)
	})

	it('can exit non-zero for use as a standing gate', () => {
		const file = fixtureWarehouse()
		const decisionsPath = join(tempDir(), 'decisions.json')
		writeFileSync(decisionsPath, JSON.stringify([{ id: 'd', fundedBy: ['v-1'] }]))
		assert.equal(runCli(['recheck', '--file', file, '--decisions', decisionsPath, '--fail-on-hit']).code, 1)
		writeFileSync(decisionsPath, JSON.stringify([{ id: 'd', fundedBy: ['v-2'] }]))
		const clean = runCli(['recheck', '--file', file, '--decisions', decisionsPath, '--fail-on-hit'])
		assert.equal(clean.code, 0)
		assert.equal(clean.out, 'total decisions=1 flagged=0\n')
	})

	it('needs a decisions file', () => {
		const result = runCli(['recheck', '--file', fixtureWarehouse()])
		assert.equal(result.code, 1)
		assert.match(result.err, /--decisions/)
	})
})

/** A per-question oracle round, released and fully answered. Adversarial review F1/F7. */
function perQuestionWarehouse(): { file: string; itemIds: string[] } {
	const file = join(tempDir(), 'warehouse.jsonl')
	const options = { now: stepClock(), idFactory: counterIds(), fsync: false }
	const artworks = [
		makeArtwork({ path: '/corpus/music-artworks/one.jpg', sha256: 'a'.repeat(64) }),
		makeArtwork({ path: '/corpus/music-artworks/two.jpg', sha256: 'b'.repeat(64) }),
	]
	const questions = ['bg_visible', 'has_text', 'grain_or_noise']
	const batch = makeBatch({ id: 'pg1', purpose: 'oracle-validation', itemCount: artworks.length * questions.length })
	const itemIds: string[] = []
	for (const questionKey of questions)
		for (const artwork of artworks) {
			itemIds.push(`pg-${questionKey}-${artwork.sha256.slice(0, 12)}`)
			append(file, makeOracleLabel({ batch, imageId: artwork.path, artwork, questionKey, answer: 'yes' }), options)
		}
	append(file, makeBatchComplete('pg1', { purpose: 'oracle-validation', itemCount: batch.itemCount, releasedItemIds: itemIds }), options)
	return { file, itemIds }
}

describe('cli status on a per-question round (F1)', () => {
	it('reports a finished released round as done, not as 4 outstanding answers', () => {
		const { file } = perQuestionWarehouse()
		const line = runCli(['status', '--file', file]).out.split('\n')[0]!
		assert.equal(
			line,
			'batch=pg1 purpose=oracle-validation items=6 reviewed=6 pending=0 released=2026-08-02T10:06:00.000Z labels=6 unit=image-question last=2026-08-02T10:06:00.000Z',
		)
	})
})

describe('cli query --item against a release manifest (F7)', () => {
	it('finds the answer named by a per-question released item id', () => {
		const { file } = perQuestionWarehouse()
		const result = runCli(['query', '--file', file, '--item', `pg-has_text-${'a'.repeat(12)}`])
		assert.equal(result.err, '')
		const lines = result.out.trim().split('\n')
		assert.equal(lines.length, 1)
		assert.match(lines[0]!, /oracle \/corpus\/music-artworks\/one\.jpg has_text=yes/)
	})

	it('explains an item id that matches nothing instead of printing silence', () => {
		const { file } = perQuestionWarehouse()
		const released = runCli(['query', '--file', file, '--item', `pg-has_text-${'a'.repeat(12)}`, '--type', 'verdict'])
		assert.equal(released.out, '')
		assert.match(released.err, /matched no record; it was released by batch pg1/)

		const unknown = runCli(['query', '--file', file, '--item', 'pg-nonsense-000000000000'])
		assert.equal(unknown.out, '')
		assert.match(unknown.err, /named by no batch-complete manifest/)
	})
})

describe('cli integrity of stored amendments (F2)', () => {
	/** A warehouse with one amendment that reaches outside AMENDABLE_FIELDS. */
	function forgedWarehouse(): string {
		const file = fixtureWarehouse()
		const options = { now: stepClock('2026-08-02T13:00:00.000Z'), idFactory: () => 'am-forged', fsync: false }
		append(
			file,
			makeAmendment(
				'v-1',
				{ artwork: makeArtwork({ path: '/tmp/OTHER.jpg', sha256: 'f'.repeat(64) }), itemId: 'i-FORGED' },
				{ reason: 'forge identity' },
			),
			{ ...options, verifyAmendmentTarget: false },
		)
		return file
	}

	it('counts and names the refused patch on status, and warns on stderr', () => {
		const file = forgedWarehouse()
		const result = runCli(['status', '--file', file])
		assert.match(result.out, /^integrity amendment=am-forged target=v-1 root=v-1 type=verdict refused-fields=artwork,itemId$/m)
		assert.match(result.out, /invalid-amendments=1$/m)
		assert.match(result.err, /not applied/)
	})

	it('flags the record in query output and leaves it about the artwork the reviewer saw', () => {
		const file = forgedWarehouse()
		const result = runCli(['query', '--file', file, '--type', 'verdict', '--item', 'i1'])
		assert.match(result.out, /INTEGRITY-REFUSED=artwork,itemId/)
		assert.match(result.out, /art=aaaaaaaa:kind-of-blue\.jpg/, 'the forged path never reaches the output')
		assert.doesNotMatch(result.out, /OTHER\.jpg/)
		assert.match(result.err, /amendment am-forged patches artwork,itemId on v-1/)
		// The forged item id does not become an alias for the record either.
		assert.equal(runCli(['query', '--file', file, '--item', 'i-FORGED']).out, '')
	})
})

describe('cli demo fixtures (F6)', () => {
	function demoWarehouse(): string {
		const file = join(tempDir(), 'warehouse.jsonl')
		const options = { now: stepClock(), idFactory: counterIds(), fsync: false }
		const batch = makeBatch({ id: 'demo-batch-0001', purpose: 'mechanism', itemCount: 1 })
		append(
			file,
			makeVerdict({
				batch,
				itemId: 'demo-1',
				sideA: makeSide('trunk', { fingerprint: makeFingerprint({ algorithmVersion: 'demo-fixture-alpha' }) }),
				sideB: makeSide('arm/foo', { fingerprint: makeFingerprint({ algorithmVersion: 'demo-fixture-bravo', gitCommit: '1'.repeat(40) }) }),
			}),
			options,
		)
		append(file, makeBatchComplete('demo-batch-0001', { purpose: 'mechanism', itemCount: 1, releasedItemIds: ['demo-1'] }), options)
		append(file, makeNote({ batch: makeBatch({ id: 'real', itemCount: 1 }), text: 'a real note' }), options)
		return file
	}

	it('keeps fixture verdicts out of the headline count and reports them on their own line', () => {
		const out = runCli(['status', '--file', demoWarehouse()]).out
		assert.match(out, /^batch=demo-batch-0001 .* DEMO last=/m)
		assert.match(out, /^file records=3 types=verdict:1,batch-complete:1,note:1$/m)
		assert.match(out, /^demo batches=1 records=2 verdicts=1 ids=demo-batch-0001 \(fixtures, excluded from totals below\)$/m)
		assert.match(out, /^total batches=1 open=1 records=1 verdicts=0 /m, 'the honest verdict count is zero')
	})

	it('still shows the fixture records to anyone who queries for them', () => {
		const out = runCli(['query', '--file', demoWarehouse(), '--batch', 'demo-batch-0001']).out
		assert.equal(out.trim().split('\n').length, 2, 'nothing is hidden, only uncounted')
	})
})

describe('cli recheck sees replaced and withdrawn evidence (F3, F4)', () => {
	it('reports superseded and retracted funding ids with what replaced them', () => {
		const file = join(tempDir(), 'warehouse.jsonl')
		const options = { now: stepClock(), idFactory: counterIds(), fsync: false }
		const batch = makeBatch({ id: 'b1', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'strong' }), options)
		append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'weak' }), options)
		append(file, makeVerdict({ batch, itemId: 'i2' }), options)
		append(file, makeAmendment('v-3', {}, { retract: true, reason: 'wrong rendition shown' }), options)

		const decisionsPath = join(tempDir(), 'decisions.json')
		writeFileSync(
			decisionsPath,
			JSON.stringify([{ id: 'freeze', kind: 'metric-freeze', ts: '2026-08-03T00:00:00.000Z', fundedBy: ['v-1', 'v-3'] }]),
		)
		const result = runCli(['recheck', '--file', file, '--decisions', decisionsPath])
		assert.equal(
			result.out,
			[
				'decision=freeze kind=metric-freeze ts=2026-08-03T00:00:00.000Z stale=0 retracted=1 superseded=1 missing=0 ' +
					'ids=- fields=- retracted-ids=v-3 superseded-ids=v-1->v-2',
				'total decisions=1 flagged=1',
				'',
			].join('\n'),
		)
		assert.equal(runCli(['recheck', '--file', file, '--decisions', decisionsPath, '--fail-on-hit']).code, 1)
	})
})

describe('cli raw mode and the retraction filter (F8)', () => {
	function withRetractedNote(): string {
		const file = fixtureWarehouse()
		const options = { now: stepClock('2026-08-02T11:00:00.000Z'), idFactory: counterIds(), fsync: false }
		append(file, makeAmendment('n-3', {}, { retract: true, reason: 'superseded by a re-derivation' }), options)
		return file
	}

	it('honours --no-retracted in raw mode', () => {
		const file = withRetractedNote()
		assert.equal(runCli(['query', '--file', file, '--raw', '--type', 'note']).out.trim().split('\n').length, 1)
		assert.equal(runCli(['query', '--file', file, '--raw', '--no-retracted', '--type', 'note']).out, '')
	})

	it('marks the record retracted in raw output without applying the patch', () => {
		const file = fixtureWarehouse()
		const options = { now: stepClock('2026-08-02T11:00:00.000Z'), idFactory: counterIds(), fsync: false }
		// v-1 is the verdict the fixture also amends (gradeB weak -> unacceptable).
		append(file, makeAmendment('v-1', {}, { retract: true, reason: 'wrong rendition shown' }), options)

		const raw = runCli(['query', '--file', file, '--raw', '--type', 'verdict', '--item', 'i1']).out
		assert.match(raw, / RETRACTED/, 'raw mode knows the record was withdrawn')
		assert.match(raw, /B=weak@/, 'and still shows the record as appended, patch unapplied')
		assert.doesNotMatch(raw, / am=1 /)
		assert.equal(runCli(['query', '--file', file, '--raw', '--no-retracted', '--type', 'verdict', '--item', 'i1']).out, '')
	})

	it('honours it when --type amendment turns raw mode on implicitly', () => {
		const file = withRetractedNote()
		const both = runCli(['query', '--file', file, '--type', 'amendment,note', '--no-retracted']).out.trim().split('\n')
		assert.ok(!both.some((line) => line.includes(' n-3 ')), 'the retracted note is dropped as asked')
		assert.ok(both.some((line) => line.includes('amend->n-3')), 'the retracting amendment is itself not retracted')
	})
})

describe('cli entry point', () => {
	it('runs as a script and writes to stdout', () => {
		const file = fixtureWarehouse()
		const out = execFileSync(
			process.execPath,
			['--experimental-strip-types', CLI_PATH, 'status', '--file', file],
			{ encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
		)
		assert.match(out, /^batch=b1 purpose=arm items=3 reviewed=2 pending=1/)
	})

	it('reports unknown commands and unknown flags', () => {
		assert.equal(runCli(['frobnicate']).code, 1)
		assert.match(runCli(['frobnicate']).err, /unknown command/)
		assert.equal(runCli(['query', '--nope']).code, 1)
		assert.equal(runCli([]).code, 1)
		assert.equal(runCli(['--help']).code, 0)
	})
})
