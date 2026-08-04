#!/usr/bin/env python3
"""VERIFIER-OWNED. Naive per-pixel least-squares refit of the linear and radial geometries.

No moments, no per-triple table: it walks every pixel, converts it to OKLab itself, accumulates the
normal equations directly and solves them with plain Gaussian elimination. Then it forms G^T G and
its leading eigenpair by hand. This is the independent answer the closed forms in
src/measure/geometry.ts are checked against.
"""
import json
import math
import sys

from naive import decode_png, oklab


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        p = M[col][col]
        for r in range(n):
            if r == col:
                continue
            f = M[r][col] / p
            for c in range(col, n + 1):
                M[r][c] -= f * M[col][c]
    return [M[i][n] / M[i][i] for i in range(n)]


def fit(path):
    w, h, ch, buf = decode_png(path)
    se = min(w, h)
    # normal equations for [1, x, y] and [1, x, y, q] with q = x^2+y^2
    A3 = [[0.0] * 3 for _ in range(3)]
    A4 = [[0.0] * 4 for _ in range(4)]
    b3 = [[0.0] * 3 for _ in range(3)]
    b4 = [[0.0] * 4 for _ in range(3)]
    ssq = [0.0] * 3
    ssum = [0.0] * 3
    lut = {}
    off = 0
    for y in range(h):
        for x in range(w):
            key = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2]
            off += ch
            lab = lut.get(key)
            if lab is None:
                lab = oklab((key >> 16) & 255, (key >> 8) & 255, key & 255)
                lut[key] = lab
            xn, yn = x / se, y / se
            q = xn * xn + yn * yn
            d = (1.0, xn, yn, q)
            for i in range(4):
                for j in range(4):
                    A4[i][j] += d[i] * d[j]
            for i in range(3):
                for j in range(3):
                    A3[i][j] += d[i] * d[j]
            for c in range(3):
                v = lab[c]
                ssum[c] += v
                ssq[c] += v * v
                for i in range(3):
                    b3[c][i] += v * d[i]
                for i in range(4):
                    b4[c][i] += v * d[i]

    n = w * h
    lin = [solve(A3, b3[c]) for c in range(3)]
    rad = [solve(A4, b4[c]) for c in range(3)]

    def r2(beta, cross, c):
        expl = sum(beta[i] * cross[i] for i in range(len(beta)))
        tot = ssq[c] - ssum[c] ** 2 / n
        return 1.0 if tot <= 0 else 1 - (ssq[c] - expl) / tot

    gxx = sum(b[1] * b[1] for b in lin)
    gxy = sum(b[1] * b[2] for b in lin)
    gyy = sum(b[2] * b[2] for b in lin)
    tr, det = gxx + gyy, gxx * gyy - gxy * gxy
    disc = math.sqrt(max(0.0, tr * tr / 4 - det))
    lam1, lam2 = tr / 2 + disc, tr / 2 - disc
    if abs(gxy) > 1e-300:
        vx, vy = lam1 - gyy, gxy
    else:
        vx, vy = (1.0, 0.0) if gxx >= gyy else (0.0, 1.0)
    norm = math.hypot(vx, vy)
    vx, vy = vx / norm, vy / norm
    for b in lin:  # sign convention: axis points where colour increases (L first)
        p = b[1] * vx + b[2] * vy
        if p > 0:
            break
        if p < 0:
            vx, vy = -vx, -vy
            break

    wt = cx = cy = 0.0
    for b in rad:
        k = b[3]
        if abs(k) < 1e-9:
            continue
        ww = k * k
        wt += ww
        cx += ww * (-b[1] / (2 * k))
        cy += ww * (-b[2] / (2 * k))

    return {
        "file": path,
        "width": w,
        "height": h,
        "linearCoefficients": lin,
        "linearRSquared": [r2(lin[c], b3[c], c) for c in range(3)],
        "axis": [vx, vy],
        "axisAngleDegrees": math.degrees(math.atan2(vy, vx)),
        "leadingStrength": lam1,
        "orthogonalStrength": lam2,
        "origin": [A3[0][1] / n, A3[0][2] / n],
        "radialCoefficients": rad,
        "radialRSquared": [r2(rad[c], b4[c], c) for c in range(3)],
        "radialCentre": [cx / wt, cy / wt] if wt > 0 else None,
    }


if __name__ == "__main__":
    print(json.dumps(fit(sys.argv[1]), indent=1))
