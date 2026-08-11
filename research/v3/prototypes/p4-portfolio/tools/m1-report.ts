/**
 * M1 — assemble the milestone's two published artefacts from the measured records:
 *
 *  - `data/m1-disagreement.json` — the disagreement matrix, one file, one or more blocks. A block is
 *    a set of members measured over one common set of covers. There are two because P1a cannot run
 *    demo-20 at an honest cost (see the P1 note in `MEMBERS.md`), and pretending otherwise would
 *    either shrink the other three members' corpus to three covers or impute P1a's twenty.
 *  - `MEMBERS.md` — the compact table: membership + pinned commits + gates + timings, then the
 *    pairwise material-disagreement rate, the per-role rates, and the all-members-agree rate.
 *
 * Reads only: `data/m1/snapshot-<slug>.json`, `data/m1/gate-<slug>.json`,
 * `data/m1/disagreement-<block>.json`, and each block's run files (for timings). Writes nothing else.
 *
 * Zero constants — every threshold in the inputs came through `src/adjudication/match.ts`.
 *
 * Usage:
 *   node --experimental-strip-types tools/m1-report.ts --block <name>=<disagreement.json> [--block …]
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"

const P4_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")

const argv = process.argv.slice(2)
const blockSpecs = argv.flatMap((token, at) => (argv[at - 1] === "--block" ? [token] : []))
if (blockSpecs.length === 0) {
	process.stdout.write("usage: --block <name>=<disagreement.json> [--block …]\n")
	process.exit(2)
}

type Disagreement = {
	coverCount: number
	coversAllMembersPublished: number
	ruler: Record<string, unknown>
	members: Array<{ slug: string; runPath: string; candidateId: string; codeVersion: string; okCount: number; coverCount: number }>
	allFourAgree: Record<string, { count: number; rate: number | null }>
	pairs: Array<{
		a: string
		b: string
		coversShared: number
		coversMissing: number
		byBar: Record<
			string,
			{
				materialDisagreementCount: number
				materialDisagreementRate: number | null
				perRoleCount: Record<string, number>
				perRoleRate: Record<string, number | null>
			}
		>
	}>
}

const blocks: Array<{ name: string; path: string; data: Disagreement }> = []
for (const spec of blockSpecs) {
	const at = spec.indexOf("=")
	const name = spec.slice(0, at)
	const path = resolve(spec.slice(at + 1))
	blocks.push({ name, path, data: JSON.parse(await readFile(path, "utf8")) as Disagreement })
}

/**
 * Per-cover median of `computeMs` over the rows a run actually computed, with the run's worker count
 * and wall time beside it.
 *
 * **The worker count is not decoration.** `computeMs` is per-image time inside a worker, so a run
 * across fourteen cores measures a cover under thirteen neighbours competing for memory bandwidth and
 * comes out 2–4× the same cover's cost alone (measured here: p5 121 ms serial vs 530 ms at fourteen
 * workers, on byte-identical palettes). SPEC §4 asks what a member costs per file, so the serial
 * number is the one to read as cost and the parallel `wallMs` is the one to read as throughput.
 */
async function timingOf(runPath: string): Promise<{
	okCount: number
	coverCount: number
	medianMs: number | null
	workerCount: number | null
	wallMs: number | null
	failures: string[]
}> {
	const text = await readFile(runPath, "utf8")
	const values: number[] = []
	const failures: string[] = []
	let okCount = 0
	let coverCount = 0
	let workerCount: number | null = null
	let wallMs: number | null = null
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		const row = JSON.parse(line) as Record<string, unknown>
		if (row.kind === "devloop-run-header") workerCount = row.workerCount as number
		if (row.kind === "devloop-run-footer") wallMs = row.wallMs as number
		if (row.kind !== "devloop-run-row") continue
		coverCount += 1
		if (row.ok === true) {
			okCount += 1
			values.push(row.computeMs as number)
		} else {
			failures.push(`${String(row.imagePath).split("/").slice(-1)[0]}: ${String(row.error).slice(0, 120)}`)
		}
	}
	values.sort((a, b) => a - b)
	const mid = values.length >> 1
	const medianMs =
		values.length === 0 ? null : values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
	return { okCount, coverCount, medianMs, workerCount, wallMs, failures }
}

const slugs = [...new Set(blocks.flatMap((block) => block.data.members.map((member) => member.slug)))]

