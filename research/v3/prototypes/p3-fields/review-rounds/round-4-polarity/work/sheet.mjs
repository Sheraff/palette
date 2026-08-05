import sharp from "sharp"
import { readFileSync, writeFileSync } from "node:fs"
const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => l.split(" "))
const CELL = 220, COLS = 5
const rowsN = Math.ceil(rows.length / COLS)
const tiles = await Promise.all(rows.map(async ([idx, p], i) => ({
  input: await sharp(p).resize(CELL, CELL, { fit: "cover" }).png().toBuffer(),
  left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL,
})))
const labels = rows.map(([idx], i) => ({
  input: Buffer.from(`<svg width="${CELL}" height="28"><rect width="${CELL}" height="28" fill="#000"/><text x="6" y="20" font-family="monospace" font-size="18" fill="#0f0">#${idx}</text></svg>`),
  left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL,
}))
await sharp({ create: { width: COLS * CELL, height: rowsN * CELL, channels: 3, background: "#222" } })
  .composite([...tiles, ...labels]).jpeg({ quality: 88 }).toFile(process.argv[3])
console.log("ok", rows.length)
