import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import vm from "node:vm"

type Entry = {
	familyId: string
	anchor: { file: string }
	palette: {
		background: { hex: string }
		foreground: { hex: string }
		surface: { hex: string }
		accent: { hex: string }
	}
}
type Plan = { schemaVersion: 1; reviewVersion: string; experimentVersion: string; entries: Entry[] }

const [planArgument, outputArgument] = process.argv.slice(2)
if (!planArgument || !outputArgument) {
	throw new Error("Usage: render-gradient-eligibility-change-review.ts <plan.json> <output.html>")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parsePlan(value: unknown): Plan {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.reviewVersion !== "string" ||
		typeof value.experimentVersion !== "string" || !Array.isArray(value.entries)) throw new Error("Review plan is invalid")
	const seen = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || seen.has(entry.familyId) ||
			!isRecord(entry.anchor) || typeof entry.anchor.file !== "string" || !isRecord(entry.palette)) {
			throw new Error("Review entry is invalid or duplicated")
		}
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			const color = entry.palette[role]
			if (!isRecord(color) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(color.hex)) {
				throw new Error(`Review ${role} is invalid for ${entry.familyId}`)
			}
		}
		seen.add(entry.familyId)
	}
	return value as unknown as Plan
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

function preview(entry: Entry, path: string, label: string): string {
	const palette = entry.palette
	return `<section class="rendering" style="--background:${palette.background.hex};--surface:${palette.surface.hex};--foreground:${palette.foreground.hex};--accent:${palette.accent.hex};--path:${path}">
		<div class="preview-main"><img class="artwork" loading="lazy" src="/artwork/${encodeURIComponent(entry.familyId)}" alt="Artwork in ${label} preview"><div class="preview-copy"><small>NOW PLAYING</small><strong>Signal / Field</strong><p>Background and surface colors extracted from this artwork.</p><b>Selected accent</b></div></div>
		<div class="surface-panel"><div><small>UP NEXT</small><strong>Continuous color</strong></div><div class="controls"><i></i><span><b></b></span><em>02:14</em></div></div>
		<h3>${label}</h3>
	</section>`
}

