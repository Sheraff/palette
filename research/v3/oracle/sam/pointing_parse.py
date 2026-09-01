"""Parsing points out of a pointing model's raw generation.

Two producers, one consumer. Qwen3-VL emits coordinates as ordinary text that must be
regex-parsed; MolmoPoint emits special tokens decoded against per-image metadata by
`mlx_vlm.models.molmo_point.point_utils.extract_points_from_text`. Both end up here as
normalized (0-1) fractions of the original frame, so everything downstream — the SAM
hand-off, the scoring, the sheets — is written once.

The one thing this module must never do is silently turn a decline into zero points.
A model that says "There are none." has answered the question; a parser that failed has
not. `PointSet.status` keeps them apart, because the entire reason a pointing model is
interesting here is that its silence can mean something (POINTING_SCOUT_NOTES.md §3.1).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# --- statuses ---
POINTS = "points"          # at least one point parsed
DECLINED = "declined"      # the model explicitly said there is nothing to point at
UNPARSED = "unparsed"      # output present, no points and no recognizable decline
EMPTY = "empty"            # the model generated nothing

STATUSES = (POINTS, DECLINED, UNPARSED, EMPTY)

#: Qwen3-VL / Molmo-0924 XML form:
#:   <points x1="115" y1="150" x2="885" y2="104" alt="background">background</points>
#:   <point x="500" y="58" alt="background">background</point>
#: [MEASURED] 2026-08-04: Qwen3-VL-30B-A3B-Instruct-6bit emits exactly this, with
#: coordinates on a 0-1000 scale (observed x=885 on a 640 px image, so not pixels).
_XML_TAG = re.compile(r"<points?\b([^>]*)>", re.I)
_XY_NUMBERED = re.compile(r'\b([xy])(\d+)\s*=\s*"([-\d.]+)"', re.I)
_XY_PLAIN = re.compile(r'\b([xy])\s*=\s*"([-\d.]+)"', re.I)
_ALT = re.compile(r'\balt\s*=\s*"([^"]*)"', re.I)

#: JSON form Qwen also sometimes produces: [{"point_2d": [x, y], "label": "..."}]
_POINT_2D = re.compile(r'"point_2d"\s*:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]')

#: Explicit declines. Kept deliberately tight — a loose pattern here would convert model
#: hedging into a first-class "no ground exists" finding, which is the exact error this
#: whole campaign is trying not to make.
_DECLINE = re.compile(
    r"\b(there (are|is) (none|no [a-z ]{0,24})\b"
    r"|no (background|such|visible|discernible|distinct)[a-z ]{0,24}\b"
    r"|i (can(no|')t|am unable to) (find|see|identify|point)"
    r"|none (discernible|visible|found)"
    r"|nothing to point at)",
    re.I,
)

#: Qwen's coordinate scale. 0-1000 normalized, per the measurement above.
QWEN_SCALE = 1000.0


@dataclass
class ParsedPoint:
    x: float                 # fraction of width, 0-1
    y: float                 # fraction of height, 0-1
    label: str = ""
    group: int = 0           # object_id / grouping, where the producer supplies one
    in_frame: bool = True


@dataclass
class PointSet:
    status: str
    points: list[ParsedPoint] = field(default_factory=list)
    raw: str = ""
    note: str = ""

    @property
    def n(self) -> int:
        return len(self.points)

    @property
    def n_in_frame(self) -> int:
        return sum(1 for p in self.points if p.in_frame)

    def pixels(self, width: int, height: int) -> list[tuple[float, float]]:
        """Points as original-image pixel coordinates, clamped into the frame."""
        return [(min(max(p.x, 0.0), 1.0) * (width - 1),
                 min(max(p.y, 0.0), 1.0) * (height - 1))
                for p in self.points]


def parse_qwen(text: str, scale: float = QWEN_SCALE) -> PointSet:
    """Parse Qwen3-VL's pointing output into normalized fractions."""
    if text is None or not text.strip():
        return PointSet(status=EMPTY, raw=text or "")

    pts: list[ParsedPoint] = []

    for group, m in enumerate(_XML_TAG.finditer(text)):
        attrs = m.group(1)
        label = (_ALT.search(attrs).group(1) if _ALT.search(attrs) else "")
        # numbered pairs first (x1/y1, x2/y2, …), then the unnumbered singular form
        xs: dict[str, str] = {}
        ys: dict[str, str] = {}
        for axis, idx, val in _XY_NUMBERED.findall(attrs):
            (xs if axis.lower() == "x" else ys)[idx] = val
        for idx in sorted(xs.keys() & ys.keys(), key=lambda s: int(s)):
            pts.append(_mk(xs[idx], ys[idx], label, group, scale))
        if not xs:
            plain = dict((a.lower(), v) for a, v in _XY_PLAIN.findall(attrs))
            if "x" in plain and "y" in plain:
                pts.append(_mk(plain["x"], plain["y"], label, group, scale))

    if not pts:
        for group, (sx, sy) in enumerate(_POINT_2D.findall(text)):
            pts.append(_mk(sx, sy, "", group, scale))

    if pts:
        return PointSet(status=POINTS, points=pts, raw=text)
    if _DECLINE.search(text):
        return PointSet(status=DECLINED, raw=text, note="explicit decline")
    return PointSet(status=UNPARSED, raw=text)


def _mk(sx: str, sy: str, label: str, group: int, scale: float) -> ParsedPoint:
    x, y = float(sx) / scale, float(sy) / scale
    return ParsedPoint(x=x, y=y, label=label, group=group,
                       in_frame=(0.0 <= x <= 1.0 and 0.0 <= y <= 1.0))


def parse_molmo(text: str, pointing_metadata, image_w: int, image_h: int) -> PointSet:
    """Parse MolmoPoint's special-token output via mlx-vlm's own decoder.

    `extract_points_from_text` is defined in `mlx_vlm.models.molmo_point.point_utils` and
    called from nowhere else in the package; the metadata reaches us on a side channel the
    processor stashes on itself during `__call__` and OVERWRITES on the next call, so it
    must be read immediately after the matching call (POINTING_SCOUT_NOTES.md §3.2).

    Returns ORIGINAL image pixel coordinates per the upstream contract, which we
    re-normalize so both producers agree on units.
    """
    if text is None or not text.strip():
        return PointSet(status=EMPTY, raw=text or "")

    from mlx_vlm.models.molmo_point.point_utils import extract_points_from_text

    try:
        raw_points = extract_points_from_text(
            text, pointing_metadata, no_more_points_class=True, patch_location="3x3")
    except Exception as exc:  # a decode failure is not a decline
        return PointSet(status=UNPARSED, raw=text, note=f"{type(exc).__name__}: {exc}")

    pts = []
    for entry in raw_points or []:
        object_id, _image_num, x, y = entry[0], entry[1], entry[-2], entry[-1]
        fx, fy = float(x) / image_w, float(y) / image_h
        pts.append(ParsedPoint(x=fx, y=fy, label="", group=int(object_id),
                               in_frame=(0.0 <= fx <= 1.0 and 0.0 <= fy <= 1.0)))

    if pts:
        return PointSet(status=POINTS, points=pts, raw=text)
    # MolmoPoint has a first-class "no more points" class, so an empty decode after a
    # successful parse IS the decline — unlike Qwen, where it would be a parse failure.
    return PointSet(status=DECLINED, raw=text,
                    note="no points decoded (no_more_points class)")
