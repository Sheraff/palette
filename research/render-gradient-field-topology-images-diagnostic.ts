import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import vm from "node:vm"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"

type Color = { rgb: readonly [number, number, number]; hex: string }
type Entry = {
	familyId: string
	anchor: { file: string; sha256: string; bytes: number; width: number; height: number }
	normalized: { width: number; height: number }
	pairSha256: string
	directedPair: { background: Color; surface: Color }
	palette: Record<"background" | "foreground" | "surface" | "accent", Color>
	canonicalGradient: boolean
	v3: { evaluated: boolean; eligible: boolean; reason: string; score: number | null; threshold: number; margin: number | null }
}
type Diagnostic = { schemaVersion: 1; diagnosticVersion: string; diagnosticId: string; generatedAt: string;
	selectionRule: string; bindings: Record<string, unknown>; runtime: Record<string, unknown>;
	summary: Record<string, unknown>; entries: Entry[] }

const [diagnosticArgument, htmlArgument, renderArgument, ...unexpected] = process.argv.slice(2)
if (!diagnosticArgument || !htmlArgument || !renderArgument || unexpected.length > 0) {
	throw new Error("Usage: render-gradient-field-topology-images-diagnostic.ts <diagnostic.json> <diagnostic.html> <render.json>")
}
const diagnosticPath = resolve(diagnosticArgument), htmlPath = resolve(htmlArgument), renderPath = resolve(renderArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort(), wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} has unexpected keys`)
}

function parseDiagnostic(value: unknown): Diagnostic {
	if (!isRecord(value)) throw new Error("Diagnostic is invalid")
	exactKeys(value, ["schemaVersion", "diagnosticVersion", "generatedAt", "selectionRule", "bindings", "runtime", "summary",
		"entries", "diagnosticId"], "Diagnostic")
	if (value.schemaVersion !== 1 || value.diagnosticVersion !== "gradient-field-topology-3.0.0-images-diagnostic-1" ||
		typeof value.diagnosticId !== "string" || !/^[a-f0-9]{64}$/.test(value.diagnosticId) ||
		!Array.isArray(value.entries) || value.entries.length === 0) throw new Error("Diagnostic header is invalid")
	const families = new Set<string>(), files = new Set<string>(), pairs = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue, ["familyId", "anchor", "normalized", "pairSha256", "directedPair", "palette",
			"canonicalGradient", "v3"], `Entry ${index}`)
		if (typeof entryValue.familyId !== "string" || families.has(entryValue.familyId) ||
			typeof entryValue.pairSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entryValue.pairSha256) ||
			pairs.has(entryValue.pairSha256) || typeof entryValue.canonicalGradient !== "boolean" ||
			!isRecord(entryValue.anchor) || !isRecord(entryValue.normalized) || !isRecord(entryValue.directedPair) ||
			!isRecord(entryValue.palette) || !isRecord(entryValue.v3)) throw new Error(`Entry ${index} is invalid`)
		exactKeys(entryValue.anchor, ["file", "sha256", "bytes", "width", "height"], `Entry ${index} anchor`)
		if (typeof entryValue.anchor.file !== "string" || !/^images\/[^/\\]+$/.test(entryValue.anchor.file) ||
			files.has(entryValue.anchor.file) || typeof entryValue.anchor.sha256 !== "string" ||
			!/^[a-f0-9]{64}$/.test(entryValue.anchor.sha256)) throw new Error(`Entry ${index} anchor is invalid`)
		families.add(entryValue.familyId); files.add(entryValue.anchor.file); pairs.add(entryValue.pairSha256)
	}
	return value as unknown as Diagnostic
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

function treatment(entry: Entry, gradient: boolean): string {
	const p = entry.palette
	const selected = entry.v3.eligible === gradient
	const background = gradient ? `linear-gradient(in oklab 112deg,${p.background.hex} 0 45%,${p.surface.hex} 95%)` : p.background.hex
	return `<section class="treatment ${selected ? "selected" : ""}" style="--path:${background};--surface:${p.surface.hex};--foreground:${p.foreground.hex};--accent:${p.accent.hex}"><div class="selection">${selected ? "V3 SELECTED" : "ALTERNATE"}</div><div><small>${gradient ? "GRADIENT" : "FLAT"}</small><strong>Signal / Field</strong><p>Exact ${p.background.hex} → ${p.surface.hex} pair</p></div><div class="surface"><small>SURFACE</small><b>${p.surface.hex}</b></div></section>`
}

await Promise.all([
	prepareOutputTarget({ path: htmlPath, refuseOverwrite: true }),
	prepareOutputTarget({ path: renderPath, refuseOverwrite: true }),
])
const diagnosticSource = await readFile(diagnosticPath)
const diagnostic = parseDiagnostic(JSON.parse(diagnosticSource.toString("utf8")) as unknown)
const cards = diagnostic.entries.map((entry, index) => {
	const score = entry.v3.evaluated ? entry.v3.score!.toFixed(6) : "not evaluated"
	const margin = entry.v3.evaluated ? `${entry.v3.margin! >= 0 ? "+" : ""}${entry.v3.margin!.toFixed(6)}` : "not evaluated"
	const v3Text = entry.v3.evaluated ? (entry.v3.eligible ? "gradient" : "flat") : "flat (canonical-flat; not evaluated/promoted)"
	const roles = (["background", "foreground", "surface", "accent"] as const).map((role) =>
		`<div class="chip" style="--color:${entry.palette[role].hex}"><i></i><span>${role}</span><code>${entry.palette[role].hex}<br>${entry.palette[role].rgb.join(",")}</code></div>`).join("")
	return `<article data-family-id="${entry.familyId}" data-pair-sha256="${entry.pairSha256}"><header><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(basename(entry.anchor.file))}</h2><output>Not submitted</output></header><div class="source"><img loading="lazy" src="/artwork/${encodeURIComponent(entry.familyId)}" alt="${escapeHtml(basename(entry.anchor.file))}"><div class="facts"><div><small>SOURCE</small><code>${entry.anchor.width}×${entry.anchor.height} · ${entry.anchor.bytes} bytes<br>${entry.anchor.sha256}</code></div><div><small>EXACT DIRECTED PAIR</small><code>${entry.directedPair.background.hex} → ${entry.directedPair.surface.hex}<br>${entry.pairSha256}</code></div><div class="decisions"><p><small>CANONICAL</small><b>${entry.canonicalGradient ? "gradient" : "flat"}</b></p><p><small>V3</small><b>${v3Text}</b></p><p><small>SCORE</small><b>${score}</b></p><p><small>MARGIN</small><b>${margin}</b></p></div><div class="palette">${roles}</div></div></div><div class="treatments">${treatment(entry, true)}${treatment(entry, false)}</div><form><fieldset><legend>What should this exact displayed pair be?</legend><label><input type="radio" name="decision-${index}" value="should-be-gradient"> Should be gradient</label><label><input type="radio" name="decision-${index}" value="should-not-be-gradient"> Should not be gradient</label><label><input type="radio" name="decision-${index}" value="either-way"> Either way</label><label><input type="radio" name="decision-${index}" value="no-visible-difference"> No visible difference</label><label><input type="radio" name="decision-${index}" value="selected-colors-not-identifiable"> Selected colors not identifiable</label></fieldset><label class="comment">Comment (optional)<textarea maxlength="2000" rows="3"></textarea></label><output class="status"></output><button type="submit">Save judgment</button></form></article>`
}).join("\n")
const planSha256 = sha256(diagnosticSource)
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="plan-sha256" content="${planSha256}"><title>Images topology diagnostic</title><style>
:root{color-scheme:dark;background:#10100f;color:#f4eddf;font:14px/1.45 Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0}main{width:min(1500px,100%);margin:auto;padding:clamp(16px,4vw,50px)}.masthead{display:grid;grid-template-columns:1fr minmax(300px,560px);gap:30px;border-bottom:1px solid #d8cdbb;padding-bottom:25px}.eyebrow,small{font:800 10px ui-monospace,monospace;letter-spacing:.15em;color:#ffcb4a}h1{font:650 clamp(42px,7vw,82px)/.9 Georgia,serif;letter-spacing:-.05em;margin:12px 0}.progress{position:sticky;top:0;background:#10100f;padding:12px 0;z-index:5}.grid{display:grid;gap:34px}article{border:1px solid #d8cdbb}article>header{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 13px;border-bottom:1px solid #d8cdbb}h2{font:700 14px ui-monospace,monospace;margin:0}.source{display:grid;grid-template-columns:minmax(220px,35%) 1fr;gap:25px;padding:24px}.source>img{width:100%;aspect-ratio:1;object-fit:contain;background:#050505}.facts{display:grid;gap:17px;min-width:0}.facts code{display:block;overflow-wrap:anywhere;margin-top:5px}.decisions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.decisions p{border:1px solid #665f54;padding:10px;margin:0}.decisions b{display:block;margin-top:5px}.palette{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.chip{display:grid;grid-template-columns:32px 1fr;gap:8px;align-items:center;border:1px solid #665f54;padding:8px}.chip i{width:32px;height:32px;background:var(--color)}.chip span{font-weight:700}.chip code{grid-column:1/-1}.treatments{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d8cdbb;border-bottom:1px solid #d8cdbb}.treatment{position:relative;display:grid;gap:24px;padding:32px;background:var(--path);color:var(--foreground);min-height:260px}.treatment:first-child{border-right:1px solid #d8cdbb}.treatment.selected{outline:5px solid #ffcb4a;outline-offset:-5px}.selection{position:absolute;right:10px;top:10px;background:#10100f;color:#ffcb4a;padding:6px 8px;font:800 10px ui-monospace,monospace}.treatment strong{display:block;font:650 clamp(27px,4vw,52px)/.9 Georgia,serif;margin:10px 0}.surface{padding:16px;background:var(--surface);color:var(--foreground)}.surface b{display:block;margin-top:6px}form{display:grid;grid-template-columns:1fr minmax(230px,28%);gap:18px;padding:18px}fieldset{display:flex;flex-wrap:wrap;gap:10px 15px;border:0;padding:0}legend{width:100%;font-weight:750}.comment{display:grid;gap:6px}textarea{background:#181817;color:#fff;border:1px solid #777;padding:9px}button{justify-self:end;background:#ffcb4a;color:#111;border:0;padding:10px 16px;font-weight:800}@media(max-width:850px){.masthead,.source,form{grid-template-columns:1fr}.decisions,.palette{grid-template-columns:1fr 1fr}.treatments{grid-template-columns:1fr}.treatment:first-child{border-right:0;border-bottom:1px solid #d8cdbb}button{justify-self:start}}@media(max-width:480px){.decisions,.palette{grid-template-columns:1fr}}
</style></head><body><main><header class="masthead"><div><div class="eyebrow">EXPOSED DIAGNOSTIC / ALL BASE IMAGES</div><h1>Topology field notes</h1></div><p>This view intentionally exposes canonical and v3 outcomes. Review the exact selected pair shown for every mechanically included base artwork. V3-selected treatments are outlined.</p></header><div class="progress"><meter min="0" max="${diagnostic.entries.length}" value="0"></meter> <output id="progress">0 / ${diagnostic.entries.length}</output></div><section class="grid">${cards}</section></main><script>
const choices=new Set(["should-be-gradient","should-not-be-gradient","either-way","no-visible-difference","selected-colors-not-identifiable"]),total=${diagnostic.entries.length};function status(a,t){a.querySelector("header output").textContent=t;a.querySelector(".status").textContent=t}function progress(){const n=document.querySelectorAll('article[data-complete="true"]').length;document.querySelector("meter").value=n;document.querySelector("#progress").textContent=n+" / "+total}function apply(a,e){for(const i of a.querySelectorAll('input[type="radio"]'))i.checked=i.value===e.decision;a.querySelector("textarea").value=e.comment;a.dataset.complete="true";status(a,"Saved")}async function load(){const r=await fetch("/api/feedback",{cache:"no-store"});if(!r.ok)throw Error(await r.text());const s=await r.json(),m=new Map(s.entries.map(e=>[e.familyId,e]));for(const a of document.querySelectorAll("article")){const e=m.get(a.dataset.familyId);if(e)apply(a,e)}progress()}document.addEventListener("change",e=>{const a=e.target.closest("article");if(a){a.dataset.complete="false";status(a,"Not submitted");progress()}});document.addEventListener("submit",async e=>{e.preventDefault();const a=e.target.closest("article"),decision=a.querySelector('input[type="radio"]:checked')?.value,comment=a.querySelector("textarea").value;if(!choices.has(decision)){status(a,"Choose a judgment");return}const b=a.querySelector("button");b.disabled=true;try{const r=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyId:a.dataset.familyId,pairSha256:a.dataset.pairSha256,decision,comment})});if(!r.ok)throw Error(await r.text());apply(a,await r.json());progress()}catch(error){status(a,"Save failed");console.error(error)}finally{b.disabled=false}});load().catch(error=>{document.querySelector("#progress").textContent="Could not load";console.error(error)});
</script></body></html>`
for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
	new vm.Script(match[1], { filename: `images-diagnostic-${index}.js` })
}
await writeFile(htmlPath, html, { flag: "wx" })
await writeJsonAtomic({ path: renderPath, refuseOverwrite: true }, {
	schemaVersion: 1,
	renderVersion: "gradient-field-topology-3.0.0-images-diagnostic-render-1",
	generatedAt: new Date().toISOString(),
	planFile: basename(diagnosticPath),
	planSha256,
	htmlFile: basename(htmlPath),
	htmlSha256: sha256(html),
})
process.stderr.write(`Rendered exposed diagnostics for ${diagnostic.entries.length} base images\n`)
