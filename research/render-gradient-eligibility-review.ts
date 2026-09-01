import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import vm from "node:vm"

type ReviewQueueEntry = { familyId: string; batch: number; stratum: string }
type DevelopmentEntry = {
	familyId: string
	anchor: { file: string }
	palette: {
		background: { hex: string }
		foreground: { hex: string }
		surface: { hex: string }
		accent: { hex: string }
	}
}
type Development = {
	schemaVersion: 1
	developmentVersion: string
	experimentVersion: string
	algorithmVersion: string
	reviewQueue: ReviewQueueEntry[]
	entries: DevelopmentEntry[]
}

const [developmentArgument, outputArgument, batchArgument = "1"] = process.argv.slice(2)
if (!developmentArgument || !outputArgument || !/^\d+$/.test(batchArgument) || Number(batchArgument) < 1) {
	throw new Error("Usage: render-gradient-eligibility-review.ts <development.json> <output.html> [batch]")
}
const batch = Number(batchArgument)

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseDevelopment(value: unknown): Development {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.developmentVersion !== "string" ||
		typeof value.experimentVersion !== "string" || typeof value.algorithmVersion !== "string" ||
		!Array.isArray(value.reviewQueue) || !Array.isArray(value.entries)) throw new Error("Development evidence is invalid")
	const familyIds = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || familyIds.has(entry.familyId) ||
			!isRecord(entry.anchor) || typeof entry.anchor.file !== "string" || !isRecord(entry.palette)) {
			throw new Error("Development entry is invalid or duplicated")
		}
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			const color = entry.palette[role]
			if (!isRecord(color) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(color.hex)) {
				throw new Error(`Development ${role} is invalid for ${entry.familyId}`)
			}
		}
		familyIds.add(entry.familyId)
	}
	for (const item of value.reviewQueue) {
		if (!isRecord(item) || typeof item.familyId !== "string" || !familyIds.has(item.familyId) ||
			!Number.isInteger(item.batch) || typeof item.stratum !== "string") throw new Error("Review queue is invalid")
	}
	return value as unknown as Development
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

