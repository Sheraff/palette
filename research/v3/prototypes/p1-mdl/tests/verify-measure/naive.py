#!/usr/bin/env python3
"""VERIFIER-OWNED. Independent re-derivation of the P1 triple table and smoothed mass.

Pure stdlib: a from-scratch PNG decoder (zlib + the five PNG filters) for synthetic fixtures, and a
flat reader for the raw RGB dump of the real cover. Nothing here imports or reads src/measure.

Usage:
  naive.py png  <file.png>
  naive.py raw  <file.raw> <width> <height> <channels>
  naive.py mass <file.png>          # exact smoothed mass, hand formula
"""

import json
import math
import struct
import sys
import zlib
from collections import defaultdict

# --- PNG decode (stdlib only) ----------------------------------------------------------------


def decode_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    idat = b""
    width = height = depth = ctype = None
    plte = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctag = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctag == b"IHDR":
            width, height, depth, ctype, comp, filt, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8, f"only 8-bit supported, got {depth}"
            assert interlace == 0, "interlaced PNG unsupported"
        elif ctag == b"PLTE":
            plte = body
        elif ctag == b"IDAT":
            idat += body
        elif ctag == b"IEND":
            break
    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = width * channels
    out = bytearray(height * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ft = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        if ft == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif ft != 0:
            raise AssertionError(f"bad filter {ft}")
        out[y * stride : (y + 1) * stride] = line
        prev = line
    if ctype == 3:
        rgb = bytearray(width * height * 3)
        for i in range(width * height):
            idx = out[i]
            rgb[i * 3 : i * 3 + 3] = plte[idx * 3 : idx * 3 + 3]
        return width, height, 3, bytes(rgb)
    return width, height, channels, bytes(out)


# --- the table --------------------------------------------------------------------------------


def table(width, height, channels, buf):
    counts = defaultdict(int)
    sx = defaultdict(int)
    sy = defaultdict(int)
    sxx = defaultdict(int)
    sxy = defaultdict(int)
    syy = defaultdict(int)
    off = 0
    for y in range(height):
        for x in range(width):
            key = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2]
            off += channels
            counts[key] += 1
            sx[key] += x
            sy[key] += y
            sxx[key] += x * x
            sxy[key] += x * y
            syy[key] += y * y
    return counts, sx, sy, sxx, sxy, syy


def report(width, height, channels, buf):
    counts, sx, sy, sxx, sxy, syy = table(width, height, channels, buf)
    order = sorted(counts.keys(), key=lambda k: (-counts[k], k))
    top = []
    for k in order[:5]:
        top.append(
            {
                "key": k,
                "rgb": [(k >> 16) & 255, (k >> 8) & 255, k & 255],
                "count": counts[k],
                "sumX": sx[k],
                "sumY": sy[k],
                "sumXX": sxx[k],
                "sumXY": sxy[k],
                "sumYY": syy[k],
            }
        )
    return {
        "width": width,
        "height": height,
        "channels": channels,
        "distinctTriples": len(counts),
        "pixelCount": width * height,
        "countSum": sum(counts.values()),
        "top5": top,
    }


# --- OKLab, region, kernel (re-implemented from the contract's formulas) -----------------------

BAR = {
    "dark-neutral": 0.00932,
    "dark-saturated": 0.01502,
    "light-neutral": 0.01627,
    "light-saturated": 0.02293,
}
L_BOUND = 0.55
C_BOUND = 0.05


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def oklab(r, g, b):
    rl, gl, bl = s2l(r / 255), s2l(g / 255), s2l(b / 255)
    l = (0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl) ** (1 / 3)
    m = (0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl) ** (1 / 3)
    s = (0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl) ** (1 / 3)
    return (
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    )


def region(lab):
    chroma = math.hypot(lab[1], lab[2])
    return ("dark" if lab[0] < L_BOUND else "light") + ("-neutral" if chroma < C_BOUND else "-saturated")


def mass_report(width, height, channels, buf):
    counts, *_ = table(width, height, channels, buf)
    keys = sorted(counts.keys())
    labs = [oklab((k >> 16) & 255, (k >> 8) & 255, k & 255) for k in keys]
    regs = [region(l) for l in labs]
    bws = [BAR[r] for r in regs]
    rows = []
    for i, k in enumerate(keys):
        total = 0.0
        terms = []
        for j, k2 in enumerate(keys):
            d = math.dist(labs[i], labs[j])
            h = max(bws[i], bws[j])
            kap = math.exp(-0.5 * (d / h) ** 2)
            total += counts[k2] * kap
            terms.append({"j": j, "d": d, "h": h, "kappa": kap, "n": counts[k2]})
        rows.append(
            {
                "key": k,
                "rgb": [(k >> 16) & 255, (k >> 8) & 255, k & 255],
                "count": counts[k],
                "lab": labs[i],
                "region": regs[i],
                "bandwidth": bws[i],
                "mass": total,
                "terms": terms,
            }
        )
    return {"pixelCount": width * height, "rows": rows}


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "png":
        w, h, c, buf = decode_png(sys.argv[2])
        print(json.dumps(report(w, h, c, buf)))
    elif mode == "raw":
        w, h, c = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        buf = open(sys.argv[2], "rb").read()
        assert len(buf) == w * h * c, f"raw size {len(buf)} != {w*h*c}"
        print(json.dumps(report(w, h, c, buf)))
    elif mode == "mass":
        w, h, c, buf = decode_png(sys.argv[2])
        print(json.dumps(mass_report(w, h, c, buf)))
