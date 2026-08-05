import { readFileSync } from "node:fs"
import { apcaRawBetween, colorFromHex } from "../../../../../src/contract/color.ts"
const scan = Object.fromEntries(readFileSync("work/published-220.jsonl","utf8").trim().split("\n").map((l)=>{const r=JSON.parse(l);return [r.imagePath,r]}))
const W="/Users/Flo/GitHub/palette/.worktrees/p3-fields/"
for (const line of readFileSync("items.jsonl","utf8").trim().split("\n")) {
  const d=JSON.parse(line); const s=scan[W+d.imagePath] as any
  const [s0,s1]=d.sides
  const c=(t:string,f:string)=>Math.abs(apcaRawBetween(colorFromHex(t),colorFromHex(f))).toFixed(1)
  console.log([d.itemId,d.pool,d.prevalenceRelativeGap.toFixed(5),
    `far/near=${s.farPrevalence}/${s.nearPrevalence}`,
    `e1L=${s.e1L.toFixed(4)}(${s.e1Hex})`,`e2L=${s.e2L.toFixed(4)}(${s.e2Hex})`,
    `dL=${d.deltaL.toFixed(4)}`,
    `s0 bg=${s0.palette.background}(L${d.backgroundL.toFixed(4)}) sf=${s0.palette.surface}(L${d.surfaceL.toFixed(4)})`,
    `s1 bg=${s1.palette.background}(L${d.surfaceL.toFixed(4)}) sf=${s1.palette.surface}(L${d.backgroundL.toFixed(4)})`,
    `fg=${s0.palette.foreground} ac=${s0.palette.accent}`,
    `grad=${s0.palette.gradient?s0.palette.gradient.stops.length:0} rho=${s.bestSpearmanRho.toFixed(3)}`,
    `fgReg=${s.foregroundRegime}`,
    `apca s0 fg|bg=${c(s0.palette.foreground,s0.palette.background)} fg|sf=${c(s0.palette.foreground,s0.palette.surface)}`,
    `accColl=${s0.palette.accentCollapsed}`,
  ].join("  "))
}
