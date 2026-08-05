import { readFileSync } from "node:fs"
import { apcaRawBetween, colorFromHex } from "../../../../../src/contract/color.ts"
const load = (f: string) => Object.fromEntries(readFileSync(f,"utf8").trim().split("\n").map((l)=>{const r=JSON.parse(l);return [r.imagePath,r]}))
const pub=load("work/published-220.jsonl"), lit=load("work/forced-light.jsonl"), drk=load("work/forced-dark.jsonl")
const run=Object.fromEntries(readFileSync("../../measurements/run-coverage-220-0.3.0.jsonl","utf8").trim().split("\n").map((l)=>JSON.parse(l)).filter((d)=>d.kind==="devloop-run-row").map((d)=>[d.imagePath,d.index]))
for (const p of Object.keys(lit).sort((a,b)=>run[a]-run[b])) {
  const a=pub[p] as any; const pol = a.backgroundL<a.surfaceL ? "dark":"light"
  const o=(pol==="light"?drk:lit)[p] as any
  const c=(x:any)=>({fgbg:Math.abs(apcaRawBetween(colorFromHex(x.palette.roles.foreground.hex),colorFromHex(x.palette.roles.background.hex))),fgsf:Math.abs(apcaRawBetween(colorFromHex(x.palette.roles.foreground.hex),colorFromHex(x.palette.roles.surface.hex)))})
  const A=c(a),B=c(o)
  console.log(`#${String(run[p]).padStart(3)} pub fg|bg ${A.fgbg.toFixed(1)} fg|sf ${A.fgsf.toFixed(1)}   opp fg|bg ${B.fgbg.toFixed(1)} fg|sf ${B.fgsf.toFixed(1)}`)
}