type MemberRecord = {
	slug: string
	commit: string
	branch: string
	pinVerdict: string
	committedAtHead: boolean
	notInHead: number
	differsFromHead: number
	worktree: string
	snapshotCandidate: string
	homeCodeVersion: string
	snapshotCodeVersion: string
	gate: string
	gateRows: string
	runs: Record<
		string,
		{
			runPath: string
			okCount: number
			coverCount: number
			medianMs: number | null
			workerCount: number | null
			wallMs: number | null
			failures: string[]
		}
	>
}

const memberRecords: MemberRecord[] = []
for (const slug of slugs) {
	const snapshot = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `snapshot-${slug}.json`), "utf8")) as Record<
		string,
		unknown
	>
	const pin = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `pin-${slug}.json`), "utf8")) as {
		headAtVerification: string
		branch: string
		verdict: string
		committedAtHead: boolean
		notInHead: string[]
		differsFromHead: string[]
	}
	const commit = pin.headAtVerification
	let gate = "NOT-RUN"
	let gateRows = ""
	try {
		const gateFile = JSON.parse(await readFile(join(P4_ROOT, "data", "m1", `gate-${slug}.json`), "utf8")) as Record<
			string,
			unknown
		>
		gate = String(gateFile.gate) === "PASS" ? "PASS" : "FAILED-GATE"
		gateRows = `${String(gateFile.identicalRows)}/${String(gateFile.rowsCompared)}`
	} catch {
		/* no gate record */
	}
	const runs: MemberRecord["runs"] = {}
	for (const block of blocks) {
		const member = block.data.members.find((entry) => entry.slug === slug)
		if (member === undefined) continue
		runs[block.name] = { runPath: member.runPath, ...(await timingOf(member.runPath)) }
	}
	memberRecords.push({
		slug,
		commit,
		branch: pin.branch,
		pinVerdict: pin.verdict,
		committedAtHead: pin.committedAtHead,
		notInHead: pin.notInHead.length,
		differsFromHead: pin.differsFromHead.length,
		worktree: String(snapshot.worktree),
		snapshotCandidate: relative(P4_ROOT, String(snapshot.snapshotCandidate)),
		homeCodeVersion: String(snapshot.homeCodeVersion),
		snapshotCodeVersion: String(snapshot.snapshotCodeVersion),
		gate,
		gateRows,
		runs,
	})
}

const matrix = {
	kind: "p4-portfolio-m1-disagreement",
	generatedAt: new Date().toISOString(),
	ruler: blocks[0].data.ruler,
	members: memberRecords.map((record) => ({
		slug: record.slug,
		commit: record.commit,
		branch: record.branch,
		pinVerdict: record.pinVerdict,
		committedAtHead: record.committedAtHead,
		filesUntrackedInHome: record.notInHead,
		filesWithUncommittedEdits: record.differsFromHead,
		worktree: record.worktree,
		snapshotCandidate: record.snapshotCandidate,
		homeCodeVersion: record.homeCodeVersion,
		snapshotCodeVersion: record.snapshotCodeVersion,
		byteIdentityGate: record.gate,
		gateRowsIdentical: record.gateRows,
		runs: record.runs,
	})),
	blocks: Object.fromEntries(blocks.map((block) => [block.name, block.data])),
}
await writeFile(join(P4_ROOT, "data", "m1-disagreement.json"), `${JSON.stringify(matrix, null, "\t")}\n`)

/* ------------------------------------------------------------------------------------------- */
/* MEMBERS.md                                                                                     */
/* ------------------------------------------------------------------------------------------- */

const pct = (value: number | null): string => (value === null ? "—" : `${(value * 100).toFixed(1)}%`)
const ms = (value: number | null): string => (value === null ? "—" : `${Math.round(value)}`)

