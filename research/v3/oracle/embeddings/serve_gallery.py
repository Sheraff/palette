"""Serve the repository root so the gallery pages can load corpus images.

Two reasons this wrapper exists rather than just opening the HTML from disk:

1. **6,090 of the 7,550 sharded files have no extension.** `http.server` guesses
   the content type from the filename, so those would be served as
   `application/octet-stream` and every browser would refuse to render them. This
   handler sniffs the magic bytes instead, which is also the honest thing to do
   given the corpus survey found the extension-less files are all JPEG.
2. The pages live under `research/v3/data/embeddings/gallery/` and reference
   images at the repository root, so the server has to be rooted above both.
   `file://` origins block that cross-directory read in some browsers.

Usage:
  .venv/bin/python serve_gallery.py            # then open the printed URL
  .venv/bin/python serve_gallery.py --port 8123 --no-open
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import webbrowser
from pathlib import Path

import config
import holdout_filter

# [REVIEWED] Default port. Nothing special about it; high enough to need no
# privileges and unusual enough to rarely collide.
DEFAULT_PORT = 8777

# [MEASURED] Magic-byte signatures for the three formats present in the two
# collections (spec sections 7 and 7.4). Checked against the corpus 2026-08-02.
MAGIC_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF8", "image/gif"),
    (b"RIFF", "image/webp"),  # refined below by the WEBP tag at offset 8
)

# [REVIEWED] Bytes read to identify a file. 16 covers every signature above plus
# the ISO-BMFF brand box that identifies AVIF at offset 4.
MAGIC_READ_BYTES = 16

# [REVIEWED] Extensions the stock mimetypes database still gets wrong or misses
# on some Python builds. AVIF is over half of music-artworks.
EXTENSION_OVERRIDES = {
    ".avif": "image/avif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
}

GALLERY_REL = "research/v3/data/embeddings/gallery"


def sniff_type(path: Path) -> str | None:
    try:
        with path.open("rb") as handle:
            head = handle.read(MAGIC_READ_BYTES)
    except OSError:
        return None
    if not head:
        return None
    # ISO-BMFF: `....ftypavif` / `ftypavis` / `ftypmif1` (AVIF and its variants).
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"avif", b"avis", b"mif1", b"msf1"):
            return "image/avif"
        if brand in (b"heic", b"heix"):
            return "image/heic"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    for signature, mime in MAGIC_SIGNATURES:
        if head.startswith(signature):
            return mime
    return None


class CorpusHandler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):  # noqa: A003 - name fixed by the base class
        candidate = Path(path)
        suffix = candidate.suffix.lower()
        if suffix in EXTENSION_OVERRIDES:
            return EXTENSION_OVERRIDES[suffix]
        if candidate.is_file():
            sniffed = sniff_type(candidate)
            if sniffed:
                return sniffed
        return super().guess_type(path)

    def log_message(self, fmt, *args):  # keep the console readable
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--page", default="neighbors.html")
    args = parser.parse_args()

    root = config.REPO_ROOT
    handler = functools.partial(CorpusHandler, directory=str(root))

    # Serving is re-exposing. The pages built before 2026-08-03 have no holdout
    # gate, so say what opening them costs BEFORE the browser opens (review
    # 2026-08-03, MAJOR-1). Measured from the page source, not assumed.
    gallery_dir = root / GALLERY_REL
    pages = sorted(gallery_dir.glob("*.html"))
    if pages:
        audit = holdout_filter.audit_pages(pages)
        union = audit["union"]
        if union["held_out_artworks_shown"] or union["quarantined_artworks_shown"]:
            print(
                "!! HOLDOUT WARNING: these pages render "
                f"{union['held_out_artworks_shown']} held-out artworks "
                f"({union['held_out_pct_of_holdout']}% of the holdout) and "
                f"{union['quarantined_artworks_shown']} quarantined "
                "non-candidates. Browsing them spends those artworks — "
                "see research/v3/data/holdout/HOLDOUT.md. Rebuild with "
                "`gallery.py --holdout exclude` for a page that costs nothing."
            )
            for name, row in audit["pages"].items():
                if row["of_which_held_out"] or row["of_which_quarantined"]:
                    print(
                        f"     {name:24s} {row['of_which_held_out']:4d} held out, "
                        f"{row['of_which_quarantined']:3d} quarantined"
                    )

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", args.port), handler) as httpd:
        base = f"http://127.0.0.1:{args.port}/{GALLERY_REL}"
        print(f"serving {root} at http://127.0.0.1:{args.port}/")
        print(f"  neighbours : {base}/neighbors.html")
        for tag in ("dinov2-vitl14", "pe-core-l14", "dinov3-vitl16"):
            print(f"  clusters   : {base}/{tag}.html")
        print("ctrl-c to stop")
        if not args.no_open:
            webbrowser.open(f"{base}/{args.page}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
