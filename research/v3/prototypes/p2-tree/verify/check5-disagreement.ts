/**
 * Check 5 — cross-pipeline disagreement over the 20 demo covers.
 *
 * Not an error hunt: the two prototypes are two tree families and the point is to see where the
 * families part company. Colour comparison uses the one ruler — `barFor(..., "regional")` from
 * `src/adjudication/match.ts` plus `colorDistance` from the contract — and never exact hex.
 */

import { barFor } from "../../../src/adjudication/match.ts"
import { colorDistance, ROLE_NAMES } from "../../../src/contract/index.ts"
import { readJsonl } from "./lib.ts"

const HERE = new URL("./", import.meta.url).pathname

/** Bar mode for every colour comparison here. [INHERITED] — `DEFAULT_MATCH_OPTIONS.barMode`. */
export const BAR_MODE = "regional" as const

const rowsOf = async (p: string) =>
	(await readJsonl<any>(p)).filter((l) => l.kind === "devloop-run-row")

const alpha = await rowsOf(`${HERE}out/alpha-demo20.jsonl`)
const tos = await rowsOf(`${HERE}out/tos-demo20.jsonl`)

const perRole: Record<string, number> = {}
const gradientDisagree: string[] = []
const backgroundDisagree: Array<Record<string, unknown>> = []
let gradA = 0
let gradT = 0
let collapseA = 0
let collapseT = 0

for (let i = 0; i < alpha.length; i++) {
	const a = alpha[i].palette
	const t = tos[i].palette
	if (alpha[i].imagePath !== tos[i].imagePath) throw new Error("set order mismatch")
	const name = alpha[i].imagePath.split("/").pop()!

	for (const role of ROLE_NAMES) {
		const ca = a.roles[role]
		const ct = t.roles[role]
		const bar = barFor(ca, ct, BAR_MODE)!
		const d = colorDistance(ca, ct)
		if (!(d < bar)) {
			perRole[role] = (perRole[role] ?? 0) + 1
			if (role === "background")
				backgroundDisagree.push({
					image: name,
					alpha: ca.hex,
					tos: ct.hex,
					distance: Number(d.toFixed(4)),
					bar: Number(bar.toFixed(4)),
					barRatio: Number((d / bar).toFixed(2)),
				})
		}
	}

	const ga = a.gradient !== null
	const gt = t.gradient !== null
	if (ga) gradA++
	if (gt) gradT++
	if (a.collapse.surfaceCollapsed) collapseA++
	if (t.collapse.surfaceCollapsed) collapseT++
	if (ga !== gt) gradientDisagree.push(`${name} alpha=${ga} tos=${gt}`)
}

console.log(
	JSON.stringify(
		{
			check: "cross-pipeline-disagreement",
			images: alpha.length,
			barMode: BAR_MODE,
			rolesDisagreeingBeyondBar: perRole,
			gradientsPublished: { alpha: gradA, tos: gradT },
			surfaceCollapsed: { alpha: collapseA, tos: collapseT },
			gradientBooleanDisagreements: gradientDisagree.length,
			gradientDisagreementList: gradientDisagree,
			backgroundDisagreements: backgroundDisagree,
		},
		null,
		1,
	),
)
