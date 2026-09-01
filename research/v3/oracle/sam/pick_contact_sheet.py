"""Throwaway: build a contact sheet so a human (or agent) can eyeball smoke candidates."""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

try:
    import pillow_avif  # noqa: F401
except ImportError:
    pass

REPO = Path("/Users/Flo/GitHub/palette")
OUT = Path(sys.argv[1])
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 7)

eval_set = json.loads((REPO / "research/v3/data/oracle-premise/eval-set.json").read_text())
sharded = [e["image"]["imagePath"] for e in eval_set["entries"] if e["included"]]
music = [str(p.relative_to(REPO)) for p in sorted((REPO / "music-artworks").rglob("*")) if p.is_file()]

picks = random.sample(sharded, 18) + random.sample(music, 18)
cell = 200
cols = 6
rows = (len(picks) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), "white")
draw = ImageDraw.Draw(sheet)
for i, rel in enumerate(picks):
    img = Image.open(REPO / rel).convert("RGB")
    w, h = img.size
    img.thumbnail((cell, cell))
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    sheet.paste(img, (x, y))
    draw.text((x + 2, y + cell + 3), f"{i}: {w}x{h}", fill="black")
sheet.save(OUT)
print(json.dumps(picks, indent=0))