const plan = parsePlan(JSON.parse(await readFile(resolve(planArgument), "utf8")) as unknown)
const cards = plan.entries.map((entry, index) => {
	const palette = entry.palette
	const previous = `linear-gradient(in oklab 112deg,${palette.background.hex} 0 45%,${palette.surface.hex} 95%)`
	return `<article data-family-id="${escapeHtml(entry.familyId)}">
	<header><span>${String(index + 1).padStart(2, "0")}</span><code>${escapeHtml(entry.familyId)}</code><output>Not submitted</output></header>
	<div class="comparisons">${preview(entry, previous, "Previous: gradient")}${preview(entry, palette.background.hex, "New: flat")}</div>
	<form novalidate><fieldset><legend>Which decision is correct?</legend>
		<label><input type="radio" name="decision-${index}" value="should-be-gradient"> Should be gradient</label>
		<label><input type="radio" name="decision-${index}" value="should-not-be-gradient"> Should not be gradient</label>
		<label><input type="radio" name="decision-${index}" value="either-way"> Either way</label>
	</fieldset>
	<label class="comment"><span>Comment <small>(optional)</small></span><textarea name="comment" maxlength="2000" rows="4" placeholder="Record any artwork-specific observation."></textarea></label>
	<output class="submit-status" aria-live="polite"></output><button type="submit">Save decision</button></form>
</article>`
}).join("\n")

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gradient decision changes</title>
<style>
:root{color-scheme:dark;background:#000;color:#fff;font:15px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#000;color:#fff}main{width:min(1600px,100%);margin:auto;padding:clamp(18px,4vw,56px)}.masthead{display:grid;grid-template-columns:1fr minmax(300px,560px);gap:30px;align-items:end;border-bottom:1px solid #fff;padding-bottom:28px}.eyebrow{font:750 11px/1 ui-monospace,monospace;letter-spacing:.18em}h1{font:650 clamp(44px,7vw,86px)/.88 Georgia,serif;letter-spacing:-.05em;margin:15px 0 0}.progress{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;padding:14px 0;background:#000}meter{width:min(430px,65vw);accent-color:#fff}#progress{font:700 12px/1 ui-monospace,monospace}.grid{display:grid;gap:36px}article{border:1px solid #fff;background:#000}article>header{display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:11px 14px;border-bottom:1px solid #fff;font:700 12px/1 ui-monospace,monospace}.comparisons{display:grid;grid-template-columns:1fr 1fr}.rendering{display:grid;gap:clamp(18px,3vw,36px);min-width:0;padding:clamp(20px,3vw,42px);background:var(--path);color:var(--foreground)}.rendering:first-child{border-right:1px solid #fff}.preview-main{display:grid;grid-template-columns:minmax(150px,42%) 1fr;gap:clamp(18px,3vw,42px);align-items:center}.artwork{display:block;width:100%;aspect-ratio:1;object-fit:cover;border:0;border-radius:0;outline:0;box-shadow:none}.preview-copy{color:var(--foreground)}.preview-copy small,.preview-copy b,.surface-panel small{display:block;color:var(--accent);font:800 10px/1.2 ui-monospace,monospace;letter-spacing:.15em}.preview-copy strong{display:block;color:var(--foreground);font:650 clamp(28px,4vw,58px)/.9 Georgia,serif;letter-spacing:-.045em;margin:12px 0}.preview-copy p{color:var(--foreground);max-width:30ch}.surface-panel{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;padding:18px 20px;background:var(--surface);color:var(--foreground)}.surface-panel strong{display:block;color:var(--foreground);margin-top:7px}.controls{display:flex;align-items:center;gap:12px}.controls>i{display:block;width:28px;height:28px;background:var(--accent)}.controls>span{display:block;width:85px;height:6px;background:var(--foreground)}.controls>span>b{display:block;width:62%;height:100%;background:var(--accent)}.controls em{color:var(--foreground);font:700 10px/1 ui-monospace,monospace;font-style:normal}.rendering h3{margin:0;padding:10px 0 0;border-top:1px solid var(--foreground);color:var(--foreground);font:700 13px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}form{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:20px;border-top:1px solid #fff}fieldset{border:1px solid #fff;margin:0;padding:14px}legend{padding:0 7px;font:750 11px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}fieldset label{display:block;margin:10px 0}input{accent-color:#fff}.comment{display:grid;gap:7px}.comment span{font:700 12px/1 ui-monospace,monospace}textarea{width:100%;resize:vertical;background:#000;color:#fff;border:1px solid #fff;padding:10px;font:inherit}textarea::placeholder{color:#fff}.submit-status{align-self:center;font:700 12px/1 ui-monospace,monospace}button{justify-self:end;border:1px solid #fff;background:#fff;color:#000;padding:13px 22px;font:800 12px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}button:disabled{background:#000;color:#fff}@media(max-width:900px){.masthead,.comparisons{grid-template-columns:1fr}.rendering:first-child{border:0;border-bottom:1px solid #fff}form{grid-template-columns:1fr}}@media(max-width:540px){main{padding:14px}.preview-main{grid-template-columns:1fr}.surface-panel{grid-template-columns:1fr}.controls{flex-wrap:wrap}article>header{grid-template-columns:auto 1fr}article>header output{grid-column:2}}
</style></head><body><main><header class="masthead"><div><div class="eyebrow">GRADIENT ELIGIBILITY / CHANGED CASES</div><h1>Gradient or flat?</h1></div><div><p>Compare the same extracted palette under the previous 0.17 gradient decision and the new flat decision. Judge which treatment better represents the artwork.</p><p>The candidate is veto-only, so no previously flat palettes became gradients.</p></div></header><div class="progress"><meter min="0" max="${plan.entries.length}" value="0"></meter><output id="progress">0 / ${plan.entries.length}</output></div><section class="grid">${cards}</section></main>
<script>
const decisions=new Set(["should-be-gradient","should-not-be-gradient","either-way"]);function setStatus(article,message){article.querySelector("header output").textContent=message;article.querySelector(".submit-status").textContent=message}function updateProgress(){const count=document.querySelectorAll('article[data-complete="true"]').length;document.querySelector("meter").value=count;document.querySelector("#progress").textContent=count+" / ${plan.entries.length}"}function apply(article,entry){for(const input of article.querySelectorAll('input[type="radio"]'))input.checked=input.value===entry.decision;article.querySelector("textarea").value=entry.comment;article.dataset.complete="true";setStatus(article,"Saved")}async function load(){try{const response=await fetch("/api/feedback",{cache:"no-store"});if(!response.ok)throw new Error(await response.text());const store=await response.json();const byFamily=new Map(store.entries.map(entry=>[entry.familyId,entry]));for(const article of document.querySelectorAll("article[data-family-id]")){const entry=byFamily.get(article.dataset.familyId);if(entry)apply(article,entry)}updateProgress()}catch(error){document.querySelector("#progress").textContent="Could not load decisions";console.error(error)}}document.addEventListener("change",event=>{const article=event.target.closest("article[data-family-id]");if(!article)return;article.dataset.complete="false";setStatus(article,"Not submitted");updateProgress()});document.addEventListener("submit",async event=>{event.preventDefault();const article=event.target.closest("article[data-family-id]");const decision=article.querySelector('input[name^="decision-"]:checked')?.value;const comment=article.querySelector("textarea").value;if(!decisions.has(decision)){setStatus(article,"Choose a decision");return}const button=article.querySelector("button");button.disabled=true;setStatus(article,"Saving...");try{const response=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyId:article.dataset.familyId,decision,comment})});if(!response.ok)throw new Error(await response.text());article.dataset.complete="true";setStatus(article,"Saved");updateProgress()}catch(error){setStatus(article,"Save failed: "+error.message)}finally{button.disabled=false}});load();
</script></body></html>`
for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
	new vm.Script(match[1], { filename: `gradient-change-review-${index}.js` })
}
await writeFile(resolve(outputArgument), html, { flag: "wx" })
process.stderr.write(`Rendered ${plan.entries.length} changed gradient cases\n`)
