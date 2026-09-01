import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import vm from "node:vm"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"

type Color = { rgb: readonly [number, number, number]; hex: string }
type Entry = {
	familyId: string
	anchor: { file: string; sha256: string; bytes: number }
	pairSha256: string
	palette: Record<"background" | "foreground" | "surface" | "accent", Color>
	gradientFirst: boolean
}
type Review = { schemaVersion: 1; reviewVersion: string; generatedAt: string; manifestId: string;
	provenance: Record<string, string>; entries: Entry[] }

const [reviewArgument, htmlArgument, renderArgument, ...unexpected] = process.argv.slice(2)
if (!reviewArgument || !htmlArgument || !renderArgument || unexpected.length > 0) {
	throw new Error("Usage: render-gradient-field-topology-music-repeat-review.ts <review.json> <review.html> <render.json>")
}
const reviewPath = resolve(reviewArgument)
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
	if (value.schemaVersion !== 1 || value.reviewVersion !== "gradient-field-topology-3.0.0-music-repeat-review-1" ||
		typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
		typeof value.manifestId !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestId) ||
		!isRecord(value.provenance) || !Array.isArray(value.entries) || value.entries.length !== 25) {
		throw new Error("Review header is invalid")
	}
	exactKeys(value.provenance, ["manifestSha256", "evaluationSha256", "developmentSha256", "modelFileSha256",
		"modelIdentitySha256", "parameterSha256"], "Review provenance")
	const families = new Set<string>()
	const pairs = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue, ["familyId", "anchor", "pairSha256", "palette", "gradientFirst"], `Entry ${index}`)
		if (typeof entryValue.familyId !== "string" || families.has(entryValue.familyId) ||
			typeof entryValue.pairSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.pairSha256) ||
			pairs.has(entryValue.pairSha256) || typeof entryValue.gradientFirst !== "boolean" ||
			!isRecord(entryValue.anchor) || !isRecord(entryValue.palette)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue.anchor, ["file", "sha256", "bytes"], `Entry ${index} anchor`)
		if (typeof entryValue.anchor.file !== "string" ||
			!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(entryValue.anchor.file) ||
			typeof entryValue.anchor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.anchor.sha256) ||
			!Number.isInteger(entryValue.anchor.bytes) || (entryValue.anchor.bytes as number) <= 0) throw new Error(`Entry ${index} anchor is invalid`)
		exactKeys(entryValue.palette, ["background", "foreground", "surface", "accent"], `Entry ${index} palette`)
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			const color = entryValue.palette[role]
			if (!isRecord(color)) throw new Error(`Entry ${index} ${role} is invalid`)
			exactKeys(color, ["rgb", "hex"], `Entry ${index} ${role}`)
			if (!Array.isArray(color.rgb) || color.rgb.length !== 3 || color.rgb.some((channel) =>
				!Number.isInteger(channel) || channel < 0 || channel > 255) ||
				typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(color.hex)) throw new Error(`Entry ${index} ${role} is invalid`)
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
	const background = gradient
		? `linear-gradient(in oklab 112deg,${palette.background.hex} 0 45%,${palette.surface.hex} 95%)`
		: palette.background.hex
	return `<section class="rendering" style="--surface:${palette.surface.hex};--foreground:${palette.foreground.hex};--accent:${palette.accent.hex};--path:${background}"><div class="preview-main"><img class="artwork" loading="lazy" src="/artwork/${encodeURIComponent(entry.familyId)}" alt="Source artwork in ${label}"><div><small>EXACT DIRECTED PAIR</small><strong>Signal / Field</strong><p>Judge only the displayed background-to-surface colors.</p></div></div><div class="surface"><small>SELECTED SURFACE</small><strong>Continuous color</strong></div><h3>${label}</h3></section>`
}