const out: string[] = []
out.push("# P4 members — M1 integration record")
out.push("")
out.push(
	"**Generated by `tools/m1-report.ts` from the measured records in `data/m1/`. " +
		"Do not hand-edit: the numbers here are re-derivable and a hand-kept copy drifts.**",
)
out.push("")
out.push("## 1. Membership, provenance, gates")
out.push("")
out.push("| member | pinned commit | in that commit? | closure re-verified | snapshot candidate | byte-identity gate |")
out.push("|---|---|---|---|---|---|")
for (const record of memberRecords) {
	const inCommit = record.committedAtHead
		? "yes"
		: `**NO** — ${record.notInHead} untracked, ${record.differsFromHead} uncommitted`
	out.push(
		`| \`${record.slug}\` | \`${record.commit.slice(0, 10)}\` | ${inCommit} | ${record.pinVerdict} | ` +
			`\`${record.snapshotCandidate}\` | **${record.gate}** (${record.gateRows} rows) |`,
	)
}
out.push("")
out.push(
	"Per-member file lists, hashes and the gate's exact comparison rule: `members/<slug>/PROVENANCE.md`. " +
		"Member code is copied, never edited (SPEC §4); imports resolve through a `v3/src` symlink into " +
		"this worktree's one contract, which was verified byte-identical to each member's home before " +
		"copying.",
)
out.push("")
out.push("## 2. Runtime")
out.push("")
out.push(
	"`computeMs` is per-image time inside a worker, so it is reported with the run's worker count: at " +
		"fourteen workers on a fourteen-core machine every cover is measured under thirteen competing " +
		"neighbours. The **serial** rows are the per-file cost SPEC §4 asks about; the parallel `wallMs` " +
		"is throughput. Palettes are identical between the two (checked: `data/m1/determinism-*.json`, " +
		"20/20 rows strictly identical for each of the three members that ran both).",
)
out.push("")
out.push("| member | set | workers | ok | covers | median ms/cover | wall ms |")
out.push("|---|---|---|---|---|---|---|")
for (const record of memberRecords) {
	for (const [name, run] of Object.entries(record.runs)) {
		out.push(
			`| \`${record.slug}\` | ${name} | ${run.workerCount ?? "—"} | ${run.okCount} | ${run.coverCount} | ` +
				`${ms(run.medianMs)} | ${run.wallMs ?? "—"} |`,
		)
	}
}
out.push("")
const failures = memberRecords.flatMap((record) =>
	Object.entries(record.runs).flatMap(([name, run]) => run.failures.map((failure) => `- \`${record.slug}\` (${name}): ${failure}`)),
)
out.push(failures.length === 0 ? "No failed covers in any run." : "Failed covers:")
if (failures.length > 0) out.push(...failures)
out.push("")
out.push("## 3. Disagreement matrix")
out.push("")
out.push(
	"The ruler is the contract's, imported not restated: `compareRole()` from " +
		"`research/v3/src/adjudication/match.ts`, which is OKLab `colorDistance` against " +
		"`sameColorBar()` (**regional** — the calibrated per-pair bar, and `match.ts`'s own stated rule " +
		"for any per-pair judgement) or `POOLED_SAME_COLOR_BAR` (**pooled** — the scalar " +
		"`contract/constants.ts` reserves for corpus agreement rates, explicitly *not* the gate's bar). " +
		"Regional is the headline; pooled is reported beside it. **Zero new constants.**",
)
out.push("")
out.push(
	"*Material disagreement* = at least one of the four roles beyond the bar, i.e. the covers where " +
		"SPEC §2.3b would NOT record the selection as immaterial.",
)
out.push("")
for (const block of blocks) {
	out.push(`### Block \`${block.name}\` — ${block.data.coverCount} covers, ${block.data.members.length} members`)
	out.push("")
	out.push(`Members: ${block.data.members.map((member) => `\`${member.slug}\``).join(", ")}.`)
	out.push("")
	for (const mode of ["regional", "pooled"]) {
		out.push(`**${mode} bar** — all members agree on all four roles on ` +
			`${block.data.allFourAgree[mode].count}/${block.data.coversAllMembersPublished} covers ` +
			`(${pct(block.data.allFourAgree[mode].rate)}).`)
		out.push("")
		out.push("| pair | shared | material | background | surface | foreground | accent |")
		out.push("|---|---|---|---|---|---|---|")
		for (const pair of block.data.pairs) {
			const bar = pair.byBar[mode]
			out.push(
				`| \`${pair.a}\` × \`${pair.b}\` | ${pair.coversShared} | **${pct(bar.materialDisagreementRate)}** | ` +
					`${pct(bar.perRoleRate.background)} | ${pct(bar.perRoleRate.surface)} | ` +
					`${pct(bar.perRoleRate.foreground)} | ${pct(bar.perRoleRate.accent)} |`,
			)
		}
		out.push("")
	}
}
out.push("Per-cover detail, including every role distance: `data/m1-disagreement.json`.")
out.push("")
// An optional hand-written appendix — the only prose in this file that is not derived, kept in its
// own source (`data/m1/notes.md`) so regenerating the report cannot silently drop it.
try {
	const notes = await readFile(join(P4_ROOT, "data", "m1", "notes.md"), "utf8")
	out.push(notes.trim())
	out.push("")
} catch {
	/* no notes */
}

await writeFile(join(P4_ROOT, "MEMBERS.md"), `${out.join("\n")}`)
process.stdout.write("data/m1-disagreement.json\nMEMBERS.md\n")
