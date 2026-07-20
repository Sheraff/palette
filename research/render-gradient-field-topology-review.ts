import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import vm from "node:vm"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import type { RGB } from "./src/types.ts"

type Color = { rgb: RGB; hex: string }
type Entry = {
	familyId: string
	anchor: { file: string; sha256: string; bytes: number }
	pairSha256: string
	palette: Record<"background" | "foreground" | "surface" | "accent", Color>
	gradientFirst: boolean
}
type Review = {
	schemaVersion: 1
	reviewVersion: string
	generatedAt: string
	manifestId: string
	provenance: Record<string, string>
	entries: Entry[]
}

const [planArgument, htmlArgument, renderArgument] = process.argv.slice(2)
if (!planArgument || !htmlArgument || !renderArgument || process.argv.slice(2).length !== 3) {
	throw new Error("Usage: render-gradient-field-topology-review.ts <review.json> <review.html> <render.json>")
}
const planPath = resolve(planArgument)
const htmlPath = resolve(htmlArgument)
const renderPath = resolve(renderArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function parseReview(value: unknown): Review {
	if (!isRecord(value)) throw new Error("Review is invalid")
	exactKeys(value, ["schemaVersion", "reviewVersion", "generatedAt", "manifestId", "provenance", "entries"], "Review")
	if (value.schemaVersion !== 1 || value.reviewVersion !== "gradient-field-topology-3.0.0-07-review-1" ||
		typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
		typeof value.manifestId !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestId) ||
		!isRecord(value.provenance) || !Array.isArray(value.entries) || value.entries.length !== 25) {
		throw new Error("Review header is invalid")
	}
	exactKeys(value.provenance, ["manifestSha256", "evaluationSha256", "modelFileSha256", "modelIdentitySha256", "parameterSha256"], "Review provenance")
	for (const [key, hash] of Object.entries(value.provenance)) {
		if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Review provenance ${key} is invalid`)
	}
	const families = new Set<string>()
	const pairs = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue)) throw new Error(`Review entry ${index} is invalid`)
		exactKeys(entryValue, ["familyId", "anchor", "pairSha256", "palette", "gradientFirst"], `Review entry ${index}`)
		if (typeof entryValue.familyId !== "string" || families.has(entryValue.familyId) ||
			typeof entryValue.pairSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.pairSha256) ||
			pairs.has(entryValue.pairSha256) || typeof entryValue.gradientFirst !== "boolean" ||
			!isRecord(entryValue.anchor) || !isRecord(entryValue.palette)) throw new Error(`Review entry ${index} is invalid`)
		exactKeys(entryValue.anchor, ["file", "sha256", "bytes"], `Review entry ${index} anchor`)
		if (typeof entryValue.anchor.file !== "string" || !/^07\/[^/\\]+$/.test(entryValue.anchor.file) ||
			typeof entryValue.anchor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.anchor.sha256) ||
			!Number.isInteger(entryValue.anchor.bytes) || (entryValue.anchor.bytes as number) <= 0) {
			throw new Error(`Review entry ${index} anchor is invalid`)
		}
		exactKeys(entryValue.palette, ["background", "foreground", "surface", "accent"], `Review entry ${index} palette`)
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			const color = entryValue.palette[role]
			if (!isRecord(color)) throw new Error(`Review entry ${index} ${role} is invalid`)
			exactKeys(color, ["rgb", "hex"], `Review entry ${index} ${role}`)
			if (!Array.isArray(color.rgb) || color.rgb.length !== 3 || color.rgb.some((channel) =>
				!Number.isInteger(channel) || channel < 0 || channel > 255) ||
				typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(color.hex)) {
				throw new Error(`Review entry ${index} ${role} is invalid`)
			}
		}
		families.add(entryValue.familyId)
		pairs.add(entryValue.pairSha256)
	}
	return value as unknown as Review
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

function preview(entry: Entry, gradient: boolean, label: string): string {
	const palette = entry.palette
	const path = gradient
		? `linear-gradient(in oklab 112deg,${palette.background.hex} 0 45%,${palette.surface.hex} 95%)`
		: palette.background.hex
	return `<section class="rendering" style="--background:${palette.background.hex};--surface:${palette.surface.hex};--foreground:${palette.foreground.hex};--accent:${palette.accent.hex};--path:${path}">
		<div class="preview-main"><img class="artwork" loading="lazy" src="/artwork/${encodeURIComponent(entry.familyId)}" alt="Source artwork in ${label}"><div class="preview-copy"><small>DIRECTED COLOR PAIR</small><strong>Signal / Field</strong><p>The background begins at the selected background color and, only in the gradient treatment, moves toward the selected surface color.</p><b>Selected accent</b></div></div>
		<div class="surface-panel"><div><small>SELECTED SURFACE</small><strong>Continuous color</strong></div><div class="controls"><i></i><span><b></b></span><em>02:14</em></div></div>
		<h3>${label}</h3>
	</section>`
}

await Promise.all([
	prepareOutputTarget({ path: htmlPath, refuseOverwrite: true }),
	prepareOutputTarget({ path: renderPath, refuseOverwrite: true }),
])
const planSource = await readFile(planPath)
const plan = parseReview(JSON.parse(planSource.toString("utf8")) as unknown)
const cards = plan.entries.map((entry, index) => {
	const comparisons = entry.gradientFirst
		? `${preview(entry, true, "Option A")}${preview(entry, false, "Option B")}`
		: `${preview(entry, false, "Option A")}${preview(entry, true, "Option B")}`
	return `<article data-family-id="${escapeHtml(entry.familyId)}" data-pair-sha256="${entry.pairSha256}">
	<header><span>${String(index + 1).padStart(2, "0")}</span><code>${escapeHtml(entry.familyId)}</code><output>Not submitted</output></header>
	<div class="comparisons">${comparisons}</div>
	<form novalidate><fieldset><legend>Which treatment should this exact displayed color pair use?</legend>
		<label><input type="radio" name="decision-${index}" value="should-be-gradient"> Should be gradient</label>
		<label><input type="radio" name="decision-${index}" value="should-not-be-gradient"> Should not be gradient</label>
		<label><input type="radio" name="decision-${index}" value="either-way"> Either way</label>
		<label><input type="radio" name="decision-${index}" value="no-visible-difference"> No visible difference</label>
		<label><input type="radio" name="decision-${index}" value="selected-colors-not-identifiable"> Selected colors not identifiable</label>
	</fieldset>
	<label class="comment"><span>Comment <small>(optional)</small></span><textarea name="comment" maxlength="2000" rows="3" placeholder="Record an artwork-specific observation."></textarea></label>
	<output class="submit-status" aria-live="polite"></output><button type="submit">Save judgment</button></form>
	</article>`
}).join("\n")
const planSha256 = sha256(planSource)
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="review-sha256" content="${planSha256}"><title>Gradient field topology blinded review</title>
<style>
:root{color-scheme:dark;background:#080808;color:#f6f3ea;font:15px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#080808;color:#f6f3ea}main{width:min(1600px,100%);margin:auto;padding:clamp(18px,4vw,56px)}.masthead{display:grid;grid-template-columns:1fr minmax(300px,570px);gap:34px;align-items:end;border-bottom:1px solid #eee6d5;padding-bottom:28px}.eyebrow{font:750 11px/1 ui-monospace,monospace;letter-spacing:.18em;color:#d9ff5a}h1{font:650 clamp(45px,7vw,88px)/.88 Georgia,serif;letter-spacing:-.05em;margin:15px 0 0}.masthead p{max-width:62ch}.progress{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;padding:14px 0;background:#080808}meter{width:min(430px,65vw);accent-color:#d9ff5a}#progress{font:700 12px/1 ui-monospace,monospace}.grid{display:grid;gap:36px}article{border:1px solid #eee6d5;background:#080808}article>header{display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:11px 14px;border-bottom:1px solid #eee6d5;font:700 12px/1 ui-monospace,monospace}.comparisons{display:grid;grid-template-columns:1fr 1fr}.rendering{display:grid;gap:clamp(18px,3vw,36px);min-width:0;padding:clamp(20px,3vw,42px);background:var(--path);color:var(--foreground)}.rendering:first-child{border-right:1px solid #eee6d5}.preview-main{display:grid;grid-template-columns:minmax(140px,42%) 1fr;gap:clamp(18px,3vw,42px);align-items:center}.artwork{display:block;width:100%;aspect-ratio:1;object-fit:cover}.preview-copy small,.preview-copy b,.surface-panel small{display:block;color:var(--accent);font:800 10px/1.2 ui-monospace,monospace;letter-spacing:.15em}.preview-copy strong{display:block;color:var(--foreground);font:650 clamp(26px,4vw,56px)/.9 Georgia,serif;letter-spacing:-.045em;margin:12px 0}.preview-copy p{max-width:31ch}.surface-panel{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;padding:18px 20px;background:var(--surface);color:var(--foreground)}.surface-panel strong{display:block;margin-top:6px}.controls{display:flex;gap:9px;align-items:center}.controls i{width:22px;height:22px;border:2px solid currentColor;border-radius:50%}.controls span{display:block;width:80px;height:3px;background:currentColor}.controls b{display:block;width:9px;height:9px;border-radius:50%;background:var(--accent);transform:translate(45px,-3px)}.controls em{font:10px ui-monospace,monospace}.rendering h3{margin:0;font:800 11px ui-monospace,monospace;letter-spacing:.18em}form{display:grid;grid-template-columns:1fr minmax(240px,32%);gap:22px;padding:18px}fieldset{display:flex;flex-wrap:wrap;gap:10px 18px;border:0;padding:0;margin:0}legend{width:100%;font-weight:750;margin-bottom:8px}fieldset label{white-space:nowrap}.comment{display:grid;gap:7px}.comment span{font-weight:700}.comment small{font-weight:400}textarea{width:100%;resize:vertical;background:#111;color:#fff;border:1px solid #777;padding:10px}button{justify-self:end;background:#d9ff5a;color:#080808;border:0;padding:10px 17px;font-weight:800}.submit-status{align-self:center;font:700 12px ui-monospace,monospace;color:#d9ff5a}@media(max-width:850px){.masthead{grid-template-columns:1fr}.comparisons{grid-template-columns:1fr}.rendering:first-child{border-right:0;border-bottom:1px solid #eee6d5}.preview-main{grid-template-columns:1fr}.artwork{max-width:360px}form{grid-template-columns:1fr}button{justify-self:start}}@media(max-width:520px){main{padding:14px}.surface-panel{grid-template-columns:1fr}.controls{display:none}article>header{grid-template-columns:auto 1fr}article>header output{grid-column:1/-1}fieldset{display:grid}.rendering{padding:18px}}
</style></head><body><main><header class="masthead"><div><div class="eyebrow">SEALED REVIEW / EXACT DIRECTED PAIRS</div><h1>Gradient or flat?</h1></div><div><p>Compare two treatments of the same frozen palette. Option placement is randomized. Judge only the displayed background-to-surface pair, not alternative colors the artwork might support.</p><p>Use <b>no visible difference</b> only when treatments are indistinguishable. Use <b>selected colors not identifiable</b> when either endpoint cannot be found in the artwork. Submit all 25 cases.</p></div></header><div class="progress"><meter min="0" max="25" value="0"></meter><output id="progress">0 / 25</output></div><section class="grid">${cards}</section></main>
<script>
const decisions=new Set(["should-be-gradient","should-not-be-gradient","either-way","no-visible-difference","selected-colors-not-identifiable"]);function setStatus(article,message){article.querySelector("header output").textContent=message;article.querySelector(".submit-status").textContent=message}function updateProgress(){const count=document.querySelectorAll('article[data-complete="true"]').length;document.querySelector("meter").value=count;document.querySelector("#progress").textContent=count+" / 25"}function apply(article,entry){for(const input of article.querySelectorAll('input[type="radio"]'))input.checked=input.value===entry.decision;article.querySelector("textarea").value=entry.comment;article.dataset.complete="true";setStatus(article,"Saved")}async function load(){try{const response=await fetch("/api/feedback",{cache:"no-store"});if(!response.ok)throw new Error(await response.text());const store=await response.json();const byFamily=new Map(store.entries.map(entry=>[entry.familyId,entry]));for(const article of document.querySelectorAll("article[data-family-id]")){const entry=byFamily.get(article.dataset.familyId);if(entry)apply(article,entry)}updateProgress()}catch(error){document.querySelector("#progress").textContent="Could not load judgments";console.error(error)}}document.addEventListener("change",event=>{const article=event.target.closest("article[data-family-id]");if(!article)return;article.dataset.complete="false";setStatus(article,"Not submitted");updateProgress()});document.addEventListener("submit",async event=>{event.preventDefault();const article=event.target.closest("article[data-family-id]");const decision=article.querySelector('input[name^="decision-"]:checked')?.value;const comment=article.querySelector("textarea").value;if(!decisions.has(decision)){setStatus(article,"Choose a judgment");return}const button=article.querySelector("button");button.disabled=true;setStatus(article,"Saving...");try{const response=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyId:article.dataset.familyId,pairSha256:article.dataset.pairSha256,decision,comment})});if(!response.ok)throw new Error(await response.text());apply(article,await response.json());updateProgress()}catch(error){setStatus(article,"Save failed");console.error(error)}finally{button.disabled=false}});load();
</script></body></html>`
for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
	new vm.Script(match[1], { filename: `gradient-field-topology-review-${index}.js` })
}
await writeFile(htmlPath, html, { flag: "wx" })
await writeJsonAtomic({ path: renderPath, refuseOverwrite: true }, {
	schemaVersion: 1,
	renderVersion: "gradient-field-topology-3.0.0-07-render-1",
	generatedAt: new Date().toISOString(),
	planFile: basename(planPath),
	planSha256,
	htmlFile: basename(htmlPath),
	htmlSha256: sha256(html),
})
process.stderr.write("Rendered 25 blinded gradient-field-topology cases\n")