await Promise.all([
	prepareOutputTarget({ path: htmlPath, refuseOverwrite: true }),
	prepareOutputTarget({ path: renderPath, refuseOverwrite: true }),
])
const reviewSource = await readFile(reviewPath)
const review = parseReview(JSON.parse(reviewSource.toString("utf8")) as unknown)
const cards = review.entries.map((entry, index) => {
	const comparisons = entry.gradientFirst
		? `${preview(entry, true, "Option A")}${preview(entry, false, "Option B")}`
		: `${preview(entry, false, "Option A")}${preview(entry, true, "Option B")}`
	return `<article data-family-id="${escapeHtml(entry.familyId)}" data-pair-sha256="${entry.pairSha256}"><header><span>${String(index + 1).padStart(2, "0")}</span><code>${escapeHtml(entry.familyId)}</code><output>Not submitted</output></header><div class="comparisons">${comparisons}</div><form><fieldset><legend>Which treatment should this exact pair use?</legend><label><input type="radio" name="decision-${index}" value="should-be-gradient"> Should be gradient</label><label><input type="radio" name="decision-${index}" value="should-not-be-gradient"> Should not be gradient</label><label><input type="radio" name="decision-${index}" value="either-way"> Either way</label><label><input type="radio" name="decision-${index}" value="no-visible-difference"> No visible difference</label><label><input type="radio" name="decision-${index}" value="selected-colors-not-identifiable"> Selected colors not identifiable</label></fieldset><label class="comment"><span>Comment (optional)</span><textarea maxlength="2000" rows="3"></textarea></label><output class="status"></output><button type="submit">Save judgment</button></form></article>`
}).join("\n")
const reviewSha256 = sha256(reviewSource)
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="review-sha256" content="${reviewSha256}"><title>Music repeat review</title><style>
:root{color-scheme:dark;background:#090a0d;color:#f5f1e8;font:15px/1.45 Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0}main{width:min(1500px,100%);margin:auto;padding:clamp(16px,4vw,52px)}.masthead{display:grid;grid-template-columns:1fr minmax(300px,560px);gap:30px;border-bottom:1px solid #ddd3c2;padding-bottom:25px}.eyebrow,small,h3{font:800 10px ui-monospace,monospace;letter-spacing:.16em}h1{font:650 clamp(42px,7vw,82px)/.9 Georgia,serif;letter-spacing:-.05em;margin:14px 0}.progress{position:sticky;top:0;background:#090a0d;padding:12px 0;z-index:4}.grid{display:grid;gap:34px}article{border:1px solid #ddd3c2}article>header{display:grid;grid-template-columns:auto 1fr auto;gap:12px;padding:10px 13px;border-bottom:1px solid #ddd3c2;font:700 12px ui-monospace,monospace}.comparisons{display:grid;grid-template-columns:1fr 1fr}.rendering{display:grid;gap:24px;padding:clamp(18px,3vw,38px);background:var(--path);color:var(--foreground)}.rendering:first-child{border-right:1px solid #ddd3c2}.preview-main{display:grid;grid-template-columns:minmax(130px,42%) 1fr;gap:24px;align-items:center}.artwork{width:100%;aspect-ratio:1;object-fit:cover}.preview-main strong{display:block;font:650 clamp(25px,4vw,52px)/.92 Georgia,serif;margin:10px 0}.surface{padding:17px;background:var(--surface);color:var(--foreground)}.surface strong{display:block;margin-top:7px}form{display:grid;grid-template-columns:1fr minmax(230px,30%);gap:18px;padding:18px}fieldset{display:flex;flex-wrap:wrap;gap:10px 16px;border:0;padding:0}legend{width:100%;font-weight:750}.comment{display:grid;gap:6px}textarea{background:#111;color:#fff;border:1px solid #777;padding:9px}.status{font:700 12px ui-monospace,monospace}button{justify-self:end;background:#f5f1e8;color:#090a0d;border:0;padding:10px 16px;font-weight:800}@media(max-width:800px){.masthead,.comparisons,form{grid-template-columns:1fr}.rendering:first-child{border-right:0;border-bottom:1px solid #ddd3c2}.preview-main{grid-template-columns:1fr}button{justify-self:start}}
</style></head><body><main><header class="masthead"><div><div class="eyebrow">BLINDED REPEAT REVIEW</div><h1>Gradient or flat?</h1></div><p>Option placement is randomized. Judge only the displayed exact color pair. Prior responses and all model outputs are hidden. Complete every case.</p></header><div class="progress"><meter min="0" max="25" value="0"></meter> <output id="progress">0 / 25</output></div><section class="grid">${cards}</section></main><script>
const choices=new Set(["should-be-gradient","should-not-be-gradient","either-way","no-visible-difference","selected-colors-not-identifiable"]);function status(a,t){a.querySelector("header output").textContent=t;a.querySelector(".status").textContent=t}function progress(){const n=document.querySelectorAll('article[data-complete="true"]').length;document.querySelector("meter").value=n;document.querySelector("#progress").textContent=n+" / 25"}function apply(a,e){for(const i of a.querySelectorAll('input[type="radio"]'))i.checked=i.value===e.decision;a.querySelector("textarea").value=e.comment;a.dataset.complete="true";status(a,"Saved")}async function load(){const r=await fetch("/api/feedback",{cache:"no-store"});if(!r.ok)throw Error(await r.text());const s=await r.json(),m=new Map(s.entries.map(e=>[e.familyId,e]));for(const a of document.querySelectorAll("article")){const e=m.get(a.dataset.familyId);if(e)apply(a,e)}progress()}document.addEventListener("change",e=>{const a=e.target.closest("article");if(a){a.dataset.complete="false";status(a,"Not submitted");progress()}});document.addEventListener("submit",async e=>{e.preventDefault();const a=e.target.closest("article"),decision=a.querySelector('input[type="radio"]:checked')?.value,comment=a.querySelector("textarea").value;if(!choices.has(decision)){status(a,"Choose a judgment");return}const b=a.querySelector("button");b.disabled=true;try{const r=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyId:a.dataset.familyId,pairSha256:a.dataset.pairSha256,decision,comment})});if(!r.ok)throw Error(await r.text());apply(a,await r.json());progress()}catch(error){status(a,"Save failed");console.error(error)}finally{b.disabled=false}});load().catch(error=>{document.querySelector("#progress").textContent="Could not load";console.error(error)});
</script></body></html>`
for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
	new vm.Script(match[1], { filename: `music-repeat-review-${index}.js` })
}
await writeFile(htmlPath, html, { flag: "wx" })
await writeJsonAtomic({ path: renderPath, refuseOverwrite: true }, {
	schemaVersion: 1,
	renderVersion: "gradient-field-topology-3.0.0-music-repeat-render-1",
	generatedAt: new Date().toISOString(),
	planFile: basename(reviewPath),
	planSha256: reviewSha256,
	htmlFile: basename(htmlPath),
	htmlSha256: sha256(html),
})
process.stderr.write("Rendered 25 blinded music repeat-label cases\n")
