"""THE GATE: which coordinate frame does SAM 3.1's point prompt encoder want?

`SAMPromptEncoder._embed_points` (mlx_vlm/models/sam3/sam_components.py:397-404) does

    coords = coords + 0.5
    coords = coords / [image_embedding_size[1], image_embedding_size[0]]   # 72, 72

where upstream SAM's equivalent divides by `input_image_size` (1008 here). Either this
port expects feature-grid coordinates, or it is a latent bug in code with no caller.
Both readings run without erroring, so reading the source cannot settle it.

The discriminating check
------------------------
The prompt encoder's positional encoding is random-Fourier:

    enc(u) = concat(sin(2*pi * (2u - 1) @ B), cos(2*pi * (2u - 1) @ B))

Sparse point tokens carry `enc(point)` and the dense image tokens carry `enc(cell)` from
`get_dense_pe()`, and the decoder's two-way transformer attends between them. The two
therefore MUST share one normalized frame — that is the only thing that makes the
attention spatial at all. So: embed a point that is *meant* to be at feature cell (r, c),
then ask which of the 5184 dense cells its positional encoding is closest to. Under the
correct convention the answer is (r, c). Under a wrong one it is somewhere arbitrary —
note that the encoding is periodic, so an out-of-range coordinate does not clip or
saturate, it aliases onto an unrelated cell. That is precisely why a running program
proves nothing here and why this had to be measured.

This is exact, deterministic, needs no image, no GPU, and loads two tensors.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

import config
import point_prompt as pp

DENSE_PE_HALF_CELL_NOTE = (
    "PositionalEmbedding.__call__ builds the dense grid with arange(H)/H — cell corners — "
    "while upstream SAM uses (arange(H)+0.5)/H — cell centres. So the dense frame is half "
    "a feature cell (7 px of 1008, 0.7%) up-left of where the point frame puts a cell "
    "centre. It is a constant, sub-cell offset shared by every cell, it does not affect "
    "which convention is correct, and it is far below point-prompt precision. Recorded so "
    "the next reader does not mistake the systematic +0/-1 cell bias below for a bug in "
    "our conversion."
)


def _encode(coords_norm: np.ndarray, pe_weight: np.ndarray) -> np.ndarray:
    """Reimplementation of PositionalEmbedding.forward_with_coords, in numpy.

    Used only to cross-check the MLX path agrees; the verdict below is computed by
    calling the real `_embed_points`, not this.
    """
    x = 2.0 * coords_norm - 1.0
    x = x @ pe_weight
    x = 2.0 * np.pi * x
    return np.concatenate([np.sin(x), np.cos(x)], axis=-1)


def main() -> int:
    import mlx.core as mx
    mx.set_default_device(mx.cpu)          # the gate is a CPU job; leave the GPU alone

    from mlx_vlm.utils import load_config
    from mlx_vlm.models.sam3_1 import ModelConfig
    from mlx_vlm.models.sam3.sam_components import SAMPromptEncoder
    import common

    snapshot = common.snapshot_path()
    cfg = ModelConfig.from_dict(load_config(str(snapshot), trust_remote_code=True))
    enc_cfg = cfg.tracker_config.prompt_encoder_config

    encoder = SAMPromptEncoder(enc_cfg)
    grid_h, grid_w = encoder.image_embedding_size
    d = encoder.embed_dim

    # Load ONLY the two tensors the check needs, out of the pinned snapshot.
    prefix = "tracker_model.interactive_sam_prompt_encoder."
    want = {
        prefix + "shared_embedding.positional_embedding": "shared_embedding.positional_embedding",
        prefix + "point_embed.weight": "point_embed.weight",
    }
    found: dict[str, mx.array] = {}
    for f in sorted(snapshot.glob("*.safetensors")):
        blob = mx.load(str(f))
        for src, dst in want.items():
            if src in blob:
                found[dst] = blob[src].astype(mx.float32)
    missing = set(want.values()) - set(found)
    if missing:
        print(f"FAIL: tensors absent from the pinned snapshot: {sorted(missing)}")
        return 2
    encoder.load_weights(list(found.items()), strict=False)
    mx.eval(encoder.parameters())

    pe_w = np.array(found["shared_embedding.positional_embedding"])
    point_embed_fg = np.array(found["point_embed.weight"])[pp.LABEL_FOREGROUND]

    print(f"grid = {grid_h}x{grid_w}   embed_dim = {d}   "
          f"positional_embedding = {tuple(pe_w.shape)}")
    print(f"input_size (processor) = {enc_cfg.image_size}  patch = {enc_cfg.patch_size}  "
          f"=> stride {enc_cfg.image_size / grid_w:.4f}")

    # Dense reference frame, straight from the model.
    dense = np.array(encoder.get_dense_pe()[0])                    # (grid_h*grid_w, D)
    dense_n = dense / np.linalg.norm(dense, axis=-1, keepdims=True)

    # Targets: a spread of cells including centre, corners and off-diagonal.
    targets = [(36, 36), (0, 0), (71, 71), (10, 60), (60, 10), (36, 5), (5, 36), (18, 54)]
    input_size = float(enc_cfg.image_size)
    stride = input_size / grid_w

    # A synthetic 640x640 "cover" so the ORIGINAL-pixel convention is distinguishable
    # from the INPUT-pixel one (they coincide only if the image happens to be 1008 px).
    image_w = image_h = 640
    spec = pp.GridSpec(grid_h=grid_h, grid_w=grid_w, input_size=int(input_size),
                       image_w=image_w, image_h=image_h)

    results: dict[str, dict] = {}
    for space in pp.COORD_SPACES:
        errs, hits = [], 0
        rows = []
        for (r, c) in targets:
            # original-image pixel at the centre of feature cell (r, c)
            x_orig = (c + 0.5) / grid_w * image_w
            y_orig = (r + 0.5) / grid_h * image_h
            coords = pp.to_encoder_coords([[x_orig, y_orig]], spec, space)

            emb = np.array(encoder._embed_points(
                mx.array(coords)[None], mx.array([[pp.LABEL_FOREGROUND]])
            ))[0, 0]
            emb = emb - point_embed_fg                     # strip the label embedding
            emb_n = emb / np.linalg.norm(emb)

            sims = dense_n @ emb_n
            k = int(np.argmax(sims))
            got = (k // grid_w, k % grid_w)
            err = float(np.hypot(got[0] - r, got[1] - c))
            errs.append(err)
            hits += int(err <= 1.5)
            rows.append({"target": [r, c], "argmax": list(got), "cell_error": err,
                         "cos": float(sims[k]),
                         "encoder_coords": [round(float(v), 3) for v in coords[0]]})

        med = float(np.median(errs))
        results[space] = {"cells_within_1.5": hits, "of": len(targets),
                          "median_cell_error": med,
                          "max_cell_error": float(np.max(errs)), "rows": rows}
        print(f"\n[{space:8s}] argmax lands within 1.5 cells on {hits}/{len(targets)}   "
              f"median cell error {med:.2f}   max {np.max(errs):.2f}")
        for row in rows:
            print(f"    target {tuple(row['target'])!s:>10}  ->  argmax "
                  f"{tuple(row['argmax'])!s:>10}   err {row['cell_error']:5.2f} cells   "
                  f"cos {row['cos']:+.4f}   coords {row['encoder_coords']}")

    # Independent numpy cross-check that the MLX encoder does what we think it does.
    probe = pp.to_encoder_coords([[320.0, 320.0]], spec, pp.COORD_FEATURE)
    mlx_emb = np.array(encoder._embed_points(
        mx.array(probe)[None], mx.array([[pp.LABEL_FOREGROUND]])))[0, 0] - point_embed_fg
    np_emb = _encode((probe + 0.5) / np.array([grid_w, grid_h]), pe_w)[0]
    agree = float(np.abs(mlx_emb - np_emb).max())
    print(f"\nnumpy reimplementation vs mlx _embed_points: max abs diff {agree:.2e}")

    winners = [s for s, r in results.items()
               if r["cells_within_1.5"] == len(targets)]
    print("\n" + "=" * 78)
    if len(winners) == 1:
        verdict = winners[0]
        print(f"VERDICT: the prompt encoder wants {verdict.upper()} coordinates.")
        if verdict == pp.COORD_FEATURE:
            print("  => `image_embedding_size` is NOT a typo for `input_image_size`; the")
            print("     caller owes feature-grid coordinates. mlx-vlm's own point path")
            print("     (Sam3VideoPredictor.add_point_prompt) documents no convention at")
            print("     all, so any caller passing image pixels gets an ALIASED point —")
            print("     a confident mask in the wrong place, not an error.")
        else:
            print("  => the divide by image_embedding_size is a bug; feed image pixels.")
    else:
        verdict = None
        print(f"VERDICT: INDETERMINATE — winners {winners}. Do not proceed.")
    print("=" * 78)
    print("\nNote: " + DENSE_PE_HALF_CELL_NOTE)

    out = config.DATA_DIR / "point-gate-coord-convention.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "generated": common.utc_now(),
        "git_head": common.git_head(),
        "model_repo": config.MODEL_REPO,
        "model_revision": config.MODEL_REVISION,
        "grid": [grid_h, grid_w],
        "input_size": int(input_size),
        "stride": stride,
        "synthetic_image_size": [image_w, image_h],
        "device": "cpu",
        "numpy_vs_mlx_max_abs_diff": agree,
        "results": results,
        "verdict": verdict,
        "dense_pe_half_cell_note": DENSE_PE_HALF_CELL_NOTE,
    }, indent=2) + "\n")
    print(f"\nwrote {out}")
    return 0 if verdict else 1


if __name__ == "__main__":
    sys.exit(main())
