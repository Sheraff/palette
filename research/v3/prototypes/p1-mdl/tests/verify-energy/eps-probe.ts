import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
const dir = await mkdtemp(join(tmpdir(), "eps-"))
async function w(name, wd, ht, paint) {
  const raw = Buffer.alloc(wd*ht*3); let o=0
  for (let y=0;y<ht;y++) for (let x=0;x<wd;x++,o+=3){const c=paint(x,y);raw[o]=c[0];raw[o+1]=c[1];raw[o+2]=c[2]}
  const p = join(dir,name); await sharp(raw,{raw:{width:wd,height:ht,channels:3}}).png({compressionLevel:0}).toFile(p); return p
}
const cfg = (bg,fg,su,ac)=>({background:bg,surface:su??bg,foreground:fg,accent:ac??fg,gradient:false,stops:[],surfaceCollapsed:su===undefined,accentCollapsed:ac===undefined,escape:null})
const S=new Set([13,47])
const cases = [
 ["A(a) flat 64", await w("f.png",64,64,(x,y)=> (x<2&&y<2)?[150,148,140]:(x<2&&y<4&&y>=2)?[225,45,35]:(x<2&&y>=4&&y<6)?[242,242,238]:[64,66,72]), cfg([64,66,72],[242,242,238])],
 ["A(b) band 64", await w("b.png",64,64,(x)=> S.has(x)?[242,242,238]:(x<32?[58,62,92]:[198,152,78])), cfg([58,62,92],[242,242,238],[198,152,78])],
 ["A(d) vivid 96", await w("v.png",96,96,(x,y)=> S.has(x)?[242,242,238]:(x>=12&&x<20&&y>=12&&y<20)?[225,45,35]:(x<48?[64,66,72]:[150,148,140])), cfg([64,66,72],[242,242,238],[150,148,140],[225,45,35])],
 ["A'(d) naming 64", await w("n.png",64,64,(x,y)=> (y<16&&x<38)?[74,79,89]:(y>=40&&y<49&&x>=40&&x<49)?[220,30,40]:[70,75,85]), cfg([70,75,85],[220,30,40])],
]
for (const [label, p, c] of cases) {
  const m = await measureImage(p); const r = energyOfA(m, c)
  console.log(label.padEnd(18), "K=", String(m.triples.colorCount).padStart(3), " eps =", r.nuisance.residualWeight.toExponential(4), " rung", r.nuisance.splitScaleRung, " fieldMass", r.nuisance.fieldMassFraction.toFixed(4))
}
await rm(dir,{recursive:true,force:true})