const developmentSource = await readFile(resolve(developmentArgument))
const development = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
const entriesByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
const queue = development.reviewQueue.filter((entry) => entry.batch === batch)
const cards = queue.map((item, index) => {
	const entry = entriesByFamily.get(item.familyId)!
	const palette = entry.palette
	const familyId = escapeHtml(entry.familyId)
	const directGradient = `linear-gradient(in oklab 112deg,${palette.background.hex} 0 45%,${palette.surface.hex} 95%)`
	return `<article data-family-id="${familyId}">
	<header><span>${String(index + 1).padStart(2, "0")}</span><code>${familyId}</code><output>Not submitted</output></header>
	<section class="preview" style="--background:${palette.background.hex};--surface:${palette.surface.hex};--foreground:${palette.foreground.hex};--accent:${palette.accent.hex};--path:${directGradient}">
		<div class="preview-main">
			<img class="artwork" loading="lazy" src="/artwork/${encodeURIComponent(entry.familyId)}" alt="Artwork under review">
			<div class="preview-copy"><small>NOW PLAYING</small><strong>Signal / Field</strong><p>Background and surface colors extracted from this artwork.</p><b>Selected accent</b></div>
		</div>
		<div class="surface-panel"><div><small>UP NEXT</small><strong>Continuous color</strong></div><div class="controls"><i></i><span><b></b></span><em>02:14</em></div></div>
	</section>
	<form novalidate>
		<fieldset><legend>Background-to-surface relationship</legend>
			<label><input type="radio" name="classification-${index}" value="true-background-gradient"> <span><b>True background gradient</b><small>The pair belongs to one spatially continuous background field.</small></span></label>
			<label><input type="radio" name="classification-${index}" value="flat-background-isolated-surface"> <span><b>Flat background, isolated surface</b><small>The surface comes from a separate object, subject, or detail.</small></span></label>
			<label><input type="radio" name="classification-${index}" value="not-gradient-other"> <span><b>Not a gradient, other</b><small>The colors are separate fields, blocks, or otherwise not one continuous gradient.</small></span></label>
			<label><input type="radio" name="classification-${index}" value="gradient-wrong-endpoints"> <span><b>Gradient, wrong pair</b><small>A background gradient exists, but these are not its meaningful endpoints.</small></span></label>
			<label><input type="radio" name="classification-${index}" value="uncertain"> <span><b>Uncertain</b><small>The relationship cannot be classified reliably from this artwork.</small></span></label>
		</fieldset>
		<fieldset class="confidence"><legend>Confidence</legend>
			<label><input type="radio" name="confidence-${index}" value="high"> High</label>
			<label><input type="radio" name="confidence-${index}" value="medium"> Medium</label>
			<label><input type="radio" name="confidence-${index}" value="low"> Low</label>
		</fieldset>
		<label class="note"><span>Artwork feedback <small>(optional, free-form)</small></span><textarea name="note" maxlength="2000" rows="4" placeholder="Record any artwork-specific observation not captured by the structured label."></textarea></label>
		<output class="submit-status" aria-live="polite"></output><button type="submit">Save label</button>
	</form>
</article>`
}).join("\n")

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gradient eligibility development review</title>
<style>
	:root{color-scheme:dark;background:#000;color:#fff;font:15px/1.45 Inter,ui-sans-serif,system-ui,sans-serif;--line:#fff}*{box-sizing:border-box}body{margin:0;background:#000;color:#fff}main{width:min(1420px,100%);margin:auto;padding:clamp(18px,4vw,56px)}.masthead{display:grid;grid-template-columns:1fr minmax(300px,560px);gap:30px;align-items:end;border-bottom:1px solid #fff;padding-bottom:28px}.eyebrow{color:#fff;font:750 11px/1 ui-monospace,monospace;letter-spacing:.18em}h1{font:650 clamp(44px,7vw,86px)/.88 Georgia,serif;letter-spacing:-.05em;margin:15px 0 0}.instructions,.instructions strong{color:#fff}.progress{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;padding:14px 0;background:#000}meter{width:min(430px,65vw);accent-color:#fff}#progress{color:#fff;font:700 12px/1 ui-monospace,monospace}.grid{display:grid;gap:34px}article{background:#000;border:1px solid #fff}article>header{display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:11px 14px;border-bottom:1px solid #fff;color:#fff;font:700 12px/1 ui-monospace,monospace}article>header span,article>header output,article[data-complete=true]>header output{color:#fff}.preview{display:grid;gap:clamp(20px,3vw,42px);min-height:580px;padding:clamp(22px,4vw,54px);background:var(--path);color:var(--foreground)}.preview-main{display:grid;grid-template-columns:minmax(220px,42%) 1fr;gap:clamp(20px,4vw,58px);align-items:center}.artwork{display:block;width:100%;aspect-ratio:1;object-fit:cover;border:0;border-radius:0;outline:0;box-shadow:none}.preview-copy{color:var(--foreground)}.preview-copy small,.preview-copy b,.surface-panel small{display:block;color:var(--accent);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.15em}.preview-copy strong{display:block;color:var(--foreground);font:650 clamp(36px,6vw,78px)/.88 Georgia,serif;letter-spacing:-.05em;margin:14px 0}.preview-copy p{color:var(--foreground);max-width:34ch}.preview-copy b{margin-top:24px}.surface-panel{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;padding:20px 22px;background:var(--surface);color:var(--foreground)}.surface-panel strong{display:block;color:var(--foreground);margin-top:8px}.controls{display:flex;align-items:center;gap:14px;color:var(--foreground)}.controls>i{display:block;width:30px;height:30px;background:var(--accent)}.controls>span{display:block;width:100px;height:6px;background:var(--foreground)}.controls>span>b{display:block;width:62%;height:100%;background:var(--accent)}.controls em{color:var(--foreground);font:700 11px/1 ui-monospace,monospace;font-style:normal}form{display:grid;grid-template-columns:2fr 1fr;gap:18px;padding:20px;border-top:1px solid #fff;background:#000;color:#fff}fieldset{border:1px solid #fff;margin:0;padding:14px}legend{padding:0 7px;color:#fff;font:750 11px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}fieldset>label{display:flex;align-items:flex-start;gap:9px;margin:10px 0;color:#fff}fieldset label span{display:grid;gap:2px}fieldset label small{color:#fff}input{margin-top:3px;accent-color:#fff}.confidence label{display:inline-flex;margin-right:16px}.note{grid-column:1/-1;display:grid;gap:7px}.note span,.note small{color:#fff;font:700 12px/1 ui-monospace,monospace}textarea{width:100%;resize:vertical;background:#000;color:#fff;border:1px solid #fff;padding:10px;font:inherit}textarea::placeholder{color:#fff}.submit-status{align-self:center;color:#fff;font:700 12px/1 ui-monospace,monospace}button{justify-self:end;border:1px solid #fff;background:#fff;color:#000;padding:13px 22px;font:800 12px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}button:disabled{background:#000;color:#fff}@media(max-width:820px){.masthead,.preview-main{grid-template-columns:1fr}.artwork{width:min(100%,560px)}form{grid-template-columns:1fr}.note{grid-column:auto}.submit-status{min-height:16px}}@media(max-width:520px){main{padding:14px}.preview{min-height:0;padding:18px}.surface-panel{grid-template-columns:1fr}.controls{flex-wrap:wrap}article>header{grid-template-columns:auto 1fr}article>header output{grid-column:2}}
</style></head><body><main>
<header class="masthead"><div><div class="eyebrow">DEVELOPMENT LABELS / BATCH ${batch}</div><h1>Is this one background field?</h1></div><div class="instructions"><p>Classify the <strong>selected background-to-surface pair</strong> from the source artwork. A true gradient must be spatially continuous; similar colors on separate objects do not count.</p><p>Use <strong>flat background, isolated surface</strong> when the second color belongs to a subject, object, typography, or bounded detail over a dominant flat field.</p></div></header>
<div class="progress"><meter min="0" max="${queue.length}" value="0"></meter><output id="progress">0 / ${queue.length}</output></div>
<section class="grid">${cards || `<p>No cases in batch ${batch}.</p>`}</section>
</main><script>
	const classifications=new Set(["true-background-gradient","flat-background-isolated-surface","not-gradient-other","gradient-wrong-endpoints","uncertain"]);const confidences=new Set(["high","medium","low"]);
	function setStatus(article,message){article.querySelector("header output").textContent=message;article.querySelector(".submit-status").textContent=message}
	function updateProgress(){const count=document.querySelectorAll('article[data-complete="true"]').length;document.querySelector("meter").value=count;document.querySelector("#progress").textContent=count+" / ${queue.length}"}
	function apply(article,entry){for(const input of article.querySelectorAll('input[type="radio"]'))input.checked=input.value===entry.classification||input.value===entry.confidence;article.querySelector("textarea").value=entry.note;article.dataset.complete="true";setStatus(article,"Saved")}
	async function load(){try{const response=await fetch("/api/feedback",{cache:"no-store"});if(!response.ok)throw new Error(await response.text());const store=await response.json();const byFamily=new Map(store.entries.map(entry=>[entry.familyId,entry]));for(const article of document.querySelectorAll("article[data-family-id]")){const entry=byFamily.get(article.dataset.familyId);if(entry)apply(article,entry)}updateProgress()}catch(error){document.querySelector("#progress").textContent="Could not load labels";console.error(error)}}
	document.addEventListener("change",event=>{const article=event.target.closest("article[data-family-id]");if(!article)return;article.dataset.complete="false";setStatus(article,"Not submitted");updateProgress()});
	document.addEventListener("submit",async event=>{event.preventDefault();const article=event.target.closest("article[data-family-id]");const classification=article.querySelector('input[name^="classification-"]:checked')?.value;const confidence=article.querySelector('input[name^="confidence-"]:checked')?.value;const note=article.querySelector("textarea").value;if(!classifications.has(classification)||!confidences.has(confidence)){setStatus(article,"Choose a classification and confidence");return}const button=article.querySelector("button");button.disabled=true;setStatus(article,"Saving...");try{const response=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyId:article.dataset.familyId,classification,confidence,note})});if(!response.ok)throw new Error(await response.text());article.dataset.complete="true";setStatus(article,"Saved");updateProgress()}catch(error){setStatus(article,"Save failed: "+error.message)}finally{button.disabled=false}});load();
</script></body></html>`

for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
	new vm.Script(match[1], { filename: `gradient-eligibility-review-${index}.js` })
}
await writeFile(resolve(outputArgument), html, { flag: "wx" })
process.stderr.write(`Rendered ${queue.length} gradient-eligibility cases for batch ${batch}\n`)
