"""Decode images with PIL and report a comparable digest, for the TS<->Python decoder check.

Build item 18. The TypeScript half of this project decodes with `sharp`; several Python analyses
(SAM, embeddings, the premise probes) decode the same files with PIL. Every cross-language claim in
this repo silently assumes those two produce the same pixels. Nobody had checked.

This script is the Python half. It is deliberately dumb: decode, force 8-bit RGB, emit the bytes'
sha256 plus enough shape information to compare. `tests/decoder-agreement.test.ts` runs it and does
the comparison, because the interesting part -- the per-channel divergence -- needs both buffers.

    python decode_py.py <image> [<image> ...]

Emits one JSON object on stdout: {"results": [{"path", "width", "height", "sha256", "error"}]}.
Raw bytes go to sidecar files next to a caller-supplied --dump-dir, when asked, so the TS side can
diff them without piping megabytes through stdout.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

# PIL needs AVIF registered explicitly on some builds; on this one `features.check("avif")` is
# already True, but importing the plugin is harmless and makes the dependency visible rather than
# implicit. A corpus that is 4,507/8,595 AVIF cannot have its AVIF support be an accident.
try:  # pragma: no cover - environment dependent
    from PIL import AvifImagePlugin  # noqa: F401
except Exception:  # pragma: no cover
    pass


def decode(path: Path, dump_dir: Path | None) -> dict:
    """Decode one image to 8-bit RGB, exactly as the Python analyses do."""
    try:
        with Image.open(path) as image:
            # `convert("RGB")` is what every Python consumer in this repo calls. It drops alpha by
            # compositing onto nothing (PIL discards the channel rather than compositing onto white),
            # which is the closest analogue to sharp's `.removeAlpha()`.
            rgb = image.convert("RGB")
            raw = rgb.tobytes()
            result = {
                "path": str(path),
                "width": rgb.width,
                "height": rgb.height,
                "channels": 3,
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "error": None,
            }
            if dump_dir is not None:
                target = dump_dir / f"{hashlib.sha256(str(path).encode()).hexdigest()}.rgb"
                target.write_bytes(raw)
                result["dump"] = str(target)
            return result
    except Exception as exc:  # noqa: BLE001 - the TS side wants the message, not a traceback
        return {
            "path": str(path),
            "width": None,
            "height": None,
            "channels": None,
            "bytes": None,
            "sha256": None,
            "error": f"{type(exc).__name__}: {exc}",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--dump-dir", type=Path, default=None)
    args = parser.parse_args()

    dump_dir = args.dump_dir
    if dump_dir is not None:
        dump_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "pillow": Image.__version__,
        "python": sys.version.split()[0],
        "results": [decode(path, dump_dir) for path in args.images],
    }
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
