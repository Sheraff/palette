"""Contact sheets for point-prompt results: the cover, the points, the mask they produced.

Deliberately plain. A reviewer sheet has to survive being looked at quickly, so: one tile
per (cover, condition), the mask as a flat colour wash, the prompt points as ringed dots
(filled = foreground label, hollow = background label), and the caption carrying the
numbers that would otherwise need a second file open beside it.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image, ImageDraw

MASK_RGB = (255, 64, 160)
MASK_ALPHA = 0.45
TILE = 320
PAD = 10
CAPTION_H = 34


def _font():
    from PIL import ImageFont
    for name in ("Helvetica.ttc", "Arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, 11)
        except Exception:
            continue
    return ImageFont.load_default()


def wash(image: Image.Image, mask: np.ndarray, rgb=MASK_RGB, alpha=MASK_ALPHA) -> Image.Image:
    base = np.asarray(image.convert("RGB"), dtype=np.float32)
    if mask.shape != base.shape[:2]:
        mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8))
                          .resize((base.shape[1], base.shape[0]), Image.NEAREST)) // 255
    sel = mask.astype(bool)[..., None]
    tint = np.array(rgb, dtype=np.float32)
    out = np.where(sel, base * (1 - alpha) + tint * alpha, base)
    return Image.fromarray(out.astype(np.uint8))


def tile(image: Image.Image,
         mask: np.ndarray | None,
         points_xy: Sequence[Sequence[float]] = (),
         labels: Sequence[int] = (),
         caption: str = "",
         size: int = TILE) -> Image.Image:
    """One cover with its mask and points, scaled into a `size` box with a caption strip."""
    src = wash(image, mask) if mask is not None else image.convert("RGB")
    w, h = src.size
    scale = size / max(w, h)
    sw, sh = max(1, int(w * scale)), max(1, int(h * scale))
    src = src.resize((sw, sh), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size + CAPTION_H), (22, 22, 26))
    canvas.paste(src, ((size - sw) // 2, (size - sh) // 2))
    draw = ImageDraw.Draw(canvas)

    ox, oy = (size - sw) // 2, (size - sh) // 2
    labs = list(labels) if len(labels) else [1] * len(points_xy)
    for (px, py), lab in zip(points_xy, labs):
        cx, cy = ox + px * scale, oy + py * scale
        r = 6
        fill = (60, 255, 140) if lab == 1 else None
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill,
                     outline=(10, 10, 10), width=3)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=1)

    font = _font()
    for i, line in enumerate(caption.split("\n")[:2]):
        draw.text((6, size + 3 + i * 14), line, fill=(225, 225, 230), font=font)
    return canvas


def sheet(tiles: Sequence[Image.Image], out_path: Path, cols: int = 5,
          title: str = "") -> Path:
    """Grid the tiles into one PNG."""
    if not tiles:
        raise ValueError("no tiles")
    cols = max(1, min(cols, len(tiles)))
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    head = 28 if title else 0
    canvas = Image.new("RGB", (cols * tw + PAD * (cols + 1),
                               rows * th + PAD * (rows + 1) + head), (14, 14, 17))
    if title:
        ImageDraw.Draw(canvas).text((PAD, 8), title, fill=(245, 245, 250), font=_font())
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        canvas.paste(t, (PAD + c * (tw + PAD), head + PAD + r * (th + PAD)))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)
    return out_path
